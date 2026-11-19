<?php

declare(strict_types=1);

/**
 * Buscador para la SPA: filtros, puntos del mapa, categorías y foto pública.
 *
 * La pantalla PHP (app/Views/busqueda/index.php) resuelve todo con un GET y
 * mucho JavaScript; aquí se expone lo mismo como datos. Nada de la lógica se
 * reimplementa: cada consulta pasa por BusquedaService, así que la geocerca
 * (RN-15), el tope de radio (RADIO_MAX), la lista blanca de órdenes, el caché de
 * 30 s y el tope de candidatos del repositorio se aplican igual que en el panel.
 *
 * /api/buscar ya existe en public/api.php y se respeta tal cual. Lo que faltaba
 * y se añade aquí:
 *   GET /busqueda/productos          → mismos campos que /api/buscar + categoria_id y foto
 *   GET /busqueda/categorias         → categorías activas para el filtro
 *   GET /busqueda/filtros            → radios, órdenes y categorías de una vez
 *   GET /busqueda/mapa               → un punto por mayorista, agregado en PHP
 *   GET /busqueda/foto/{uuid}        → foto del producto para las tarjetas
 *
 * /busqueda/productos no duplica /api/buscar: delega en el mismo servicio y
 * devuelve el mismo contrato (resultados, total, page, per_page, paginas), pero
 * acepta categoria_id —que /api/buscar no lee— porque su ruta vive en
 * public/api.php, que ningún módulo puede editar.
 *
 * Contrato: {ok:true, ...} o {ok:false, error:{code, message}}.
 */

require_once __DIR__ . '/_comun.php';

use App\Core\Cache;
use App\Modules\Busqueda\BusquedaRepository;
use App\Modules\Busqueda\BusquedaService;

/** Servicio compartido dentro de la petición. */
function bus_servicio(): BusquedaService
{
    static $servicio = null;

    if ($servicio === null) {
        $pdo = api_pdo();
        $servicio = new BusquedaService(
            new BusquedaRepository($pdo),
            new Cache(__DIR__ . '/../../storage/cache'),
            $pdo
        );
    }

    return $servicio;
}

/**
 * Filtros desde la query string.
 *
 * Sin coordenadas se usa el centro de la zona piloto, igual que el panel. El
 * radio y el orden NO se validan aquí: los acota BusquedaService (0.5–30 km) y
 * un orden desconocido cae a «distancia» en silencio, como en el PHP.
 *
 * @return array<string, mixed>
 */
function bus_filtros(int $perPageDefecto = BusquedaService::PER_PAGE_DEFAULT): array
{
    $lat = (float) ($_GET['lat'] ?? 0);
    $lng = (float) ($_GET['lng'] ?? 0);

    if ($lat === 0.0 && $lng === 0.0) {
        $lat = 19.4326;
        $lng = -99.1332;
    }

    return [
        'q'            => api_q('q'),
        'categoria_id' => api_qint('categoria_id', 0),
        'lat'          => $lat,
        'lng'          => $lng,
        'radio'        => api_q('radio', (string) BusquedaService::RADIO_DEFAULT),
        'orden'        => api_q('orden', 'distancia'),
        'page'         => api_qint('page', 1, 1, 5000),
        'per_page'     => api_qint('per_page', $perPageDefecto, 1, BusquedaService::PER_PAGE_MAX),
    ];
}

/**
 * Resultado del servicio o fallo con el código del dominio.
 *
 * @param array{ok:bool, error?:array{code:string,message:string}, data?:array<string,mixed>} $resultado
 * @return array<string,mixed>
 */
function bus_datos(array $resultado): array
{
    if (!$resultado['ok']) {
        $codigo = (string) ($resultado['error']['code'] ?? 'ERROR');
        $estado = $codigo === 'FUERA_DE_COBERTURA' ? 422 : 400;

        fallo((string) ($resultado['error']['message'] ?? 'No se pudo buscar.'), $estado, $codigo);
    }

    return (array) ($resultado['data'] ?? []);
}

/**
 * uuid => URL de la foto, solo para los productos que sí tienen una.
 *
 * @param array<int,array<string,mixed>> $resultados
 * @return array<string,string>
 */
function bus_fotos(array $resultados): array
{
    $uuids = [];

    foreach ($resultados as $fila) {
        $uuid = (string) ($fila['uuid'] ?? '');

        if ($uuid !== '') {
            $uuids[$uuid] = $uuid;
        }
    }

    if ($uuids === []) {
        return [];
    }

    $marcas = implode(',', array_fill(0, count($uuids), '?'));
    $stmt = api_pdo()->prepare(
        "SELECT p.uuid,
                (SELECT i.ruta FROM producto_imagenes i
                  WHERE i.producto_id = p.id ORDER BY i.orden, i.id LIMIT 1) AS ruta
           FROM productos p
          WHERE p.uuid IN ({$marcas})"
    );
    $stmt->execute(array_values($uuids));

    $fotos = [];

    foreach ($stmt->fetchAll() as $fila) {
        if (empty($fila['ruta'])) {
            continue;
        }

        $fotos[(string) $fila['uuid']] = '/api/busqueda/foto/' . (string) $fila['uuid'];
    }

    return $fotos;
}

$busRuta = (string) (api_ctx()['ruta'] ?? '/');
$busMetodo = strtoupper((string) (api_ctx()['metodo'] ?? 'GET'));

// Este módulo solo atiende /busqueda*. Si la ruta es de otro módulo, devuelve
// el control para que el siguiente archivo de app/Api pruebe suerte.
if (!str_starts_with($busRuta, '/busqueda')) {
    return;
}

if ($busMetodo !== 'GET') {
    fallo('El buscador solo admite consultas GET.', 405, 'METODO');
}

// Buscar es de lectura, pero no anónimo: se pide sesión como en el panel.
if (api_uid() <= 0) {
    fallo('Inicia sesión para buscar productos.', 401, 'SESION');
}

$busPdo = api_pdo();

// ------------------------------------------------------------------ productos
if ($busRuta === '/busqueda/productos') {
    $filtros = bus_filtros();
    $datos = bus_datos(bus_servicio()->buscar($filtros));
    $fotos = bus_fotos((array) ($datos['resultados'] ?? []));

    $datos['resultados'] = array_map(
        static function (array $fila) use ($fotos): array {
            $fila['foto'] = $fotos[(string) $fila['uuid']] ?? null;
            $fila['categoria_id'] = (int) ($fila['categoria_id'] ?? 0);

            return $fila;
        },
        (array) ($datos['resultados'] ?? [])
    );

    $datos['categoria_id'] = (int) ($filtros['categoria_id'] ?: 0);
    $datos['q'] = (string) $filtros['q'];

    responder(['ok' => true] + $datos);
}

// ------------------------------------------------------------------ categorías
if ($busRuta === '/busqueda/categorias') {
    $categorias = array_map(
        static fn (array $c): array => [
            'id'     => (int) $c['id'],
            'nombre' => (string) $c['nombre'],
        ],
        bus_servicio()->categorias()
    );

    responder(['ok' => true, 'categorias' => $categorias]);
}

// ------------------------------------------------------------------ filtros
if ($busRuta === '/busqueda/filtros') {
    $ordenes = [
        ['valor' => 'distancia',   'texto' => 'Más cercano'],
        ['valor' => 'precio_asc',  'texto' => 'Menor precio'],
        ['valor' => 'precio_desc', 'texto' => 'Mayor precio'],
        ['valor' => 'reputacion',  'texto' => 'Mejor calificado'],
    ];

    responder([
        'ok'            => true,
        'radios'        => [2, 5, 10, 20, 30],
        'radio_max'     => BusquedaService::RADIO_MAX,
        'radio_default' => BusquedaService::RADIO_DEFAULT,
        'per_page'      => BusquedaService::PER_PAGE_DEFAULT,
        'ordenes'       => $ordenes,
        'categorias'    => array_map(
            static fn (array $c): array => [
                'id'     => (int) $c['id'],
                'nombre' => (string) $c['nombre'],
            ],
            bus_servicio()->categorias()
        ),
    ]);
}

// ------------------------------------------------------------------ mapa
// Un punto por mayorista dentro del radio. Los resultados ya vienen filtrados
// por BusquedaService (geocerca, radio, texto, categoría y orden); aquí solo se
// agrupan por mayorista para no pintar un marcador por producto.
if ($busRuta === '/busqueda/mapa') {
    $filtros = bus_filtros(BusquedaService::PER_PAGE_MAX);
    $filtros['page'] = 1;

    $porMayorista = [];
    $total = 0;
    $paginas = 0;
    $radio = (float) BusquedaService::RADIO_DEFAULT;
    $orden = 'distancia';

    // El repositorio nunca devuelve más de MAX_CANDIDATOS filas, así que dos o
    // tres páginas de PER_PAGE_MAX cubren el universo completo de la búsqueda.
    for ($pagina = 1; $pagina <= 4; $pagina++) {
        $filtros['page'] = $pagina;
        $datos = bus_datos(bus_servicio()->buscar($filtros));

        $total = (int) ($datos['total'] ?? 0);
        $paginas = (int) ($datos['paginas'] ?? 0);
        $radio = (float) ($datos['radio'] ?? $radio);
        $orden = (string) ($datos['orden'] ?? $orden);

        foreach ((array) ($datos['resultados'] ?? []) as $fila) {
            $mayorista = (array) ($fila['mayorista'] ?? []);
            $uuid = (string) ($mayorista['uuid'] ?? '');

            if ($uuid === '') {
                continue;
            }

            $distancia = (float) ($fila['distancia_km'] ?? 0);
            $precio = (float) ($fila['precio_base'] ?? 0);

            if (!isset($porMayorista[$uuid])) {
                $porMayorista[$uuid] = [
                    'uuid'         => $uuid,
                    'nombre'       => (string) ($mayorista['nombre'] ?? ''),
                    'lat'          => (float) ($mayorista['latitud'] ?? 0),
                    'lng'          => (float) ($mayorista['longitud'] ?? 0),
                    'productos'    => 0,
                    'distancia_km' => $distancia,
                    'monto_minimo' => (float) ($mayorista['monto_minimo'] ?? 0),
                    'precio_desde' => $precio,
                    'reputacion'   => $mayorista['reputacion'] ?? null,
                    'categoria'    => (string) ($fila['categoria'] ?? ''),
                ];
            }

            $porMayorista[$uuid]['productos']++;
            $porMayorista[$uuid]['distancia_km'] = min($porMayorista[$uuid]['distancia_km'], $distancia);
            $porMayorista[$uuid]['precio_desde'] = min($porMayorista[$uuid]['precio_desde'], $precio);
        }

        if ($paginas <= 1 || $pagina >= $paginas) {
            break;
        }
    }

    $puntos = array_values($porMayorista);

    usort($puntos, static function (array $a, array $b): int {
        if ($a['distancia_km'] === $b['distancia_km']) {
            return strcmp((string) $a['nombre'], (string) $b['nombre']);
        }

        return $a['distancia_km'] <=> $b['distancia_km'];
    });

    foreach ($puntos as $indice => $punto) {
        $puntos[$indice]['distancia_km'] = round((float) $punto['distancia_km'], 2);
        $puntos[$indice]['precio_desde'] = round((float) $punto['precio_desde'], 2);
        $puntos[$indice]['monto_minimo'] = round((float) $punto['monto_minimo'], 2);
    }

    responder([
        'ok'         => true,
        'total'      => $total,
        'mayoristas' => count($puntos),
        'puntos'     => $puntos,
        'centro'     => ['lat' => (float) $filtros['lat'], 'lng' => (float) $filtros['lng']],
        'radio'      => $radio,
        'orden'      => $orden,
        'q'          => (string) $filtros['q'],
        'categoria_id' => (int) ($filtros['categoria_id'] ?: 0),
    ]);
}

// ------------------------------------------------------------------ foto
// Foto pública de un producto para las tarjetas del buscador. /catalogo/imagen
// exige rol mayorista y ser dueño del producto, así que un comercio no puede
// usarla: esta ruta sirve solo la primera imagen de un producto activo y valida
// que el archivo siga dentro de storage/.
if (preg_match('#^/busqueda/foto/([0-9a-fA-F-]{36})$#', $busRuta, $partes) === 1) {
    $stmt = $busPdo->prepare(
        'SELECT (SELECT i.ruta FROM producto_imagenes i
                  WHERE i.producto_id = p.id ORDER BY i.orden, i.id LIMIT 1) AS ruta
           FROM productos p
          WHERE p.uuid = ? AND p.activo = 1 AND p.deleted_at IS NULL
          LIMIT 1'
    );
    $stmt->execute([$partes[1]]);

    $ruta = (string) ($stmt->fetchColumn() ?: '');

    if ($ruta === '') {
        fallo('Este producto no tiene foto.', 404, 'SIN_IMAGEN');
    }

    $base = realpath(__DIR__ . '/../../storage');
    $absoluta = realpath(__DIR__ . '/../../storage/' . $ruta);

    if ($base === false || $absoluta === false || !str_starts_with($absoluta, $base . '/') || !is_file($absoluta)) {
        fallo('La foto ya no está disponible.', 404, 'SIN_IMAGEN');
    }

    $tipos = ['png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'webp' => 'image/webp'];
    $extension = strtolower((string) pathinfo($absoluta, PATHINFO_EXTENSION));

    header_remove('Content-Type');
    header('Content-Type: ' . ($tipos[$extension] ?? 'application/octet-stream'));
    header('Content-Length: ' . (string) filesize($absoluta));
    header('Cache-Control: public, max-age=86400');
    readfile($absoluta);
    exit;
}

fallo('Recurso del buscador no encontrado.', 404, 'NO_ENCONTRADA');
