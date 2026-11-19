<?php

declare(strict_types=1);

/**
 * Módulo Perfil (Mi cuenta) de la SPA.
 *
 * Atiende todo lo que el panel PHP reparte entre perfil/index, editar,
 * privacidad, ajustes, seguridad, permisos, ayuda, kyc y la baja de cuenta.
 * Cada respuesta es JSON y cada endpoint exige sesión con un rol de cuenta.
 *
 * Rutas (todas bajo /api):
 *   GET    /perfil/detalle
 *   PATCH  /perfil
 *   POST   /perfil/avatar           DELETE /perfil/avatar
 *   POST   /perfil/direccion        PATCH|DELETE /perfil/direccion/{id}
 *   GET    /perfil/privacidad       POST   /perfil/privacidad
 *   POST   /perfil/password
 *   POST   /perfil/tema
 *   GET    /perfil/seguridad
 *   GET    /perfil/permisos
 *   GET    /kyc                     POST   /kyc
 *   GET    /ayuda
 *   POST   /perfil/eliminar
 *   POST   /perfil/calificar
 */

$perfilRuta = (string) (api_ctx()['ruta'] ?? '');
$perfilMetodo = (string) (api_ctx()['metodo'] ?? 'GET');

$perfilEsMia = str_starts_with($perfilRuta, '/perfil/')
    || $perfilRuta === '/perfil'
    || $perfilRuta === '/kyc'
    || $perfilRuta === '/ayuda';

if (!$perfilEsMia) {
    return;
}

/** El módulo solo sirve a cuentas con perfil propio. */
function perfil_exigir_cuenta(): void
{
    api_exigir('comercio', 'mayorista', 'repartidor', 'admin');
}

/** Etiqueta humana del rol, igual que en el panel. */
function perfil_etiqueta_rol(string $rol): string
{
    return match ($rol) {
        'admin_total'    => 'Administrador',
        'admin_kyc'      => 'Administrador · Verificación',
        'admin_soporte'  => 'Administrador · Soporte',
        'admin_finanzas' => 'Administrador · Finanzas',
        'comercio'       => 'Comercio',
        'mayorista'      => 'Mayorista',
        'repartidor'     => 'Repartidor',
        default          => ucfirst(str_replace('_', ' ', $rol)),
    };
}

/** Tabla y columna donde vive el nombre visible del rol. */
function perfil_tabla_nombre(string $rol): ?array
{
    return match ($rol) {
        'comercio'  => ['tabla' => 'comercios_perfil', 'columna' => 'nombre_negocio'],
        'mayorista' => ['tabla' => 'mayoristas_perfil', 'columna' => 'nombre_comercial'],
        default     => null,
    };
}

function perfil_iniciales(string $nombre): string
{
    $nombre = trim($nombre);
    if ($nombre === '') {
        return '?';
    }

    $partes = preg_split('/\s+/u', $nombre) ?: [];
    $primera = mb_substr($partes[0] ?? '', 0, 1);

    if (count($partes) > 1) {
        return mb_strtoupper($primera . mb_substr($partes[1], 0, 1));
    }

    return mb_strtoupper($primera);
}

/** URL del avatar con versión para invalidar la caché. */
function perfil_avatar_url(int $uid): ?string
{
    $stmt = api_pdo()->prepare('SELECT avatar_ruta, avatar_actualizado_at FROM usuarios WHERE id = ? LIMIT 1');
    $stmt->execute([$uid]);
    $fila = $stmt->fetch();

    if (!is_array($fila) || empty($fila['avatar_ruta'])) {
        return null;
    }

    $version = empty($fila['avatar_actualizado_at']) ? 0 : (int) strtotime((string) $fila['avatar_actualizado_at']);

    return '/avatar/' . $uid . '?v=' . $version;
}

/** Preferencias del usuario con los valores por defecto del panel. */
function perfil_preferencias(int $uid): array
{
    $stmt = api_pdo()->prepare('SELECT notificaciones, sms, correo, ubicacion, tema FROM preferencias_usuario WHERE usuario_id = ? LIMIT 1');
    $stmt->execute([$uid]);
    $fila = $stmt->fetch();

    if (!is_array($fila)) {
        return ['notificaciones' => 1, 'sms' => 1, 'correo' => 1, 'ubicacion' => 1, 'tema' => 'claro'];
    }

    return [
        'notificaciones' => (int) $fila['notificaciones'],
        'sms'            => (int) $fila['sms'],
        'correo'         => (int) $fila['correo'],
        'ubicacion'      => (int) $fila['ubicacion'],
        'tema'           => ($fila['tema'] ?? '') === 'oscuro' ? 'oscuro' : 'claro',
    ];
}

/** Documentos requeridos por rol (capítulo 4 del documento). */
function perfil_kyc_requeridos(string $rol): array
{
    return match ($rol) {
        'mayorista'  => ['constancia_sat', 'identificacion', 'comprobante_domicilio'],
        'repartidor' => ['identificacion', 'licencia', 'tarjeta_circulacion', 'antecedentes', 'selfie'],
        default      => [],
    };
}

function perfil_kyc_tipos(): array
{
    return [
        'identificacion', 'licencia', 'tarjeta_circulacion', 'antecedentes',
        'selfie', 'constancia_sat', 'comprobante_domicilio', 'rfc_documento',
    ];
}

/** Estado de verificación del usuario, con faltantes y documentos. */
function perfil_kyc_estado(int $uid, string $rol): array
{
    $stmt = api_pdo()->prepare(
        'SELECT id, tipo, estado, motivo_rechazo, created_at, mime, tamano_bytes
           FROM kyc_documentos WHERE usuario_id = ? ORDER BY created_at DESC'
    );
    $stmt->execute([$uid]);
    $documentos = $stmt->fetchAll() ?: [];

    $requeridos = perfil_kyc_requeridos($rol);
    $porTipo = [];
    foreach ($documentos as $d) {
        $porTipo[(string) $d['tipo']] = $d;
    }

    $faltantes = [];
    foreach ($requeridos as $tipo) {
        if (!isset($porTipo[$tipo]) || $porTipo[$tipo]['estado'] !== 'aprobado') {
            $faltantes[] = $tipo;
        }
    }

    $enRevision = 0;
    $aprobados = 0;
    foreach ($documentos as $d) {
        if ($d['estado'] === 'pendiente') {
            $enRevision++;
        }
        if ($d['estado'] === 'aprobado') {
            $aprobados++;
        }
    }

    $completo = $requeridos !== [] && $faltantes === [];

    return [
        'documentos'  => array_map(static fn (array $d): array => [
            'id'             => (int) $d['id'],
            'tipo'           => (string) $d['tipo'],
            'estado'         => (string) $d['estado'],
            'motivo_rechazo' => (string) ($d['motivo_rechazo'] ?? ''),
            'created_at'     => api_fecha((string) $d['created_at']),
            'mime'           => (string) ($d['mime'] ?? ''),
            'tamano_bytes'   => (int) ($d['tamano_bytes'] ?? 0),
        ], $documentos),
        'requeridos'  => $requeridos,
        'faltantes'   => $faltantes,
        'completo'    => $completo,
        'en_revision' => $enRevision,
        'aprobados'   => $aprobados,
        'estado'      => $requeridos === [] ? 'no_requiere' : ($completo ? 'aprobado' : ($enRevision > 0 ? 'en_revision' : 'pendiente')),
    ];
}

function perfil_direcciones(int $uid): array
{
    $stmt = api_pdo()->prepare(
        'SELECT id, alias, calle, colonia, ciudad, estado_mx, cp, latitud, longitud, referencias, es_principal
           FROM direcciones WHERE usuario_id = ? AND deleted_at IS NULL
          ORDER BY es_principal DESC, id DESC'
    );
    $stmt->execute([$uid]);
    $filas = $stmt->fetchAll() ?: [];

    return array_map(static fn (array $d): array => [
        'id'           => (int) $d['id'],
        'alias'        => (string) ($d['alias'] ?? ''),
        'calle'        => (string) ($d['calle'] ?? ''),
        'colonia'      => (string) ($d['colonia'] ?? ''),
        'ciudad'       => (string) ($d['ciudad'] ?? ''),
        'estado_mx'    => (string) ($d['estado_mx'] ?? ''),
        'cp'           => (string) ($d['cp'] ?? ''),
        'latitud'      => (float) $d['latitud'],
        'longitud'     => (float) $d['longitud'],
        'referencias'  => (string) ($d['referencias'] ?? ''),
        'es_principal' => (int) $d['es_principal'],
    ], $filas);
}

function perfil_calificacion(int $uid): array
{
    $stmt = api_pdo()->prepare('SELECT AVG(puntaje) AS promedio, COUNT(*) AS total FROM calificaciones WHERE evaluado_id = ?');
    $stmt->execute([$uid]);
    $fila = $stmt->fetch() ?: [];
    $total = (int) ($fila['total'] ?? 0);

    return [
        'promedio' => $total > 0 ? round((float) $fila['promedio'], 1) : null,
        'total'    => $total,
    ];
}

/** Desglose por estrellas y últimos comentarios con nombre de autor. */
function perfil_desglose(int $uid): array
{
    $stmt = api_pdo()->prepare('SELECT puntaje, COUNT(*) AS total FROM calificaciones WHERE evaluado_id = ? GROUP BY puntaje');
    $stmt->execute([$uid]);
    $porEstrella = ['5' => 0, '4' => 0, '3' => 0, '2' => 0, '1' => 0];
    foreach ($stmt->fetchAll() as $fila) {
        $porEstrella[(string) (int) $fila['puntaje']] = (int) $fila['total'];
    }

    $stmt = api_pdo()->prepare(
        "SELECT c.puntaje, c.comentario, c.created_at,
                COALESCE(cp.nombre_negocio, mp.nombre_comercial, u.nombre, u.email) AS autor
           FROM calificaciones c
           JOIN usuarios u ON u.id = c.evaluador_id
           LEFT JOIN comercios_perfil cp ON cp.usuario_id = u.id
           LEFT JOIN mayoristas_perfil mp ON mp.usuario_id = u.id
          WHERE c.evaluado_id = ? AND c.comentario <> ''
          ORDER BY c.created_at DESC
          LIMIT 12"
    );
    $stmt->execute([$uid]);

    $comentarios = [];
    foreach ($stmt->fetchAll() ?: [] as $c) {
        $comentarios[] = [
            'puntaje'    => (int) $c['puntaje'],
            'comentario' => (string) $c['comentario'],
            'autor'      => (string) $c['autor'],
            'created_at' => api_fecha((string) $c['created_at']),
        ];
    }

    return ['por_estrella' => $porEstrella, 'comentarios' => $comentarios];
}

function perfil_roles(int $uid): array
{
    $stmt = api_pdo()->prepare(
        'SELECT r.nombre, ur.estado_verificacion FROM usuario_roles ur
           JOIN roles r ON r.id = ur.rol_id WHERE ur.usuario_id = ? ORDER BY r.id'
    );
    $stmt->execute([$uid]);

    return $stmt->fetchAll() ?: [];
}

function perfil_cuenta(int $uid): array
{
    $stmt = api_pdo()->prepare(
        'SELECT id, email, telefono, nombre, avatar_ruta, avatar_actualizado_at, password_hash,
                ultimo_login_at, created_at
           FROM usuarios WHERE id = ? AND deleted_at IS NULL LIMIT 1'
    );
    $stmt->execute([$uid]);
    $fila = $stmt->fetch();

    if (!is_array($fila)) {
        fallo('Tu cuenta ya no existe o fue eliminada.', 404, 'CUENTA_NO_ENCONTRADA');
    }

    return $fila;
}

/** Fila del perfil del rol con los datos de la cuenta (o [] si el rol no tiene). */
function perfil_fila(int $uid, string $rol): array
{
    $tabla = perfil_tabla_nombre($rol);
    if ($tabla === null) {
        return [];
    }

    $stmt = api_pdo()->prepare(
        "SELECT p.*, u.email, u.telefono, u.nombre FROM {$tabla['tabla']} p
           JOIN usuarios u ON u.id = p.usuario_id
          WHERE p.usuario_id = ? LIMIT 1"
    );
    $stmt->execute([$uid]);
    $fila = $stmt->fetch();

    return is_array($fila) ? $fila : [];
}

/** Nombre visible: el del negocio si existe, si no el de la cuenta. */
function perfil_nombre_visible(array $perfil, array $cuenta): string
{
    foreach (['nombre_negocio', 'nombre_comercial', 'nombre'] as $clave) {
        $valor = trim((string) ($perfil[$clave] ?? ''));
        if ($valor !== '') {
            return $valor;
        }
    }

    return (string) ($cuenta['nombre'] ?? 'Mi cuenta');
}

// ===========================================================================
// GET /perfil/detalle — todo lo que pinta «Mi perfil».
// ===========================================================================
if ($perfilRuta === '/perfil/detalle' && $perfilMetodo === 'GET') {
    perfil_exigir_cuenta();

    $uid = api_uid();
    $rol = api_rol();
    $cuenta = perfil_cuenta($uid);
    $perfil = perfil_fila($uid, $rol);
    $prefs = perfil_preferencias($uid);
    $kyc = perfil_kyc_estado($uid, $rol);

    responder([
        'ok' => true,
        'usuario' => [
            'id'       => $uid,
            'nombre'   => perfil_nombre_visible($perfil, $cuenta),
            'email'    => (string) $cuenta['email'],
            'telefono' => (string) ($cuenta['telefono'] ?? ''),
            'avatar'   => perfil_avatar_url($uid),
            'iniciales' => perfil_iniciales(perfil_nombre_visible($perfil, $cuenta)),
            'roles'    => array_values(array_map(static fn (array $r): string => (string) $r['nombre'], perfil_roles($uid))),
        ],
        'rol'          => $rol,
        'etiqueta_rol' => perfil_etiqueta_rol($rol),
        'perfil'       => [
            'nombre_negocio'   => (string) ($perfil['nombre_negocio'] ?? ''),
            'nombre_comercial' => (string) ($perfil['nombre_comercial'] ?? ''),
            'giro'             => (string) ($perfil['giro'] ?? ''),
            'razon_social'     => (string) ($perfil['razon_social'] ?? ''),
            'activo'           => isset($perfil['activo']) ? (int) $perfil['activo'] : null,
        ],
        'direcciones'  => perfil_direcciones($uid),
        'miembro'      => api_fecha((string) $cuenta['created_at']),
        'calificacion' => perfil_calificacion($uid),
        'desglose'     => perfil_desglose($uid),
        'kyc'          => $kyc,
        'verificado'   => (bool) $kyc['completo'],
        'tema'         => $prefs['tema'],
        'ultimo_login' => api_fecha((string) ($cuenta['ultimo_login_at'] ?? '')),
    ]);
}

// ===========================================================================
// PATCH /perfil — nombre, correo, teléfono y nombre del negocio del rol.
// ===========================================================================
if ($perfilRuta === '/perfil' && $perfilMetodo === 'PATCH') {
    perfil_exigir_cuenta();

    $uid = api_uid();
    $rol = api_rol();
    $cuerpo = api_cuerpo();
    $cuenta = perfil_cuenta($uid);

    $nombre = trim((string) ($cuerpo['nombre'] ?? ''));
    $email = mb_strtolower(trim((string) ($cuerpo['email'] ?? (string) $cuenta['email'])));
    $telefono = trim((string) ($cuerpo['telefono'] ?? (string) ($cuenta['telefono'] ?? '')));

    if (mb_strlen($nombre) < 3) {
        fallo('Escribe el nombre con el que quieres aparecer (mínimo 3 letras).', 422, 'NOMBRE');
    }

    if ($nombre === '') {
        fallo('El nombre no puede quedar vacío.', 422, 'NOMBRE');
    }

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        fallo('Ese correo no parece válido.', 422, 'EMAIL');
    }

    $stmt = api_pdo()->prepare('SELECT 1 FROM usuarios WHERE email = ? AND id <> ? AND deleted_at IS NULL LIMIT 1');
    $stmt->execute([$email, $uid]);
    if ($stmt->fetchColumn()) {
        fallo('Ya hay otra cuenta con ese correo.', 422, 'EMAIL_EN_USO');
    }

    if ($telefono !== '' && !preg_match('/^[0-9+()\s-]{7,20}$/', $telefono)) {
        fallo('Escribe un teléfono válido (solo números, espacios, + y guiones).', 422, 'TELEFONO');
    }

    $pdo = api_pdo();
    $pdo->beginTransaction();

    try {
        $pdo->prepare('UPDATE usuarios SET nombre = ?, email = ?, telefono = ? WHERE id = ?')
            ->execute([$nombre, $email, $telefono !== '' ? $telefono : null, $uid]);

        $destino = perfil_tabla_nombre($rol);
        $nombreNegocio = trim((string) ($cuerpo['nombre_negocio'] ?? ''));

        if ($destino !== null) {
            if ($nombreNegocio === '') {
                $nombreNegocio = $nombre;
            }

            $stmt = $pdo->prepare("SELECT 1 FROM {$destino['tabla']} WHERE usuario_id = ? LIMIT 1");
            $stmt->execute([$uid]);

            if ($stmt->fetchColumn()) {
                $pdo->prepare("UPDATE {$destino['tabla']} SET {$destino['columna']} = ? WHERE usuario_id = ?")
                    ->execute([$nombreNegocio, $uid]);
            } elseif ($destino['tabla'] === 'mayoristas_perfil') {
                $pdo->prepare("INSERT INTO mayoristas_perfil (uuid, usuario_id, nombre_comercial) VALUES (UUID(), ?, ?)")
                    ->execute([$uid, $nombreNegocio]);
            } else {
                $pdo->prepare("INSERT INTO comercios_perfil (usuario_id, nombre_negocio) VALUES (?, ?)")
                    ->execute([$uid, $nombreNegocio]);
            }
        }

        $pdo->commit();
    } catch (\Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

    responder([
        'ok'      => true,
        'mensaje' => 'Tus datos se guardaron.',
        'usuario' => [
            'id'       => $uid,
            'nombre'   => $nombreNegocio !== '' && $destino !== null ? $nombreNegocio : $nombre,
            'email'    => $email,
            'telefono' => $telefono,
            'avatar'   => perfil_avatar_url($uid),
        ],
    ]);
}

// ===========================================================================
// POST /perfil/avatar — imagen en data URL, recortada a 256 px y en WebP.
// ===========================================================================
if ($perfilRuta === '/perfil/avatar' && $perfilMetodo === 'POST') {
    perfil_exigir_cuenta();

    $uid = api_uid();
    $dataUrl = (string) (api_cuerpo()['data_url'] ?? '');

    if (!preg_match('#^data:(image/(?:png|jpeg|webp));base64,(.+)$#s', $dataUrl, $m)) {
        fallo('Envía la imagen como data URL PNG, JPG o WebP.', 422, 'IMAGEN');
    }

    $bin = base64_decode(preg_replace('/\s+/', '', $m[2]) ?? '', true);
    if ($bin === false || $bin === '') {
        fallo('La imagen llegó dañada. Vuelve a intentarlo.', 422, 'IMAGEN');
    }

    if (strlen($bin) > 2 * 1024 * 1024) {
        fallo('La imagen no puede pesar más de 2 MB.', 422, 'IMAGEN_GRANDE');
    }

    $info = @getimagesizefromstring($bin);
    if ($info === false || !in_array($info['mime'] ?? '', ['image/png', 'image/jpeg', 'image/webp'], true)) {
        fallo('Formato no admitido. Usa JPG, PNG o WebP.', 422, 'IMAGEN_FORMATO');
    }

    $origen = @imagecreatefromstring($bin);
    if (!$origen instanceof \GdImage) {
        fallo('No se pudo leer la imagen.', 422, 'IMAGEN');
    }

    $lado = 256;
    $ancho = (int) $info[0];
    $alto = (int) $info[1];
    $recorte = min($ancho, $alto);
    $x = (int) (($ancho - $recorte) / 2);
    $y = (int) (($alto - $recorte) / 2);

    $destino = imagecreatetruecolor($lado, $lado);
    $blanco = imagecolorallocate($destino, 255, 255, 255);
    imagefilledrectangle($destino, 0, 0, $lado, $lado, $blanco);
    imagecopyresampled($destino, $origen, 0, 0, $x, $y, $lado, $lado, $recorte, $recorte);

    $dir = __DIR__ . '/../../storage/avatars';
    if (!is_dir($dir) && !mkdir($dir, 0o750, true) && !is_dir($dir)) {
        fallo('No se pudo preparar el almacén de imágenes.', 500, 'ALMACEN');
    }

    // Un solo archivo por usuario: se limpian los formatos anteriores.
    foreach (glob($dir . '/' . $uid . '.*') ?: [] as $viejo) {
        if (is_file($viejo)) {
            @unlink($viejo);
        }
    }

    $ruta = $dir . '/' . $uid . '.webp';
    $ok = imagewebp($destino, $ruta, 88);

    if (!$ok) {
        $ruta = $dir . '/' . $uid . '.jpg';
        $ok = imagejpeg($destino, $ruta, 88);
    }

    if (!$ok) {
        fallo('No se pudo guardar la imagen.', 500, 'GUARDAR');
    }

    @chmod($ruta, 0o640);

    $version = time();
    api_pdo()->prepare('UPDATE usuarios SET avatar_ruta = ?, avatar_actualizado_at = FROM_UNIXTIME(?) WHERE id = ?')
        ->execute([basename($ruta), $version, $uid]);

    responder(['ok' => true, 'mensaje' => 'Foto actualizada.', 'avatar' => '/avatar/' . $uid . '?v=' . $version]);
}

// ===========================================================================
// DELETE /perfil/avatar
// ===========================================================================
if ($perfilRuta === '/perfil/avatar' && $perfilMetodo === 'DELETE') {
    perfil_exigir_cuenta();

    $uid = api_uid();
    $dir = __DIR__ . '/../../storage/avatars';

    foreach (glob($dir . '/' . $uid . '.*') ?: [] as $viejo) {
        if (is_file($viejo)) {
            @unlink($viejo);
        }
    }

    api_pdo()->prepare('UPDATE usuarios SET avatar_ruta = NULL, avatar_actualizado_at = NULL WHERE id = ?')
        ->execute([$uid]);

    responder(['ok' => true, 'mensaje' => 'Foto eliminada.', 'avatar' => null]);
}

// ===========================================================================
// Direcciones: alta, edición y baja.
// ===========================================================================
if ($perfilRuta === '/perfil/direccion' && $perfilMetodo === 'POST') {
    perfil_exigir_cuenta();

    $uid = api_uid();
    $cuerpo = api_cuerpo();

    $calle = trim((string) ($cuerpo['calle'] ?? ''));
    $ciudad = trim((string) ($cuerpo['ciudad'] ?? ''));

    if ($calle === '' || $ciudad === '') {
        fallo('Completa la calle y la ciudad de la dirección.', 422, 'DIRECCION');
    }

    if (mb_strlen($calle) > 190 || mb_strlen($ciudad) > 100) {
        fallo('La calle o la ciudad son demasiado largas.', 422, 'DIRECCION');
    }

    $cp = trim((string) ($cuerpo['cp'] ?? ''));
    if ($cp !== '' && !preg_match('/^\d{5}$/', $cp)) {
        fallo('El código postal debe tener 5 dígitos.', 422, 'CP');
    }

    $lat = (float) ($cuerpo['latitud'] ?? 19.4326);
    $lng = (float) ($cuerpo['longitud'] ?? -99.1332);

    if ($lat < -90 || $lat > 90 || $lng < -180 || $lng > 180) {
        fallo('Las coordenadas están fuera de rango.', 422, 'COORDENADAS');
    }

    $principal = (bool) ($cuerpo['es_principal'] ?? true);
    $pdo = api_pdo();

    $pdo->beginTransaction();

    try {
        if ($principal) {
            $pdo->prepare('UPDATE direcciones SET es_principal = 0 WHERE usuario_id = ?')->execute([$uid]);
        }

        $pdo->prepare(
            'INSERT INTO direcciones
             (usuario_id, alias, calle, colonia, ciudad, estado_mx, cp, latitud, longitud, referencias, es_principal)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            $uid,
            trim((string) ($cuerpo['alias'] ?? '')) ?: ($principal ? 'Principal' : 'Dirección'),
            $calle,
            trim((string) ($cuerpo['colonia'] ?? '')),
            $ciudad,
            trim((string) ($cuerpo['estado_mx'] ?? '')),
            $cp !== '' ? $cp : null,
            $lat,
            $lng,
            trim((string) ($cuerpo['referencias'] ?? '')),
            $principal ? 1 : 0,
        ]);

        $id = (int) $pdo->lastInsertId();
        $pdo->commit();
    } catch (\Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

    responder([
        'ok'         => true,
        'mensaje'    => 'Dirección guardada.',
        'direccion'  => ['id' => $id],
        'direcciones' => perfil_direcciones($uid),
    ]);
}

if (preg_match('#^/perfil/direccion/(\d+)$#', $perfilRuta, $mm) === 1 && in_array($perfilMetodo, ['PATCH', 'DELETE'], true)) {
    perfil_exigir_cuenta();

    $uid = api_uid();
    $id = (int) $mm[1];
    $pdo = api_pdo();

    $stmt = $pdo->prepare('SELECT id FROM direcciones WHERE id = ? AND usuario_id = ? AND deleted_at IS NULL LIMIT 1');
    $stmt->execute([$id, $uid]);

    if (!$stmt->fetchColumn()) {
        fallo('Esa dirección no existe o no es tuya.', 404, 'DIRECCION_NO_ENCONTRADA');
    }

    if ($perfilMetodo === 'DELETE') {
        $pdo->prepare('UPDATE direcciones SET deleted_at = NOW(), es_principal = 0 WHERE id = ? AND usuario_id = ?')
            ->execute([$id, $uid]);

        responder(['ok' => true, 'mensaje' => 'Dirección eliminada.', 'direcciones' => perfil_direcciones($uid)]);
    }

    $cuerpo = api_cuerpo();

    $calle = trim((string) ($cuerpo['calle'] ?? ''));
    $ciudad = trim((string) ($cuerpo['ciudad'] ?? ''));

    if ($calle === '' || $ciudad === '') {
        fallo('Completa la calle y la ciudad de la dirección.', 422, 'DIRECCION');
    }

    $cp = trim((string) ($cuerpo['cp'] ?? ''));
    if ($cp !== '' && !preg_match('/^\d{5}$/', $cp)) {
        fallo('El código postal debe tener 5 dígitos.', 422, 'CP');
    }

    $lat = (float) ($cuerpo['latitud'] ?? 19.4326);
    $lng = (float) ($cuerpo['longitud'] ?? -99.1332);

    if ($lat < -90 || $lat > 90 || $lng < -180 || $lng > 180) {
        fallo('Las coordenadas están fuera de rango.', 422, 'COORDENADAS');
    }

    $principal = (bool) ($cuerpo['es_principal'] ?? false);

    $stmtAlias = $pdo->prepare('SELECT alias FROM direcciones WHERE id = ? AND usuario_id = ? LIMIT 1');
    $stmtAlias->execute([$id, $uid]);
    $aliasActual = (string) ($stmtAlias->fetchColumn() ?: 'Dirección');

    $pdo->beginTransaction();

    try {
        if ($principal) {
            $pdo->prepare('UPDATE direcciones SET es_principal = 0 WHERE usuario_id = ?')->execute([$uid]);
        }

        $pdo->prepare(
            'UPDATE direcciones
                SET alias = ?, calle = ?, colonia = ?, ciudad = ?, estado_mx = ?, cp = ?,
                    latitud = ?, longitud = ?, referencias = ?, es_principal = ?
              WHERE id = ? AND usuario_id = ?'
        )->execute([
            trim((string) ($cuerpo['alias'] ?? '')) ?: $aliasActual,
            $calle,
            trim((string) ($cuerpo['colonia'] ?? '')),
            $ciudad,
            trim((string) ($cuerpo['estado_mx'] ?? '')),
            $cp !== '' ? $cp : null,
            $lat,
            $lng,
            trim((string) ($cuerpo['referencias'] ?? '')),
            $principal ? 1 : 0,
            $id,
            $uid,
        ]);

        $pdo->commit();
    } catch (\Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

    responder(['ok' => true, 'mensaje' => 'Dirección actualizada.', 'direcciones' => perfil_direcciones($uid)]);
}

// ===========================================================================
// GET|POST /perfil/privacidad
// ===========================================================================
if ($perfilRuta === '/perfil/privacidad' && $perfilMetodo === 'GET') {
    perfil_exigir_cuenta();

    $prefs = perfil_preferencias(api_uid());

    responder([
        'ok' => true,
        'preferencias' => [
            'notificaciones' => (bool) $prefs['notificaciones'],
            'sms'            => (bool) $prefs['sms'],
            'correo'         => (bool) $prefs['correo'],
            'ubicacion'      => (bool) $prefs['ubicacion'],
        ],
    ]);
}

if ($perfilRuta === '/perfil/privacidad' && $perfilMetodo === 'POST') {
    perfil_exigir_cuenta();

    $uid = api_uid();
    $c = api_cuerpo();

    api_pdo()->prepare(
        'INSERT INTO preferencias_usuario (usuario_id, notificaciones, sms, correo, ubicacion) VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE notificaciones = VALUES(notificaciones), sms = VALUES(sms),
                                 correo = VALUES(correo), ubicacion = VALUES(ubicacion)'
    )->execute([
        $uid,
        !empty($c['notificaciones']) ? 1 : 0,
        !empty($c['sms']) ? 1 : 0,
        !empty($c['correo']) ? 1 : 0,
        !empty($c['ubicacion']) ? 1 : 0,
    ]);

    $prefs = perfil_preferencias($uid);

    responder([
        'ok'      => true,
        'mensaje' => 'Tus preferencias se guardaron.',
        'preferencias' => [
            'notificaciones' => (bool) $prefs['notificaciones'],
            'sms'            => (bool) $prefs['sms'],
            'correo'         => (bool) $prefs['correo'],
            'ubicacion'      => (bool) $prefs['ubicacion'],
        ],
    ]);
}

// ===========================================================================
// POST /perfil/password — mínimo 12, mayúscula, número y símbolo.
// ===========================================================================
if ($perfilRuta === '/perfil/password' && $perfilMetodo === 'POST') {
    perfil_exigir_cuenta();

    $uid = api_uid();
    $c = api_cuerpo();
    $cuenta = perfil_cuenta($uid);

    $actual = (string) ($c['actual'] ?? '');
    $nueva = (string) ($c['nueva'] ?? '');

    if ($actual === '' || $nueva === '') {
        fallo('Escribe tu contraseña actual y la nueva.', 422, 'PASSWORD_FALTANTE');
    }

    if (!\App\Core\Password::verificar($actual, (string) ($cuenta['password_hash'] ?? ''))) {
        fallo('La contraseña actual no coincide.', 422, 'PASSWORD_ACTUAL');
    }

    if (mb_strlen($nueva) < 12) {
        fallo('La contraseña nueva necesita al menos 12 caracteres.', 422, 'PASSWORD_LONGITUD');
    }

    if (!preg_match('/\p{Lu}/u', $nueva)) {
        fallo('Agrega al menos una mayúscula a la contraseña nueva.', 422, 'PASSWORD_MAYUSCULA');
    }

    if (!preg_match('/\d/', $nueva)) {
        fallo('Agrega al menos un número a la contraseña nueva.', 422, 'PASSWORD_NUMERO');
    }

    if (!preg_match('/[^\p{L}\p{N}\s]/u', $nueva)) {
        fallo('Agrega al menos un símbolo (por ejemplo ! ? # $) a la contraseña nueva.', 422, 'PASSWORD_SIMBOLO');
    }

    if ($nueva === $actual) {
        fallo('La contraseña nueva debe ser distinta de la actual.', 422, 'PASSWORD_IGUAL');
    }

    api_pdo()->prepare('UPDATE usuarios SET password_hash = ? WHERE id = ?')
        ->execute([\App\Core\Password::hash($nueva), $uid]);

    responder(['ok' => true, 'mensaje' => 'Tu contraseña quedó actualizada.']);
}

// ===========================================================================
// POST /perfil/tema
// ===========================================================================
if ($perfilRuta === '/perfil/tema' && $perfilMetodo === 'POST') {
    perfil_exigir_cuenta();

    $uid = api_uid();
    $tema = (string) (api_cuerpo()['tema'] ?? 'claro');

    if (!in_array($tema, ['claro', 'oscuro'], true)) {
        fallo('Elige el tema claro u oscuro.', 422, 'TEMA');
    }

    api_pdo()->prepare(
        'INSERT INTO preferencias_usuario (usuario_id, tema) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE tema = VALUES(tema)'
    )->execute([$uid, $tema]);

    responder(['ok' => true, 'tema' => $tema, 'mensaje' => 'Preferencias guardadas.']);
}

// ===========================================================================
// GET /perfil/seguridad — últimos accesos, roles y estado de la cuenta.
// ===========================================================================
if ($perfilRuta === '/perfil/seguridad' && $perfilMetodo === 'GET') {
    perfil_exigir_cuenta();

    $uid = api_uid();
    $cuenta = perfil_cuenta($uid);

    $stmt = api_pdo()->prepare(
        'SELECT accion, entidad, descripcion, ip, user_agent, created_at
           FROM audit_log WHERE usuario_id = ? ORDER BY id DESC LIMIT 15'
    );
    $stmt->execute([$uid]);

    $accesos = [];
    foreach ($stmt->fetchAll() ?: [] as $a) {
        $ip = $a['ip'];
        $ipTexto = is_string($ip) && $ip !== '' ? (@inet_ntop($ip) ?: $ip) : '';

        $accesos[] = [
            'accion'      => (string) $a['accion'],
            'entidad'     => (string) ($a['entidad'] ?? ''),
            'descripcion' => (string) ($a['descripcion'] ?? ''),
            'ip'          => $ipTexto,
            'user_agent'  => (string) ($a['user_agent'] ?? ''),
            'created_at'  => api_fecha((string) $a['created_at']),
        ];
    }

    $roles = [];
    foreach (perfil_roles($uid) as $r) {
        $roles[] = [
            'nombre'              => (string) $r['nombre'],
            'etiqueta'            => perfil_etiqueta_rol((string) $r['nombre']),
            'estado_verificacion' => (string) ($r['estado_verificacion'] ?? 'sin_verificar'),
        ];
    }

    responder([
        'ok'            => true,
        'correo'        => (string) $cuenta['email'],
        'telefono'      => (string) ($cuenta['telefono'] ?? ''),
        'ultimo_login'  => api_fecha((string) ($cuenta['ultimo_login_at'] ?? '')),
        'miembro'       => api_fecha((string) $cuenta['created_at']),
        'roles'         => $roles,
        'accesos'       => $accesos,
        'reglas_password' => [
            'minimo'    => 12,
            'mayuscula' => true,
            'numero'    => true,
            'simbolo'   => true,
        ],
    ]);
}

// ===========================================================================
// GET /perfil/permisos — roles del usuario y qué permite cada uno.
// ===========================================================================
if ($perfilRuta === '/perfil/permisos' && $perfilMetodo === 'GET') {
    perfil_exigir_cuenta();

    $uid = api_uid();
    $capacidades = [
        'comercio'       => ['Comprar a mayoristas', 'Programar pedidos y favoritos', 'Punto de venta y clientes', 'Calificar a proveedores y repartidores'],
        'mayorista'      => ['Publicar catálogo y precios', 'Aceptar y surtir pedidos', 'Recibir pagos y facturar', 'Calificar a comercios'],
        'repartidor'     => ['Tomar envíos disponibles', 'Actualizar el estado de la entrega', 'Recibir pagos por viaje', 'Calificar a comercios'],
        'admin_total'    => ['Ver el panel completo', 'Gestionar usuarios', 'Revisar la cola de KYC', 'Ajustar parámetros y reclamos'],
        'admin_kyc'      => ['Revisar la cola de KYC', 'Aprobar o rechazar documentos', 'Consultar usuarios'],
        'admin_soporte'  => ['Atender reclamos', 'Ver conversaciones de soporte', 'Consultar pedidos'],
        'admin_finanzas' => ['Consultar finanzas', 'Revisar facturas', 'Ajustar parámetros de cobro'],
    ];

    $roles = [];
    foreach (perfil_roles($uid) as $r) {
        $nombre = (string) $r['nombre'];
        $requeridos = perfil_kyc_requeridos($nombre);
        $roles[] = [
            'nombre'     => $nombre,
            'etiqueta'   => perfil_etiqueta_rol($nombre),
            'permite'    => $capacidades[$nombre] ?? ['Acceso a su cuenta'],
            'kyc'        => $requeridos,
            'verificacion' => (string) ($r['estado_verificacion'] ?? 'sin_verificar'),
        ];
    }

    responder([
        'ok'    => true,
        'roles' => $roles,
        'dispositivo' => [
            ['clave' => 'camara', 'titulo' => 'Cámara', 'texto' => 'Escanear códigos de barras y tomar fotos de productos.'],
            ['clave' => 'ubicacion', 'titulo' => 'Ubicación', 'texto' => 'Dirección de entrega y seguimiento del repartidor.'],
            ['clave' => 'microfono', 'titulo' => 'Micrófono', 'texto' => 'Notas de voz en el chat y llamadas con el proveedor.'],
            ['clave' => 'notificaciones', 'titulo' => 'Notificaciones', 'texto' => 'Pedidos, mensajes y avisos de la cuenta.'],
            ['clave' => 'galeria', 'titulo' => 'Fotos y videos', 'texto' => 'Subir comprobantes, evidencias y fotos de perfil.'],
        ],
    ]);
}

// ===========================================================================
// GET|POST /kyc — verificación de identidad.
// ===========================================================================
if ($perfilRuta === '/kyc' && $perfilMetodo === 'GET') {
    perfil_exigir_cuenta();

    $uid = api_uid();
    $rol = api_rol();
    $estado = perfil_kyc_estado($uid, $rol);

    responder([
        'ok'    => true,
        'rol'   => $rol,
        'estado' => $estado,
        'tipos' => perfil_kyc_tipos(),
        'limites' => ['max_bytes' => 10 * 1024 * 1024, 'mimes' => ['image/jpeg', 'image/png', 'application/pdf']],
    ]);
}

if ($perfilRuta === '/kyc' && $perfilMetodo === 'POST') {
    perfil_exigir_cuenta();

    $uid = api_uid();
    $rol = api_rol();
    $c = api_cuerpo();
    $tipo = (string) ($c['tipo'] ?? '');
    $dataUrl = (string) ($c['data_url'] ?? '');

    if (!in_array($tipo, perfil_kyc_tipos(), true)) {
        fallo('Tipo de documento no válido.', 422, 'KYC_TIPO');
    }

    if (!preg_match('#^data:(image/(?:png|jpeg)|application/pdf);base64,(.+)$#s', $dataUrl, $m)) {
        fallo('El documento debe ser un JPG, PNG o PDF.', 422, 'KYC_FORMATO');
    }

    $bin = base64_decode(preg_replace('/\s+/', '', $m[2]) ?? '', true);
    if ($bin === false || $bin === '') {
        fallo('El archivo llegó dañado. Vuelve a intentarlo.', 422, 'KYC_ARCHIVO');
    }

    if (strlen($bin) > 10 * 1024 * 1024) {
        fallo('El archivo pasa de 10 MB.', 422, 'KYC_GRANDE');
    }

    // El tipo se decide por el contenido, nunca por la extensión.
    $finfo = new \finfo(FILEINFO_MIME_TYPE);
    $mime = (string) $finfo->buffer($bin);

    $permitidos = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'application/pdf' => 'pdf'];

    if (!isset($permitidos[$mime])) {
        fallo('Solo se aceptan JPG, PNG o PDF.', 422, 'KYC_FORMATO');
    }

    $dir = __DIR__ . '/../../storage/kyc';
    if (!is_dir($dir) && !mkdir($dir, 0o750, true) && !is_dir($dir)) {
        fallo('No se pudo preparar el almacén de documentos.', 500, 'KYC_ALMACEN');
    }

    $nombre = bin2hex(random_bytes(16)) . '.' . $permitidos[$mime];
    $ruta = $dir . '/' . $nombre;

    if (file_put_contents($ruta, $bin) === false) {
        fallo('No se pudo guardar el documento.', 500, 'KYC_GUARDAR');
    }

    @chmod($ruta, 0o640);

    api_pdo()->prepare(
        'INSERT INTO kyc_documentos (usuario_id, tipo, ruta_archivo, mime, tamano_bytes)
         VALUES (?, ?, ?, ?, ?)'
    )->execute([$uid, $tipo, $nombre, $mime, strlen($bin)]);

    responder([
        'ok'      => true,
        'mensaje' => 'Documento recibido. Queda en revisión.',
        'estado'  => perfil_kyc_estado($uid, $rol),
    ]);
}

// ===========================================================================
// GET /ayuda — preguntas frecuentes y acceso a soporte.
// ===========================================================================
if ($perfilRuta === '/ayuda' && $perfilMetodo === 'GET') {
    perfil_exigir_cuenta();

    responder([
        'ok' => true,
        'soporte' => [
            'href'  => '/mensajes?soporte=1',
            'texto' => 'Escríbenos desde tu cuenta: el mensaje llega con tu nombre, tu rol y el pedido que estabas viendo.',
            'horario' => 'La mayoría de los casos se contestan en menos de una hora en horario laboral.',
        ],
        'faqs' => [
            [
                'pregunta'  => 'Mi pedido no avanza de estado',
                'respuesta' => 'Si sigue en «por aceptar», el mayorista todavía no lo ha tomado. Si está en «buscando repartidor», ya fue aceptado y falta asignar quién lo lleva. Puedes cancelar sin costo mientras no haya sido aceptado.',
                'enlace'    => ['texto' => 'Ver mis pedidos', 'href' => '/pedidos'],
            ],
            [
                'pregunta'  => 'No me llega el código por SMS',
                'respuesta' => 'Revisa que tu teléfono esté en tus datos y que los mensajes de texto estén activos en Privacidad. Si sigue sin llegar, pide el enlace por correo desde la pantalla de recuperación.',
                'enlace'    => ['texto' => 'Editar mis datos', 'href' => '/perfil/editar'],
            ],
            [
                'pregunta'  => 'El repartidor no encuentra mi dirección',
                'respuesta' => 'Agrega una referencia en Editar cuenta: color del portón, entre qué calles está o el nombre del negocio en la fachada. Con eso basta casi siempre.',
                'enlace'    => ['texto' => 'Editar dirección', 'href' => '/perfil/editar'],
            ],
            [
                'pregunta'  => 'Quiero cambiar mi contraseña',
                'respuesta' => 'Se hace desde Ajustes › Seguridad. Al guardarla se cierran las demás sesiones abiertas.',
                'enlace'    => ['texto' => 'Ir a Seguridad', 'href' => '/perfil/seguridad'],
            ],
            [
                'pregunta'  => '¿Cómo funciona la calificación?',
                'respuesta' => 'Comercios, mayoristas y repartidores se puntúan entre sí de 1 a 5 estrellas después de una entrega. Solo tú ves tu promedio, y se actualiza cuando alguien vuelve a puntuarte.',
                'enlace'    => ['texto' => 'Ver mi perfil', 'href' => '/perfil'],
            ],
        ],
        'legal' => [
            ['texto' => 'Términos y condiciones', 'href' => '/terminos'],
            ['texto' => 'Aviso de privacidad', 'href' => '/aviso-privacidad'],
        ],
    ]);
}

// ===========================================================================
// POST /perfil/eliminar — baja lógica con confirmación explícita.
// ===========================================================================
if ($perfilRuta === '/perfil/eliminar' && $perfilMetodo === 'POST') {
    perfil_exigir_cuenta();

    $uid = api_uid();
    $c = api_cuerpo();
    $confirmacion = trim((string) ($c['confirmacion'] ?? ''));

    if (mb_strtoupper($confirmacion) !== 'ELIMINAR') {
        fallo('Escribe ELIMINAR para confirmar la baja de tu cuenta.', 422, 'CONFIRMACION');
    }

    $motivo = mb_substr(trim((string) ($c['motivo'] ?? '')), 0, 120);
    perfil_cuenta($uid);

    $pdo = api_pdo();
    $pdo->beginTransaction();

    try {
        $pdo->prepare('UPDATE usuarios SET deleted_at = NOW(), eliminado_motivo = ? WHERE id = ?')
            ->execute([$motivo !== '' ? $motivo : null, $uid]);

        // El enum de esta copia no incluye 'eliminado': si no cabe, la baja
        // lógica sigue siendo deleted_at, que es lo que filtra todo el sistema.
        try {
            $pdo->prepare("UPDATE usuarios SET estado = 'eliminado' WHERE id = ?")->execute([$uid]);
        } catch (\Throwable) {
            // Sin cambios: deleted_at ya marca la baja.
        }

        $pdo->prepare('UPDATE direcciones SET deleted_at = NOW() WHERE usuario_id = ? AND deleted_at IS NULL')
            ->execute([$uid]);

        $pdo->commit();
    } catch (\Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

    \App\Core\Session::destruir();

    responder(['ok' => true, 'mensaje' => 'Tu cuenta quedó eliminada. Cerramos tu sesión.']);
}

// ===========================================================================
// POST /perfil/calificar — puntaje 1..5 sobre un pedido recibido.
// ===========================================================================
if ($perfilRuta === '/perfil/calificar' && $perfilMetodo === 'POST') {
    perfil_exigir_cuenta();

    $uid = api_uid();
    $c = api_cuerpo();

    $evaluado = (int) ($c['evaluado_id'] ?? 0);
    $puntaje = (int) ($c['puntaje'] ?? 0);
    $pedidoId = (int) ($c['pedido_id'] ?? 0);
    $comentario = mb_substr(trim((string) ($c['comentario'] ?? '')), 0, 280);

    if ($evaluado <= 0 || $evaluado === $uid) {
        fallo('Elige a quién quieres calificar.', 422, 'CALIFICACION');
    }

    if ($puntaje < 1 || $puntaje > 5) {
        fallo('El puntaje va de 1 a 5 estrellas.', 422, 'PUNTAJE');
    }

    $permitidos = ['comercio', 'mayorista', 'repartidor'];
    $rolDe = static function (int $id) use ($permitidos): ?string {
        $stmt = api_pdo()->prepare(
            'SELECT r.nombre FROM usuario_roles ur JOIN roles r ON r.id = ur.rol_id
              WHERE ur.usuario_id = ? ORDER BY r.id LIMIT 1'
        );
        $stmt->execute([$id]);
        $rol = $stmt->fetchColumn();

        return $rol === false || !in_array((string) $rol, $permitidos, true) ? null : (string) $rol;
    };

    if ($rolDe($uid) === null || $rolDe($evaluado) === null) {
        fallo('Solo comercios, mayoristas y repartidores pueden calificarse.', 403, 'SIN_PERMISO');
    }

    if ($pedidoId > 0) {
        $stmt = api_pdo()->prepare('SELECT id, comercio_id, mayorista_id, estado FROM pedidos WHERE id = ? LIMIT 1');
        $stmt->execute([$pedidoId]);
        $pedido = $stmt->fetch();

        if (!is_array($pedido)) {
            fallo('Ese pedido no existe.', 404, 'NO_ENCONTRADO');
        }

        $rolEvaluado = $rolDe($evaluado);

        $perfilDe = static function (string $tabla, int $usuarioId): int {
            $stmt = api_pdo()->prepare("SELECT id FROM {$tabla} WHERE usuario_id = ? LIMIT 1");
            $stmt->execute([$usuarioId]);

            return (int) ($stmt->fetchColumn() ?: 0);
        };

        $esContraparte = match ($rolEvaluado) {
            'comercio'   => (int) $pedido['comercio_id'] === $perfilDe('comercios_perfil', $evaluado),
            'mayorista'  => (int) $pedido['mayorista_id'] === $perfilDe('mayoristas_perfil', $evaluado),
            'repartidor' => (static function () use ($pedido, $evaluado): bool {
                $stmtPerfil = api_pdo()->prepare('SELECT id FROM repartidores_perfil WHERE usuario_id = ? LIMIT 1');
                $stmtPerfil->execute([$evaluado]);
                $perfilRepartidor = (int) ($stmtPerfil->fetchColumn() ?: 0);

                $stmt = api_pdo()->prepare('SELECT 1 FROM envios WHERE pedido_id = ? AND repartidor_id IN (?, ?) LIMIT 1');
                $stmt->execute([(int) $pedido['id'], $evaluado, $perfilRepartidor]);

                return (bool) $stmt->fetchColumn();
            })(),
            default      => false,
        };

        $mio = (int) $pedido['comercio_id'] === api_comercio_id() || (int) $pedido['mayorista_id'] === api_mayorista_id();
        if (!$mio) {
            fallo('Solo puedes calificar pedidos que hayas recibido.', 403, 'SIN_PERMISO');
        }

        if (!$esContraparte) {
            fallo('Ese pedido no relaciona a las dos partes: elige el pedido que compartieron.', 422, 'PEDIDO_TERCERO');
        }

        if (!in_array((string) $pedido['estado'], ['entregado', 'recibido', 'pagado'], true)) {
            fallo('Podrás calificar cuando el pedido se haya entregado.', 422, 'PEDIDO_ABIERTO');
        }
    }

    api_pdo()->prepare(
        'INSERT INTO calificaciones (evaluador_id, evaluado_id, pedido_id, puntaje, comentario)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE puntaje = VALUES(puntaje), comentario = VALUES(comentario), pedido_id = VALUES(pedido_id)'
    )->execute([$uid, $evaluado, $pedidoId > 0 ? $pedidoId : null, $puntaje, $comentario]);

    responder([
        'ok'      => true,
        'mensaje' => 'Gracias, tu calificación quedó registrada.',
        'calificacion' => perfil_calificacion($evaluado),
    ]);
}

// Ninguna ruta del módulo coincidió: el siguiente módulo recibe el control.
