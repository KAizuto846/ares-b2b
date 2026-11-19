# Guía de paridad React ↔ PHP (Ares)

Objetivo: que la SPA de `~/ares-react` tenga **todas** las funciones del panel PHP
(`~/ares-react/backend`, copia de `~/distribuidora-final`), conservando el diseño React (Ares).

## Reglas que no se negocian

1. **Nunca tocar `~/distribuidora-final`.** Es producción (:3110). Aquí solo `~/ares-react`.
2. **No editar archivos compartidos**: `src/App.tsx`, `src/components/Shell.tsx`,
   `src/components/Icon.tsx`, `src/lib/api.ts`, `src/styles/app.css`, `src/main.tsx`,
   `backend/public/api.php`, `backend/app/Api/_comun.php`. Si falta algo ahí, se pide.
3. Cada módulo escribe **solo** sus archivos: `backend/app/Api/<modulo>.php`,
   `frontend/src/pages/<modulo>/*.tsx`, `frontend/src/lib/api-<modulo>.ts`,
   `frontend/src/styles/mod-<modulo>.css` (ya existe, se le añade al final).
4. Se conserva el diseño: clases de `app.css` (`.card`, `.card__cab`, `.card__cuerpo`, `.btn`,
   `.btn--claro`, `.btn--peligro`, `.chip--ok|alerta|malo|info|neutro`, `.campo`, `.kpis`,
   `.kpi`, `.tabla`, `.aviso--ok|error|info`, `.vacio`, `.skel`, `.pagina-cab`, `.icono-btn`).
   Nada de librerías nuevas, fuentes nuevas ni CSS externo.
5. Nada de `localStorage` para estado de negocio: todo va a la API.

## Arranque (ya está corriendo en :8081)

```bash
cd ~/ares-react/frontend && npm run build      # sale a backend/public/spa
cd ~/ares-react/backend && ~/.local/php-static/php -S 127.0.0.1:8081 -t public server.php
```

La SPA vive en `http://127.0.0.1:8081/spa/` con `basename="/spa"`.
PHP estático: `~/.local/php-static/php`.

Cuentas (misma base `didi2`, MariaDB :3307):

| Rol | Correo | Clave |
|---|---|---|
| comercio | comercio@didi2.mx | comercio123 |
| repartidor | repartidor@didi2.mx | repartidor123 |
| admin | admin@didi2.mx | admin123 |
| mayorista | demo-insumos-del-valle@didi2.mx | demo1234 |

El límite de login de la copia es 60 fallos/IP; si sale 429, borrar `backend/storage/rate/*.json`.

## API: cómo se añade un endpoint

`public/api.php` ya validó sesión (`api_uid()`), JSON, `Origin` y publicó el contexto.
Los módulos se incluyen en orden alfabético y **devuelven** el control si la ruta no es suya.

```php
<?php
declare(strict_types=1);

if (api_ctx()['ruta'] === '/finanzas' && api_ctx()['metodo'] === 'GET') {
    api_exigir('comercio');
    responder(['ok' => true, 'serie' => []]);
}
```

Ayudas disponibles (`app/Api/_comun.php`): `api_ctx()`, `api_pdo()`, `api_uid()`, `api_rol()`,
`api_cuerpo()`, `api_exigir('comercio'|'mayorista'|'repartidor'|'admin')`, `api_comercio_id()`,
`api_mayorista_id()`, `api_repartidor_id()`, `api_pedido_propio($uuid)`, `api_q()`, `api_qint()`,
`api_bool()`, `api_fecha()`, `responder()`, `fallo()`.

Contrato: `{ok:true, ...}` o `{ok:false, error:{code, message}}` con **mensaje en español y
accionable**. Cada endpoint decide su rol; un endpoint sin guard es un fallo de seguridad.
Las mutaciones llegan como JSON en `api_cuerpo()`; los filtros por query con `api_q()`.

### Columnas reales (no inventarlas)

- `pedidos`: `id, uuid, comercio_id, mayorista_id, subtotal, iva, envio, total, estado,
  created_at, fecha_entrega_programada`. **No tiene `repartidor_id`**: el repartidor vive en
  `envios.repartidor_id` (y admite `usuarios.id` o `repartidores_perfil.id`).
- `detalle_pedido`: `pedido_id, producto_id, nombre_producto, cantidad, precio_unitario,
  escala_aplicada, iva_tasa, subtotal`.
- `envios`: `pedido_id, repartidor_id, tarifa, distancia_km, estado, codigo_recoleccion_hash`.
- `pos_productos`: `usuario_id, nombre, imagen, sku, codigo_barras, precio_compra, precio_venta,
  iva_tasa, stock, stock_minimo, unidad, activo`. **No hay `stock_minimo` en `productos`.**
- `pos_ventas`: `uuid, usuario_id, turno_id, folio, cliente_id, subtotal, iva, total, estado`.
- `pos_turnos`: `usuario_id, abierto_at, cerrado_at, fondo_inicial, efectivo_esperado,
  efectivo_contado, diferencia, estado`.
- `facturas`: `uuid, pedido_id, emisor_usuario_id, receptor_usuario_id, serie, folio, rfc_*,
  razon_social_*, subtotal, iva, total, uuid_timbrado, estado, created_at`.
- `parametros`: `clave, valor_actual, tipo, descripcion, version, cambiado_por, cambiado_at`.
- `reclamos`: `uuid, pedido_id, tipo, descripcion, estado, resolucion, monto_reembolso, respuesta`.
- `kyc_documentos`: `usuario_id, tipo, ruta_archivo, mime, estado, revisado_por, motivo_rechazo`.
- `mensajes_directos`: `conversacion_id, autor_id, cuerpo, created_at`;
  `conversacion_participantes`: `conversacion_id, usuario_id, ultimo_leido_id, silenciada, oculta`.
- `notificaciones`: `usuario_id, canal, tipo, asunto, cuerpo, enlace, estado, enviado_at`.
- `pedidos_programados`: `comercio_id` = **`comercios_perfil.id`**, `mayorista_id` =
  **`mayoristas_perfil.id`**; `fecha_deseada`, `frecuencia`, `estado`.
- `favoritos`: `comercio_id, producto_id, carpeta`.

### Trampas conocidas

- `Request::input()` no lee query string; en la API se usa `api_q()`.
- Todo folio correlativo se deriva de `MAX(...)`, nunca de `COUNT(*)`.
- Los estados internos son más finos que los cinco visibles: mapear, no renombrar.
- Importes: `number_format` en el cliente; el backend devuelve números, no cadenas con `$`.
- La sesión ya está resuelta: no volver a leer `$_SESSION` directamente.

## Frontend: cómo se añade una pantalla

1. `src/lib/api-<modulo>.ts` con funciones tipadas usando `pedir` de `../lib/api`.
2. `src/pages/<modulo>/<Pantalla>.tsx`. El archivo ya existe como stub: **sobrescribirlo**.
   Exporta `default`.
3. Estilos específicos al final de `src/styles/mod-<modulo>.css`.
4. Rutas: ya están declaradas en `App.tsx` (no tocarlo). Si hace falta una ruta nueva, se pide.

Patrón de página:

```tsx
export default function Finanzas() {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { apiFinanzas().then(setDatos).catch((e) => setError(e.message)) }, [])
  if (error) return <div className="aviso aviso--error">{error}</div>
  if (!datos) return <div className="card"><div className="card__cuerpo"><div className="skel" style={{ height: 120 }} /></div></div>
  return (<>
    <header className="pagina-cab"><div><h1>Finanzas</h1><p>…</p></div></header>
    …
  </>)
}
```

- Enlaces internos con `useNavegar()` o `<Link>`; nunca `window.location`.
- Fechas con el helper `fecha()` de `src/lib/format.ts`; dinero con `money()`.
- Confirmaciones destructivas: diálogo propio (no `confirm()`).
- Toda tabla ancha va dentro de `.tabla-scroll` (definido en `mod-*.css`) para que en móvil
  se desplace en horizontal sin romper la página.

## Gate de aceptación (obligatorio antes de decir «listo»)

```bash
cd ~/ares-react/frontend && npm run build          # 0 errores TS
```

Y con Playwright (`/home/rizutov/didi2-b2b/node_modules/playwright`):

- login con la cuenta del rol, recorrer **cada** ruta del módulo;
- 0 errores de consola, 0 respuestas ≥400;
- medir desborde: `document.documentElement.scrollWidth - clientWidth === 0`;
- captura por pantalla en `~/ares-react/qa/<modulo>/`.

## Referencias del PHP (leer, no copiar el HTML)

- Vistas: `backend/app/Views/<modulo>/*.php` — dicen **qué** datos y acciones tiene la pantalla.
- Controladores: `backend/app/Modules/<Modulo>/*Controller.php` — dicen **cómo** se consultan.
- Servicios/repositorios: `backend/app/Modules/**` — reutilizables desde la API.
- CSS heredado: `backend/public/assets/css/app.css` (no se usa en la SPA; sirve de referencia).
