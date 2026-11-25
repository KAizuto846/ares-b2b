# Guion de defensa — Ares (5–7 min)

## 1. El problema (30 s)
Los comercios de barrio compran a mayoristas por WhatsApp: precios en fotos,
stock que ya no existe, pedidos que se pierden. Ares conecta a los dos lados
en una sola plataforma: catálogo real, pedidos trazables y reparto.

## 2. Arquitectura (60 s)
- **Frontend**: SPA en React 19 + TypeScript + Vite + React Router.
- **Backend**: API JSON en PHP por módulos (`app/Api/*.php`) sobre MySQL,
  con el dominio de negocio ya probado (precios por escala, IVA, stock reservado,
  checkout idempotente).
- **Sesión**: cookie httponly + Argon2id para contraseñas.
- Demo en vivo: login comercio → buscar → carrito → checkout → mayorista ve el pedido.

## 3. Temas del curso aplicados (90 s) — criterio 2
- HTML5 semántico (header/nav/main/section/footer) y accesibilidad (aria, foco).
- CSS3 con Flexbox/Grid y design system propio; responsive de 360 a 1440 px.
- JS ES6+, módulos, async/await con Fetch encapsulado en `lib/api-*.ts`.
- React: componentes, hooks (useState/useEffect/useRef), React Router, Context para sesión.
- API externa: Leaflet + OpenStreetMap (mapa de cobertura) y Google Maps (ruta repartidor).
- Backend: PHP + MySQL, CRUD completo, API REST, validación y saneamiento.
- Seguridad: **JWT (HS256) con access + refresh token**, 100% prepared statements,
  Argon2id, cookies httponly como respaldo.

## 4. Aportaciones propias (60 s) — criterio 3
- POS con cobro por tarjeta demo (validación Luhn, marca, CVV, vencimiento).
- Muro de anuncios pagados con orden por monto y fecha, caducidad automática
  y panel deslizante con borrador que sobrevive al cierre.
- Módulo de reparto con asignación y seguimiento.
- Modo oscuro completo y PWA instalable.

## 5. Calidad (45 s) — criterio 5
- 15 pruebas unitarias en Vitest (`npm test`), CI en GitHub Actions
  (tsc + tests + build en cada push), QA con Playwright: 52 rutas sin problemas.
- Repo: github.com/KAizuto846/ares-b2b

## 6. Cierre (15 s)
Ares demuestra el ciclo completo: del catálogo del mayorista al pedido del
comercio y la entrega del repartidor, con calidad verificada por pruebas.

## Preguntas probables
- **¿Por qué PHP y no Node?** El dominio de negocio ya estaba probado en PHP;
  lo reutilizo y solo expongo la API JSON. Menos riesgo, más valor.
- **¿Cómo evitas SQL injection?** Prepared statements en todas las consultas
  dinámicas; las estáticas (catálogos) no reciben input.
- **¿Y si dos comercios compran el último stock?** Reserva de stock en el
  checkout idempotente: la segunda petición obtiene 409 con el stock actual.
- **¿Cómo probaste?** Unitarias (Vitest), paridad visual (52 rutas escritorio+móvil),
  humo de interacción y auditorías con Playwright.
