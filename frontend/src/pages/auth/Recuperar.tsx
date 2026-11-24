import { useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../components/Icon'
import { apiAuth } from '../../lib/api-auth'
import type { RecuperarRespuesta } from '../../lib/api-auth'

/**
 * Solicitud de recuperación. El backend responde siempre lo mismo exista o no
 * la cuenta, así que la pantalla no debe insinuar si el correo está dado de
 * alta: solo confirma que, si existe, salieron las instrucciones.
 */
export default function Recuperar() {
  const [identificador, setIdentificador] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const [respuesta, setRespuesta] = useState<RecuperarRespuesta | null>(null)

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (identificador.trim() === '') {
      setError('Escribe tu correo o tu teléfono.')
      return
    }

    setCargando(true)
    try {
      setRespuesta(await apiAuth.recuperar(identificador.trim()))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="login auth-pantalla">
      <section className="login__form auth-pantalla__form">
        <form className="login__caja auth-tarjeta rise" onSubmit={enviar} noValidate>
          <div className="auth-cab">
            <span className="marca__logo" style={{ width: 40, height: 40 }}><img src="/spa/favicon.svg" alt="Ares" width="20" height="20" /></span>
            <div>
              <h1>Recupera tu cuenta</h1>
              <p>Te mandamos un enlace por correo y un código por SMS.</p>
            </div>
          </div>

          {error && (
            <div className="aviso aviso--error" role="alert">
              <span>{error}</span>
            </div>
          )}

          {respuesta && (
            <div className="aviso aviso--ok" role="status">
              <span>{respuesta.mensaje}</span>
            </div>
          )}

          {respuesta && (respuesta.token || respuesta.codigo) && (
            <div className="auth-dev">
              <p className="auth-dev__titulo">
                <Icon name="llave" size={16} /> Modo local (sin correo ni SMS)
              </p>
              {respuesta.codigo && (
                <p>
                  Código SMS: <code className="auth-codigo">{respuesta.codigo}</code>
                </p>
              )}
              {respuesta.token && (
                <p className="auth-dev__token">
                  Token: <code>{respuesta.token}</code>
                </p>
              )}
              {respuesta.enlace && (
                <Link className="btn btn--claro btn--bloque" to={`${respuesta.enlace}&identificador=${encodeURIComponent(identificador.trim())}`}>
                  Abrir el enlace de restablecimiento
                </Link>
              )}
            </div>
          )}

          <label className="campo">
            <span>Correo o teléfono</span>
            <input
              type="text"
              value={identificador}
              onChange={(e) => setIdentificador(e.target.value)}
              autoComplete="username"
              placeholder="tu@correo.com o 5512345678"
              autoFocus
              required
            />
            <span className="auth-pista">
              Si la cuenta existe, las instrucciones llegan en menos de un minuto. Caducan a los 30 minutos.
            </span>
          </label>

          <button className="btn btn--bloque" type="submit" disabled={cargando}>
            {cargando ? 'Enviando…' : 'Enviar instrucciones'}
          </button>

          {respuesta && (
            <Link className="btn btn--claro btn--bloque" to="/restablecer">
              Ya tengo un código
            </Link>
          )}

          <p className="auth-pie">
            <Link to="/login">Volver a entrar</Link>
            {' · '}
            <Link to="/registro">Crear cuenta</Link>
          </p>
        </form>
      </section>
    </div>
  )
}
