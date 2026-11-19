import { useEffect, useState } from 'react'
import { apiPerfil } from '../../lib/api-perfil'
import type { Preferencias } from '../../lib/api-perfil'
import { useNavegar } from '../../store/session'
import { Skeleton } from '../../components/UI'
import Icon from '../../components/Icon'

const OPCIONES: { clave: keyof Preferencias; titulo: string; detalle: string }[] = [
  {
    clave: 'notificaciones',
    titulo: 'Habilitar notificaciones',
    detalle: 'Interruptor general. Si lo apagas, no llega ningún aviso salvo los de seguridad.',
  },
  { clave: 'sms', titulo: 'Mensajes de texto', detalle: 'Avisos de pedidos y códigos de seguridad por SMS.' },
  { clave: 'correo', titulo: 'Correo electrónico', detalle: 'Resúmenes, facturas y novedades de tu cuenta.' },
  {
    clave: 'ubicacion',
    titulo: 'Compartir mi ubicación',
    detalle: 'Solo mientras tengas un pedido en camino, para que el repartidor te encuentre.',
  },
]

function Interruptor({ activo, cambiar, etiqueta }: { activo: boolean; cambiar: (v: boolean) => void; etiqueta: string }) {
  return (
    <label className="perfil-interruptor">
      <input type="checkbox" checked={activo} onChange={(e) => cambiar(e.target.checked)} aria-label={etiqueta} />
      <span className="perfil-interruptor__pista" aria-hidden="true" />
    </label>
  )
}

export default function Privacidad() {
  const [prefs, setPrefs] = useState<Preferencias | null>(null)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [guardando, setGuardando] = useState(false)
  const navegar = useNavegar()

  useEffect(() => {
    apiPerfil.privacidad()
      .then((r) => setPrefs(r.preferencias))
      .catch((e) => setError((e as Error).message))
  }, [])

  const guardar = async () => {
    if (!prefs) return
    setGuardando(true)
    setError('')
    setOk('')
    try {
      const r = await apiPerfil.guardarPrivacidad(prefs)
      setPrefs(r.preferencias)
      setOk(r.mensaje)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  if (error && !prefs) return <div className="aviso aviso--error" role="alert">{error}</div>
  if (!prefs) return <div style={{ display: 'grid', gap: 12 }}><Skeleton h={80} /><Skeleton h={260} /></div>

  return (
    <div className="perfil-form">
      <header className="pagina-cab">
        <div className="rise">
          <h1>Privacidad</h1>
          <p>Elige cómo quieres que te contactemos y qué compartes.</p>
        </div>
        <button type="button" className="btn btn--claro rise" style={{ ['--i' as string]: 1 }} onClick={() => navegar('/perfil')}>
          <Icon name="flecha" size={15} /> Mi cuenta
        </button>
      </header>

      {ok && <div className="aviso aviso--ok" role="status">{ok}</div>}
      {error && <div className="aviso aviso--error" role="alert">{error}</div>}

      <section className="card rise" style={{ ['--i' as string]: 1 }}>
        <div className="card__cuerpo perfil-opciones">
          {OPCIONES.map((o) => (
            <div className="perfil-opcion" key={o.clave}>
              <div className="perfil-opcion__texto">
                <strong>{o.titulo}</strong>
                <small>{o.detalle}</small>
              </div>
              <Interruptor
                etiqueta={o.titulo}
                activo={prefs[o.clave]}
                cambiar={(v) => setPrefs((p) => (p ? { ...p, [o.clave]: v } : p))}
              />
            </div>
          ))}

          <div className="perfil-form__acciones">
            <button type="button" className="btn" onClick={guardar} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar preferencias'}
            </button>
          </div>
        </div>
      </section>

      <p className="perfil-nota-legal">
        Los avisos de seguridad (recuperar contraseña, verificación) se envían siempre, incluso con los
        interruptores apagados: sin ellos podrías quedarte fuera de tu cuenta.
      </p>
    </div>
  )
}
