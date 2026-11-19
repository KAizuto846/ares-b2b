<?php
require __DIR__ . '/distribuidora-final/vendor/autoload.php';
$env = Dotenv\Dotenv::createImmutable('/home/rizutov/distribuidora-final');
$env->load();
$pdo = new PDO(sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4', $_ENV['DB_HOST'], $_ENV['DB_PORT'], $_ENV['DB_NAME']), $_ENV['DB_USER'], $_ENV['DB_PASS'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);

echo "== productos en o bajo mínimo ==\n";
$q = $pdo->query("SELECT p.id, p.nombre, p.stock, p.stock_minimo, c.usuario_id FROM pos_productos p JOIN comercios_perfil c ON c.id=p.comercio_id WHERE p.activo=1 AND p.stock <= p.stock_minimo LIMIT 20");
foreach ($q as $r) echo json_encode($r, JSON_UNESCAPED_UNICODE), "\n";

echo "\n== total productos activos por comercio ==\n";
foreach ($pdo->query("SELECT comercio_id, COUNT(*) n FROM pos_productos WHERE activo=1 GROUP BY comercio_id") as $r) echo json_encode($r), "\n";

echo "\n== ajustes ==\n";
foreach ($pdo->query("SELECT * FROM pos_ajustes LIMIT 5") as $r) echo json_encode($r), "\n";

echo "\n== tipos de movimiento existentes ==\n";
foreach ($pdo->query("SELECT tipo, COUNT(*) n FROM pos_movimientos GROUP BY tipo") as $r) echo json_encode($r), "\n";

echo "\n== turnos ==\n";
foreach ($pdo->query("SELECT id, usuario_id, estado, fondo_inicial, efectivo_esperado, efectivo_contado, diferencia FROM pos_turnos ORDER BY id DESC LIMIT 5") as $r) echo json_encode($r), "\n";
