import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Proveedor, useSesion } from './store/session'
import Shell from './components/Shell'
import Login from './pages/Login'
import Registro from './pages/auth/Registro'
import Recuperar from './pages/auth/Recuperar'
import Restablecer from './pages/auth/Restablecer'
import Verificar from './pages/auth/Verificar'
import Legales from './pages/Legales'
import Inicio from './pages/Inicio'
import Buscar from './pages/Buscar'
import Carrito from './pages/Carrito'
import Checkout from './pages/Checkout'
import Pedidos from './pages/Pedidos'
import PedidoDetalle from './pages/PedidoDetalle'
import Perfil from './pages/Perfil'
import EditarPerfil from './pages/perfil/Editar'
import Privacidad from './pages/perfil/Privacidad'
import Ajustes from './pages/perfil/Ajustes'
import Seguridad from './pages/perfil/Seguridad'
import Permisos from './pages/perfil/Permisos'
import Ayuda from './pages/perfil/Ayuda'
import Kyc from './pages/perfil/Kyc'
import Finanzas from './pages/Finanzas'
import Factura from './pages/Factura'
import Facturacion from './pages/Facturacion'
import Portafolio from './pages/Portafolio'
import Agendar from './pages/Agendar'
import Mensajes from './pages/Mensajes'
import Productos from './pages/Productos'
import ProductoFormulario from './pages/productos/Formulario'
import ProductoImportar from './pages/productos/Importar'
import Caja from './pages/pos/Caja'
import Inventario from './pages/pos/Inventario'
import Ventas from './pages/pos/Ventas'
import Corte from './pages/pos/Corte'
import Clientes from './pages/pos/Clientes'
import Ticket from './pages/pos/Ticket'
import Repartidor from './pages/Repartidor'
import AdminPanel from './pages/admin/Panel'
import AdminUsuarios from './pages/admin/Usuarios'
import AdminUsuarioDetalle from './pages/admin/UsuarioDetalle'
import AdminKyc from './pages/admin/Kyc'
import AdminReclamos from './pages/admin/Reclamos'
import AdminParametros from './pages/admin/Parametros'
import AdminParametroHistorial from './pages/admin/ParametroHistorial'
import AdminPostMvp from './pages/admin/PostMvp'
import Tracking from './pages/Tracking'
import PagoSimulado from './pages/PagoSimulado'
import ProveedorFicha from './pages/Proveedor'

function Cargando() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <div style={{ display: 'grid', gap: 12, justifyItems: 'center' }}>
        <div className="marca__logo" style={{ width: 44, height: 44, fontSize: 18 }}>A</div>
        <span style={{ color: 'var(--muted)', fontSize: 13 }}>Cargando Ares…</span>
      </div>
    </div>
  )
}

function Gate() {
  const { usuario, rol, cargando } = useSesion()
  if (cargando) return <Cargando />

  if (!usuario) {
    return (
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
    )
  }

  const esComercio = rol === 'comercio'
  const esMayorista = rol === 'mayorista'
  const esRepartidor = rol === 'repartidor'
  const esAdmin = !!rol && rol.startsWith('admin')
  const solo = (ok: boolean, nodo: ReactNode) => (ok ? nodo : <Navigate to="/" replace />)

  return (
    <Shell>
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
