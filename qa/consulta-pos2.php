<?php
$base = '/home/rizutov/distribuidora-final';
require $base . '/vendor/autoload.php';
Dotenv\Dotenv::createImmutable($base)->load();
$pdo = new PDO(sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4', $_ENV['DB_HOST'], $_ENV['DB_PORT'], $_ENV['DB_NAME']), $_ENV['DB_USER'], $_ENV['DB_PASS'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);

echo "== productos en o bajo minimo ==\n";
foreach ($pdo->query("SELECT id, comercio_id, nombre, stock, stock_minimo FROM pos_productos WHERE activo=1 AND stock <= stock_minimo LIMIT 20") as $r) echo json_encode($r, JSON_UNESCAPED_UNICODE), "\n";

echo "\n== productos activos por comercio ==\n";
foreach ($pdo->query("SELECT comercio_id, COUNT(*) n FROM pos_productos WHERE activo=1 GROUP BY comercio_id") as $r) echo json_encode($r), "\n";

echo "\n== ajustes ==\n";
foreach ($pdo->query("SELECT * FROM pos_ajustes LIMIT 5") as $r) echo json_encode($r), "\n";

echo "\n== movimientos por tipo ==\n";
foreach ($pdo->query("SELECT tipo, COUNT(*) n FROM pos_movimientos GROUP BY tipo") as $r) echo json_encode($r), "\n";

echo "\n== turnos ==\n";
foreach ($pdo->query("SELECT id, usuario_id, estado, fondo_inicial, efectivo_esperado, efectivo_contado, diferencia FROM pos_turnos ORDER BY id DESC LIMIT 5") as $r) echo json_encode($r), "\n";

echo "\n== ventas recientes ==\n";
foreach ($pdo->query("SELECT id, folio, estado, total, notas FROM pos_ventas ORDER BY id DESC LIMIT 5") as $r) echo json_encode($r, JSON_UNESCAPED_UNICODE), "\n";
