# Ares React

Reescritura de la interfaz de Distribuidora como **SPA de React** sobre una **API JSON** que reutiliza el dominio ya probado (precios por escala, IVA, reservas de stock, checkout idempotente).

Corre aparte: **puerto 8081**, cookies de sesión con otro nombre y sin tocar el servicio de producción.

## Estructura

```
ares-react/
├── backend/            copia del PHP actual + public/api.php (API JSON)
│   ├── public/api.php  endpoints /api/*
│   ├── server.php      router de php -S: /api → JSON, resto → SPA
│   └── public/spa/     build de Vite (generado)
├── frontend/           Vite + React 19 + TypeScript + React Router
│   └── src/
│       ├── styles/app.css   sistema visual y animaciones
│       ├── store/session.tsx sesión, carrito, toasts, vuelo al carrito
│       ├── components/      Shell (rail, topbar, cajón), Icon, UI
│       └── pages/           Inicio, Buscar, Checkout, Pedidos, Perfil,
│                            Productos, Admin
└── qa/                 scripts de Playwright y capturas
```

## Correr

```bash
# compilar la SPA
cd frontend && npm install && npm run build

# servir todo en un solo origen
cd ../backend && ~/.local/php-static/php -S 127.0.0.1:8081 -t public server.php
```

Abre <http://127.0.0.1:8081/spa/>.

## API

Todas las rutas devuelven `{ok:true,...}` o `{ok:false,error:{code,message}}`.

- `GET /api/session` · `POST /api/login` · `POST /api/logout`
- `GET /api/inicio` — métricas y accesos según rol
- `GET /api/buscar?q=&radio=&orden=&lat=&lng=&per_page=`
- `GET /api/carrito` · `POST /api/carrito/agregar` · `PATCH /api/carrito/item` · `DELETE /api/carrito/item` · `DELETE /api/carrito`
- `GET /api/checkout` · `POST /api/checkout`
- `GET /api/pedidos` · `GET /api/perfil` · `GET /api/productos` · `GET /api/admin`

La sesión es la misma del panel: `Session::iniciar()` sobre HTTP usa la cookie `didi2_sess`, que no colisiona con `__Host-didi2` de producción (HTTPS).

## Diseño

- Tokens en `:root` (color, forma, sombra, curvas de easing) y una sola hoja para todo el sistema.
- Rail oscuro de 236 px con etiquetas; en móvil se convierte en barra inferior.
- Animaciones: entrada escalonada de tarjetas (`--i` + `animation-delay`), transición de ruta con la View Transitions API, cajón con `cubic-bezier(.16,1,.3,1)`, partícula de vuelo al carrito con `element.animate()`, esqueletos con shimmer y rebote del globo.
- Todo respeta `prefers-reduced-motion`.

## Estado

Migrado: sesión, inicio por rol, buscador, carrito con grupos por proveedor y checkout parcial, checkout, pedidos, perfil, catálogo del mayorista y panel de administración.

Pendiente de migrar: finanzas, mensajes, POS/inventario, KYC, ayuda, edición de perfil, detalle de pedido y administración completa (usuarios, reclamos, etc.). El backend PHP conserva esas pantallas y siguen disponibles en el puerto 3110.

## Verificación

`qa/visitar.cjs` recorre los tres roles, mide desbordes y errores de consola y guarda capturas; `qa/checkout.cjs` confirmó un pedido real de punta a punta (el pedido de prueba se borró después y el stock se repuso).
