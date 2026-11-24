<?php

declare(strict_types=1);

/**
 * Router para `php -S`.
 *
 * Sirve igual en dos escenarios:
 *   · local:  http://127.0.0.1:8081/spa/…  (el navegador pide /spa/assets y /spa/api)
 *   · Funnel: https://<nodo>.ts.net/spa/…  (Tailscale recorta el prefijo, así que
 *             al proceso llegan /assets/… y /api/…)
 */

$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

// ---------------------------------------------------------------- API JSON
// La SPA arma sus llamadas sobre su propia base: /spa/api/… en local.
if (str_starts_with($uri, '/spa/api/')) {
    $_SERVER['REQUEST_URI'] = substr($uri, 4);
    require __DIR__ . '/public/api.php';

    return true;
}

if (str_starts_with($uri, '/api/')) {
    require __DIR__ . '/public/api.php';

    return true;
}

// ------------------------------------------------- archivos del build de React
$tipos = [
    'js'    => 'application/javascript; charset=utf-8',
    'mjs'   => 'application/javascript; charset=utf-8',
    'css'   => 'text/css; charset=utf-8',
    'map'   => 'application/json; charset=utf-8',
    'json'  => 'application/json; charset=utf-8',
    'webmanifest' => 'application/manifest+json; charset=utf-8',
    'svg'   => 'image/svg+xml',
    'png'   => 'image/png',
    'jpg'   => 'image/jpeg',
    'jpeg'  => 'image/jpeg',
    'webp'  => 'image/webp',
    'gif'   => 'image/gif',
    'ico'   => 'image/x-icon',
    'woff'  => 'font/woff',
    'woff2' => 'font/woff2',
    'ttf'   => 'font/ttf',
    'txt'   => 'text/plain; charset=utf-8',
];

$extension = strtolower(pathinfo($uri, PATHINFO_EXTENSION));

// Compresión: los .gz se generan junto al build (scripts/comprimir-build.sh).
// Sin esto el bundle viaja a 252 kB en lugar de ~75 kB por el Funnel.
$aceptaGzip = str_contains(strtolower($_SERVER['HTTP_ACCEPT_ENCODING'] ?? ''), 'gzip');
$comprimibles = ['js', 'mjs', 'css', 'svg', 'json', 'webmanifest', 'map', 'txt'];

if (isset($tipos[$extension])) {
    foreach ([__DIR__ . '/public' . $uri, __DIR__ . '/public/spa' . $uri] as $archivo) {
        if (!is_file($archivo)) {
            continue;
        }

        if ($aceptaGzip && in_array($extension, $comprimibles, true) && is_file($archivo . '.gz')) {
            header('Content-Type: ' . $tipos[$extension]);
            header('Content-Encoding: gzip');
            header('Vary: Accept-Encoding');
            header('Content-Length: ' . (string) filesize($archivo . '.gz'));
            header('Cache-Control: public, max-age=31536000, immutable');
            readfile($archivo . '.gz');

            return true;
        }

        header('Content-Type: ' . $tipos[$extension]);
        header('Vary: Accept-Encoding');
        header('Content-Length: ' . (string) filesize($archivo));
        header('Cache-Control: public, max-age=31536000, immutable');
        readfile($archivo);

        return true;
    }
}

// ---------------------------------------------------------------- landing
// Página pública de marketing: /landing (HTML) y sus assets estáticos.
if ($uri === '/landing' || $uri === '/landing/' || str_starts_with($uri, '/landing/')) {
    $relativo = $uri === '/landing' || $uri === '/landing/' ? '/landing/index.html' : $uri;
    $archivo = __DIR__ . '/public' . $relativo;
    if (is_file($archivo)) {
        $ext = strtolower(pathinfo($archivo, PATHINFO_EXTENSION));
        if ($ext === 'html') {
            header('Content-Type: text/html; charset=utf-8');
            header('Cache-Control: no-cache, must-revalidate');
        } else {
            header('Content-Type: ' . ($tipos[$ext] ?? 'application/octet-stream'));
            header('Cache-Control: public, max-age=86400');
        }
        header('Content-Length: ' . (string) filesize($archivo));
        readfile($archivo);

        return true;
    }
}

// ------------------------------- piezas del panel viejo que la SPA reutiliza
// Con la base de la app delante (/spa/avatar/2, /spa/assets/img/…).
if (preg_match('#^/spa/(avatar|assets|manifest\.json|icon-)#', $uri) === 1) {
    $_SERVER['REQUEST_URI'] = substr($uri, 4);
    require __DIR__ . '/public/index.php';

    return true;
}

if (preg_match('#^/(avatar|assets|manifest\.json|icon-)#', $uri) === 1) {
    require __DIR__ . '/public/index.php';

    return true;
}

if ($uri !== '/' && is_file(__DIR__ . '/public' . $uri)) {
    return false;
}

// ------------------------------------------------------------------- la SPA
$spa = __DIR__ . '/public/spa/index.html';

if (is_file($spa)) {
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-cache, must-revalidate');
    readfile($spa);

    return true;
}

http_response_code(503);
header('Content-Type: text/plain; charset=utf-8');
echo "Falta el build de React: cd frontend && npm run build\n";

return true;
