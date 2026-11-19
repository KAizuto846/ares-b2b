<?php

declare(strict_types=1);

/**
 * Utilidades compartidas por los módulos JSON de la SPA.
 *
 * Cada archivo de app/Api/<modulo>.php se incluye desde public/api.php dentro
 * del try, así que ve $API, $pdo, $ruta, $metodo y $cuerpo.
 */

/** Contexto que public/api.php publica para los módulos. */
function api_ctx(): array
{
    return $GLOBALS['API'] ?? [];
}

function api_pdo(): PDO
{
    return api_ctx()['pdo'];
}

function api_uid(): int
{
    return (int) api_ctx()['uid'];
}

function api_rol(): string
{
    return (string) (api_ctx()['rol'] ?? '');
}

function api_cuerpo(): array
{
    return (array) (api_ctx()['cuerpo'] ?? []);
}

/** 403 si el rol actual no está en la lista. Acepta prefijo «admin». */
function api_exigir(string ...$roles): void
{
    $rol = api_rol();
    foreach ($roles as $r) {
        if ($r === 'admin' ? str_starts_with($rol, 'admin') : $rol === $r) {
            return;
        }
    }

    fallo('Tu cuenta no tiene permiso para esta acción.', 403, 'SIN_PERMISO');
}

/** Id de comercios_perfil del usuario en sesión. */
function api_comercio_id(): int
{
    $stmt = api_pdo()->prepare('SELECT id FROM comercios_perfil WHERE usuario_id = ? LIMIT 1');
    $stmt->execute([api_uid()]);

    return (int) ($stmt->fetchColumn() ?: 0);
}

/** Id de mayoristas_perfil del usuario en sesión. */
function api_mayorista_id(): int
{
    $stmt = api_pdo()->prepare('SELECT id FROM mayoristas_perfil WHERE usuario_id = ? LIMIT 1');
    $stmt->execute([api_uid()]);

    return (int) ($stmt->fetchColumn() ?: 0);
}

/** Id de repartidores_perfil del usuario en sesión. */
function api_repartidor_id(): int
{
    $stmt = api_pdo()->prepare('SELECT id FROM repartidores_perfil WHERE usuario_id = ? LIMIT 1');
    $stmt->execute([api_uid()]);

    return (int) ($stmt->fetchColumn() ?: 0);
}

/** Comprueba que un pedido pertenece al usuario según su rol. Devuelve la fila. */
function api_pedido_propio(string $uuid): array
{
    $pdo = api_pdo();
    $rol = api_rol();
    $sql = 'SELECT p.* FROM pedidos p WHERE p.uuid = ? LIMIT 1';
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$uuid]);
    $pedido = $stmt->fetch() ?: [];

    if ($pedido === []) {
        fallo('Pedido no encontrado.', 404, 'NO_ENCONTRADO');
    }

    if (str_starts_with($rol, 'admin')) {
        return $pedido;
    }

    $propio = match ($rol) {
        'comercio'  => (int) $pedido['comercio_id'] === api_comercio_id(),
        'mayorista' => (int) $pedido['mayorista_id'] === api_mayorista_id(),
        'repartidor' => (static function () use ($pedido): bool {
            $stmt = api_pdo()->prepare('SELECT 1 FROM envios WHERE pedido_id = ? AND repartidor_id IN (?, ?) LIMIT 1');
            $stmt->execute([(int) $pedido['id'], api_uid(), api_repartidor_id()]);

            return (bool) $stmt->fetchColumn();
        })(),
        default     => false,
    };

    if (!$propio) {
        fallo('Ese pedido no es tuyo.', 403, 'SIN_PERMISO');
    }

    return $pedido;
}

/** Parámetro de query con valor por defecto, recortado. */
function api_q(string $clave, string $defecto = ''): string
{
    return trim((string) ($_GET[$clave] ?? $defecto));
}

/** Entero de query acotado. */
function api_qint(string $clave, int $defecto, int $min = 0, int $max = PHP_INT_MAX): int
{
    $v = filter_var($_GET[$clave] ?? null, FILTER_VALIDATE_INT);
    if ($v === false || $v === null) {
        return $defecto;
    }

    return max($min, min($max, (int) $v));
}

/** true si el cuerpo pide confirmación explícita. */
function api_bool(string $clave, bool $defecto = false): bool
{
    return (bool) (api_cuerpo()[$clave] ?? $defecto);
}

/** Fecha ISO corta para la SPA. */
function api_fecha(?string $fecha): string
{
    if (!$fecha) {
        return '';
    }
    $ts = strtotime($fecha);

    return $ts ? date('Y-m-d H:i', $ts) : (string) $fecha;
}
