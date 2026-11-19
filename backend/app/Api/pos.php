<?php

declare(strict_types=1);

/**
 * Punto de venta del comercio en JSON para la SPA: caja, inventario, ventas,
 * corte, clientes y ticket.
 *
 * Es el mismo dominio que el panel PHP (backend/app/Views/pos/*), pero devuelve
 * datos, no HTML. Toda consulta va filtrada por usuario_id: el inventario y las
 * ventas de un comercio no se ven desde otra cuenta.
 *
 * Contrato: {ok:true, ...} o {ok:false, error:{code,message}} en español.
 */

require_once __DIR__ . '/_comun.php';

use App\Modules\Pos\PosRepository;
use App\Modules\Pos\PosService;

$posRuta = (string) (api_ctx()['ruta'] ?? '/');
$posMetodo = strtoupper((string) (api_ctx()['metodo'] ?? 'GET'));

// El módulo solo atiende /pos*. Si la ruta es de otro módulo, devuelve el control.
if (!str_starts_with($posRuta, '/pos')) {
    return;
}

api_exigir('comercio');

$posPdo = api_pdo();
$posUid = api_uid();
$posRepo = new PosRepository($posPdo);

/** Producto de pos_productos listo para la SPA (números, no cadenas). */
function pos_producto_json(array $p): array
{
    $imagen = trim((string) ($p['imagen'] ?? ''));

    return [
        'id'            => (int) $p['id'],
        'nombre'        => (string) $p['nombre'],
        'imagen'        => $imagen !== '' ? $imagen : null,
        'sku'           => (string) ($p['sku'] ?? ''),
        'codigo_barras' => (string) ($p['codigo_barras'] ?? ''),
        'precio_compra' => (float) $p['precio_compra'],
        'precio_venta'  => (float) $p['precio_venta'],
        'iva_tasa'      => (float) $p['iva_tasa'],
        'stock'         => (float) $p['stock'],
        'stock_minimo'  => (float) $p['stock_minimo'],
        'unidad'        => (string) $p['unidad'],
        'activo'        => (int) $p['activo'],
    ];
}

/** Venta con el nombre del cliente resuelto. */
function pos_venta_json(array $v): array
{
    return [
        'id'         => (int) $v['id'],
        'uuid'       => (string) $v['uuid'],
        'turno_id'   => (int) $v['turno_id'],
        'folio'      => (string) $v['folio'],
        'cliente'    => isset($v['cliente']) && $v['cliente'] !== null ? (string) $v['cliente'] : null,
        'cliente_id' => $v['cliente_id'] !== null ? (int) $v['cliente_id'] : null,
        'subtotal'   => (float) $v['subtotal'],
        'iva'        => (float) $v['iva'],
        'total'      => (float) $v['total'],
        'estado'     => (string) $v['estado'],
        'notas'      => $v['notas'] !== null ? (string) $v['notas'] : null,
        'created_at' => (string) $v['created_at'],
        'metodo'     => isset($v['metodo']) ? (string) $v['metodo'] : null,
    ];
}

/** Ajustes del comercio; se crean por defecto la primera vez (igual que el panel). */
function pos_ajustes_json(array $a): array
{
    return [
        'margen_venta' => (float) $a['margen_venta'],
        'reorden_auto' => (int) $a['reorden_auto'],
        'iva_incluido' => (int) $a['iva_incluido'],
    ];
}

/** Totales del turno por método de pago (solo ventas pagadas). */
function pos_resumen_turno(PDO $pdo, int $turnoId): array
{
    $stmt = $pdo->prepare(
        "SELECT p.metodo, COUNT(DISTINCT v.id) AS ventas, SUM(p.monto) AS total
           FROM pos_pagos p
           JOIN pos_ventas v ON v.id = p.venta_id
          WHERE v.turno_id = ? AND v.estado = 'pagada'
          GROUP BY p.metodo
          ORDER BY FIELD(p.metodo, 'efectivo', 'tarjeta', 'transferencia', 'credito')"
    );
    $stmt->execute([$turnoId]);

    $salida = [];
    foreach ($stmt->fetchAll() ?: [] as $r) {
        $salida[] = [
            'metodo' => (string) $r['metodo'],
            'ventas' => (int) $r['ventas'],
            'total'  => (float) $r['total'],
        ];
    }

    return $salida;
}

/** Corte completo de un turno: desglose, esperado vs contado y diferencia. */
function pos_corte(PDO $pdo, array $turno): array
{
    $turnoId = (int) $turno['id'];
    $resumen = pos_resumen_turno($pdo, $turnoId);

    $efectivo = 0.0;
    $totalMetodos = 0.0;
    foreach ($resumen as $r) {
        $totalMetodos += $r['total'];
        if ($r['metodo'] === 'efectivo') {
            $efectivo = $r['total'];
        }
    }

    $stmt = $pdo->prepare(
        "SELECT COALESCE(SUM(total), 0) FROM pos_ventas WHERE turno_id = ? AND estado = 'pagada'"
    );
    $stmt->execute([$turnoId]);
    $totalVendido = (float) $stmt->fetchColumn();

    $stmt = $pdo->prepare(
        'SELECT v.id, v.uuid, v.turno_id, v.folio, v.cliente_id, v.subtotal, v.iva, v.total, v.estado,
                v.notas, v.created_at, c.nombre AS cliente,
                (SELECT p.metodo FROM pos_pagos p WHERE p.venta_id = v.id ORDER BY p.id LIMIT 1) AS metodo
           FROM pos_ventas v
      LEFT JOIN pos_clientes c ON c.id = v.cliente_id
          WHERE v.turno_id = ?
          ORDER BY v.id DESC'
    );
    $stmt->execute([$turnoId]);
    $ventas = [];
    foreach ($stmt->fetchAll() ?: [] as $v) {
        $ventas[] = pos_venta_json($v);
    }

    $stmt = $pdo->prepare('SELECT * FROM pos_movimientos WHERE turno_id = ? ORDER BY id');
    $stmt->execute([$turnoId]);
    $movimientos = [];
    foreach ($stmt->fetchAll() ?: [] as $m) {
        $movimientos[] = [
            'id'         => (int) $m['id'],
            'tipo'       => (string) $m['tipo'],
            'monto'      => (float) $m['monto'],
            'concepto'   => (string) $m['concepto'],
            'referencia' => $m['referencia'] !== null ? (string) $m['referencia'] : null,
            'created_at' => (string) $m['created_at'],
        ];
    }

    $abierto = (string) $turno['estado'] === 'abierto';
    $fondo = (float) $turno['fondo_inicial'];
    $esperado = $turno['efectivo_esperado'] !== null
        ? (float) $turno['efectivo_esperado']
        : round($fondo + $efectivo, 2);
    $contado = $turno['efectivo_contado'] !== null ? (float) $turno['efectivo_contado'] : null;
    $diferencia = $turno['diferencia'] !== null
        ? (float) $turno['diferencia']
        : ($contado !== null ? round($contado - $esperado, 2) : null);

    return [
        'turno'      => [
            'id'              => $turnoId,
            'abierto_at'      => (string) $turno['abierto_at'],
            'cerrado_at'      => $turno['cerrado_at'] !== null ? (string) $turno['cerrado_at'] : null,
            'fondo_inicial'   => $fondo,
            'estado'          => (string) $turno['estado'],
            'notas'           => $turno['notas'] !== null ? (string) $turno['notas'] : null,
            'abierto'         => $abierto,
        ],
        'resumen'     => $resumen,
        'ventas'      => $ventas,
        'movimientos' => $movimientos,
        'total'       => round($totalVendido, 2),
        'total_metodos' => round($totalMetodos, 2),
        'efectivo'    => round($efectivo, 2),
        'esperado'    => round($esperado, 2),
        'contado'     => $contado,
        'diferencia'  => $diferencia,
        'cuadra'      => $diferencia !== null && abs($diferencia) < 0.01,
    ];
}

/** Siguiente folio del día a partir del máximo, nunca del número de ventas. */
function pos_siguiente_folio(PDO $pdo, int $usuarioId): array
{
    $prefijo = 'POS-' . date('ymd') . '-';

    $stmt = $pdo->prepare(
        'SELECT COALESCE(MAX(CAST(SUBSTRING(folio, ?) AS UNSIGNED)), 0)
           FROM pos_ventas
          WHERE usuario_id = ? AND folio LIKE ?'
    );
    $stmt->execute([strlen($prefijo) + 1, $usuarioId, $prefijo . '%']);

    $siguiente = (int) $stmt->fetchColumn() + 1;

    return [$prefijo . str_pad((string) $siguiente, 4, '0', STR_PAD_LEFT), $siguiente];
}

function pos_uuid4(): string
{
    $b = random_bytes(16);
    $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
    $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);

    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
}

/**
 * Importa al inventario las líneas de pedidos ya entregados que aún no están.
 * Es lo mismo que hace el panel al abrir la caja: si el comercio compró 20
 * costales, los tiene en su inventario sin capturarlos a mano.
 */
function pos_sincronizar_inventario(PDO $pdo, int $usuarioId, float $margenPct): int
{
    $stmt = $pdo->prepare(
        "SELECT dp.id AS linea_id, dp.producto_id, dp.nombre_producto, dp.cantidad, dp.precio_unitario, dp.iva_tasa
           FROM detalle_pedido dp
           JOIN pedidos p ON p.id = dp.pedido_id
           JOIN comercios_perfil c ON c.id = p.comercio_id
          WHERE c.usuario_id = ?
            AND p.estado IN ('entregado','completado')
            AND NOT EXISTS (SELECT 1 FROM pos_productos pp WHERE pp.pedido_linea_id = dp.id)"
    );
    $stmt->execute([$usuarioId]);
    $faltantes = $stmt->fetchAll() ?: [];

    if ($faltantes === []) {
        return 0;
    }

    $margen = $margenPct / 100;
    $insertar = $pdo->prepare(
        'INSERT IGNORE INTO pos_productos
            (usuario_id, producto_id, pedido_linea_id, nombre, precio_compra, precio_venta, iva_tasa,
             stock, stock_minimo, unidad, activo)
         VALUES (?,?,?,?,?,?,?,?,?,?,1)'
    );

    foreach ($faltantes as $f) {
        $compra = round((float) $f['precio_unitario'], 2);
        $venta = round($compra * (1 + $margen), 2);
        $cantidad = (float) $f['cantidad'];

        $insertar->execute([
            $usuarioId, (int) $f['producto_id'], (int) $f['linea_id'], (string) $f['nombre_producto'],
            $compra, $venta, (float) $f['iva_tasa'], $cantidad,
            max(1, (int) ceil($cantidad * 0.2)), 'pieza',
        ]);
    }

    return count($faltantes);
}

// --------------------------------------------------------------- GET /pos
if ($posRuta === '/pos' && $posMetodo === 'GET') {
    $ajustes = $posRepo->ajustes($posUid);
    $importados = pos_sincronizar_inventario($posPdo, $posUid, (float) $ajustes['margen_venta']);
    $turno = $posRepo->turnoAbierto($posUid);

    $productos = [];
    foreach ($posRepo->productos($posUid) as $p) {
        $productos[] = pos_producto_json($p);
    }

    $clientes = [];
    foreach ($posRepo->clientes($posUid) as $c) {
        $clientes[] = [
            'id'       => (int) $c['id'],
            'nombre'   => (string) $c['nombre'],
            'telefono' => (string) ($c['telefono'] ?? ''),
            'email'    => (string) ($c['email'] ?? ''),
            'rfc'      => (string) ($c['rfc'] ?? ''),
        ];
    }

    $ultimo = $posRepo->ultimoTurno($posUid);

    // Efectivo que debería haber en el cajón ahora mismo (fondo + cobros en efectivo).
    $efectivoCaja = 0.0;
    if ($turno !== null) {
        foreach (pos_resumen_turno($posPdo, (int) $turno['id']) as $r) {
            if ($r['metodo'] === 'efectivo') {
                $efectivoCaja = $r['total'];
            }
        }
    }

    responder([
        'ok'          => true,
        'turno'       => $turno === null ? null : [
            'id'               => (int) $turno['id'],
            'abierto_at'       => (string) $turno['abierto_at'],
            'fondo_inicial'    => (float) $turno['fondo_inicial'],
            'estado'           => (string) $turno['estado'],
            'efectivo_ventas'  => round($efectivoCaja, 2),
            'efectivo_esperado' => round((float) $turno['fondo_inicial'] + $efectivoCaja, 2),
        ],
        'ultimo_turno' => $ultimo === null ? null : [
            'id'         => (int) $ultimo['id'],
            'estado'     => (string) $ultimo['estado'],
            'cerrado_at' => $ultimo['cerrado_at'] !== null ? (string) $ultimo['cerrado_at'] : null,
        ],
        'ajustes'     => pos_ajustes_json($ajustes),
        'productos'   => $productos,
        'clientes'    => $clientes,
        'vendido'     => $turno === null ? 0.0 : round($posRepo->totalVendido((int) $turno['id']), 2),
        'importados'  => $importados,
    ]);
}

// --------------------------------------------------- POST /pos/turno/abrir
if ($posRuta === '/pos/turno/abrir' && $posMetodo === 'POST') {
    $cuerpo = api_cuerpo();
    $fondo = max(0.0, round((float) ($cuerpo['fondo'] ?? $cuerpo['fondo_inicial'] ?? 0), 2));

    if ($posRepo->turnoAbierto($posUid) !== null) {
        fallo('La caja ya está abierta. Cierra el turno antes de abrir otro.', 409, 'YA_ABIERTA');
    }

    $id = $posRepo->abrirTurno($posUid, $fondo);

    responder([
        'ok'      => true,
        'mensaje' => 'Caja abierta.',
        'turno'   => ['id' => $id, 'fondo_inicial' => $fondo, 'estado' => 'abierto'],
    ], 201);
}

// -------------------------------------------------- POST /pos/turno/cerrar
if ($posRuta === '/pos/turno/cerrar' && $posMetodo === 'POST') {
    $turno = $posRepo->turnoAbierto($posUid);

    if ($turno === null) {
        fallo('No hay un turno abierto que cerrar.', 409, 'SIN_TURNO');
    }

    $cuerpo = api_cuerpo();
    $contado = max(0.0, round((float) ($cuerpo['contado'] ?? $cuerpo['efectivo_contado'] ?? 0), 2));
    $notas = mb_substr(trim((string) ($cuerpo['notas'] ?? '')), 0, 255);

    $efectivo = 0.0;
    foreach (pos_resumen_turno($posPdo, (int) $turno['id']) as $r) {
        if ($r['metodo'] === 'efectivo') {
            $efectivo = $r['total'];
        }
    }

    $esperado = round((float) $turno['fondo_inicial'] + $efectivo, 2);
    $posRepo->cerrarTurno((int) $turno['id'], $esperado, $contado, $notas);

    $cerrado = $posRepo->turno((int) $turno['id']);
    $corte = pos_corte($posPdo, is_array($cerrado) ? $cerrado : $turno);

    responder([
        'ok'      => true,
        'mensaje' => 'Turno cerrado.',
        'corte'   => $corte,
    ]);
}

// --------------------------------------------------------- POST /pos/vender
if ($posRuta === '/pos/vender' && $posMetodo === 'POST') {
    $cuerpo = api_cuerpo();
    $turno = $posRepo->turnoAbierto($posUid);

    if ($turno === null) {
        fallo('Abre la caja antes de cobrar.', 409, 'SIN_TURNO');
    }

    $lineasEntrada = $cuerpo['lineas'] ?? null;
    if (!is_array($lineasEntrada) || $lineasEntrada === []) {
        fallo('El ticket está vacío.', 422, 'TICKET_VACIO');
    }

    $metodo = (string) ($cuerpo['metodo_pago'] ?? $cuerpo['metodo'] ?? 'efectivo');
    if (!in_array($metodo, ['efectivo', 'tarjeta', 'transferencia', 'credito'], true)) {
        fallo('Método de pago no válido.', 422, 'METODO_INVALIDO');
    }

    $clienteId = null;
    if (isset($cuerpo['cliente_id']) && (int) $cuerpo['cliente_id'] > 0) {
        $clienteId = (int) $cuerpo['cliente_id'];
        $dueno = $posPdo->prepare('SELECT 1 FROM pos_clientes WHERE id = ? AND usuario_id = ? LIMIT 1');
        $dueno->execute([$clienteId, $posUid]);
        if (!$dueno->fetchColumn()) {
            fallo('Ese cliente no es de tu caja.', 422, 'CLIENTE_INVALIDO');
        }
    }

    $recibido = round((float) ($cuerpo['recibido'] ?? 0), 2);
    $ajustes = $posRepo->ajustes($posUid);
    $ivaIncluido = (int) $ajustes['iva_incluido'] === 1;
    $notas = mb_substr(trim((string) ($cuerpo['notas'] ?? '')), 0, 255);

    $posPdo->beginTransaction();

    try {
        $lineas = [];
        $subtotal = 0.0;
        $iva = 0.0;
        $total = 0.0;

        foreach ($lineasEntrada as $entrada) {
            if (!is_array($entrada)) {
                throw new RuntimeException('Hay una línea del ticket con formato inválido.');
            }

            $productoId = (int) ($entrada['producto_id'] ?? $entrada['id'] ?? 0);
            $cantidad = round((float) ($entrada['cantidad'] ?? 0), 3);

            if ($productoId <= 0 || $cantidad <= 0) {
                throw new RuntimeException('Cantidad inválida en el ticket.');
            }

            $stmt = $posPdo->prepare(
                'SELECT * FROM pos_productos WHERE id = ? AND usuario_id = ? AND activo = 1 FOR UPDATE'
            );
            $stmt->execute([$productoId, $posUid]);
            $producto = $stmt->fetch();

            if (!is_array($producto)) {
                throw new RuntimeException('Un producto del ticket ya no existe en tu inventario.');
            }

            if ((float) $producto['stock'] < $cantidad) {
                throw new RuntimeException(
                    'Stock insuficiente de ' . (string) $producto['nombre']
                    . ' (quedan ' . rtrim(rtrim(number_format((float) $producto['stock'], 3, '.', ''), '0'), '.') . ').'
                );
            }

            $precio = round((float) $producto['precio_venta'], 2);
            $tasa = (float) $producto['iva_tasa'];
            $bruto = round($precio * $cantidad, 2);

            if ($ivaIncluido) {
                $lineaTotal = $bruto;
                $lineaSubtotal = round($bruto / (1 + $tasa), 2);
            } else {
                $lineaSubtotal = $bruto;
                $lineaTotal = round($bruto * (1 + $tasa), 2);
            }

            $linea = [
                'producto_id' => $productoId,
                'descripcion' => (string) $producto['nombre'],
                'cantidad'    => $cantidad,
                'precio'      => $precio,
                'tasa'        => $tasa,
                'subtotal'    => $lineaSubtotal,
                'total'       => $lineaTotal,
            ];

            $subtotal += $lineaSubtotal;
            $iva += round($lineaTotal - $lineaSubtotal, 2);
            $total += $lineaTotal;

            $posPdo->prepare('UPDATE pos_productos SET stock = stock - ? WHERE id = ? AND usuario_id = ?')
                ->execute([$cantidad, $productoId, $posUid]);

            $lineas[] = $linea;
        }

        $subtotal = round($subtotal, 2);
        $iva = round($iva, 2);
        $total = round($total, 2);

        if ($metodo === 'efectivo' && $recibido + 0.001 < $total) {
            throw new RuntimeException('El efectivo recibido no cubre el total.');
        }

        $cambio = $metodo === 'efectivo' ? round($recibido - $total, 2) : 0.0;

        [$folio] = pos_siguiente_folio($posPdo, $posUid);
        $uuid = pos_uuid4();

        $posPdo->prepare(
            'INSERT INTO pos_ventas (uuid, usuario_id, turno_id, folio, cliente_id, subtotal, iva, total, estado, notas)
             VALUES (?,?,?,?,?,?,?,?,?,?)'
        )->execute([$uuid, $posUid, (int) $turno['id'], $folio, $clienteId, $subtotal, $iva, $total, 'pagada', $notas]);

        $ventaId = (int) $posPdo->lastInsertId();

        $insertar = $posPdo->prepare(
            'INSERT INTO pos_venta_lineas (venta_id, pos_producto_id, descripcion, cantidad, precio_unitario,
                                           descuento, iva_tasa, subtotal, total)
             VALUES (?,?,?,?,?,?,?,?,?)'
        );

        foreach ($lineas as $l) {
            $insertar->execute([
                $ventaId, $l['producto_id'], $l['descripcion'], $l['cantidad'], $l['precio'],
                0, $l['tasa'], $l['subtotal'], $l['total'],
            ]);
        }

        $posPdo->prepare('INSERT INTO pos_pagos (venta_id, metodo, monto, recibido, cambio) VALUES (?,?,?,?,?)')
            ->execute([$ventaId, $metodo, $total, $metodo === 'efectivo' ? $recibido : $total, $cambio]);

        if ($metodo === 'efectivo') {
            $posRepo->registrarMovimiento((int) $turno['id'], 'venta', $total, 'Venta ' . $folio, $folio);
        }

        $posPdo->commit();
    } catch (Throwable $e) {
        if ($posPdo->inTransaction()) {
            $posPdo->rollBack();
        }

        fallo($e->getMessage(), 422, 'NO_VENDIDA');
    }

    responder([
        'ok'       => true,
        'mensaje'  => 'Venta registrada.',
        'folio'    => $folio,
        'uuid'     => $uuid,
        'subtotal' => $subtotal,
        'iva'      => $iva,
        'total'    => $total,
        'cambio'   => $cambio,
        'metodo'   => $metodo,
        'turno_id' => (int) $turno['id'],
    ], 201);
}

// ------------------------------------------------------ GET /pos/inventario
if ($posRuta === '/pos/inventario' && $posMetodo === 'GET') {
    $ajustes = $posRepo->ajustes($posUid);
    pos_sincronizar_inventario($posPdo, $posUid, (float) $ajustes['margen_venta']);

    $productos = [];
    $sugerencias = [];

    foreach ($posRepo->productos($posUid) as $p) {
        $productos[] = pos_producto_json($p);

        if ((float) $p['stock'] <= (float) $p['stock_minimo']) {
            $objetivo = max((float) $p['stock_minimo'] * 3, (float) $p['stock_minimo'] + 1);
            $sugerencias[] = [
                'producto_id' => (int) $p['id'],
                'nombre'      => (string) $p['nombre'],
                'stock'       => (float) $p['stock'],
                'minimo'      => (float) $p['stock_minimo'],
                'sugerido'    => max(1, (int) ceil($objetivo - (float) $p['stock'])),
            ];
        }
    }

    $turno = $posRepo->turnoAbierto($posUid);

    responder([
        'ok'          => true,
        'productos'   => $productos,
        'sugerencias' => $sugerencias,
        'ajustes'     => pos_ajustes_json($ajustes),
        'turno'       => $turno === null ? null : ['id' => (int) $turno['id'], 'abierto_at' => (string) $turno['abierto_at']],
    ]);
}

// ------------------------------------------------------- POST /pos/productos
if ($posRuta === '/pos/productos' && $posMetodo === 'POST') {
    $cuerpo = api_cuerpo();
    $nombre = mb_substr(trim((string) ($cuerpo['nombre'] ?? '')), 0, 180);

    if ($nombre === '') {
        fallo('El nombre del producto es obligatorio.', 422, 'NOMBRE');
    }

    $tasa = (float) ($cuerpo['iva_tasa'] ?? 0.16);
    // La columna tiene DEFAULT 16.00 (dieciséis, no 0.16): nunca se deja vacía.
    if ($tasa > 1) {
        $tasa /= 100;
    }

    $id = $posRepo->guardarProducto($posUid, [
        'nombre'        => $nombre,
        'sku'           => mb_substr(trim((string) ($cuerpo['sku'] ?? '')), 0, 60),
        'codigo_barras' => mb_substr(trim((string) ($cuerpo['codigo_barras'] ?? '')), 0, 60),
        'precio_compra' => max(0, round((float) ($cuerpo['precio_compra'] ?? 0), 2)),
        'precio_venta'  => max(0, round((float) ($cuerpo['precio_venta'] ?? 0), 2)),
        'iva_tasa'      => max(0, $tasa),
        'stock'         => round((float) ($cuerpo['stock'] ?? 0), 3),
        'stock_minimo'  => max(0, round((float) ($cuerpo['stock_minimo'] ?? 1), 3)),
        'unidad'        => mb_substr(trim((string) ($cuerpo['unidad'] ?? 'pieza')), 0, 30) ?: 'pieza',
        'activo'        => !isset($cuerpo['activo']) || (int) $cuerpo['activo'] === 1,
    ]);

    responder(['ok' => true, 'mensaje' => 'Producto agregado.', 'id' => $id], 201);
}

// ------------------------------------------------ PATCH|DELETE /pos/productos/{id}
if (preg_match('#^/pos/productos/(\d+)$#', $posRuta, $m) === 1 && in_array($posMetodo, ['PATCH', 'DELETE'], true)) {
    $id = (int) $m[1];
    $actual = $posRepo->producto($posUid, $id);

    if ($actual === null) {
        fallo('Ese producto no está en tu inventario.', 404, 'NO_ENCONTRADO');
    }

    if ($posMetodo === 'DELETE') {
        $posRepo->guardarProducto($posUid, array_merge($actual, ['activo' => false]), $id);
        responder(['ok' => true, 'mensaje' => 'Producto desactivado.', 'id' => $id]);
    }

    $cuerpo = api_cuerpo();
    $datos = [
        'nombre'        => array_key_exists('nombre', $cuerpo)
            ? mb_substr(trim((string) $cuerpo['nombre']), 0, 180)
            : (string) $actual['nombre'],
        'sku'           => array_key_exists('sku', $cuerpo)
            ? mb_substr(trim((string) $cuerpo['sku']), 0, 60) : (string) ($actual['sku'] ?? ''),
        'codigo_barras' => array_key_exists('codigo_barras', $cuerpo)
            ? mb_substr(trim((string) $cuerpo['codigo_barras']), 0, 60) : (string) ($actual['codigo_barras'] ?? ''),
        'precio_compra' => array_key_exists('precio_compra', $cuerpo)
            ? max(0, round((float) $cuerpo['precio_compra'], 2)) : (float) $actual['precio_compra'],
        'precio_venta'  => array_key_exists('precio_venta', $cuerpo)
            ? max(0, round((float) $cuerpo['precio_venta'], 2)) : (float) $actual['precio_venta'],
        'iva_tasa'      => array_key_exists('iva_tasa', $cuerpo)
            ? (static function ($t): float {
                $t = (float) $t;
                return max(0, $t > 1 ? $t / 100 : $t);
            })($cuerpo['iva_tasa'])
            : (float) $actual['iva_tasa'],
        'stock'         => array_key_exists('stock', $cuerpo)
            ? round((float) $cuerpo['stock'], 3) : (float) $actual['stock'],
        'stock_minimo'  => array_key_exists('stock_minimo', $cuerpo)
            ? max(0, round((float) $cuerpo['stock_minimo'], 3)) : (float) $actual['stock_minimo'],
        'unidad'        => array_key_exists('unidad', $cuerpo)
            ? (mb_substr(trim((string) $cuerpo['unidad']), 0, 30) ?: 'pieza') : (string) $actual['unidad'],
        'activo'        => array_key_exists('activo', $cuerpo) ? (int) $cuerpo['activo'] === 1 : (int) $actual['activo'] === 1,
    ];

    if ($datos['nombre'] === '') {
        fallo('El nombre del producto es obligatorio.', 422, 'NOMBRE');
    }

    $posRepo->guardarProducto($posUid, $datos, $id);

    responder(['ok' => true, 'mensaje' => 'Producto actualizado.', 'producto' => pos_producto_json(array_merge($actual, $datos))]);
}

// ------------------------------------------- POST /pos/reposicion (pedido real)
if ($posRuta === '/pos/reposicion' && $posMetodo === 'POST') {
    $cuerpo = api_cuerpo();
    $ids = array_values(array_filter(array_map('intval', (array) ($cuerpo['ids'] ?? [])), fn ($id) => $id > 0));

    $servicio = new PosService(
        $posRepo,
        new App\Core\AuditLogger($posPdo),
        new App\Modules\Notificaciones\NotificacionService($posPdo, __DIR__ . '/../../storage/correos'),
    );

    $r = $servicio->pedidoReposicion($posUid, $ids);

    if (! $r['ok']) {
        fallo((string) $r['mensaje'], 422, 'SIN_REPOSICION');
    }

    responder(['ok' => true, 'mensaje' => (string) $r['mensaje'], 'uuid' => (string) $r['uuid']]);
}

// --------------------------------------------------------- POST /pos/reponer
if ($posRuta === '/pos/reponer' && $posMetodo === 'POST') {
    $cuerpo = api_cuerpo();
    $productoId = (int) ($cuerpo['producto_id'] ?? 0);
    $cantidad = round((float) ($cuerpo['cantidad'] ?? 0), 3);

    if ($productoId <= 0 || $cantidad <= 0) {
        fallo('Indica el producto y una cantidad mayor que cero.', 422, 'DATOS');
    }

    $producto = $posRepo->producto($posUid, $productoId);

    if ($producto === null) {
        fallo('Ese producto no está en tu inventario.', 404, 'NO_ENCONTRADO');
    }

    $turno = $posRepo->turnoAbierto($posUid);
    $posPdo->beginTransaction();

    try {
        $posPdo->prepare('UPDATE pos_productos SET stock = stock + ? WHERE id = ? AND usuario_id = ?')
            ->execute([$cantidad, $productoId, $posUid]);

        $nota = 'sin turno abierto';

        if ($turno !== null) {
            $posRepo->registrarMovimiento(
                (int) $turno['id'],
                'ingreso',
                round((float) $producto['precio_compra'] * $cantidad, 2),
                'Reposición de ' . (string) $producto['nombre'],
            );
            $nota = 'registrado en el turno #' . (int) $turno['id'];
        }

        $posPdo->commit();
    } catch (Throwable $e) {
        if ($posPdo->inTransaction()) {
            $posPdo->rollBack();
        }
        fallo('No se pudo reponer: ' . $e->getMessage(), 422, 'NO_REPUESTO');
    }

    $stmt = $posPdo->prepare('SELECT stock FROM pos_productos WHERE id = ? AND usuario_id = ?');
    $stmt->execute([$productoId, $posUid]);

    responder([
        'ok'        => true,
        'mensaje'   => 'Stock actualizado (' . $nota . ').',
        'producto_id' => $productoId,
        'stock'     => (float) $stmt->fetchColumn(),
    ]);
}

// ---------------------------------------------------------- GET /pos/ventas
if ($posRuta === '/pos/ventas' && $posMetodo === 'GET') {
    $desde = api_q('desde');
    $hasta = api_q('hasta');
    $limite = api_qint('limite', 100, 1, 500);

    $sql = 'SELECT v.id, v.uuid, v.turno_id, v.folio, v.cliente_id, v.subtotal, v.iva, v.total, v.estado,
                   v.notas, v.created_at, c.nombre AS cliente,
                   (SELECT p.metodo FROM pos_pagos p WHERE p.venta_id = v.id ORDER BY p.id LIMIT 1) AS metodo
              FROM pos_ventas v
         LEFT JOIN pos_clientes c ON c.id = v.cliente_id
             WHERE v.usuario_id = ?';
    $params = [$posUid];

    if ($desde !== '') {
        $sql .= ' AND DATE(v.created_at) >= DATE(?)';
        $params[] = $desde;
    }
    if ($hasta !== '') {
        $sql .= ' AND DATE(v.created_at) <= DATE(?)';
        $params[] = $hasta;
    }

    $sql .= ' ORDER BY v.id DESC LIMIT ' . $limite;

    $stmt = $posPdo->prepare($sql);
    $stmt->execute($params);

    $ventas = [];
    $suma = 0.0;
    foreach ($stmt->fetchAll() ?: [] as $v) {
        $ventas[] = pos_venta_json($v);
        if ((string) $v['estado'] === 'pagada') {
            $suma += (float) $v['total'];
        }
    }

    responder([
        'ok'     => true,
        'ventas' => $ventas,
        'total'  => round($suma, 2),
        'desde'  => $desde,
        'hasta'  => $hasta,
    ]);
}

// --------------------------------------------------- GET /pos/ticket/{uuid}
if (preg_match('#^/pos/ticket/([0-9a-fA-F-]{36})$#', $posRuta, $m) === 1 && $posMetodo === 'GET') {
    $venta = $posRepo->ventaPorUuid($posUid, $m[1]);

    if ($venta === null) {
        fallo('Ese ticket no existe en tu caja.', 404, 'NO_ENCONTRADO');
    }

    $ventaId = (int) $venta['id'];

    $lineas = [];
    foreach ($posRepo->lineas($ventaId) as $l) {
        $lineas[] = [
            'id'              => (int) $l['id'],
            'descripcion'     => (string) $l['descripcion'],
            'cantidad'        => (float) $l['cantidad'],
            'precio_unitario' => (float) $l['precio_unitario'],
            'descuento'       => (float) $l['descuento'],
            'iva_tasa'        => (float) $l['iva_tasa'],
            'subtotal'        => (float) $l['subtotal'],
            'total'           => (float) $l['total'],
        ];
    }

    $pagos = [];
    foreach ($posRepo->pagos($ventaId) as $p) {
        $pagos[] = [
            'metodo'   => (string) $p['metodo'],
            'monto'    => (float) $p['monto'],
            'recibido' => (float) $p['recibido'],
            'cambio'   => (float) $p['cambio'],
        ];
    }

    $cliente = null;
    if ($venta['cliente_id'] !== null) {
        $stmt = $posPdo->prepare('SELECT nombre, rfc, telefono, email FROM pos_clientes WHERE id = ? AND usuario_id = ? LIMIT 1');
        $stmt->execute([(int) $venta['cliente_id'], $posUid]);
        $c = $stmt->fetch();
        if (is_array($c)) {
            $cliente = [
                'nombre'   => (string) $c['nombre'],
                'rfc'      => (string) ($c['rfc'] ?? ''),
                'telefono' => (string) ($c['telefono'] ?? ''),
                'email'    => (string) ($c['email'] ?? ''),
            ];
        }
    }

    $negocio = (string) $posPdo->query('SELECT nombre_negocio FROM comercios_perfil WHERE usuario_id = ' . $posUid . ' LIMIT 1')->fetchColumn();

    responder([
        'ok'      => true,
        'venta'   => pos_venta_json($venta),
        'lineas'  => $lineas,
        'pagos'   => $pagos,
        'cliente' => $cliente,
        'negocio' => $negocio,
    ]);
}

// ----------------------------------------------------------- GET /pos/corte
if ($posRuta === '/pos/corte' && $posMetodo === 'GET') {
    $id = api_qint('turno', 0);

    if ($id === 0) {
        $actual = $posRepo->turnoAbierto($posUid);
        if ($actual !== null) {
            $id = (int) $actual['id'];
        } else {
            $ultimo = $posRepo->ultimoTurno($posUid);
            $id = $ultimo !== null ? (int) $ultimo['id'] : 0;
        }
    }

    if ($id === 0) {
        fallo('Todavía no hay turnos en esta caja.', 404, 'SIN_TURNO');
    }

    $turno = $posRepo->turno($id);

    if ($turno === null || (int) $turno['usuario_id'] !== $posUid) {
        fallo('Ese turno no es de tu caja.', 404, 'NO_ENCONTRADO');
    }

    responder(['ok' => true] + pos_corte($posPdo, $turno));
}

// --------------------------------------------------------- /pos/clientes
if ($posRuta === '/pos/clientes' && $posMetodo === 'GET') {
    $clientes = [];
    foreach ($posRepo->clientes($posUid) as $c) {
        $clientes[] = [
            'id'         => (int) $c['id'],
            'nombre'     => (string) $c['nombre'],
            'telefono'   => (string) ($c['telefono'] ?? ''),
            'email'      => (string) ($c['email'] ?? ''),
            'rfc'        => (string) ($c['rfc'] ?? ''),
            'created_at' => (string) $c['created_at'],
        ];
    }

    responder(['ok' => true, 'clientes' => $clientes]);
}

if ($posRuta === '/pos/clientes' && $posMetodo === 'POST') {
    $cuerpo = api_cuerpo();
    $nombre = mb_substr(trim((string) ($cuerpo['nombre'] ?? '')), 0, 120);

    if ($nombre === '') {
        fallo('El nombre del cliente es obligatorio.', 422, 'NOMBRE');
    }

    $id = $posRepo->crearCliente(
        $posUid,
        $nombre,
        mb_substr(trim((string) ($cuerpo['telefono'] ?? '')), 0, 20),
        mb_substr(trim((string) ($cuerpo['email'] ?? '')), 0, 190),
        mb_substr(strtoupper(trim((string) ($cuerpo['rfc'] ?? ''))), 0, 13),
    );

    responder(['ok' => true, 'mensaje' => 'Cliente guardado.', 'id' => $id], 201);
}

// ---------------------------------------------------------- POST /pos/ajustes
if ($posRuta === '/pos/ajustes' && $posMetodo === 'POST') {
    $cuerpo = api_cuerpo();
    $margen = max(0.0, min(300.0, round((float) ($cuerpo['margen_venta'] ?? 30), 2)));
    $reorden = !isset($cuerpo['reorden_auto']) || (int) $cuerpo['reorden_auto'] === 1;
    $ivaIncluido = !isset($cuerpo['iva_incluido']) || (int) $cuerpo['iva_incluido'] === 1;

    $posRepo->guardarAjustes($posUid, $margen, $reorden, $ivaIncluido);

    responder([
        'ok'      => true,
        'mensaje' => 'Ajustes guardados.',
        'ajustes' => pos_ajustes_json($posRepo->ajustes($posUid)),
    ]);
}

// La ruta empieza por /pos pero no es ninguna de las anteriores.
fallo('Ruta del punto de venta no encontrada: ' . $posMetodo . ' ' . $posRuta, 404, 'NO_ENCONTRADA');
