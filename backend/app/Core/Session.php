<?php

declare(strict_types=1);

namespace App\Core;

/**
 * Sesión endurecida: cookie httpOnly, SameSite Lax, sin acceso desde
 * JavaScript y con expiración por inactividad.
 */
final class Session
{
    private const INACTIVIDAD_SEG = 1800;   // 30 minutos
    private const ABSOLUTA_SEG     = 43200; // 12 horas
    private const RECORDAR_SEG     = 2592000; // 30 días con «Mantener sesión»

    public static function iniciar(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }

        $seguro = (($_SERVER['HTTPS'] ?? '') !== '' && ($_SERVER['HTTPS'] ?? '') !== 'off')
            || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';

        session_set_cookie_params([
            'lifetime' => 0,
            'path'     => '/',
            'secure'   => $seguro,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);

        ini_set('session.use_strict_mode', '1');
        ini_set('session.use_only_cookies', '1');

        // Las sesiones van a storage/sessions, no al /tmp del sistema: /tmp es
        // volátil y al reiniciar el contenedor se pierden todas, lo que hacía
        // que el token CSRF dejara de coincidir y todo POST devolviera 403.
        $rutaSesiones = dirname(__DIR__, 2) . '/storage/sessions';

        if (is_dir($rutaSesiones) && is_writable($rutaSesiones)) {
            session_save_path($rutaSesiones);
        }

        // El recolector no debe borrar sesiones antes que la regla de inactividad.
        ini_set('session.gc_maxlifetime', (string) (self::INACTIVIDAD_SEG + 300));

        // El prefijo __Host- obliga a Secure: en HTTP local el navegador
        // descarta la cookie y la sesión nunca arranca. Se usa solo con HTTPS.
        session_name($seguro ? '__Host-didi2' : 'didi2_sess');
        session_start();

        self::expirar();
    }

    /** Cierra la sesión si pasó demasiado tiempo inactiva o vivió demasiado. */
    private static function expirar(): void
    {
        $ahora = time();
        $recordar = (int) ($_SESSION['recordar'] ?? 0);
        $persistente = $recordar > $ahora;

        if (! $persistente && isset($_SESSION['ultima_actividad']) && ($ahora - (int) $_SESSION['ultima_actividad']) > self::INACTIVIDAD_SEG) {
            self::destruir();

            return;
        }

        if (! $persistente && isset($_SESSION['inicio']) && ($ahora - (int) $_SESSION['inicio']) > self::ABSOLUTA_SEG) {
            self::destruir();

            return;
        }

        $_SESSION['ultima_actividad'] = $ahora;
        $_SESSION['inicio'] ??= $ahora;
    }

    /**
     * «Mantener sesión»: cookie persistente de 30 días y sin caducidad por
     * inactividad mientras el plazo siga vivo. Sin el flag, la sesión sigue
     * siendo de 30 minutos y sólo de navegador.
     */
    public static function recordar(bool $activo = true): void
    {
        if (session_status() !== PHP_SESSION_ACTIVE) {
            return;
        }

        if (! $activo) {
            unset($_SESSION['recordar']);

            return;
        }

        $_SESSION['recordar'] = time() + self::RECORDAR_SEG;

        $p = session_get_cookie_params();
        setcookie(session_name(), session_id(), [
            'expires'  => time() + self::RECORDAR_SEG,
            'path'     => $p['path'],
            'domain'   => $p['domain'],
            'secure'   => $p['secure'],
            'httponly' => $p['httponly'],
            'samesite' => $p['samesite'],
        ]);

        ini_set('session.gc_maxlifetime', (string) (self::RECORDAR_SEG + 300));
    }

    public static function poner(string $clave, mixed $valor): void
    {
        $_SESSION[$clave] = $valor;
    }

    public static function obtener(string $clave, mixed $porDefecto = null): mixed
    {
        return $_SESSION[$clave] ?? $porDefecto;
    }

    public static function olvidar(string $clave): void
    {
        unset($_SESSION[$clave]);
    }

    public static function destruir(): void
    {
        $_SESSION = [];

        if (ini_get('session.use_cookies')) {
            $p = session_get_cookie_params();
            setcookie(session_name(), '', [
                'expires'  => time() - 42000,
                'path'     => $p['path'],
                'domain'   => $p['domain'],
                'secure'   => $p['secure'],
                'httponly' => $p['httponly'],
                'samesite' => $p['samesite'],
            ]);
        }

        session_destroy();
    }

    public static function regenerar(): void
    {
        session_regenerate_id(true);
    }
}
