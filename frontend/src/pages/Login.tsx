import { useState } from 'react'
import { useSesion } from '../store/session'
import Icon from '../components/Icon'

export default function Login() {
  const { entrar } = useSesion()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setCargando(true)
    try {
      await entrar(email.trim(), password)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="login">
      <section className="login__arte">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="marca__logo" style={{ width: 40, height: 40 }}>A</span>
          <span className="marca__texto" style={{ display: 'grid' }}>
            <strong style={{ color: '#fff' }}>Ares</strong>
            <span style={{ color: '#8fa79a', fontSize: 11, letterSpacing: '.08em' }}>B2B</span>
          </span>
        </div>

        <div className="rise" style={{ ['--i' as string]: 1 }}>
          <h1 className="login__titular">Tu tienda abastecida, sin llamadas ni libretas.</h1>
          <div className="login__lista">
            <span><Icon name="ok" size={17} /> Compara precios de varios proveedores</span>
            <span><Icon name="ok" size={17} /> Arma el carrito y paga en un solo lugar</span>
            <span><Icon name="ok" size={17} /> Sigue cada pedido hasta la entrega</span>
          </div>
        </div>

        <p style={{ color: '#7f9889', fontSize: 12.5 }}>Ares · plataforma mayorista</p>
      </section>

      <section className="login__form">
        <form className="login__caja rise" onSubmit={enviar} style={{ ['--i' as string]: 2 }}>
          <div>
            <h1 style={{ fontSize: 28 }}>Entra a tu cuenta</h1>
            <p style={{ color: 'var(--muted)', marginTop: 6, fontSize: 14 }}>Correo y contraseña de tu negocio.</p>
          </div>

          {error && <div className="aviso aviso--error">{error}</div>}

          <label className="campo">
            <span>Correo</span>
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@negocio.mx" />
          </label>

          <label className="campo">
            <span>Contraseña</span>
            <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </label>

          <button className="btn btn--bloque" type="submit" disabled={cargando}>
            {cargando ? 'Entrando…' : 'Entrar'}
          </button>

          <p style={{ fontSize: 12.5, color: 'var(--muted)', textAlign: 'center' }}>
            Demo: comercio@didi2.mx · comercio123
          </p>
        </form>
      </section>
    </div>
  )
}
