<?php

declare(strict_types=1);

namespace App\Core;

/**
 * JWT (JSON Web Token) con firma HS256 — RFC 7519.
 *
 * Implementación propia sin dependencias externas: el algoritmo es corto y
 * auditable. Se usa para autenticar la SPA por cabecera Authorization: Bearer,
 * además de la cookie de sesión (que queda como respaldo para navegadores
 * que bloquean localStorage).
 *
 * - access_token: vida corta (30 min), viaja en cada petición.
 * - refresh_token: vida larga (30 días), solo renueva el access token.
 */
final class Jwt
{
    private const ALG = 'HS256';

    /** Emite un token firmado. $carguio debe llevar exp como timestamp Unix. */
    public static function emitir(array $carguio, ?string $clave = null): string
    {
        $clave ??= self::clave();
        $carguio += ['iat' => time(), 'iss' => 'ares-b2b'];
        ksort($carguio);

        $segmentos = [
            self::b64url((string) json_encode(['alg' => self::ALG, 'typ' => 'JWT'], JSON_THROW_ON_ERROR)),
            self::b64url((string) json_encode($carguio, JSON_THROW_ON_ERROR)),
        ];

        $firma = hash_hmac('sha256', implode('.', $segmentos), $clave, true);
        $segmentos[] = self::b64url($firma);

        return implode('.', $segmentos);
    }

    /**
     * Verifica firma y vigencia. Devuelve el payload como array o null si el
     * token es inválido, está expirado o cambió de emisor.
     */
    public static function verificar(string $token, ?string $clave = null): ?array
    {
        $clave ??= self::clave();
        $partes = explode('.', $token);

        if (count($partes) !== 3) {
            return null;
        }

        [$cab, $car, $fir] = $partes;
        $esperada = self::b64url(hash_hmac('sha256', $cab . '.' . $car, $clave, true));

        // hash_equals: comparación en tiempo constante (evita timing attacks).
        if (!hash_equals($esperada, $fir)) {
            return null;
        }

        $carguio = json_decode(self::b64url_inverso($car), true);

        if (!is_array($carguio)) {
            return null;
        }

        if (($carguio['iss'] ?? '') !== 'ares-b2b') {
            return null;
        }

        if (isset($carguio['exp']) && time() >= (int) $carguio['exp']) {
            return null;
        }

        return $carguio;
    }

    /** Clave de firma desde el entorno (.env APP_KEY). */
    private static function clave(): string
    {
        $clave = (string) ($_ENV['APP_KEY'] ?? getenv('APP_KEY'));

        if ($clave === '') {
            throw new \RuntimeException('APP_KEY no definida: no se puede firmar JWT.');
        }

        return $clave;
    }

    private static function b64url(string $dato): string
    {
        return rtrim(strtr(base64_encode($dato), '+/', '-_'), '=');
    }

    private static function b64url_inverso(string $dato): string
    {
        return (string) base64_decode(strtr($dato, '-_', '+/'), true);
    }
}
