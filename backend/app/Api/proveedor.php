<?php

declare(strict_types=1);

/**
 * Ficha pública de un mayorista (/proveedor/{uuid}) y su catálogo.
 */

use App\Core\Cache;
use App\Modules\Busqueda\BusquedaRepository;
use App\Modules\Busqueda\BusquedaService;

$rutaActual = (string) (api_ctx()['ruta'] ?? '');
$metodoActual = (string) (api_ctx()['metodo'] ?? 'GET');

if ($metodoActual === 'GET' && preg_match('#^/proveedor/([0-9a-fA-F-]{36})$#', $rutaActual, $partes) === 1) {
    $servicio = new BusquedaService(
        new BusquedaRepository(api_pdo()),
        new Cache(__DIR__ . '/../../storage/cache'),
        api_pdo()
    );

    $perfil = $servicio->mayorista((string) $partes[1]);

    if ($perfil === null) {
        fallo('Ese proveedor no existe.', 404, 'NO_ENCONTRADO');
    }

    $productos = [];
    foreach ((array) ($perfil['productos'] ?? []) as $p) {
        $productos[] = [
            'uuid'       => (string) ($p['uuid'] ?? ''),
            'nombre'     => (string) ($p['nombre'] ?? ''),
            'categoria'  => (string) ($p['categoria'] ?? ''),
            'precio'     => (float) ($p['precio_base'] ?? 0),
            'unidad'     => (string) ($p['unidad_venta'] ?? ''),
            'contenido'  => (string) ($p['contenido'] ?? ''),
            'stock'      => (int) ($p['stock_disponible'] ?? 0),
            'minimo'     => (int) ($p['cantidad_minima'] ?? 1),
            'multiplo'   => (int) ($p['multiplo_venta'] ?? 1),
        ];
    }

    $apertura = (string) ($perfil['horario_apertura'] ?? '');
    $cierre = (string) ($perfil['horario_cierre'] ?? '');

    responder([
        'ok'       => true,
        'proveedor' => [
            'uuid'            => (string) ($perfil['uuid'] ?? ''),
            'nombre'          => (string) ($perfil['nombre_comercial'] ?? ''),
            'giro'            => (string) ($perfil['categoria_giro'] ?? ''),
            'reputacion'      => $perfil['reputacion'] === null ? null : (float) $perfil['reputacion'],
            'horario'         => $apertura !== '' && $cierre !== '' ? substr($apertura, 0, 5) . ' – ' . substr($cierre, 0, 5) : 'No especificado',
            'monto_minimo'    => (float) ($perfil['monto_minimo'] ?? 0),
            'ciudad'          => (string) ($perfil['ciudad'] ?? ''),
            'total_productos' => count($productos),
        ],
        'productos' => $productos,
    ]);
}
