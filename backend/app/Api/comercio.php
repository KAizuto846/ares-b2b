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
        || preg_match('#^/agendar/\d+(/estado)?$#', $r) === 1
        || $r === '/anuncios/publicaciones'
        || $r === '/anuncios/marketplace'
        || preg_match('#^/anuncios/imagen/\d+$#', $r) === 1
        || $r === '/banners'
        || $r === '/anuncios'
        || $r === '/planes'
        || $r === '/planes/suscribir'
        || preg_match('#^/anuncios/\d+/(visto|clic)$#', $r) === 1;
};

if (!$esRutaPropia($rutaModulo)) {
    return;
}

// /explorar sirve a todos los roles (es la casa de la SPA); el resto es solo comercio.
$pdoModulo = api_pdo();
$comercioIdModulo = api_comercio_id();

// Rutas compartidas por todos los roles autenticados (sin perfil comercio).
$rutasComunes = ['/banners', '/anuncios', '/planes', '/planes/suscribir', '/anuncios/marketplace'];
if ($rutaModulo === '/anuncios/publicaciones' || preg_match('#^/anuncios/imagen/\d+$#', $rutaModulo) === 1) {
    // El mayorista publica y consulta; la imagen la ve cualquier cuenta activa.
    api_exigir('mayorista', 'comercio', 'repartidor', 'admin');
} elseif ($rutaModulo !== '/explorar' && !in_array($rutaModulo, $rutasComunes, true)) {
    api_exigir('comercio');

    if ($comercioIdModulo <= 0) {
        fallo('Tu cuenta no tiene perfil de comercio. Complétalo en Mi perfil.', 409, 'SIN_PERFIL');
    }
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

    // Cifras del día (para el mayorista y el comercio) — se calculan primero.
    $pedidosHoy = ['pedidos' => 0, 'monto' => 0.0];
    try {
        if ($rolModulo === 'mayorista') {
            $q = $pdoModulo->prepare(
                "SELECT COUNT(*), COALESCE(SUM(total), 0) FROM pedidos WHERE mayorista_id = ?
                  AND DATE(created_at) = CURDATE() AND estado NOT IN ('cancelado','rechazado')"
            );
            $q->execute([$perfilId('mayoristas_perfil', $usuarioIdModulo)]);
            $filaHoy = $q->fetch(PDO::FETCH_NUM) ?: [0, 0];
            $pedidosHoy['pedidos'] = (int) $filaHoy[0];
            $pedidosHoy['monto'] = (float) $filaHoy[1];
        } elseif ($rolModulo === 'comercio') {
            $q = $pdoModulo->prepare(
                "SELECT COUNT(*), COALESCE(SUM(total), 0) FROM pedidos WHERE comercio_id = ?
                  AND DATE(created_at) = CURDATE() AND estado <> 'cancelado'"
            );
            $q->execute([$comercioIdModulo]);
            $filaHoy = $q->fetch(PDO::FETCH_NUM) ?: [0, 0];
            $pedidosHoy['pedidos'] = (int) $filaHoy[0];
            $pedidosHoy['monto'] = (float) $filaHoy[1];
        }
    } catch (\Throwable $e) {
        error_log('[ares-api] explorar pedidosHoy: ' . $e->getMessage());
    }

    try {
        if ($rolModulo === 'comercio') {
            // Cifras del día en fichas gráficas: pedidos en curso, pedidos de hoy,
            // monto de hoy y portafolio guardado.
            $q = $pdoModulo->prepare(
                "SELECT COUNT(*) FROM pedidos WHERE comercio_id = ?
                  AND estado IN ('pendiente_aceptacion','buscando_repartidor','en_camino')"
            );
            $q->execute([$comercioIdModulo]);
            $metricas[] = [
                'valor'    => (string) (int) $q->fetchColumn(),
                'etiqueta' => 'En curso',
                'nota'     => 'pedidos en movimiento',
                'href'     => '/pedidos',
            ];
            $metricas[] = [
                'valor'    => (string) (int) $pedidosHoy['pedidos'],
                'etiqueta' => 'Pedidos hoy',
                'nota'     => 'solicitados el día de hoy',
                'href'     => '/pedidos',
            ];
            $metricas[] = [
                'valor'    => '$' . number_format((float) $pedidosHoy['monto'], 2),
                'etiqueta' => 'Comprado hoy',
                'nota'     => 'monto solicitado hoy',
                'href'     => '/finanzas',
            ];
            // Portafolio se consulta aquí mismo (el resumen de globos va después).
            try {
                $q = $pdoModulo->prepare('SELECT COUNT(*) FROM favoritos WHERE comercio_id = ?');
                $q->execute([$comercioIdModulo]);
                $metricas[] = [
                    'valor'    => (string) (int) $q->fetchColumn(),
                    'etiqueta' => 'Portafolio',
                    'nota'     => 'productos guardados',
                    'href'     => '/portafolio',
                ];
            } catch (\Throwable $e) {
                error_log('[ares-api] explorar métricas portafolio: ' . $e->getMessage());
            }
        } elseif ($rolModulo === 'mayorista') {
            // Sin métricas sueltas: las cifras del día viven dentro de la tarjeta «Pedidos».
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
            ['href' => '/finanzas', 'titulo' => 'Finanzas', 'texto' => 'Ventas, comisiones y lo que te queda.', 'icono' => 'finanzas'],
            ['href' => '/pedidos', 'titulo' => 'Pedidos', 'texto' => 'Lo que te acaban de pedir.', 'icono' => 'pedidos'],
            ['href' => '/productos', 'titulo' => 'Catálogo', 'texto' => 'Tu catálogo, precios y existencias.', 'icono' => 'productos'],
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
    // El botón principal pasa a Mensajes para todos los roles; comercio
    // conserva el resto de herramientas, mayorista/admin solo Mensajes.
    $atajos = $rolModulo === 'comercio' ? [
        ['href' => '/mensajes', 'titulo' => 'Mensajes', 'texto' => 'Habla con mayoristas y soporte.', 'icono' => 'mensajes'],
        ['href' => '/pos', 'titulo' => 'Caja', 'texto' => 'Cobrar en mostrador.', 'icono' => 'pos'],
        ['href' => '/pos/inventario', 'titulo' => 'Inventario', 'texto' => 'Existencias y altas de producto.', 'icono' => 'inventario'],
        ['href' => '/pos/ventas', 'titulo' => 'Ventas', 'texto' => 'El historial del día.', 'icono' => 'ventas'],
        ['href' => '/pedidos', 'titulo' => 'Pedidos', 'texto' => 'El seguimiento de tus compras.', 'icono' => 'pedidos'],
    ] : [];

    // ------------------------------------------------ resumen (globos)
    $sinLeer = 0;
    $enPortafolio = 0;
    $enCurso = 0;
    $detalle = [];

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
        } elseif ($rolModulo === 'mayorista') {
            // Pedidos del día en curso con su estado para la ficha «En curso».
            $q = $pdoModulo->prepare(
                "SELECT estado, COUNT(*) AS cuantos FROM pedidos
                  WHERE mayorista_id = ?
                    AND estado IN ('pendiente_aceptacion','aceptado','preparando','listo_para_recoger','buscando_repartidor','en_camino')
                  GROUP BY estado"
            );
            $q->execute([$perfilId('mayoristas_perfil', $usuarioIdModulo)]);
            foreach ($q->fetchAll() ?: [] as $fila) {
                $enCurso += (int) $fila['cuantos'];
                $detalle[] = ['estado' => (string) $fila['estado'], 'cuantos' => (int) $fila['cuantos']];
            }
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

    // (las cifras del día ya se calcularon arriba, junto a las métricas)

    // Preferencias de la encuesta: categorías de interés para el widget.
    $q = $pdoModulo->prepare(
        'SELECT c.id, c.nombre FROM usuario_preferencias_categorias up
         JOIN categorias c ON c.id = up.categoria_id
         WHERE up.usuario_id = ? AND up.interes = 1 ORDER BY c.nombre LIMIT 8'
    );
    $q->execute([$usuarioIdModulo]);
    $preferencias = array_map(static fn (array $c): array => [
        'id' => (int) $c['id'], 'nombre' => (string) $c['nombre'],
    ], $q->fetchAll() ?: []);

    responder([
        'ok'       => true,
        'nombre'   => $nombreModulo,
        'rol'      => $rolModulo,
        'metricas' => $metricas,
        'accesos'  => $accesos,
        'atajos'   => $atajos,
        'resumen'  => ['mensajes' => $sinLeer, 'portafolio' => $enPortafolio, 'pedidos' => $enCurso, 'detalle' => $detalle],
        'pedidos_hoy' => $pedidosHoy,
        'preferencias' => $preferencias,
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

// ---------------------------------------------------------------- banners
// GET /banners — carrusel del explore. Público para cuentas activas.
if ($rutaModulo === '/banners' && $metodoModulo === 'GET') {
    $hoy = date('Y-m-d');

    $banners = array_map(static fn (array $b): array => [
        'id'     => (int) $b['id'],
        'titulo' => (string) $b['titulo'],
        'texto'  => (string) ($b['texto'] ?? ''),
        'imagen' => $b['imagen'] !== null ? '/storage/banners/' . (string) $b['imagen'] : null,
        'color'  => (string) $b['color'],
        'href'   => (string) $b['href'],
    ], api_pdo()->query(
        "SELECT * FROM banners WHERE activo = 1
           AND (desde IS NULL OR desde <= '{$hoy}') AND (hasta IS NULL OR hasta >= '{$hoy}')
         ORDER BY orden, id LIMIT 6"
    )->fetchAll() ?: []);

    responder(['ok' => true, 'banners' => $banners]);
}

// ---------------------------------------------------------------- anuncios
// GET /anuncios — anuncio pendiente para el usuario (control de frecuencia).
// POST /anuncios/{id}/visto — marca impresión o clic.
// GET  /anuncios/marketplace — 20 activos para el inicio de las cuentas de
//      comercio, ordenados por monto pagado (desc) y fecha de pago (asc).
// GET  /anuncios/publicaciones — anuncios del mayorista en sesión.
if ($rutaModulo === '/anuncios' && $metodoModulo === 'GET') {
    $hoy = date('Y-m-d');
    $uid = api_uid();
    $rol = api_rol();

    $stmt = api_pdo()->query(
        "SELECT * FROM anuncios WHERE activo = 1
           AND (desde IS NULL OR desde <= '{$hoy}') AND (hasta IS NULL OR hasta >= '{$hoy}')
         ORDER BY id DESC LIMIT 20"
    );

    $elegido = null;

    foreach ($stmt->fetchAll() ?: [] as $a) {
        // Segmento por rol: roles="comercio,mayorista" o null para todos.
        $roles = $a['roles'] !== null ? array_map('trim', explode(',', (string) $a['roles'])) : [];

        if ($roles !== [] && !in_array($rol, $roles, true)) {
            continue;
        }

        // Frecuencia: impresiones ya vistas por este usuario.
        $q = api_pdo()->prepare('SELECT COUNT(*) FROM anuncio_impresiones WHERE anuncio_id = ? AND usuario_id = ?');
        $q->execute([(int) $a['id'], $uid]);

        if ((int) $q->fetchColumn() >= (int) $a['max_impresiones']) {
            continue;
        }

        $elegido = $a;
        break;
    }

    responder([
        'ok' => true,
        'anuncio' => $elegido === null ? null : [
            'id'     => (int) $elegido['id'],
            'titulo' => (string) $elegido['titulo'],
            'cuerpo' => (string) $elegido['cuerpo'],
            'imagen' => $elegido['imagen'] !== null ? '/storage/anuncios/' . (string) $elegido['imagen'] : null,
            'cta_href'  => $elegido['cta_href'] !== null ? (string) $elegido['cta_href'] : null,
            'cta_texto' => $elegido['cta_texto'] !== null ? (string) $elegido['cta_texto'] : null,
        ],
    ]);
}

if (preg_match('#^/anuncios/(\d+)/(visto|clic)$#', $rutaModulo, $m) === 1 && $metodoModulo === 'POST') {
    api_exigir('comercio', 'mayorista', 'repartidor');

    api_pdo()->prepare(
        'INSERT INTO anuncio_impresiones (anuncio_id, usuario_id, clic)
         SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM anuncios WHERE id = ?)'
    )->execute([(int) $m[1], api_uid(), $m[2] === 'clic' ? 1 : 0, (int) $m[1]]);

    // El contador de clics del dueño del anuncio se lleva en la fila.
    if ($m[2] === 'clic') {
        api_pdo()->prepare('UPDATE anuncios SET clics = clics + 1 WHERE id = ?')->execute([(int) $m[1]]);
    }

    responder(['ok' => true]);
}

// GET /anuncios/marketplace — sección de anuncios del inicio del comercio.
if ($rutaModulo === '/anuncios/marketplace' && $metodoModulo === 'GET') {
    $hoy = date('Y-m-d');

    // Se archiva lo vencido y se publica lo activo, en un solo viaje.
    api_pdo()->prepare(
        "UPDATE anuncios SET estado = 'caducado', activo = 0
          WHERE estado = 'activo' AND vence_el IS NOT NULL AND vence_el < ?"
    )->execute([$hoy]);

    $stmt = api_pdo()->prepare(
        "SELECT a.id, a.titulo, a.cuerpo, a.imagen, a.monto_pagado, a.vence_el,
                m.nombre_comercial AS mayorista, m.uuid AS mayorista_uuid
           FROM anuncios a
           LEFT JOIN mayoristas_perfil m ON m.id = a.mayorista_id
          WHERE a.estado = 'activo' AND a.vence_el >= ?
          ORDER BY a.monto_pagado DESC, a.pagado_en ASC, a.id ASC
          LIMIT 20"
    );
    $stmt->execute([$hoy]);

    $publicaciones = array_map(static fn (array $a): array => [
        'id'             => (int) $a['id'],
        'titulo'         => (string) $a['titulo'],
        'cuerpo'         => (string) $a['cuerpo'],
        'imagen'         => $a['imagen'] !== null ? '/anuncios/imagen/' . (int) $a['id'] : null,
        'monto_pagado'   => (float) $a['monto_pagado'],
        'vence_el'       => (string) ($a['vence_el'] ?? ''),
        'mayorista'      => (string) ($a['mayorista'] ?? ''),
        'mayorista_uuid' => (string) ($a['mayorista_uuid'] ?? ''),
    ], $stmt->fetchAll() ?: []);

    responder(['ok' => true, 'anuncios' => $publicaciones]);
}

// GET /anuncios/publicaciones — anuncios del mayorista en sesión.
if ($rutaModulo === '/anuncios/publicaciones' && $metodoModulo === 'GET') {
    $mayoristaId = api_mayorista_id();
    $hoy = new DateTimeImmutable('today');

    $stmt = api_pdo()->prepare(
        "SELECT id, titulo, cuerpo, imagen, monto_pagado, estado, dias_contratados,
                vence_el, clics, created_at
           FROM anuncios WHERE mayorista_id = ?
          ORDER BY FIELD(estado, 'activo', 'pendiente_pago', 'caducado'), COALESCE(vence_el, created_at) DESC, id DESC"
    );
    $stmt->execute([$mayoristaId]);

    $publicaciones = array_map(static function (array $a) use ($hoy): array {
        $diasTotales = max(1, (int) $a['dias_contratados']);
        $vence = $a['vence_el'] !== null ? new DateTimeImmutable((string) $a['vence_el']) : null;
        $diasActivos = null;

        if ($vence !== null) {
            $trascurridos = $diasTotales - (int) $hoy->diff($vence)->format('%r%a');
            $diasActivos = min($diasTotales, max(0, $trascurridos));
        }

        return [
            'id'          => (int) $a['id'],
            'titulo'      => (string) $a['titulo'],
            'cuerpo'      => (string) $a['cuerpo'],
            'imagen'      => $a['imagen'] !== null ? '/anuncios/imagen/' . (int) $a['id'] : null,
            'monto'       => (float) $a['monto_pagado'],
            'estado'      => (string) $a['estado'],
            'dias'        => ['lleva' => $diasActivos ?? 0, 'total' => $diasTotales],
            'vence_el'    => $vence !== null ? $vence->format('Y-m-d') : null,
            'clics'       => (int) $a['clics'],
        ];
    }, $stmt->fetchAll() ?: []);

    responder(['ok' => true, 'anuncios' => $publicaciones]);
}

// GET /anuncios/imagen/{id} — imagen guardada del anuncio (solo cuentas activas).
if (preg_match('#^/anuncios/imagen/(\d+)$#', $rutaModulo, $mImg) === 1 && $metodoModulo === 'GET') {
    $stmt = api_pdo()->prepare('SELECT imagen FROM anuncios WHERE id = ? LIMIT 1');
    $stmt->execute([(int) $mImg[1]]);
    $ruta = (string) ($stmt->fetchColumn() ?: '');

    if ($ruta === '') {
        fallo('Este anuncio no tiene imagen.', 404, 'SIN_IMAGEN');
    }

    $base = realpath(__DIR__ . '/../../storage');
    $absoluta = realpath(__DIR__ . '/../../storage/anuncios/' . basename($ruta));

    if ($base === false || $absoluta === false || !str_starts_with($absoluta, $base . '/') || !is_file($absoluta)) {
        fallo('La imagen del anuncio ya no está disponible.', 404, 'SIN_IMAGEN');
    }

    $tipos = ['png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'webp' => 'image/webp'];
    $extension = strtolower((string) pathinfo($absoluta, PATHINFO_EXTENSION));

    header_remove('Content-Type');
    header('Content-Type: ' . ($tipos[$extension] ?? 'application/octet-stream'));
    header('Content-Length: ' . (string) filesize($absoluta));
    header('Cache-Control: private, max-age=3600');
    readfile($absoluta);
    exit;
}

// POST /anuncios — alta de anuncio del mayorista (paso de pago simulado).
if ($rutaModulo === '/anuncios/publicaciones' && $metodoModulo === 'POST') {
    api_exigir('mayorista');
    api_exigir_flag('banner');   // flag que el seed pone en premium
    $c = api_cuerpo();
    $titulo = trim((string) ($c['titulo'] ?? ''));
    $cuerpo = trim((string) ($c['cuerpo'] ?? ''));
    $metodoPago = (string) ($c['metodo_pago'] ?? '');
    $planClave = (int) ($c['plan'] ?? 0);
    $dataUrl = (string) ($c['imagen'] ?? '');

    $planes = [400 => 4, 1200 => 12, 2000 => 21, 3000 => 31];

    if ($titulo === '' || mb_strlen($titulo) < 5) {
        fallo('Escribe un título de al menos 5 letras para tu anuncio.', 422, 'TITULO');
    }

    if ($cuerpo === '' || mb_strlen($cuerpo) < 10) {
        fallo('Describe tu anuncio con al menos 10 letras.', 422, 'CUERPO');
    }

    if (!isset($planes[$planClave])) {
        fallo('Elige un plan de anuncio válido.', 422, 'PLAN');
    }

    if (!in_array($metodoPago, ['efectivo', 'tarjeta'], true)) {
        fallo('Elige un método de pago: efectivo o tarjeta.', 422, 'METODO_PAGO');
    }

    $mayoristaId = api_mayorista_id();
    $dias = $planes[$planClave];
    $referencia = 'ANU-' . strtoupper(bin2hex(random_bytes(5)));

    // Pago con tarjeta (pasarela demo): se acredita al instante y el anuncio
    // arranca hoy. En efectivo queda pendiente hasta que se confirme el pago.
    $activar = $metodoPago === 'tarjeta';

    api_pdo()->prepare(
        "INSERT INTO anuncios
             (mayorista_id, titulo, cuerpo, monto_pagado, pagado_en, estado, dias_contratados,
              vence_el, activo, desde, hasta, roles)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'comercio')"
    )->execute([
        $mayoristaId,
        mb_substr($titulo, 0, 120),
        mb_substr($cuerpo, 0, 400),
        $activar ? (float) $planClave : 0.0,
        $activar ? date('Y-m-d H:i:s') : null,
        $activar ? 'activo' : 'pendiente_pago',
        $dias,
        $activar ? date('Y-m-d', strtotime('+' . $dias . ' days')) : null,
        $activar ? 1 : 0,
        $activar ? date('Y-m-d') : null,
        $activar ? date('Y-m-d', strtotime('+' . $dias . ' days')) : null,
    ]);

    $id = (int) api_pdo()->lastInsertId();

    // La imagen del anuncio (data URL) va a storage/anuncios/{id}.{ext}.
    $imagenRuta = null;
    if ($dataUrl !== '') {
        if (!preg_match('#^data:image/(png|jpe?g|webp);base64,(.+)$#is', $dataUrl, $partes)) {
            fallo('La imagen del anuncio no es válida (PNG, JPG o WebP).', 422, 'IMAGEN');
        }

        $binario = base64_decode(preg_replace('/\s+/', '', $partes[2]) ?? '', true);
        if ($binario === false || $binario === '') {
            fallo('La imagen llegó dañada. Vuelve a elegirla.', 422, 'IMAGEN');
        }

        if (strlen($binario) > 2 * 1024 * 1024) {
            fallo('La imagen no puede pesar más de 2 MB.', 422, 'IMAGEN_GRANDE');
        }

        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $extensiones = ['image/png' => 'png', 'image/jpeg' => 'jpg', 'image/webp' => 'webp'];
        $mime = (string) $finfo->buffer($binario);

        if (!isset($extensiones[$mime])) {
            fallo('Ese archivo no es una imagen.', 422, 'IMAGEN_FORMATO');
        }

        $dir = __DIR__ . '/../../storage/anuncios';
        if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
            fallo('No se pudo preparar el almacén de imágenes.', 500, 'ALMACEN');
        }

        $imagenRuta = (string) $id . '.' . $extensiones[$mime];
        if (file_put_contents($dir . '/' . $imagenRuta, $binario) === false) {
            fallo('No se pudo guardar la imagen del anuncio.', 500, 'ALMACEN');
        }

        api_pdo()->prepare('UPDATE anuncios SET imagen = ? WHERE id = ?')->execute([$imagenRuta, $id]);
    }

    responder([
        'ok'         => true,
        'id'         => $id,
        'estado'     => $activar ? 'activo' : 'pendiente_pago',
        'referencia' => $referencia,
        'vence_el'   => $activar ? date('Y-m-d', strtotime('+' . $dias . ' days')) : null,
        'mensaje'    => $activar
            ? 'Pago acreditado: tu anuncio ya está publicado en el inicio de los comercios.'
            : 'Anuncio reservado. Se publica en cuanto se acredite tu pago en efectivo.',
    ]);
}

// ---------------------------------------------------------------- planes
// GET /planes — catálogo de planes (para la pantalla Premium).
if ($rutaModulo === '/planes' && $metodoModulo === 'GET') {
    $planes = array_map(static fn (array $p): array => [
        'clave'       => (string) $p['clave'],
        'nombre'      => (string) $p['nombre'],
        'descripcion' => (string) ($p['descripcion'] ?? ''),
        'precio_mensual' => (float) $p['precio_mensual'],
        'flags'       => json_decode((string) $p['flags'], true) ?: [],
    ], api_pdo()->query('SELECT * FROM planes ORDER BY precio_mensual')->fetchAll() ?: []);

    // Suscripción vigente del usuario.
    $stmt = api_pdo()->prepare(
        "SELECT s.estado, s.desde, s.hasta, p.clave, p.nombre
         FROM suscripciones s JOIN planes p ON p.id = s.plan_id
         WHERE s.usuario_id = ? AND s.estado = 'activa' AND (s.hasta IS NULL OR s.hasta >= CURDATE()) LIMIT 1"
    );
    $stmt->execute([api_uid()]);
    $vigente = $stmt->fetch() ?: null;

    responder([
        'ok' => true,
        'planes' => $planes,
        'suscripcion' => $vigente === null ? null : [
            'plan' => (string) $vigente['clave'],
            'nombre' => (string) $vigente['nombre'],
            'hasta' => $vigente['hasta'] !== null ? api_fecha((string) $vigente['hasta']) : null,
        ],
    ]);
}

// POST /planes/suscribir — activa Premium con cobro simulado de la pasarela.
if ($rutaModulo === '/planes/suscribir' && $metodoModulo === 'POST') {
    api_exigir('comercio', 'mayorista');

    $clave = (string) (api_cuerpo()['plan'] ?? '');

    $stmt = api_pdo()->prepare('SELECT id, nombre, precio_mensual FROM planes WHERE clave = ? LIMIT 1');
    $stmt->execute([$clave]);
    $plan = $stmt->fetch();

    if ($plan === false) {
        fallo('Ese plan no existe.', 404, 'NO_ENCONTRADO');
    }

    $uid = api_uid();
    $hasta = date('Y-m-d', strtotime('+1 month'));
    $referencia = 'PREM-' . strtoupper(substr(md5($uid . microtime()), 0, 12));

    api_pdo()->prepare(
        "INSERT INTO suscripciones (usuario_id, plan_id, estado, desde, hasta, pago_referencia)
         VALUES (?, ?, 'activa', CURDATE(), ?, ?)
         ON DUPLICATE KEY UPDATE plan_id = VALUES(plan_id), estado = 'activa', desde = CURDATE(),
             hasta = VALUES(hasta), pago_referencia = VALUES(pago_referencia)"
    )->execute([$uid, (int) $plan['id'], $hasta, $referencia]);

    responder([
        'ok' => true,
        'mensaje' => sprintf('Plan %s activo hasta %s (cobro demo de $%s).',
            (string) $plan['nombre'], $hasta, number_format((float) $plan['precio_mensual'], 2)),
        'referencia' => $referencia,
    ]);
}
