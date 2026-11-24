# Anuncios nivel Instagram + muros de suscripción + cobro con tarjeta — Plan de implementación

> **For Hermes:** usar `subagent-driven-development`: un subagente por tarea con revisión en dos etapas.

**Meta:** anuncios de mayorista con fichas visuales tipo Instagram (imagen grande, texto mínimo), subida de imagen personalizada (PNG/JPG) y conexión con Canva; muro de suscripción — solo mayoristas Premium publican anuncios, solo comercios Premium usan el POS; cobro del POS con pantalla de datos de tarjeta (pasarela demo, sin cobro real).

**Arquitectura:** la base ya tiene `planes`/`suscripciones` con `flags` JSON y el flujo `/planes/suscribir` (cobro simulado, referencia PREM-*). Los anuncios ya guardan imagen en `storage/anuncios/` vía data URL. Lo nuevo: (1) un helper `api_suscripcion_flags()` en `_comun.php` que lee la suscripción vigente; (2) guards en `/anuncios/publicaciones` (mayorista) y en el módulo POS (comercio) que exigen el flag correspondiente; (3) la sesión (`/session`) devuelve `suscripcion` para que el front pinte muros y bloqueos sin adivinar; (4) ficha de anuncio con imagen 4:5 dominante; (5) panel de diseño con subida local + conexión Canva (OAuth PKCE demo: la app no tiene client_id real, así que la conexión guarda el vínculo y permite pegar un enlace de plantilla de Canva — el diseño se exporta como imagen y se sube); (6) en el cobro del POS, método "tarjeta" abre una pantalla de datos de tarjeta con validación Luhn y formatos, todo demo.

**Stack:** PHP 8.5 (backend/app/Api/*), React 19 + Vite (frontend/src), MariaDB :3307, Playwright (qa/).

**Regla de la casa:** los datos de tarjeta son demo — NUNCA se envían al backend ni se guardan; solo se validan en el cliente y se manda el método `tarjeta` como hoy.

---

### Tarea 1: Helper de suscripción en el backend

**Objetivo:** una sola función que diga qué flags Premium tiene el usuario en sesión.

**Files:**
- Modify: `backend/app/Api/_comun.php` (después de `api_exigir`)

**Código:**

```php
/** Suscripción vigente del usuario en sesión: ['plan' => clave, 'flags' => array] o null. */
function api_suscripcion(): ?array
{
    static $cache = null;
    if ($cache !== null) return $cache;

    $stmt = api_pdo()->prepare(
        "SELECT p.clave, p.flags FROM suscripciones s JOIN planes p ON p.id = s.plan_id
         WHERE s.usuario_id = ? AND s.estado = 'activa' AND (s.hasta IS NULL OR s.hasta >= CURDATE())
         LIMIT 1"
    );
    $stmt->execute([api_uid()]);
    $fila = $stmt->fetch();

    $cache = $fila === false ? null : [
        'plan'  => (string) $fila['clave'],
        'flags' => json_decode((string) $fila['flags'], true) ?: [],
    ];
    return $cache;
}

/** Exige que la suscripción vigente tenga el flag; si no, 403 SUSCRIPCION con mensaje accionable. */
function api_exigir_flag(string $flag): void
{
    $s = api_suscripcion();
    if ($s === null || empty($s['flags'][$flag])) {
        fallo('Esta función necesita una suscripción Premium. Actívala en Planes.', 403, 'SUSCRIPCION');
    }
}
```

**Verificar:** `~/.local/php-static/php -l backend/app/Api/_comun.php` → sin errores.

**Commit:** `feat: helper de suscripción vigente y guard por flag (api_suscripcion / api_exigir_flag)`

---

### Tarea 2: Muro — solo mayorista Premium publica anuncios

**Objetivo:** `POST /anuncios/publicaciones` rechaza sin Premium con 403 `SUSCRIPCION`.

**Files:**
- Modify: `backend/app/Api/comercio.php:962` — primera línea del handler `POST /anuncios/publicaciones`:

```php
if ($rutaModulo === '/anuncios/publicaciones' && $metodoModulo === 'POST') {
    api_exigir('mayorista');
    api_exigir_flag('banner');   // flag que el seed pone en premium
```

**Nota:** el seed de `planes` ya trae `"banner":true` en premium y `false` en gratis. `GET /anuncios/publicaciones` NO se bloquea (el mayorista debe ver su historial y el muro con CTA).

**Verificar:** con la cuenta `demo-insumos-del-valle` (Premium, usuario 4, hasta 2026-12-24) el POST pasa; simulando sin suscripción → 403 SUSCRIPCION. Prueba con curl + cookie de sesión.

**Commit:** `feat: muro de suscripción en la publicación de anuncios (solo Premium)`

---

### Tarea 3: Muro — solo comercio Premium usa el POS

**Objetivo:** el módulo POS entero exige el flag `banner` (o uno dedicado `pos`) para rol comercio.

**Files:**
- Modify: `backend/app/Api/pos.php:29` — después de `api_exigir('comercio');`:

```php
api_exigir('comercio');
// El punto de venta es una función Premium: sin suscripción, 403 SUSCRIPCION.
api_exigir_flag('pos');
```

- Modify: `backend/database/migrations/035_flags_pos.sql` (nuevo):

```sql
-- El POS es una función Premium del comercio: el plan premium gana el flag.
UPDATE planes SET flags = JSON_SET(flags, '$.pos', TRUE) WHERE clave = 'premium';
UPDATE planes SET flags = JSON_SET(flags, '$.pos', FALSE) WHERE clave = 'gratis';
```

**Ejecutar:** `~/.local/mariadb/bin/mariadb -h 127.0.0.1 -P 3307 -u didi2_app -p... didi2 < backend/database/migrations/035_flags_pos.sql` (o con el migrador).

**Verificar:** comercio demo (id 2, sin suscripción) → `GET /api/pos` responde 403 SUSCRIPCION; mayorista → 403 SIN_PERMISO (rol).

**Commit:** `feat: el punto de venta exige suscripción Premium (flag pos)`

---

### Tarea 4: La sesión expone la suscripción (el front pinta muros)

**Objetivo:** `/session` devuelve `suscripcion` con plan y flags; el store la guarda.

**Files:**
- Modify: `backend/public/api.php` (bloque `/session`, después de `onboarding`):

```php
// Suscripción vigente (para muros de POS y anuncios sin llamada extra).
$suscripcion = null;
if ($usuarioId > 0) {
    $stmt = $pdo->prepare(
        "SELECT p.clave, p.flags FROM suscripciones s JOIN planes p ON p.id = s.plan_id
         WHERE s.usuario_id = ? AND s.estado = 'activa' AND (s.hasta IS NULL OR s.hasta >= CURDATE()) LIMIT 1"
    );
    $stmt->execute([$usuarioId]);
    if (($f = $stmt->fetch()) !== false) {
        $suscripcion = ['plan' => (string) $f['clave'], 'flags' => json_decode((string) $f['flags'], true) ?: []];
    }
}
```
y en el `responder([...])` añadir `'suscripcion' => $suscripcion,`.

- Modify: `frontend/src/lib/api.ts` — tipo de sesión: añadir `suscripcion?: { plan: string; flags: Record<string, boolean> } | null`.
- Modify: `frontend/src/store/session.tsx` — guardar `suscripcion` en el estado de sesión (junto a `tema`).

**Verificar:** `curl -s http://127.0.0.1:8081/api/session` (sin sesión) → `suscripcion: null`; con sesión de mayorista demo → `{"plan":"premium","flags":{...}}`.

**Commit:** `feat: la sesión expone la suscripción vigente (plan + flags)`

---

### Tarea 5: Fichas de anuncio tipo Instagram (imagen dominante 4:5)

**Objetivo:** en el dashboard del comercio, cada anuncio se ve como tarjeta visual: imagen grande arriba (relación 4:5), marca del mayorista arriba, título/cuerpo debajo, CTA. Sin imagen → degradado con iniciales grandes.

**Files:**
- Modify: `frontend/src/pages/Inicio.tsx` (componente `Publicidades`): reestructurar la ficha:

```tsx
<button type="button" className="publicidad publicidad--visual" key={a.id} style={{ ['--i' as string]: j }} onClick={() => abrir(a)}>
  <span className="publicidad__marca">
    <span className="publicidad__avatar">{a.mayorista.slice(0, 2).toUpperCase()}</span>
    <strong>{a.mayorista}</strong>
    <span className="publicidad__patrocinio">Publicidad</span>
  </span>
  <span className="publicidad__media" aria-hidden="true">
    {a.imagen ? <img src={a.imagen} alt="" loading="lazy" /> : <span className="publicidad__fallo">{a.mayorista.slice(0, 2).toUpperCase()}</span>}
  </span>
  <span className="publicidad__pie">
    <strong>{a.titulo}</strong>
    <small>{a.cuerpo}</small>
  </span>
</button>
```

- Modify: `frontend/src/styles/mod-comercio.css` — añadir (y mantener la variante horizontal como `.publicidad--compacta` para las columnas angostas):

```css
.publicidades--visual { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(300px, 100%), 1fr)); gap: 16px; }
.publicidad--visual { display: grid; padding: 0; overflow: hidden; }
.publicidad__marca { display: flex; align-items: center; gap: 8px; padding: 12px 14px; }
.publicidad__avatar { width: 30px; height: 30px; border-radius: 50%; background: var(--verde-suave); color: var(--verde); display: grid; place-items: center; font-size: 12px; font-weight: 800; }
.publicidad__patrocinio { margin-left: auto; font-size: 11.5px; color: var(--faint); }
.publicidad__media { display: block; aspect-ratio: 4 / 5; background: linear-gradient(135deg, var(--verde-suave), #dcefe2); }
.publicidad__media img { width: 100%; height: 100%; object-fit: cover; display: block; }
.publicidad__media .publicidad__fallo { font-size: 44px; font-weight: 800; color: var(--verde); opacity: .55; }
.publicidad__pie { display: grid; gap: 3px; padding: 12px 14px 14px; text-align: left; }
.publicidad__pie strong { font-size: 14px; }
.publicidad__pie small { font-size: 12.5px; color: var(--muted); line-height: 1.4; }
html[data-tema='oscuro'] .publicidad__media { background: linear-gradient(135deg, #1b2f24, #16221c); }
```

**Reglas del gate que se aplican solas:** `aspect-ratio` + `object-fit: cover` no crean desborde; la ficha es `display:grid` con hijos en flujo. Verificar con `paridad.cjs` a 360 y 1280.

**Verificar:** captura del inicio del comercio con ≥1 anuncio con imagen y 1 sin imagen; visión confirma formato vertical tipo Instagram.

**Commit:** `feat: fichas de anuncio tipo Instagram (imagen 4:5 dominante, marca y pie)`

---

### Tarea 6: Subida de imagen personalizada en el publicador (PNG/JPG + Canva)

**Objetivo:** el paso 1 del publicador permite (a) subir PNG/JPG local (ya existe, pulir a preview con recorte visual), (b) conectar Canva.

**Files:**
- Modify: `frontend/src/pages/Inicio.tsx` (componente `Publicador`, paso 1):
  - Debajo del `publicador__archivo`, dos acciones: **Subir imagen** (input file existente) y **Conectar Canva**.
  - Estado nuevo: `canvaVinculado: boolean` (de `localStorage: ares-canva-vinculado`).
- Create: `frontend/src/components/Canva.tsx` — diálogo de conexión:

```tsx
/* Conexión con Canva (demo): la app no tiene client_id de Canva Connect, así que
   el flujo guarda el vínculo de la cuenta y guía la exportación: el usuario abre
   su diseño en Canva, lo exporta como PNG y lo sube con el botón de imagen.
   El diálogo muestra el estado y el enlace a canva.com. */
```
  - Botón "Conectar Canva" → abre `https://canva.com` en pestaña nueva, guarda la bandera y muestra instrucciones de exportar (Compartir → Descargar → PNG 1080×1350).
  - Estado vinculado: chip verde "Canva conectado" + botón "Abrir Canva" y "Desconectar".

**Nota honesta:** OAuth real de Canva Connect requiere client_id registrado en la consola de Canva; sin él no hay callback válido. El plan entrega el vínculo de cuenta + flujo de exportación guiado, que es lo que se puede probar hoy. Cuando exista client_id, `Canva.tsx` es el único archivo a cambiar.

**Verificar:** subir un PNG de prueba → preview visible; publicar → la imagen sale en la ficha 4:5 del comercio.

**Commit:** `feat: subida de imagen personalizada y conexión Canva en el publicador`

---

### Tarea 7: Cobro del POS con pantalla de tarjeta (demo)

**Objetivo:** al elegir "Tarjeta" en el cobro, aparece la pantalla de datos de tarjeta (número, nombre, vencimiento, CVV) con validación de formato y Luhn en el cliente; los datos NUNCA salen del navegador; al confirmar se manda `metodo: 'tarjeta'` como hoy.

**Files:**
- Create: `frontend/src/components/TarjetaDemo.tsx` — formulario con:
  - `input` de número con agrupación cada 4 dígitos (`#### #### #### ####`), detección de marca (Visa 4…, Mastercard 5…, Amex 3…) y **validación Luhn**.
  - Vencimiento `MM/AA` con validación de mes y no vencida.
  - CVV de 3-4 dígitos según marca.
  - Aviso visible: «Modo prueba: no se realiza ningún cobro real y tus datos no se guardan».
  - Al confirmar: `onListo()` — el padre continúa `cobrar()` con `metodo='tarjeta'`.
- Modify: `frontend/src/pages/pos/Caja.tsx` (diálogo de cobro): cuando `metodo === 'tarjeta'`, en lugar del flujo directo, montar `<TarjetaDemo onListo={() => cobrar()} />`. Efectivo/transferencia/crédito quedan igual.

**Código clave (Luhn):**

```ts
const luhn = (n: string) => {
  const d = n.replace(/\D/g, '')
  if (d.length < 13) return false
  let s = 0
  for (let i = 0; i < d.length; i++) {
    let x = +d[d.length - 1 - i]
    if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9 }
    s += x
  }
  return s % 10 === 0
}
```

**Verificar (Playwright):** cobrar con `4242 4242 4242 4242` → acepta y crea la venta; con `4242 4242 4242 4241` → rechaza en el cliente; el body del POST a `/pos/vender` NO contiene número de tarjeta (inspección de red en la prueba).

**Commit:** `feat: pantalla de datos de tarjeta en el cobro del POS (validación local, demo sin cobro)`

---

### Tarea 8: Pantalla Planes con los dos muros explicados

**Objetivo:** `/planes` muestra qué desbloquea Premium por rol: mayorista → publicar anuncios; comercio → punto de venta. CTA claro.

**Files:**
- Modify: `frontend/src/pages/Planes.tsx` — añadir sección de beneficios por rol (leer `rol` de la sesión) y mostrar la suscripción vigente con fecha de renovación.

**Verificar:** captura de `/planes` como comercio (ve "Punto de venta ilimitado") y como mayorista (ve "Publica anuncios en miles de comercios").

**Commit:** `feat: pantalla de planes con beneficios por rol y estado de suscripción`

---

### Tarea 9: QA integral y limpieza

**Objetivo:** el gate completo sigue en cero y la base queda como estaba.

**Pasos:**
1. `cd ~/ares-react/qa && node paridad.cjs && node paridad.cjs todos --movil && node humo.cjs` → 52 rutas · 0 con problemas en ambos modos, humo OK. Las rutas `/pos*` con comercio sin Premium ahora devuelven 403: el barrido debe tratar 403 SUSCRIPCION como esperado en esas rutas (ajustar `paridad.cjs` si marca error).
2. Prueba de flujo completo con Playwright: mayorista Premium publica anuncio con imagen → comercio lo ve en su inicio; comercio sin Premium entra a `/pos` → pantalla de muro con CTA a `/planes`.
3. Si se creó una venta de prueba en el POS: borrarla con la transacción de la skill (`pos_ventas`/`pos_venta_lineas`/`pos_pagos`/`pos_movimientos` + stock).
4. Commit final + build + verificar hash local == funnel.

---

## Orden de ejecución

1 → 2 → 3 → 4 (backend y sesión) → 5 → 6 → 7 → 8 (front) → 9 (QA). Las tareas 5-7 son independientes entre sí una vez la 4 está lista; 2 y 3 dependen de 1; 9 cierra.
