-- 033 · Notas de operación: contabilidad, términos, productos prohibidos,
-- verificación de identidad, almacenamiento S3, liquidaciones, preferencias,
-- banners, anuncios y Premium.

-- ===================================================================== FASE 1
-- Desglose contable del pago: se llena al confirmar el pago (servicio).
CREATE TABLE IF NOT EXISTS contabilidad_asientos (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    pago_id         BIGINT UNSIGNED NOT NULL,
    pedido_id       BIGINT UNSIGNED NULL,
    subtotal        DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    iva             DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    envio           DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    comision        DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    neto_mayorista  DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    total           DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_asiento_pago (pago_id),
    INDEX idx_asiento_fecha (created_at),
    FOREIGN KEY (pago_id) REFERENCES pagos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- CSD (Certificado de Sello Digital) opcional del mayorista para timbrar.
-- En modo demo solo se guarda la huella/metadatos: NUNCA la llave privada.
CREATE TABLE IF NOT EXISTS facturacion_csd (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    mayorista_id    BIGINT UNSIGNED NOT NULL UNIQUE,
    certificado     VARCHAR(255) NOT NULL,
    huella          VARCHAR(64) NOT NULL,
    rfc_emisor      VARCHAR(13) NOT NULL,
    vigencia_hasta  DATE NULL,
    activo          TINYINT(1) NOT NULL DEFAULT 1,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (mayorista_id) REFERENCES mayoristas_perfil(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===================================================================== FASE 2
-- Aceptación versionada de términos y condiciones.
CREATE TABLE IF NOT EXISTS terminos_versiones (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    version     VARCHAR(20) NOT NULL UNIQUE,
    archivo     VARCHAR(120) NOT NULL,
    publicado   TINYINT(1) NOT NULL DEFAULT 1,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS terminos_aceptaciones (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    usuario_id      BIGINT UNSIGNED NOT NULL,
    version_id      INT UNSIGNED NOT NULL,
    aceptado_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ip              VARCHAR(45) NULL,
    UNIQUE KEY uq_termino_usuario (usuario_id, version_id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (version_id) REFERENCES terminos_versiones(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Productos prohibidos: lista de palabras/categorías bloqueadas al publicar.
CREATE TABLE IF NOT EXISTS productos_prohibidos (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    patron      VARCHAR(100) NOT NULL UNIQUE,
    motivo      VARCHAR(200) NOT NULL,
    activo      TINYINT(1) NOT NULL DEFAULT 1,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Verificación externa de identidad (modo demo) por documento KYC.
CREATE TABLE IF NOT EXISTS kyc_verificaciones_ext (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    documento_id    BIGINT UNSIGNED NOT NULL,
    proveedor       VARCHAR(40) NOT NULL DEFAULT 'demo',
    resultado       ENUM('coincide','no_coincide','error') NOT NULL,
    puntaje         TINYINT UNSIGNED NULL,
    respuesta       JSON NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_kve_doc (documento_id),
    FOREIGN KEY (documento_id) REFERENCES kyc_documentos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===================================================================== FASE 3
-- Almacenamiento S3-compatible: archivos pueden vivir en disco o en MinIO.
CREATE TABLE IF NOT EXISTS archivos_objetos (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    bucket      VARCHAR(60) NOT NULL DEFAULT 'ares',
    clave       VARCHAR(255) NOT NULL,
    mime        VARCHAR(80) NOT NULL,
    tamano      BIGINT UNSIGNED NOT NULL DEFAULT 0,
    almacen     ENUM('local','s3') NOT NULL DEFAULT 'local',
    usuario_id  BIGINT UNSIGNED NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_archivo (bucket, clave),
    INDEX idx_archivo_usuario (usuario_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Liquidación semanal del repartidor: extracto generado por el worker.
CREATE TABLE IF NOT EXISTS liquidaciones (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    repartidor_id   BIGINT UNSIGNED NOT NULL,
    semana_inicio   DATE NOT NULL,
    semana_fin      DATE NOT NULL,
    entregas        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    km_recorridos   DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    ganancias       DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    estado          ENUM('pendiente','pagada') NOT NULL DEFAULT 'pendiente',
    pagada_at       DATETIME NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_liquidacion (repartidor_id, semana_inicio),
    FOREIGN KEY (repartidor_id) REFERENCES repartidores_perfil(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===================================================================== FASE 4
-- Preferencias de compra del onboarding (categorías de interés).
CREATE TABLE IF NOT EXISTS usuario_preferencias_categorias (
    usuario_id     BIGINT UNSIGNED NOT NULL,
    categoria_id   INT UNSIGNED NOT NULL,
    interes        TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (usuario_id, categoria_id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Banners del explore (gestionables en admin).
CREATE TABLE IF NOT EXISTS banners (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    titulo      VARCHAR(120) NOT NULL,
    texto       VARCHAR(255) NULL,
    imagen      VARCHAR(255) NULL,
    color       VARCHAR(7) NOT NULL DEFAULT '#14532d',
    href        VARCHAR(120) NOT NULL DEFAULT '/buscar',
    activo      TINYINT(1) NOT NULL DEFAULT 1,
    orden       SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    desde       DATE NULL,
    hasta       DATE NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_banner_activo (activo, orden)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Anuncios personalizados con ventana aparte y control de frecuencia.
CREATE TABLE IF NOT EXISTS anuncios (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    titulo          VARCHAR(120) NOT NULL,
    cuerpo          VARCHAR(400) NOT NULL,
    imagen          VARCHAR(255) NULL,
    cta_href        VARCHAR(120) NULL,
    cta_texto       VARCHAR(40) NULL,
    roles           VARCHAR(120) NULL,
    segmento        JSON NULL,
    max_impresiones TINYINT UNSIGNED NOT NULL DEFAULT 2,
    desde           DATE NULL,
    hasta           DATE NULL,
    activo          TINYINT(1) NOT NULL DEFAULT 1,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_anuncio_activo (activo, desde, hasta)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS anuncio_impresiones (
    anuncio_id  BIGINT UNSIGNED NOT NULL,
    usuario_id  BIGINT UNSIGNED NOT NULL,
    visto_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    clic        TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (anuncio_id, usuario_id, visto_at),
    INDEX idx_imp_anuncio (anuncio_id),
    FOREIGN KEY (anuncio_id) REFERENCES anuncios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Planes y suscripciones Premium (cobro simulado por la pasarela).
CREATE TABLE IF NOT EXISTS planes (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    clave       VARCHAR(30) NOT NULL UNIQUE,
    nombre      VARCHAR(80) NOT NULL,
    descripcion VARCHAR(400) NULL,
    precio_mensual DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    flags       JSON NOT NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS suscripciones (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    usuario_id      BIGINT UNSIGNED NOT NULL,
    plan_id         INT UNSIGNED NOT NULL,
    estado          ENUM('activa','cancelada','vencida') NOT NULL DEFAULT 'activa',
    desde           DATE NOT NULL,
    hasta           DATE NULL,
    pago_referencia VARCHAR(80) NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_suscrip_usuario (usuario_id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (plan_id) REFERENCES planes(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed: versión de términos, productos prohibidos base y planes.
INSERT INTO terminos_versiones (version, archivo) VALUES
    ('1.0', 'terminos')
ON DUPLICATE KEY UPDATE version = version;

INSERT INTO productos_prohibidos (patron, motivo) VALUES
    ('armas', 'Artículos de defensa controlados'),
    ('pirotecnia', 'Material explosivo sin permiso'),
    ('medicino sin receta', 'Farmacovigilancia'),
    ('cigarril', 'Venta de tabaco regulada'),
    ('alcohol', 'Venta de alcohol regulada')
ON DUPLICATE KEY UPDATE patron = patron;

INSERT INTO planes (clave, nombre, descripcion, precio_mensual, flags) VALUES
    ('gratis', 'Gratuito', 'Publica hasta 30 productos, sin destacados ni analíticas', 0.00,
     '{"max_productos":30,"destacado":false,"analiticas":false,"banner":false}'),
    ('premium', 'Premium', 'Productos ilimitados, destaque en búsqueda, analíticas y banner', 299.00,
     '{"max_productos":null,"destacado":true,"analiticas":true,"banner":true}')
ON DUPLICATE KEY UPDATE clave = clave;
