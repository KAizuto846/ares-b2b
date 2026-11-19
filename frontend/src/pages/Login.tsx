import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useSesion } from '../store/session'
import Icon from '../components/Icon'
import { CampoClave } from './auth/Registro'

/** Marca compacta: se muestra en el panel de arte y, en móvil, dentro del formulario. */
function Marca() {
  return (
    <div className="login__marca">
      <span className="marca__logo login__logo">A</span>
      <span className="login__marca-texto">
        <strong>Ares</strong>
        <span>B2B</span>
      </span>
    </div>
  )
}

export default function Login() {
  const { entrar } = useSesion()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const [recordar, setRecordar] = useState(false)

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setCargando(true)
    try {
      await entrar(email.trim(), password, recordar)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="login">
      <section className="login__arte">
        <Marca />

        <div className="rise" style={{ ['--i' as string]: 1 }}>
          <h1 className="login__titular">Tu tienda abastecida, sin llamadas ni libretas.</h1>
          <ul className="login__lista">
            <li><Icon name="ok" size={17} /> Compara precios de varios proveedores</li>
            <li><Icon name="ok" size={17} /> Arma el carrito y paga en un solo lugar</li>
            <li><Icon name="ok" size={17} /> Sigue cada pedido hasta la entrega</li>
          </ul>
        </div>

        <p className="login__pie-arte">Ares · plataforma mayorista</p>
      </section>

      <section className="login__form">
        <form className="login__caja rise" onSubmit={enviar} style={{ ['--i' as string]: 2 }}>
          <div className="login__marca-movil">
            <Marca />
          </div>

          <header className="login__cab">
            <h1>Entra a tu cuenta</h1>
            <p>Correo y contraseña de tu negocio.</p>
          </header>

          <div className="login__campos">
            {error && <div className="aviso aviso--error" role="alert">{error}</div>}

            <label className="campo">
              <span>Correo</span>
              <input
                type="email"
                autoComplete="email"
                inputMode="email"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@negocio.mx"
              />
            </label>

            <CampoClave
              id="clave"
              etiqueta="Contraseña"
              valor={password}
              alCambiar={setPassword}
              autoComplete="current-password"
              placeholder="••••••••"
            />

            <label className="login__recordar" htmlFor="recordar">
              <input
                id="recordar"
                type="checkbox"
                checked={recordar}
                onChange={(e) => setRecordar(e.target.checked)}
              />
              <span>Mantener sesión</span>
            </label>
          </div>

          <div className="login__acciones">
            <button className="btn btn--bloque login__btn" type="submit" disabled={cargando}>
              {cargando ? 'Entrando…' : 'Entrar'}
            </button>
          </div>

          <div className="login__enlaces">
            <Link className="login__enlace login__enlace--fuerte" to="/registro">Crear cuenta</Link>
            <Link className="login__enlace" to="/recuperar">Olvidé mi contraseña</Link>
          </div>

          <footer className="login__legal">
            <Link to="/terminos">Términos</Link>
            <span aria-hidden="true">·</span>
            <Link to="/privacidad">Aviso de privacidad</Link>
          </footer>
        </form>
      </section>
    </div>
  )
}
