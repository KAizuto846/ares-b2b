-- 030 · Onboarding: bandera de configuración inicial completada.
-- La SPA redirige a la pantalla de onboarding cuando el rol aún no la ha
-- terminado. Vive en preferencias_usuario junto a los otros interruptores.

ALTER TABLE preferencias_usuario
    ADD COLUMN IF NOT EXISTS onboarding TINYINT(1) NOT NULL DEFAULT 0 AFTER notificaciones;
