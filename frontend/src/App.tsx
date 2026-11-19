import { Navigate, Route, Routes } from 'react-router-dom'
import { Proveedor, useSesion } from './store/session'
import Shell from './components/Shell'
import Login from './pages/Login'
import Inicio from './pages/Inicio'
import Buscar from './pages/Buscar'
import Checkout from './pages/Checkout'
import Pedidos from './pages/Pedidos'
import Perfil from './pages/Perfil'
import Productos from './pages/Productos'
import Admin from './pages/Admin'

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
  if (!usuario) return <Login />

  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Inicio />} />
        <Route path="/buscar" element={rol === 'comercio' ? <Buscar /> : <Navigate to="/" replace />} />
        <Route path="/checkout" element={rol === 'comercio' ? <Checkout /> : <Navigate to="/" replace />} />
        <Route path="/pedidos" element={<Pedidos />} />
        <Route path="/perfil" element={<Perfil />} />
        <Route path="/productos" element={<Productos />} />
        <Route path="/admin" element={rol?.startsWith('admin') ? <Admin /> : <Navigate to="/" replace />} />
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
