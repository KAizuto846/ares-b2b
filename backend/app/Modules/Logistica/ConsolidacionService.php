<?php

declare(strict_types=1);

namespace App\Modules\Logistica;

use PDO;

/**
 * Rutas multi-parada: consolida envíos compatibles en un viaje con orden de
 * paradas calculado por OSRM Trip Planning.
 *
 * Un repartidor que ya va a recoger en "Insumos del Valle" puede llevar el
 * pedido nuevo si la última parada de su ruta queda cerca del origen nuevo;
 * el sistema recalcula la secuencia y el comercio ve "tu entrega es la
 * parada 2 de 3" en el tracking. El descuento por compartir ruta se aplica
 * sobre la tarifa ya cotizada del envío.
 */
final class ConsolidacionService
{
    /** Distancia máxima entre la última parada del viaje y el origen nuevo. */
    public const RADIO_CONSOLIDACION_KM = 2.0;

    /** Tope de paradas por viaje: keeps OSRM rápido y la ruta entendible. */
    public const MAX_PARADAS = 6;

    public function __construct(
        private readonly PDO $pdo,
        private readonly TarifaService $tarifas,
    ) {
    }

    /**
     * Intenta sumar el envío a un viaje activo del repartidor indicado.
     * Devuelve ['consolidado' => bool, 'orden' => int, 'viaje_id' => int|null].
     */
    public function consolidarConRepartidor(int $envioId, int $repartidorId, float $origenLat, float $origenLng, float $destinoLat, float $destinoLng): array
    {
        $viaje = $this->viajeActivo($repartidorId);

        if ($viaje === null) {
            return ['consolidado' => false, 'orden' => 1, 'viaje_id' => null];
        }

        $paradas = $this->paradasDe((int) $viaje['id']);

        if (count($paradas) >= self::MAX_PARADAS) {
            return ['consolidado' => false, 'orden' => 1, 'viaje_id' => null];
        }

        // Compatibilidad: la última parada del viaje debe quedar cerca del
        // origen nuevo (el repartidor recoge todo en el mismo radio).
        $ultima = $paradas === [] ? null : $paradas[count($paradas) - 1];

        if ($ultima !== null && $this->tarifas->distanciaKm((float) $ultima['origen_lat'], (float) $ultima['origen_lng'], $origenLat, $origenLng) > self::RADIO_CONSOLIDACION_KM) {
            return ['consolidado' => false, 'orden' => 1, 'viaje_id' => null];
        }

        // Se agrega al viaje y se recalcula el orden óptimo de todas las paradas.
        $orden = $this->agregarYRecalcular((int) $viaje['id'], $envioId, $origenLat, $origenLng, $destinoLat, $destinoLng);

        return ['consolidado' => true, 'orden' => $orden, 'viaje_id' => (int) $viaje['id']];
    }

    /** Crea un viaje nuevo para el repartidor y devuelve su id. */
    public function crearViaje(int $repartidorId): int
    {
        $this->pdo->prepare('INSERT INTO viajes_ruta (repartidor_id, estado) VALUES (?, ?)')
            ->execute([$repartidorId, 'planeada']);

        return (int) $this->pdo->lastInsertId();
    }

    /**
     * Envíos pendientes de ruta del repartidor (asignados, sin viaje y sin
     * entrega confirmada): con esto se arma el primer viaje.
     *
     * @return array<int,array<string,mixed>>
     */
    public function enviosSueltos(int $repartidorId): array
    {
        $stmt = $this->pdo->prepare(
            "SELECT e.id, e.pedido_id, e.tarifa,
                    pe.uuid, m.nombre_comercial AS mayorista, m.latitud AS origen_lat, m.longitud AS origen_lng,
                    d.latitud AS destino_lat, d.longitud AS destino_lng, d.calle, d.colonia, d.ciudad
             FROM envios e
             JOIN pedidos pe ON pe.id = e.pedido_id
             JOIN mayoristas_perfil m ON m.id = pe.mayorista_id
             JOIN direcciones d ON d.id = pe.direccion_id
             WHERE e.repartidor_id = ?
               AND e.viaje_ruta_id IS NULL
               AND e.estado IN ('asignado', 'en_recoleccion')
               AND e.parada_completada_at IS NULL"
        );
        $stmt->execute([$repartidorId]);

        return $stmt->fetchAll() ?: [];
    }

    /**
     * Arma el viaje del repartidor con sus envíos sueltos: crea el viaje si no
     * hay y calcula el orden con OSRM.
     */
    public function armarViaje(int $repartidorId): ?array
    {
        $sueltos = $this->enviosSueltos($repartidorId);

        if ($sueltos === []) {
            return null;
        }

        $viaje = $this->viajeActivo($repartidorId);
        $viajeId = $viaje !== null ? (int) $viaje['id'] : $this->crearViaje($repartidorId);

        $paradas = [];
        foreach ($sueltos as $s) {
            $this->pdo->prepare('UPDATE envios SET viaje_ruta_id = ? WHERE id = ? AND viaje_ruta_id IS NULL')
                ->execute([$viajeId, (int) $s['id']]);

            $paradas[] = [
                'envio_id'   => (int) $s['id'],
                'origen_lat' => (float) $s['origen_lat'],
                'origen_lng' => (float) $s['origen_lng'],
                'destino_lat' => (float) ($s['destino_lat'] ?? 0),
                'destino_lng' => (float) ($s['destino_lng'] ?? 0),
            ];
        }

        $this->recalcular($viajeId);

        return $this->viajeDetalle($viajeId);
    }

    /** Ordena las paradas del viaje por OSRM y guarda orden + totales. */
    public function recalcular(int $viajeId): void
    {
        $stmt = $this->pdo->prepare(
            "SELECT e.id, e.orden_parada, m.latitud AS origen_lat, m.longitud AS origen_lng,
                    d.latitud AS destino_lat, d.longitud AS destino_lng
             FROM envios e
             JOIN pedidos pe ON pe.id = e.pedido_id
             JOIN mayoristas_perfil m ON m.id = pe.mayorista_id
             JOIN direcciones d ON d.id = pe.direccion_id
             WHERE e.viaje_ruta_id = ?
               AND e.parada_completada_at IS NULL"
        );
        $stmt->execute([$viajeId]);
        $envios = $stmt->fetchAll() ?: [];

        if ($envios === []) {
            $this->pdo->prepare("UPDATE viajes_ruta SET estado = 'completada', completada_at = NOW() WHERE id = ? AND estado <> 'cancelada'")
                ->execute([$viajeId]);

            return;
        }

        // Coordenadas en el orden sugerido por OSRM Trip Planning; si falla,
        // se conserva el orden de inserción (recogidas en el origen común).
        $ordenado = $envios;

        if (count($envios) >= 2) {
            $optimo = $this->ordenOsrm($envios);

            if ($optimo !== null) {
                $ordenado = $optimo;
            }
        }

        $this->pdo->beginTransaction();
        try {
            foreach ($ordenado as $i => $e) {
                $this->pdo->prepare('UPDATE envios SET orden_parada = ? WHERE id = ?')
                    ->execute([$i + 1, (int) $e['id']]);
            }

            $totales = $this->totalesOsrm($ordenado);
            $this->pdo->prepare(
                'UPDATE viajes_ruta SET distancia_total_km = ?, duracion_est_min = ? WHERE id = ?'
            )->execute([$totales['distancia_km'], $totales['duracion_min'], $viajeId]);

            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();

            throw $e;
        }
    }

    /** Marca la parada del envío como completada y avanza el viaje. */
    public function completarParada(int $envioId): void
    {
        $this->pdo->prepare(
            "UPDATE envios SET parada_completada_at = NOW() WHERE id = ? AND parada_completada_at IS NULL"
        )->execute([$envioId]);

        $stmt = $this->pdo->prepare('SELECT viaje_ruta_id FROM envios WHERE id = ? LIMIT 1');
        $stmt->execute([$envioId]);
        $viajeId = (int) ($stmt->fetchColumn() ?: 0);

        if ($viajeId > 0) {
            $this->recalcular($viajeId);
        }
    }

    /** Completar por pedido (recoleción/entrega con PIN): solo si había ruta. */
    public function completarParadaPorPedido(int $pedidoId): void
    {
        $stmt = $this->pdo->prepare('SELECT id FROM envios WHERE pedido_id = ? LIMIT 1');
        $stmt->execute([$pedidoId]);
        $envioId = (int) ($stmt->fetchColumn() ?: 0);

        if ($envioId > 0) {
            $this->completarParada($envioId);
        }
    }

    /** Detalle completo del viaje para la UI del repartidor y del tracking. */
    public function viajeDetalle(int $viajeId): ?array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM viajes_ruta WHERE id = ? LIMIT 1');
        $stmt->execute([$viajeId]);
        $viaje = $stmt->fetch();

        if ($viaje === false) {
            return null;
        }

        $stmt = $this->pdo->prepare(
            "SELECT e.id, e.orden_parada, e.estado, e.tarifa, e.parada_completada_at,
                    pe.uuid, pe.total, m.nombre_comercial AS mayorista,
                    d.calle, d.colonia, d.ciudad, d.latitud AS destino_lat, d.longitud AS destino_lng
             FROM envios e
             JOIN pedidos pe ON pe.id = e.pedido_id
             JOIN mayoristas_perfil m ON m.id = pe.mayorista_id
             JOIN direcciones d ON d.id = pe.direccion_id
             WHERE e.viaje_ruta_id = ?
             ORDER BY e.parada_completada_at IS NOT NULL, e.orden_parada, e.id"
        );
        $stmt->execute([$viajeId]);
        $viaje['paradas'] = $stmt->fetchAll() ?: [];

        return $viaje;
    }

    /** Viaje del repartidor por pedido (para el tracking del comercio). */
    public function viajeDePedido(int $pedidoId): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT e.viaje_ruta_id, e.orden_parada FROM envios e WHERE e.pedido_id = ? AND e.viaje_ruta_id IS NOT NULL LIMIT 1'
        );
        $stmt->execute([$pedidoId]);
        $fila = $stmt->fetch();

        if ($fila === false || $fila['viaje_ruta_id'] === null) {
            return null;
        }

        return $this->viajeDetalle((int) $fila['viaje_ruta_id']);
    }

    // ------------------------------------------------------------------ base

    private function viajeActivo(int $repartidorId): ?array
    {
        $stmt = $this->pdo->prepare(
            "SELECT * FROM viajes_ruta WHERE repartidor_id = ? AND estado IN ('planeada', 'en_curso') ORDER BY id DESC LIMIT 1"
        );
        $stmt->execute([$repartidorId]);

        return $stmt->fetch() ?: null;
    }

    /**
     * Paradas pendientes del viaje, con el origen del pedido de cada una.
     *
     * @return array<int,array<string,mixed>>
     */
    private function paradasDe(int $viajeId): array
    {
        $stmt = $this->pdo->prepare(
            "SELECT e.id, m.latitud AS origen_lat, m.longitud AS origen_lng
             FROM envios e
             JOIN pedidos pe ON pe.id = e.pedido_id
             JOIN mayoristas_perfil m ON m.id = pe.mayorista_id
             WHERE e.viaje_ruta_id = ? AND e.parada_completada_at IS NULL
             ORDER BY e.orden_parada, e.id"
        );
        $stmt->execute([$viajeId]);

        return $stmt->fetchAll() ?: [];
    }

    private function agregarYRecalcular(int $viajeId, int $envioId, float $origenLat, float $origenLng, float $destinoLat, float $destinoLng): int
    {
        $this->pdo->prepare(
            "UPDATE envios SET viaje_ruta_id = ?, orden_parada = NULL WHERE id = ? AND viaje_ruta_id IS NULL"
        )->execute([$viajeId, $envioId]);

        $this->recalcular($viajeId);

        $stmt = $this->pdo->prepare('SELECT orden_parada FROM envios WHERE id = ? LIMIT 1');
        $stmt->execute([$envioId]);

        return (int) ($stmt->fetchColumn() ?: 1);
    }

    /**
     * Orden óptimo de paradas vía OSRM Trip Planning.
     * Si el servicio no responde se devuelve null y se conserva el orden dado.
     *
     * @param array<int,array<string,mixed>> $envios
     * @return array<int,array<string,mixed>>|null
     */
    private function ordenOsrm(array $envios): ?array
    {
        $coords = [];
        foreach ($envios as $e) {
            $coords[] = sprintf('%.6f,%.6f', (float) $e['origen_lng'], (float) $e['origen_lat']);
        }

        $url = sprintf(
            '%s/trip/v1/driving/%s?source=first&roundtrip=false',
            rtrim((string) (getenv('OSRM_URL') ?: ($_ENV['OSRM_URL'] ?? 'http://127.0.0.1:5000')), '/'),
            implode(';', $coords),
        );

        $contexto = stream_context_create(['http' => ['timeout' => 4, 'ignore_errors' => true]]);
        $respuesta = @file_get_contents($url, false, $contexto);

        if ($respuesta === false) {
            return null;
        }

        $datos = json_decode($respuesta, true);

        if (!is_array($datos) || ($datos['code'] ?? '') !== 'Ok' || !isset($datos['waypoints'])) {
            return null;
        }

        $ordenado = [];
        foreach ($datos['waypoints'] as $wp) {
            $idx = (int) ($wp['waypoint_index'] ?? -1);

            if (isset($envios[$idx])) {
                $ordenado[] = $envios[$idx];
            }
        }

        return count($ordenado) === count($envios) ? $ordenado : null;
    }

    /** Distancia y duración de la secuencia final (con fallback lineal). */
    private function totalesOsrm(array $ordenado): array
    {
        $distancia = 0.0;

        for ($i = 1, $n = count($ordenado); $i < $n; $i++) {
            $a = $ordenado[$i - 1];
            $b = $ordenado[$i];
            $distancia += $this->tarifas->distanciaKm(
                (float) ($a['destino_lat'] ?: $a['origen_lat']),
                (float) ($a['destino_lng'] ?: $a['origen_lng']),
                (float) ($b['origen_lat']),
                (float) ($b['origen_lng']),
            );
        }

        // Estimación comercial: 3 min por parada de gestión + 2.2 min/km.
        return [
            'distancia_km' => round($distancia, 2),
            'duracion_min' => max(count($ordenado) * 3, (int) ceil($distancia * 2.2)),
        ];
    }
}
