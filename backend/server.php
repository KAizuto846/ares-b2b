<?php

declare(strict_types=1);

/**
 * Router para `php -S`: /api → JSON, /avatar y assets del panel → app PHP,
 * cualquier otra ruta → la SPA de React.
 */

$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

if (str_starts_with($uri, '/api/')) {
    require __DIR__ . '/public/api.php';

    return true;
}

// Endpoints del panel original que la SPA sigue usando (avatares, iconos).
if (preg_match('#^/(avatar|assets|manifest\.json|icon-)#', $uri) === 1) {
    require __DIR__ . '/public/index.php';

    return true;
}

if ($uri !== '/' && is_file(__DIR__ . '/public' . $uri)) {
    return false;
}

$spa = __DIR__ . '/public/spa/index.html';

if (is_file($spa)) {
    header('Content-Type: text/html; charset=utf-8');
    readfile($spa);

    return true;
}

http_response_code(503);
header('Content-Type: text/plain; charset=utf-8');
echo "Falta el build de React: cd frontend && npm run build\n";

return true;
