<?php

declare(strict_types=1);

namespace App\Modules\Logistica;

use PDO;

/**
 * Liquidación semanal de repartidores.
 *
 * El worker genera el extracto de cada lunes: entregas confirmadas, km y
 * ganancias de la semana anterior. Con estado 'pendiente' hasta que la
 * plataforma marca el pago (de forma manual o por conector bancario).
 */
final class LiquidacionService
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /** Genera las liquidaciones de la semana anterior para todos los repartidores activos. */
    public function generarSemana(): int
    {
        $inicio = date('Y-m-d', strtotime('monday last week'));
        $fin = date('Y-m-d', strtotime('sunday last week'));

        // Solo repartidores con entregas confirmadas en la semana.
        $stmt = $this->pdo->prepare(
            "SELECT rp.id,
                    COUNT(DISTINCT e.id) AS entregas,
                    COALESCE(SUM(e.distancia_km), 0) AS km,
                    COALESCE(SUM(e.tarifa), 0) AS ganancias
               FROM repartidores_perfil rp
               JOIN envios e ON e.repartidor_id = rp.id
               JOIN pedidos pe ON pe.id = e.pedido_id
              WHERE rp.estado_kyc = 'aprobado'
                AND e.estado IN ('entregado')
                AND DATE(e.parada_completada_at) BETWEEN ? AND ?
              GROUP BY rp.id"
        );
        $stmt->execute([$inicio, $fin]);

        $creadas = 0;

        foreach ($stmt->fetchAll() ?: [] as $fila) {
            $this->pdo->prepare(
                "INSERT INTO liquidaciones (repartidor_id, semana_inicio, semana_fin, entregas, km_recorridos, ganancias)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE entregas = VALUES(entregas), km_recorridos = VALUES(km_recorridos),
                     ganancias = VALUES(ganancias)"
            )->execute([
                (int) $fila['id'],
                $inicio,
                $fin,
                (int) $fila['entregas'],
                (float) $fila['km'],
                round((float) $fila['ganancias'], 2),
            ]);

            $creadas++;
        }

        return $creadas;
    }

    /** Liquidaciones del repartidor (últimas 10). */
    public function deRepartidor(int $repartidorId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT id, semana_inicio, semana_fin, entregas, km_recorridos, ganancias, estado, pagada_at
             FROM liquidaciones WHERE repartidor_id = ? ORDER BY semana_inicio DESC LIMIT 10'
        );
        $stmt->execute([$repartidorId]);

        return $stmt->fetchAll() ?: [];
    }

    /** Lista completa para el panel de la plataforma. */
    public function todas(int $limite = 50): array
    {
        $stmt = $this->pdo->prepare(
            "SELECT l.*, r.usuario_id, u.nombre
             FROM liquidaciones l
             JOIN repartidores_perfil r ON r.id = l.repartidor_id
             JOIN usuarios u ON u.id = r.usuario_id
             ORDER BY l.semana_inicio DESC, l.ganancias DESC
             LIMIT " . (int) $limite
        );

        return $stmt->fetchAll() ?: [];
    }

    /** Marca una liquidación como pagada. */
    public function marcarPagada(int $id): bool
    {
        return $this->pdo->prepare(
            "UPDATE liquidaciones SET estado = 'pagada', pagada_at = NOW() WHERE id = ? AND estado = 'pendiente'"
        )->execute([$id]);
    }
}
