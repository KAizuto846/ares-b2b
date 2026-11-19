import { useEffect, useState } from 'react'
import { apiPerfil } from '../../lib/api-perfil'
import type { PerfilDetalle } from '../../lib/api-perfil'
import { useNavegar } from '../../store/session'
import { Skeleton } from '../../components/UI'
import Icon from '../../components/Icon'

export default function Ajustes() {
  const [datos, setDatos] = useState<PerfilDetalle | null>(null)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [guardando, setGuardando] = useState(false)
  const navegar = useNavegar()

  useEffect(() => {
    apiPerfil.detalle()
      .then((d) => setDatos(d))
      .catch((e) => setError((e as Error).message))
  }, [])

  const cambiarTema = async (oscuro: boolean) => {
    if (!datos) return
    const tema = oscuro ? 'oscuro' : 'claro'
    setGuardando(true)
    setError('')
    setOk('')
    try {
      const r = await apiPerfil.tema(tema)
      document.documentElement.dataset.tema = r.tema
      setDatos({ ...datos, tema: r.tema === 'oscuro' ? 'oscuro' : 'claro' })
      setOk(r.mensaje)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  if (error && !datos) return <div className="aviso aviso--error" role="alert">{error}</div>
  if (!datos) return <div style={{ display: 'grid', gap: 12 }}><Skeleton h={80} /><Skeleton h={140} /><Skeleton h={110} /></div>

  const oscuro = datos.tema === 'oscuro'

  return (
    <div className="perfil-form">
      <header className="pagina-cab">
        <div className="rise">
          <h1>Ajustes</h1>
          <p>Seguridad, permisos del dispositivo y apariencia de la app.</p>
        </div>
        <button type="button" className="btn btn--claro rise" style={{ ['--i' as string]: 1 }} onClick={() => navegar('/perfil')}>
          <Icon name="flecha" size={15} /> Mi cuenta
        </button>
      </header>

      {ok && <div className="aviso aviso--ok" role="status">{ok}</div>}
      {error && <div className="aviso aviso--error" role="alert">{error}</div>}

      <section className="card rise" style={{ ['--i' as string]: 1 }}>
        <div className="card__cab"><h2 style={{ fontSize: 16 }}>Cuenta y dispositivo</h2></div>
        <div className="perfil-lista">
          <button type="button" className="perfil-fila" onClick={() => navegar('/perfil/seguridad')}>
            <span>
              <strong>Seguridad</strong>
              <small>Contraseña y baja de la cuenta</small>
            </span>
            <Icon name="flecha" size={16} />
          </button>
          <button type="button" className="perfil-fila" onClick={() => navegar('/perfil/permisos')}>
            <span>
              <strong>Permisos del dispositivo</strong>
              <small>Qué permite tu cuenta y qué te pedirá el navegador</small>
            </span>
            <Icon name="flecha" size={16} />
          </button>
          <button type="button" className="perfil-fila" onClick={() => navegar('/perfil/privacidad')}>
            <span>
              <strong>Privacidad</strong>
              <small>Notificaciones, SMS, correo y ubicación</small>
            </span>
            <Icon name="flecha" size={16} />
          </button>
        </div>
      </section>

      <section className="card rise" style={{ ['--i' as string]: 2 }}>
        <div className="card__cab"><h2 style={{ fontSize: 16 }}>Personalización de la app</h2></div>
        <div className="card__cuerpo perfil-opciones">
          <div className="perfil-opcion">
            <div className="perfil-opcion__texto">
              <strong>Modo oscuro</strong>
              <small>Fondo oscuro y texto claro. Se guarda en tu cuenta, no solo en este equipo.</small>
            </div>
            <label className="perfil-interruptor">
              <input
                type="checkbox"
                checked={oscuro}
                disabled={guardando}
                onChange={(e) => cambiarTema(e.target.checked)}
                aria-label="Modo oscuro"
              />
              <span className="perfil-interruptor__pista" aria-hidden="true" />
            </label>
          </div>
          <p className="perfil-pista">
            El modo oscuro se aplica al instante y se recuerda en tu cuenta: si entras desde otro equipo, lo verás igual.
          </p>
        </div>
      </section>

      <section className="card rise" style={{ ['--i' as string]: 3 }}>
        <div className="card__cab"><h2 style={{ fontSize: 16 }}>Legal</h2></div>
        <div className="perfil-lista">
          <div className="perfil-fila perfil-fila--estatica">
            <span>
              <strong>Términos y condiciones</strong>
              <small>Uso del servicio y responsabilidades</small>
            </span>
            <span className="chip chip--neutro">Sitio principal</span>
          </div>
          <div className="perfil-fila perfil-fila--estatica">
            <span>
              <strong>Aviso de privacidad</strong>
              <small>Qué datos tratamos y para qué</small>
            </span>
            <span className="chip chip--neutro">Sitio principal</span>
          </div>
        </div>
      </section>
    </div>
  )
}
