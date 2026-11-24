-- 031 · Rutas multi-parada (consolidación de entregas).
-- Un viaje agrupa varios envíos del mismo repartidor con un orden de paradas
-- calculado por OSRM Trip Planning. El envío sigue siendo 1 por pedido; el
-- viaje es opcional: si no hay consolidación, todo sigue igual que antes.

CREATE TABLE IF NOT EXISTS viajes_ruta (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    repartidor_id       BIGINT UNSIGNED NOT NULL,
    estado              ENUM('planeada','en_curso','completada','cancelada') NOT NULL DEFAULT 'planeada',
    distancia_total_km  DECIMAL(10,2) NULL,
    duracion_est_min    SMALLINT UNSIGNED NULL,
    completada_at       DATETIME NULL,
    created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_viaje_rep (repartidor_id, estado),
    CONSTRAINT fk_viaje_repartidor FOREIGN KEY (repartidor_id) REFERENCES repartidores_perfil (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE envios
    ADD COLUMN IF NOT EXISTS viaje_ruta_id BIGINT UNSIGNED NULL AFTER estado,
    ADD COLUMN IF NOT EXISTS orden_parada TINYINT UNSIGNED NULL AFTER viaje_ruta_id,
    ADD COLUMN IF NOT EXISTS parada_completada_at DATETIME NULL AFTER orden_parada,
    ADD COLUMN IF NOT EXISTS consolidado TINYINT(1) NOT NULL DEFAULT 0 AFTER parada_completada_at,
    ADD CONSTRAINT fk_envio_viaje FOREIGN KEY (viaje_ruta_id) REFERENCES viajes_ruta (id),
    ADD INDEX idx_envio_viaje (viaje_ruta_id, orden_parada);
