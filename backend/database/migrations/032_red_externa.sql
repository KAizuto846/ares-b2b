-- 032 · Rescate por red externa (Uber Direct u otras).
-- Cuando la ronda 3 de ofertas se agota sin repartidor, el envío puede pasar
-- a una red de reparto comercial. Se guarda la referencia externa, el costo y
-- el estado mapeado del webhook.

ALTER TABLE envios
    ADD COLUMN IF NOT EXISTS red_codigo VARCHAR(40) NULL AFTER consolidado,
    ADD COLUMN IF NOT EXISTS red_referencia VARCHAR(80) NULL AFTER red_codigo,
    ADD COLUMN IF NOT EXISTS red_costo DECIMAL(12,2) NULL AFTER red_referencia,
    ADD COLUMN IF NOT EXISTS red_estado VARCHAR(40) NULL AFTER red_costo,
    ADD INDEX IF NOT EXISTS idx_envio_red (red_codigo, red_referencia);

-- Parámetros de configuración (se ven y editan en Administración → Parámetros).
INSERT INTO parametros (clave, valor_actual, tipo, descripcion) VALUES
    ('red.enable', '0', 'bool', 'Activar el rescate por red externa (Uber Direct) cuando no hay repartidores'),
    ('red.tope_costo_extra', '150', 'float', 'Costo máximo de envío externo que se acepta sin avisar al comercio'),
    ('reparto.auto_dispatch', '0', 'bool', 'Asignar directo al mejor repartidor disponible sin esperar rondas de ofertas'),
    ('reparto.descuento_consolidacion', '20', 'float', 'Descuento al comercio cuando su envío comparte ruta multi-parada (%)')
ON DUPLICATE KEY UPDATE clave = clave;
