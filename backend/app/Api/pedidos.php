<?php

declare(strict_types=1);

/**
 * Módulo pedidos / reparto / tracking / pago simulado de la SPA.
 *
 * Porta a JSON lo que el panel PHP hace con formularios y redirecciones:
 *  - detalle del pedido con líneas, cronología, envío y acciones por rol,
 *  - máquina de estados (PedidoService::TRANSICIONES) validada en servidor,
 *  - calificaciones 1..5 idempotentes por (evaluador, evaluado),
 *  - panel del repartidor (disponibilidad, ofertas, viaje, PIN),
 *  - tracking (posiciones y consulta para el mapa),
 *  - pago simulado firmado igual que el webhook real.
 *
 * Reglas de la casa: cada endpoint decide su rol, los importes salen como
 * números y los mensajes de error son accionables en español.
 */

use App\Core\AuditLogger;
use App\Core\Cache;
use App\Modules\Logistica\AsignacionService;
use App\Modules\Logistica\PruebaEntregaService;
use App\Modules\Logistica\TarifaService;
use App\Modules\Logistica\TrackingService;
use App\Modules\Notificaciones\NotificacionService;
use App\Modules\Pagos\PagoService;
use App\Modules\Pagos\SimuladoGateway;
use App\Modules\Pedidos\PedidoService;

/** Etiquetas legibles de los estados internos (los finos, no los cinco visibles). */
const PED_ETIQUETAS = [
    'borrador'              => 'Borrador',
    'pendiente_pago'        => 'Esperando pago',
    'pago_autorizado'       => 'Pago autorizado',
    'pendiente_aceptacion'  => 'Por aceptar',
    'aceptado'              => 'Aceptado',
    'preparando'            => 'Preparando',
    'listo_para_recoger'    => 'Listo para recoger',
    'buscando_repartidor'   => 'Buscando repartidor',
    'repartidor_asignado'   => 'Repartidor asignado',
    'en_recoleccion'        => 'En recolección',
    'en_camino'             => 'En camino',
    'en_puerta'             => 'En puerta',
    'entregado'             => 'Entregado',
    'completado'            => 'Completado',
    'cancelado'             => 'Cancelado',
    'rechazado'             => 'Rechazado',
    'expirado'              => 'Expirado',
    'en_disputa'            => 'En disputa',
    'reembolsado'           => 'Reembolsado',
    'entrega_fallida'       => 'Entrega fallida',
    'recibido'              => 'Recibido',
];

/** Estados en los que el comercio puede calificar / confirmar recepción. */
const PED_ESTADOS_CALIFICABLES = ['recibido', 'entregado', 'completado'];

function ped_etiqueta(string $estado): string
{
    return PED_ETIQUETAS[$estado] ?? ucfirst(str_replace('_', ' ', $estado));
}

function ped_fecha(?string $fecha): string
{
    return api_fecha($fecha);
}

/** PDO del contexto, para no repetir api_pdo() en cada consulta. */
function ped_pdo(): PDO
{
    return api_pdo();
}

function ped_ip(): string
{
    return (string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
}

function ped_motivo(): ?string
{
    $motivo = trim((string) (api_cuerpo()['motivo'] ?? ''));

    return $motivo === '' ? null : mb_substr($motivo, 0, 255);
}

/** Servicio de pedidos con notificaciones reales (encola correos en storage). */
function ped_pedidos(): PedidoService
{
    static $servicio = null;

    if ($servicio === null) {
        $servicio = new PedidoService(ped_pdo(), new NotificacionService(ped_pdo(), __DIR__ . '/../../storage/correos'));
    }

    return $servicio;
}

function ped_asignacion(): AsignacionService
{
    static $servicio = null;

    if ($servicio === null) {
        $servicio = new AsignacionService(ped_pdo(), new TarifaService(ped_pdo()), ped_pedidos());
    }

    return $servicio;
}

function ped_pruebas(): PruebaEntregaService
{
    return new PruebaEntregaService(ped_pdo());
}

function ped_tracking(): TrackingService
{
    static $servicio = null;

    if ($servicio === null) {
        $servicio = new TrackingService(ped_pdo(), new Cache(__DIR__ . '/../../storage/cache', 120));
    }

    return $servicio;
}

/** Repartidor (perfil) del usuario en sesión, o null si no lo es. */
function ped_repartidor(): ?array
{
    $stmt = ped_pdo()->prepare('SELECT * FROM repartidores_perfil WHERE usuario_id = ? LIMIT 1');
    $stmt->execute([api_uid()]);

    return $stmt->fetch() ?: null;
}

/**
 * Nombre del repartidor. `envios.repartidor_id` admite usuarios.id o
 * repartidores_perfil.id según quién haya asignado el envío.
 */
function ped_nombre_repartidor(?int $referencia): ?string
{
    if ($referencia === null || $referencia <= 0) {
        return null;
    }

    $pdo = ped_pdo();
    $stmt = $pdo->prepare('SELECT nombre FROM usuarios WHERE id = ? AND deleted_at IS NULL LIMIT 1');
    $stmt->execute([$referencia]);
    $nombre = $stmt->fetchColumn();

    if ($nombre !== false && $nombre !== null && $nombre !== '') {
        return (string) $nombre;
    }

    $stmt = $pdo->prepare(
        'SELECT u.nombre FROM repartidores_perfil r JOIN usuarios u ON u.id = r.usuario_id WHERE r.id = ? LIMIT 1'
    );
    $stmt->execute([$referencia]);
    $nombre = $stmt->fetchColumn();

    return $nombre === false || $nombre === null ? null : (string) $nombre;
}

/** Pedido con todo lo que necesita el detalle (contrapartes, dirección, envío). */
function ped_cargar(string $uuid): array
{
    $stmt = ped_pdo()->prepare(
        'SELECT p.*,
                c.nombre_negocio AS comercio_nombre, c.usuario_id AS comercio_usuario,
                m.nombre_comercial AS mayorista_nombre, m.usuario_id AS mayorista_usuario,
                d.calle, d.colonia, d.ciudad, d.cp, d.referencias, d.latitud, d.longitud,
                e.id AS envio_id, e.repartidor_id AS envio_repartidor, e.tarifa,
                e.distancia_km, e.estado AS envio_estado
         FROM pedidos p
         JOIN comercios_perfil c ON c.id = p.comercio_id
         JOIN mayoristas_perfil m ON m.id = p.mayorista_id
         LEFT JOIN direcciones d ON d.id = p.direccion_entrega_id
         LEFT JOIN envios e ON e.pedido_id = p.id
         WHERE p.uuid = ? LIMIT 1'
    );
    $stmt->execute([$uuid]);

    return $stmt->fetch() ?: [];
}

/** ¿Quién mira el pedido? Solo se responde después de api_pedido_propio(). */
function ped_papeles(array $pedido): array
{
    $rol = api_rol();
    $repartidor = ped_repartidor();

    $esComercio = (int) $pedido['comercio_usuario'] === api_uid();
    $esMayorista = (int) $pedido['mayorista_usuario'] === api_uid();
    $esRepartidor = false;

    if ($repartidor !== null && (int) $pedido['envio_repartidor'] > 0) {
        $esRepartidor = in_array((int) $pedido['envio_repartidor'], [(int) $repartidor['id'], api_uid()], true)
            && $rol === 'repartidor';
    }

    return [
        'comercio'   => $esComercio,
        'mayorista'  => $esMayorista,
        'repartidor' => $esRepartidor,
        'admin'      => str_starts_with($rol, 'admin'),
    ];
}

/** Acciones que la UI puede ofrecer, ya filtradas por rol y estado. */
function ped_acciones(string $estado, array $papeles): array
{
    if ($papeles['admin']) {
        return [];
    }

    if ($papeles['mayorista']) {
        return match ($estado) {
            'pendiente_aceptacion' => [
                ['codigo' => 'aceptar', 'texto' => 'Aceptar pedido', 'tono' => 'ok', 'tipo' => 'transicion'],
                ['codigo' => 'cancelar', 'texto' => 'Rechazar', 'tono' => 'peligro', 'tipo' => 'transicion'],
            ],
            'aceptado'  => [['codigo' => 'preparar', 'texto' => 'Marcar preparando', 'tono' => 'claro', 'tipo' => 'transicion']],
            'preparando' => [['codigo' => 'enviar', 'texto' => 'Listo para recoger', 'tono' => 'ok', 'tipo' => 'transicion']],
            'listo_para_recoger' => [['codigo' => 'enviar', 'texto' => 'Buscar repartidor', 'tono' => 'ok', 'tipo' => 'transicion']],
            default => [],
        };
    }

    if ($papeles['comercio']) {
        $acciones = match ($estado) {
            'entregado' => [['codigo' => 'recibir', 'texto' => 'Confirmar recepción', 'tono' => 'ok', 'tipo' => 'transicion']],
            'en_camino', 'en_puerta' => [['codigo' => 'mapa', 'texto' => 'Ver en el mapa', 'tono' => 'claro', 'tipo' => 'mapa']],
            default => [],
        };

        if (in_array($estado, ['borrador', 'pendiente_pago', 'pendiente_aceptacion'], true)) {
            $acciones[] = ['codigo' => 'cancelar', 'texto' => 'Cancelar pedido', 'tono' => 'peligro', 'tipo' => 'transicion'];
        }

        return $acciones;
    }

    if ($papeles['repartidor']) {
        return match ($estado) {
            'repartidor_asignado' => [[
                'codigo' => 'recoger', 'texto' => 'Confirmar recolección', 'tono' => 'ok', 'tipo' => 'pin',
                'pin_largo' => 6, 'pin_ayuda' => 'Pídelo al mayorista',
            ]],
            'en_recoleccion' => [['codigo' => 'salir', 'texto' => 'Salir a entregar', 'tono' => 'ok', 'tipo' => 'transicion']],
            'en_camino'      => [['codigo' => 'llegue', 'texto' => 'Llegué al comercio', 'tono' => 'ok', 'tipo' => 'transicion']],
            'en_puerta'      => [[
                'codigo' => 'entregar', 'texto' => 'Confirmar entrega', 'tono' => 'ok', 'tipo' => 'pin',
                'pin_largo' => 4, 'pin_ayuda' => 'Pídelo al comercio',
            ]],
            default => [],
        };
    }

    return [];
}

/** Pago asociado al checkout del pedido (para enlazar al simulador). */
function ped_pago_de(array $pedido): ?array
{
    $stmt = ped_pdo()->prepare(
        'SELECT referencia_externa, monto, estado FROM pagos WHERE checkout_id = ? ORDER BY id DESC LIMIT 1'
    );
    $stmt->execute([(int) $pedido['checkout_id']]);
    $fila = $stmt->fetch();

    if ($fila === false) {
        return null;
    }

    return [
        'referencia' => (string) $fila['referencia_externa'],
        'monto'      => (float) $fila['monto'],
        'estado'     => (string) $fila['estado'],
    ];
}

$rutaApi = (string) api_ctx()['ruta'];
$metodoApi = (string) api_ctx()['metodo'];
$uuidPatron = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

// --------------------------------------------------------------- detalle
if ($metodoApi === 'GET' && preg_match('#^/pedidos/(' . $uuidPatron . ')$#', $rutaApi, $m) === 1) {
    $uuid = $m[1];
    $pedido = api_pedido_propio($uuid);
    $fila = ped_cargar($uuid);

    if ($fila === []) {
        fallo('El pedido no existe.', 404, 'NO_ENCONTRADO');
    }

    $papeles = ped_papeles($fila);
    $estado = (string) $fila['estado'];
    $id = (int) $fila['id'];

    $stmt = ped_pdo()->prepare(
        'SELECT nombre_producto, cantidad, precio_unitario, subtotal, escala_aplicada, iva_tasa
         FROM detalle_pedido WHERE pedido_id = ? ORDER BY id'
    );
    $stmt->execute([$id]);
    $lineas = [];
    foreach ($stmt->fetchAll() ?: [] as $l) {
        $lineas[] = [
            'nombre'   => (string) $l['nombre_producto'],
            'cantidad' => (int) $l['cantidad'],
            'precio_unitario' => (float) $l['precio_unitario'],
            'subtotal' => (float) $l['subtotal'],
            'escala'   => (string) ($l['escala_aplicada'] ?? ''),
            'iva_tasa' => (float) $l['iva_tasa'],
        ];
    }

    $eventos = [];
    foreach (ped_pedidos()->eventos($id) as $ev) {
        $eventos[] = [
            'estado'     => (string) $ev['estado_nuevo'],
            'texto'      => ped_etiqueta((string) $ev['estado_nuevo']),
            'anterior'   => $ev['estado_anterior'] === null ? null : ped_etiqueta((string) $ev['estado_anterior']),
            'nota'       => $ev['nota'] === null ? null : (string) $ev['nota'],
            'fecha'      => ped_fecha((string) $ev['created_at']),
            'actor'      => $ev['actor_usuario_id'] === null ? null : (int) $ev['actor_usuario_id'],
        ];
    }

    // PIN de entrega: solo el comercio lo ve, y solo cuando el repartidor está en la puerta.
    $pinEntrega = null;
    if ($papeles['comercio'] && $estado === 'en_puerta' && !empty($fila['pin_entrega_visible'])) {
        $pinEntrega = (string) $fila['pin_entrega_visible'];
    }

    // Calificación: solo comercio ↔ mayorista, y solo con el pedido recibido.
    $calificacion = null;
    $evaluado = 0;
    if ($papeles['comercio']) {
        $evaluado = (int) $fila['mayorista_usuario'];
    } elseif ($papeles['mayorista']) {
        $evaluado = (int) $fila['comercio_usuario'];
    }

    if ($evaluado > 0 && $evaluado !== api_uid()) {
        $stmt = ped_pdo()->prepare(
            'SELECT COALESCE(m.nombre_comercial, c.nombre_negocio, u.nombre, u.email) AS nombre
             FROM usuarios u
             LEFT JOIN mayoristas_perfil m ON m.usuario_id = u.id
             LEFT JOIN comercios_perfil c ON c.usuario_id = u.id
             WHERE u.id = ? LIMIT 1'
        );
        $stmt->execute([$evaluado]);
        $nombreEvaluado = (string) ($stmt->fetchColumn() ?: 'la otra parte');

        $stmt = ped_pdo()->prepare(
            'SELECT puntaje, comentario FROM calificaciones WHERE evaluador_id = ? AND evaluado_id = ? LIMIT 1'
        );
        $stmt->execute([api_uid(), $evaluado]);
        $mia = $stmt->fetch() ?: null;

        $calificacion = [
            'evaluado_id' => $evaluado,
            'nombre'      => $nombreEvaluado,
            'puede'       => in_array($estado, PED_ESTADOS_CALIFICABLES, true),
            'puntaje'     => $mia === null ? null : (int) $mia['puntaje'],
            'comentario'  => $mia === null ? '' : (string) $mia['comentario'],
        ];
    }

    $conMapa = $papeles['comercio'] || $papeles['repartidor'] || $papeles['admin'];

    responder([
        'ok' => true,
        'pedido' => [
            'uuid'      => (string) $fila['uuid'],
            'folio'     => substr((string) $fila['uuid'], 0, 8),
            'estado'    => $estado,
            'estado_texto' => ped_etiqueta($estado),
            'creado'    => ped_fecha((string) $fila['created_at']),
            'acepta_antes_de' => $fila['acepta_antes_de'] === null ? null : ped_fecha((string) $fila['acepta_antes_de']),
            'nota'      => (string) ($fila['nota_cliente'] ?? ''),
            'comercio'  => ['nombre' => (string) $fila['comercio_nombre']],
            'mayorista' => ['nombre' => (string) $fila['mayorista_nombre']],
            'direccion' => [
                'calle'    => (string) ($fila['calle'] ?? ''),
                'colonia'  => (string) ($fila['colonia'] ?? ''),
                'ciudad'   => (string) ($fila['ciudad'] ?? ''),
                'cp'       => (string) ($fila['cp'] ?? ''),
                'referencias' => (string) ($fila['referencias'] ?? ''),
                'lat'      => $conMapa && $fila['latitud'] !== null ? (float) $fila['latitud'] : null,
                'lng'      => $conMapa && $fila['longitud'] !== null ? (float) $fila['longitud'] : null,
            ],
            'subtotal'  => (float) $fila['subtotal'],
            'iva'       => (float) $fila['iva'],
            'envio'     => (float) $fila['envio'],
            'total'     => (float) $fila['total'],
            'lineas'    => $lineas,
            'eventos'   => $eventos,
            'envio_datos' => [
                'repartidor' => ped_nombre_repartidor($fila['envio_repartidor'] === null ? null : (int) $fila['envio_repartidor']),
                'tarifa'     => $fila['tarifa'] === null ? null : (float) $fila['tarifa'],
                'distancia_km' => $fila['distancia_km'] === null ? null : (float) $fila['distancia_km'],
                'estado'     => (string) ($fila['envio_estado'] ?? ''),
            ],
            'acciones'  => ped_acciones($estado, $papeles),
            'calificacion' => $calificacion,
            'pin_entrega'  => $pinEntrega,
            'pago'      => $papeles['comercio'] && in_array($estado, ['borrador', 'pendiente_pago', 'pago_autorizado'], true)
                ? ped_pago_de($fila) : null,
            'papeles'   => $papeles,
        ],
    ]);
}

// ------------------------------------------------------- cambio de estado
if ($metodoApi === 'POST' && preg_match('#^/pedidos/(' . $uuidPatron . ')/estado$#', $rutaApi, $m) === 1) {
    $uuid = $m[1];
    $pedido = api_pedido_propio($uuid);
    $fila = ped_cargar($uuid);
    $papeles = ped_papeles($fila);
    $estado = (string) $pedido['estado'];
    $id = (int) $pedido['id'];
    $accion = trim((string) (api_cuerpo()['accion'] ?? ''));
    $motivo = ped_motivo();
    $rol = api_rol();

    if ($accion === '') {
        fallo('Indica la acción que quieres ejecutar.', 422, 'ACCION_FALTANTE');
    }

    // Acción => rol exigido y estado destino. `enviar` y `cancelar` dependen del estado actual.
    $permitidas = [
        'aceptar'  => ['rol' => 'mayorista', 'destino' => 'aceptado'],
        'preparar' => ['rol' => 'mayorista', 'destino' => 'preparando'],
        'recibir'  => ['rol' => 'comercio', 'destino' => 'completado'],
        'salir'    => ['rol' => 'repartidor', 'destino' => 'en_camino'],
        'llegue'   => ['rol' => 'repartidor', 'destino' => 'en_puerta'],
    ];

    $destinos = [];

    if ($accion === 'enviar') {
        if ($rol !== 'mayorista') {
            fallo('Solo el mayorista marca el pedido como enviado.', 403, 'SIN_PERMISO');
        }

        if ($estado === 'preparando') {
            $destinos = ['listo_para_recoger'];
        } elseif ($estado === 'listo_para_recoger') {
            $destinos = ['buscando_repartidor'];
        } else {
            fallo('El pedido todavía no está listo para salir.', 422, 'TRANSICION_INVALIDA');
        }
    } elseif ($accion === 'cancelar') {
        // Rechazar (mayorista antes de aceptar) y cancelar comparten botón.
        $destinos = [$estado === 'pendiente_aceptacion' ? 'rechazado' : 'cancelado'];
    } elseif (isset($permitidas[$accion])) {
        if ($rol !== $permitidas[$accion]['rol']) {
            fallo('Tu rol no puede ejecutar esa acción.', 403, 'SIN_PERMISO');
        }

        $destinos = [$permitidas[$accion]['destino']];
    } else {
        fallo('Acción desconocida: ' . $accion . '.', 422, 'ACCION_INVALIDA');
    }

    $ultimo = $estado;
    $pinGenerado = null;
    $pinRecoleccion = null;

    foreach ($destinos as $destino) {
        $resultado = ped_pedidos()->transicionar($id, $destino, api_uid(), [$rol], $motivo);

        if (!$resultado['ok']) {
            // 422 con el motivo real: p. ej. "No se puede pasar de 'x' a 'y'".
            fallo((string) $resultado['mensaje'], 422, 'TRANSICION_INVALIDA');
        }

        // Efectos secundarios que en el PHP hacía el controlador.
        if ($destino === 'listo_para_recoger') {
            // El PIN se guarda hasheado; se devuelve una sola vez a quien debe dictarlo.
            $pinRecoleccion = ped_pruebas()->generarRecoleccion($id);
        }

        if ($destino === 'buscando_repartidor') {
            ped_asignacion()->lanzarRonda($id, 1);
        }

        if ($destino === 'en_puerta') {
            $pinGenerado = ped_pruebas()->generarEntrega($id);
        }

        $ultimo = $destino;
    }

    (new AuditLogger(ped_pdo()))->log(
        'pedido_' . $accion,
        api_uid(),
        'pedido',
        $uuid,
        ['desde' => $estado, 'nuevo' => $ultimo, 'motivo' => $motivo],
        ped_ip(),
    );

    responder([
        'ok'      => true,
        'mensaje' => 'Pedido actualizado a «' . ped_etiqueta($ultimo) . '».',
        'estado'  => $ultimo,
        'estado_texto' => ped_etiqueta($ultimo),
        // El comercio ve el PIN cuando el repartidor ya está en la puerta.
        'pin_entrega' => $papeles['comercio'] && $ultimo === 'en_puerta'
            ? ($pinGenerado ?? ped_pruebas()->pinEntregaVisible($id))
            : null,
        // El mayorista recibe el PIN de recolección al marcar el pedido como listo.
        'pin_recoleccion' => $papeles['mayorista'] ? $pinRecoleccion : null,
    ]);
}

// ---------------------------------------------------------- calificaciones
if ($metodoApi === 'POST' && preg_match('#^/pedidos/(' . $uuidPatron . ')/calificar$#', $rutaApi, $m) === 1) {
    $uuid = $m[1];
    $pedido = api_pedido_propio($uuid);
    $fila = ped_cargar($uuid);
    $papeles = ped_papeles($fila);
    $estado = (string) $pedido['estado'];

    if (!$papeles['comercio'] && !$papeles['mayorista']) {
        fallo('Solo el comercio y el mayorista se califican entre sí.', 403, 'SIN_PERMISO');
    }

    if (!in_array($estado, PED_ESTADOS_CALIFICABLES, true)) {
        fallo('Solo puedes calificar un pedido ya recibido o entregado.', 422, 'PEDIDO_NO_CALIFICABLE');
    }

    $puntaje = filter_var(api_cuerpo()['puntaje'] ?? null, FILTER_VALIDATE_INT);

    if ($puntaje === false || $puntaje === null || $puntaje < 1 || $puntaje > 5) {
        fallo('El puntaje va de 1 a 5 estrellas.', 422, 'PUNTAJE_INVALIDO');
    }

    $comentario = trim((string) (api_cuerpo()['comentario'] ?? ''));
    if (mb_strlen($comentario) > 280) {
        fallo('El comentario no puede pasar de 280 caracteres.', 422, 'COMENTARIO_LARGO');
    }

    $evaluado = $papeles['comercio'] ? (int) $fila['mayorista_usuario'] : (int) $fila['comercio_usuario'];

    if ($evaluado <= 0) {
        fallo('No se encontró a la otra parte del pedido.', 422, 'SIN_CONTRAPARTE');
    }

    if ($evaluado === api_uid()) {
        fallo('No puedes calificarte a ti mismo.', 422, 'AUTO_CALIFICACION');
    }

    // Una calificación por persona y contraparte: si ya existe, se actualiza.
    ped_pdo()->prepare(
        'INSERT INTO calificaciones (evaluador_id, evaluado_id, pedido_id, puntaje, comentario)
         VALUES (?,?,?,?,?)
         ON DUPLICATE KEY UPDATE pedido_id = VALUES(pedido_id), puntaje = VALUES(puntaje),
                                 comentario = VALUES(comentario), updated_at = NOW()'
    )->execute([api_uid(), $evaluado, (int) $pedido['id'], (int) $puntaje, $comentario]);

    (new AuditLogger(ped_pdo()))->log(
        'calificacion_pedido',
        api_uid(),
        'pedido',
        $uuid,
        ['evaluado' => $evaluado, 'puntaje' => (int) $puntaje],
        ped_ip(),
    );

    responder([
        'ok'      => true,
        'mensaje' => 'Calificación guardada.',
        'puntaje' => (int) $puntaje,
        'comentario' => $comentario,
    ]);
}

// ------------------------------------------------------------- repartidor
if ($metodoApi === 'GET' && $rutaApi === '/repartidor') {
    api_exigir('repartidor');
    $repartidor = ped_repartidor();

    if ($repartidor === null) {
        fallo('Tu cuenta no tiene perfil de repartidor.', 403, 'SIN_PERFIL');
    }

    $id = (int) $repartidor['id'];
    $pdo = ped_pdo();

    $stmt = $pdo->prepare(
        "SELECT p.uuid, p.estado, p.total, p.created_at,
                e.tarifa, e.distancia_km, e.estado AS envio_estado,
                c.nombre_negocio AS comercio, m.nombre_comercial AS mayorista,
                d.calle, d.colonia, d.ciudad, d.latitud, d.longitud
         FROM envios e
         JOIN pedidos p ON p.id = e.pedido_id
         JOIN comercios_perfil c ON c.id = p.comercio_id
         JOIN mayoristas_perfil m ON m.id = p.mayorista_id
         LEFT JOIN direcciones d ON d.id = p.direccion_entrega_id
         WHERE e.repartidor_id IN (?, ?)
           AND p.estado IN ('repartidor_asignado','en_recoleccion','en_camino','en_puerta')
         ORDER BY p.created_at"
    );
    $stmt->execute([$id, api_uid()]);

    $viajes = [];
    foreach ($stmt->fetchAll() ?: [] as $v) {
        $estadoViaje = (string) $v['estado'];
        // El PIN nunca viaja al repartidor: lo dicta la contraparte.
        $pin = match ($estadoViaje) {
            'repartidor_asignado' => ['tipo' => 'recoleccion', 'largo' => 6, 'de' => 'el mayorista', 'valor' => null],
            'en_puerta'           => ['tipo' => 'entrega', 'largo' => 4, 'de' => 'el comercio', 'valor' => null],
            default               => null,
        };

        $viajes[] = [
            'uuid'     => (string) $v['uuid'],
            'estado'   => $estadoViaje,
            'estado_texto' => ped_etiqueta($estadoViaje),
            'total'    => (float) $v['total'],
            'tarifa'   => $v['tarifa'] === null ? null : (float) $v['tarifa'],
            'distancia_km' => $v['distancia_km'] === null ? null : (float) $v['distancia_km'],
            'comercio' => (string) $v['comercio'],
            'mayorista' => (string) $v['mayorista'],
            'destino'  => [
                'calle' => (string) ($v['calle'] ?? ''),
                'colonia' => (string) ($v['colonia'] ?? ''),
                'ciudad' => (string) ($v['ciudad'] ?? ''),
                'lat' => $v['latitud'] === null ? null : (float) $v['latitud'],
                'lng' => $v['longitud'] === null ? null : (float) $v['longitud'],
            ],
            'pin'      => $pin,
        ];
    }

    $ofertas = [];
    foreach (ped_asignacion()->ofertasDe($id) as $o) {
        $expira = strtotime((string) $o['expira_en']);
        $ofertas[] = [
            'id' => (int) $o['id'],
            'tarifa' => (float) $o['tarifa'],
            'distancia_km' => (float) $o['distancia_km'],
            'ronda' => (int) $o['ronda'],
            'expira_en' => ped_fecha((string) $o['expira_en']),
            'segundos' => $expira === false ? 0 : max(0, $expira - time()),
            'pedido_uuid' => (string) $o['pedido_uuid'],
            'total' => (float) $o['total'],
            'mayorista' => (string) $o['mayorista'],
            'comercio' => (string) $o['comercio'],
            'calle' => (string) $o['calle'],
            'colonia' => (string) ($o['colonia'] ?? ''),
            'ciudad' => (string) $o['ciudad'],
        ];
    }

    // Entregas de hoy y ganancias: tarifa de los envíos cerrados hoy.
    $stmt = $pdo->prepare(
        "SELECT p.uuid, p.estado, p.total, e.tarifa, c.nombre_negocio AS comercio,
                (SELECT MAX(ev.created_at) FROM pedido_eventos ev
                  WHERE ev.pedido_id = p.id AND ev.estado_nuevo = 'entregado') AS entregado_en
         FROM envios e
         JOIN pedidos p ON p.id = e.pedido_id
         JOIN comercios_perfil c ON c.id = p.comercio_id
         WHERE e.repartidor_id IN (?, ?)
           AND p.estado IN ('entregado','completado')
           AND EXISTS (SELECT 1 FROM pedido_eventos ev2
                        WHERE ev2.pedido_id = p.id AND ev2.estado_nuevo = 'entregado'
                          AND DATE(ev2.created_at) = CURDATE())
         ORDER BY entregado_en DESC"
    );
    $stmt->execute([$id, api_uid()]);

    $entregas = [];
    $ganancias = 0.0;
    foreach ($stmt->fetchAll() ?: [] as $e) {
        $tarifa = $e['tarifa'] === null ? 0.0 : (float) $e['tarifa'];
        $ganancias += $tarifa;
        $entregas[] = [
            'uuid' => (string) $e['uuid'],
            'estado' => (string) $e['estado'],
            'estado_texto' => ped_etiqueta((string) $e['estado']),
            'comercio' => (string) $e['comercio'],
            'total' => (float) $e['total'],
            'tarifa' => $tarifa,
            'entregado_en' => $e['entregado_en'] === null ? null : ped_fecha((string) $e['entregado_en']),
        ];
    }

    $stmt = $pdo->prepare('SELECT tipo, placa FROM vehiculos WHERE repartidor_id = ? AND activo = 1 ORDER BY id DESC LIMIT 1');
    $stmt->execute([$id]);
    $vehiculo = $stmt->fetch() ?: null;

    responder([
        'ok' => true,
        'repartidor' => [
            'disponible' => (int) $repartidor['disponible'] === 1,
            'kyc'        => (string) $repartidor['estado_kyc'],
            'calificacion' => $repartidor['calificacion_promedio'] === null ? null : (float) $repartidor['calificacion_promedio'],
            'ultima_posicion_at' => $repartidor['ultima_posicion_at'] === null ? null : ped_fecha((string) $repartidor['ultima_posicion_at']),
            'vehiculo'   => $vehiculo === null ? null : [
                'tipo'  => (string) $vehiculo['tipo'],
                'placa' => (string) $vehiculo['placa'],
            ],
        ],
        'ofertas'   => $ofertas,
        'viajes'    => $viajes,
        'entregas'  => $entregas,
        'ganancias_hoy' => round($ganancias, 2),
        'actualizado' => date('Y-m-d H:i'),
    ]);
}

if ($metodoApi === 'POST' && $rutaApi === '/repartidor/disponibilidad') {
    api_exigir('repartidor');
    $repartidor = ped_repartidor();

    if ($repartidor === null) {
        fallo('Tu cuenta no tiene perfil de repartidor.', 403, 'SIN_PERFIL');
    }

    $cuerpo = api_cuerpo();
    $enLinea = (bool) ($cuerpo['disponible'] ?? false);
    $lat = isset($cuerpo['lat']) ? (float) $cuerpo['lat'] : null;
    $lng = isset($cuerpo['lng']) ? (float) $cuerpo['lng'] : null;

    // Las mismas reglas que el panel PHP: KYC aprobado y vehículo activo.
    if ($enLinea && (string) $repartidor['estado_kyc'] !== 'aprobado') {
        fallo('Tu verificación todavía no está aprobada.', 422, 'KYC_PENDIENTE');
    }

    if ($enLinea) {
        $stmt = ped_pdo()->prepare('SELECT COUNT(*) FROM vehiculos WHERE repartidor_id = ? AND activo = 1');
        $stmt->execute([(int) $repartidor['id']]);

        if ((int) $stmt->fetchColumn() === 0) {
            fallo('Necesitas un vehículo activo para ponerte en línea.', 422, 'SIN_VEHICULO');
        }
    }

    if ($lat !== null && ($lat < -90 || $lat > 90) || $lng !== null && ($lng < -180 || $lng > 180)) {
        fallo('La posición enviada no es válida.', 422, 'POSICION_INVALIDA');
    }

    ped_pdo()->prepare(
        'UPDATE repartidores_perfil
            SET disponible = ?,
                ultima_posicion_lat = COALESCE(?, ultima_posicion_lat),
                ultima_posicion_lng = COALESCE(?, ultima_posicion_lng),
                ultima_posicion_at = IF(? IS NULL, ultima_posicion_at, NOW())
          WHERE id = ?'
    )->execute([
        $enLinea ? 1 : 0,
        $lat,
        $lng,
        $lat,
        (int) $repartidor['id'],
    ]);

    responder([
        'ok' => true,
        'disponible' => $enLinea,
        'mensaje' => $enLinea ? 'Estás en línea: recibirás ofertas.' : 'Estás fuera de línea.',
    ]);
}

if ($metodoApi === 'POST' && preg_match('#^/repartidor/ofertas/(\d+)$#', $rutaApi, $m) === 1) {
    api_exigir('repartidor');
    $repartidor = ped_repartidor();

    if ($repartidor === null) {
        fallo('Tu cuenta no tiene perfil de repartidor.', 403, 'SIN_PERFIL');
    }

    $ofertaId = (int) $m[1];
    $aceptar = (bool) (api_cuerpo()['aceptar'] ?? true);

    if ($aceptar) {
        $r = ped_asignacion()->aceptar($ofertaId, (int) $repartidor['id']);

        if (!$r['ok']) {
            fallo((string) $r['mensaje'], 409, 'OFERTA_NO_DISPONIBLE');
        }

        (new AuditLogger(ped_pdo()))->log('oferta_aceptada', api_uid(), 'oferta', (string) $ofertaId, null, ped_ip());

        responder(['ok' => true, 'mensaje' => 'Envío asignado.', 'pedido_uuid' => null]);
    }

    // Rechazar: solo una oferta propia y todavía pendiente.
    $stmt = ped_pdo()->prepare(
        "UPDATE ofertas_envio SET estado = 'rechazada' WHERE id = ? AND repartidor_id = ? AND estado = 'pendiente'"
    );
    $stmt->execute([$ofertaId, (int) $repartidor['id']]);

    if ($stmt->rowCount() === 0) {
        fallo('Esa oferta ya no está disponible.', 409, 'OFERTA_NO_DISPONIBLE');
    }

    responder(['ok' => true, 'mensaje' => 'Oferta rechazada.']);
}

if ($metodoApi === 'POST' && preg_match(
    '#^/repartidor/pedidos/(' . $uuidPatron . ')/(recoger|entregar)$#',
    $rutaApi,
    $m
) === 1) {
    api_exigir('repartidor');
    $uuid = $m[1];
    $paso = $m[2];
    $pedido = api_pedido_propio($uuid);

    if (ped_papeles(ped_cargar($uuid))['repartidor'] !== true) {
        fallo('Ese pedido no está asignado a ti.', 403, 'SIN_PERMISO');
    }

    $pin = trim((string) (api_cuerpo()['pin'] ?? ''));

    if (!preg_match('/^\d{4,6}$/', $pin)) {
        fallo('Escribe el PIN que te dictaron.', 422, 'PIN_INVALIDO');
    }

    $pruebas = ped_pruebas();
    $id = (int) $pedido['id'];

    if ($paso === 'recoger') {
        if (!$pruebas->validarRecoleccion($id, $pin)) {
            fallo('PIN de recolección incorrecto. Pídelo al mayorista.', 422, 'PIN_INCORRECTO');
        }

        $r = ped_pedidos()->transicionar($id, 'en_recoleccion', api_uid(), ['repartidor'], 'Recolección confirmada');

        if (!$r['ok']) {
            fallo((string) $r['mensaje'], 422, 'TRANSICION_INVALIDA');
        }

        responder(['ok' => true, 'mensaje' => 'Recolección confirmada.', 'estado' => 'en_recoleccion', 'estado_texto' => ped_etiqueta('en_recoleccion')]);
    }

    if (!$pruebas->validarEntrega($id, $pin)) {
        fallo('PIN de entrega incorrecto. Pídelo al comercio.', 422, 'PIN_INCORRECTO');
    }

    $r = ped_pedidos()->transicionar($id, 'entregado', api_uid(), ['repartidor'], 'Entrega confirmada con PIN');

    if (!$r['ok']) {
        fallo((string) $r['mensaje'], 422, 'TRANSICION_INVALIDA');
    }

    responder(['ok' => true, 'mensaje' => 'Entrega confirmada.', 'estado' => 'entregado', 'estado_texto' => ped_etiqueta('entregado')]);
}

// ---------------------------------------------------------------- tracking
if ($metodoApi === 'POST' && $rutaApi === '/tracking/posicion') {
    api_exigir('repartidor');
    $repartidor = ped_repartidor();

    if ($repartidor === null) {
        fallo('Solo los repartidores transmiten posición.', 403, 'SIN_PERFIL');
    }

    $cuerpo = api_cuerpo();
    // Se acepta un punto suelto o un lote.
    $puntos = isset($cuerpo['lat']) || isset($cuerpo['lng']) ? [$cuerpo] : $cuerpo;

    if (!is_array($puntos)) {
        fallo('Se esperaba una posición o una lista de posiciones.', 422, 'PAYLOAD_INVALIDO');
    }

    $resultado = ped_tracking()->registrar((int) $repartidor['id'], array_values($puntos));

    if (isset($resultado['motivo'])) {
        fallo((string) $resultado['motivo'], 409, 'SIN_VIAJE');
    }

    responder(['ok' => true, 'aceptados' => $resultado['aceptados'], 'descartados' => $resultado['descartados']]);
}

if ($metodoApi === 'GET' && preg_match('#^/tracking/(' . $uuidPatron . ')$#', $rutaApi, $m) === 1) {
    $uuid = $m[1];
    $pedido = api_pedido_propio($uuid);
    $fila = ped_cargar($uuid);
    $papeles = ped_papeles($fila);
    $estado = (string) $pedido['estado'];
    $pdo = ped_pdo();

    // La posición del repartidor solo se comparte con el comercio dueño
    // (y con soporte). El mayorista y el propio repartidor ven el estado.
    if ($papeles['comercio'] || $papeles['admin']) {
        $consulta = ped_tracking()->consultar($uuid, (int) $fila['comercio_usuario']);

        if ($papeles['admin'] && !$consulta['ok'] && $consulta['codigo'] === 'NO_ENCONTRADO') {
            $consulta = ['ok' => false, 'codigo' => 'SIN_SEGUIMIENTO', 'mensaje' => 'El seguimiento no está disponible todavía.'];
        }

        $datos = $consulta['ok'] ? $consulta['data'] : null;

        responder([
            'ok' => true,
            'tracking' => [
                'pedido'   => $uuid,
                'folio'    => substr($uuid, 0, 8),
                'estado'   => $estado,
                'estado_texto' => ped_etiqueta($estado),
                'disponible' => $consulta['ok'],
                'motivo'   => $consulta['ok'] ? null : (string) $consulta['mensaje'],
                'destino'  => $datos['destino'] ?? ($fila['latitud'] === null ? null : [
                    'lat' => (float) $fila['latitud'],
                    'lng' => (float) $fila['longitud'],
                    'calle' => (string) $fila['calle'],
                    'colonia' => (string) $fila['colonia'],
                    'ciudad' => (string) $fila['ciudad'],
                ]),
                'repartidor' => $datos['repartidor'] ?? null,
                'ruta'     => $datos['ruta'] ?? [],
                'eta_min'  => $datos['eta_min'] ?? null,
                'distancia_km' => $datos['distancia_km'] ?? null,
                'mayorista' => (string) $fila['mayorista_nombre'],
            ],
        ]);
    }

    // Mayorista o repartidor: estado y destino, sin rastrear al repartidor.
    responder([
        'ok' => true,
        'tracking' => [
            'pedido'   => $uuid,
            'folio'    => substr($uuid, 0, 8),
            'estado'   => $estado,
            'estado_texto' => ped_etiqueta($estado),
            'disponible' => false,
            'motivo'   => in_array($estado, ['en_camino', 'en_puerta'], true)
                ? 'El mapa en vivo lo ve el comercio que recibe el pedido.'
                : 'El mapa en vivo se activa cuando el repartidor sale con el pedido.',
            'destino'  => $papeles['repartidor'] && $fila['latitud'] !== null ? [
                'lat' => (float) $fila['latitud'],
                'lng' => (float) $fila['longitud'],
                'calle' => (string) $fila['calle'],
                'colonia' => (string) $fila['colonia'],
                'ciudad' => (string) $fila['ciudad'],
            ] : null,
            'repartidor' => null,
            'ruta'     => [],
            'eta_min'  => null,
            'distancia_km' => null,
            'mayorista' => (string) $fila['mayorista_nombre'],
        ],
    ]);
}

// ----------------------------------------------------------- pago simulado
if (preg_match('#^/pago/simulado/([A-Za-z0-9_\-]{4,100})$#', $rutaApi, $m) === 1 && in_array($metodoApi, ['GET', 'POST'], true)) {
    $referencia = $m[1];
    $pdo = ped_pdo();

    $stmt = $pdo->prepare(
        'SELECT p.*, c.comercio_id, cp.usuario_id AS comercio_usuario
         FROM pagos p
         JOIN checkouts c ON c.id = p.checkout_id
         JOIN comercios_perfil cp ON cp.id = c.comercio_id
         WHERE p.referencia_externa = ? LIMIT 1'
    );
    $stmt->execute([$referencia]);
    $pago = $stmt->fetch();

    if ($pago === false) {
        fallo('La referencia no corresponde a ningún pago.', 404, 'PAGO_NO_ENCONTRADO');
    }

    $esAdmin = str_starts_with(api_rol(), 'admin');

    if (!$esAdmin && (int) $pago['comercio_usuario'] !== api_uid()) {
        fallo('Ese pago no es tuyo.', 403, 'SIN_PERMISO');
    }

    $stmt = $pdo->prepare('SELECT uuid, total, estado FROM pedidos WHERE checkout_id = ? ORDER BY id');
    $stmt->execute([(int) $pago['checkout_id']]);
    $pedidos = [];
    foreach ($stmt->fetchAll() ?: [] as $p) {
        $pedidos[] = [
            'uuid' => (string) $p['uuid'],
            'total' => (float) $p['total'],
            'estado' => (string) $p['estado'],
            'estado_texto' => ped_etiqueta((string) $p['estado']),
        ];
    }

    if ($metodoApi === 'GET') {
        responder([
            'ok' => true,
            'pago' => [
                'referencia' => (string) $pago['referencia_externa'],
                'monto'      => (float) $pago['monto'],
                'estado'     => (string) $pago['estado'],
                'metodo'     => (string) $pago['metodo'],
                'creado'     => ped_fecha((string) $pago['created_at']),
                'pagado'     => in_array((string) $pago['estado'], ['autorizado', 'capturado'], true),
            ],
            'pedidos' => $pedidos,
        ]);
    }

    // Confirmación simulada: misma firma HMAC y misma ventana que la pasarela real.
    if ((string) $pago['estado'] === 'autorizado' || (string) $pago['estado'] === 'capturado') {
        responder([
            'ok' => true,
            'mensaje' => 'Este pago ya estaba confirmado.',
            'codigo' => 'YA_PROCESADO',
            'pedidos' => $pedidos,
        ]);
    }

    $config = require __DIR__ . '/../../app/Config/pagos.php';
    $pasarela = new SimuladoGateway((string) $config['webhook_secret'], 300);

    $payload = json_encode([
        'tipo'       => 'pago.aprobado',
        'referencia' => (string) $pago['referencia_externa'],
        'metodo'     => (string) $pago['metodo'],
        'monto'      => (float) $pago['monto'],
    ], JSON_UNESCAPED_UNICODE) ?: '{}';

    $timestamp = (string) time();
    $firma = $pasarela->firmar($payload, (int) $timestamp);
    $evento = 'evt_' . bin2hex(random_bytes(8));

    $servicio = new PagoService(
        $pdo,
        ped_pedidos(),
        $pasarela,
        new AuditLogger($pdo),
        $config,
    );

    $resultado = $servicio->procesarWebhook($payload, $firma, $timestamp, $evento);

    if (!$resultado['ok']) {
        fallo((string) $resultado['mensaje'], 422, (string) $resultado['codigo']);
    }

    responder([
        'ok' => true,
        'mensaje' => 'Pago confirmado. El pedido pasó a «Por aceptar».',
        'codigo' => (string) $resultado['codigo'],
        'pedidos' => $pedidos,
    ]);
}
