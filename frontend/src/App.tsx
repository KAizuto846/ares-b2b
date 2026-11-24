import { Suspense, lazy, useEffect } from 'react'
import type { ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Proveedor, useSesion } from './store/session'
import Shell from './components/Shell'
import Login from './pages/Login'

/* Las pantallas internas se cargan por ruta: la entrada pública no arrastra
   el POS, la administración ni el catálogo. */
const Registro = lazy(() => import('./pages/auth/Registro'))
const Recuperar = lazy(() => import('./pages/auth/Recuperar'))
const Restablecer = lazy(() => import('./pages/auth/Restablecer'))
const Verificar = lazy(() => import('./pages/auth/Verificar'))
const Legales = lazy(() => import('./pages/Legales'))
const Onboarding = lazy(() => import('./pages/Onboarding'))
const Inicio = lazy(() => import('./pages/Inicio'))
const Buscar = lazy(() => import('./pages/Buscar'))
const Carrito = lazy(() => import('./pages/Carrito'))
const Checkout = lazy(() => import('./pages/Checkout'))
const Pedidos = lazy(() => import('./pages/Pedidos'))
const PedidoDetalle = lazy(() => import('./pages/PedidoDetalle'))
const Perfil = lazy(() => import('./pages/Perfil'))
const EditarPerfil = lazy(() => import('./pages/perfil/Editar'))
const Planes = lazy(() => import('./pages/Planes'))
const Privacidad = lazy(() => import('./pages/perfil/Privacidad'))
const Ajustes = lazy(() => import('./pages/perfil/Ajustes'))
const Seguridad = lazy(() => import('./pages/perfil/Seguridad'))
const Permisos = lazy(() => import('./pages/perfil/Permisos'))
const Ayuda = lazy(() => import('./pages/perfil/Ayuda'))
const Kyc = lazy(() => import('./pages/perfil/Kyc'))
const Finanzas = lazy(() => import('./pages/Finanzas'))
const Factura = lazy(() => import('./pages/Factura'))
const Facturacion = lazy(() => import('./pages/Facturacion'))
const Portafolio = lazy(() => import('./pages/Portafolio'))
const Agendar = lazy(() => import('./pages/Agendar'))
const Mensajes = lazy(() => import('./pages/Mensajes'))
const Productos = lazy(() => import('./pages/Productos'))
const ProductoFormulario = lazy(() => import('./pages/productos/Formulario'))
const ProductoImportar = lazy(() => import('./pages/productos/Importar'))
const Caja = lazy(() => import('./pages/pos/Caja'))
const Inventario = lazy(() => import('./pages/pos/Inventario'))
const Ventas = lazy(() => import('./pages/pos/Ventas'))
const Corte = lazy(() => import('./pages/pos/Corte'))
const Clientes = lazy(() => import('./pages/pos/Clientes'))
const Ticket = lazy(() => import('./pages/pos/Ticket'))
const Repartidor = lazy(() => import('./pages/Repartidor'))
const AdminPanel = lazy(() => import('./pages/admin/Panel'))
const AdminUsuarios = lazy(() => import('./pages/admin/Usuarios'))
const AdminUsuarioDetalle = lazy(() => import('./pages/admin/UsuarioDetalle'))
const AdminKyc = lazy(() => import('./pages/admin/Kyc'))
const AdminReclamos = lazy(() => import('./pages/admin/Reclamos'))
const AdminParametros = lazy(() => import('./pages/admin/Parametros'))
const AdminParametroHistorial = lazy(() => import('./pages/admin/ParametroHistorial'))
const AdminPostMvp = lazy(() => import('./pages/admin/PostMvp'))
const Tracking = lazy(() => import('./pages/Tracking'))
const PagoSimulado = lazy(() => import('./pages/PagoSimulado'))
const ProveedorFicha = lazy(() => import('./pages/Proveedor'))

function Cargando() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <div style={{ display: 'grid', gap: 12, justifyItems: 'center' }}>
        <div className="marca__logo" style={{ width: 44, height: 44 }}><img src="/spa/favicon.svg" alt="Ares" width="26" height="26" /></div>
        <span style={{ color: 'var(--muted)', fontSize: 13 }}>Cargando Ares…</span>
      </div>
    </div>
  )
}

/* Esqueleto dentro de la página: al cambiar de ruta no se desmonta la navegación. */
function CargandoRuta() {
  return (
    <div className="ruta-cargando" aria-busy="true" aria-live="polite">
      <span className="sr-solo">Cargando pantalla…</span>
      <div className="esqueleto esqueleto--titulo" />
      <div className="esqueleto esqueleto--linea" />
      <div className="esqueleto esqueleto--bloque" />
      <div className="esqueleto esqueleto--bloque" />
    </div>
  )
}

const TITULOS_PUBLICOS: Record<string, string> = {
  '/login': 'Entrar · Ares',
  '/registro': 'Crear cuenta · Ares',
  '/recuperar': 'Recuperar acceso · Ares',
  '/restablecer': 'Nueva contraseña · Ares',
  '/verificar': 'Verificar cuenta · Ares',
  '/terminos': 'Términos y condiciones · Ares',
  '/privacidad': 'Aviso de privacidad · Ares',
}

function TituloPublico() {
  const { pathname } = useLocation()
  useEffect(() => {
    document.title = TITULOS_PUBLICOS[pathname] ?? 'Ares · B2B'
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

function Gate() {
  const { usuario, rol, cargando, onboardingPendiente } = useSesion()
  if (cargando) return <Cargando />

  if (!usuario) {
    return (
      <Suspense fallback={<Cargando />}>
        <TituloPublico />
        <main id="principal">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/registro" element={<Registro />} />
          <Route path="/recuperar" element={<Recuperar />} />
          <Route path="/restablecer" element={<Restablecer />} />
          <Route path="/verificar" element={<Verificar />} />
          <Route path="/terminos" element={<Legales documento="terminos" />} />
          <Route path="/privacidad" element={<Legales documento="privacidad" />} />
          <Route path="*" element={<Login />} />
        </Routes>
        </main>
      </Suspense>
    )
  }

  // Configuración inicial: toda cuenta sin admin aterriza aquí hasta completar
  // (o saltar) los datos de arranque de su rol.
  if (onboardingPendiente === true) {
    return (
      <Suspense fallback={<Cargando />}>
        <TituloPublico />
        <main id="principal">
          <Routes>
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="*" element={<Navigate to="/onboarding" replace />} />
          </Routes>
        </main>
      </Suspense>
    )
  }

  const esComercio = rol === 'comercio'
  const esMayorista = rol === 'mayorista'
  const esRepartidor = rol === 'repartidor'
  const esAdmin = !!rol && rol.startsWith('admin')
  const solo = (ok: boolean, nodo: ReactNode) => (ok ? nodo : <Navigate to="/" replace />)

  return (
    <Shell>
      <Suspense fallback={<CargandoRuta />}>
        <Routes>
          <Route path="/" element={<Inicio />} />
          <Route path="/buscar" element={<Buscar />} />
          <Route path="/proveedor/:uuid" element={<ProveedorFicha />} />

          {/* comercio */}
          <Route path="/carrito" element={solo(esComercio, <Carrito />)} />
          <Route path="/checkout" element={solo(esComercio, <Checkout />)} />
          <Route path="/portafolio" element={solo(esComercio, <Portafolio />)} />
          <Route path="/agendar" element={solo(esComercio, <Agendar />)} />
          <Route path="/pos" element={solo(esComercio, <Caja />)} />
          <Route path="/pos/inventario" element={solo(esComercio, <Inventario />)} />
          <Route path="/pos/ventas" element={solo(esComercio, <Ventas />)} />
          <Route path="/pos/corte" element={solo(esComercio, <Corte />)} />
          <Route path="/pos/clientes" element={solo(esComercio, <Clientes />)} />
          <Route path="/pos/ticket/:uuid" element={solo(esComercio, <Ticket />)} />

          {/* compartidas */}
          <Route path="/pedidos" element={<Pedidos />} />
          <Route path="/pedidos/:uuid" element={<PedidoDetalle />} />
          <Route path="/finanzas" element={<Finanzas />} />
          <Route path="/finanzas/factura/:uuid" element={<Factura />} />
          {/* El comercio factura desde su pestaña de Finanzas, como en el panel PHP. */}
          <Route path="/facturacion" element={esComercio ? <Navigate to="/finanzas?tab=facturacion" replace /> : solo(!esComercio, <Facturacion />)} />
          <Route path="/mensajes" element={<Mensajes />} />
          <Route path="/notificaciones" element={<Navigate to="/mensajes?tab=notificaciones" replace />} />
          <Route path="/perfil" element={<Perfil />} />
          <Route path="/planes" element={<Planes />} />
          <Route path="/perfil/editar" element={<EditarPerfil />} />
          <Route path="/perfil/privacidad" element={<Privacidad />} />
          <Route path="/perfil/ajustes" element={<Ajustes />} />
          <Route path="/perfil/seguridad" element={<Seguridad />} />
          <Route path="/perfil/permisos" element={<Permisos />} />
          <Route path="/kyc" element={<Kyc />} />
          <Route path="/ayuda" element={<Ayuda />} />

          {/* mayorista */}
          <Route path="/productos" element={solo(esMayorista, <Productos />)} />
          <Route path="/productos/nuevo" element={solo(esMayorista, <ProductoFormulario />)} />
          <Route path="/productos/importar" element={solo(esMayorista, <ProductoImportar />)} />
          <Route path="/productos/:uuid" element={solo(esMayorista, <ProductoFormulario />)} />

          {/* repartidor */}
          <Route path="/repartidor" element={solo(esRepartidor, <Repartidor />)} />
          <Route path="/tracking/:uuid" element={<Tracking />} />
          <Route path="/pago/simulado/:referencia" element={<PagoSimulado />} />

          {/* administración */}
          <Route path="/admin" element={solo(esAdmin, <AdminPanel />)} />
          <Route path="/admin/usuarios" element={solo(esAdmin, <AdminUsuarios />)} />
          <Route path="/admin/usuarios/:id" element={solo(esAdmin, <AdminUsuarioDetalle />)} />
          <Route path="/admin/kyc" element={solo(esAdmin, <AdminKyc />)} />
          <Route path="/admin/reclamos" element={solo(esAdmin, <AdminReclamos />)} />
          <Route path="/admin/parametros" element={solo(esAdmin, <AdminParametros />)} />
          <Route path="/admin/parametros/:clave/historial" element={solo(esAdmin, <AdminParametroHistorial />)} />
          <Route path="/admin/postmvp" element={solo(esAdmin, <AdminPostMvp />)} />

          <Route path="/terminos" element={<Legales documento="terminos" />} />
          <Route path="/privacidad" element={<Legales documento="privacidad" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Shell>
  )
}

export default function App() {
  return (
    <Proveedor>
      <Gate />
    </Proveedor>
  )
}
