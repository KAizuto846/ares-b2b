<?php
$base = '/home/rizutov/distribuidora-final';
require $base . '/vendor/autoload.php';
Dotenv\Dotenv::createImmutable($base)->load();
$pdo = new PDO(sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4', $_ENV['DB_HOST'], $_ENV['DB_PORT'], $_ENV['DB_NAME']), $_ENV['DB_USER'], $_ENV['DB_PASS'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
echo "nombre | iva_tasa | precio_venta\n";
foreach ($pdo->query("SELECT nombre, iva_tasa, precio_venta FROM pos_productos WHERE activo=1 ORDER BY id LIMIT 12") as $r) {
  echo str_pad(mb_substr($r['nombre'],0,26), 28), '| ', str_pad((string)$r['iva_tasa'], 8), '| ', $r['precio_venta'], "\n";
}
echo "\nturno abierto:\n";
foreach ($pdo->query("SELECT id, estado, fondo_inicial, efectivo_esperado FROM pos_turnos ORDER BY id DESC LIMIT 3") as $r) echo json_encode($r), "\n";
echo "\nsuma ventas del turno abierto:\n";
foreach ($pdo->query("SELECT turno_id, COUNT(*) n, SUM(total) t FROM pos_ventas GROUP BY turno_id") as $r) echo json_encode($r), "\n";
