import { useEffect, useState } from 'react'
import { apiPerfil } from '../../lib/api-perfil'
import type { Seguridad as DatosSeguridad } from '../../lib/api-perfil'
import { useNavegar, useSesion } from '../../store/session'
import { Skeleton } from '../../components/UI'
import Icon from '../../components/Icon'

function CampoPassword({
  etiqueta, valor, cambiar, autoComplete, placeholder, id,
}: {
  etiqueta: string; valor: string; cambiar: (v: string) => void; autoComplete: string; placeholder: string; id: string
}) {
  const [visible, setVisible] = useState(false)
  return (
    <label className="campo">
      <span>{etiqueta}</span>
      <span className="perfil-campo-boton">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={valor}
          onChange={(e) => cambiar(e.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          required
        />
        <button
          type="button"
          className="perfil-ojo"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          title={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        >
          <Icon name="ojo" size={18} />
        </button>
      </span>
    </label>
  )
}

function DialogoBaja({ abierto, cerrar }: { abierto: boolean; cerrar: () => void }) {
  const { salir } = useSesion()
  const [confirmacion, setConfirmacion] = useState('')
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (!abierto) {
      setConfirmacion('')
      setMotivo('')
      setError('')
      setEnviando(false)
    }
  }, [abierto])

  useEffect(() => {
    if (!abierto) return
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar() }
    document.addEventListener('keydown', alTeclear)
    return () => document.removeEventListener('keydown', alTeclear)
  }, [abierto, cerrar])

  if (!abierto) return null

  const eliminar = async () => {
    setEnviando(true)
    setError('')
    try {
      await apiPerfil.eliminar(confirmacion, motivo)
      await salir()
    } catch (e) {
      setError((e as Error).message)
      setEnviando(false)
    }
  }

  return (
    <div className="perfil-dialogo" role="dialog" aria-modal="true" aria-labelledby="baja-titulo-seg">
      <div className="perfil-dialogo__velo" onClick={cerrar} />
      <div className="perfil-dialogo__caja">
        <h2 id="baja-titulo-seg">Eliminar mi cuenta</h2>
        <p>Esta acción no se puede deshacer. Escribe <strong>ELIMINAR</strong> para confirmar.</p>
        <label className="campo">
          <span>Confirmación</span>
          <input type="text" value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)} placeholder="ELIMINAR" autoComplete="off" autoFocus />
        </label>
        <label className="campo">
          <span>Motivo (opcional)</span>
          <input type="text" value={motivo} maxLength={120} onChange={(e) => setMotivo(e.target.value)} placeholder="Ya no lo necesito" />
        </label>
        {error && <div className="aviso aviso--error" role="alert">{error}</div>}
        <div className="perfil-dialogo__acciones">
          <button type="button" className="btn btn--claro" onClick={cerrar}>Cancelar</button>
          <button
            type="button"
            className="btn btn--peligro"
            onClick={eliminar}
            disabled={enviando || confirmacion.trim().toUpperCase() !== 'ELIMINAR'}
          >
            {enviando ? 'Eliminando…' : 'Eliminar definitivamente'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Seguridad() {
  const [datos, setDatos] = useState<DatosSeguridad | null>(null)
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [repetir, setRepetir] = useState('')
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [baja, setBaja] = useState(false)
  const navegar = useNavegar()

  useEffect(() => {
    apiPerfil.seguridad()
      .then(setDatos)
      .catch((e) => setError((e as Error).message))
  }, [])

  const reglas = [
    { texto: 'Al menos 12 caracteres', cumple: nueva.length >= 12 },
    { texto: 'Una mayúscula', cumple: /\p{Lu}/u.test(nueva) },
    { texto: 'Un número', cumple: /\d/.test(nueva) },
    { texto: 'Un símbolo (! ? # $ …)', cumple: /[^\p{L}\p{N}\s]/u.test(nueva) },
  ]

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setOk('')

    if (nueva !== repetir) {
      setError('Las contraseñas nuevas no coinciden.')
      return
    }

    if (reglas.some((r) => !r.cumple)) {
      setError('La contraseña nueva todavía no cumple todas las reglas.')
      return
    }

    setGuardando(true)
    try {
      const r = await apiPerfil.password(actual, nueva)
      setOk(r.mensaje)
      setActual('')
      setNueva('')
      setRepetir('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  if (error && !datos) return <div className="aviso aviso--error" role="alert">{error}</div>
  if (!datos) return <div style={{ display: 'grid', gap: 12 }}><Skeleton h={260} /><Skeleton h={160} /></div>

  return (
    <div className="perfil-form">
      <header className="pagina-cab">
        <div className="rise">
          <h1>Seguridad</h1>
          <p>Contraseña, últimos accesos y baja de la cuenta.</p>
        </div>
        <button type="button" className="btn btn--claro rise" style={{ ['--i' as string]: 1 }} onClick={() => navegar('/perfil/ajustes')}>
          <Icon name="flecha" size={15} /> Ajustes
        </button>
      </header>

      {ok && <div className="aviso aviso--ok" role="status">{ok}</div>}
      {error && <div className="aviso aviso--error" role="alert">{error}</div>}

      <section className="card rise" style={{ ['--i' as string]: 1 }}>
        <div className="card__cab"><h2 style={{ fontSize: 16 }}>Contraseña</h2></div>
        <div className="card__cuerpo">
          <p className="perfil-pista" style={{ marginTop: 0 }}>Al cambiarla se cierran las demás sesiones.</p>
          <form className="perfil-form__rejilla" onSubmit={guardar}>
            <div className="perfil-form__ancho">
              <CampoPassword
                id="p_actual"
                etiqueta="Contraseña actual"
                valor={actual}
                cambiar={setActual}
                autoComplete="current-password"
                placeholder="La que usas hoy"
              />
            </div>
            <CampoPassword
              id="p_nueva"
              etiqueta="Nueva"
              valor={nueva}
              cambiar={setNueva}
              autoComplete="new-password"
              placeholder="Mínimo 12 caracteres"
            />
            <CampoPassword
              id="p_repetir"
              etiqueta="Repite la nueva"
              valor={repetir}
              cambiar={setRepetir}
              autoComplete="new-password"
              placeholder="Otra vez"
            />

            <ul className="perfil-reglas perfil-form__ancho">
              {reglas.map((r) => (
                <li key={r.texto} className={r.cumple ? 'perfil-reglas__ok' : ''}>
                  <Icon name={r.cumple ? 'ok' : 'cerrar'} size={13} /> {r.texto}
                </li>
              ))}
            </ul>

            <div className="perfil-form__acciones perfil-form__ancho">
              <button type="submit" className="btn" disabled={guardando}>
                {guardando ? 'Guardando…' : 'Guardar contraseña'}
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className="card rise" style={{ ['--i' as string]: 2 }}>
        <div className="card__cab"><h2 style={{ fontSize: 16 }}>Tu cuenta</h2></div>
        <div className="card__cuerpo perfil-seguridad">
          <dl className="perfil-ficha__lista">
            <div className="perfil-dato"><dt>Correo</dt><dd>{datos.correo}</dd></div>
            <div className="perfil-dato"><dt>Teléfono</dt><dd>{datos.telefono || 'Sin registrar'}</dd></div>
            <div className="perfil-dato"><dt>Último acceso</dt><dd>{datos.ultimo_login || '—'}</dd></div>
            <div className="perfil-dato"><dt>Miembro desde</dt><dd>{datos.miembro || '—'}</dd></div>
          </dl>
          <div className="perfil-ficha__chips">
            {datos.roles.map((r) => (
              <span className="chip chip--info" key={r.nombre}>{r.etiqueta}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="card rise" style={{ ['--i' as string]: 3 }}>
        <div className="card__cab"><h2 style={{ fontSize: 16 }}>Últimos accesos</h2></div>
        <div className="tabla-scroll">
          {datos.accesos.length === 0 ? (
            <div className="card__cuerpo"><p className="perfil-pista">Todavía no hay accesos registrados.</p></div>
          ) : (
            <table className="tabla">
              <thead>
                <tr><th>Acción</th><th>Cuándo</th><th>IP</th><th>Equipo</th></tr>
              </thead>
              <tbody>
                {datos.accesos.map((a, i) => (
                  <tr key={`${a.created_at}-${i}`}>
                    <td>{a.accion.replace(/_/g, ' ')}</td>
                    <td>{a.created_at}</td>
                    <td><code style={{ fontSize: 12 }}>{a.ip || '—'}</code></td>
                    <td><span className="perfil-pista">{a.user_agent ? a.user_agent.slice(0, 48) : '—'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="perfil-peligro rise" style={{ ['--i' as string]: 4 }}>
        <div>
          <strong>Eliminar mi cuenta</strong>
          <p className="perfil-pista" style={{ margin: '2px 0 0' }}>
            Se borran tu foto, tus direcciones y el acceso. Los pedidos realizados se conservan por obligaciones fiscales.
          </p>
        </div>
        <button type="button" className="btn btn--peligro" onClick={() => setBaja(true)}>Eliminar cuenta</button>
      </section>

      <DialogoBaja abierto={baja} cerrar={() => setBaja(false)} />
    </div>
  )
}
