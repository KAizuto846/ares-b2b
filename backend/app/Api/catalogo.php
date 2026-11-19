<?php

declare(strict_types=1);

/**
 * Catálogo del mayorista en JSON para la SPA: lista con KPIs, alta/edición,
 * escalas de precio por volumen, importación CSV, plantilla descargable y foto.
 *
 * Es el mismo dominio que el panel PHP (backend/app/Views/catalogo/*) pero
 * devuelve datos, no HTML: la validación de producto y el alta de stock siguen
 * pasando por ProductoService, y los precios por PrecioService. Nada se
 * inventa aquí: si una regla falla, la respuesta es 422 con mensaje en español.
 *
 * Toda consulta va filtrada por mayorista_id; un producto de otra cuenta
 * responde 404 igual que uno inexistente, para no filtrar uuids ajenos.
 *
 * Contrato: {ok:true, ...} o {ok:false, error:{code, message}}.
 */

require_once __DIR__ . '/_comun.php';

use App\Core\AuditLogger;
use App\Modules\Auth\UsuarioRepository;
use App\Modules\Catalogo\Excepciones\EscalaInvalidaException;
use App\Modules\Catalogo\PrecioService;
use App\Modules\Catalogo\ProductoRepository;
use App\Modules\Catalogo\ProductoService;

$catRuta = (string) (api_ctx()['ruta'] ?? '/');
$catMetodo = strtoupper((string) (api_ctx()['metodo'] ?? 'GET'));

// El módulo solo atiende /catalogo*. Si la ruta es de otro módulo, devuelve el control.
if (!str_starts_with($catRuta, '/catalogo')) {
    return;
}

api_exigir('mayorista');

$catPdo = api_pdo();
$catUid = api_uid();
$catIp = (string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
$catRepo = new ProductoRepository($catPdo);
$catPrecios = new PrecioService();
$catAuditoria = new AuditLogger($catPdo);
$catServicio = new ProductoService($catRepo, $catAuditoria, $catPdo, $catPrecios);
$catMid = api_mayorista_id();

if ($catMid <= 0) {
    fallo('Tu cuenta no tiene perfil de mayorista.', 403, 'SIN_PERFIL');
}

/** Carpeta (fuera de public/) donde viven las fotos del catálogo. */
if (!defined('CAT_IMAGENES_DIR')) {
    define('CAT_IMAGENES_DIR', __DIR__ . '/../../storage/catalogo');
    define('CAT_MAX_IMAGEN_BYTES', 3 * 1024 * 1024);
    define('CAT_MAX_CSV_BYTES', 5 * 1024 * 1024);
    define('CAT_MAX_CSV_FILAS', 5000);
}

/** Error con campos: el cliente pinta el mensaje junto a cada input. */
function cat_fallo_campos(string $mensaje, array $campos, int $estado = 422, string $codigo = 'DATOS_INVALIDOS'): void
{
    responder([
        'ok'    => false,
        'error' => ['code' => $codigo, 'message' => $mensaje, 'campos' => $campos],
    ], $estado);
}

/** true/false tolerante a 0/1, "true", "on", "sí". */
function cat_bool(mixed $valor, bool $defecto = false): bool
{
    if ($valor === null) {
        return $defecto;
    }

    if (is_bool($valor)) {
        return $valor;
    }

    if (is_numeric($valor)) {
        return (float) $valor !== 0.0;
    }

    return in_array(mb_strtolower(trim((string) $valor)), ['1', 'true', 'si', 'sí', 'on', 'yes'], true);
}

/** Minúsculas y sin acentos, para comparar encabezados y categorías. */
function cat_normalizar(string $texto): string
{
    $texto = mb_strtolower(trim($texto));
    $mapa = ['á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u', 'ü' => 'u', 'ñ' => 'n', 'à' => 'a', 'è' => 'e'];

    return strtr($texto, $mapa);
}

/** URL pública de la foto, con ?v= para que el navegador no cachee la vieja. */
function cat_foto_url(array $p): ?string
{
    if (empty($p['foto'])) {
        return null;
    }

    $version = strtotime((string) ($p['updated_at'] ?? '')) ?: 0;

    return '/api/catalogo/imagen/' . (string) $p['uuid'] . ($version > 0 ? '?v=' . $version : '');
}

/** Fila de `productos` tal como la consume la SPA (números, no cadenas). */
function cat_producto_json(array $p): array
{
    $precio = (float) $p['precio_base'];
    $iva = (float) ($p['iva_tasa'] ?? PrecioService::IVA_DEFAULT);
    $stock = (int) $p['stock_disponible'];

    return [
        'uuid'            => (string) $p['uuid'],
        'nombre'          => (string) $p['nombre'],
        'descripcion'     => (string) ($p['descripcion'] ?? ''),
        'categoria'       => (string) ($p['categoria'] ?? ''),
        'categoria_id'    => (int) $p['categoria_id'],
        'precio_base'     => $precio,
        'precio_con_iva'  => round($precio * (1 + $iva / 100), 2),
        'iva_tasa'        => $iva,
        'unidad_venta'    => (string) $p['unidad_venta'],
        'contenido'       => (string) $p['contenido'],
        'presentacion'    => trim((string) $p['unidad_venta'] . ' de ' . (string) $p['contenido']),
        'peso_kg'         => (float) $p['peso_kg'],
        'volumen_m3'      => (float) $p['volumen_m3'],
        'cantidad_minima' => (int) $p['cantidad_minima'],
        'multiplo_venta'  => (int) $p['multiplo_venta'],
        'stock'           => $stock,
        'activo'          => (int) $p['activo'] === 1,
        'perecedero'      => (int) $p['perecedero'] === 1,
        'requiere_frio'   => (int) $p['requiere_frio'] === 1,
        'inflamable'      => (int) $p['inflamable'] === 1,
        'restringido'     => (int) $p['restringido'] === 1,
        'foto'            => cat_foto_url($p),
        'escalas'         => (int) ($p['escalas'] ?? 0),
        'created_at'      => (string) ($p['created_at'] ?? ''),
        'updated_at'      => (string) ($p['updated_at'] ?? ''),
    ];
}

/**
 * Producto del mayorista en sesión. 404 si no existe o es de otra cuenta.
 *
 * @return array<string, mixed>
 */
function cat_producto_propio(string $uuid): array
{
    global $catRepo, $catMid, $catPdo;

    $producto = $catRepo->buscarPorUuid($uuid);

    if ($producto === null || (int) $producto['mayorista_id'] !== $catMid) {
        fallo('Producto no encontrado.', 404, 'NO_ENCONTRADO');
    }

    $stmt = $catPdo->prepare(
        'SELECT p.*, c.nombre AS categoria,
                (SELECT i.ruta FROM producto_imagenes i WHERE i.producto_id = p.id ORDER BY i.orden, i.id LIMIT 1) AS foto
         FROM productos p JOIN categorias c ON c.id = p.categoria_id
         WHERE p.id = ? LIMIT 1'
    );
    $stmt->execute([(int) $producto['id']]);

    $fila = $stmt->fetch();

    return $fila !== false ? $fila : $producto;
}

/** Id de categoría a partir de id numérico o de su nombre. */
function cat_categoria_id(mixed $valor, bool $estricto = true): int
{
    global $catRepo;

    if (is_numeric($valor)) {
        $id = (int) $valor;
        $categoria = $id > 0 ? $catRepo->categoriaPorId($id) : null;

        if ($categoria === null || (int) $categoria['activa'] !== 1) {
            if (!$estricto) {
                return 0;
            }

            cat_fallo_campos('Elige una categoría válida.', ['categoria' => 'Esa categoría no existe o está inactiva.']);
        }

        return $id;
    }

    $buscado = cat_normalizar((string) $valor);
    $categorias = $catRepo->categorias();

    if ($buscado === '') {
        if ($categorias === []) {
            if (!$estricto) {
                return 0;
            }

            cat_fallo_campos('No hay categorías activas.', ['categoria' => 'No hay categorías activas en el sistema.']);
        }

        return (int) $categorias[0]['id'];
    }

    foreach ($categorias as $categoria) {
        if (cat_normalizar((string) $categoria['nombre']) === $buscado) {
            return (int) $categoria['id'];
        }
    }

    if (!$estricto) {
        return 0;
    }

    $nombres = array_map(static fn (array $c): string => (string) $c['nombre'], $categorias);
    cat_fallo_campos(
        'La categoría «' . (string) $valor . '» no existe.',
        ['categoria' => 'Usa una de: ' . implode(', ', $nombres) . '.']
    );

    return 0;
}

/**
 * Escalas del producto en forma de tramos {desde, hasta, precio}.
 *
 * La tabla guarda el precio por tramo (tipo `precio_fijo`), así que el «hasta»
 * se deriva: termina donde empieza el siguiente tramo. Si algún producto viejo
 * tuviera escalas porcentuales se calcula su precio sobre el precio base.
 *
 * @param array<int, array<string, mixed>> $filas
 * @return array<int, array<string, mixed>>
 */
function cat_escalas_rangos(array $filas, float $precioBase): array
{
    $escalas = [];

    foreach ($filas as $fila) {
        $desde = (int) $fila['cantidad_minima'];
        $tipo = (string) $fila['tipo'];
        $valor = (float) $fila['valor'];
        $precio = $tipo === 'porcentaje' ? $precioBase * (1 - ($valor / 100)) : $valor;

        $escalas[] = [
            'desde'  => $desde,
            'precio' => round($precio, 2),
            'tipo'   => $tipo,
            'valor'  => $valor,
        ];
    }

    usort($escalas, static fn (array $a, array $b): int => $a['desde'] <=> $b['desde']);

    $total = count($escalas);

    foreach ($escalas as $i => $escala) {
        $hasta = $i + 1 < $total ? $escalas[$i + 1]['desde'] - 1 : null;

        $escalas[$i]['hasta'] = $hasta;
        $escalas[$i]['etiqueta'] = $hasta === null
            ? 'Desde ' . $escala['desde'] . ' en adelante: $' . number_format($escala['precio'], 2) . ' c/u'
            : 'De ' . $escala['desde'] . ' a ' . $hasta . ': $' . number_format($escala['precio'], 2) . ' c/u';
    }

    return $escalas;
}

/**
 * Convierte lo que manda el cliente en filas de `escala_descuentos`.
 *
 * Acepta el formato de la SPA [{desde, hasta, precio}] y también el del panel
 * PHP [{cantidad_minima, tipo, valor}]. Reglas: cantidades >= 1 y crecientes,
 * tramos que no se solapen y precio que baja al subir el volumen.
 *
 * @param array<int, mixed> $entradas
 * @return array<int, array{cantidad_minima:int, tipo:string, valor:float}>
 * @throws EscalaInvalidaException
 */
function cat_escalas_a_filas(array $entradas, float $precioBase): array
{
    if ($entradas === []) {
        return [];
    }

    $tramos = [];

    foreach (array_values($entradas) as $i => $entrada) {
        if (!is_array($entrada)) {
            throw new EscalaInvalidaException('Cada escala debe venir como {desde, hasta, precio}.');
        }

        $desde = (int) ($entrada['desde'] ?? $entrada['cantidad_minima'] ?? 0);
        $tipo = (string) ($entrada['tipo'] ?? 'precio_fijo');
        $valor = (float) ($entrada['valor'] ?? 0);

        if (array_key_exists('precio', $entrada)) {
            $precio = (float) $entrada['precio'];
            $tipo = 'precio_fijo';
            $valor = $precio;
        } else {
            $precio = $tipo === 'porcentaje' ? $precioBase * (1 - ($valor / 100)) : $valor;
        }

        if ($desde < 1) {
            throw new EscalaInvalidaException('La cantidad «desde» de la escala ' . ($i + 1) . ' debe ser al menos 1.');
        }

        if ($precio <= 0) {
            throw new EscalaInvalidaException('El precio de la escala desde ' . $desde . ' debe ser mayor que cero.');
        }

        if ($tipo === 'porcentaje' && ($valor < 0 || $valor >= 100)) {
            throw new EscalaInvalidaException('Un descuento porcentual debe estar entre 0 y 99.99%.');
        }

        if (!in_array($tipo, ['porcentaje', 'precio_fijo'], true)) {
            throw new EscalaInvalidaException("Tipo de escala no válido: '{$tipo}'.");
        }

        $hasta = null;

        if (array_key_exists('hasta', $entrada) && $entrada['hasta'] !== null && $entrada['hasta'] !== '') {
            $hasta = (int) $entrada['hasta'];

            if ($hasta < $desde) {
                throw new EscalaInvalidaException('La escala desde ' . $desde . ' termina antes de empezar (hasta ' . $hasta . ').');
            }
        }

        $tramos[] = ['desde' => $desde, 'hasta' => $hasta, 'precio' => round($precio, 2), 'tipo' => $tipo, 'valor' => $valor];
    }

    usort($tramos, static fn (array $a, array $b): int => $a['desde'] <=> $b['desde']);

    $total = count($tramos);
    $anterior = null;

    foreach ($tramos as $i => $tramo) {
        if ($anterior !== null) {
            if ($tramo['desde'] === $anterior['desde']) {
                throw new EscalaInvalidaException('Hay dos escalas que empiezan en ' . $tramo['desde'] . '. Deja solo una.');
            }

            if ($tramo['precio'] >= $anterior['precio']) {
                throw new EscalaInvalidaException(
                    'El precio de la escala desde ' . $tramo['desde'] . ' ($' . number_format($tramo['precio'], 2) .
                    ') debe ser menor que el de la escala desde ' . $anterior['desde'] .
                    ' ($' . number_format($anterior['precio'], 2) . '): al comprar más, el precio baja.'
                );
            }

            $tope = $anterior['hasta'];

            if ($tope !== null && $tope >= $tramo['desde']) {
                throw new EscalaInvalidaException(
                    'Las escalas se solapan: la que empieza en ' . $anterior['desde'] . ' termina en ' . $tope .
                    ' y la siguiente empieza en ' . $tramo['desde'] . '.'
                );
            }
        }

        if ($i === 0 && $tramo['precio'] >= $precioBase) {
            throw new EscalaInvalidaException(
                'El precio de la primera escala ($' . number_format($tramo['precio'], 2) .
                ') debe ser menor que el precio base ($' . number_format($precioBase, 2) . ').'
            );
        }

        if ($i === $total - 1) {
            $tramo['hasta'] = null;
        }

        $anterior = $tramo;
        $tramos[$i] = $tramo;
    }

    return array_map(
        static fn (array $tramo): array => [
            'cantidad_minima' => $tramo['desde'],
            'tipo'            => $tramo['tipo'],
            'valor'           => $tramo['tipo'] === 'porcentaje' ? $tramo['valor'] : $tramo['precio'],
        ],
        $tramos
    );
}

/** Escalas guardadas, listas para reenviarlas tal cual en un PATCH. */
function cat_escalas_actuales(int $productoId): array
{
    global $catRepo;

    $filas = array_map(
        static fn (array $e): array => [
            'cantidad_minima' => (int) $e['cantidad_minima'],
            'tipo'            => (string) $e['tipo'],
            'valor'           => (float) $e['valor'],
        ],
        $catRepo->escalas($productoId)
    );

    // El repositorio las da de mayor a menor (para cotizar); el validador las
    // exige de menor a mayor.
    usort($filas, static fn (array $a, array $b): int => $a['cantidad_minima'] <=> $b['cantidad_minima']);

    return $filas;
}

/**
 * Guarda la foto (data URL) del producto y reemplaza la anterior.
 * Devuelve la ruta relativa dentro de storage/.
 */
function cat_imagen_guardar(int $productoId, string $uuid, string $dataUrl): string
{
    $dataUrl = trim($dataUrl);

    if ($dataUrl === '') {
        return '';
    }

    if (!preg_match('#^data:image/(png|jpe?g|webp);base64,(.+)$#is', $dataUrl, $partes)) {
        cat_fallo_campos(
            'La foto no es válida.',
            ['imagen' => 'Sube una imagen PNG, JPG o WebP en formato data URL.']
        );
    }

    $binario = base64_decode(preg_replace('/\s+/', '', $partes[2]), true);

    if ($binario === false || $binario === '') {
        cat_fallo_campos('La foto no se pudo decodificar.', ['imagen' => 'El archivo llegó dañado. Vuelve a elegirlo.']);
    }

    if (strlen($binario) > CAT_MAX_IMAGEN_BYTES) {
        cat_fallo_campos('La foto pasa de 3 MB.', ['imagen' => 'Comprímela o usa una imagen más pequeña.']);
    }

    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = (string) $finfo->buffer($binario);
    $extensiones = ['image/png' => 'png', 'image/jpeg' => 'jpg', 'image/webp' => 'webp'];

    if (!isset($extensiones[$mime])) {
        cat_fallo_campos('Ese archivo no es una imagen.', ['imagen' => 'Solo se aceptan PNG, JPG o WebP.']);
    }

    if (!is_dir(CAT_IMAGENES_DIR) && !mkdir(CAT_IMAGENES_DIR, 0775, true) && !is_dir(CAT_IMAGENES_DIR)) {
        fallo('No se pudo preparar la carpeta de fotos.', 500, 'ALMACEN');
    }

    // Barre la foto anterior con otra extensión para no dejar huérfanos.
    foreach (glob(CAT_IMAGENES_DIR . '/' . $uuid . '.*') ?: [] as $vieja) {
        @unlink($vieja);
    }

    $ruta = 'catalogo/' . $uuid . '.' . $extensiones[$mime];

    if (file_put_contents(CAT_IMAGENES_DIR . '/' . $uuid . '.' . $extensiones[$mime], $binario) === false) {
        fallo('No se pudo guardar la foto.', 500, 'ALMACEN');
    }

    $pdo = api_pdo();
    $pdo->prepare('DELETE FROM producto_imagenes WHERE producto_id = ?')->execute([$productoId]);
    $pdo->prepare('INSERT INTO producto_imagenes (producto_id, ruta, orden) VALUES (?,?,0)')->execute([$productoId, $ruta]);

    return $ruta;
}

/** Borra la foto del producto (archivo y fila). */
function cat_imagen_quitar(int $productoId, string $uuid): void
{
    foreach (glob(CAT_IMAGENES_DIR . '/' . $uuid . '.*') ?: [] as $archivo) {
        @unlink($archivo);
    }

    api_pdo()->prepare('DELETE FROM producto_imagenes WHERE producto_id = ?')->execute([$productoId]);
}

/** Datos del producto a partir del cuerpo JSON (alta o edición parcial). */
function cat_datos_producto(array $d, ?array $actual, float $precioBase): array
{
    $mismo = static fn (string $clave, mixed $defecto = null) => array_key_exists($clave, $d) ? $d[$clave] : $defecto;
    $delActual = static fn (string $clave, mixed $defecto = null) => $actual[$clave] ?? $defecto;

    $categoria = array_key_exists('categoria', $d) || array_key_exists('categoria_id', $d)
        ? cat_categoria_id($d['categoria'] ?? $d['categoria_id'])
        : (int) $delActual('categoria_id', 0);

    return [
        'nombre'          => trim((string) ($mismo('nombre', (string) $delActual('nombre', '')))),
        'categoria_id'    => $categoria,
        'descripcion'     => trim((string) ($mismo('descripcion', (string) $delActual('descripcion', '')))),
        'precio_base'     => (float) ($mismo('precio_base', (float) $delActual('precio_base', 0))),
        'iva_tasa'        => (float) ($mismo('iva_tasa', (float) $delActual('iva_tasa', PrecioService::IVA_DEFAULT))),
        'unidad_venta'    => trim((string) ($mismo('unidad_venta', (string) $delActual('unidad_venta', '')))),
        'contenido'       => trim((string) ($mismo('contenido', (string) $delActual('contenido', '')))),
        'peso_kg'         => (float) ($mismo('peso_kg', (float) $delActual('peso_kg', 1))),
        'volumen_m3'      => (float) ($mismo('volumen_m3', (float) $delActual('volumen_m3', 0.001))),
        'cantidad_minima' => (int) ($mismo('cantidad_minima', (int) $delActual('cantidad_minima', 1))),
        'multiplo_venta'  => (int) ($mismo('multiplo_venta', (int) $delActual('multiplo_venta', 1))),
        'perecedero'      => cat_bool($mismo('perecedero'), (int) $delActual('perecedero', 0) === 1),
        'requiere_frio'   => cat_bool($mismo('requiere_frio'), (int) $delActual('requiere_frio', 0) === 1),
        'inflamable'      => cat_bool($mismo('inflamable'), (int) $delActual('inflamable', 0) === 1),
        'restringido'     => cat_bool($mismo('restringido'), (int) $delActual('restringido', 0) === 1),
        'activo'          => cat_bool($mismo('activo'), $actual === null ? true : (int) $delActual('activo', 0) === 1),
        'stock_inicial'   => (int) ($mismo('stock', 0)),
    ];
}

// ------------------------------------------------------------------ plantilla
if ($catRuta === '/catalogo/plantilla' && $catMetodo === 'GET') {
    $filas = [
        ['nombre', 'categoria', 'unidad', 'contenido', 'precio', 'stock', 'minimo', 'multiplo'],
        ['Azúcar estándar 50 kg', 'Abarrotes', 'Costal', '50 kg', '1250.00', '20', '1', '1'],
        ['Café molido 1 kg', 'Abarrotes', 'Pieza', '1 kg', '185.50', '40', '1', '1'],
    ];

    $csv = '';

    foreach ($filas as $fila) {
        $csv .= implode(',', array_map(
            static fn (string $v): string => str_contains($v, ',') || str_contains($v, '"')
                ? '"' . str_replace('"', '""', $v) . '"'
                : $v,
            $fila
        )) . "\r\n";
    }

    // El BOM hace que Excel respete los acentos al abrirlo.
    header_remove('Content-Type');
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="plantilla-catalogo.csv"');
    header('Content-Length: ' . (string) strlen("\xEF\xBB\xBF" . $csv));
    echo "\xEF\xBB\xBF" . $csv;
    exit;
}

// ------------------------------------------------------------------ imagen
if (preg_match('#^/catalogo/imagen/([0-9a-fA-F-]{36})$#', $catRuta, $partes) && $catMetodo === 'GET') {
    $producto = cat_producto_propio($partes[1]);

    $stmt = $catPdo->prepare('SELECT ruta FROM producto_imagenes WHERE producto_id = ? ORDER BY orden, id LIMIT 1');
    $stmt->execute([(int) $producto['id']]);
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
    header('Cache-Control: private, max-age=86400');
    readfile($absoluta);
    exit;
}

// ------------------------------------------------------------------ importar
if ($catRuta === '/catalogo/importar' && $catMetodo === 'POST') {
    $cuerpo = api_cuerpo();
    $contenido = (string) ($cuerpo['contenido'] ?? $cuerpo['csv'] ?? '');

    if ($contenido === '' && isset($cuerpo['data_url'])) {
        $dataUrl = (string) $cuerpo['data_url'];

        if (preg_match('#^data:[^,]*;base64,(.*)$#is', $dataUrl, $partes)) {
            $decodificado = base64_decode(preg_replace('/\s+/', '', $partes[1]), true);
            $contenido = $decodificado === false ? '' : $decodificado;
        } else {
            $contenido = $dataUrl;
        }
    }

    if (trim($contenido) === '') {
        cat_fallo_campos('Falta el CSV.', ['csv' => 'Pega el contenido o elige un archivo .csv.']);
    }

    if (strlen($contenido) > CAT_MAX_CSV_BYTES) {
        cat_fallo_campos('El CSV pasa de 5 MB.', ['csv' => 'Divide el archivo en partes más pequeñas.']);
    }

    // BOM y saltos Windows fuera antes de partir líneas.
    $contenido = preg_replace('/^\xEF\xBB\xBF/', '', $contenido) ?? $contenido;
    $lineas = preg_split('/\r\n|\r|\n/', $contenido) ?: [];
    $lineas = array_values(array_filter($lineas, static fn (string $l): bool => trim($l) !== ''));

    if ($lineas === []) {
        cat_fallo_campos('El CSV está vacío.', ['csv' => 'Descarga la plantilla y llena una fila por producto.']);
    }

    $normalizar = static fn (string $encabezado): string => match (cat_normalizar($encabezado)) {
        'categoria'        => 'categoria',
        'precio', 'precio_base' => 'precio',
        'unidad', 'unidad_venta' => 'unidad',
        'contenido'        => 'contenido',
        'stock', 'stock_disponible' => 'stock',
        'minimo', 'cantidad_minima' => 'minimo',
        'multiplo', 'multiplo_venta' => 'multiplo',
        'producto'         => 'nombre',
        default            => cat_normalizar($encabezado),
    };

    $cabecera = array_map($normalizar, str_getcsv(array_shift($lineas), ',', '"', ''));
    $requeridas = ['nombre', 'categoria', 'unidad', 'contenido', 'precio', 'stock', 'minimo', 'multiplo'];
    $faltan = array_diff($requeridas, $cabecera);

    if ($faltan !== []) {
        cat_fallo_campos(
            'Al CSV le faltan columnas: ' . implode(', ', $faltan) . '.',
            ['csv' => 'Los encabezados deben ser: ' . implode(',', $requeridas) . '. Descarga la plantilla.']
        );
    }

    if (count($lineas) > CAT_MAX_CSV_FILAS) {
        cat_fallo_campos('El CSV pasa de 5 000 filas.', ['csv' => 'Divide el archivo en partes más pequeñas.']);
    }

    $creados = 0;
    $errores = [];
    $numeroLinea = 1;

    foreach ($lineas as $linea) {
        $numeroLinea++;

        if ($numeroLinea > CAT_MAX_CSV_FILAS + 1) {
            $errores[] = ['linea' => $numeroLinea, 'motivo' => 'El archivo pasa de 5 000 filas; lo demás no se importó.'];
            break;
        }

        $valores = str_getcsv($linea, ',', '"', '');

        if (count($valores) !== count($cabecera)) {
            $errores[] = ['linea' => $numeroLinea, 'motivo' => 'La fila tiene ' . count($valores) . ' columnas y el encabezado ' . count($cabecera) . '.'];
            continue;
        }

        $fila = array_combine($cabecera, array_map('trim', $valores));

        if ($fila === false) {
            $errores[] = ['linea' => $numeroLinea, 'motivo' => 'No se pudo leer la fila.'];
            continue;
        }

        $precio = (float) str_replace(['$', ',', ' '], '', (string) $fila['precio']);
        $categoriaId = cat_categoria_id((string) $fila['categoria'], false);

        if ($categoriaId === 0) {
            $nombres = array_map(
                static fn (array $c): string => (string) $c['nombre'],
                $catRepo->categorias()
            );
            $errores[] = [
                'linea'  => $numeroLinea,
                'motivo' => 'La categoría «' . (string) $fila['categoria'] . '» no existe. Usa una de: ' . implode(', ', $nombres) . '.',
            ];
            continue;
        }

        $datos = [
            'nombre'          => (string) $fila['nombre'],
            'categoria_id'    => $categoriaId,
            'descripcion'     => '',
            'precio_base'     => $precio,
            'iva_tasa'        => PrecioService::IVA_DEFAULT,
            'unidad_venta'    => (string) $fila['unidad'],
            'contenido'       => (string) $fila['contenido'],
            'peso_kg'         => 1.0,
            'volumen_m3'      => 0.001,
            'cantidad_minima' => (int) $fila['minimo'],
            'multiplo_venta'  => (int) $fila['multiplo'],
            'perecedero'      => false,
            'requiere_frio'   => false,
            'inflamable'      => false,
            'restringido'     => false,
            'activo'          => true,
            'stock_inicial'   => (int) $fila['stock'],
            'escalas'         => [],
        ];

        $resultado = $catServicio->crear($catUid, $datos, $catIp);

        if ($resultado['ok']) {
            $creados++;
            continue;
        }

        $motivo = (string) $resultado['mensaje'];
        $campos = (array) ($resultado['errores'] ?? []);
        $detalles = array_values(array_unique(array_filter(
            array_map('strval', $campos),
            static fn (string $texto): bool => $texto !== '' && $texto !== $motivo
        )));

        if ($detalles !== []) {
            $motivo .= ' (' . implode(' ', $detalles) . ')';
        }

        $errores[] = ['linea' => $numeroLinea, 'motivo' => $motivo];
    }

    $catAuditoria->log('productos_importados', $catUid, 'producto', null, [
        'creados' => $creados,
        'errores' => count($errores),
    ], $catIp);

    responder([
        'ok'      => true,
        'creados' => $creados,
        'total'   => $creados + count($errores),
        'errores' => $errores,
    ]);
}

// ------------------------------------------------------------------ escalas
if (preg_match('#^/catalogo/([0-9a-fA-F-]{36})/escalas$#', $catRuta, $partes) && $catMetodo === 'POST') {
    $producto = cat_producto_propio($partes[1]);
    $cuerpo = api_cuerpo();
    $entradas = $cuerpo['escalas'] ?? [];

    if (!is_array($entradas)) {
        cat_fallo_campos('Las escalas deben venir como lista.', ['escalas' => 'Envía [{desde, hasta, precio}, …].']);
    }

    try {
        $filas = cat_escalas_a_filas($entradas, (float) $producto['precio_base']);
        $catPrecios->validarEscalas($filas);
    } catch (EscalaInvalidaException $e) {
        cat_fallo_campos($e->getMessage(), ['escalas' => $e->getMessage()], 422, 'ESCALA_INVALIDA');
    }

    $catRepo->reemplazarEscalas((int) $producto['id'], $filas);
    $catAuditoria->log('producto_escalas', $catUid, 'producto', (string) $producto['id'], ['escalas' => count($filas)], $catIp);

    responder([
        'ok'      => true,
        'mensaje' => $filas === [] ? 'Escalas eliminadas.' : 'Escalas guardadas.',
        'escalas' => cat_escalas_rangos($catRepo->escalas((int) $producto['id']), (float) $producto['precio_base']),
    ]);
}

// ------------------------------------------------------------------ categorías
if ($catRuta === '/catalogo/categorias' && $catMetodo === 'GET') {
    $categorias = array_map(
        static fn (array $c): array => [
            'id'          => (int) $c['id'],
            'nombre'      => (string) $c['nombre'],
            'restringida' => (int) $c['restringida'] === 1,
        ],
        $catRepo->categorias()
    );

    responder(['ok' => true, 'categorias' => $categorias]);
}

// ------------------------------------------------------------------ lista
if ($catRuta === '/catalogo' && $catMetodo === 'GET') {
    $busqueda = api_q('q');
    $estado = cat_normalizar(api_q('estado'));
    $pagina = api_qint('page', 1, 1, 5000);
    $porPagina = api_qint('per_page', 12, 1, 60);

    $filtros = ['p.mayorista_id = ?', 'p.deleted_at IS NULL'];
    $parametros = [$catMid];

    if ($busqueda !== '') {
        $filtros[] = '(p.nombre LIKE ? OR p.descripcion LIKE ?)';
        $parametros[] = '%' . $busqueda . '%';
        $parametros[] = '%' . $busqueda . '%';
    }

    $porEstado = match ($estado) {
        'activos', 'activo'        => 'p.activo = 1',
        'agotados', 'agotado'      => 'p.stock_disponible = 0',
        'borrador', 'borradores', 'inactivos' => 'p.activo = 0',
        default                    => '',
    };

    if ($porEstado !== '') {
        $filtros[] = $porEstado;
    }

    $where = implode(' AND ', $filtros);

    $stmt = $catPdo->prepare("SELECT COUNT(*) FROM productos p WHERE {$where}");
    $stmt->execute($parametros);
    $total = (int) $stmt->fetchColumn();

    $offset = ($pagina - 1) * $porPagina;

    $stmt = $catPdo->prepare(
        "SELECT p.*, c.nombre AS categoria,
                (SELECT i.ruta FROM producto_imagenes i WHERE i.producto_id = p.id ORDER BY i.orden, i.id LIMIT 1) AS foto,
                (SELECT COUNT(*) FROM escala_descuentos e WHERE e.producto_id = p.id) AS escalas
         FROM productos p JOIN categorias c ON c.id = p.categoria_id
         WHERE {$where}
         ORDER BY p.created_at DESC, p.id DESC
         LIMIT {$porPagina} OFFSET {$offset}"
    );
    $stmt->execute($parametros);
    $filas = $stmt->fetchAll() ?: [];

    $stmt = $catPdo->prepare(
        'SELECT COUNT(*) AS total,
                COALESCE(SUM(activo = 1 AND stock_disponible > 0), 0) AS activos,
                COALESCE(SUM(stock_disponible = 0), 0) AS agotados,
                COALESCE(SUM(activo = 0), 0) AS borrador,
                COALESCE(SUM(stock_disponible), 0) AS unidades,
                COALESCE(SUM(precio_base * stock_disponible), 0) AS valor_inventario
         FROM productos WHERE mayorista_id = ? AND deleted_at IS NULL'
    );
    $stmt->execute([$catMid]);
    $conteos = $stmt->fetch() ?: [];

    responder([
        'ok'        => true,
        'productos' => array_map('cat_producto_json', $filas),
        'total'     => $total,
        'page'      => $pagina,
        'paginas'   => max(1, (int) ceil($total / $porPagina)),
        'per_page'  => $porPagina,
        'conteos'   => [
            'total'            => (int) ($conteos['total'] ?? 0),
            'activos'          => (int) ($conteos['activos'] ?? 0),
            'agotados'         => (int) ($conteos['agotados'] ?? 0),
            'borrador'         => (int) ($conteos['borrador'] ?? 0),
            'unidades'         => (int) ($conteos['unidades'] ?? 0),
            'valor_inventario' => (float) ($conteos['valor_inventario'] ?? 0),
        ],
        'puede_publicar' => $catServicio->puedePublicar($catUid),
    ]);
}

// ------------------------------------------------------------------ alta
if ($catRuta === '/catalogo' && $catMetodo === 'POST') {
    $cuerpo = api_cuerpo();
    $datos = cat_datos_producto($cuerpo, null, (float) ($cuerpo['precio_base'] ?? 0));
    $datos['stock_inicial'] = (int) ($cuerpo['stock'] ?? 0);

    try {
        $datos['escalas'] = cat_escalas_a_filas((array) ($cuerpo['escalas'] ?? []), (float) $datos['precio_base']);
    } catch (EscalaInvalidaException $e) {
        cat_fallo_campos($e->getMessage(), ['escalas' => $e->getMessage()], 422, 'ESCALA_INVALIDA');
    }

    if ($datos['stock_inicial'] < 0) {
        cat_fallo_campos('El stock no puede ser negativo.', ['stock' => 'Escribe 0 o más piezas.']);
    }

    $resultado = $catServicio->crear($catUid, $datos, $catIp);

    if (!$resultado['ok']) {
        cat_fallo_campos((string) $resultado['mensaje'], (array) ($resultado['errores'] ?? []));
    }

    $id = (int) $resultado['id'];
    $stmt = $catPdo->prepare('SELECT uuid FROM productos WHERE id = ? LIMIT 1');
    $stmt->execute([$id]);
    $uuid = (string) ($stmt->fetchColumn() ?: '');

    if (isset($cuerpo['imagen']) && is_string($cuerpo['imagen']) && trim($cuerpo['imagen']) !== '') {
        cat_imagen_guardar($id, $uuid, $cuerpo['imagen']);
    }

    responder([
        'ok'      => true,
        'uuid'    => $uuid,
        'mensaje' => 'Producto guardado.',
    ], 201);
}

// ------------------------------------------------------------------ detalle / edición / baja
if (preg_match('#^/catalogo/([0-9a-fA-F-]{36})$#', $catRuta, $partes)) {
    $producto = cat_producto_propio($partes[1]);
    $id = (int) $producto['id'];

    if ($catMetodo === 'GET') {
        $imagenes = array_map(
            static fn (array $i): array => [
                'url'   => '/api/catalogo/imagen/' . (string) $producto['uuid'],
                'orden' => (int) $i['orden'],
            ],
            $catRepo->imagenes($id)
        );

        $detalle = cat_producto_json($producto);
        $detalle['escalas'] = cat_escalas_rangos($catRepo->escalas($id), (float) $producto['precio_base']);
        $detalle['imagenes'] = $imagenes;
        $detalle['puede_publicar'] = $catServicio->puedePublicar($catUid);

        responder(['ok' => true, 'producto' => $detalle]);
    }

    if ($catMetodo === 'PATCH') {
        $cuerpo = api_cuerpo();
        $datos = cat_datos_producto($cuerpo, $producto, (float) $producto['precio_base']);
        $precioBase = (float) $datos['precio_base'];

        try {
            $datos['escalas'] = array_key_exists('escalas', $cuerpo)
                ? cat_escalas_a_filas((array) $cuerpo['escalas'], $precioBase)
                : cat_escalas_actuales($id);
        } catch (EscalaInvalidaException $e) {
            cat_fallo_campos($e->getMessage(), ['escalas' => $e->getMessage()], 422, 'ESCALA_INVALIDA');
        }

        $ajusteStock = null;

        if (array_key_exists('stock', $cuerpo)) {
            $nuevo = (int) $cuerpo['stock'];

            if ($nuevo < 0) {
                cat_fallo_campos('El stock no puede ser negativo.', ['stock' => 'Escribe 0 o más piezas.']);
            }

            $ajusteStock = $nuevo - (int) $producto['stock_disponible'];
        }

        $resultado = $catServicio->actualizar($catUid, $id, $datos, $catIp);

        if (!$resultado['ok']) {
            cat_fallo_campos((string) $resultado['mensaje'], (array) ($resultado['errores'] ?? []));
        }

        if ($ajusteStock !== null && $ajusteStock !== 0) {
            $movido = $catRepo->ajustarStock($id, $ajusteStock, 'ajuste', $catUid, 'Ajuste desde el catálogo');

            if (!$movido) {
                fallo('El stock no puede quedar negativo.', 422, 'STOCK');
            }
        }

        if (isset($cuerpo['imagen']) && is_string($cuerpo['imagen']) && trim($cuerpo['imagen']) !== '') {
            cat_imagen_guardar($id, (string) $producto['uuid'], $cuerpo['imagen']);
        } elseif (cat_bool($cuerpo['quitar_imagen'] ?? false)) {
            cat_imagen_quitar($id, (string) $producto['uuid']);
        }

        responder([
            'ok'       => true,
            'uuid'     => (string) $producto['uuid'],
            'mensaje'  => 'Producto actualizado.',
            'producto' => cat_producto_json(cat_producto_propio((string) $producto['uuid'])),
        ]);
    }

    if ($catMetodo === 'DELETE') {
        $catRepo->desactivar($id);
        $catAuditoria->log('producto_baja', $catUid, 'producto', (string) $id, ['nombre' => (string) $producto['nombre']], $catIp);

        responder(['ok' => true, 'mensaje' => 'Producto dado de baja.']);
    }
}

// Ninguna ruta de /catalogo coincide: que el siguiente módulo lo intente.
return;
