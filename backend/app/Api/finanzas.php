<?php

declare(strict_types=1);

/**
 * Finanzas y facturación (comercio, mayorista, repartidor, admin).
 *
 * Portado del panel PHP:
 *   - app/Views/finanzas/{index,resumen,factura}.php
 *   - app/Views/facturacion/index.php
 *   - app/Modules/Finanzas/{FinanzasController,FinanzasService}.php
 *   - app/Modules/Facturacion/{FacturacionController,FacturacionService}.php
 *   - app/Modules/Confianza/ConfianzaController::exportar (CSV)
 *
 * Diferencias deliberadas frente al PHP, siempre a favor de los datos reales:
 *   - El panel antiguo agrupaba por `estado = 'completado'`, un estado que esta
 *     base no usa: aquí lo entregado es `recibido`. Los estados cerrados se
 *     toman de ESTADOS_CERRADOS y se documentan en la respuesta.
 *   - El JOIN del mayorista en la vista antigua era `m.usuario_id = p.mayorista_id`
 *     (mezclaba ids de usuario con ids de perfil). Aquí es `m.id = p.mayorista_id`.
 *   - El folio sale de MAX(folio), no de COUNT(*).
 *   - `facturas.estado` no admite 'pendiente' (enum generada|timbrada|cancelada),
 *     así que una solicitud se guarda como 'generada' y se marca `pendiente: true`.
 */

// public/api.php incluye los módulos pero ignora los archivos que empiezan por
// «_», así que las ayudas compartidas se cargan aquí (require_once: idempotente).
require_once __DIR__ . '/_comun.php';

const FIN_ESTADOS_CERRADOS = ['recibido', 'completado', 'entregado'];
const FIN_ESTADOS_EXCLUIDOS = ['borrador', 'cancelado', 'expirado']; // no son dinero gastado
const FIN_MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const FIN_MESES_LARGOS = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/** Estados cerrados como fragmento SQL seguro (lista blanca interna). */
function fin_estados_sql(): string
{
    return "'" . implode("','", FIN_ESTADOS_CERRADOS) . "'";
}

function fin_excluidos_sql(): string
{
    return "'" . implode("','", FIN_ESTADOS_EXCLUIDOS) . "'";
}

/** Fecha Y-m-d válida o el defecto. */
function fin_fecha(string $valor, string $defecto): string
{
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $valor) === 1) {
        $ts = strtotime($valor);

        return $ts === false ? $defecto : date('Y-m-d', $ts);
    }

    return $defecto;
}

/** Rango del mes anterior (o del año anterior si no se da mes). */
function fin_rango_anterior(bool $mensual, int $anio, int $mes): array
{
    if ($mensual) {
        $primero = new DateTimeImmutable(sprintf('%04d-%02d-01', $anio, $mes));
        $desde = $primero->modify('-1 month');
        $hasta = $desde->modify('last day of this month');

        return [$desde->format('Y-m-d'), $hasta->format('Y-m-d')];
    }

    return [sprintf('%04d-01-01', $anio - 1), sprintf('%04d-12-31', $anio - 1)];
}

/** Serie de cubetas (meses o días) a partir de filas con created_at y total. */
function fin_serie(array $filas, int $anio, ?int $mes): array
{
    $cubetas = [];

    if ($mes === null) {
        for ($i = 1; $i <= 12; $i++) {
            $cubetas[$i] = ['etiqueta' => FIN_MESES[$i - 1], 'valor' => 0.0];
        }
        foreach ($filas as $f) {
            $m = (int) date('n', strtotime((string) $f['created_at']));
            if (isset($cubetas[$m])) {
                $cubetas[$m]['valor'] += (float) $f['total'];
            }
        }
    } else {
        $dias = (int) date('t', strtotime(sprintf('%04d-%02d-01', $anio, $mes)));
        for ($i = 1; $i <= $dias; $i++) {
            $cubetas[$i] = ['etiqueta' => (string) $i, 'valor' => 0.0];
        }
        foreach ($filas as $f) {
            $d = (int) date('j', strtotime((string) $f['created_at']));
            if (isset($cubetas[$d])) {
                $cubetas[$d]['valor'] += (float) $f['total'];
            }
        }
    }

    $serie = [];
    $maximo = 0.0;
    foreach ($cubetas as $c) {
        $maximo = max($maximo, $c['valor']);
    }
    foreach ($cubetas as $c) {
        $serie[] = [
            'etiqueta' => $c['etiqueta'],
            'valor'    => round($c['valor'], 2),
            'alto'     => $maximo > 0 ? max(2, (int) round($c['valor'] / $maximo * 100)) : 2,
        ];
    }

    return $serie;
}

/** Comparación porcentual tolerante a cero. */
function fin_delta(float $actual, float $anterior): ?float
{
    if ($anterior <= 0.0) {
        return null;
    }

    return round((($actual - $anterior) / $anterior) * 100, 1);
}

/** UUIDv4 con guiones. */
function fin_uuid(): string
{
    $d = random_bytes(16);
    $d[6] = chr((ord($d[6]) & 0x0f) | 0x40);
    $d[8] = chr((ord($d[8]) & 0x3f) | 0x80);

    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($d), 4));
}

/** Datos fiscales del usuario (o null). */
function fin_datos_fiscales(int $usuarioId): ?array
{
    $stmt = api_pdo()->prepare('SELECT rfc, razon_social, regimen_fiscal, cp, uso_cfdi, correo_receptor FROM datos_fiscales WHERE usuario_id = ? LIMIT 1');
    $stmt->execute([$usuarioId]);
    $fila = $stmt->fetch();

    return $fila === false ? null : $fila;
}

/** Usuarios dueños de las dos puntas de un pedido. */
function fin_puntas_pedido(array $pedido): array
{
    $stmt = api_pdo()->prepare(
        'SELECT (SELECT usuario_id FROM comercios_perfil WHERE id = ? LIMIT 1) AS comercio_usuario,
                (SELECT usuario_id FROM mayoristas_perfil WHERE id = ? LIMIT 1) AS mayorista_usuario,
                (SELECT nombre_negocio FROM comercios_perfil WHERE id = ? LIMIT 1) AS comercio_nombre,
                (SELECT nombre_comercial FROM mayoristas_perfil WHERE id = ? LIMIT 1) AS mayorista_nombre'
    );
    $stmt->execute([(int) $pedido['comercio_id'], (int) $pedido['mayorista_id'], (int) $pedido['comercio_id'], (int) $pedido['mayorista_id']]);

    return $stmt->fetch() ?: ['comercio_usuario' => 0, 'mayorista_usuario' => 0, 'comercio_nombre' => '', 'mayorista_nombre' => ''];
}

// =====================================================================
// GET /finanzas/contabilidad — desglose contable de pagos capturados
// Solo admin_finanzas/admin_total: es el libro mayor de la plataforma.
// =====================================================================
if (api_ctx()['ruta'] === '/finanzas/contabilidad' && api_ctx()['metodo'] === 'GET') {
    $rol = api_rol();

    if (!($rol === 'admin_total' || $rol === 'admin_finanzas')) {
        fallo('Solo el equipo de finanzas ve el libro contable.', 403, 'SIN_PERMISO');
    }

    $pdo = api_pdo();
    $desde = fin_fecha(api_q('desde'), date('Y-m-01'));
    $hasta = fin_fecha(api_q('hasta'), date('Y-m-d'));

    // Resumen por periodo: cifra neta de cada columna.
    $stmt = $pdo->prepare(
        'SELECT COUNT(*) AS pagos,
                COALESCE(SUM(subtotal), 0) AS subtotal,
                COALESCE(SUM(iva), 0) AS iva,
                COALESCE(SUM(envio), 0) AS envio,
                COALESCE(SUM(comision), 0) AS comision,
                COALESCE(SUM(neto_mayorista), 0) AS neto_mayorista,
                COALESCE(SUM(total), 0) AS total
           FROM contabilidad_asientos
          WHERE DATE(created_at) BETWEEN ? AND ?'
    );
    $stmt->execute([$desde, $hasta]);
    $resumen = $stmt->fetch() ?: [];

    // Asientos individuales con el pedido y las partes.
    $stmt = $pdo->prepare(
        'SELECT a.pedido_id, a.subtotal, a.iva, a.envio, a.comision, a.neto_mayorista, a.total, a.created_at,
                pe.uuid, pe.estado,
                c.nombre_negocio AS comercio, m.nombre_comercial AS mayorista
           FROM contabilidad_asientos a
           LEFT JOIN pedidos pe ON pe.id = a.pedido_id
           LEFT JOIN comercios_perfil c ON c.id = pe.comercio_id
           LEFT JOIN mayoristas_perfil m ON m.id = pe.mayorista_id
          WHERE DATE(a.created_at) BETWEEN ? AND ?
          ORDER BY a.created_at DESC
          LIMIT 200'
    );
    $stmt->execute([$desde, $hasta]);

    responder([
        'ok' => true,
        'resumen' => [
            'pagos' => (int) ($resumen['pagos'] ?? 0),
            'subtotal' => (float) ($resumen['subtotal'] ?? 0),
            'iva' => (float) ($resumen['iva'] ?? 0),
            'envio' => (float) ($resumen['envio'] ?? 0),
            'comision' => (float) ($resumen['comision'] ?? 0),
            'neto_mayorista' => (float) ($resumen['neto_mayorista'] ?? 0),
            'total' => (float) ($resumen['total'] ?? 0),
        ],
        'asientos' => $stmt->fetchAll() ?: [],
        'rango' => ['desde' => $desde, 'hasta' => $hasta],
    ]);
}

// =====================================================================
// GET /finanzas
// =====================================================================
if (api_ctx()['ruta'] === '/finanzas' && api_ctx()['metodo'] === 'GET') {
    $pdo = api_pdo();
    $rol = api_rol();
    $uid = api_uid();

    $hoy = date('Y-m-d');
    $anioActual = (int) date('Y');
    $mesActual = (int) date('n');

    $anio = api_qint('anio', $anioActual, 2000, 2100);
    $mesBruto = api_qint('mes', $mesActual, 1, 12);
    $vista = api_q('vista', 'anual') === 'mensual' ? 'mensual' : 'anual';
    $mensual = $vista === 'mensual';
    $mes = $mensual ? $mesBruto : null;

    // ---------------------------------------------------------- comercio
    if ($rol === 'comercio') {
        $cid = api_comercio_id();
        if ($cid <= 0) {
            fallo('Tu cuenta no tiene perfil de comercio.', 403, 'SIN_PERFIL');
        }

        // Periodo pedido y periodo inmediatamente anterior para comparar.
        $desde = $mensual
            ? sprintf('%04d-%02d-01', $anio, (int) $mes)
            : sprintf('%04d-01-01', $anio);
        $hasta = $mensual
            ? date('Y-m-t', strtotime($desde))
            : sprintf('%04d-12-31', $anio);
        [$desdeAnt, $hastaAnt] = fin_rango_anterior($mensual, $anio, (int) ($mes ?? 0));

        $sql = 'SELECT p.uuid, p.estado, p.subtotal, p.iva, p.envio, p.total, p.created_at,
                       m.nombre_comercial AS mayorista
                  FROM pedidos p
                  LEFT JOIN mayoristas_perfil m ON m.id = p.mayorista_id
                 WHERE p.comercio_id = :cid
                   AND p.estado NOT IN (' . fin_excluidos_sql() . ')
                   AND DATE(p.created_at) BETWEEN :desde AND :hasta
              ORDER BY p.created_at DESC';

        $stmt = $pdo->prepare($sql);
        $stmt->execute(['cid' => $cid, 'desde' => $desde, 'hasta' => $hasta]);
        $filas = $stmt->fetchAll() ?: [];

        $stmt = $pdo->prepare(
            'SELECT COUNT(*) AS pedidos, COALESCE(SUM(p.total),0) AS total
               FROM pedidos p
              WHERE p.comercio_id = ? AND p.estado NOT IN (' . fin_excluidos_sql() . ')
                AND DATE(p.created_at) BETWEEN ? AND ?'
        );
        $stmt->execute([$cid, $desdeAnt, $hastaAnt]);
        $anterior = $stmt->fetch() ?: ['pedidos' => 0, 'total' => 0];

        $total = 0.0;
        $iva = 0.0;
        $subtotal = 0.0;
        $envio = 0.0;
        foreach ($filas as $f) {
            $total += (float) $f['total'];
            $iva += (float) $f['iva'];
            $subtotal += (float) $f['subtotal'];
            $envio += (float) $f['envio'];
        }

        $facturas = [];
        $stmt = $pdo->prepare(
            'SELECT f.uuid, f.serie, f.folio, f.total, f.estado, f.fecha_timbrado, f.created_at,
                    f.razon_social_emisor, p.uuid AS pedido_uuid
               FROM facturas f
               JOIN pedidos p ON p.id = f.pedido_id
              WHERE f.receptor_usuario_id = ?
           ORDER BY COALESCE(f.fecha_timbrado, f.created_at) DESC
              LIMIT 50'
        );
        $stmt->execute([$uid]);
        foreach ($stmt->fetchAll() ?: [] as $f) {
            $facturas[] = [
                'uuid'                => (string) $f['uuid'],
                'serie'               => (string) $f['serie'],
                'folio'               => (int) $f['folio'],
                'folio_texto'         => $f['serie'] . '-' . str_pad((string) $f['folio'], 6, '0', STR_PAD_LEFT),
                'total'               => (float) $f['total'],
                'estado'              => (string) $f['estado'],
                'razon_social_emisor' => (string) $f['razon_social_emisor'],
                'fecha'               => api_fecha((string) ($f['fecha_timbrado'] ?? $f['created_at'])),
                'pedido_uuid'         => (string) $f['pedido_uuid'],
            ];
        }

        responder([
            'ok'    => true,
            'rol'   => $rol,
            'vista' => $vista,
            'periodo' => [
                'anio'      => $anio,
                'mes'       => $mes,
                'etiqueta'  => $mensual ? sprintf('%s de %d', FIN_MESES_LARGOS[(int) $mes], $anio) : sprintf('Año %d', $anio),
                'desde'     => $desde,
                'hasta'     => $hasta,
                'anterior'  => ['desde' => $desdeAnt, 'hasta' => $hastaAnt],
            ],
            'resumen' => [
                'pedidos'    => count($filas),
                'total'      => round($total, 2),
                'subtotal'   => round($subtotal, 2),
                'iva'        => round($iva, 2),
                'envio'      => round($envio, 2),
                'promedio'   => count($filas) > 0 ? round($total / count($filas), 2) : 0.0,
            ],
            'comparacion' => [
                'total_anterior' => round((float) $anterior['total'], 2),
                'pedidos_anterior' => (int) $anterior['pedidos'],
                'delta_pct'      => fin_delta($total, (float) $anterior['total']),
            ],
            'serie'      => fin_serie($filas, $anio, $mes),
            'movimientos' => array_map(static fn (array $f): array => [
                'uuid'       => (string) $f['uuid'],
                'fecha'      => api_fecha((string) $f['created_at']),
                'mayorista'  => (string) ($f['mayorista'] ?? 'Mayorista'),
                'estado'     => (string) $f['estado'],
                'subtotal'   => (float) $f['subtotal'],
                'iva'        => (float) $f['iva'],
                'envio'      => (float) $f['envio'],
                'monto'      => (float) $f['total'],
            ], $filas),
            'facturas' => $facturas,
        ]);
    }

    // -------------------------------------------------------- mayorista
    if ($rol === 'mayorista') {
        $mid = api_mayorista_id();
        if ($mid <= 0) {
            fallo('Tu cuenta no tiene perfil de mayorista.', 403, 'SIN_PERFIL');
        }

        $desde = fin_fecha(api_q('desde'), sprintf('%04d-%02d-01', $anioActual, $mesActual));
        $hasta = fin_fecha(api_q('hasta'), $hoy);
        if ($desde > $hasta) {
            fallo('La fecha inicial no puede ser posterior a la final.', 422, 'RANGO_INVALIDO');
        }
        $dias = (int) ((strtotime($hasta) - strtotime($desde)) / 86400) + 1;
        $desdeAnt = date('Y-m-d', strtotime($desde . ' -' . $dias . ' days'));
        $hastaAnt = date('Y-m-d', strtotime($desde . ' -1 day'));

        $sql = 'SELECT p.uuid, p.estado, p.subtotal, p.iva, p.envio, p.total, p.created_at,
                       c.nombre_negocio AS comercio
                  FROM pedidos p
                  JOIN comercios_perfil c ON c.id = p.comercio_id
                 WHERE p.mayorista_id = :mid
                   AND p.estado IN (' . fin_estados_sql() . ')
                   AND DATE(p.created_at) BETWEEN :desde AND :hasta
              ORDER BY p.created_at DESC';
        $stmt = $pdo->prepare($sql);
        $stmt->execute(['mid' => $mid, 'desde' => $desde, 'hasta' => $hasta]);
        $filas = $stmt->fetchAll() ?: [];

        $subtotal = 0.0;
        $iva = 0.0;
        $total = 0.0;
        foreach ($filas as $f) {
            $subtotal += (float) $f['subtotal'];
            $iva += (float) $f['iva'];
            $total += (float) $f['total'];
        }

        $stmt = $pdo->prepare(
            'SELECT COALESCE(SUM(monto),0) FROM comisiones
              WHERE tipo = ? AND pedido_id IN (
                    SELECT id FROM pedidos
                     WHERE mayorista_id = ? AND estado IN (' . fin_estados_sql() . ')
                       AND DATE(created_at) BETWEEN ? AND ?)'
        );
        $stmt->execute(['mayorista', $mid, $desde, $hasta]);
        $comision = (float) $stmt->fetchColumn();

        $stmt = $pdo->prepare(
            'SELECT COUNT(*) AS pedidos, COALESCE(SUM(total),0) AS total FROM pedidos
              WHERE mayorista_id = ? AND estado IN (' . fin_estados_sql() . ')
                AND DATE(created_at) BETWEEN ? AND ?'
        );
        $stmt->execute([$mid, $desdeAnt, $hastaAnt]);
        $anterior = $stmt->fetch() ?: ['pedidos' => 0, 'total' => 0];

        // Serie de los seis meses cerrados hasta el mes de `hasta`.
        $serie = [];
        $inicio = (new DateTimeImmutable($hasta))->modify('first day of this month')->modify('-5 months');
        for ($i = 0; $i < 6; $i++) {
            $m = $inicio->modify("+$i months");
            $stmt = $pdo->prepare(
                'SELECT COALESCE(SUM(total),0) FROM pedidos
                  WHERE mayorista_id = ? AND estado IN (' . fin_estados_sql() . ')
                    AND DATE(created_at) BETWEEN ? AND ?'
            );
            $stmt->execute([$mid, $m->format('Y-m-01'), $m->format('Y-m-t')]);
            $serie[] = ['etiqueta' => FIN_MESES[(int) $m->format('n') - 1], 'valor' => round((float) $stmt->fetchColumn(), 2)];
        }
        $maximo = 0.0;
        foreach ($serie as $p) {
            $maximo = max($maximo, $p['valor']);
        }
        foreach ($serie as $i => $p) {
            $serie[$i]['alto'] = $maximo > 0 ? max(2, (int) round($p['valor'] / $maximo * 100)) : 2;
        }

        responder([
            'ok'    => true,
            'rol'   => $rol,
            'periodo' => [
                'anio' => (int) date('Y', strtotime($hasta)),
                'mes'  => null,
                'etiqueta' => 'Del ' . date('d/m/Y', strtotime($desde)) . ' al ' . date('d/m/Y', strtotime($hasta)),
                'desde' => $desde,
                'hasta' => $hasta,
                'anterior' => ['desde' => $desdeAnt, 'hasta' => $hastaAnt],
            ],
            'resumen' => [
                'pedidos'  => count($filas),
                'subtotal' => round($subtotal, 2),
                'iva'      => round($iva, 2),
                'total'    => round($total, 2),
                'comision' => round($comision, 2),
                'neto'     => round($subtotal + $iva - $comision, 2),
                'envio'    => round(array_sum(array_map(static fn (array $f): float => (float) $f['envio'], $filas)), 2),
                'promedio' => count($filas) > 0 ? round($total / count($filas), 2) : 0.0,
            ],
            'comparacion' => [
                'total_anterior'  => round((float) $anterior['total'], 2),
                'pedidos_anterior' => (int) $anterior['pedidos'],
                'delta_pct'       => fin_delta($total, (float) $anterior['total']),
            ],
            'serie' => $serie,
            'movimientos' => array_map(static fn (array $f): array => [
                'uuid'      => (string) $f['uuid'],
                'fecha'     => api_fecha((string) $f['created_at']),
                'contraparte' => (string) $f['comercio'],
                'estado'    => (string) $f['estado'],
                'subtotal'  => (float) $f['subtotal'],
                'iva'       => (float) $f['iva'],
                'envio'     => (float) $f['envio'],
                'monto'     => (float) $f['total'],
            ], $filas),
            'facturas' => [],
        ]);
    }

    // ------------------------------------------------------- repartidor
    if ($rol === 'repartidor') {
        $rid = api_repartidor_id();
        if ($rid <= 0) {
            fallo('Tu cuenta no tiene perfil de repartidor.', 403, 'SIN_PERFIL');
        }

        $desde = fin_fecha(api_q('desde'), sprintf('%04d-%02d-01', $anioActual, $mesActual));
        $hasta = fin_fecha(api_q('hasta'), $hoy);
        if ($desde > $hasta) {
            fallo('La fecha inicial no puede ser posterior a la final.', 422, 'RANGO_INVALIDO');
        }

        // envios.repartidor_id admite usuarios.id o repartidores_perfil.id.
        $stmt = $pdo->prepare(
            'SELECT p.uuid, p.estado, DATE(p.created_at) AS fecha, e.tarifa, e.distancia_km,
                    c.nombre_negocio AS comercio
               FROM envios e
               JOIN pedidos p ON p.id = e.pedido_id
               JOIN comercios_perfil c ON c.id = p.comercio_id
              WHERE e.repartidor_id IN (?, ?)
                AND p.estado IN (' . fin_estados_sql() . ')
                AND DATE(p.created_at) BETWEEN ? AND ?
           ORDER BY p.created_at DESC'
        );
        $stmt->execute([$uid, $rid, $desde, $hasta]);
        $filas = $stmt->fetchAll() ?: [];

        $total = 0.0;
        foreach ($filas as $f) {
            $total += (float) ($f['tarifa'] ?? 0);
        }

        $stmt = $pdo->prepare(
            'SELECT COUNT(*) AS viajes, COALESCE(SUM(e.tarifa),0) AS total FROM envios e
               JOIN pedidos p ON p.id = e.pedido_id
              WHERE e.repartidor_id IN (?, ?) AND p.estado IN (' . fin_estados_sql() . ')
                AND DATE(p.created_at) BETWEEN ? AND ?'
        );
        $dias = (int) ((strtotime($hasta) - strtotime($desde)) / 86400) + 1;
        $desdeAnt = date('Y-m-d', strtotime($desde . ' -' . $dias . ' days'));
        $hastaAnt = date('Y-m-d', strtotime($desde . ' -1 day'));
        $stmt->execute([$uid, $rid, $desde, $hasta]);
        $viajes = $stmt->fetch() ?: ['viajes' => 0, 'total' => 0];

        $stmt = $pdo->prepare(
            'SELECT COUNT(*) AS viajes, COALESCE(SUM(e.tarifa),0) AS total FROM envios e
               JOIN pedidos p ON p.id = e.pedido_id
              WHERE e.repartidor_id IN (?, ?) AND p.estado IN (' . fin_estados_sql() . ')
                AND DATE(p.created_at) BETWEEN ? AND ?'
        );
        $stmt->execute([$uid, $rid, $desdeAnt, $hastaAnt]);
        $anterior = $stmt->fetch() ?: ['viajes' => 0, 'total' => 0];

        // Serie por día del rango (tope 31 cubetas legibles).
        $serie = [];
        $cursor = new DateTimeImmutable($desde);
        $limite = (new DateTimeImmutable($hasta));
        while ($cursor <= $limite && count($serie) < 31) {
            $dia = $cursor->format('Y-m-d');
            $valor = 0.0;
            foreach ($filas as $f) {
                if ((string) $f['fecha'] === $dia) {
                    $valor += (float) ($f['tarifa'] ?? 0);
                }
            }
            $serie[] = ['etiqueta' => $cursor->format('d'), 'valor' => round($valor, 2)];
            $cursor = $cursor->modify('+1 day');
        }
        $maximo = 0.0;
        foreach ($serie as $p) {
            $maximo = max($maximo, $p['valor']);
        }
        foreach ($serie as $i => $p) {
            $serie[$i]['alto'] = $maximo > 0 ? max(2, (int) round($p['valor'] / $maximo * 100)) : 2;
        }

        responder([
            'ok'    => true,
            'rol'   => $rol,
            'periodo' => [
                'anio' => (int) date('Y', strtotime($hasta)),
                'mes'  => null,
                'etiqueta' => 'Del ' . date('d/m/Y', strtotime($desde)) . ' al ' . date('d/m/Y', strtotime($hasta)),
                'desde' => $desde,
                'hasta' => $hasta,
                'anterior' => ['desde' => $desdeAnt, 'hasta' => $hastaAnt],
            ],
            'resumen' => [
                'viajes'   => (int) $viajes['viajes'],
                'total'    => round($total, 2),
                'promedio' => (int) $viajes['viajes'] > 0 ? round($total / (int) $viajes['viajes'], 2) : 0.0,
                'km'       => round(array_sum(array_map(static fn (array $f): float => (float) ($f['distancia_km'] ?? 0), $filas)), 2),
            ],
            'comparacion' => [
                'total_anterior'   => round((float) $anterior['total'], 2),
                'viajes_anterior'  => (int) $anterior['viajes'],
                'delta_pct'        => fin_delta($total, (float) $anterior['total']),
            ],
            'serie' => $serie,
            'movimientos' => array_map(static fn (array $f): array => [
                'uuid'      => (string) $f['uuid'],
                'fecha'     => (string) $f['fecha'],
                'contraparte' => (string) $f['comercio'],
                'estado'    => (string) $f['estado'],
                'distancia_km' => (float) ($f['distancia_km'] ?? 0),
                'monto'     => (float) ($f['tarifa'] ?? 0),
            ], $filas),
            'facturas' => [],
        ]);
    }

    // ----------------------------------------------------------- admin
    if (str_starts_with($rol, 'admin')) {
        $desde = fin_fecha(api_q('desde'), sprintf('%04d-01-01', $anioActual));
        $hasta = fin_fecha(api_q('hasta'), $hoy);
        if ($desde > $hasta) {
            fallo('La fecha inicial no puede ser posterior a la final.', 422, 'RANGO_INVALIDO');
        }

        $stmt = $pdo->prepare(
            'SELECT COALESCE(SUM(total),0) AS gmv, COUNT(*) AS pedidos, COALESCE(SUM(iva),0) AS iva
               FROM pedidos
              WHERE estado NOT IN (' . fin_excluidos_sql() . ')
                AND DATE(created_at) BETWEEN ? AND ?'
        );
        $stmt->execute([$desde, $hasta]);
        $global = $stmt->fetch() ?: ['gmv' => 0, 'pedidos' => 0, 'iva' => 0];

        $stmt = $pdo->prepare(
            'SELECT COALESCE(SUM(monto),0) FROM comisiones
              WHERE pedido_id IN (SELECT id FROM pedidos WHERE DATE(created_at) BETWEEN ? AND ?)'
        );
        $stmt->execute([$desde, $hasta]);
        $comisiones = (float) $stmt->fetchColumn();

        $stmt = $pdo->prepare('SELECT COUNT(*) FROM facturas WHERE DATE(created_at) BETWEEN ? AND ?');
        $stmt->execute([$desde, $hasta]);
        $facturasN = (int) $stmt->fetchColumn();

        $stmt = $pdo->prepare(
            'SELECT p.uuid, p.estado, p.total, p.created_at, c.nombre_negocio AS comercio,
                    m.nombre_comercial AS mayorista
               FROM pedidos p
               LEFT JOIN comercios_perfil c ON c.id = p.comercio_id
               LEFT JOIN mayoristas_perfil m ON m.id = p.mayorista_id
              WHERE p.estado NOT IN (' . fin_excluidos_sql() . ')
                AND DATE(p.created_at) BETWEEN ? AND ?
           ORDER BY p.created_at DESC
              LIMIT 50'
        );
        $stmt->execute([$desde, $hasta]);
        $filas = $stmt->fetchAll() ?: [];

        $serie = [];
        $inicio = (new DateTimeImmutable($hasta))->modify('first day of this month')->modify('-5 months');
        for ($i = 0; $i < 6; $i++) {
            $m = $inicio->modify("+$i months");
            $stmt = $pdo->prepare(
                'SELECT COALESCE(SUM(total),0) FROM pedidos
                  WHERE estado NOT IN (' . fin_excluidos_sql() . ') AND DATE(created_at) BETWEEN ? AND ?'
            );
            $stmt->execute([$m->format('Y-m-01'), $m->format('Y-m-t')]);
            $serie[] = ['etiqueta' => FIN_MESES[(int) $m->format('n') - 1], 'valor' => round((float) $stmt->fetchColumn(), 2)];
        }
        $maximo = 0.0;
        foreach ($serie as $p) {
            $maximo = max($maximo, $p['valor']);
        }
        foreach ($serie as $i => $p) {
            $serie[$i]['alto'] = $maximo > 0 ? max(2, (int) round($p['valor'] / $maximo * 100)) : 2;
        }

        responder([
            'ok'    => true,
            'rol'   => $rol,
            'periodo' => [
                'anio' => (int) date('Y', strtotime($hasta)),
                'mes'  => null,
                'etiqueta' => 'Del ' . date('d/m/Y', strtotime($desde)) . ' al ' . date('d/m/Y', strtotime($hasta)),
                'desde' => $desde,
                'hasta' => $hasta,
                'anterior' => ['desde' => '', 'hasta' => ''],
            ],
            'resumen' => [
                'pedidos'    => (int) $global['pedidos'],
                'total'      => round((float) $global['gmv'], 2),
                'iva'        => round((float) $global['iva'], 2),
                'comisiones' => round($comisiones, 2),
                'facturas'   => $facturasN,
            ],
            'comparacion' => ['total_anterior' => 0.0, 'pedidos_anterior' => 0, 'delta_pct' => null],
            'serie' => $serie,
            'movimientos' => array_map(static fn (array $f): array => [
                'uuid'       => (string) $f['uuid'],
                'fecha'      => api_fecha((string) $f['created_at']),
                'contraparte' => trim((string) $f['comercio'] . ' → ' . (string) $f['mayorista'], ' →'),
                'estado'     => (string) $f['estado'],
                'monto'      => (float) $f['total'],
            ], $filas),
            'facturas' => [],
        ]);
    }

    fallo('Tu rol no tiene panel de finanzas.', 403, 'SIN_PERMISO');
}

// =====================================================================
// GET /finanzas/export?desde=&hasta=  (CSV)
// =====================================================================
if (api_ctx()['ruta'] === '/finanzas/export' && api_ctx()['metodo'] === 'GET') {
    $pdo = api_pdo();
    $rol = api_rol();
    $uid = api_uid();

    $desde = fin_fecha(api_q('desde'), sprintf('%04d-%02d-01', (int) date('Y'), (int) date('n')));
    $hasta = fin_fecha(api_q('hasta'), date('Y-m-d'));
    if ($desde > $hasta) {
        fallo('La fecha inicial no puede ser posterior a la final.', 422, 'RANGO_INVALIDO');
    }

    if ($rol === 'comercio') {
        $cid = api_comercio_id();
        if ($cid <= 0) {
            fallo('Tu cuenta no tiene perfil de comercio.', 403, 'SIN_PERFIL');
        }
        $stmt = $pdo->prepare(
            'SELECT p.uuid, DATE(p.created_at) AS fecha, COALESCE(m.nombre_comercial, "Mayorista") AS mayorista,
                    p.estado, p.subtotal, p.iva, p.envio, p.total
               FROM pedidos p
               LEFT JOIN mayoristas_perfil m ON m.id = p.mayorista_id
              WHERE p.comercio_id = ? AND p.estado NOT IN (' . fin_excluidos_sql() . ')
                AND DATE(p.created_at) BETWEEN ? AND ?
           ORDER BY p.created_at'
        );
        $stmt->execute([$cid, $desde, $hasta]);
        $cabeceras = ['pedido', 'fecha', 'mayorista', 'estado', 'subtotal', 'iva', 'envio', 'total'];
        $nombre = 'finanzas-comercio';
    } elseif ($rol === 'mayorista') {
        $mid = api_mayorista_id();
        if ($mid <= 0) {
            fallo('Tu cuenta no tiene perfil de mayorista.', 403, 'SIN_PERFIL');
        }
        $stmt = $pdo->prepare(
            'SELECT p.uuid, DATE(p.created_at) AS fecha, COALESCE(c.nombre_negocio, "Comercio") AS comercio,
                    p.estado, p.subtotal, p.iva, p.envio, p.total
               FROM pedidos p
               LEFT JOIN comercios_perfil c ON c.id = p.comercio_id
              WHERE p.mayorista_id = ? AND p.estado IN (' . fin_estados_sql() . ')
                AND DATE(p.created_at) BETWEEN ? AND ?
           ORDER BY p.created_at'
        );
        $stmt->execute([$mid, $desde, $hasta]);
        $cabeceras = ['pedido', 'fecha', 'comercio', 'estado', 'subtotal', 'iva', 'envio', 'total'];
        $nombre = 'finanzas-mayorista';
    } elseif ($rol === 'repartidor') {
        $rid = api_repartidor_id();
        if ($rid <= 0) {
            fallo('Tu cuenta no tiene perfil de repartidor.', 403, 'SIN_PERFIL');
        }
        $stmt = $pdo->prepare(
            'SELECT p.uuid, DATE(p.created_at) AS fecha, p.estado, e.tarifa, e.distancia_km
               FROM envios e JOIN pedidos p ON p.id = e.pedido_id
              WHERE e.repartidor_id IN (?, ?) AND p.estado IN (' . fin_estados_sql() . ')
                AND DATE(p.created_at) BETWEEN ? AND ?
           ORDER BY p.created_at'
        );
        $stmt->execute([$uid, $rid, $desde, $hasta]);
        $cabeceras = ['pedido', 'fecha', 'estado', 'tarifa', 'distancia_km'];
        $nombre = 'finanzas-reparto';
    } elseif (str_starts_with($rol, 'admin')) {
        $stmt = $pdo->prepare(
            'SELECT p.uuid, DATE(p.created_at) AS fecha, COALESCE(c.nombre_negocio, "") AS comercio,
                    COALESCE(m.nombre_comercial, "") AS mayorista, p.estado, p.subtotal, p.iva, p.envio, p.total
               FROM pedidos p
               LEFT JOIN comercios_perfil c ON c.id = p.comercio_id
               LEFT JOIN mayoristas_perfil m ON m.id = p.mayorista_id
              WHERE p.estado NOT IN (' . fin_excluidos_sql() . ')
                AND DATE(p.created_at) BETWEEN ? AND ?
           ORDER BY p.created_at'
        );
        $stmt->execute([$desde, $hasta]);
        $cabeceras = ['pedido', 'fecha', 'comercio', 'mayorista', 'estado', 'subtotal', 'iva', 'envio', 'total'];
        $nombre = 'finanzas-plataforma';
    } else {
        fallo('Tu rol no puede exportar movimientos.', 403, 'SIN_PERMISO');
    }

    $filas = $stmt->fetchAll() ?: [];

    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $nombre . '-' . $desde . '_' . $hasta . '.csv"');
    header('Cache-Control: no-store');

    $salida = fopen('php://output', 'wb');
    if ($salida === false) {
        fallo('No se pudo generar el archivo.', 500, 'EXPORTACION');
    }
    // BOM para que Excel respete los acentos.
    fwrite($salida, "\xEF\xBB\xBF");
    fputcsv($salida, $cabeceras, ',', '"', '');
    foreach ($filas as $fila) {
        fputcsv($salida, array_values($fila), ',', '"', '');
    }
    fclose($salida);
    exit;
}

// =====================================================================
// GET /finanzas/factura/{uuid}
// =====================================================================
if (preg_match('#^/finanzas/factura/([0-9a-fA-F-]{36})$#', (string) api_ctx()['ruta'], $m) === 1
    && api_ctx()['metodo'] === 'GET') {
    $pdo = api_pdo();

    $stmt = $pdo->prepare(
        'SELECT f.*, p.uuid AS pedido_uuid, p.estado AS pedido_estado, p.created_at AS pedido_fecha,
                p.envio AS pedido_envio
           FROM facturas f
           JOIN pedidos p ON p.id = f.pedido_id
          WHERE f.uuid = ? LIMIT 1'
    );
    $stmt->execute([$m[1]]);
    $factura = $stmt->fetch();

    if ($factura === false) {
        fallo('Esa factura no existe.', 404, 'NO_ENCONTRADA');
    }

    $esAdmin = str_starts_with(api_rol(), 'admin');
    $esParte = in_array(api_uid(), [(int) $factura['emisor_usuario_id'], (int) $factura['receptor_usuario_id']], true);
    if (!$esAdmin && !$esParte) {
        fallo('Esa factura no es tuya.', 403, 'SIN_PERMISO');
    }

    $stmt = $pdo->prepare(
        'SELECT nombre_producto, cantidad, precio_unitario, iva_tasa, subtotal
           FROM detalle_pedido WHERE pedido_id = ? ORDER BY id'
    );
    $stmt->execute([(int) $factura['pedido_id']]);
    $conceptos = [];
    foreach ($stmt->fetchAll() ?: [] as $l) {
        $importe = $l['subtotal'] !== null
            ? (float) $l['subtotal']
            : (float) $l['cantidad'] * (float) $l['precio_unitario'];
        $conceptos[] = [
            'descripcion'     => (string) $l['nombre_producto'],
            'cantidad'        => (float) $l['cantidad'],
            'precio_unitario' => (float) $l['precio_unitario'],
            'iva_tasa'        => (float) ($l['iva_tasa'] ?? 0),
            'importe'         => round($importe, 2),
        ];
    }

    // Igual que la hoja del PHP: si el pedido no tiene líneas, un concepto genérico.
    if ($conceptos === []) {
        $base = (float) $factura['subtotal'] - (float) $factura['pedido_envio'];
        if ($base < 0) {
            $base = (float) $factura['subtotal'];
        }
        $conceptos[] = [
            'descripcion'     => 'Suministro de mercancía según el pedido',
            'cantidad'        => 1,
            'precio_unitario' => round($base, 2),
            'iva_tasa'        => 0.0,
            'importe'         => round($base, 2),
        ];
    }

    responder([
        'ok'      => true,
        'factura' => [
            'uuid'                  => (string) $factura['uuid'],
            'serie'                 => (string) $factura['serie'],
            'folio'                 => (int) $factura['folio'],
            'folio_texto'           => $factura['serie'] . '-' . str_pad((string) $factura['folio'], 6, '0', STR_PAD_LEFT),
            'estado'                => (string) $factura['estado'],
            'fecha'                 => api_fecha((string) ($factura['fecha_timbrado'] ?? $factura['created_at'])),
            'uuid_timbrado'         => $factura['uuid_timbrado'] !== null ? (string) $factura['uuid_timbrado'] : null,
            'metodo_pago'           => (string) $factura['metodo_pago'],
            'forma_pago'            => (string) $factura['forma_pago'],
            'lugar_expedicion'      => (string) $factura['lugar_expedicion'],
            'subtotal'              => (float) $factura['subtotal'],
            'iva'                   => (float) $factura['iva'],
            'total'                 => (float) $factura['total'],
            'pedido'                => [
                'uuid'   => (string) $factura['pedido_uuid'],
                'estado' => (string) $factura['pedido_estado'],
                'fecha'  => api_fecha((string) $factura['pedido_fecha']),
            ],
            'emisor' => [
                'rfc'             => (string) $factura['rfc_emisor'],
                'razon_social'    => (string) $factura['razon_social_emisor'],
                'regimen_fiscal'  => (string) $factura['regimen_fiscal_emisor'],
            ],
            'receptor' => [
                'rfc'          => (string) $factura['rfc_receptor'],
                'razon_social' => (string) $factura['razon_social_receptor'],
                'cp'           => (string) $factura['cp_receptor'],
                'uso_cfdi'     => (string) $factura['uso_cfdi_receptor'],
            ],
        ],
        'conceptos' => $conceptos,
    ]);
}

// =====================================================================
// GET /facturacion
// =====================================================================
if (api_ctx()['ruta'] === '/facturacion' && api_ctx()['metodo'] === 'GET') {
    $pdo = api_pdo();
    $uid = api_uid();

    $datos = fin_datos_fiscales($uid);

    $regimenes = [];
    foreach ($pdo->query('SELECT clave, nombre FROM sat_regimenes_fiscales ORDER BY clave')->fetchAll() ?: [] as $r) {
        $regimenes[] = ['clave' => (string) $r['clave'], 'nombre' => (string) $r['nombre']];
    }
    $usos = [];
    foreach ($pdo->query('SELECT clave, nombre FROM sat_usos_cfdi ORDER BY clave')->fetchAll() ?: [] as $r) {
        $usos[] = ['clave' => (string) $r['clave'], 'nombre' => (string) $r['nombre']];
    }

    $stmt = $pdo->prepare(
        'SELECT f.uuid, f.serie, f.folio, f.estado, f.total, f.subtotal, f.iva,
                f.fecha_timbrado, f.created_at, f.uuid_timbrado,
                f.rfc_emisor, f.rfc_receptor, f.razon_social_emisor, f.razon_social_receptor,
                f.emisor_usuario_id, f.receptor_usuario_id,
                p.uuid AS pedido_uuid, p.estado AS pedido_estado
           FROM facturas f
           JOIN pedidos p ON p.id = f.pedido_id
          WHERE f.emisor_usuario_id = ? OR f.receptor_usuario_id = ?
       ORDER BY f.created_at DESC
          LIMIT 100'
    );
    $stmt->execute([$uid, $uid]);
    $facturas = [];
    foreach ($stmt->fetchAll() ?: [] as $f) {
        $facturas[] = [
            'uuid'           => (string) $f['uuid'],
            'serie'          => (string) $f['serie'],
            'folio'          => (int) $f['folio'],
            'folio_texto'    => $f['serie'] . '-' . $f['folio'],
            'estado'         => (string) $f['estado'],
            'total'          => (float) $f['total'],
            'subtotal'       => (float) $f['subtotal'],
            'iva'            => (float) $f['iva'],
            'fecha'          => api_fecha((string) ($f['fecha_timbrado'] ?? $f['created_at'])),
            'uuid_timbrado'  => $f['uuid_timbrado'] !== null ? (string) $f['uuid_timbrado'] : null,
            'rfc_emisor'     => (string) $f['rfc_emisor'],
            'rfc_receptor'   => (string) $f['rfc_receptor'],
            'razon_social_emisor'   => (string) $f['razon_social_emisor'],
            'razon_social_receptor' => (string) $f['razon_social_receptor'],
            'direccion'      => (int) $f['emisor_usuario_id'] === $uid ? 'emitida' : 'recibida',
            'pedido_uuid'    => (string) $f['pedido_uuid'],
            'pedido_estado'  => (string) $f['pedido_estado'],
        ];
    }

    // Pedidos que el comercio puede facturar: cerrados y sin factura.
    $facturables = [];
    if (api_rol() === 'comercio') {
        $stmt = $pdo->prepare(
            'SELECT p.uuid, p.total, p.created_at, COALESCE(m.nombre_comercial, "Mayorista") AS mayorista
               FROM pedidos p
               JOIN comercios_perfil c ON c.id = p.comercio_id
               LEFT JOIN mayoristas_perfil m ON m.id = p.mayorista_id
               LEFT JOIN facturas f ON f.pedido_id = p.id
              WHERE c.usuario_id = ? AND p.estado IN (' . fin_estados_sql() . ') AND f.id IS NULL
           ORDER BY p.created_at DESC
              LIMIT 30'
        );
        $stmt->execute([$uid]);
        foreach ($stmt->fetchAll() ?: [] as $p) {
            $facturables[] = [
                'uuid'      => (string) $p['uuid'],
                'total'     => (float) $p['total'],
                'fecha'     => api_fecha((string) $p['created_at']),
                'mayorista' => (string) $p['mayorista'],
            ];
        }
    }

    // Cola de timbrado del mayorista: solicitudes recibidas pendientes de
    // timbrar (el flujo real usa un PAC; en modo demo se marcan con un clic).
    $colaTimbrado = [];
    if (api_rol() === 'mayorista') {
        $stmt = $pdo->prepare(
            'SELECT f.uuid, f.serie, f.folio, f.total, f.created_at,
                    c.nombre_negocio AS comercio
               FROM facturas f
               JOIN pedidos p ON p.id = f.pedido_id
               JOIN comercios_perfil c ON c.id = p.comercio_id
              WHERE f.emisor_usuario_id = ? AND f.estado = \'generada\' AND f.uuid_timbrado IS NULL
           ORDER BY f.created_at
              LIMIT 50'
        );
        $stmt->execute([$uid]);
        foreach ($stmt->fetchAll() ?: [] as $f) {
            $colaTimbrado[] = [
                'uuid'       => (string) $f['uuid'],
                'folio'      => (string) $f['serie'] . '-' . (string) $f['folio'],
                'comercio'   => (string) $f['comercio'],
                'total'      => (float) $f['total'],
                'fecha'      => api_fecha((string) $f['created_at']),
            ];
        }

        // CSD del mayorista (sin llave privada: solo metadatos del certificado).
        $stmt = $pdo->prepare(
            'SELECT certificado, huella, rfc_emisor, vigencia_hasta FROM facturacion_csd WHERE mayorista_id = ? LIMIT 1'
        );
        $stmt->execute([api_mayorista_id()]);
        $csd = $stmt->fetch() ?: null;
    }

    responder([
        'ok'             => true,
        'rol'            => api_rol(),
        'es_comercio'    => api_rol() === 'comercio',
        'datos_fiscales' => $datos === null ? null : [
            'rfc'             => (string) $datos['rfc'],
            'razon_social'    => (string) $datos['razon_social'],
            'regimen_fiscal'  => (string) $datos['regimen_fiscal'],
            'cp'              => (string) $datos['cp'],
            'uso_cfdi'        => (string) $datos['uso_cfdi'],
            'correo_receptor' => (string) ($datos['correo_receptor'] ?? ''),
        ],
        'regimenes'          => $regimenes,
        'usos'               => $usos,
        'facturas'           => $facturas,
        'facturables'        => $facturables,
        'estados_facturables' => FIN_ESTADOS_CERRADOS,
        'cola_timbrado'      => $colaTimbrado,
        'csd'                => isset($csd) && $csd !== null ? [
            'certificado'   => (string) $csd['certificado'],
            'huella'        => (string) $csd['huella'],
            'rfc_emisor'    => (string) $csd['rfc_emisor'],
            'vigencia_hasta' => $csd['vigencia_hasta'] !== null ? api_fecha((string) $csd['vigencia_hasta']) : null,
        ] : null,
    ]);
}

// =====================================================================
// POST /facturacion/datos
// =====================================================================
if (api_ctx()['ruta'] === '/facturacion/datos' && api_ctx()['metodo'] === 'POST') {
    $cuerpo = api_cuerpo();

    $rfc = strtoupper(trim((string) ($cuerpo['rfc'] ?? '')));
    $razon = trim((string) ($cuerpo['razon_social'] ?? ''));
    $regimen = strtoupper(trim((string) ($cuerpo['regimen_fiscal'] ?? '')));
    $cp = preg_replace('/\D/', '', (string) ($cuerpo['cp'] ?? '')) ?? '';
    $uso = strtoupper(trim((string) ($cuerpo['uso_cfdi'] ?? '')));
    $correo = trim((string) ($cuerpo['correo_receptor'] ?? ''));

    if (preg_match('/^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/', $rfc) !== 1) {
        fallo('El RFC no es válido: revisa el formato (3 o 4 letras, fecha y homoclave).', 422, 'RFC_INVALIDO');
    }
    if ($razon === '') {
        fallo('La razón social es obligatoria.', 422, 'RAZON_SOCIAL_REQUERIDA');
    }
    if (preg_match('/^\d{5}$/', $cp) !== 1) {
        fallo('El código postal debe tener 5 dígitos.', 422, 'CP_INVALIDO');
    }
    if ($correo !== '' && filter_var($correo, FILTER_VALIDATE_EMAIL) === false) {
        fallo('El correo de recepción no es válido.', 422, 'CORREO_INVALIDO');
    }

    // El servicio valida además régimen y uso contra los catálogos del SAT.
    $servicio = new App\Modules\Facturacion\FacturacionService(api_pdo());
    $r = $servicio->guardarDatosFiscales(api_uid(), [
        'rfc'             => $rfc,
        'razon_social'    => $razon,
        'regimen_fiscal'  => $regimen,
        'cp'              => $cp,
        'uso_cfdi'        => $uso,
        'correo_receptor' => $correo === '' ? null : $correo,
    ]);

    if (!$r['ok']) {
        fallo((string) $r['mensaje'], 422, (string) ($r['codigo'] ?? 'DATOS_INVALIDOS'));
    }

    $datos = fin_datos_fiscales(api_uid());

    responder([
        'ok'             => true,
        'mensaje'        => 'Datos fiscales guardados.',
        'datos_fiscales' => $datos === null ? null : [
            'rfc'             => (string) $datos['rfc'],
            'razon_social'    => (string) $datos['razon_social'],
            'regimen_fiscal'  => (string) $datos['regimen_fiscal'],
            'cp'              => (string) $datos['cp'],
            'uso_cfdi'        => (string) $datos['uso_cfdi'],
            'correo_receptor' => (string) ($datos['correo_receptor'] ?? ''),
        ],
    ]);
}

// =====================================================================
// POST /pedidos/{uuid}/factura  → solicitud de factura
// =====================================================================
if (preg_match('#^/pedidos/([0-9a-fA-F-]{36})/factura$#', (string) api_ctx()['ruta'], $m) === 1
    && api_ctx()['metodo'] === 'POST') {
    $pdo = api_pdo();
    $pedido = api_pedido_propio($m[1]);

    if (!in_array((string) $pedido['estado'], FIN_ESTADOS_CERRADOS, true)) {
        fallo('Solo se facturan pedidos entregados o recibidos. Este pedido está en «' . (string) $pedido['estado'] . '».', 422, 'PEDIDO_ABIERTO');
    }

    $stmt = $pdo->prepare('SELECT uuid, serie, folio, estado, total FROM facturas WHERE pedido_id = ? LIMIT 1');
    $stmt->execute([(int) $pedido['id']]);
    $existente = $stmt->fetch();

    if ($existente !== false) {
        $estado = (string) $existente['estado'];
        if ($estado === 'timbrada') {
            fallo('Este pedido ya tiene factura timbrada: ' . $existente['serie'] . '-' . $existente['folio'] . '.', 409, 'PEDIDO_YA_FACTURADO');
        }

        responder([
            'ok'        => true,
            'pendiente' => true,
            'mensaje'   => 'La solicitud de factura ya estaba registrada.',
            'factura'   => [
                'uuid'     => (string) $existente['uuid'],
                'serie'    => (string) $existente['serie'],
                'folio'    => (int) $existente['folio'],
                'estado'   => $estado,
                'total'    => (float) $existente['total'],
            ],
        ]);
    }

    $puntas = fin_puntas_pedido($pedido);
    $emisor = fin_datos_fiscales((int) $puntas['mayorista_usuario']);
    $receptor = fin_datos_fiscales((int) $puntas['comercio_usuario']);

    // Folio correlativo por serie: MAX(folio) + 1.
    $stmt = $pdo->prepare("SELECT COALESCE(MAX(folio), 0) + 1 FROM facturas WHERE serie = 'A'");
    $stmt->execute();
    $folio = (int) $stmt->fetchColumn();

    $envio = (float) $pedido['envio'];
    $subtotalFactura = round((float) $pedido['subtotal'] + $envio, 2);
    $iva = round((float) $pedido['iva'], 2);
    $total = round((float) $pedido['total'], 2);
    $uuid = fin_uuid();

    $pdo->prepare(
        'INSERT INTO facturas
            (uuid, pedido_id, emisor_usuario_id, receptor_usuario_id, serie, folio,
             lugar_expedicion, metodo_pago, forma_pago,
             rfc_emisor, razon_social_emisor, regimen_fiscal_emisor,
             rfc_receptor, razon_social_receptor, uso_cfdi_receptor, cp_receptor,
             subtotal, iva, total, estado)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )->execute([
        $uuid,
        (int) $pedido['id'],
        (int) $puntas['mayorista_usuario'],
        (int) $puntas['comercio_usuario'],
        'A',
        $folio,
        (string) ($emisor['cp'] ?? ''),
        (string) ($pedido['metodo_pago'] ?? 'PUE'),
        (string) ($pedido['forma_pago'] ?? '03'),
        (string) ($emisor['rfc'] ?? ''),
        (string) ($emisor['razon_social'] ?? $puntas['mayorista_nombre'] ?? ''),
        (string) ($emisor['regimen_fiscal'] ?? ''),
        (string) ($receptor['rfc'] ?? ''),
        (string) ($receptor['razon_social'] ?? $puntas['comercio_nombre'] ?? ''),
        (string) ($receptor['uso_cfdi'] ?? ''),
        (string) ($receptor['cp'] ?? ''),
        $subtotalFactura,
        $iva,
        $total,
        'generada',
    ]);

    $faltan = [];
    if ($emisor === null) {
        $faltan[] = 'del emisor (mayorista)';
    }
    if ($receptor === null) {
        $faltan[] = 'del receptor (comercio)';
    }

    responder([
        'ok'        => true,
        'pendiente' => true,
        'mensaje'   => $faltan === []
            ? 'Solicitud de factura registrada. El emisor la timbrará con el PAC.'
            : 'Solicitud de factura registrada. Falta registrar datos fiscales ' . implode(' y ', $faltan) . ' para poder timbrarla.',
        'factura'   => [
            'uuid'   => $uuid,
            'serie'  => 'A',
            'folio'  => $folio,
            'estado' => 'generada',
            'total'  => $total,
        ],
    ]);
}

// =====================================================================
// POST /facturacion/timbrar/{uuid} — modo demo del timbrado (PAC simulado).
// El mayorista "timbra" la factura: se asigna UUID del CFDI y cambia estado.
// Con un PAC real, este punto se sustituye por la llamada del conector.
// =====================================================================
if (preg_match('#^/facturacion/timbrar/([0-9a-fA-F-]{36})$#', (string) api_ctx()['ruta'], $m) === 1
    && api_ctx()['metodo'] === 'POST') {
    if (api_rol() !== 'mayorista') {
        fallo('Solo el mayorista timbra sus facturas.', 403, 'SIN_PERMISO');
    }

    $pdo = api_pdo();
    $stmt = $pdo->prepare(
        'SELECT f.uuid, f.estado FROM facturas f WHERE f.uuid = ? AND f.emisor_usuario_id = ? LIMIT 1'
    );
    $stmt->execute([$m[1], api_uid()]);
    $factura = $stmt->fetch();

    if ($factura === false) {
        fallo('Esa factura no es tuya o no existe.', 404, 'NO_ENCONTRADO');
    }

    if ((string) $factura['estado'] !== 'generada') {
        fallo('La factura ya fue timbrada o cancelada.', 422, 'ESTADO');
    }

    // PAC simulado: UUID determinista por factura (en real: respuesta del PAC).
    $uuidCfdi = strtoupper(hash('md5', 'cfdi-' . $m[1]));

    $pdo->prepare(
        "UPDATE facturas SET estado = 'timbrada', uuid_timbrado = ?, fecha_timbrado = NOW() WHERE uuid = ?"
    )->execute([$uuidCfdi, $m[1]]);

    responder([
        'ok' => true,
        'mensaje' => 'Factura timbrada (PAC demo). Con un PAC real aquí llega el XML y la cadena original.',
        'uuid_cfdi' => $uuidCfdi,
    ]);
}

// =====================================================================
// POST /facturacion/csd — registra metadatos del CSD del mayorista (demo).
// El archivo .cer (público) se guarda; la .key NUNCA se almacena aquí.
// =====================================================================
if (api_ctx()['ruta'] === '/facturacion/csd' && api_ctx()['metodo'] === 'POST') {
    if (api_rol() !== 'mayorista') {
        fallo('Solo el mayorista registra su CSD.', 403, 'SIN_PERMISO');
    }

    $cuerpo = api_cuerpo();
    $certificado = trim((string) ($cuerpo['certificado'] ?? ''));
    $huella = strtoupper(substr(md5($certificado), 0, 40));

    if ($certificado === '') {
        fallo('Escribe el número de certificado del CSD (20 dígitos).', 422, 'DATOS_FALTANTES');
    }

    api_pdo()->prepare(
        'INSERT INTO facturacion_csd (mayorista_id, certificado, huella, rfc_emisor, vigencia_hasta)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE certificado = VALUES(certificado), huella = VALUES(huella),
             rfc_emisor = VALUES(rfc_emisor), vigencia_hasta = VALUES(vigencia_hasta)'
    )->execute([
        api_mayorista_id(),
        $certificado,
        $huella,
        strtoupper(trim((string) ($cuerpo['rfc'] ?? ''))),
        fin_fecha((string) ($cuerpo['vigencia'] ?? ''), ''),
    ]);

    responder(['ok' => true, 'mensaje' => 'CSD registrado. La llave privada jamás se guarda en la plataforma.']);
}
