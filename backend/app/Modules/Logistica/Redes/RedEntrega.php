<?php

declare(strict_types=1);

namespace App\Modules\Logistica\Redes;

/**
 * Contrato de una red externa de reparto (Uber Direct, Borzo, 99minutos…).
 *
 * El flujo de rescate (RN-07b): cuando la ronda 3 de ofertas se agota sin
 * repartidor propio, el worker pide cotización; si el costo cabe en el tope
 * configurado, se crea el delivery y el envío queda "rescatado" por la red.
 * Los estados llegan por webhook y se mapean a los estados del pedido.
 */
interface RedEntregaInterface
{
    /** Código de la red (red_codigo en envios). */
    public function codigo(): string;

    /**
     * Precio de la entrega o null si la red no cubre el trayecto.
     *
     * @return array{costo:float, eta_min:int|null}|null
     */
    public function cotizar(float $origenLat, float $origenLng, float $destinoLat, float $destinoLng, float $pesoKg): ?array;

    /**
     * Crea la orden de entrega. Devuelve la referencia externa y el costo.
     *
     * @return array{referencia:string, costo:float}|null
     */
    public function crear(float $origenLat, float $origenLng, string $origenDomicilio,
                          float $destinoLat, float $destinoLng, string $destinoDomicilio,
                          string $referenciaInterna, string $telefonoDestino): ?array;

    /** Estado crudo de la orden externa. */
    public function estado(string $referencia): ?string;

    /** Cancela la orden externa; true si la red la aceptó. */
    public function cancelar(string $referencia): bool;
}

/**
 * Adaptador de demostración: contesta con valores plausibles sin llamar a
 * nadie. Sirve para desarrollar el flujo de rescate y para QA sin
 * credenciales. Se activa con red.codigo=demo.
 */
final class RedDemo implements RedEntregaInterface
{
    public function codigo(): string
    {
        return 'demo';
    }

    public function cotizar(float $origenLat, float $origenLng, float $destinoLat, float $destinoLng, float $pesoKg): ?array
    {
        $haversine = acos(min(1.0, sin(deg2rad($origenLat)) * sin(deg2rad($destinoLat))
            + cos(deg2rad($origenLat)) * cos(deg2rad($destinoLat)) * cos(deg2rad($origenLng - $destinoLng)))) * 6371;

        return ['costo' => round(35 + $haversine * 9, 2), 'eta_min' => max(15, (int) ceil($haversine * 4))];
    }

    public function crear(float $origenLat, float $origenLng, string $origenDomicilio,
                          float $destinoLat, float $destinoLng, string $destinoDomicilio,
                          string $referenciaInterna, string $telefonoDestino): ?array
    {
        return ['referencia' => 'DEMO-' . strtoupper(substr(md5($referenciaInterna . microtime()), 0, 10)), 'costo' => 49.00];
    }

    public function estado(string $referencia): ?string
    {
        return 'en_curso';
    }

    public function cancelar(string $referencia): bool
    {
        return true;
    }
}

/**
 * Adaptador Uber Direct (Delivery API). Requiere credenciales en .env:
 *   UBER_DIRECT_CUSTOMER_ID, UBER_DIRECT_CLIENT_ID, UBER_DIRECT_CLIENT_SECRET
 * El webhook de estados llega a /api/logistica/red/uber/webhook.
 */
final class RedUberDirect implements RedEntregaInterface
{
    private ?string $token = null;

    public function __construct(
        private readonly string $customerId,
        private readonly string $clientId,
        private readonly string $clientSecret,
    ) {
    }

    public static function desdeEnv(): ?self
    {
        $customerId = (string) (getenv('UBER_DIRECT_CUSTOMER_ID') ?: ($_ENV['UBER_DIRECT_CUSTOMER_ID'] ?? ''));
        $clientId = (string) (getenv('UBER_DIRECT_CLIENT_ID') ?: ($_ENV['UBER_DIRECT_CLIENT_ID'] ?? ''));
        $secret = (string) (getenv('UBER_DIRECT_CLIENT_SECRET') ?: ($_ENV['UBER_DIRECT_CLIENT_SECRET'] ?? ''));

        if ($customerId === '' || $clientId === '' || $secret === '') {
            return null;
        }

        return new self($customerId, $clientId, $secret);
    }

    public function codigo(): string
    {
        return 'uber';
    }

    private function token(): ?string
    {
        if ($this->token !== null) {
            return $this->token;
        }

        $contexto = stream_context_create(['http' => [
            'method'  => 'POST',
            'header'  => "Content-Type: application/x-www-form-urlencoded\r\n",
            'content' => http_build_query([
                'grant_type' => 'client_credentials',
                'client_id' => $this->clientId,
                'client_secret' => $this->clientSecret,
                'scope' => 'delivery',
            ]),
            'timeout' => 5,
            'ignore_errors' => true,
        ]]);

        $respuesta = @file_get_contents('https://login.uber.com/oauth/v2/token', false, $contexto);
        $datos = $respuesta === false ? null : json_decode($respuesta, true);

        return $this->token = is_array($datos) ? ($datos['access_token'] ?? null) : null;
    }

    public function cotizar(float $origenLat, float $origenLng, float $destinoLat, float $destinoLng, float $pesoKg): ?array
    {
        // La v1 de Uber Direct cobra por cotización de ruta: aquí se usa una
        // estimación prudente; el costo real llega al crear la orden.
        $haversine = acos(min(1.0, sin(deg2rad($origenLat)) * sin(deg2rad($destinoLat))
            + cos(deg2rad($origenLat)) * cos(deg2rad($destinoLat)) * cos(deg2rad($origenLng - $destinoLng)))) * 6371;

        return ['costo' => round(55 + $haversine * 12, 2), 'eta_min' => max(20, (int) ceil($haversine * 5))];
    }

    public function crear(float $origenLat, float $origenLng, string $origenDomicilio,
                          float $destinoLat, float $destinoLng, string $destinoDomicilio,
                          string $referenciaInterna, string $telefonoDestino): ?array
    {
        $token = $this->token();

        if ($token === null) {
            return null;
        }

        $cuerpo = json_encode([
            'pickup' => [
                'address' => ['address_line_1' => $origenDomicilio, 'lat' => $origenLat, 'lng' => $origenLng],
            ],
            'dropoff' => [
                'address' => ['address_line_1' => $destinoDomicilio, 'lat' => $destinoLat, 'lng' => $destinoLng],
                'contact' => ['phone' => '+52' . ltrim($telefonoDestino, '+52'), 'send_first_four_sms_notifications' => true],
            ],
            'external_id' => $referenciaInterna,
        ], JSON_UNESCAPED_UNICODE);

        if ($cuerpo === false) {
            return null;
        }

        $contexto = stream_context_create(['http' => [
            'method' => 'POST',
            'header' => "Content-Type: application/json\r\nAuthorization: Bearer {$token}\r\n",
            'content' => $cuerpo,
            'timeout' => 8,
            'ignore_errors' => true,
        ]]);

        $respuesta = @file_get_contents(
            "https://api.uber.com/v1/customers/{$this->customerId}/deliveries",
            false,
            $contexto,
        );

        $datos = $respuesta === false ? null : json_decode($respuesta, true);

        if (!is_array($datos) || !isset($datos['id'], $datos['fee'])) {
            return null;
        }

        return ['referencia' => (string) $datos['id'], 'costo' => ((int) $datos['fee']) / 100];
    }

    public function estado(string $referencia): ?string
    {
        $token = $this->token();

        if ($token === null) {
            return null;
        }

        $contexto = stream_context_create(['http' => [
            'header' => "Authorization: Bearer {$token}\r\n",
            'timeout' => 5,
            'ignore_errors' => true,
        ]]);

        $respuesta = @file_get_contents(
            "https://api.uber.com/v1/customers/{$this->customerId}/deliveries/{$referencia}",
            false,
            $contexto,
        );

        $datos = $respuesta === false ? null : json_decode($respuesta, true);

        return is_array($datos) ? ($datos['status'] ?? null) : null;
    }

    public function cancelar(string $referencia): bool
    {
        $token = $this->token();

        if ($token === null) {
            return false;
        }

        $contexto = stream_context_create(['http' => [
            'method' => 'POST',
            'header' => "Authorization: Bearer {$token}\r\n",
            'content' => '{}',
            'timeout' => 5,
            'ignore_errors' => true,
        ]]);

        $respuesta = @file_get_contents(
            "https://api.uber.com/v1/customers/{$this->customerId}/deliveries/{$referencia}/cancel",
            false,
            $contexto,
        );

        return $respuesta !== false;
    }
}

/**
 * Fábrica: resuelve la red configurada. Con credenciales de Uber en .env
 * devuelve ese adaptador; con la demo activa, RedDemo; sin nada, null.
 */
function red_activa(PDO $pdo): ?RedEntregaInterface
{
    $uber = RedUberDirect::desdeEnv();

    if ($uber !== null) {
        return $uber;
    }

    $stmt = $pdo->prepare("SELECT valor_actual FROM parametros WHERE clave = 'red.codigo' LIMIT 1");
    $stmt->execute();
    $codigo = (string) ($stmt->fetchColumn() ?: '');

    return $codigo === 'demo' ? new RedDemo() : null;
}
