<?php
$base = '/home/rizutov/distribuidora-final';
require $base . '/vendor/autoload.php';
Dotenv\Dotenv::createImmutable($base)->load();
$pdo = new PDO(sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4', $_ENV['DB_HOST'], $_ENV['DB_PORT'], $_ENV['DB_NAME']), $_ENV['DB_USER'], $_ENV['DB_PASS'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);

$cols = $pdo->query("SHOW COLUMNS FROM pos_productos")->fetchAll(PDO::FETCH_COLUMN);
echo "cols pos_productos: ", implode(', ', $cols), "\n\n";

echo "== stock <= minimo ==\n";
foreach ($pdo->query("SELECT id, usuario_id, nombre, stock, stock_minimo FROM pos_productos WHERE activo=1 AND stock <= stock_minimo LIMIT 20") as $r) echo json_encode($r, JSON_UNESCAPED_UNICODE), "\n";

echo "\n== activos por usuario ==\n";
foreach ($pdo->query("SELECT usuario_id, COUNT(*) n FROM pos_productos WHERE activo=1 GROUP BY usuario_id") as $r) echo json_encode($r), "\n";

echo "\n== ajustes ==\n";
foreach ($pdo->query("SELECT * FROM pos_ajustes LIMIT 5") as $r) echo json_encode($r), "\n";

echo "\n== movimientos por tipo ==\n";
foreach ($pdo->query("SELECT tipo, COUNT(*) n FROM pos_movimientos GROUP BY tipo") as $r) echo json_encode($r), "\n";

echo "\n== ventas recientes ==\n";
foreach ($pdo->query("SELECT id, folio, estado, total FROM pos_ventas ORDER BY id DESC LIMIT 5") as $r) echo json_encode($r, JSON_UNESCAPED_UNICODE), "\n";
