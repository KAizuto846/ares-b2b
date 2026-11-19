<?php

declare(strict_types=1);

/**
 * Centro de mensajes de la SPA.
 *
 * Cubre lo que en el panel hacían `Views/mensajes/index.php` y el
 * `MensajeController`: bandeja de conversaciones, hilo abierto (con marcado de
 * leído), envío, conversación directa, canal de soporte, borrado por usuario y
 * la pestaña de avisos del sitio.
 *
 * Reglas de negocio que este archivo hace cumplir:
 *  - Toda lectura comprueba participación (y el repositorio lo vuelve a hacer).
 *  - «Eliminar» solo pone `oculta = 1` en la fila del que borra: nunca se
 *    borran mensajes ni se afecta a la otra persona.
 *  - Al enviar se llama a `mostrar()`: un hilo oculto vuelve a la bandeja.
 *  - En un hilo de soporte el usuario nunca ve qué administrador respondió.
 *
 * Cualquier usuario con sesión puede usar la mensajería; el rol solo cambia
 * qué se muestra, no si se permite. Cada ruta decide y ninguna queda abierta.
 */

use App\Core\AuditLogger;
use App\Modules\Mensajes\MensajeRepository;
use App\Modules\Mensajes\MensajeService;
use App\Modules\Notificaciones\NotificacionService;

// Ayudas compartidas. api.php salta los archivos que empiezan por «_», así que
// cada módulo se trae _comun.php (require_once: no cuesta nada repetirlo).
require_once __DIR__ . '/_comun.php';

$msgRuta = (string) (api_ctx()['ruta'] ?? '');
$msgMetodo = (string) (api_ctx()['metodo'] ?? 'GET');

// Este módulo atiende /mensajes… y /notificaciones; el resto le pasa el control.
if ($msgRuta !== '/notificaciones' && !str_starts_with($msgRuta, '/mensajes')) {
    return;
}

$msgPdo = api_pdo();
$msgYo = api_uid();
$msgRol = api_rol();
$msgIp = (string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');

$msgRepo = new MensajeRepository($msgPdo);
$msgAvisos = new NotificacionService($msgPdo, __DIR__ . '/../../storage/correos');
$msgServicio = new MensajeService($msgRepo, $msgAvisos, new AuditLogger($msgPdo));

/**
 * La pestaña de avisos es de noticias del sitio: los mensajes ya se ven en
 * Conversaciones y un código de recuperación no es una noticia.
 */
$msgEsAvisoDelSitio = static function (array $a): bool {
    $tipo = (string) ($a['tipo'] ?? '');

    return !str_starts_with($tipo, 'mensaje_') && $tipo !== 'recuperacion';
};

/** @return array<int, array<string, mixed>> */
$msgListaAvisos = static function (int $usuarioId, int $limite = 50) use ($msgAvisos, $msgEsAvisoDelSitio): array {
    $salida = [];

    foreach ($msgAvisos->bandeja($usuarioId, $limite) as $a) {
        if (!$msgEsAvisoDelSitio($a)) {
            continue;
        }

        $salida[] = [
            'id'     => (int) $a['id'],
            'tipo'   => (string) $a['tipo'],
            'asunto' => (string) $a['asunto'],
            'cuerpo' => trim((string) ($a['cuerpo'] ?? '')),
            'enlace' => trim((string) ($a['enlace'] ?? '')),
            'cuando' => api_fecha((string) $a['created_at']),
            'leido'  => ((string) ($a['estado'] ?? '')) === 'leido',
        ];
    }

    return $salida;
};

/** Cuenta los avisos sin leer de una lista ya filtrada. */
$msgSinLeerAvisos = static function (array $avisos): int {
    $total = 0;
    foreach ($avisos as $a) {
        if (empty($a['leido'])) {
            $total++;
        }
    }

    return $total;
};

/** Nombre visible de un autor, sin filtrar datos de administración. */
$msgNombreAutor = static function (array $fila): string {
    foreach (['nombre_negocio', 'nombre_comercial'] as $clave) {
        $valor = trim((string) ($fila[$clave] ?? ''));
        if ($valor !== '') {
            return $valor;
        }
    }

    return (string) ($fila['email'] ?? 'Usuario');
};

// --------------------------------------------------------------- resumen
// El Shell lo pide en cada cambio de ruta: una sola consulta, sin agregados.
if ($msgRuta === '/mensajes/resumen' && $msgMetodo === 'GET') {
    $stmt = $msgPdo->prepare(
        'SELECT COUNT(*) FROM mensajes_directos m
           JOIN conversacion_participantes p
             ON p.conversacion_id = m.conversacion_id AND p.usuario_id = ?
          WHERE p.oculta = 0 AND m.autor_id <> ? AND m.id > p.ultimo_leido_id'
    );
    $stmt->execute([$msgYo, $msgYo]);

    responder(['ok' => true, 'sin_leer' => (int) $stmt->fetchColumn()]);
}

// ------------------------------------------------------- configuración
// Interruptor maestro de avisos: única fuente de verdad (preferencias_usuario).
if ($msgRuta === '/mensajes/config' && $msgMetodo === 'GET') {
    responder(['ok' => true, 'activas' => $msgAvisos->notificacionesActivas($msgYo)]);
}

if ($msgRuta === '/mensajes/config' && $msgMetodo === 'POST') {
    $cuerpo = api_cuerpo();

    if (!array_key_exists('notificaciones', $cuerpo)) {
        fallo('Indica si quieres recibir avisos.', 422, 'DATOS_FALTANTES');
    }

    $activas = (bool) $cuerpo['notificaciones'] ? 1 : 0;

    $msgPdo->prepare(
        'INSERT INTO preferencias_usuario (usuario_id, notificaciones) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE notificaciones = VALUES(notificaciones), actualizado_at = NOW()'
    )->execute([$msgYo, $activas]);

    responder(['ok' => true, 'activas' => $activas === 1]);
}

// ------------------------------------------------------------ avisos
if ($msgRuta === '/notificaciones' && $msgMetodo === 'GET') {
    $avisos = $msgListaAvisos($msgYo);
    $sinLeer = $msgSinLeerAvisos($avisos);

    // Se marcan después de leerlos, para que el aviso nuevo salga resaltado
    // la primera vez que se abre la pestaña (igual que el panel PHP).
    $msgAvisos->marcarLeidas($msgYo);

    responder([
        'ok'      => true,
        'avisos'  => $avisos,
        'sin_leer' => $sinLeer,
        'activas' => $msgAvisos->notificacionesActivas($msgYo),
    ]);
}

// ------------------------------------------------------------- bandeja
if ($msgRuta === '/mensajes' && $msgMetodo === 'GET') {
    $tab = api_q('tab', 'conversaciones');

    if (!in_array($tab, ['conversaciones', 'notificaciones'], true)) {
        $tab = 'conversaciones';
    }

    if ($tab === 'notificaciones') {
        $avisos = $msgListaAvisos($msgYo);
        $sinLeer = $msgSinLeerAvisos($avisos);
        $msgAvisos->marcarLeidas($msgYo);

        responder([
            'ok'       => true,
            'tab'      => 'notificaciones',
            'avisos'   => $avisos,
            'sin_leer' => $sinLeer,
            'activas'  => $msgAvisos->notificacionesActivas($msgYo),
        ]);
    }

    $hilos = [];

    foreach ($msgServicio->bandeja($msgYo) as $h) {
        $esSoporte = ((string) $h['tipo']) === 'soporte';

        $hilos[] = [
            'uuid'   => (string) $h['uuid'],
            'tipo'   => (string) $h['tipo'],
            'titulo' => $esSoporte ? 'Soporte Didi2' : (string) $h['titulo'],
            'avatar' => $esSoporte ? null : ($h['avatar'] ?? null),
            // En soporte no se expone con qué administrador se habla.
            'interlocutor_id' => $esSoporte ? null : ($h['interlocutor_id'] ?? null),
            'ultimo'    => $h['ultimo'] !== null ? mb_substr((string) $h['ultimo'], 0, 90) : '',
            'ultimo_at' => $h['ultimo_at'] !== null ? api_fecha((string) $h['ultimo_at']) : '',
            'created_at' => api_fecha((string) $h['created_at']),
            'no_leidos' => (int) ($h['no_leidos'] ?? 0),
        ];
    }

    // Contactos para el diálogo «Nueva conversación» (mismo criterio que el
    // panel: usuarios activos con rol comercio o mayorista).
    $contactos = [];
    foreach ($msgServicio->contactos($msgYo) as $c) {
        $contactos[] = [
            'id'     => (int) $c['id'],
            'nombre' => (string) $c['nombre'],
            'rol'    => (string) $c['rol'],
        ];
    }

    responder([
        'ok'        => true,
        'tab'       => 'conversaciones',
        'hilos'     => $hilos,
        'contactos' => $contactos,
        'es_admin'  => $msgServicio->esAdmin($msgYo),
    ]);
}

// --------------------------------------------------------------- enviar
if ($msgRuta === '/mensajes/enviar' && $msgMetodo === 'POST') {
    $cuerpo = api_cuerpo();
    $uuid = trim((string) ($cuerpo['conversacion'] ?? $cuerpo['hilo'] ?? ''));
    $texto = (string) ($cuerpo['cuerpo'] ?? '');

    if ($uuid === '') {
        fallo('Indica a qué conversación quieres enviar.', 422, 'DATOS_FALTANTES');
    }

    $resultado = $msgServicio->enviar($msgYo, $uuid, $texto, $msgIp);

    if (!$resultado['ok']) {
        fallo((string) $resultado['mensaje'], 422, 'NO_ENVIADO');
    }

    $stmt = $msgPdo->prepare('SELECT id, cuerpo, created_at FROM mensajes_directos WHERE id = ? LIMIT 1');
    $stmt->execute([(int) $resultado['id']]);
    $fila = $stmt->fetch() ?: [];

    responder([
        'ok'      => true,
        'mensaje' => [
            'id'         => (int) $resultado['id'],
            'cuerpo'     => (string) ($fila['cuerpo'] ?? trim($texto)),
            'created_at' => api_fecha((string) ($fila['created_at'] ?? '')),
            'autor'      => 'Tú',
            'mio'        => true,
        ],
    ]);
}

// -------------------------------------------------------------- directo
// Abre (o reutiliza) la conversación directa con otro usuario. Acepta
// `usuario_id` o `pedido_uuid` (desde la ficha de un pedido).
if ($msgRuta === '/mensajes/directo' && $msgMetodo === 'POST') {
    $cuerpo = api_cuerpo();
    $otro = (int) ($cuerpo['usuario_id'] ?? 0);
    $pedidoUuid = trim((string) ($cuerpo['pedido_uuid'] ?? ''));

    if ($otro <= 0 && $pedidoUuid !== '') {
        $pedido = api_pedido_propio($pedidoUuid);

        if ($msgRol === 'comercio') {
            $stmt = $msgPdo->prepare('SELECT usuario_id FROM mayoristas_perfil WHERE id = ? LIMIT 1');
            $stmt->execute([(int) $pedido['mayorista_id']]);
        } elseif ($msgRol === 'mayorista') {
            $stmt = $msgPdo->prepare('SELECT usuario_id FROM comercios_perfil WHERE id = ? LIMIT 1');
            $stmt->execute([(int) $pedido['comercio_id']]);
        } else {
            // Administración: habla con quien compró; si no hay perfil, con quien vendió.
            $stmt = $msgPdo->prepare('SELECT usuario_id FROM comercios_perfil WHERE id = ? LIMIT 1');
            $stmt->execute([(int) $pedido['comercio_id']]);
            $otro = (int) ($stmt->fetchColumn() ?: 0);

            if ($otro <= 0) {
                $stmt = $msgPdo->prepare('SELECT usuario_id FROM mayoristas_perfil WHERE id = ? LIMIT 1');
                $stmt->execute([(int) $pedido['mayorista_id']]);
            }
        }

        if ($otro <= 0) {
            $otro = (int) ($stmt->fetchColumn() ?: 0);
        }
    }

    if ($otro <= 0) {
        fallo('Elige con quién quieres hablar.', 422, 'SIN_DESTINATARIO');
    }

    $resultado = $msgServicio->directo($msgYo, $otro, $msgIp);

    if (!$resultado['ok']) {
        fallo((string) $resultado['mensaje'], 422, 'SIN_DESTINATARIO');
    }

    responder(['ok' => true, 'uuid' => (string) $resultado['uuid']]);
}

// -------------------------------------------------------------- soporte
// Abre el canal de soporte (usuario + todo el equipo de administración) y
// manda el primer mensaje. Si el hilo ya existía, se reutiliza.
if ($msgRuta === '/mensajes/soporte' && $msgMetodo === 'POST') {
    $cuerpo = api_cuerpo();
    $texto = trim((string) ($cuerpo['cuerpo'] ?? ''));

    if ($texto === '') {
        fallo('Escribe qué necesitas para abrir el canal de soporte.', 422, 'DATOS_FALTANTES');
    }

    $resultado = $msgServicio->soporte($msgYo, $msgIp);
    $uuid = (string) $resultado['uuid'];

    $envio = $msgServicio->enviar($msgYo, $uuid, $texto, $msgIp);

    if (!$envio['ok']) {
        fallo((string) $envio['mensaje'], 422, 'NO_ENVIADO');
    }

    responder([
        'ok'   => true,
        'uuid' => $uuid,
        'hilo' => ['uuid' => $uuid, 'tipo' => 'soporte', 'titulo' => 'Soporte Didi2', 'soporte' => true],
    ]);
}

// ------------------------------------------------------------- eliminar
// Oculta para quien borra. Nunca se borran filas: la otra persona conserva su
// historial y, si vuelve a escribir, el hilo reaparece en la bandeja.
if ($msgRuta === '/mensajes/eliminar' && $msgMetodo === 'POST') {
    $cuerpo = api_cuerpo();
    $uuids = $cuerpo['conversaciones'] ?? $cuerpo['hilos'] ?? [];

    if (!is_array($uuids)) {
        $uuids = [$uuids];
    }

    $uuids = array_values(array_filter(
        array_map(static fn ($u): string => trim((string) $u), $uuids),
        static fn (string $u): bool => $u !== ''
    ));

    if ($uuids === []) {
        fallo('Elige al menos una conversación.', 422, 'SIN_SELECCION');
    }

    $resultado = $msgServicio->ocultar($msgYo, $uuids);

    responder(['ok' => true, 'total' => (int) ($resultado['total'] ?? 0)]);
}

// ---------------------------------------------------------------- leído
if ($msgRuta === '/mensajes/leido' && $msgMetodo === 'POST') {
    $cuerpo = api_cuerpo();
    $uuid = trim((string) ($cuerpo['conversacion'] ?? ''));
    $ultimo = (int) ($cuerpo['ultimo_id'] ?? 0);

    $hilo = $msgRepo->porUuid($uuid);

    if ($hilo === null || !$msgRepo->esParticipante((int) $hilo['id'], $msgYo)) {
        fallo('Conversación no disponible.', 404, 'NO_ENCONTRADA');
    }

    // Nunca se marca como leído más allá del último mensaje real del hilo.
    $stmt = $msgPdo->prepare('SELECT COALESCE(MAX(id), 0) FROM mensajes_directos WHERE conversacion_id = ?');
    $stmt->execute([(int) $hilo['id']]);
    $hasta = max(0, min($ultimo, (int) $stmt->fetchColumn()));

    $msgRepo->marcarLeido((int) $hilo['id'], $msgYo, $hasta);

    responder(['ok' => true, 'ultimo_leido' => $hasta]);
}

// ------------------------------------------------- hilo: nuevos mensajes
// Polling del hilo abierto (el panel lo hacía cada 8 s).
if ($msgMetodo === 'GET' && preg_match('#^/mensajes/([A-Za-z0-9-]{8,64})/nuevos$#', $msgRuta, $msgPartes) === 1) {
    $uuid = $msgPartes[1];
    $desde = api_qint('desde', 0);

    $hilo = $msgRepo->porUuid($uuid);

    if ($hilo === null || !$msgRepo->esParticipante((int) $hilo['id'], $msgYo)) {
        fallo('Conversación no disponible.', 404, 'NO_ENCONTRADA');
    }

    $esSoporte = ((string) $hilo['tipo']) === 'soporte';
    $soyAdmin = $msgServicio->esAdmin($msgYo);
    $mensajes = [];

    foreach ($msgServicio->nuevos($msgYo, $uuid, $desde) as $m) {
        $mio = (int) $m['autor_id'] === $msgYo;

        $mensajes[] = [
            'id'         => (int) $m['id'],
            'cuerpo'     => (string) $m['cuerpo'],
            'created_at' => api_fecha((string) $m['created_at']),
            'mio'        => $mio,
            'autor'      => $mio ? 'Tú' : (($esSoporte && !$soyAdmin) ? 'Soporte' : $msgNombreAutor($m)),
        ];
    }

    responder(['ok' => true, 'mensajes' => $mensajes]);
}

// ------------------------------------------------------------ hilo abierto
if ($msgMetodo === 'GET' && preg_match('#^/mensajes/([A-Za-z0-9-]{8,64})$#', $msgRuta, $msgPartes) === 1) {
    $uuid = $msgPartes[1];
    $datos = $msgServicio->abrir($msgYo, $uuid);

    if ($datos === null) {
        fallo('Esa conversación no existe o no participas en ella.', 404, 'NO_ENCONTRADA');
    }

    $esSoporte = ((string) $datos['hilo']['tipo']) === 'soporte';
    $soyAdmin = $msgServicio->esAdmin($msgYo);
    $mensajes = [];

    foreach ($datos['mensajes'] as $m) {
        $mio = (int) $m['autor_id'] === $msgYo;

        $mensajes[] = [
            'id'         => (int) $m['id'],
            'cuerpo'     => (string) $m['cuerpo'],
            'created_at' => api_fecha((string) $m['created_at']),
            'mio'        => $mio,
            // En soporte, el usuario ve «Soporte» y nada más: no se revela
            // qué administrador contestó. El equipo sí ve los nombres.
            'autor'      => $mio ? 'Tú' : (($esSoporte && !$soyAdmin) ? 'Soporte' : $msgNombreAutor($m)),
        ];
    }

    responder([
        'ok'       => true,
        'hilo'     => [
            'uuid'    => (string) $datos['hilo']['uuid'],
            'tipo'    => (string) $datos['hilo']['tipo'],
            'titulo'  => (string) $datos['titulo'],
            'soporte' => $esSoporte,
        ],
        'mensajes' => $mensajes,
        'ultimo_id' => $mensajes === [] ? 0 : (int) end($mensajes)['id'],
    ]);
}
