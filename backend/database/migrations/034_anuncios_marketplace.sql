-- Anuncios de mercado: los mayoristas pagan por aparecer en el inicio de las
-- cuentas de comercio. Cada compra registra monto y fecha de pago para ordenar
-- la sección (primero el mayor monto; si empatan, el que pagó antes) y para
-- llevar el vencimiento automático por días contratados.

ALTER TABLE anuncios
    ADD COLUMN mayorista_id  BIGINT UNSIGNED NULL AFTER id,
    ADD COLUMN monto_pagado  DECIMAL(10,2) UNSIGNED NOT NULL DEFAULT 0 AFTER mayorista_id,
    ADD COLUMN pagado_en     DATETIME NULL AFTER monto_pagado,
    ADD COLUMN estado        ENUM('pendiente_pago','activo','caducado') NOT NULL DEFAULT 'pendiente_pago' AFTER pagado_en,
    ADD COLUMN dias_contratados INT UNSIGNED NOT NULL DEFAULT 0 AFTER estado,
    ADD COLUMN vence_el      DATE NULL AFTER dias_contratados,
    ADD COLUMN clics         INT UNSIGNED NOT NULL DEFAULT 0 AFTER vence_el,
    ADD INDEX idx_anuncio_publicacion (estado, vence_el, monto_pagado),
    ADD CONSTRAINT fk_anuncio_mayorista FOREIGN KEY (mayorista_id) REFERENCES mayoristas_perfil(id) ON DELETE SET NULL;
