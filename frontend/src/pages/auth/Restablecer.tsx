import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Icon from '../../components/Icon'
import { apiAuth, medirPassword } from '../../lib/api-auth'
import { CampoClave } from './Registro'

/**
 * Nueva contraseña. Acepta el token del enlace (viene en ?token=) o el código
 * de 6 dígitos del SMS; el backend distingue uno de otro por la forma.
 */
export default function Restablecer() {
  const [params] = useSearchParams()
  const tokenUrl = params.get('token') ?? ''
  const identificadorUrl = params.get('identificador') ?? ''

  const [clave, setClave] = useState(tokenUrl)
  const [identificador, setIdentificador] = useState(identificadorUrl)
  const [password, setPassword] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const [listo, setListo] = useState('')

  const fuerza = medirPassword(password)
  const esCodigo = useMemo(() => /^\d{6}$/.test(clave.trim()), [clave])

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const limpio = clave.trim()
    if (limpio === '') {
      setError('Pega el enlace del correo o escribe el código de 6 dígitos.')
      return
    }
    if (fuerza.faltas.length > 0) {
      setError(`A la contraseña le falta ${fuerza.faltas.join(', ')}.`)
      return
    }
    if (password !== confirmacion) {
      setError('Las dos contraseñas no coinciden.')
      return
    }
    if (esCodigo && identificador.trim() === '') {
      setError('Con el código de 6 dígitos también hace falta tu correo o teléfono.')
      return
    }

    const enlace = /token=([^&\s]+)/.exec(limpio)

    setCargando(true)
    try {
      const r = await apiAuth.restablecer({
        password,
        ...(enlace !== null
          ? { token: decodeURIComponent(enlace[1]) }
          : esCodigo
            ? { codigo: limpio, identificador: identificador.trim() }
            : { token: limpio }),
      })
      setListo(r.mensaje)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setCargando(false)
    }
  }

  if (listo !== '') {
    return (
      <div className="login auth-pantalla">
        <section className="login__form auth-pantalla__form">
          <div className="login__caja auth-tarjeta rise">
            <div className="auth-hecho">
              <span className="auth-hecho__icono auth-hecho__icono--ok"><Icon name="ok" size={26} /></span>
              <h1>Contraseña actualizada</h1>
              <p>{listo}</p>
            </div>
            <Link className="btn btn--bloque" to="/login">Entrar con mi contraseña nueva</Link>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="login auth-pantalla">
      <section className="login__form auth-pantalla__form">
        <form className="login__caja auth-tarjeta rise" onSubmit={enviar} noValidate>
          <div className="auth-cab">
            <span className="marca__logo" style={{ width: 40, height: 40 }}><img src="/spa/favicon.svg" alt="Ares" width="20" height="20" /></span>
            <div>
              <h1>Elige una contraseña nueva</h1>
              <p>Al guardarla se cierran las demás sesiones abiertas.</p>
            </div>
          </div>

          {error && (
            <div className="aviso aviso--error" role="alert">
              <span>{error}</span>
            </div>
          )}

          {tokenUrl !== '' && (
            <div className="aviso aviso--info">
              <span>Reconocimos el enlace del correo. Solo escribe tu contraseña nueva.</span>
            </div>
          )}

          <label className="campo">
            <span>Código o enlace</span>
            <input
              type="text"
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              placeholder="123456 o el enlace del correo"
              autoComplete="one-time-code"
              spellCheck={false}
              required
            />
            <span className="auth-pista">
              {esCodigo
                ? 'Código de 6 dígitos: abajo necesitamos tu correo o teléfono.'
                : 'Puedes pegar el enlace completo del correo: sacamos el token solos.'}
            </span>
          </label>

          <label className="campo">
            <span>Correo o teléfono</span>
            <input
              type="text"
              value={identificador}
              onChange={(e) => setIdentificador(e.target.value)}
              autoComplete="username"
              placeholder="tu@correo.com o 5512345678"
              required={esCodigo}
            />
            <span className="auth-pista">
              {esCodigo ? 'Con el código hace falta para saber de qué cuenta es.' : 'Opcional si usas el enlace.'}
            </span>
          </label>

          <CampoClave
            id="nueva-clave"
            etiqueta="Contraseña nueva"
            valor={password}
            alCambiar={setPassword}
            placeholder="Mínimo 12 caracteres"
            pista="Usa mayúsculas, números y un símbolo."
            autoFocus
          />

          <div className={`auth-fuerza auth-fuerza--${fuerza.nivel}`} aria-hidden="true">
            <i /><i /><i /><i />
          </div>
          <span className="auth-fuerza__texto">
            {password === '' ? 'Seguridad de la contraseña: sin evaluar' : `Seguridad: ${fuerza.etiqueta}`}
            {password !== '' && fuerza.faltas.length > 0 ? ` · falta ${fuerza.faltas.join(', ')}` : ''}
          </span>

          <CampoClave
            id="nueva-clave-2"
            etiqueta="Repite la contraseña"
            valor={confirmacion}
            alCambiar={setConfirmacion}
            placeholder="Otra vez"
          />
          {confirmacion !== '' && confirmacion !== password && (
            <span className="auth-campo-error">Las dos contraseñas no coinciden.</span>
          )}

          <button className="btn btn--bloque" type="submit" disabled={cargando}>
            {cargando ? 'Guardando…' : 'Guardar contraseña'}
          </button>

          <p className="auth-pie">
            <Link to="/recuperar">Pedir otro código</Link>
            {' · '}
            <Link to="/login">Volver a entrar</Link>
          </p>
        </form>
      </section>
    </div>
  )
}
