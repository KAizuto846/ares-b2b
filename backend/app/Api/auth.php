<?php

declare(strict_types=1);

// Como el resto de los módulos, cada archivo se trae las ayudas compartidas.
require_once __DIR__ . '/_comun.php';

/**
 * Módulo Auth público de la SPA (alta de cuenta, recuperación, verificación
 * de correo y textos legales).
 *
 * Ninguna de estas rutas exige sesión: son las que un visitante usa antes de
 * tener cuenta. public/api.php corta con 401 SIN_SESION todo lo que no sea
 * /session, /login o /logout, así que este archivo debe incluirse ANTES de ese
 * corte:
 *
 *     require_once __DIR__ . '/../app/Api/auth.php';   // justo antes del gate
 *
 * El archivo es idempotente a propósito: se puede incluir dos veces (arranque
 * temprano y bucle de módulos del final de api.php) sin redeclarar funciones
 * ni responder dos veces.
 *
 * Rutas (todas bajo /api):
 *   GET  /auth/roles                 catálogo de roles para el alta
 *   POST /auth/registro              crea cuenta + perfil del rol
 *   POST /auth/recuperar             manda enlace/código (respuesta neutra)
 *   POST /auth/restablecer           cambia la contraseña con token o código
 *   GET  /auth/verificar?token=      confirma el correo
 *   GET  /legales/terminos           términos y condiciones en bloques
 *   GET  /legales/privacidad         aviso de privacidad en bloques
 *
 * Contrato: {ok:true, ...} o {ok:false, error:{code, message}} con mensaje en
 * español y accionable (igual que el resto de la API).
 */

$authRuta = (string) (api_ctx()['ruta'] ?? '');
$authMetodo = (string) (api_ctx()['metodo'] ?? 'GET');

if (!function_exists('auth_rutas_publicas')) {
    /**
     * Rutas que atiende este módulo. Se declaran una sola vez porque el archivo
     * puede incluirse en dos puntos distintos de api.php.
     *
     * @return string[]
     */
    function auth_rutas_publicas(): array
    {
        return [
            '/auth/roles',
            '/auth/registro',
            '/auth/recuperar',
            '/auth/restablecer',
            '/auth/verificar',
            '/legales/terminos',
            '/legales/privacidad',
        ];
    }

    /** Fuera de producción se devuelven token y código para poder probar. */
    function auth_es_local(): bool
    {
        return strtolower((string) (getenv('APP_ENV') ?: 'production')) !== 'production';
    }

    function auth_ip(): string
    {
        return (string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
    }

    /** Texto recortado y acotado a la longitud de la columna. */
    function auth_texto(mixed $valor, int $max): string
    {
        $texto = is_scalar($valor) ? trim((string) $valor) : '';

        return mb_substr($texto, 0, $max);
    }

    /** Teléfono a 10 dígitos: «+52 55 1234 5678» y «5512345678» son el mismo. */
    function auth_telefono(string $telefono): string
    {
        $digitos = preg_replace('/\D+/', '', $telefono) ?? '';

        if (strlen($digitos) > 10) {
            $digitos = substr($digitos, -10);
        }

        return $digitos;
    }

    /**
     * Regla de contraseña del alta: 12 caracteres, una mayúscula, un número y
     * un símbolo. Devuelve la lista de lo que falta (vacía si cumple).
     *
     * @return string[]
     */
    function auth_faltas_password(string $password): array
    {
        $faltas = [];

        if (mb_strlen($password) < 12) {
            $faltas[] = 'al menos 12 caracteres';
        }
        if (!preg_match('/\p{Lu}/u', $password)) {
            $faltas[] = 'una mayúscula';
        }
        if (!preg_match('/\d/', $password)) {
            $faltas[] = 'un número';
        }
        if (!preg_match('/[^\p{L}\p{N}\s]/u', $password)) {
            $faltas[] = 'un símbolo';
        }

        return $faltas;
    }

    /** 422 con el detalle por campo, para pintar el error debajo del input. */
    function auth_fallo_campos(array $campos, string $mensaje = ''): void
    {
        $primero = $mensaje !== '' ? $mensaje : (string) (reset($campos) ?: 'Revisa los datos.');

        responder([
            'ok'     => false,
            'error'  => ['code' => 'DATOS', 'message' => $primero],
            'campos' => $campos,
        ], 422);
    }

    function auth_pdo(): PDO
    {
        return api_pdo();
    }

    function auth_repo(): \App\Modules\Auth\UsuarioRepository
    {
        static $repo = null;

        return $repo ??= new \App\Modules\Auth\UsuarioRepository(auth_pdo());
    }

    function auth_servicio(): \App\Modules\Auth\AuthService
    {
        static $servicio = null;

        if ($servicio === null) {
            $servicio = new \App\Modules\Auth\AuthService(
                auth_repo(),
                new \App\Core\AuditLogger(auth_pdo()),
                new \App\Modules\Notificaciones\NotificacionService(
                    auth_pdo(),
                    __DIR__ . '/../../storage/correos',
                ),
            );
        }

        return $servicio;
    }

    /** Fila pública de la cuenta (nunca password_hash). */
    function auth_usuario(int $id): array
    {
        $stmt = auth_pdo()->prepare(
            'SELECT id, uuid, nombre, email, telefono, estado, email_verificado_at, created_at
               FROM usuarios WHERE id = ? AND deleted_at IS NULL LIMIT 1'
        );
        $stmt->execute([$id]);
        $u = $stmt->fetch() ?: [];

        return [
            'id'                => (int) ($u['id'] ?? $id),
            'uuid'              => (string) ($u['uuid'] ?? ''),
            'nombre'            => (string) ($u['nombre'] ?? ''),
            'email'             => (string) ($u['email'] ?? ''),
            'telefono'          => (string) ($u['telefono'] ?? ''),
            'estado'            => (string) ($u['estado'] ?? 'pendiente'),
            'email_verificado'  => !empty($u['email_verificado_at']),
            'created_at'        => (string) ($u['created_at'] ?? ''),
        ];
    }

    /** Cuenta por correo o teléfono (mismo criterio que el login). */
    function auth_cuenta(string $identificador): ?array
    {
        $identificador = trim($identificador);

        if ($identificador === '') {
            return null;
        }

        return str_contains($identificador, '@')
            ? auth_repo()->buscarPorEmail($identificador)
            : auth_repo()->buscarPorTelefono($identificador);
    }

    /**
     * Código SMS de la última solicitud de recuperación. El servicio lo genera
     * al encolar la notificación; aquí solo se lee de la cola para poder
     * probar el flujo sin teléfono.
     */
    function auth_codigo_sms(int $usuarioId): string
    {
        $stmt = auth_pdo()->prepare(
            "SELECT cuerpo FROM notificaciones
              WHERE usuario_id = ? AND tipo = 'recuperacion' AND canal = 'sms'
              ORDER BY id DESC LIMIT 1"
        );
        $stmt->execute([$usuarioId]);
        $cuerpo = (string) ($stmt->fetchColumn() ?: '');

        return preg_match('/(\d{6})/', $cuerpo, $m) === 1 ? $m[1] : '';
    }

    /** Token de recuperación vigente de la cuenta (el más reciente). */
    function auth_token_vigente(int $usuarioId): ?array
    {
        $stmt = auth_pdo()->prepare(
            "SELECT id, token_hash, created_at FROM tokens_verificacion
              WHERE usuario_id = ? AND tipo = 'recuperacion_pass'
                AND usado_at IS NULL AND expira_en > NOW()
              ORDER BY id DESC LIMIT 1"
        );
        $stmt->execute([$usuarioId]);

        return $stmt->fetch() ?: null;
    }

    /** Estado del enlace de verificación para pintar ok / caducado / inválido. */
    function auth_estado_token(string $token): array
    {
        if ($token === '') {
            return ['estado' => 'invalido', 'mensaje' => 'Falta el token del enlace. Abre el correo otra vez.'];
        }

        if (auth_servicio()->verificarEmail($token)) {
            return ['estado' => 'ok', 'mensaje' => 'Tu correo quedó confirmado. Ya puedes iniciar sesión.'];
        }

        $stmt = auth_pdo()->prepare(
            "SELECT usado_at, expira_en FROM tokens_verificacion
              WHERE token_hash = ? AND tipo = 'email' LIMIT 1"
        );
        $stmt->execute([hash('sha256', $token)]);
        $fila = $stmt->fetch();

        if ($fila === false) {
            return ['estado' => 'invalido', 'mensaje' => 'Este enlace no es de Ares o ya se reemplazó. Pide uno nuevo.'];
        }

        if (!empty($fila['usado_at'])) {
            return ['estado' => 'caducado', 'mensaje' => 'Este enlace ya se usó. Si tu correo no quedó confirmado, pide otro.'];
        }

        return ['estado' => 'caducado', 'mensaje' => 'El enlace caducó. Los enlaces duran 24 horas.'];
    }

    /** Catálogo de roles que un visitante puede elegir al darse de alta. */
    function auth_catalogo_roles(): array
    {
        $stmt = auth_pdo()->query(
            "SELECT nombre FROM roles WHERE nombre IN ('comercio', 'mayorista', 'repartidor')"
        );
        $existentes = $stmt->fetchAll(PDO::FETCH_COLUMN) ?: [];

        $meta = [
            'comercio' => [
                'titulo'       => 'Comprar al mayoreo',
                'descripcion'  => 'Surtes tu negocio con varios proveedores en un solo pedido y sigues cada entrega.',
                'detalle'      => 'Necesitas el nombre de tu negocio y un teléfono de contacto.',
                'requiere_negocio' => false,
                'requiere_rfc' => false,
            ],
            'mayorista' => [
                'titulo'       => 'Vender al mayoreo',
                'descripcion'  => 'Publicas tu catálogo, recibes pedidos y surtes a comercios de tu zona.',
                'detalle'      => 'Necesitas el nombre comercial; el RFC se pide en la verificación (KYC).',
                'requiere_negocio' => true,
                'requiere_rfc' => false,
            ],
            'repartidor' => [
                'titulo'       => 'Repartir pedidos',
                'descripcion'  => 'Recoges en el mayorista y entregas en el comercio con el PIN del comprador.',
                'detalle'      => 'Solo tu cuenta: los documentos del vehículo se suben en KYC.',
                'requiere_negocio' => false,
                'requiere_rfc' => false,
            ],
        ];

        $roles = [];
        foreach ($meta as $clave => $datos) {
            if (!in_array($clave, $existentes, true)) {
                continue;
            }

            $roles[] = ['clave' => $clave] + $datos;
        }

        return $roles;
    }

    /** Textos legales en bloques, listos para pintar en React. */
    function auth_legales(string $documento): ?array
    {
        if ($documento === 'terminos') {
            return [
                'titulo'      => 'Términos y condiciones',
                'actualizado' => 'Última actualización: noviembre de 2026.',
                'intro'       => 'Estas son las reglas con las que Ares conecta comercios, mayoristas y repartidores.',
                'bloques'     => [
                    ['titulo' => '1. Qué es Ares', 'parrafos' => [
                        'Ares es una plataforma que conecta comercios con mayoristas y repartidores para comprar, vender y entregar materia prima e insumos. Ares no es dueña de los productos: facilita el encuentro, el pago y la logística.',
                    ]],
                    ['titulo' => '2. Tu cuenta', 'parrafos' => [
                        'Necesitas datos veraces y una cuenta activa para operar. Eres responsable de la actividad de tu cuenta y de mantener tu contraseña segura. Podemos suspender cuentas que incumplan estos términos o la ley.',
                    ]],
                    ['titulo' => '3. Pedidos y pagos', 'parrafos' => [
                        'El pedido se forma cuando lo envías al mayorista. El precio, el surtido y los tiempos se muestran antes de confirmar. Los pagos se procesan con los métodos habilitados; el comprobante y la factura quedan disponibles en tu cuenta.',
                    ]],
                    ['titulo' => '4. Entregas', 'parrafos' => [
                        'El mayorista prepara el pedido y Ares asigna un repartidor. La entrega se confirma con un PIN de cuatro dígitos que se muestra al comprador. Si el pedido llega incompleto o dañado, se reporta desde el detalle del pedido dentro de las 48 horas siguientes.',
                    ]],
                    ['titulo' => '5. Devoluciones y cancelaciones', 'parrafos' => [
                        'Puedes cancelar sin costo mientras el pedido no haya sido aceptado. Después de aceptado, la cancelación depende del mayorista. Los productos perecederos no se devuelven salvo error de surtido.',
                    ]],
                    ['titulo' => '6. Uso aceptable', 'parrafos' => [
                        'No se permite publicar productos falsos, manipular precios, suplantar identidades ni usar la plataforma para actividades ilícitas.',
                    ]],
                    ['titulo' => '7. Responsabilidad', 'parrafos' => [
                        'Ares responde por el funcionamiento de la plataforma, no por la calidad de los productos, que es responsabilidad del mayorista que los vende.',
                    ]],
                    ['titulo' => '8. Cambios', 'parrafos' => [
                        'Si modificamos estos términos te avisaremos en la aplicación con al menos 15 días de anticipación.',
                    ]],
                    ['titulo' => '9. Contacto', 'parrafos' => [
                        'Dudas o aclaraciones: soporte desde tu cuenta, en la sección de mensajes.',
                    ]],
                ],
            ];
        }

        if ($documento === 'privacidad') {
            return [
                'titulo'      => 'Aviso de privacidad',
                'actualizado' => 'Última actualización: ' . date('d/m/Y') . '.',
                'intro'       => 'Qué datos personales tratamos, para qué y cómo puedes ejercer tus derechos.',
                'bloques'     => [
                    ['titulo' => '1. Datos que recopilamos', 'parrafos' => [
                        'Cuando te registras en Didi2 B2B recopilamos tu correo electrónico, número de teléfono, nombre del negocio y datos fiscales (RFC, razón social, régimen fiscal) según tu rol como comercio o mayorista.',
                    ]],
                    ['titulo' => '2. Cómo usamos tus datos', 'parrafos' => [
                        'Tus datos se utilizan exclusivamente para:',
                    ], 'lista' => [
                        'Crear y gestionar tu cuenta en la plataforma',
                        'Procesar pedidos y facturas',
                        'Enviar notificaciones relacionadas con tus operaciones',
                        'Cumplir con obligaciones fiscales mexicanas',
                    ]],
                    ['titulo' => '3. Cookies', 'parrafos' => [
                        'Didi2 utiliza cookies esenciales para mantener tu sesión y recordar tu carrito de compras. No utilizamos cookies de terceros para publicidad.',
                    ]],
                    ['titulo' => '4. Tus derechos', 'parrafos' => [
                        'Puedes solicitar en cualquier momento el acceso, rectificación o eliminación de tus datos personales contactando a soporte@did2.mx.',
                    ]],
                    ['titulo' => '5. Seguridad', 'parrafos' => [
                        'Implementamos medidas técnicas y organizativas para proteger tus datos, incluyendo cifrado en tránsito (HTTPS) y en reposo, autenticación con contraseñas Argon2id, y auditoría de accesos.',
                    ]],
                    ['titulo' => '6. Contacto', 'parrafos' => [
                        'Si tienes preguntas sobre este aviso, escríbenos a soporte@did2.mx.',
                    ]],
                ],
            ];
        }

        return null;
    }

    /** Cuerpo JSON, tolerante a que api.php no lo haya parseado. */
    function auth_cuerpo(): array
    {
        $cuerpo = api_cuerpo();

        if ($cuerpo === []) {
            $crudo = file_get_contents('php://input') ?: '';
            $json = json_decode($crudo, true);
            $cuerpo = is_array($json) ? $json : $_POST;
        }

        return $cuerpo;
    }
}

if (!in_array($authRuta, auth_rutas_publicas(), true)) {
    return;
}

// AuthService consulta getenv('APP_ENV') y Dotenv::createImmutable() solo
// escribe $_ENV/$_SERVER: sin este puente el servicio creería que corre en
// producción y no devolvería el token de prueba fuera de producción.
if (getenv('APP_ENV') === false) {
    $authEntorno = (string) ($_ENV['APP_ENV'] ?? $_SERVER['APP_ENV'] ?? 'production');
    putenv('APP_ENV=' . $authEntorno);
    $_ENV['APP_ENV'] = $authEntorno;
}

// --------------------------------------------------------------- GET /auth/roles
if ($authRuta === '/auth/roles') {
    if ($authMetodo !== 'GET') {
        fallo('Método no permitido.', 405, 'METODO');
    }

    responder(['ok' => true, 'roles' => auth_catalogo_roles()]);
}

// ------------------------------------------------------------ POST /auth/registro
if ($authRuta === '/auth/registro') {
    if ($authMetodo !== 'POST') {
        fallo('Método no permitido.', 405, 'METODO');
    }

    $cuerpo = auth_cuerpo();
    $rol = strtolower(auth_texto($cuerpo['rol'] ?? '', 20));
    $nombre = auth_texto($cuerpo['nombre'] ?? '', 150);
    $negocio = auth_texto($cuerpo['negocio'] ?? '', 150);
    $email = mb_strtolower(auth_texto($cuerpo['email'] ?? '', 190));
    $telefono = auth_telefono(auth_texto($cuerpo['telefono'] ?? '', 20));
    $password = is_string($cuerpo['password'] ?? null) ? (string) $cuerpo['password'] : '';
    $rfc = strtoupper(auth_texto($cuerpo['rfc'] ?? '', 13));

    $campos = [];

    if (!in_array($rol, ['comercio', 'mayorista', 'repartidor'], true)) {
        $campos['rol'] = 'Elige si vienes a comprar, a vender o a repartir.';
    }
    if ($nombre === '') {
        $campos['nombre'] = 'Escribe tu nombre.';
    }
    if ($email === '') {
        $campos['email'] = 'Escribe tu correo.';
    } elseif (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $campos['email'] = 'El correo no tiene un formato válido.';
    }
    if ($telefono === '' || strlen($telefono) !== 10) {
        $campos['telefono'] = 'El teléfono debe tener 10 dígitos.';
    }
    if ($password === '') {
        $campos['password'] = 'Escribe una contraseña.';
    } else {
        $faltas = auth_faltas_password($password);
        if ($faltas !== []) {
            $campos['password'] = 'A la contraseña le falta ' . implode(', ', $faltas) . '.';
        }
    }
    if ($rol === 'mayorista' && $negocio === '') {
        $campos['negocio'] = 'El nombre comercial es obligatorio para vender.';
    }
    if ($rfc !== '' && preg_match('/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/', $rfc) !== 1) {
        $campos['rfc'] = 'El RFC no tiene un formato válido.';
    }

    if ($campos !== []) {
        auth_fallo_campos($campos);
    }

    $repo = auth_repo();

    if ($repo->buscarPorEmail($email) !== null) {
        responder([
            'ok'    => false,
            'error' => [
                'code'    => 'CORREO_REPETIDO',
                'message' => 'Ese correo ya tiene cuenta en Ares. Inicia sesión o recupera tu contraseña.',
            ],
            'campos' => ['email' => 'Este correo ya está registrado.'],
        ], 409);
    }

    $resultado = auth_servicio()->registrar([
        'nombre_negocio' => $negocio !== '' ? $negocio : $nombre,
        'email'          => $email,
        'telefono'       => $telefono,
        'password'       => $password,
        'rol'            => $rol,
    ], auth_ip());

    if (!$resultado['ok']) {
        /** @var array<string,string> $erroresServicio */
        $erroresServicio = (array) ($resultado['errores'] ?? []);
        if (isset($erroresServicio['nombre_negocio'])) {
            $erroresServicio['negocio'] = $erroresServicio['nombre_negocio'];
            unset($erroresServicio['nombre_negocio']);
        }

        auth_fallo_campos($erroresServicio, (string) ($resultado['mensaje'] ?? 'Revisa los datos.'));
    }

    $usuarioId = (int) ($resultado['usuario_id'] ?? 0);

    if ($usuarioId <= 0) {
        // El servicio devuelve ok sin id cuando el correo ya existía.
        responder([
            'ok'    => false,
            'error' => ['code' => 'CORREO_REPETIDO', 'message' => 'Ese correo ya tiene cuenta en Ares.'],
        ], 409);
    }

    $pdo = auth_pdo();

    // El alta del usuario ya se confirmó en su propia transacción (crear()).
    // El nombre visible y el perfil del rol se escriben juntos: si algo falla
    // se deshace y se borra la cuenta recién creada para no dejar huérfanos.
    try {
        $pdo->beginTransaction();
        $pdo->prepare('UPDATE usuarios SET nombre = ? WHERE id = ?')->execute([$nombre, $usuarioId]);
        (new \App\Modules\Perfil\PerfilRepository($pdo))->asegurarPerfil($usuarioId, $rol, $negocio !== '' ? $negocio : $nombre);
        $pdo->commit();
    } catch (\Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }

        $pdo->prepare('DELETE FROM usuarios WHERE id = ?')->execute([$usuarioId]);
        error_log('[ares-auth] perfil falló para el alta ' . $usuarioId . ': ' . $e->getMessage());

        fallo('No pudimos terminar tu alta. Inténtalo otra vez en un momento.', 500, 'PERFIL');
    }

    $respuesta = [
        'ok'      => true,
        'mensaje' => (string) ($resultado['mensaje'] ?? 'Revisa tu correo para confirmar la cuenta.'),
        'rol'     => $rol,
        'usuario' => auth_usuario($usuarioId),
        // rfc_cifrado no tiene helper de cifrado en esta copia (ext-sodium no
        // está disponible): el RFC se captura en KYC. Se devuelve tal cual
        // para que la pantalla pueda mostrarlo.
        'rfc'     => $rfc !== '' ? $rfc : null,
    ];

    if (auth_es_local() && !empty($resultado['token'])) {
        $respuesta['verificacion'] = [
            'token'  => (string) $resultado['token'],
            'enlace' => '/verificar?token=' . urlencode((string) $resultado['token']),
        ];
    }

    responder($respuesta);
}

// ----------------------------------------------------------- POST /auth/recuperar
if ($authRuta === '/auth/recuperar') {
    if ($authMetodo !== 'POST') {
        fallo('Método no permitido.', 405, 'METODO');
    }

    $cuerpo = auth_cuerpo();
    $identificador = auth_texto($cuerpo['identificador'] ?? ($cuerpo['email'] ?? ''), 190);

    if ($identificador === '') {
        auth_fallo_campos(['identificador' => 'Escribe tu correo o tu teléfono.']);
    }

    $resultado = auth_servicio()->solicitarRecuperacion($identificador, auth_ip());

    // Siempre la misma respuesta, exista o no la cuenta (anti-enumeración).
    $respuesta = [
        'ok'      => true,
        'mensaje' => (string) $resultado['mensaje'],
    ];

    if (auth_es_local() && !empty($resultado['token'])) {
        $cuenta = auth_cuenta($identificador);
        $respuesta['token'] = (string) $resultado['token'];
        $respuesta['codigo'] = $cuenta !== null ? auth_codigo_sms((int) $cuenta['id']) : '';
        $respuesta['enlace'] = '/restablecer?token=' . urlencode((string) $resultado['token']);
    }

    responder($respuesta);
}

// -------------------------------------------------------- POST /auth/restablecer
if ($authRuta === '/auth/restablecer') {
    if ($authMetodo !== 'POST') {
        fallo('Método no permitido.', 405, 'METODO');
    }

    $cuerpo = auth_cuerpo();
    $password = is_string($cuerpo['password'] ?? null) ? (string) $cuerpo['password'] : '';
    $token = auth_texto($cuerpo['token'] ?? '', 200);
    $identificador = auth_texto($cuerpo['identificador'] ?? '', 190);
    $codigo = preg_replace('/\D+/', '', (string) ($cuerpo['codigo'] ?? '')) ?? '';

    // Si pegaron el enlace completo, se extrae el token.
    if (str_contains($token, 'token=')) {
        $consulta = (string) parse_url($token, PHP_URL_QUERY);
        parse_str($consulta, $params);
        $token = (string) ($params['token'] ?? '');
    }

    if ($password === '') {
        auth_fallo_campos(['password' => 'Escribe tu contraseña nueva.']);
    }

    $faltas = auth_faltas_password($password);

    if ($faltas !== []) {
        auth_fallo_campos(['password' => 'A la contraseña le falta ' . implode(', ', $faltas) . '.']);
    }

    if ($token === '' && $codigo === '') {
        auth_fallo_campos(['clave' => 'Pega el enlace del correo o el código de 6 dígitos.']);
    }

    if ($token !== '') {
        if (!auth_servicio()->restablecer($token, $password)) {
            responder([
                'ok'    => false,
                'error' => [
                    'code'    => 'TOKEN_INVALIDO',
                    'message' => 'El enlace ya se usó o caducó (dura 30 minutos). Pide uno nuevo.',
                ],
            ], 422);
        }

        responder(['ok' => true, 'mensaje' => 'Contraseña actualizada. Ya puedes iniciar sesión.']);
    }

    // Camino por código SMS: hay que saber de quién es.
    if ($identificador === '') {
        auth_fallo_campos(['identificador' => 'Con el código hace falta tu correo o teléfono.']);
    }

    $cuenta = auth_cuenta($identificador);

    if ($cuenta === null) {
        fallo('El código no es válido o ya caducó. Pide uno nuevo.', 422, 'CODIGO_INVALIDO');
    }

    $vigente = auth_token_vigente((int) $cuenta['id']);
    $codigoReal = auth_codigo_sms((int) $cuenta['id']);

    if ($vigente === null || $codigoReal === '' || !hash_equals($codigoReal, str_pad($codigo, 6, '0', STR_PAD_LEFT))) {
        fallo('El código no es válido o ya caducó. Pide uno nuevo.', 422, 'CODIGO_INVALIDO');
    }

    $repo = auth_repo();
    $repo->marcarTokenUsado((int) $vigente['id']);
    $repo->actualizarPassword((int) $cuenta['id'], \App\Core\Password::hash($password));
    (new \App\Core\AuditLogger(auth_pdo()))->log('password_restablecida', (int) $cuenta['id'], 'usuario', (string) $cuenta['id'], ['via' => 'codigo_sms'], auth_ip());

    responder(['ok' => true, 'mensaje' => 'Contraseña actualizada. Ya puedes iniciar sesión.']);
}

// ------------------------------------------------------------ GET /auth/verificar
if ($authRuta === '/auth/verificar') {
    if ($authMetodo !== 'GET') {
        fallo('Método no permitido.', 405, 'METODO');
    }

    $estado = auth_estado_token(api_q('token'));

    // 200 siempre: el estado (ok | caducado | invalido) es parte del contrato.
    responder(['ok' => true] + $estado);
}

// ---------------------------------------------------------------- GET /legales/*
if ($authRuta === '/legales/terminos' || $authRuta === '/legales/privacidad') {
    if ($authMetodo !== 'GET') {
        fallo('Método no permitido.', 405, 'METODO');
    }

    $documento = auth_legales(str_ends_with($authRuta, 'terminos') ? 'terminos' : 'privacidad');

    if ($documento === null) {
        fallo('Documento no encontrado.', 404, 'NO_ENCONTRADO');
    }

    responder(['ok' => true, 'documento' => $documento]);
}

fallo('Ruta no encontrada: ' . $authRuta, 404, 'NO_ENCONTRADA');
