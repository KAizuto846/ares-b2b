import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Icon from '../../components/Icon'
import { apiAuth } from '../../lib/api-auth'
import type { EstadoVerificacion } from '../../lib/api-auth'

type Fase = 'inicial' | 'cargando' | EstadoVerificacion

const TITULOS: Record<EstadoVerificacion, string> = {
  ok: 'Cuenta confirmada',
  caducado: 'El enlace caducó',
  invalido: 'Enlace no válido',
}

const ICONOS: Record<EstadoVerificacion, string> = { ok: 'ok', caducado: 'reloj', invalido: 'alerta' }

/**
 * Confirmación de correo. Llega desde el enlace del correo con ?token=...
 * y pinta el estado que responde el backend (ok | caducado | invalido).
 */
export default function Verificar() {
  const [params] = useSearchParams()
  const tokenUrl = params.get('token') ?? ''

  const [token, setToken] = useState(tokenUrl)
  const [fase, setFase] = useState<Fase>('inicial')
  const [mensaje, setMensaje] = useState('')
  const [error, setError] = useState('')
  const yaConsultado = useRef('')

  const consultar = useCallback(async (valor: string) => {
    if (valor === '') {
      setError('Escribe el token o abre el enlace completo del correo.')
      return
    }

    setError('')
    setFase('cargando')
    try {
      const r = await apiAuth.verificar(valor)
      setFase(r.estado)
      setMensaje(r.mensaje)
    } catch (err) {
      setFase('inicial')
      setError((err as Error).message)
    }
  }, [])

  useEffect(() => {
    // StrictMode monta el efecto dos veces: sin esta guarda el segundo intento
    // gastaría el token de un solo uso y la pantalla diría «caducado».
    if (tokenUrl === '' || yaConsultado.current === tokenUrl) return
    yaConsultado.current = tokenUrl
    void consultar(tokenUrl)
  }, [tokenUrl, consultar])

  const confirmada = fase === 'ok'
  const fallida = fase === 'caducado' || fase === 'invalido'
  const consultando = fase === 'cargando'

  return (
    <div className="login auth-pantalla">
      <section className="login__form auth-pantalla__form">
        <div className="login__caja auth-tarjeta rise">
          {consultando && (
            <div className="auth-hecho">
              <span className="auth-hecho__icono"><Icon name="reloj" size={26} /></span>
              <h1>Confirmando tu correo…</h1>
              <p>Estamos validando el enlace. Tarda un segundo.</p>
            </div>
          )}

          {confirmada && (
            <>
              <div className="auth-hecho">
                <span className="auth-hecho__icono auth-hecho__icono--ok"><Icon name="ok" size={26} /></span>
                <h1>{TITULOS.ok}</h1>
                <p>{mensaje}</p>
              </div>
              <Link className="btn btn--bloque" to="/login">Entrar a mi cuenta</Link>
            </>
          )}

          {fallida && (
            <>
              <div className="auth-hecho">
                <span className="auth-hecho__icono auth-hecho__icono--malo">
                  <Icon name={ICONOS[fase as EstadoVerificacion]} size={26} />
                </span>
                <h1>{TITULOS[fase as EstadoVerificacion]}</h1>
                <p>{mensaje}</p>
              </div>
              <Link className="btn btn--bloque" to="/login">Entrar de todos modos</Link>
              <Link className="btn btn--claro btn--bloque" to="/recuperar">Pedir un enlace nuevo</Link>
            </>
          )}

          {(fase === 'inicial' || error !== '') && (
            <form
              className="auth-form"
              onSubmit={(e) => { e.preventDefault(); void consultar(token.trim()) }}
            >
              <div className="auth-hecho">
                <span className="auth-hecho__icono"><Icon name="correo" size={26} /></span>
                <h1>Confirmar correo</h1>
                <p>
                  Abre el enlace que te enviamos al registrarte. Si lo perdiste, pega aquí el token
                  o vuelve a entrar: tu cuenta ya funciona.
                </p>
              </div>

              {error && (
                <div className="aviso aviso--error" role="alert">
                  <span>{error}</span>
                </div>
              )}

              <label className="campo">
                <span>Token del enlace</span>
                <input
                  type="text"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Pega el enlace completo o solo el token"
                  spellCheck={false}
                  autoComplete="off"
                />
                <span className="auth-pista">También aceptamos el enlace completo: sacamos el token solos.</span>
              </label>

              <button className="btn btn--bloque" type="submit">Confirmar</button>

              <p className="auth-pie">
                <Link to="/login">Entrar</Link>
                {' · '}
                <Link to="/registro">Crear cuenta</Link>
              </p>
            </form>
          )}
        </div>
      </section>
    </div>
  )
}
