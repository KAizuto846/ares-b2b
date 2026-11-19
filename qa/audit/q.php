<?php
declare(strict_types=1);
require '/home/rizutov/ares-react/backend/vendor/autoload.php';
Dotenv\Dotenv::createImmutable('/home/rizutov/ares-react/backend')->safeLoad();
$pdo = App\Config\Database::conexion();

$sql = $argv[1] ?? 'SELECT 1';
foreach ($pdo->query($sql) as $f) {
    echo json_encode($f, JSON_UNESCAPED_UNICODE), "\n";
}
