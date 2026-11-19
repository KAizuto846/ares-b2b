# Auditoría funcional SPA Ares React — Agente A

Entorno: http://127.0.0.1:8081/spa · Chrome headless (Playwright) · 1440x900 · 2026-11-18
Alcance ejecutado: login/logout 3 roles, búsqueda comercio (texto/vacío/radio/orden), carrito completo (agregar 3, cajón, +/- cantidades, quitar, vaciar), Pedidos, Perfil, Checkout, mayorista (inicio/catálogo/pedidos), admin (inicio/panel), recarga en deep link, sesión expirada.
No se pulsó "Confirmar pedido": pedidos en BD antes y después = 39. Carrito de comercio quedó vacío (0 líneas).

> Nota: el árbol de `frontend/src` cambió durante la prueba (Shell.tsx 13:44, Buscar.tsx 13:40 — apareció un enlace "Panel clásico" que no existía al iniciar). Los hallazgos corresponden al estado observado en las capturas.

## Defectos

### ALTA

**A1 · `/spa/admin` y `GET /api/admin` sin control de rol — un comercio ve métricas globales**
- Ruta: `/spa/admin` (nav oculto, pero accesible por URL)
- Reproducir: login `comercio@didi2.mx` → navegar a `http://127.0.0.1:8081/spa/admin`. Equivalente API: `curl -b <cookie comercio> :8081/api/admin` → `200 {"usuarios":11,"comercios":2,"mayoristas":5,"pedidos":39,...}`
- Esperado: 403 / redirección al inicio.
- Real: panel completo con usuarios, comercios, mayoristas, pedidos totales y KYC pendientes.
- Causa: `backend/public/api.php:366-378` no valida rol; `App.tsx` no tiene guard por rol.
- Evidencia: `qa/agenteA-23-comercio-accede-a-admin.png`

**A2 · El selector "Ordenar por" no ordena ("Menor precio" y "Nombre" se ignoran en silencio)**
- Ruta: `/spa/buscar`, selector `select[aria-label="Ordenar por"]`
- Reproducir: elegir "Menor precio" (value `precio`) o "Nombre" (value `nombre`).
- Esperado: precios ascendentes / orden alfabético.
- Real: el orden sigue siendo por distancia; la respuesta trae `orden:"distancia"`. Precios observados: `1250, 185.5, 189, 3.5, 19.9, 52, 20, 10.5, 890, 320` (sin monotonía). Con `?orden=precio_asc` el backend sí ordena (3.5, 10.5, 19.9…), o sea: los `value` del `<select>` (`precio`, `nombre`) no existen en la whitelist `BusquedaService::ORDENES` = `distancia|precio_asc|precio_desc|reputacion`, y `nombre` no existe en `BusquedaRepository::ORDENES`.
- Evidencia: `qa/agenteA-08-comercio-buscar-radio50-orden-precio.png`, `qa/agenteA-09-comercio-buscar-radio50-orden-nombre.png`

**A3 · `GET /api/checkout` devuelve 500 para roles que no son comercio**
- Reproducir: sesión mayorista o admin → `GET /api/checkout` (o abrir `/spa/checkout`).
- Esperado: 403/422 con mensaje, o carrito vacío.
- Real: `500 {"code":"INTERNO"}`. `CarritoService::recalcular(comercioId())` recibe `0` y `carritoDe(0)` no devuelve carrito → excepción.
- Evidencia: `qa/agenteA-36-admin-checkout-directo.png` (consola: `500 GET /api/checkout`)

### MEDIA

**M1 · Checkout se queda en esqueleto infinito cuando el API falla (no muestra el error)**
- Ruta: `/spa/checkout`
- Reproducir: abrir checkout con el API fallando (p. ej. sesión admin → 500 de A3).
- Esperado: banner de error (el componente sí tiene estado `error`).
- Real: esqueletos para siempre; el `if (!resumen) return <Skeleton/>` de `Checkout.tsx:69` se evalúa antes de renderizar el `aviso--error`.
- Evidencia: `qa/agenteA-36-admin-checkout-directo.png`

**M2 · Sesión expirada se presenta como "no tienes datos" en vez de mandar al login**
- Ruta: `/spa/pedidos` (navegación interna, sin recargar)
- Reproducir: login comercio → borrar cookie de sesión → clic en "Pedidos".
- Esperado: redirección a login / aviso de sesión.
- Real: `401 /api/pedidos` y la vista dice "Todavía no tienes pedidos". En "Inicio" sí aparece "Inicia sesión para continuar." pero tampoco redirige → manejo inconsistente.
- Causa: `Pedidos.tsx:12` `.catch(() => setPedidos([]))`; `Gate` solo evalúa la sesión al montar.
- Evidencia: `qa/agenteA-43-sesion-expirada-pedidos.png`, `qa/agenteA-43-sesion-expirada-inicio.png`

**M3 · "50 km" se convierte en 30 km sin avisar**
- Ruta: `/spa/buscar`, `select[aria-label="Radio de búsqueda"]`
- Reproducir: elegir "50 km". Respuesta: `radio: 30` (el SPA envía `radio=50`, `BusquedaService::RADIO_MAX = 30` recorta y la UI ignora el campo `radio` de la respuesta).
- Esperado: no ofrecer 50 km, o avisar del límite.
- Evidencia: `qa/agenteA-08-...radio50...png` + log de red (`enviado 50 → radioEfectivo 30`)

**M4 · Contador del globo del carrito ≠ contador del cajón**
- Reproducir: agregar 1 producto (cantidad 1) → abrir cajón → "+" en la línea.
- Esperado: mismo número en ambos.
- Real: globo "1", encabezado del cajón "2". `Shell.tsx:163` usa `carrito.items` (líneas); `Shell.tsx:55` suma cantidades.
- Evidencia: `qa/agenteA-41-contador-globo-vs-cajon.png`

**M5 · El cajón cerrado sigue siendo alcanzable con Tab (contenido `aria-hidden` enfocable)**
- Reproducir: `/spa/perfil` → pulsar Tab 25 veces.
- Real: 10 focos caen en `.cajon[aria-hidden="true"]` ("Vaciar", "Cerrar carrito", "+ Agregar más de este proveedor"…). Falta `inert`/`hidden` cuando está cerrado.
- Evidencia: `qa/agenteA-31-a11y-foco-cajon-cerrado.png`

**M6 · "Vaciar" borra el carrito sin confirmación ni deshacer**
- Reproducir: cajón → botón "Vaciar".
- Esperado: confirmación (o toast con "Deshacer", como ya ocurre al quitar una línea).
- Real: borrado inmediato de todas las líneas.
- Evidencia: `qa/agenteA-42-vaciar-sin-confirmacion.png`

**M7 · Errores de API silenciados en los listados**
- `Pedidos.tsx:12` → `setPedidos([])` (fallo = "no tienes pedidos")
- `Productos.tsx:15` → "Sin productos"
- `Admin.tsx:8` → todas las tarjetas en 0
- `Perfil.tsx:15` → `setDatos(null)` = esqueleto infinito
- Reproducir: forzar 401/500 en `/api/pedidos`, `/api/admin`, `/api/productos`, `/api/perfil`. El usuario no distingue "vacío" de "error".
- Evidencia: `qa/agenteA-43-sesion-expirada-pedidos.png`

**M8 · Un mayorista puede abrir `/spa/buscar` y ver precios/stock de la competencia**
- Reproducir: login `demo-insumos-del-valle@didi2.mx` → URL `/spa/buscar`.
- Real: 10 productos de otros mayoristas con precio, stock y distancia (sin botón "Agregar", único control condicionado por rol). `GET /api/buscar` no filtra por rol.
- Evidencia: `qa/agenteA-31-mayorista-buscar-directo.png`

### BAJA

**B1 · Búsqueda sin paginación**: `per_page=24` fijo y no hay control de página aunque la API devuelve `paginas`. Latente (hoy hay 10 resultados en 25 km, no reproducible).
**B2 · Copy**: "1 de 2 proveedores alcanzan el mínimo" (concordancia); "0 productos de proveedores verificados cerca de ti" con 0 resultados.
**B3 · Login**: el bloqueo por intentos responde `401` genérico ("Demasiados intentos. Espera unos minutos.") sin `Retry-After`, y el límite es por IP: todos los usuarios detrás de la misma IP quedan fuera a la vez (nos pasó con 5 fallos). Evidencia: `qa/agenteA-25b-mayorista-login-reintento.png`.
**B4 · `vaciar()` y `salir()` sin `try/catch`** en `store/session.tsx`: si el POST falla queda una promesa rechazada sin manejar y el estado local no se actualiza.
**B5 · Drawer de comercio se renderiza (y se lee) en el DOM de todas las rutas**: en "Pedidos" el texto extraído incluye "Mi carrito 0 · Tu carrito está vacío"; con M5 complica teclado y lectores.

## Lo que sí funciona (verificado con capturas)

- Login de los 3 roles (comercio, mayorista, admin) y logout desde sidebar y desde Perfil; sesión persiste tras recarga en deep link `/spa/pedidos` (`agenteA-03/27/33/37/38`).
- Login con contraseña incorrecta muestra "Correo o contraseña incorrectos." y no entra (`agenteA-02`).
- Búsqueda comercio: sin texto (10 resultados), con texto, estado "Sin resultados" correcto (`agenteA-04/05/06`).
- Radio de búsqueda sí filtra: 5 km → 2 resultados vs 25 km → 10 (`agenteA-07/10`).
- Agregar 3 productos distintos: un `POST /api/carrito/agregar` por producto, toast "Agregado al carrito", globo actualizado a 3 (`agenteA-11`).
- Stepper de tarjeta: sube/baja y respeta mínimo y stock (`agenteA-12`).
- Cajón: agrupación por mayorista, barra de mínimo, "Faltan $X para el mínimo", subtotal/IVA/total, CTA deshabilitado sin mínimos y "Continuar con N proveedor(es)" cuando se cumple (`agenteA-13/32`).
- Aumentar/disminuir cantidad recalcula importe de línea y totales (`agenteA-14/15`).
- Quitar producto con toast "eliminado · Deshacer" (`agenteA-16`); vaciar deja el estado vacío correcto (`agenteA-17`); Esc cierra el cajón (`agenteA-18`).
- Pedidos comercio: 10 pedidos con estado, fecha relativa y total (`agenteA-19`).
- Perfil comercio: nombre, email, rol, "Miembro desde", dirección (`agenteA-20`).
- Checkout carrito vacío: "Ningún proveedor alcanza su mínimo" y sin botón de confirmar (`agenteA-21`).
- Checkout con mínimo cumplido: resumen por proveedor, subtotal/IVA/total, dirección preseleccionada y "Confirmar pedido" habilitado (**no se pulsó**) (`agenteA-26`).
- Mayorista: inicio con KPIs (12 productos, 2 por surtir, $3,096 vendido), catálogo con búsqueda real (`q=jab`→1, `q=detergente`→2) y sin botón de carrito, pedidos con 4 filas y estados (`agenteA-27/28/29/30`), perfil con datos correctos (`agenteA-32`).
- Admin: inicio con 4 KPIs y panel con 6 tarjetas + 1 alerta KYC (`agenteA-33/34/45`).
- Sin errores de consola en los flujos felices; los únicos `4xx/5xx` observados son los descritos arriba.

## Archivos
- Capturas: `/home/rizutov/ares-react/qa/agenteA-*.png` (01–45)
- Scripts de prueba (fuera del proyecto): `~/.hermes/cache/scratch/qa-ares*.mjs`, `probe-*.mjs`
