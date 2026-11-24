<?php

declare(strict_types=1);

namespace App\Modules\Logistica;

use App\Core\AuditLogger;
use PDO;

/**
 * Rescate por red externa (RN-07b): cuando la ronda 3 de ofertas se agota sin
 * repartidor, se pide una entrega comercial (Uber Direct u otra red).
 *
 * Regla de negocio: solo se rescata si red.enable=1, la red cubre el trayecto
 * y el costo cabe en red.tope_costo_extra. El envío pasa a estado
 * 'red_externa' y el pedido se avisa al comercio por Mensajes.
 */
final class RescateRedService
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly AuditLogger $auditoria,
    ) {
    }

    /**
     * Intenta rescatar el envío del pedido vía la red activa.
     *
     * @return array{ok:bool, mensaje:string}
     */
    public function rescatar(int $pedidoId): array
    {
        if ((int) $this->parametro('red.enable', '0') !== 1) {
            return ['ok' => false, 'mensaje' => 'Rescate externo desactivado.'];
        }

        $red = \App\Modules\Logistica\Redes\red_activa($this->pdo);

        if ($red === null) {
            return ['ok' => false, 'mensaje' => 'No hay red de reparto configurada.'];
        }

        $stmt = $this->pdo->prepare(
            'SELECT e.id AS envio_id, e.estado,
                    m.latitud AS origen_lat, m.longitud AS origen_lng, md.calle AS origen_calle,
                    d.latitud AS destino_lat, d.longitud AS destino_lng,
                    d.calle, d.colonia, d.ciudad, c.usuario_id AS comercio_usuario
             FROM envios e
             JOIN pedidos pe ON pe.id = e.pedido_id
             JOIN mayoristas_perfil m ON m.id = pe.mayorista_id
             JOIN comercios_perfil c ON c.id = pe.comercio_id
             LEFT JOIN direcciones md ON md.id = m.direccion_id
             JOIN direcciones d ON d.id = pe.direccion_entrega_id
             WHERE e.pedido_id = ? LIMIT 1'
        );
        $stmt->execute([$pedidoId]);
        $envio = $stmt->fetch();

        if ($envio === false) {
            return ['ok' => false, 'mensaje' => 'El pedido no tiene envío.'];
        }

        if ($envio['destino_lat'] === null) {
            return ['ok' => false, 'mensaje' => 'La dirección del comercio no tiene coordenadas.'];
        }

        if ($envio['estado'] !== 'sin_repartidor' && $envio['estado'] !== 'buscando_repartidor') {
            return ['ok' => false, 'mensaje' => 'El envío ya no está disponible para rescate.'];
        }

        // ¿La red cubre y a qué precio?
        $cotizacion = $red->cotizar(
            (float) $envio['origen_lat'], (float) $envio['origen_lng'],
            (float) $envio['destino_lat'], (float) $envio['destino_lng'],
            (float) ($envio['peso_total_kg'] ?? 0),
        );

        if ($cotizacion === null) {
            return ['ok' => false, 'mensaje' => 'La red no cubre el trayecto.'];
        }

        $tope = (float) $this->parametro('red.tope_costo_extra', '150');

        if ($cotizacion['costo'] > $tope) {
            return ['ok' => false, 'mensaje' => sprintf('El costo (%.2f) supera el tope (%.2f).', $cotizacion['costo'], $tope)];
        }

        $resultado = $red->crear(
            (float) $envio['origen_lat'], (float) $envio['origen_lng'],
            (string) ($envio['origen_calle'] ?? 'Punto de recolección'),
            (float) $envio['destino_lat'], (float) $envio['destino_lng'],
            sprintf('%s, %s, %s', $envio['calle'], $envio['colonia'], $envio['ciudad']),
            "pedido-{$pedidoId}",
            '',
        );

        if ($resultado === null) {
            return ['ok' => false, 'mensaje' => 'La red rechazó la orden.'];
        }

        $this->pdo->prepare(
            "UPDATE envios SET estado = 'red_externa', red_codigo = ?, red_referencia = ?, red_costo = ?, red_estado = 'creada'
             WHERE id = ?"
        )->execute([$red->codigo(), $resultado['referencia'], $resultado['costo'], (int) $envio['envio_id']]);

        // Ofertas pendientes quedan inútiles.
        $this->pdo->prepare(
            "UPDATE ofertas_envio SET estado = 'expirada' WHERE envio_id = ? AND estado = 'pendiente'"
        )->execute([(int) $envio['envio_id']]);

        $this->auditoria->log('envio.red_rescate', null, 'envio', (string) $envio['envio_id'], [
            'red' => $red->codigo(),
            'referencia' => $resultado['referencia'],
            'costo' => $resultado['costo'],
        ], null);

        return ['ok' => true, 'mensaje' => sprintf('Envío rescatado por %s (%.2f).', $red->codigo(), $resultado['costo'])];
    }

    /** Procesa la fila del job desde el worker. */
    public function desdeJob(array $payload): array
    {
        return $this->rescatar((int) ($payload['pedido_id'] ?? 0));
    }

    private function parametro(string $clave, string $defecto): string
    {
        $stmt = $this->pdo->prepare('SELECT valor_actual FROM parametros WHERE clave = ? LIMIT 1');
        $stmt->execute([$clave]);
        $valor = $stmt->fetchColumn();

        return $valor === false || $valor === null ? $defecto : (string) $valor;
    }
}
