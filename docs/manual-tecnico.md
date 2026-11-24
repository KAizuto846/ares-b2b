# Manual técnico — Ares · Plataforma B2B de compras de mayoreo

> Documento de arquitectura, decisiones de diseño y procesos operativos.
> Su propósito es doble: servir de guía de mantenimiento y **demostrar que se sabe
> cómo funciona cada pieza**, incluidos los procesos hipotéticos marcados como tal.

---

## 1. Visión general

Ares es una plataforma B2B de mayoreo con dos mercados conectados:

```
COMERCIO (comprador)  ──compra──▶  MAYORISTA (vendedor)
        ▲                                 ▲
        │        REPARTIDOR entrega       │
        └────────────────────────────────┘
                    ADMIN supervisa todo
```

- **Frontend**: SPA React 19 + TypeScript (Vite) servida en `/spa`.
- **Backend**: PHP 8 sin framework, arquitectura modular `app/Modules/*` + API JSON `app/Api/*`.
- **Base de datos**: MySQL/MariaDB, migraciones numeradas en `database/migrations/`.
- **Autenticación**: sesiones PHP con cookies `same-origin`; CSRF por Origin; control de roles por módulo.
- **Sin frameworks de backend**: cada módulo resuelve sus rutas y devuelve el control
  (`return`) si la ruta no es suya — el despacho es un `glob()` ordenado.

### Convención de módulos (backend)

| Carpeta | Rol |
|---|---|
| `app/Core/` | PDO, sesión, router, caché, Geo, auditoría, validador, **almacenamiento S3-compatible** |
| `app/Modules/` | Lógica de negocio (22 módulos, uno por dominio) |
| `app/Api/` | Controladores JSON que exponen los módulos a la SPA |
| `public/api.php` | Despacho: sesión, CORS/Origin, cuerpo JSON, incluye módulos |
| `bin/worker.php` | Tareas programadas: expiraciones, notificaciones, liquidaciones |

### Convención de la SPA

| Carpeta | Rol |
|---|---|
| `pages/` | Una pantalla por ruta (28 archivos + subcarpetas) |
| `lib/api-*.ts` | Clientes HTTP tipados por módulo |
| `store/session.tsx` | Contexto React: usuario, rol, carrito, avisos, **onboarding pendiente** |
| `styles/` | CSS plano con tokens en `app.css`; módulos en `mod-*.css`; capa de cierre en `gate.css` |

---

## 2. Flujo financiero (RN-09) y desglose de pagos

### ¿Cómo se desglosa un pago en línea?

Todo el dinero pasa por `pagos` (una fila por intención de cobro) y el pedido
por el autómata de estados de `PedidoService`:

```
borrador → pendiente_pago → (webhook pasarela)
         → pago_autorizado → pendiente_aceptacion → aceptado → preparando
         → listo_para_recoger → buscando_repartidor → repartidor_asignado
         → en_recoleccion → en_camino → en_puerta → entregado → completado/recibido
```

Al **capturar** el pago (mayorista acepta), `PagoService::registrarAsiento()`
escribe en `contabilidad_asientos` el desglose completo, derivado de
`calcularDispersion()` (RN-09):

| Columna | Significado |
|---|---|
| `subtotal` | Importe de los productos |
| `iva` | 16% (incluido o añadido según ajustes del POS/catálogo) |
| `envio` | Tarifa logística (`TarifaService`) |
| `comision` | Suma de las 4 comisiones (mayorista, logística, servicio, pasarela) |
| `neto_mayorista` | `subtotal + iva − comision_mayorista` — **lo que se le deposita** |
| `total` | Lo cobrado al comercio |

La **invariante contable** que `calcularDispersion` verifica en cada cálculo:

```
disp_mayorista + disp_repartidor + disp_plataforma + comision_pasarela = total_cobrado
```

Si no cuadra, rechaza el cálculo: nunca se dispersa un centavo de más.

El libro contable se consulta en `GET /api/finanzas/contabilidad`
(solo `admin_total`/`admin_finanzas`) y se pinta en el panel de administración.

### CFDI y Hacienda digital — ¿qué es y cómo se manejan?

**Qué es**: el CFDI 4.0 es la factura electrónica que el SAT exige en México.
Cada documento lleva: RFC emisor/receptor, régimen fiscal, uso de CFDI,
conceptos (productos), timbre fiscal (UUID) y sello digital.

**Cómo lo maneja Ares**:

1. **Datos fiscales** (pantalla Facturación): el usuario guarda RFC, razón
   social, régimen y uso CFDI. El backend valida contra los catálogos del SAT
   (`sat_regimenes_fiscales`, `sat_usos_cfdi`) — `FacturacionService`.
2. **Solicitud**: el comercio marca un pedido cerrado como "por facturar" →
   `facturas` con estado `generada`.
3. **Timbrado** *(proceso hipotético en modo demo)*: el mayorista abre la
   **cola de timbrado** y timbra con un clic. El endpoint asigna un UUID
   determinista y estado `timbrada`. **Con un PAC real** (Proveedores
   Autorizados de Certificación: Solución Facturable, Finkok…) este punto
   se sustituye por la llamada al servicio del PAC y llega el XML firmado.
4. **Hoja imprimible** con la representación del CFDI (`Factura.tsx`).

**CSD y e.firma** *(hipotético, modo demo)*: el CSD (Certificado de Sello
Digital) es el archivo `.cer` público + llave `.key` que el SAT emite para
facturar. Ares registra **solo metadatos** del certificado (número, huella,
vigencia) en `facturacion_csd`. La llave privada **jamás** se sube a la
plataforma: se usa localmente en el servidor del mayorista o en el PAC.
La e.firma no se maneja: es personal del dueño para acceder al SAT.

---

## 3. Logística: repartidores, flotilla y cálculo de sueldo

### Asignación por rondas (RN-07)

1. El pedido llega a `buscando_repartidor` → `AsignacionService::lanzarRonda()`.
2. Ronda 1: 3 candidatos más cercanos con vehículo compatible (peso/volumen/refrigeración), radio 5 km, 60 s para aceptar.
3. Nadie acepta → ronda 2 (8 km) → ronda 3 (12 km).
4. Ronda 3 agotada: aviso a administración + **rescate por red externa** (abajo).

Con `reparto.auto_dispatch = 1` el sistema asigna directamente al mejor
candidato sin esperar las rondas.

### Rutas multi-parada (consolidación)

`ConsolidacionService` agrupa envíos del mismo repartidor cuya última parada
queda a ≤2 km del origen nuevo, calcula el **orden óptimo de visita** con
OSRM Trip Planning (`/trip/v1/driving`, self-hosted en producción) y aplica
un **descuento del 20%** (parámetro `reparto.descuento_consolidacion`) al
comercio por compartir ruta. El repartidor ve "Tu ruta" con paradas
numeradas y el comercio "tu entrega es la parada N de M".

### Comunicación a terceros y subcontratación (RN-07b)

Cuando la flota propia no responde, `RescateRedService` llama a una
**red externa** mediante la interfaz `RedEntregaInterface`:

```
RedEntregaInterface (cotizar/crear/estado/cancelar)
├── RedDemo         ← modo desarrollo/QA sin credenciales
└── RedUberDirect   ← API de Uber Direct (OAuth client-credentials)
```

El flujo: cotiza → si el costo cabe en `red.tope_costo_extra` → crea la
entrega → el envío pasa a `red_externa` → los estados llegan por **webhook
firmado** (`/api/logistica/red/webhook`, HMAC SHA-256) y se mapean a los
estados del pedido. Esto materializa la **subcontratación a una empresa**:
la red externa cobra por envío y la plataforma le traslada el costo.

### Cálculo de sueldo del repartidor

- En vivo: `finanzas` de repartidor muestra ganancias de hoy, km y tarifa promedio.
- **Liquidación semanal**: el worker (lunes) genera `liquidaciones` con la
  suma de entregas confirmadas de la semana anterior (`entregas`, `km_recorridos`,
  `ganancias`). El repartidor consulta sus extractos en
  `GET /api/repartidor/liquidaciones`; la plataforma marca el pago.

### Limitar el rango de entrega

Tres capas:
1. **Búsqueda**: geocerca con radio máx. 30 km y validación de origen contra `zonas_cobertura` (RN-15).
2. **Ofertas**: rondas con radios 5/8/12 km.
3. **Destino** (nuevo): `prepararEnvio()` rechaza pedidos cuyo destino no cae en
   ninguna zona activa — un pedido nunca se cobra si no puede entregarse.

---

## 4. Marco legal y de confianza

### Aceptación de términos versionada

- `terminos_versiones` guarda cada versión publicada; `terminos_aceptaciones`
  registra usuario + versión + IP.
- El alta registra la aceptación automáticamente dentro de la transacción de
  registro. La SPA consulta la versión vigente en `GET /auth/terminos`.

### Limitar la venta de productos ilícitos

`productos_prohibidos` mantiene patrones bloqueados (armas, pirotecnia,
tabaco, alcohol, medicamentos sin receta…). `ProductoService::crear()`
compara nombre+descripción contra la lista y **rechaza** el alta con el
motivo. La lista es gestionable en la base y extendible por admin.

### API de autenticación de personas (KYC)

Ares tiene KYC propio: documentos obligatorios por rol
(`KycService::REQUERIDOS` — constancia SAT y comprobante para mayorista;
identificación, licencia, antecedentes, selfie y tarjeta de circulación para
repartidor) con revisión por admin.

**Verificación externa** *(proceso hipotético en modo demo)*: al subir
identificación o selfie se dispara `VerificacionExtService` con la interfaz
`VerificadorIdentidadInterface`:

```
VerificadorDemo  ← coincide si el archivo existe y es legible (demo)
Idwall / InCode  ← integración real: misma interfaz, credenciales en .env
```

El resultado (`coincide/no_coincide` + puntaje) queda en
`kyc_verificaciones_ext` como apoyo al revisor humano: **no aprueba solo**,
acelera la decisión. Esto responde a la "problemática actual con términos y
condiciones": el consentimiento del tratamiento de datos biométricos se
recoge en Privacidad (módulo existente) y la aceptación queda versionada.

---

## 5. Infraestructura de archivos (S3)

**Implementar un S3** se resuelve con `App\Core\AlmacenamientoInterface`:

```
AlmacenamientoInterface (guardar/leer/url/borrar)
├── AlmacenamientoLocal  ← storage/<bucket>/<clave> (default)
└── AlmacenamientoS3     ← MinIO o AWS vía Signature V4 puro (sin SDK)
```

- **MinIO self-hosted** (recomendado): `docker run minio/minio server /data`
  en `127.0.0.1:9000`; credenciales en `.env` (`ALMACENAMIENTO_S3_*`).
- La selección: `ALMACENAMIENTO=local|s3`.
- Todo objeto queda registrado en `archivos_objetos` (bucket, clave, mime,
  tamaño, almacén) para auditoría y limpieza.
- Las URLs de S3 son **firmadas** (presigned GET, expiran en 5 min).

Para migrar a S3 real (AWS) no se cambia código: solo el endpoint y las
credenciales.

---

## 6. Producto: Premium, banners y anuncios

### Función Premium

- `planes` con feature flags JSON (`max_productos`, `destacado`, `analiticas`, `banner`).
- `suscripciones` (una vigente por usuario) activada en `POST /planes/suscribir`
  con **cobro simulado** por la pasarela de pruebas — mismo flujo que el
  cobro de pedidos (`PagoService`), lista para pasarela real.
- La pantalla **Planes** (`/planes`) muestra el catálogo y el estado.
- Los flags se leen desde el backend al publicar productos (tope por plan) y
  en el buscador (destacado).

### Banners en el explore

`banners` (título, texto, color, href, vigencia, orden) gestionables desde la
base; el explore los pinta como tarjetas de degradé arriba de las métricas
(`GET /api/banners`).

### Anuncios personalizados en ventana aparte

- `anuncios` con segmentación por rol y **control de frecuencia**
  (`max_impresiones`), `anuncio_impresiones` registra cada vista y clic.
- La SPA pide `GET /anuncios` al navegar; si hay uno elegible **abre una
  ventana aparte** (modal) 900 ms después, solo en Inicio para no interrumpir
  operaciones. Cerrar marca impresión; el CTA marca clic.

### Historial → encuesta de preferencias

El onboarding del comercio tiene 3 pasos: dirección de entrega → **encuesta
de categorías de interés** (`usuario_preferencias_categorias`) → horario.
Las preferencias llegan en `/explorar` y personalizarán el Inicio
(widget "Según tus intereses") y el orden del buscador.

---

## 7. Procesos hipotéticos: qué está en demo y qué falta para producción

| Proceso | Estado en demo | Para producción se necesita |
|---|---|---|
| Timbrado CFDI | UUID determinista, cola de timbrado funcional | Contrato con PAC, CSD del mayorista, manejo XML/cadena original |
| Pasarela de pagos | `SimuladoGateway` con webhooks firmados | Contracto Conekta/MercadoPago/Stripe; llaves en `.env` |
| KYC externo | `VerificadorDemo` con puntaje fijo | Idwall/InCode + consentimiento biométrico firmado |
| Red externa de reparto | `RedDemo` + `RedUberDirect` listo | Cuenta Uber Direct, URL pública del webhook con TLS |
| S3 | MinIO opcional; local por defecto | Bucket en producción + ciclo de vida de objetos |
| Correo transaccional | Archivos en `storage/correos` | SMTP o servicio (SendGrid/Postmark) |

Todos comparten el mismo patrón: **interfaz PHP en `Modules/*`, adaptador
demo, credenciales por `.env`, feature flag en parámetros** — conectar el
servicio real es implementar una clase, no rediseñar el flujo.

---

## 8. Entorno de desarrollador

```bash
# Backend
cd backend
cp .env .env.local   # ajustar DB_*, OSRM_URL, ALMACENAMIENTO
php bin/migrate.php  # 33 migraciones
php -S 127.0.0.1:8081 -t public server.php

# Frontend
cd frontend
npm install && npm run build   # escribe en backend/public/spa
npm run dev                    # desarrollo con HMR (proxy a la API)

# Worker (cron * * * * *)
php bin/worker.php
```

Servicios opcionales: `docker run minio` (S3), `docker run osrm` (rutas),
MySQL 8+ con la base `didi2`.

## 9. Pruebas

- **Unitarias** (`backend/tests/Unit/`): Geo (Haversine), validadores, cálculo de tarifas.
- **De integración** (`tests/Integration/`): flujos de checkout, autómata de estados.
- **E2E por agenta** (`qa/`): 90+ capturas de regresión visual de las pantallas.
- Comando: `vendor/bin/phpunit`.

---

*Mantenedor: actualizar este documento al cambiar el autómata de estados, las
comisiones o cualquier proceso hipotético que pase a producción.*
