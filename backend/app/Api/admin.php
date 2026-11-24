<?php

declare(strict_types=1);

// Las ayudas compartidas no las carga api.php: cada módulo se trae _comun.php.
require_once __DIR__ . '/_comun.php';

/**
 * Módulo de administración de la SPA.
 *
 * public/api.php ya resolvió sesión, cuerpo JSON y el control de Origin.
 * Aquí solo se decide el rol: cualquier «admin*» puede leer (lectura amplia),
 * únicamente admin_total puede mutar.
 *
 * Rutas (todas bajo /admin/…, porque /admin a secas lo resuelve api.php):
 *   GET    /admin/panel
 *   GET    /admin/usuarios?q=&rol=&estado=&page=
 *   GET    /admin/usuarios/{id}
 *   POST   /admin/usuarios/{id}/roles    {roles:[]}
 *   POST   /admin/usuarios/{id}/estado   {activo:bool}
 *   GET    /admin/kyc?estado=
 *   POST   /admin/kyc/{id}               {decision:'aprobar'|'rechazar', motivo}
 *   GET    /admin/reclamos?estado=
 *   POST   /admin/reclamos/{id}          {estado, resolucion, monto_reembolso, respuesta}
 *   GET    /admin/parametros
 *   POST   /admin/parametros/{clave}     {valor}
 *   GET    /admin/parametros/{clave}/historial
 *   GET    /admin/postmvp
 *   POST   /admin/postmvp/consolidaciones
 *   POST   /admin/postmvp/bnpl
 *   POST   /admin/postmvp/licitaciones
 *   POST   /admin/postmvp/{recurso}/{id}/estado
 *   GET    /admin/kyc/{id}/archivo         → streaming del documento (preview)
 */

// ---------------------------------------------------------------- ayudas

/** Roles reales del usuario en sesión (la sesión solo guarda el primero). */
function admin_roles(): array
{
    static $roles = null;

    if ($roles !== null) {
        return $roles;
    }

    $stmt = api_pdo()->prepare(
        'SELECT r.nombre FROM usuario_roles ur JOIN roles r ON r.id = ur.rol_id
         WHERE ur.usuario_id = ? ORDER BY r.id'
    );
    $stmt->execute([api_uid()]);
    $roles = array_values(array_map('strval', $stmt->fetchAll(PDO::FETCH_COLUMN) ?: []));

    return $roles;
}

function admin_es_total(): bool
{
    return in_array('admin_total', admin_roles(), true);
}

/** Cualquier rol que empiece por «admin» puede leer. */
function admin_exigir_lectura(): void
{
    foreach (admin_roles() as $rol) {
        if (str_starts_with($rol, 'admin')) {
            return;
        }
    }

    if (str_starts_with(api_rol(), 'admin')) {
        return;
    }

    fallo('Esta sección es solo para el equipo de administración.', 403, 'SIN_PERMISO');
}

/** Solo admin_total muta, salvo los ámbitos donde el panel PHP acepta un subrol. */
function admin_exigir_mutacion(array $tambien = []): void
{
    admin_exigir_lectura();

    if (admin_es_total()) {
        return;
    }

    $rol = (string) (api_rol() ?? '');
    if (in_array($rol, $tambien, true)) {
        return;
    }

    fallo(
        'Tu rol puede consultar esta sección pero no modificarla. Se necesita admin_total.',
        403,
        'SOLO_ADMIN_TOTAL'
    );
}

function admin_ip(): ?string
{
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? '');

    return $ip === '' ? null : $ip;
}

function admin_nombre(int $uid): string
{
    $stmt = api_pdo()->prepare('SELECT nombre FROM usuarios WHERE id = ? LIMIT 1');
    $stmt->execute([$uid]);

    return (string) ($stmt->fetchColumn() ?: '');
}

/**
 * Escribe en audit_log con el formato de la casa (nombre, rol, antes/después).
 * audit_log.nombre y .rol son NOT NULL, así que se rellenan siempre.
 */
function admin_auditar(
    string $accion,
    string $entidad,
    string $entidadId,
    string $descripcion,
    ?array $antes = null,
    ?array $despues = null,
): void {
    $roles = admin_roles();
    $stmt = api_pdo()->prepare(
        'INSERT INTO audit_log (usuario_id, nombre, rol, accion, entidad, entidad_id, descripcion, antes, despues, ip, user_agent, detalle)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $stmt->execute([
        api_uid(),
        admin_nombre(api_uid()),
        (string) ($roles[0] ?? api_rol()),
        $accion,
        $entidad,
        $entidadId,
        mb_substr($descripcion, 0, 255),
        $antes === null ? null : json_encode($antes, JSON_UNESCAPED_UNICODE),
        $despues === null ? null : json_encode($despues, JSON_UNESCAPED_UNICODE),
        \App\Core\AuditLogger::ipBinaria(admin_ip()),
        mb_substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255),
        $despues === null ? null : json_encode($despues, JSON_UNESCAPED_UNICODE),
    ]);
}

/** uuid v4 sin depender de la librería (el proyecto ya la trae, pero así no falla). */
function admin_uuid(): string
{
    if (class_exists(\Ramsey\Uuid\Uuid::class)) {
        return \Ramsey\Uuid\Uuid::uuid4()->toString();
    }

    $b = random_bytes(16);
    $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
    $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);

    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
}

/** Estado KYC de un usuario: documento/perfil del rol que tenga. */
function admin_kyc_usuario(int $usuarioId): string
{
    $stmt = api_pdo()->prepare(
        "SELECT COALESCE(
            (SELECT mp.estado_kyc FROM mayoristas_perfil mp WHERE mp.usuario_id = ? LIMIT 1),
            (SELECT rp.estado_kyc FROM repartidores_perfil rp WHERE rp.usuario_id = ? LIMIT 1),
            'sin_perfil'
         )"
    );
    $stmt->execute([$usuarioId, $usuarioId]);

    return (string) ($stmt->fetchColumn() ?: 'sin_perfil');
}

/** Devuelve un parámetro de la tabla parametros (o el defecto). */
function admin_parametro(string $clave, string $defecto): string
{
    $stmt = api_pdo()->prepare('SELECT valor_actual FROM parametros WHERE clave = ? LIMIT 1');
    $stmt->execute([$clave]);
    $valor = $stmt->fetchColumn();

    return $valor === false || $valor === null ? $defecto : (string) $valor;
}

// ---------------------------------------------------------------- contexto

$adminRuta = (string) (api_ctx()['ruta'] ?? '');

if (!str_starts_with($adminRuta, '/admin/')) {
    return; // la ruta no es de este módulo: se devuelve el control
}

$adminMetodo = strtoupper((string) (api_ctx()['metodo'] ?? 'GET'));
$adminPartes = array_values(array_filter(
    explode('/', substr($adminRuta, strlen('/admin/'))),
    static fn (string $p): bool => $p !== ''
));
$adminSeccion = $adminPartes[0] ?? '';
$adminPdo = api_pdo();

// ---------------------------------------------------------------- panel

if ($adminSeccion === 'panel' && $adminMetodo === 'GET') {
    admin_exigir_lectura();

    $cuenta = static fn (string $sql): int => (int) $adminPdo->query($sql)->fetchColumn();

    $kycDocs = $cuenta("SELECT COUNT(*) FROM kyc_documentos WHERE estado = 'pendiente'");
    $kycPerfiles = $cuenta("SELECT COUNT(*) FROM mayoristas_perfil WHERE estado_kyc IN ('pendiente','en_revision')")
        + $cuenta("SELECT COUNT(*) FROM repartidores_perfil WHERE estado_kyc IN ('pendiente','en_revision')");
    $reclamosAbiertos = $cuenta("SELECT COUNT(*) FROM reclamos WHERE estado = 'abierto'");
    $enviosSinRepartidor = $cuenta("SELECT COUNT(*) FROM envios WHERE repartidor_id IS NULL AND estado NOT IN ('entregado','cancelado','devuelto')");

    // Flota: repartidores disponibles y viajes consolidados del día.
    $flota = [
        'repartidores_en_linea' => $cuenta('SELECT COUNT(*) FROM repartidores_perfil WHERE disponible = 1 AND estado_kyc = \'aprobado\''),
        'viajes_activos' => $cuenta("SELECT COUNT(*) FROM viajes_ruta WHERE estado IN ('planeada','en_curso')"),
        'paradas_pendientes' => $cuenta('SELECT COUNT(*) FROM envios e WHERE e.viaje_ruta_id IS NOT NULL AND e.parada_completada_at IS NULL'),
        'rescatados_hoy' => $cuenta("SELECT COUNT(*) FROM envios WHERE red_referencia IS NOT NULL AND DATE(updated_at) = CURDATE()"),
    ];

    $contadores = [
        'usuarios' => $cuenta('SELECT COUNT(*) FROM usuarios WHERE deleted_at IS NULL'),
        'comercios' => $cuenta('SELECT COUNT(*) FROM comercios_perfil'),
        'mayoristas' => $cuenta('SELECT COUNT(*) FROM mayoristas_perfil'),
        'pedidos_hoy' => $cuenta('SELECT COUNT(*) FROM pedidos WHERE DATE(created_at) = CURDATE()'),
        'pedidos_activos' => $cuenta("SELECT COUNT(*) FROM pedidos WHERE estado NOT IN ('recibido','cancelado','expirado','devuelto','reembolsado')"),
        'kyc_documentos' => $kycDocs,
        'kyc_perfiles' => $kycPerfiles,
        'reclamos_abiertos' => $reclamosAbiertos,
        'envios_sin_repartidor' => $enviosSinRepartidor,
        'flota' => $flota,
    ];

    $pendientes = [];
    if ($kycDocs > 0 || $kycPerfiles > 0) {
        $pendientes[] = [
            'tipo' => 'kyc',
            'cantidad' => $kycDocs + $kycPerfiles,
            'titulo' => 'Verificaciones KYC pendientes',
            'texto' => $kycDocs > 0
                ? $kycDocs . ' documento(s) esperando revisión.'
                : $kycPerfiles . ' perfil(es) sin documentos aprobados.',
            'accion' => 'Revisar cola',
            'href' => '/admin/kyc',
        ];
    }
    if ($reclamosAbiertos > 0) {
        $pendientes[] = [
            'tipo' => 'reclamos',
            'cantidad' => $reclamosAbiertos,
            'titulo' => 'Reclamos abiertos',
            'texto' => 'Pedidos esperando resolución del equipo.',
            'accion' => 'Atender',
            'href' => '/admin/reclamos',
        ];
    }
    if ($enviosSinRepartidor > 0) {
        $pendientes[] = [
            'tipo' => 'envios',
            'cantidad' => $enviosSinRepartidor,
            'titulo' => 'Envíos sin repartidor',
            'texto' => 'Pedidos aceptados que todavía no tienen quién los lleve.',
            'accion' => 'Ver pedidos',
            'href' => '/pedidos',
        ];
    }

    $stmt = $adminPdo->query(
        "SELECT a.id, a.usuario_id, a.accion, a.entidad, a.entidad_id, a.descripcion, a.created_at,
                COALESCE(NULLIF(a.nombre, ''), u.nombre, 'Sistema') AS quien,
                COALESCE(
                    NULLIF(a.rol, ''),
                    (SELECT r.nombre FROM usuario_roles ur JOIN roles r ON r.id = ur.rol_id
                     WHERE ur.usuario_id = a.usuario_id ORDER BY r.id LIMIT 1),
                    'sistema'
                ) AS rol
         FROM audit_log a
         LEFT JOIN usuarios u ON u.id = a.usuario_id
         ORDER BY a.id DESC
         LIMIT 10"
    );

    responder([
        'ok' => true,
        'contadores' => $contadores,
        'pendientes' => $pendientes,
        'actividad' => $stmt->fetchAll() ?: [],
        'permisos' => ['rol' => (string) (admin_roles()[0] ?? api_rol()), 'puede_mutar' => admin_es_total()],
    ]);
}

// ---------------------------------------------------------------- usuarios

if ($adminSeccion === 'usuarios') {
    admin_exigir_lectura();

    // Roles que existen de verdad en la tabla roles (para el formulario).
    $rolesDisponibles = array_map(
        'strval',
        $adminPdo->query('SELECT nombre FROM roles ORDER BY id')->fetchAll(PDO::FETCH_COLUMN) ?: []
    );

    // POST /admin/usuarios/{id}/roles
    if ($adminMetodo === 'POST' && count($adminPartes) === 3 && $adminPartes[2] === 'roles') {
        admin_exigir_mutacion();

        $id = (int) $adminPartes[1];
        $cuerpo = api_cuerpo();
        $pedidos = $cuerpo['roles'] ?? null;

        if (!is_array($pedidos) || $pedidos === []) {
            fallo('Elige al menos un rol para el usuario.', 422, 'ROLES_FALTANTES');
        }

        $nuevos = [];
        foreach ($pedidos as $nombre) {
            $nombre = trim((string) $nombre);
            if ($nombre !== '') {
                $nuevos[] = $nombre;
            }
        }
        $nuevos = array_values(array_unique($nuevos));

        $stmt = $adminPdo->prepare('SELECT id FROM usuarios WHERE id = ? AND deleted_at IS NULL LIMIT 1');
        $stmt->execute([$id]);
        if (!$stmt->fetchColumn()) {
            fallo('Ese usuario no existe.', 404, 'NO_ENCONTRADO');
        }

        $mapa = [];
        $stmt = $adminPdo->prepare('SELECT id FROM roles WHERE nombre = ? LIMIT 1');
        foreach ($nuevos as $nombre) {
            $stmt->execute([$nombre]);
            $rolId = $stmt->fetchColumn();
            if ($rolId === false) {
                fallo("El rol «{$nombre}» no existe.", 422, 'ROL_INVALIDO');
            }
            $mapa[$nombre] = (int) $rolId;
        }

        $stmt = $adminPdo->prepare(
            'SELECT r.nombre FROM usuario_roles ur JOIN roles r ON r.id = ur.rol_id WHERE ur.usuario_id = ? ORDER BY r.id'
        );
        $stmt->execute([$id]);
        $anteriores = array_values(array_map('strval', $stmt->fetchAll(PDO::FETCH_COLUMN) ?: []));

        // No dejar la plataforma sin ningún admin_total.
        if (in_array('admin_total', $anteriores, true) && !in_array('admin_total', $nuevos, true)) {
            $stmt = $adminPdo->prepare(
                "SELECT COUNT(*) FROM usuario_roles ur JOIN roles r ON r.id = ur.rol_id
                 WHERE r.nombre = 'admin_total' AND ur.usuario_id <> ?"
            );
            $stmt->execute([$id]);
            if ((int) $stmt->fetchColumn() === 0) {
                fallo('No puedes quitar el último admin_total de la plataforma.', 409, 'ULTIMO_ADMIN');
            }
        }

        $adminPdo->beginTransaction();
        try {
            $adminPdo->prepare('DELETE FROM usuario_roles WHERE usuario_id = ?')->execute([$id]);
            $insertar = $adminPdo->prepare('INSERT INTO usuario_roles (usuario_id, rol_id) VALUES (?, ?)');
            foreach ($mapa as $rolId) {
                $insertar->execute([$id, $rolId]);
            }
            $adminPdo->commit();
        } catch (\Throwable $e) {
            $adminPdo->rollBack();
            throw $e;
        }

        admin_auditar(
            'admin.usuario.roles',
            'usuarios',
            (string) $id,
            'Roles de usuario #' . $id . ' cambiados a ' . implode(', ', $nuevos),
            ['roles' => $anteriores],
            ['roles' => $nuevos]
        );

        responder([
            'ok' => true,
            'mensaje' => 'Roles actualizados: ' . implode(', ', $nuevos) . '.',
            'roles' => $nuevos,
        ]);
    }

    // POST /admin/usuarios/{id}/estado
    if ($adminMetodo === 'POST' && count($adminPartes) === 3 && $adminPartes[2] === 'estado') {
        admin_exigir_mutacion();

        $id = (int) $adminPartes[1];
        $cuerpo = api_cuerpo();

        if (!array_key_exists('activo', $cuerpo) || !is_bool($cuerpo['activo'])) {
            fallo('Envía activo: true o false.', 422, 'DATOS_FALTANTES');
        }

        if ($id === api_uid() && $cuerpo['activo'] === false) {
            fallo('No puedes suspender tu propia cuenta.', 409, 'AUTO_SUSPENSION');
        }

        $stmt = $adminPdo->prepare('SELECT estado FROM usuarios WHERE id = ? AND deleted_at IS NULL LIMIT 1');
        $stmt->execute([$id]);
        $estadoActual = $stmt->fetchColumn();

        if ($estadoActual === false) {
            fallo('Ese usuario no existe.', 404, 'NO_ENCONTRADO');
        }

        $nuevoEstado = $cuerpo['activo'] === true ? 'activo' : 'suspendido';
        $adminPdo->prepare('UPDATE usuarios SET estado = ?, updated_at = NOW() WHERE id = ?')->execute([$nuevoEstado, $id]);

        admin_auditar(
            'admin.usuario.estado',
            'usuarios',
            (string) $id,
            'Usuario #' . $id . ' pasó de ' . $estadoActual . ' a ' . $nuevoEstado,
            ['estado' => (string) $estadoActual],
            ['estado' => $nuevoEstado]
        );

        responder(['ok' => true, 'mensaje' => 'Cuenta ' . ($nuevoEstado === 'activo' ? 'reactivada' : 'suspendida') . '.', 'estado' => $nuevoEstado]);
    }

    // GET /admin/usuarios/{id}
    if ($adminMetodo === 'GET' && count($adminPartes) === 2) {
        $id = (int) $adminPartes[1];

        $stmt = $adminPdo->prepare(
            'SELECT u.id, u.uuid, u.nombre, u.email, u.telefono, u.estado, u.created_at, u.updated_at,
                    u.ultimo_login_at, u.email_verificado_at, u.telefono_verificado_at,
                    GROUP_CONCAT(r.nombre ORDER BY r.id) AS roles
             FROM usuarios u
             LEFT JOIN usuario_roles ur ON ur.usuario_id = u.id
             LEFT JOIN roles r ON r.id = ur.rol_id
             WHERE u.id = ? AND u.deleted_at IS NULL
             GROUP BY u.id LIMIT 1'
        );
        $stmt->execute([$id]);
        $usuario = $stmt->fetch();

        if ($usuario === false) {
            fallo('Ese usuario no existe.', 404, 'NO_ENCONTRADO');
        }

        $roles = $usuario['roles'] !== null && $usuario['roles'] !== ''
            ? explode(',', (string) $usuario['roles'])
            : [];

        $perfiles = [];

        $stmt = $adminPdo->prepare(
            'SELECT id, nombre_negocio, giro, telefono_contacto, gasto_mes_actual, created_at
             FROM comercios_perfil WHERE usuario_id = ? LIMIT 1'
        );
        $stmt->execute([$id]);
        $perfiles['comercio'] = $stmt->fetch() ?: null;

        $stmt = $adminPdo->prepare(
            'SELECT id, uuid, nombre_comercial, razon_social, categoria_giro, monto_minimo, estado_kyc, activo, created_at
             FROM mayoristas_perfil WHERE usuario_id = ? LIMIT 1'
        );
        $stmt->execute([$id]);
        $perfiles['mayorista'] = $stmt->fetch() ?: null;

        $stmt = $adminPdo->prepare(
            'SELECT id, estado_kyc, disponible, calificacion_promedio, created_at
             FROM repartidores_perfil WHERE usuario_id = ? LIMIT 1'
        );
        $stmt->execute([$id]);
        $perfiles['repartidor'] = $stmt->fetch() ?: null;

        // Pedidos: comercio_id y mayorista_id apuntan a los perfiles, no al usuario.
        $comercioId = (int) ($perfiles['comercio']['id'] ?? 0);
        $mayoristaId = (int) ($perfiles['mayorista']['id'] ?? 0);

        $pedidos = [];
        if ($comercioId > 0 || $mayoristaId > 0) {
            $stmt = $adminPdo->prepare(
                'SELECT p.uuid, p.total, p.estado, p.created_at
                 FROM pedidos p
                 WHERE p.comercio_id = ? OR p.mayorista_id = ?
                 ORDER BY p.created_at DESC LIMIT 20'
            );
            $stmt->execute([$comercioId, $mayoristaId]);
            $pedidos = $stmt->fetchAll() ?: [];
        }

        $stmt = $adminPdo->prepare(
            'SELECT id, tipo, ruta_archivo, mime, tamano_bytes, estado, motivo_rechazo, created_at, updated_at
             FROM kyc_documentos WHERE usuario_id = ? ORDER BY created_at DESC LIMIT 20'
        );
        $stmt->execute([$id]);
        $documentos = $stmt->fetchAll() ?: [];

        $stmt = $adminPdo->prepare(
            "SELECT a.accion, a.entidad, a.entidad_id, a.descripcion, a.created_at,
                    COALESCE(INET6_NTOA(a.ip), '') AS ip
             FROM audit_log a WHERE a.usuario_id = ? ORDER BY a.id DESC LIMIT 15"
        );
        $stmt->execute([$id]);
        $auditoria = $stmt->fetchAll() ?: [];

        unset($usuario['roles']);

        responder([
            'ok' => true,
            'usuario' => $usuario + ['roles' => $roles],
            'perfiles' => $perfiles,
            'pedidos' => $pedidos,
            'documentos' => $documentos,
            'auditoria' => $auditoria,
            'roles_disponibles' => $rolesDisponibles,
            'permisos' => ['rol' => (string) (admin_roles()[0] ?? api_rol()), 'puede_mutar' => admin_es_total()],
        ]);
    }

    // GET /admin/usuarios?q=&rol=&estado=&page=
    if ($adminMetodo === 'GET' && count($adminPartes) === 1) {
        $q = api_q('q');
        $rolFiltro = api_q('rol');
        $estadoFiltro = api_q('estado');
        $page = api_qint('page', 1, 1);
        $porPagina = 20;

        $where = ['u.deleted_at IS NULL'];
        $params = [];

        if ($q !== '') {
            $where[] = '(u.nombre LIKE :q1 OR u.email LIKE :q2)';
            $params[':q1'] = '%' . $q . '%';
            $params[':q2'] = '%' . $q . '%';
        }
        if ($rolFiltro !== '') {
            $where[] = 'EXISTS (SELECT 1 FROM usuario_roles ur2 JOIN roles r2 ON r2.id = ur2.rol_id
                                WHERE ur2.usuario_id = u.id AND r2.nombre = :rol)';
            $params[':rol'] = $rolFiltro;
        }
        if ($estadoFiltro !== '') {
            $where[] = 'u.estado = :estado';
            $params[':estado'] = $estadoFiltro;
        }

        $whereSql = ' WHERE ' . implode(' AND ', $where);

        $stmt = $adminPdo->prepare('SELECT COUNT(*) FROM usuarios u' . $whereSql);
        $stmt->execute($params);
        $total = (int) $stmt->fetchColumn();
        $paginas = max(1, (int) ceil($total / $porPagina));
        $page = min($page, $paginas);
        $offset = ($page - 1) * $porPagina;

        $stmt = $adminPdo->prepare(
            "SELECT u.id, u.nombre, u.email, u.estado, u.created_at, u.ultimo_login_at,
                    GROUP_CONCAT(DISTINCT r.nombre ORDER BY r.id) AS roles,
                    COALESCE(
                        (SELECT mp.estado_kyc FROM mayoristas_perfil mp WHERE mp.usuario_id = u.id LIMIT 1),
                        (SELECT rp.estado_kyc FROM repartidores_perfil rp WHERE rp.usuario_id = u.id LIMIT 1)
                    ) AS kyc
             FROM usuarios u
             LEFT JOIN usuario_roles ur ON ur.usuario_id = u.id
             LEFT JOIN roles r ON r.id = ur.rol_id" . $whereSql . '
             GROUP BY u.id
             ORDER BY u.created_at DESC, u.id DESC
             LIMIT ' . $porPagina . ' OFFSET ' . $offset
        );
        $stmt->execute($params);

        $usuarios = [];
        foreach ($stmt->fetchAll() ?: [] as $fila) {
            $rolesFila = $fila['roles'] !== null && $fila['roles'] !== ''
                ? explode(',', (string) $fila['roles'])
                : [];

            $usuarios[] = [
                'id' => (int) $fila['id'],
                'nombre' => (string) $fila['nombre'],
                'email' => (string) $fila['email'],
                'estado' => (string) $fila['estado'],
                'created_at' => (string) $fila['created_at'],
                'ultimo_login_at' => $fila['ultimo_login_at'],
                'roles' => $rolesFila,
                'kyc' => (string) ($fila['kyc'] ?: 'sin_perfil'),
            ];
        }

        responder([
            'ok' => true,
            'usuarios' => $usuarios,
            'total' => $total,
            'page' => $page,
            'paginas' => $paginas,
            'per_page' => $porPagina,
            'roles_disponibles' => $rolesDisponibles,
            'filtros' => ['q' => $q, 'rol' => $rolFiltro, 'estado' => $estadoFiltro],
            'permisos' => ['rol' => (string) (admin_roles()[0] ?? api_rol()), 'puede_mutar' => admin_es_total()],
        ]);
    }

    fallo('Ruta de usuarios no reconocida.', 404, 'NO_ENCONTRADA');
}

// ---------------------------------------------------------------- KYC

if ($adminSeccion === 'kyc') {
    admin_exigir_lectura();

    // POST /admin/kyc/{id}
    if ($adminMetodo === 'POST' && count($adminPartes) === 2) {
        // Igual que el panel PHP: admin_kyc también aprueba y rechaza documentos.
        admin_exigir_mutacion(['admin_kyc']);

        $id = (int) $adminPartes[1];
        $cuerpo = api_cuerpo();
        $decision = strtolower(trim((string) ($cuerpo['decision'] ?? '')));
        $motivo = trim((string) ($cuerpo['motivo'] ?? ''));

        if (!in_array($decision, ['aprobar', 'rechazar'], true)) {
            fallo('La decisión debe ser «aprobar» o «rechazar».', 422, 'DECISION_INVALIDA');
        }
        if ($decision === 'rechazar' && $motivo === '') {
            fallo('Escribe el motivo del rechazo: el usuario lo verá.', 422, 'MOTIVO_FALTANTE');
        }

        $stmt = $adminPdo->prepare(
            'SELECT id, usuario_id, tipo, estado FROM kyc_documentos WHERE id = ? LIMIT 1'
        );
        $stmt->execute([$id]);
        $documento = $stmt->fetch();

        if ($documento === false) {
            fallo('Ese documento no existe.', 404, 'NO_ENCONTRADO');
        }

        $usuarioId = (int) $documento['usuario_id'];
        $estadoDocumento = $decision === 'aprobar' ? 'aprobado' : 'rechazado';

        $adminPdo->beginTransaction();
        try {
            $adminPdo->prepare(
                'UPDATE kyc_documentos
                 SET estado = ?, revisado_por = ?, motivo_rechazo = ?, updated_at = NOW()
                 WHERE id = ?'
            )->execute([$estadoDocumento, api_uid(), $decision === 'rechazar' ? $motivo : null, $id]);

            // El perfil del usuario refleja la decisión (primero comercio→mayorista→repartidor existente).
            $perfilAfectado = '';
            foreach (['mayoristas_perfil', 'repartidores_perfil'] as $tabla) {
                $stmt = $adminPdo->prepare("SELECT id, estado_kyc FROM {$tabla} WHERE usuario_id = ? LIMIT 1");
                $stmt->execute([$usuarioId]);
                $perfil = $stmt->fetch();
                if ($perfil !== false) {
                    $adminPdo->prepare(
                        "UPDATE {$tabla} SET estado_kyc = ?, updated_at = NOW() WHERE id = ?"
                    )->execute([$estadoDocumento, (int) $perfil['id']]);
                    $perfilAfectado = $tabla . '#' . (int) $perfil['id'];
                    break;
                }
            }

            $adminPdo->commit();
        } catch (\Throwable $e) {
            $adminPdo->rollBack();
            throw $e;
        }

        admin_auditar(
            'admin.kyc.decision',
            'kyc_documentos',
            (string) $id,
            'Documento ' . $documento['tipo'] . ' del usuario #' . $usuarioId . ' ' . $estadoDocumento
                . ($motivo !== '' ? ': ' . $motivo : ''),
            ['documento' => (string) $documento['estado']],
            ['documento' => $estadoDocumento, 'perfil' => $perfilAfectado, 'motivo' => $motivo]
        );

        responder([
            'ok' => true,
            'mensaje' => $decision === 'aprobar'
                ? 'Documento aprobado y perfil actualizado.'
                : 'Documento rechazado. El motivo queda visible para el usuario.',
            'estado' => $estadoDocumento,
        ]);
    }

    // GET /admin/kyc/{id}/archivo — streaming del documento con permisos.
    if ($adminMetodo === 'GET' && count($adminPartes) === 3 && $adminPartes[2] === 'archivo') {
        admin_exigir_lectura();

        $id = (int) $adminPartes[1];
        $stmt = $adminPdo->prepare(
            'SELECT ruta_archivo, mime, tamano_bytes FROM kyc_documentos WHERE id = ? LIMIT 1'
        );
        $stmt->execute([$id]);
        $doc = $stmt->fetch();

        if ($doc === false) {
            fallo('Ese documento no existe.', 404, 'NO_ENCONTRADO');
        }

        // El repositorio guarda el nombre del archivo, nunca rutas absolutas:
        // se fuerza a que caiga dentro del directorio de KYC.
        $nombre = basename((string) $doc['ruta_archivo']);
        $ruta = __DIR__ . '/../../storage/kyc/' . $nombre;
        $real = realpath($ruta);

        if ($real === false || !str_starts_with($real, (string) realpath(__DIR__ . '/../../storage/kyc')) || !is_file($real)) {
            fallo('El archivo del documento no está disponible.', 404, 'ARCHIVO_FALTANTE');
        }

        $mime = (string) $doc['mime'];
        $esPdf = str_contains($mime, 'pdf');

        header('Content-Type: ' . ($mime !== '' ? $mime : 'application/octet-stream'));
        header('Content-Length: ' . (string) filesize($real));
        header('X-Content-Type-Options: nosniff');
        header('Cache-Control: private, max-age=300');
        header(
            'Content-Disposition: ' . ($esPdf ? 'inline' : 'attachment') . '; filename="kyc-' . $id . '-' . $nombre . '"'
        );

        readfile($real);
        exit;
    }

    // GET /admin/kyc?estado=
    if ($adminMetodo === 'GET' && count($adminPartes) === 1) {
        $estadoFiltro = api_q('estado', 'pendiente');
        $permitidos = ['pendiente', 'aprobado', 'rechazado', 'vencido', 'todos'];
        if (!in_array($estadoFiltro, $permitidos, true)) {
            $estadoFiltro = 'pendiente';
        }

        $sql = "SELECT k.id, k.usuario_id, k.tipo, k.ruta_archivo, k.mime, k.tamano_bytes, k.estado,
                       k.motivo_rechazo, k.created_at, u.nombre, u.email,
                       COALESCE(
                           (SELECT mp.estado_kyc FROM mayoristas_perfil mp WHERE mp.usuario_id = u.id LIMIT 1),
                           (SELECT rp.estado_kyc FROM repartidores_perfil rp WHERE rp.usuario_id = u.id LIMIT 1)
                       ) AS estado_perfil,
                       COALESCE(
                           (SELECT mp.nombre_comercial FROM mayoristas_perfil mp WHERE mp.usuario_id = u.id LIMIT 1),
                           (SELECT c.nombre_negocio FROM comercios_perfil c WHERE c.usuario_id = u.id LIMIT 1),
                           (SELECT CONCAT('Repartidor #', rp.id) FROM repartidores_perfil rp WHERE rp.usuario_id = u.id LIMIT 1)
                       ) AS negocio
                FROM kyc_documentos k
                JOIN usuarios u ON u.id = k.usuario_id
                WHERE u.deleted_at IS NULL";
        $params = [];

        if ($estadoFiltro !== 'todos') {
            $sql .= ' AND k.estado = :estado';
            $params[':estado'] = $estadoFiltro;
        }

        $sql .= ' ORDER BY k.created_at ASC, k.id ASC LIMIT 200';

        $stmt = $adminPdo->prepare($sql);
        $stmt->execute($params);

        $porUsuario = [];
        foreach ($stmt->fetchAll() ?: [] as $fila) {
            $uid = (int) $fila['usuario_id'];
            if (!isset($porUsuario[$uid])) {
                $porUsuario[$uid] = [
                    'usuario_id' => $uid,
                    'nombre' => (string) $fila['nombre'],
                    'email' => (string) $fila['email'],
                    'negocio' => (string) ($fila['negocio'] ?? ''),
                    'estado_perfil' => (string) ($fila['estado_perfil'] ?? 'sin_perfil'),
                    'documentos' => [],
                ];
            }
            $porUsuario[$uid]['documentos'][] = [
                'id' => (int) $fila['id'],
                'tipo' => (string) $fila['tipo'],
                'ruta_archivo' => (string) $fila['ruta_archivo'],
                'mime' => (string) $fila['mime'],
                'tamano_bytes' => (int) $fila['tamano_bytes'],
                'estado' => (string) $fila['estado'],
                'motivo_rechazo' => $fila['motivo_rechazo'],
                'created_at' => (string) $fila['created_at'],
            ];
        }

        // Perfiles esperando verificación aunque todavía no suban documentos.
        $stmt = $adminPdo->query(
            "SELECT mp.usuario_id, u.nombre, u.email, mp.nombre_comercial AS negocio, 'mayorista' AS tipo_perfil, mp.estado_kyc
             FROM mayoristas_perfil mp JOIN usuarios u ON u.id = mp.usuario_id
             WHERE mp.estado_kyc IN ('pendiente','en_revision') AND u.deleted_at IS NULL
             UNION ALL
             SELECT rp.usuario_id, u.nombre, u.email, CONCAT('Repartidor #', rp.id) AS negocio, 'repartidor' AS tipo_perfil, rp.estado_kyc
             FROM repartidores_perfil rp JOIN usuarios u ON u.id = rp.usuario_id
             WHERE rp.estado_kyc IN ('pendiente','en_revision') AND u.deleted_at IS NULL
             ORDER BY estado_kyc ASC LIMIT 100"
        );

        responder([
            'ok' => true,
            'estado' => $estadoFiltro,
            'usuarios' => array_values($porUsuario),
            'perfiles_pendientes' => $stmt->fetchAll() ?: [],
            'permisos' => ['rol' => (string) (admin_roles()[0] ?? api_rol()), 'puede_mutar' => admin_es_total()],
        ]);
    }

    fallo('Ruta de KYC no reconocida.', 404, 'NO_ENCONTRADA');
}

// ---------------------------------------------------------------- reclamos

if ($adminSeccion === 'reclamos') {
    admin_exigir_lectura();

    // POST /admin/reclamos/{id}
    if ($adminMetodo === 'POST' && count($adminPartes) === 2) {
        admin_exigir_mutacion();

        $id = (int) $adminPartes[1];
        $cuerpo = api_cuerpo();
        $estadoNuevo = trim((string) ($cuerpo['estado'] ?? ''));
        $resolucion = trim((string) ($cuerpo['resolucion'] ?? ''));
        $respuesta = trim((string) ($cuerpo['respuesta'] ?? ''));
        $montoCrudo = $cuerpo['monto_reembolso'] ?? null;

        if (!in_array($estadoNuevo, ['respondido', 'resuelto', 'rechazado'], true)) {
            fallo('El estado debe ser respondido, resuelto o rechazado.', 422, 'ESTADO_INVALIDO');
        }

        $cierra = in_array($estadoNuevo, ['resuelto', 'rechazado'], true);

        if ($cierra) {
            if ($resolucion === '') {
                $resolucion = $estadoNuevo === 'rechazado' ? 'sin_reembolso' : '';
            }
            if (!in_array($resolucion, ['reembolso_total', 'reembolso_parcial', 'sin_reembolso'], true)) {
                fallo('Elige una resolución válida para cerrar el reclamo.', 422, 'RESOLUCION_INVALIDA');
            }
        } else {
            $resolucion = '';
        }

        $monto = null;
        if ($resolucion === 'reembolso_parcial') {
            if ($montoCrudo === null || $montoCrudo === '' || !is_numeric($montoCrudo) || (float) $montoCrudo <= 0) {
                fallo('Escribe el monto a reembolsar (mayor que cero).', 422, 'MONTO_REQUERIDO');
            }
            $monto = round((float) $montoCrudo, 2);
        } elseif ($resolucion === 'reembolso_total') {
            $stmt = $adminPdo->prepare('SELECT p.total FROM reclamos r JOIN pedidos p ON p.id = r.pedido_id WHERE r.id = ? LIMIT 1');
            $stmt->execute([$id]);
            $totalPedido = $stmt->fetchColumn();
            $monto = $totalPedido === false ? null : round((float) $totalPedido, 2);
        }

        $stmt = $adminPdo->prepare('SELECT estado, resolucion, monto_reembolso FROM reclamos WHERE id = ? LIMIT 1');
        $stmt->execute([$id]);
        $actual = $stmt->fetch();

        if ($actual === false) {
            fallo('Ese reclamo no existe.', 404, 'NO_ENCONTRADO');
        }

        $adminPdo->beginTransaction();
        try {
            if ($cierra) {
                $adminPdo->prepare(
                    'UPDATE reclamos
                     SET estado = ?, resolucion = ?, monto_reembolso = ?, respuesta = ?,
                         resuelto_por = ?, updated_at = NOW()
                     WHERE id = ?'
                )->execute([$estadoNuevo, $resolucion, $monto, $respuesta !== '' ? $respuesta : null, api_uid(), $id]);

                $adminPdo->prepare(
                    'INSERT INTO reclamo_valoraciones (reclamo_id, admin_id, resolucion, monto, notas)
                     VALUES (?, ?, ?, ?, ?)'
                )->execute([$id, api_uid(), $resolucion, $monto, $respuesta !== '' ? $respuesta : null]);
            } else {
                $adminPdo->prepare(
                    'UPDATE reclamos SET estado = ?, respuesta = ?, updated_at = NOW() WHERE id = ?'
                )->execute([$estadoNuevo, $respuesta !== '' ? $respuesta : null, $id]);
            }

            $adminPdo->commit();
        } catch (\Throwable $e) {
            $adminPdo->rollBack();
            throw $e;
        }

        admin_auditar(
            'admin.reclamo.resolucion',
            'reclamos',
            (string) $id,
            'Reclamo #' . $id . ' pasó a ' . $estadoNuevo . ($resolucion !== '' ? ' (' . $resolucion . ')' : ''),
            ['estado' => (string) $actual['estado'], 'resolucion' => $actual['resolucion']],
            ['estado' => $estadoNuevo, 'resolucion' => $resolucion, 'monto' => $monto]
        );

        responder([
            'ok' => true,
            'mensaje' => $cierra
                ? 'Reclamo cerrado como ' . str_replace('_', ' ', $resolucion) . '.'
                : 'Respuesta registrada; el reclamo sigue abierto.',
            'estado' => $estadoNuevo,
            'resolucion' => $resolucion,
            'monto_reembolso' => $monto,
        ]);
    }

    // GET /admin/reclamos?estado=
    if ($adminMetodo === 'GET' && count($adminPartes) === 1) {
        $estadoFiltro = api_q('estado');
        $permitidos = ['abierto', 'respondido', 'resuelto', 'rechazado'];

        $sql = 'SELECT r.id, r.uuid, r.tipo, r.descripcion, r.estado, r.resolucion, r.monto_reembolso,
                       r.responsable, r.respuesta, r.created_at, r.updated_at,
                       p.uuid AS pedido_uuid, p.total AS pedido_total, p.estado AS pedido_estado,
                       m.nombre_comercial AS mayorista, c.nombre_negocio AS comercio
                FROM reclamos r
                JOIN pedidos p ON p.id = r.pedido_id
                JOIN mayoristas_perfil m ON m.id = p.mayorista_id
                JOIN comercios_perfil c ON c.id = p.comercio_id';
        $params = [];

        if ($estadoFiltro !== '' && in_array($estadoFiltro, $permitidos, true)) {
            $sql .= ' WHERE r.estado = :estado';
            $params[':estado'] = $estadoFiltro;
        } else {
            $estadoFiltro = '';
        }

        $sql .= ' ORDER BY r.created_at DESC, r.id DESC LIMIT 100';
        $stmt = $adminPdo->prepare($sql);
        $stmt->execute($params);

        $conteo = [];
        foreach ($adminPdo->query('SELECT estado, COUNT(*) AS n FROM reclamos GROUP BY estado') as $fila) {
            $conteo[(string) $fila['estado']] = (int) $fila['n'];
        }

        responder([
            'ok' => true,
            'estado' => $estadoFiltro,
            'reclamos' => $stmt->fetchAll() ?: [],
            'conteo' => $conteo,
            'permisos' => ['rol' => (string) (admin_roles()[0] ?? api_rol()), 'puede_mutar' => admin_es_total()],
        ]);
    }

    fallo('Ruta de reclamos no reconocida.', 404, 'NO_ENCONTRADA');
}

// ---------------------------------------------------------------- parámetros

if ($adminSeccion === 'parametros') {
    admin_exigir_lectura();

    // GET /admin/parametros/{clave}/historial
    if ($adminMetodo === 'GET' && count($adminPartes) === 3 && $adminPartes[2] === 'historial') {
        $clave = urldecode((string) $adminPartes[1]);

        $stmt = $adminPdo->prepare('SELECT clave, valor_actual, tipo, descripcion, version, cambiado_at FROM parametros WHERE clave = ? LIMIT 1');
        $stmt->execute([$clave]);
        $parametro = $stmt->fetch();

        if ($parametro === false) {
            fallo('Ese parámetro no existe.', 404, 'NO_ENCONTRADO');
        }

        $stmt = $adminPdo->prepare(
            "SELECT ph.id, ph.version, ph.valor_anterior, ph.valor_nuevo, ph.cambiado_at,
                    COALESCE(ph.ip, '') AS ip,
                    COALESCE(u.email, 'desconocido') AS admin_email,
                    COALESCE(u.nombre, '') AS admin_nombre
             FROM parametros_historial ph
             LEFT JOIN usuarios u ON u.id = ph.usuario_id
             JOIN parametros p ON p.id = ph.parametro_id
             WHERE p.clave = ?
             ORDER BY ph.cambiado_at DESC, ph.id DESC
             LIMIT 50"
        );
        $stmt->execute([$clave]);

        responder([
            'ok' => true,
            'clave' => $clave,
            'parametro' => $parametro,
            'historial' => $stmt->fetchAll() ?: [],
        ]);
    }

    // POST /admin/parametros/{clave}
    if ($adminMetodo === 'POST' && count($adminPartes) === 2) {
        admin_exigir_mutacion();

        $clave = urldecode((string) $adminPartes[1]);
        $cuerpo = api_cuerpo();

        if (!array_key_exists('valor', $cuerpo)) {
            fallo('Envía el nuevo valor en «valor».', 422, 'DATOS_FALTANTES');
        }

        $nuevoValor = trim((string) $cuerpo['valor']);

        $stmt = $adminPdo->prepare('SELECT * FROM parametros WHERE clave = ? LIMIT 1');
        $stmt->execute([$clave]);
        $actual = $stmt->fetch();

        if ($actual === false) {
            fallo('Ese parámetro no existe.', 404, 'NO_ENCONTRADO');
        }

        $tipo = (string) $actual['tipo'];

        $valido = match ($tipo) {
            'int' => (bool) preg_match('/^-?\d+$/', $nuevoValor),
            'float' => (bool) preg_match('/^-?\d+(\.\d+)?$/', $nuevoValor),
            'bool' => in_array(strtolower($nuevoValor), ['true', 'false', '1', '0'], true),
            'json' => is_array(json_decode($nuevoValor, true)) || is_object(json_decode($nuevoValor)),
            default => true,
        };

        if (!$valido) {
            $pista = match ($tipo) {
                'int' => 'un número entero (por ejemplo 72)',
                'float' => 'un número decimal con punto (por ejemplo 5.00)',
                'bool' => 'true o false',
                'json' => 'JSON válido',
                default => 'texto',
            };
            fallo("El valor debe ser {$pista}.", 422, 'VALOR_INVALIDO');
        }

        if ($tipo === 'bool') {
            $nuevoValor = in_array(strtolower($nuevoValor), ['true', '1'], true) ? 'true' : 'false';
        }

        if ($nuevoValor === (string) $actual['valor_actual']) {
            responder([
                'ok' => true,
                'mensaje' => 'El valor ya era ese; no se creó una versión nueva.',
                'version' => (int) $actual['version'],
                'sin_cambios' => true,
            ]);
        }

        $nuevaVersion = (int) $actual['version'] + 1;

        $adminPdo->beginTransaction();
        try {
            $adminPdo->prepare(
                'INSERT INTO parametros_historial (parametro_id, valor_anterior, valor_nuevo, version, usuario_id, ip, cambiado_at)
                 VALUES (?, ?, ?, ?, ?, ?, NOW())'
            )->execute([
                (int) $actual['id'],
                (string) $actual['valor_actual'],
                $nuevoValor,
                $nuevaVersion,
                api_uid(),
                admin_ip(),
            ]);

            $adminPdo->prepare(
                'UPDATE parametros
                 SET valor_actual = ?, version = ?, cambiado_por = ?, cambiado_at = NOW()
                 WHERE clave = ?'
            )->execute([$nuevoValor, $nuevaVersion, api_uid(), $clave]);

            $adminPdo->commit();
        } catch (\Throwable $e) {
            $adminPdo->rollBack();
            throw $e;
        }

        admin_auditar(
            'admin.parametro.actualizar',
            'parametros',
            $clave,
            "Parámetro «{$clave}» pasó a v{$nuevaVersion}",
            ['valor' => (string) $actual['valor_actual'], 'version' => (int) $actual['version']],
            ['valor' => $nuevoValor, 'version' => $nuevaVersion]
        );

        responder([
            'ok' => true,
            'mensaje' => "Parámetro «{$clave}» actualizado a la versión {$nuevaVersion}.",
            'version' => $nuevaVersion,
        ]);
    }

    // GET /admin/parametros
    if ($adminMetodo === 'GET' && count($adminPartes) === 1) {
        $stmt = $adminPdo->query(
            "SELECT p.clave, p.valor_actual, p.tipo, p.descripcion, p.version, p.cambiado_at,
                    COALESCE(u.email, '') AS cambiado_por_email,
                    COALESCE(u.nombre, '') AS cambiado_por_nombre
             FROM parametros p
             LEFT JOIN usuarios u ON u.id = p.cambiado_por
             ORDER BY p.clave"
        );

        responder([
            'ok' => true,
            'parametros' => $stmt->fetchAll() ?: [],
            'permisos' => ['rol' => (string) (admin_roles()[0] ?? api_rol()), 'puede_mutar' => admin_es_total()],
        ]);
    }

    fallo('Ruta de parámetros no reconocida.', 404, 'NO_ENCONTRADA');
}

// ---------------------------------------------------------------- post-MVP

if ($adminSeccion === 'postmvp') {
    admin_exigir_lectura();

    // POST /admin/postmvp/consolidaciones
    if ($adminMetodo === 'POST' && count($adminPartes) === 2 && $adminPartes[1] === 'consolidaciones') {
        admin_exigir_mutacion();

        $cuerpo = api_cuerpo();
        $mayoristaId = (int) ($cuerpo['mayorista_id'] ?? 0);
        $uuids = $cuerpo['pedidos_ids'] ?? [];

        if ($mayoristaId <= 0 || !is_array($uuids) || $uuids === []) {
            fallo('Elige el mayorista y al menos dos pedidos.', 422, 'DATOS_FALTANTES');
        }

        $uuids = array_values(array_unique(array_filter(array_map(
            static fn ($u): string => trim((string) $u),
            $uuids
        ), static fn (string $u): bool => $u !== '')));

        $stmt = $adminPdo->prepare('SELECT nombre_comercial FROM mayoristas_perfil WHERE id = ? LIMIT 1');
        $stmt->execute([$mayoristaId]);
        if ($stmt->fetchColumn() === false) {
            fallo('Ese mayorista no existe.', 422, 'MAYORISTA_INVALIDO');
        }

        $minimo = (int) admin_parametro('flete.consolidacion_min_pedidos', '2');
        $minimo = max(2, $minimo);
        if (count($uuids) < $minimo) {
            fallo("Se necesitan al menos {$minimo} pedidos para consolidar.", 422, 'MINIMO_PEDIDOS');
        }

        $marcas = implode(',', array_fill(0, count($uuids), '?'));
        $stmt = $adminPdo->prepare(
            "SELECT COUNT(*) AS n, COALESCE(SUM(envio), 0) AS flete
             FROM pedidos WHERE uuid IN ({$marcas}) AND mayorista_id = ?"
        );
        $stmt->execute(array_merge($uuids, [$mayoristaId]));
        $fila = $stmt->fetch() ?: ['n' => 0, 'flete' => 0];

        if ((int) $fila['n'] !== count($uuids)) {
            fallo('Algún pedido no existe o no pertenece a ese mayorista.', 422, 'PEDIDOS_INVALIDOS');
        }

        $fleteOriginal = round((float) $fila['flete'], 2);
        if ($fleteOriginal <= 0) {
            fallo('Esos pedidos no tienen flete cobrado; no hay nada que consolidar.', 422, 'SIN_FLETE');
        }

        $fleteConsolidado = round($fleteOriginal * 0.7, 2);
        $ahorro = round($fleteOriginal - $fleteConsolidado, 2);
        $uuid = admin_uuid();

        $adminPdo->prepare(
            'INSERT INTO consolidacion_fletes (uuid, mayorista_id, pedidos_ids, flete_original, flete_consolidado, ahorro, estado)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        )->execute([$uuid, $mayoristaId, json_encode($uuids), $fleteOriginal, $fleteConsolidado, $ahorro, 'activa']);

        $nuevoId = (int) $adminPdo->lastInsertId();

        admin_auditar(
            'admin.postmvp.consolidacion',
            'consolidacion_fletes',
            (string) $nuevoId,
            "Consolidación de {$fila['n']} pedidos del mayorista #{$mayoristaId} (ahorro $" . number_format($ahorro, 2) . ')',
            null,
            ['uuid' => $uuid, 'flete_original' => $fleteOriginal, 'flete_consolidado' => $fleteConsolidado, 'ahorro' => $ahorro]
        );

        responder([
            'ok' => true,
            'mensaje' => 'Consolidación creada. Ahorro: $' . number_format($ahorro, 2),
            'id' => $nuevoId,
            'uuid' => $uuid,
            'flete_original' => $fleteOriginal,
            'flete_consolidado' => $fleteConsolidado,
            'ahorro' => $ahorro,
        ]);
    }

    // POST /admin/postmvp/bnpl
    if ($adminMetodo === 'POST' && count($adminPartes) === 2 && $adminPartes[1] === 'bnpl') {
        admin_exigir_mutacion();

        $cuerpo = api_cuerpo();
        $pedidoId = (int) ($cuerpo['pedido_id'] ?? 0);
        $cuotas = (int) ($cuerpo['cuotas'] ?? 3);
        $maxCuotas = max(2, (int) admin_parametro('bnpl.cuotas_max', '12'));

        if ($pedidoId <= 0) {
            fallo('Elige el pedido a diferir.', 422, 'PEDIDO_INVALIDO');
        }
        if ($cuotas < 2 || $cuotas > $maxCuotas) {
            fallo("Las cuotas deben estar entre 2 y {$maxCuotas}.", 422, 'CUOTAS_INVALIDAS');
        }

        $stmt = $adminPdo->prepare('SELECT id, uuid, total FROM pedidos WHERE id = ? LIMIT 1');
        $stmt->execute([$pedidoId]);
        $pedido = $stmt->fetch();

        if ($pedido === false) {
            fallo('Ese pedido no existe.', 404, 'NO_ENCONTRADO');
        }

        $stmt = $adminPdo->prepare('SELECT 1 FROM bnpl_plan WHERE pedido_id = ? LIMIT 1');
        $stmt->execute([$pedidoId]);
        if ($stmt->fetchColumn()) {
            fallo('Ese pedido ya tiene un plan BNPL.', 409, 'PLAN_EXISTENTE');
        }

        $total = round((float) $pedido['total'], 2);
        $cuotaMonto = round($total / $cuotas, 2);
        $uuid = admin_uuid();

        $adminPdo->beginTransaction();
        try {
            $adminPdo->prepare(
                "INSERT INTO bnpl_plan (uuid, pedido_id, total, cuotas, cuota_monto, cuota_actual, estado, primera_cuota, ultima_cuota)
                 VALUES (?, ?, ?, ?, ?, 1, 'activo', CURDATE(), DATE_ADD(CURDATE(), INTERVAL ? MONTH))"
            )->execute([$uuid, $pedidoId, $total, $cuotas, $cuotaMonto, $cuotas]);

            $planId = (int) $adminPdo->lastInsertId();

            $pago = $adminPdo->prepare(
                'INSERT INTO bnpl_pagos (bnpl_plan_id, cuota, monto, pagado) VALUES (?, ?, ?, 0)'
            );
            for ($i = 1; $i <= $cuotas; $i++) {
                $pago->execute([$planId, $i, $cuotaMonto]);
            }

            $adminPdo->commit();
        } catch (\Throwable $e) {
            $adminPdo->rollBack();
            throw $e;
        }

        admin_auditar(
            'admin.postmvp.bnpl',
            'bnpl_plan',
            (string) $planId,
            "Plan BNPL del pedido #{$pedidoId}: {$cuotas} cuotas de $" . number_format($cuotaMonto, 2),
            null,
            ['uuid' => $uuid, 'pedido_id' => $pedidoId, 'cuotas' => $cuotas, 'cuota_monto' => $cuotaMonto]
        );

        responder([
            'ok' => true,
            'mensaje' => "Plan creado: {$cuotas} cuotas de $" . number_format($cuotaMonto, 2) . '.',
            'id' => $planId,
            'uuid' => $uuid,
            'cuota_monto' => $cuotaMonto,
        ]);
    }

    // POST /admin/postmvp/licitaciones
    if ($adminMetodo === 'POST' && count($adminPartes) === 2 && $adminPartes[1] === 'licitaciones') {
        admin_exigir_mutacion();

        $cuerpo = api_cuerpo();
        $mayoristaId = (int) ($cuerpo['mayorista_id'] ?? 0);
        $titulo = trim((string) ($cuerpo['titulo'] ?? ''));
        $descripcion = trim((string) ($cuerpo['descripcion'] ?? ''));
        $minimo = $cuerpo['monto_minimo'] ?? null;
        $maximo = $cuerpo['monto_maximo'] ?? null;
        $ventana = (int) ($cuerpo['ventana_horas'] ?? 0);

        if ($mayoristaId <= 0 || $titulo === '') {
            fallo('Elige el mayorista y escribe un título.', 422, 'DATOS_FALTANTES');
        }

        $stmt = $adminPdo->prepare('SELECT 1 FROM mayoristas_perfil WHERE id = ? LIMIT 1');
        $stmt->execute([$mayoristaId]);
        if (!$stmt->fetchColumn()) {
            fallo('Ese mayorista no existe.', 422, 'MAYORISTA_INVALIDO');
        }

        $minimo = ($minimo === null || $minimo === '' || !is_numeric($minimo)) ? null : round((float) $minimo, 2);
        $maximo = ($maximo === null || $maximo === '' || !is_numeric($maximo)) ? null : round((float) $maximo, 2);

        if ($minimo !== null && $maximo !== null && $maximo < $minimo) {
            fallo('El monto máximo no puede ser menor que el mínimo.', 422, 'MONTOS_INCOHERENTES');
        }

        if ($ventana <= 0) {
            $ventana = max(1, (int) admin_parametro('licitacion.ventana_horas', '72'));
        }
        $ventana = min($ventana, 24 * 90);

        $uuid = admin_uuid();
        $adminPdo->prepare(
            "INSERT INTO licitaciones (uuid, mayorista_id, titulo, descripcion, monto_minimo, monto_maximo, estado, vence_en)
             VALUES (?, ?, ?, ?, ?, ?, 'abierta', DATE_ADD(NOW(), INTERVAL ? HOUR))"
        )->execute([$uuid, $mayoristaId, $titulo, $descripcion !== '' ? $descripcion : null, $minimo, $maximo, $ventana]);

        $nuevoId = (int) $adminPdo->lastInsertId();

        admin_auditar(
            'admin.postmvp.licitacion',
            'licitaciones',
            (string) $nuevoId,
            "Licitación «{$titulo}» abierta por {$ventana} h para el mayorista #{$mayoristaId}",
            null,
            ['uuid' => $uuid, 'titulo' => $titulo, 'ventana_horas' => $ventana]
        );

        responder([
            'ok' => true,
            'mensaje' => "Licitación «{$titulo}» creada con {$ventana} h de vigencia.",
            'id' => $nuevoId,
            'uuid' => $uuid,
            'ventana_horas' => $ventana,
        ]);
    }

    // POST /admin/postmvp/{recurso}/{id}/estado
    if ($adminMetodo === 'POST' && count($adminPartes) === 4 && $adminPartes[3] === 'estado') {
        admin_exigir_mutacion();

        $recurso = (string) $adminPartes[1];
        $id = (int) $adminPartes[2];
        $estadoNuevo = trim((string) (api_cuerpo()['estado'] ?? ''));

        $tablas = [
            'consolidaciones' => ['tabla' => 'consolidacion_fletes', 'estados' => ['activa', 'completada', 'cancelada'], 'campo' => 'estado'],
            'bnpl' => ['tabla' => 'bnpl_plan', 'estados' => ['pendiente', 'activo', 'completado', 'moroso', 'cancelado'], 'campo' => 'estado'],
            'licitaciones' => ['tabla' => 'licitaciones', 'estados' => ['abierta', 'cerrada', 'adjudicada', 'cancelada'], 'campo' => 'estado'],
        ];

        if (!isset($tablas[$recurso])) {
            fallo('Recurso post-MVP desconocido.', 404, 'NO_ENCONTRADA');
        }

        $cfg = $tablas[$recurso];

        if (!in_array($estadoNuevo, $cfg['estados'], true)) {
            fallo('Ese estado no aplica a este recurso.', 422, 'ESTADO_INVALIDO');
        }

        $stmt = $adminPdo->prepare('SELECT estado FROM ' . $cfg['tabla'] . ' WHERE id = ? LIMIT 1');
        $stmt->execute([$id]);
        $anterior = $stmt->fetchColumn();

        if ($anterior === false) {
            fallo('Ese registro no existe.', 404, 'NO_ENCONTRADO');
        }

        $extra = '';
        if ($recurso === 'consolidaciones' && $estadoNuevo === 'completada') {
            $extra = ', completado_at = NOW()';
        }

        $adminPdo->prepare('UPDATE ' . $cfg['tabla'] . ' SET estado = ?' . $extra . ' WHERE id = ?')
            ->execute([$estadoNuevo, $id]);

        admin_auditar(
            'admin.postmvp.estado',
            $cfg['tabla'],
            (string) $id,
            ucfirst($recurso) . ' #' . $id . ' pasó de ' . $anterior . ' a ' . $estadoNuevo,
            ['estado' => (string) $anterior],
            ['estado' => $estadoNuevo]
        );

        responder(['ok' => true, 'mensaje' => 'Estado actualizado a ' . $estadoNuevo . '.', 'estado' => $estadoNuevo]);
    }

    // GET /admin/postmvp
    if ($adminMetodo === 'GET' && count($adminPartes) === 1) {
        $consolidaciones = $adminPdo->query(
            "SELECT cf.id, cf.uuid, cf.pedidos_ids, cf.flete_original, cf.flete_consolidado, cf.ahorro,
                    cf.estado, cf.creado_at, m.nombre_comercial AS mayorista
             FROM consolidacion_fletes cf
             JOIN mayoristas_perfil m ON m.id = cf.mayorista_id
             ORDER BY cf.creado_at DESC, cf.id DESC LIMIT 100"
        )->fetchAll() ?: [];

        foreach ($consolidaciones as &$c) {
            $decodificado = json_decode((string) $c['pedidos_ids'], true);
            $c['pedidos'] = is_array($decodificado) ? count($decodificado) : 0;
            unset($c['pedidos_ids']);
        }
        unset($c);

        $bnpl = $adminPdo->query(
            "SELECT bp.id, bp.uuid, bp.total, bp.cuotas, bp.cuota_monto, bp.cuota_actual, bp.estado,
                    bp.primera_cuota, bp.ultima_cuota, bp.creado_at,
                    p.uuid AS pedido_uuid, m.nombre_comercial AS mayorista,
                    (SELECT COUNT(*) FROM bnpl_pagos x WHERE x.bnpl_plan_id = bp.id AND x.pagado = 1) AS pagadas
             FROM bnpl_plan bp
             JOIN pedidos p ON p.id = bp.pedido_id
             JOIN mayoristas_perfil m ON m.id = p.mayorista_id
             ORDER BY bp.creado_at DESC, bp.id DESC LIMIT 100"
        )->fetchAll() ?: [];

        $licitaciones = $adminPdo->query(
            "SELECT l.id, l.uuid, l.titulo, l.descripcion, l.monto_minimo, l.monto_maximo, l.estado,
                    l.vence_en, l.creado_at, m.nombre_comercial AS mayorista,
                    c.nombre_negocio AS comercio_adjudicado,
                    (SELECT COUNT(*) FROM licitaciones_cotizaciones lc WHERE lc.licitacion_id = l.id) AS cotizaciones
             FROM licitaciones l
             JOIN mayoristas_perfil m ON m.id = l.mayorista_id
             LEFT JOIN comercios_perfil c ON c.id = l.adjudicada_a
             ORDER BY l.creado_at DESC, l.id DESC LIMIT 100"
        )->fetchAll() ?: [];

        $resumen = [
            'consolidaciones_activas' => (int) $adminPdo->query("SELECT COUNT(*) FROM consolidacion_fletes WHERE estado = 'activa'")->fetchColumn(),
            'bnpl_activos' => (int) $adminPdo->query("SELECT COUNT(*) FROM bnpl_plan WHERE estado = 'activo'")->fetchColumn(),
            'licitaciones_abiertas' => (int) $adminPdo->query("SELECT COUNT(*) FROM licitaciones WHERE estado = 'abierta' AND vence_en > NOW()")->fetchColumn(),
            'ahorro_total' => (float) $adminPdo->query("SELECT COALESCE(SUM(ahorro), 0) FROM consolidacion_fletes WHERE estado IN ('activa','completada')")->fetchColumn(),
        ];

        // Datos para los formularios de alta.
        $mayoristas = $adminPdo->query(
            'SELECT id, nombre_comercial FROM mayoristas_perfil ORDER BY nombre_comercial'
        )->fetchAll() ?: [];

        $pedidos = $adminPdo->query(
            "SELECT p.id, p.uuid, p.total, p.envio, p.estado, p.mayorista_id, m.nombre_comercial AS mayorista
             FROM pedidos p JOIN mayoristas_perfil m ON m.id = p.mayorista_id
             WHERE p.estado IN ('recibido','entregado','en_camino','preparando','pendiente_aceptacion')
             ORDER BY p.created_at DESC LIMIT 60"
        )->fetchAll() ?: [];

        responder([
            'ok' => true,
            'resumen' => $resumen,
            'consolidaciones' => $consolidaciones,
            'bnpl' => $bnpl,
            'licitaciones' => $licitaciones,
            'mayoristas' => $mayoristas,
            'pedidos' => $pedidos,
            'parametros' => [
                'consolidacion_min_pedidos' => (int) admin_parametro('flete.consolidacion_min_pedidos', '2'),
                'bnpl_cuotas_max' => (int) admin_parametro('bnpl.cuotas_max', '12'),
                'licitacion_ventana_horas' => (int) admin_parametro('licitacion.ventana_horas', '72'),
            ],
            'permisos' => ['rol' => (string) (admin_roles()[0] ?? api_rol()), 'puede_mutar' => admin_es_total()],
        ]);
    }

    fallo('Ruta post-MVP no reconocida.', 404, 'NO_ENCONTRADA');
}

fallo('Ruta de administración no encontrada: ' . $adminRuta, 404, 'NO_ENCONTRADA');
