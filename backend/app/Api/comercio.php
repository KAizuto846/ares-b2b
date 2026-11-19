<?php

declare(strict_types=1);

/**
 * Módulo comercio de la API: inicio (explorar), carrito como página,
 * portafolio (favoritos) y agendar (listas programadas).
 *
 * Todas las rutas de este archivo son para el rol `comercio`. Si la ruta no
 * es de este módulo, el archivo devuelve el control sin responder.
 */

use App\Modules\Carrito\CarritoRepository;
use App\Modules\Carrito\CarritoService;
use App\Modules\Catalogo\PrecioService;
use App\Modules\Favoritos\FavoritoService;

// api.php no incluye las ayudas: cada módulo las carga una sola vez.
require_once __DIR__ . '/_comun.php';

$ctx = api_ctx();
$rutaModulo = (string) ($ctx['ruta'] ?? '');
$metodoModulo = (string) ($ctx['metodo'] ?? 'GET');

$esRutaPropia = static function (string $r): bool {
    return $r === '/explorar'
        || $r === '/carrito/pagina'
        || $r === '/portafolio'
        || $r === '/portafolio/agregar'
        || $r === '/portafolio/quitar'
        || preg_match('#^/portafolio/recompra/[^/]+$#', $r) === 1
        || $r === '/agendar'
        || preg_match('#^/agendar/\d+(/estado)?$#', $r) === 1;
};

if (!$esRutaPropia($rutaModulo)) {
    return;
}

api_exigir('comercio');

$pdoModulo = api_pdo();
$comercioIdModulo = api_comercio_id();

if ($comercioIdModulo <= 0) {
    fallo('Tu cuenta no tiene perfil de comercio. Complétalo en Mi perfil.', 409, 'SIN_PERFIL');
}

/** Servicio de carrito listo para recalcular (misma fuente de verdad que el checkout). */
$servicioCarrito = static function () use ($pdoModulo): CarritoService {
    return new CarritoService(new CarritoRepository($pdoModulo), new PrecioService());
};

/** Id del perfil de una cuenta según su tabla (lista blanca). */
$perfilId = static function (string $tabla, int $usuarioId) use ($pdoModulo): int {
    if (!in_array($tabla, ['comercios_perfil', 'mayoristas_perfil', 'repartidores_perfil'], true)) {
        return 0;
    }

    $q = $pdoModulo->prepare('SELECT id FROM ' . $tabla . ' WHERE usuario_id = ? LIMIT 1');
    $q->execute([$usuarioId]);

    return (int) $q->fetchColumn();
};

// ---------------------------------------------------------------- /explorar
if ($rutaModulo === '/explorar' && $metodoModulo === 'GET') {
    $usuarioIdModulo = api_uid();
    $rolModulo = api_rol();

    $q = $pdoModulo->prepare('SELECT nombre FROM usuarios WHERE id = ? AND deleted_at IS NULL LIMIT 1');
    $q->execute([$usuarioIdModulo]);
    $nombreModulo = trim((string) ($q->fetchColumn() ?: '')) ?: 'de nuevo';

    // ------------------------------------------------ métricas por rol
    $metricas = [];

    try {
        if ($rolModulo === 'comercio') {
            $perfil = $perfilId('comercios_perfil', $usuarioIdModulo);

            $q = $pdoModulo->prepare(
                "SELECT COUNT(*) FROM pedidos WHERE comercio_id = ?
                  AND estado IN ('pendiente_aceptacion','buscando_repartidor','en_camino')"
            );
            $q->execute([$perfil]);
            $metricas[] = [
                'valor'    => (string) (int) $q->fetchColumn(),
                'etiqueta' => 'Pedidos en curso',
                'nota'     => 'compras sin cerrar',
                'href'     => '/pedidos',
            ];

            $q = $pdoModulo->prepare(
                'SELECT COALESCE(SUM(total), 0) FROM pos_ventas
                  WHERE usuario_id = ? AND estado <> \'cancelada\' AND DATE(created_at) = CURDATE()'
            );
            $q->execute([$usuarioIdModulo]);
            $metricas[] = [
                'valor'    => '$' . number_format((float) $q->fetchColumn(), 0),
                'etiqueta' => 'Vendido hoy',
                'nota'     => 'en mostrador',
                'href'     => '/pos/ventas',
            ];
        } elseif ($rolModulo === 'mayorista') {
            $perfil = $perfilId('mayoristas_perfil', $usuarioIdModulo);

            $q = $pdoModulo->prepare("SELECT COUNT(*) FROM pedidos WHERE mayorista_id = ? AND estado = 'pendiente_aceptacion'");
            $q->execute([$perfil]);
            $metricas[] = [
                'valor'    => (string) (int) $q->fetchColumn(),
                'etiqueta' => 'Por aceptar',
                'nota'     => 'esperan tu respuesta',
                'href'     => '/pedidos',
            ];

            $q = $pdoModulo->prepare(
                "SELECT COUNT(*) FROM pedidos WHERE mayorista_id = ?
                  AND estado IN ('preparando','listo_para_recoger')"
            );
            $q->execute([$perfil]);
            $metricas[] = [
                'valor'    => (string) (int) $q->fetchColumn(),
                'etiqueta' => 'Por surtir',
                'nota'     => 'en preparación',
                'href'     => '/pedidos',
            ];

            $q = $pdoModulo->prepare(
                "SELECT COALESCE(SUM(total), 0) FROM pedidos WHERE mayorista_id = ?
                  AND DATE(created_at) = CURDATE() AND estado NOT IN ('cancelado','rechazado')"
            );
            $q->execute([$perfil]);
            $metricas[] = [
                'valor'    => '$' . number_format((float) $q->fetchColumn(), 0),
                'etiqueta' => 'Vendido hoy',
                'nota'     => 'sin cancelados',
                'href'     => '/finanzas',
            ];

            $q = $pdoModulo->prepare(
                'SELECT COUNT(*) FROM productos
                  WHERE mayorista_id = ? AND activo = 1 AND deleted_at IS NULL AND stock_disponible <= 0'
            );
            $q->execute([$perfil]);
            $metricas[] = [
                'valor'    => (string) (int) $q->fetchColumn(),
                'etiqueta' => 'Agotados',
                'nota'     => 'no se pueden vender',
                'href'     => '/productos',
            ];
        } elseif ($rolModulo === 'repartidor') {
            $perfil = $perfilId('repartidores_perfil', $usuarioIdModulo);

            $q = $pdoModulo->prepare(
                "SELECT COUNT(*), COALESCE(SUM(e.tarifa), 0)
                   FROM envios e JOIN pedidos p ON p.id = e.pedido_id
                  WHERE e.repartidor_id = ? AND p.estado = 'entregado' AND DATE(p.updated_at) = CURDATE()"
            );
            $q->execute([$perfil]);
            $fila = $q->fetch(PDO::FETCH_NUM) ?: [0, 0];
            $metricas[] = [
                'valor'    => (string) (int) $fila[0],
                'etiqueta' => 'Viajes hoy',
                'nota'     => 'entregados',
                'href'     => '/repartidor',
            ];
            $metricas[] = [
                'valor'    => '$' . number_format((float) $fila[1], 2),
                'etiqueta' => 'Ganado hoy',
                'nota'     => 'antes de comisión',
                'href'     => '/repartidor',
            ];

            $q = $pdoModulo->prepare(
                "SELECT COUNT(*) FROM ofertas_envio WHERE repartidor_id = ? AND estado = 'pendiente' AND expira_en > NOW()"
            );
            $q->execute([$perfil]);
            $metricas[] = [
                'valor'    => (string) (int) $q->fetchColumn(),
                'etiqueta' => 'Ofertas activas',
                'nota'     => 'esperan respuesta',
                'href'     => '/repartidor',
            ];

            $q = $pdoModulo->prepare('SELECT calificacion_promedio FROM repartidores_perfil WHERE id = ?');
            $q->execute([$perfil]);
            $metricas[] = [
                'valor'    => number_format((float) $q->fetchColumn(), 1) . ' ★',
                'etiqueta' => 'Calificación',
                'nota'     => 'promedio',
                'href'     => '/repartidor',
            ];
        } elseif (str_starts_with($rolModulo, 'admin')) {
            $q = $pdoModulo->query('SELECT COUNT(*) FROM pedidos WHERE DATE(created_at) = CURDATE()');
            $metricas[] = [
                'valor'    => (string) (int) $q->fetchColumn(),
                'etiqueta' => 'Pedidos hoy',
                'nota'     => 'toda la plataforma',
                'href'     => '/admin',
            ];

            $q = $pdoModulo->query("SELECT COUNT(*) FROM kyc_documentos WHERE estado = 'pendiente'");
            $metricas[] = [
                'valor'    => (string) (int) $q->fetchColumn(),
                'etiqueta' => 'KYC pendientes',
                'nota'     => 'cuentas por verificar',
                'href'     => '/admin/kyc',
            ];

            $q = $pdoModulo->query('SELECT COUNT(*) FROM envios WHERE repartidor_id IS NULL');
            $metricas[] = [
                'valor'    => (string) (int) $q->fetchColumn(),
                'etiqueta' => 'Envíos sin repartidor',
                'nota'     => 'necesitan atención',
                'href'     => '/admin',
            ];

            $q = $pdoModulo->query("SELECT COUNT(*) FROM reclamos WHERE estado <> 'resuelto'");
            $metricas[] = [
                'valor'    => (string) (int) $q->fetchColumn(),
                'etiqueta' => 'Reclamos abiertos',
                'nota'     => 'sin resolver',
                'href'     => '/admin/reclamos',
            ];
        }
    } catch (\Throwable $e) {
        error_log('[ares-api] explorar métricas: ' . $e->getMessage());
    }

    // ------------------------------------------------ accesos por rol
    $accesos = match (true) {
        $rolModulo === 'comercio' => [
            ['href' => '/buscar', 'titulo' => 'Buscar', 'texto' => 'Encuentra productos y mayoristas cerca de ti.', 'icono' => 'buscar'],
            ['href' => '/finanzas', 'titulo' => 'Finanzas', 'texto' => 'Tus gastos, la gráfica del año y tus facturas.', 'icono' => 'finanzas'],
            ['href' => '/portafolio', 'titulo' => 'Portafolio', 'texto' => 'Los productos que guardaste, listos para repetir.', 'icono' => 'estrella'],
            ['href' => '/agendar', 'titulo' => 'Agendar', 'texto' => 'Arma una lista y elige el día en que la quieres.', 'icono' => 'calendario'],
        ],
        $rolModulo === 'mayorista' => [
            ['href' => '/buscar', 'titulo' => 'Buscar', 'texto' => 'Explora el catálogo completo.', 'icono' => 'buscar'],
            ['href' => '/productos', 'titulo' => 'Mis productos', 'texto' => 'Tu catálogo, precios y existencias.', 'icono' => 'productos'],
            ['href' => '/pedidos', 'titulo' => 'Pedidos', 'texto' => 'Lo que te acaban de pedir.', 'icono' => 'pedidos'],
            ['href' => '/finanzas', 'titulo' => 'Finanzas', 'texto' => 'Ventas, comisiones y lo que te queda.', 'icono' => 'finanzas'],
        ],
        $rolModulo === 'repartidor' => [
            ['href' => '/repartidor', 'titulo' => 'Reparto', 'texto' => 'Viajes asignados y ofertas.', 'icono' => 'reparto'],
            ['href' => '/finanzas', 'titulo' => 'Finanzas', 'texto' => 'Tus viajes y lo que has ganado.', 'icono' => 'finanzas'],
            ['href' => '/buscar', 'titulo' => 'Buscar', 'texto' => 'Explora el catálogo completo.', 'icono' => 'buscar'],
        ],
        default => str_starts_with($rolModulo, 'admin') ? [
            ['href' => '/admin', 'titulo' => 'Administración', 'texto' => 'El pulso de la plataforma.', 'icono' => 'admin'],
            ['href' => '/admin/kyc', 'titulo' => 'Verificaciones', 'texto' => 'Cuentas esperando revisión.', 'icono' => 'kyc'],
            ['href' => '/admin/reclamos', 'titulo' => 'Reclamos', 'texto' => 'Lo que hay que atender.', 'icono' => 'reclamos'],
            ['href' => '/buscar', 'titulo' => 'Buscar', 'texto' => 'Explora el catálogo completo.', 'icono' => 'buscar'],
        ] : [
            ['href' => '/buscar', 'titulo' => 'Buscar', 'texto' => 'Explora el catálogo completo.', 'icono' => 'buscar'],
        ],
    };

    // ------------------------------------------------ franja de atajos
    $atajos = $rolModulo === 'comercio' ? [
        ['href' => '/pos', 'titulo' => 'Caja', 'texto' => 'Cobrar en mostrador.', 'icono' => 'pos'],
        ['href' => '/pos/inventario', 'titulo' => 'Inventario', 'texto' => 'Existencias y altas de producto.', 'icono' => 'inventario'],
        ['href' => '/pos/ventas', 'titulo' => 'Ventas', 'texto' => 'El historial del día.', 'icono' => 'ventas'],
        ['href' => '/pedidos', 'titulo' => 'Pedidos', 'texto' => 'El seguimiento de tus compras.', 'icono' => 'pedidos'],
        ['href' => '/mensajes', 'titulo' => 'Mensajes', 'texto' => 'Habla con mayoristas y soporte.', 'icono' => 'mensajes'],
    ] : [];

    // ------------------------------------------------ resumen (globos)
    $sinLeer = 0;
    $enPortafolio = 0;
    $enCurso = 0;

    try {
        $q = $pdoModulo->prepare(
            'SELECT COUNT(*) FROM mensajes_directos m
               JOIN conversacion_participantes p
                 ON p.conversacion_id = m.conversacion_id AND p.usuario_id = ?
              WHERE m.id > p.ultimo_leido_id AND m.autor_id <> ?'
        );
        $q->execute([$usuarioIdModulo, $usuarioIdModulo]);
        $sinLeer = (int) $q->fetchColumn();
    } catch (\Throwable $e) {
        error_log('[ares-api] explorar mensajes: ' . $e->getMessage());
    }

    try {
        if ($rolModulo === 'comercio') {
            $q = $pdoModulo->prepare('SELECT COUNT(*) FROM favoritos WHERE comercio_id = ?');
            $q->execute([$comercioIdModulo]);
            $enPortafolio = (int) $q->fetchColumn();

            $q = $pdoModulo->prepare(
                "SELECT COUNT(*) FROM pedidos WHERE comercio_id = ?
                  AND estado IN ('pendiente_aceptacion','buscando_repartidor','en_camino')"
            );
            $q->execute([$comercioIdModulo]);
            $enCurso = (int) $q->fetchColumn();
        }
    } catch (\Throwable $e) {
        error_log('[ares-api] explorar resumen: ' . $e->getMessage());
    }

    // El globo de mensajes y el del portafolio se pintan en su acceso/atajo.
    foreach ($accesos as $i => $a) {
        if ($a['href'] === '/portafolio' && $enPortafolio > 0) {
            $accesos[$i]['globos'] = $enPortafolio;
        }
    }
    foreach ($atajos as $i => $a) {
        if ($a['href'] === '/mensajes' && $sinLeer > 0) {
            $atajos[$i]['globos'] = $sinLeer;
        }
    }

    responder([
        'ok'       => true,
        'nombre'   => $nombreModulo,
        'rol'      => $rolModulo,
        'metricas' => $metricas,
        'accesos'  => $accesos,
        'atajos'   => $atajos,
        'resumen'  => ['mensajes' => $sinLeer, 'portafolio' => $enPortafolio, 'pedidos' => $enCurso],
    ]);
}

// ---------------------------------------------------------- /carrito/pagina
if ($rutaModulo === '/carrito/pagina' && $metodoModulo === 'GET') {
    $resumen = $servicioCarrito()->recalcular($comercioIdModulo);

    $unidades = 0;
    foreach ($resumen['grupos'] as $g) {
        foreach ($g['items'] as $it) {
            $unidades += (int) $it['cantidad'];
        }
    }

    responder(['ok' => true, 'unidades' => $unidades] + $resumen);
}

// ------------------------------------------------------------- /portafolio
if ($rutaModulo === '/portafolio' && $metodoModulo === 'GET') {
    $favoritos = new FavoritoService($pdoModulo, $servicioCarrito());
    $filas = $favoritos->listar($comercioIdModulo);

    $fichas = [];
    foreach ($filas as $f) {
        $stock = (int) $f['stock_disponible'];
        $minimo = max(1, (int) $f['cantidad_minima']);

        $fichas[] = [
            'uuid'             => (string) $f['uuid'],
            'nombre'           => (string) $f['nombre'],
            'mayorista'        => (string) $f['mayorista'],
            'mayorista_uuid'   => (string) ($f['mayorista_uuid'] ?? ''),
            'carpeta'          => (string) ($f['carpeta'] ?: 'General'),
            'categoria'        => (string) ($f['categoria'] ?? ''),
            'precio_base'      => (float) $f['precio_base'],
            'unidad_venta'     => (string) ($f['unidad_venta'] ?? ''),
            'contenido'        => (string) ($f['contenido'] ?? ''),
            'cantidad_minima'  => $minimo,
            'stock_disponible' => $stock,
            'disponible'       => (int) $f['activo'] === 1 && $stock >= $minimo,
        ];
    }

    responder([
        'ok'          => true,
        'favoritos'   => $fichas,
        'sugerencias' => $favoritos->sugerencias($comercioIdModulo),
    ]);
}

if ($rutaModulo === '/portafolio/agregar' && $metodoModulo === 'POST') {
    $uuid = trim((string) (api_cuerpo()['producto_uuid'] ?? ''));

    if ($uuid === '') {
        fallo('Indica el producto que quieres guardar.', 422, 'PRODUCTO_FALTANTE');
    }

    $favoritos = new FavoritoService($pdoModulo, $servicioCarrito());
    $r = $favoritos->agregar($comercioIdModulo, $uuid, 'General');

    if (!$r['ok']) {
        fallo((string) $r['mensaje'], 422, 'NO_GUARDADO');
    }

    responder(['ok' => true, 'mensaje' => 'Guardado en tu portafolio.']);
}

if ($rutaModulo === '/portafolio/quitar' && $metodoModulo === 'POST') {
    $uuid = trim((string) (api_cuerpo()['producto_uuid'] ?? ''));

    if ($uuid === '') {
        fallo('Indica el producto que quieres quitar.', 422, 'PRODUCTO_FALTANTE');
    }

    $favoritos = new FavoritoService($pdoModulo, $servicioCarrito());
    $favoritos->quitar($comercioIdModulo, $uuid);

    responder(['ok' => true, 'mensaje' => 'Quitado de tu portafolio.']);
}

if (preg_match('#^/portafolio/recompra/([^/]+)$#', $rutaModulo, $partes) === 1 && $metodoModulo === 'POST') {
    $uuid = (string) $partes[1];
    $carrito = $servicioCarrito();
    $favoritos = new FavoritoService($pdoModulo, $carrito);

    // 1) Si el uuid es de un pedido propio, se recompra todo lo que siga disponible.
    $q = $pdoModulo->prepare('SELECT id FROM pedidos WHERE uuid = ? AND comercio_id = ? LIMIT 1');
    $q->execute([$uuid, $comercioIdModulo]);
    $pedidoId = $q->fetchColumn();

    if ($pedidoId !== false) {
        $r = $favoritos->recomprar($comercioIdModulo, (int) $pedidoId);

        if ($r['agregados'] === 0) {
            $motivos = implode(' · ', array_map(
                static fn (array $o): string => $o['nombre'] . ' (' . $o['motivo'] . ')',
                $r['omitidos'],
            ));
            fallo('No se pudo volver a pedir: ' . ($motivos !== '' ? $motivos : 'el pedido no tiene líneas.'), 422, 'NADA_AGREGADO');
        }

        responder([
            'ok'        => true,
            'agregados' => $r['agregados'],
            'omitidos'  => $r['omitidos'],
            'mensaje'   => 'Se agregaron ' . $r['agregados'] . ' producto' . ($r['agregados'] === 1 ? '' : 's')
                . ' al carrito.' . ($r['omitidos'] === [] ? '' : ' Algunos no estaban disponibles.'),
            'carrito'   => $carrito->recalcular($comercioIdModulo),
        ]);
    }

    // 2) Si el uuid es de un producto en el portafolio, se pide su cantidad mínima.
    $q = $pdoModulo->prepare(
        'SELECT p.uuid, p.nombre, p.stock_disponible, p.cantidad_minima, p.activo, p.deleted_at
           FROM favoritos f JOIN productos p ON p.id = f.producto_id
          WHERE f.comercio_id = ? AND p.uuid = ? LIMIT 1'
    );
    $q->execute([$comercioIdModulo, $uuid]);
    $producto = $q->fetch() ?: null;

    if ($producto === null) {
        fallo('Ese producto no está en tu portafolio.', 404, 'NO_ENCONTRADO');
    }

    $cantidad = max(1, (int) $producto['cantidad_minima']);
    $disponible = (int) $producto['stock_disponible'];

    if ((int) $producto['activo'] !== 1 || $producto['deleted_at'] !== null || $disponible < $cantidad) {
        fallo('Ahora mismo solo hay ' . $disponible . ' de ' . $producto['nombre'] . '.', 422, 'SIN_STOCK');
    }

    $r = $carrito->agregarItem($comercioIdModulo, $uuid, $cantidad);

    if (!$r['ok']) {
        fallo((string) $r['mensaje'], 422, 'NO_AGREGADO');
    }

    responder([
        'ok'        => true,
        'agregados' => 1,
        'omitidos'  => [],
        'mensaje'   => $producto['nombre'] . ' × ' . $cantidad . ' en el carrito.',
        'carrito'   => $carrito->recalcular($comercioIdModulo),
    ]);
}

// ----------------------------------------------------------------- /agendar
if ($rutaModulo === '/agendar' && $metodoModulo === 'GET') {
    $q = $pdoModulo->prepare(
        "SELECT pp.id, pp.uuid, pp.estado, pp.frecuencia, pp.fecha_deseada, pp.hora, pp.proximo_envio,
                m.nombre_comercial AS mayorista, m.uuid AS mayorista_uuid
           FROM pedidos_programados pp
           JOIN mayoristas_perfil m ON m.id = pp.mayorista_id
          WHERE pp.comercio_id = ?
          ORDER BY FIELD(pp.estado, 'activa', 'pausada', 'cancelada'), pp.proximo_envio"
    );
    $q->execute([$comercioIdModulo]);
    $filas = $q->fetchAll() ?: [];

    $itemsPorLista = [];
    if ($filas !== []) {
        $ids = array_map(static fn (array $f): int => (int) $f['id'], $filas);
        $marcas = implode(',', array_fill(0, count($ids), '?'));
        $qi = $pdoModulo->prepare(
            "SELECT i.programado_id, i.cantidad, p.uuid, p.nombre, p.unidad_venta, p.contenido
               FROM pedidos_programados_items i
               JOIN productos p ON p.id = i.producto_id
              WHERE i.programado_id IN ($marcas)
              ORDER BY p.nombre"
        );
        $qi->execute($ids);
        foreach ($qi->fetchAll() ?: [] as $it) {
            $itemsPorLista[(int) $it['programado_id']][] = [
                'producto_uuid' => (string) $it['uuid'],
                'nombre'        => (string) $it['nombre'],
                'cantidad'      => (int) $it['cantidad'],
            ];
        }
    }

    $listas = [];
    foreach ($filas as $f) {
        $listas[] = [
            'id'             => (int) $f['id'],
            'estado'         => (string) $f['estado'],
            'frecuencia'     => (string) $f['frecuencia'],
            'fecha_deseada'  => $f['fecha_deseada'] !== null ? (string) $f['fecha_deseada'] : null,
            'hora'           => $f['hora'] !== null ? substr((string) $f['hora'], 0, 5) : null,
            'proximo_envio'  => api_fecha($f['proximo_envio'] === null ? null : (string) $f['proximo_envio']),
            'mayorista'      => (string) $f['mayorista'],
            'mayorista_uuid' => (string) ($f['mayorista_uuid'] ?? ''),
            'lineas'         => count($itemsPorLista[(int) $f['id']] ?? []),
            'items'          => $itemsPorLista[(int) $f['id']] ?? [],
        ];
    }

    $qp = $pdoModulo->query(
        "SELECT p.uuid, p.nombre, p.precio_base, p.cantidad_minima, p.unidad_venta, p.contenido,
                m.nombre_comercial AS mayorista, m.uuid AS mayorista_uuid
           FROM productos p
           JOIN mayoristas_perfil m ON m.id = p.mayorista_id
          WHERE p.activo = 1 AND p.stock_disponible > 0 AND p.deleted_at IS NULL
          ORDER BY m.nombre_comercial, p.nombre
          LIMIT 200"
    );

    $productos = [];
    foreach ($qp->fetchAll() ?: [] as $p) {
        $productos[] = [
            'uuid'            => (string) $p['uuid'],
            'nombre'          => (string) $p['nombre'],
            'mayorista'       => (string) $p['mayorista'],
            'mayorista_uuid'  => (string) ($p['mayorista_uuid'] ?? ''),
            'precio_base'     => (float) $p['precio_base'],
            'cantidad_minima' => max(1, (int) $p['cantidad_minima']),
            'unidad_venta'    => (string) ($p['unidad_venta'] ?? ''),
            'contenido'       => (string) ($p['contenido'] ?? ''),
        ];
    }

    responder(['ok' => true, 'listas' => $listas, 'productos' => $productos, 'hoy' => date('Y-m-d')]);
}

if ($rutaModulo === '/agendar' && $metodoModulo === 'POST') {
    $cuerpo = api_cuerpo();
    $fecha = trim((string) ($cuerpo['fecha_deseada'] ?? ''));
    $hora = trim((string) ($cuerpo['hora'] ?? '09:00'));
    $itemsCrudos = $cuerpo['items'] ?? [];

    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha) !== 1) {
        fallo('Elige un día válido para la lista.', 422, 'FECHA');
    }

    if (strtotime($fecha) < strtotime(date('Y-m-d'))) {
        fallo('La fecha ya pasó. Elige un día de hoy en adelante.', 422, 'FECHA_PASADA');
    }

    if (preg_match('/^\d{2}:\d{2}$/', $hora) !== 1) {
        $hora = '09:00';
    }

    if (!is_array($itemsCrudos) || $itemsCrudos === []) {
        fallo('La lista necesita al menos un producto.', 422, 'SIN_PRODUCTOS');
    }

    $items = [];
    foreach ($itemsCrudos as $item) {
        if (!is_array($item)) {
            continue;
        }
        $uuid = trim((string) ($item['producto_uuid'] ?? ''));
        if ($uuid === '') {
            continue;
        }
        $items[] = ['producto_uuid' => $uuid, 'cantidad' => max(1, (int) ($item['cantidad'] ?? 1))];
    }

    if ($items === []) {
        fallo('La lista necesita al menos un producto.', 422, 'SIN_PRODUCTOS');
    }

    // Todos los productos deben ser del mismo mayorista: una lista = un proveedor.
    $buscar = $pdoModulo->prepare(
        'SELECT p.nombre, m.id AS mayorista_id, m.nombre_comercial
           FROM productos p JOIN mayoristas_perfil m ON m.id = p.mayorista_id
          WHERE p.uuid = ? AND p.deleted_at IS NULL LIMIT 1'
    );

    $proveedores = [];
    foreach ($items as $i => $item) {
        $buscar->execute([$item['producto_uuid']]);
        $p = $buscar->fetch() ?: null;

        if ($p === null) {
            fallo('No encontramos uno de los productos elegidos. Vuelve a cargar la lista.', 422, 'PRODUCTO_INVALIDO');
        }

        $items[$i]['producto_id_nombre'] = (string) $p['nombre'];
        $proveedores[(int) $p['mayorista_id']] = (string) $p['nombre_comercial'];
    }

    if (count($proveedores) > 1) {
        $nombres = array_values($proveedores);
        fallo(
            'Una lista es de un solo mayorista y mezclaste ' . implode(' y ', $nombres)
                . '. Quita los productos de uno de ellos para poder agendar.',
            422,
            'MAYORISTAS_MEZCLADOS'
        );
    }

    $mayoristaId = (int) array_key_first($proveedores);
    $mayoristaNombre = (string) reset($proveedores);

    // Verificación explícita contra mayoristas_perfil.
    $q = $pdoModulo->prepare('SELECT nombre_comercial FROM mayoristas_perfil WHERE id = ? LIMIT 1');
    $q->execute([$mayoristaId]);
    if ($q->fetchColumn() === false) {
        fallo('El proveedor de esos productos ya no está disponible.', 422, 'PROVEEDOR');
    }

    $uuidLista = bin2hex(random_bytes(4)) . '-' . bin2hex(random_bytes(2)) . '-4'
        . substr(bin2hex(random_bytes(2)), 1) . '-' . bin2hex(random_bytes(2)) . '-' . bin2hex(random_bytes(6));

    $pdoModulo->beginTransaction();

    try {
        $pdoModulo->prepare(
            "INSERT INTO pedidos_programados
                 (uuid, comercio_id, mayorista_id, frecuencia, dia_semana, hora, fecha_deseada, estado, proximo_envio)
             VALUES (?,?,?, 'unica', NULL, ?, ?, 'activa', ?)"
        )->execute([$uuidLista, $comercioIdModulo, $mayoristaId, $hora, $fecha, $fecha . ' ' . $hora . ':00']);

        $listaId = (int) $pdoModulo->lastInsertId();

        $insertar = $pdoModulo->prepare(
            'INSERT INTO pedidos_programados_items (programado_id, producto_id, cantidad)
             SELECT ?, id, ? FROM productos WHERE uuid = ? LIMIT 1'
        );

        foreach ($items as $item) {
            $insertar->execute([$listaId, (int) $item['cantidad'], (string) $item['producto_uuid']]);
        }

        $pdoModulo->commit();
    } catch (\Throwable $e) {
        if ($pdoModulo->inTransaction()) {
            $pdoModulo->rollBack();
        }

        error_log('[ares-api] agendar: ' . $e->getMessage());
        fallo('No se pudo guardar la lista. Inténtalo de nuevo.', 500, 'NO_GUARDADA');
    }

    responder([
        'ok'      => true,
        'id'      => $listaId,
        'mensaje' => 'Lista agendada para el ' . date('d/m/Y', strtotime($fecha)) . ' a las ' . $hora . '.',
        'lista'   => [
            'id'            => $listaId,
            'estado'        => 'activa',
            'fecha_deseada' => $fecha,
            'hora'          => $hora,
            'mayorista'     => $mayoristaNombre,
            'lineas'        => count($items),
            'items'         => array_map(
                static fn (array $i): array => [
                    'producto_uuid' => $i['producto_uuid'],
                    'nombre'        => $i['producto_id_nombre'],
                    'cantidad'      => $i['cantidad'],
                ],
                $items,
            ),
        ],
    ]);
}

if (preg_match('#^/agendar/(\d+)$#', $rutaModulo, $partes) === 1 && $metodoModulo === 'DELETE') {
    $listaId = (int) $partes[1];

    $q = $pdoModulo->prepare('SELECT estado FROM pedidos_programados WHERE id = ? AND comercio_id = ? LIMIT 1');
    $q->execute([$listaId, $comercioIdModulo]);
    $estadoActual = $q->fetchColumn();

    if ($estadoActual === false) {
        fallo('Esa lista no existe o no es tuya.', 404, 'NO_ENCONTRADA');
    }

    if ((string) $estadoActual !== 'cancelada') {
        $pdoModulo->prepare("UPDATE pedidos_programados SET estado = 'cancelada' WHERE id = ? AND comercio_id = ?")
            ->execute([$listaId, $comercioIdModulo]);
    }

    responder(['ok' => true, 'id' => $listaId, 'estado' => 'cancelada', 'mensaje' => 'Lista cancelada.']);
}

if (preg_match('#^/agendar/(\d+)/estado$#', $rutaModulo, $partes) === 1 && $metodoModulo === 'POST') {
    $listaId = (int) $partes[1];
    $estado = (string) (api_cuerpo()['estado'] ?? '');

    if (!in_array($estado, ['activa', 'pausada'], true)) {
        fallo('Solo puedes pausar o reactivar una lista. Para cancelarla, bórrala.', 422, 'ESTADO_INVALIDO');
    }

    $q = $pdoModulo->prepare('SELECT estado FROM pedidos_programados WHERE id = ? AND comercio_id = ? LIMIT 1');
    $q->execute([$listaId, $comercioIdModulo]);
    $estadoActual = $q->fetchColumn();

    if ($estadoActual === false) {
        fallo('Esa lista no existe o no es tuya.', 404, 'NO_ENCONTRADA');
    }

    if ((string) $estadoActual === 'cancelada') {
        fallo('Una lista cancelada ya no se puede reactivar. Crea una nueva.', 422, 'CANCELADA');
    }

    $pdoModulo->prepare('UPDATE pedidos_programados SET estado = ? WHERE id = ? AND comercio_id = ?')
        ->execute([$estado, $listaId, $comercioIdModulo]);

    responder([
        'ok'      => true,
        'id'      => $listaId,
        'estado'  => $estado,
        'mensaje' => $estado === 'pausada' ? 'Lista pausada.' : 'Lista reactivada.',
    ]);
}

return;
