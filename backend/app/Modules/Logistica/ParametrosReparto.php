<?php

declare(strict_types=1);

namespace App\Modules\Logistica;

use PDO;

/**
 * Lectura de parámetros de reparto (tabla parametros gestionada en
 * Administración → Parámetros). Aislado en una clase para no acoplar el
 * servicio de logística al módulo de admin.
 */
final class ParametrosReparto
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function dame(string $clave, string $defecto): string
    {
        $stmt = $this->pdo->prepare('SELECT valor_actual FROM parametros WHERE clave = ? LIMIT 1');
        $stmt->execute([$clave]);
        $valor = $stmt->fetchColumn();

        return $valor === false || $valor === null ? $defecto : (string) $valor;
    }
}
