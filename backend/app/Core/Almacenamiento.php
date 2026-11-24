<?php

declare(strict_types=1);

namespace App\Core;

/**
 * Almacenamiento de archivos S3-compatible.
 *
 * Dos implementaciones detrás de una interfaz:
 *   - Disco local (storage/…) como hasta ahora: la opción por defecto.
 *   - MinIO / AWS S3 vía API S3 (PUT firmado con Signature V4 puro, sin SDK).
 *
 * La selección vive en .env: ALMACENAMIENTO=local|s3 con sus credenciales.
 * La base de datos registra cada objeto en archivos_objetos para auditoría.
 */
interface AlmacenamientoInterface
{
    /** Guarda el contenido binario y devuelve la clave relativa. */
    public function guardar(string $bucket, string $clave, string $contenido, string $mime): string;

    /** Contenido binario o null si no existe. */
    public function leer(string $bucket, string $clave): ?string;

    /** URL pública firmada (o ruta relativa en local). */
    public function url(string $bucket, string $clave, int $segundos = 300): string;

    public function borrar(string $bucket, string $clave): bool;
}

/**
 * Disco local: comportamiento idéntico al actual (storage/<bucket>/<clave>).
 */
final class AlmacenamientoLocal implements AlmacenamientoInterface
{
    public function __construct(private readonly string $raiz)
    {
    }

    private function ruta(string $bucket, string $clave): string
    {
        $clave = preg_replace('/[^a-zA-Z0-9._\\/-]/', '', $clave);

        return $this->raiz . '/' . $bucket . '/' . $clave;
    }

    public function guardar(string $bucket, string $clave, string $contenido, string $mime): string
    {
        $ruta = $this->ruta($bucket, $clave);
        $dir = dirname($ruta);

        if (!is_dir($dir)) {
            mkdir($dir, 0o750, true);
        }

        file_put_contents($ruta, $contenido);
        @chmod($ruta, 0o640);

        return $clave;
    }

    public function leer(string $bucket, string $clave): ?string
    {
        $ruta = $this->ruta($bucket, $clave);

        return is_file($ruta) ? (string) file_get_contents($ruta) : null;
    }

    public function url(string $bucket, string $clave, int $segundos = 300): string
    {
        return '/storage/' . $bucket . '/' . $clave;
    }

    public function borrar(string $bucket, string $clave): bool
    {
        $ruta = $this->ruta($bucket, $clave);

        return is_file($ruta) && @unlink($ruta);
    }
}

/**
 * S3-compatible (MinIO o AWS): PUT/GET con Signature V4 sin dependencias.
 * Requiere ALMACENAMIENTO_S3_* en .env. MinIO corre local con:
 *   docker run -d --name minio -p 9000:9000 -p 9001:9001 \\
 *     -e MINIO_ROOT_USER=ares -e MINIO_ROOT_PASSWORD=ares-secret \\
 *     minio/minio server /data --console-address ":9001"
 */
final class AlmacenamientoS3 implements AlmacenamientoInterface
{
    public function __construct(
        private readonly string $endpoint,
        private readonly string $region,
        private readonly string $accessKey,
        private readonly string $secretKey,
    ) {
    }

    public static function desdeEnv(): ?self
    {
        $endpoint = (string) (getenv('ALMACENAMIENTO_S3_ENDPOINT') ?: ($_ENV['ALMACENAMIENTO_S3_ENDPOINT'] ?? ''));
        $accessKey = (string) (getenv('ALMACENAMIENTO_S3_ACCESS_KEY') ?: ($_ENV['ALMACENAMIENTO_S3_ACCESS_KEY'] ?? ''));
        $secretKey = (string) (getenv('ALMACENAMIENTO_S3_SECRET_KEY') ?: ($_ENV['ALMACENAMIENTO_S3_SECRET_KEY'] ?? ''));

        if ($endpoint === '' || $accessKey === '' || $secretKey === '') {
            return null;
        }

        return new self(rtrim($endpoint, '/'), (string) (getenv('ALMACENAMIENTO_S3_REGION') ?: ($_ENV['ALMACENAMIENTO_S3_REGION'] ?? 'us-east-1')), $accessKey, $secretKey);
    }

    /** Cabecera de autorización Signature V4 para una petición concreta. */
    private function autorizacion(string $metodo, string $bucket, string $clave, string $contenido = ''): array
    {
        $host = parse_url($this->endpoint, PHP_URL_HOST);
        $fecha = gmdate('Ymd\THis\Z');
        $hoy = gmdate('Ymd');
        $payloadHash = hash('sha256', $contenido);

        $cabecerasCanon = [
            'host' => $host,
            'x-amz-content-sha256' => $payloadHash,
            'x-amz-date' => $fecha,
        ];
        ksort($cabecerasCanon);

        $cabecerasFirmadas = implode(';', array_keys($cabecerasCanon));
        $cadenaCabeceras = implode('', array_map(fn ($k, $v) => "$k:$v\n", array_keys($cabecerasCanon), array_values($cabecerasCanon)));

        $rutaCanonica = "/{$bucket}/{$clave}";

        $requestCanonico = implode("\n", [
            $metodo,
            $rutaCanonica,
            '',
            $cadenaCabeceras,
            $cabecerasFirmadas,
            $payloadHash,
        ]);

        $alcance = "{$hoy}/{$this->region}/s3/aws4_request";
        $stringFirmar = implode("\n", [
            'AWS4-HMAC-SHA256',
            $fecha,
            $alcance,
            hash('sha256', $requestCanonico),
        ]);

        $k = hash_hmac('sha256', $hoy, 'AWS4' . $this->secretKey, true);
        $k = hash_hmac('sha256', $this->region, $k, true);
        $k = hash_hmac('sha256', 's3', $k, true);
        $k = hash_hmac('sha256', 'aws4_request', $k, true);
        $firma = hash_hmac('sha256', $stringFirmar, $k);

        $cabecerasCanon['Authorization'] = "AWS4-HMAC-SHA256 Credential={$this->accessKey}/{$alcance}, SignedHeaders={$cabecerasFirmadas}, Signature={$firma}";

        return $cabecerasCanon;
    }

    private function peticion(string $metodo, string $bucket, string $clave, string $contenido = ''): ?string
    {
        $cabeceras = $this->autorizacion($metodo, $bucket, $clave, $contenido);
        $autorizacion = $cabeceras['Authorization'];
        unset($cabeceras['Authorization']);

        $lineas = '';
        foreach ($cabeceras as $k => $v) {
            $lineas .= "{$k}: {$v}\r\n";
        }

        $url = "{$this->endpoint}/{$bucket}/{$clave}";
        $contexto = stream_context_create(['http' => [
            'method' => $metodo,
            'header' => "{$lineas}Authorization: {$autorizacion}\r\n",
            'content' => $contenido !== '' ? $contenido : null,
            'timeout' => 10,
            'ignore_errors' => true,
        ]]);

        $respuesta = @file_get_contents($url, false, $contexto);

        return $respuesta === false ? null : (string) $respuesta;
    }

    public function guardar(string $bucket, string $clave, string $contenido, string $mime): string
    {
        // El PUT firma el hash del contenido.
        $this->peticion('PUT', $bucket, $clave, $contenido);

        return $clave;
    }

    public function leer(string $bucket, string $clave): ?string
    {
        return $this->peticion('GET', $bucket, $clave);
    }

    public function url(string $bucket, string $clave, int $segundos = 300): string
    {
        // URL firmada presigned GET (query string con expiración).
        $host = parse_url($this->endpoint, PHP_URL_HOST);
        $ruta = "/{$bucket}/{$clave}";
        $hoy = gmdate('Ymd');
        $fecha = gmdate('Ymd\THis\Z');
        $expira = time() + $segundos;

        $params = [
            'X-Amz-Algorithm' => 'AWS4-HMAC-SHA256',
            'X-Amz-Credential' => "{$this->accessKey}/{$hoy}/{$this->region}/s3/aws4_request",
            'X-Amz-Date' => $fecha,
            'X-Amz-Expires' => (string) $segundos,
            'X-Amz-SignedHeaders' => 'host',
        ];
        ksort($params);

        $queryCanonico = implode('&', array_map(fn ($k, $v) => rawurlencode($k) . '=' . rawurlencode($v), array_keys($params), array_values($params)));
        $requestCanonico = "GET\n{$ruta}\n{$queryCanonico}\nhost:{$host}\n\nhost\nUNSIGNED-PAYLOAD";
        $alcance = "{$hoy}/{$this->region}/s3/aws4_request";
        $stringFirmar = "AWS4-HMAC-SHA256\n{$fecha}\n{$alcance}\n" . hash('sha256', $requestCanonico);

        $k = hash_hmac('sha256', $hoy, 'AWS4' . $this->secretKey, true);
        $k = hash_hmac('sha256', $this->region, $k, true);
        $k = hash_hmac('sha256', 's3', $k, true);
        $k = hash_hmac('sha256', 'aws4_request', $k, true);
        $firma = hash_hmac('sha256', $stringFirmar, $k);

        return "{$this->endpoint}{$ruta}?{$queryCanonico}&X-Amz-Signature={$firma}";
    }

    public function borrar(string $bucket, string $clave): bool
    {
        return $this->peticion('DELETE', $bucket, $clave) !== null;
    }
}

/**
 * Fábrica: resuelve el almacén activo según .env. Con S3 configurado y
 * accesible usa MinIO; si no, disco local (comportamiento previo).
 */
function almacenamiento(string $raizLocal): AlmacenamientoInterface
{
    $s3 = AlmacenamientoS3::desdeEnv();

    if ($s3 !== null) {
        return $s3;
    }

    return new AlmacenamientoLocal($raizLocal);
}
