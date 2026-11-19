import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { apiPerfil } from '../lib/api-perfil'
import type { PerfilDetalle } from '../lib/api-perfil'
import { fecha } from '../lib/format'
import { useNavegar, useSesion } from '../store/session'
import { Skeleton } from '../components/UI'
import Icon from '../components/Icon'

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** «2026-11-16 20:26» → «noviembre de 2026». */
function miembroLegible(iso: string): string {
  if (!iso) return '—'
  const [a, m] = iso.slice(0, 10).split('-').map(Number)
  if (!a || !m) return '—'
  return `${MESES[m - 1]} de ${a}`
}

function Estrellas({ valor, total }: { valor: number | null; total: number }) {
  if (total === 0) return <span className="perfil-pista">Todavía sin calificaciones</span>
  return (
    <span className="perfil-nota" title={`${valor} de 5 · ${total} calificaciones`}>
      <span className="perfil-nota__estrella" aria-hidden="true">★</span>
      <strong>{valor !== null ? valor.toFixed(1) : '—'}</strong>
      <span className="perfil-pista">{total} calificaci{total === 1 ? 'ón' : 'ones'}</span>
    </span>
  )
}

function Atajo({ icono, titulo, texto, onClick }: { icono: string; titulo: string; texto: string; onClick: () => void }) {
  return (
    <button type="button" className="perfil-atajo" onClick={onClick}>
      <span className="perfil-atajo__icono"><Icon name={icono} size={18} /></span>
      <strong>{titulo}</strong>
      <small>{texto}</small>
    </button>
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
    <div className="perfil-dialogo" role="dialog" aria-modal="true" aria-labelledby="baja-titulo">
      <div className="perfil-dialogo__velo" onClick={cerrar} />
      <div className="perfil-dialogo__caja">
        <h2 id="baja-titulo">Eliminar mi cuenta</h2>
        <p>Esta acción no se puede deshacer. Escribe <strong>ELIMINAR</strong> para confirmar.</p>
        <label className="campo">
          <span>Confirmación</span>
          <input
            type="text"
            value={confirmacion}
            onChange={(e) => setConfirmacion(e.target.value)}
            placeholder="ELIMINAR"
            autoComplete="off"
            autoFocus
          />
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

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="perfil-dato">
      <dt>{etiqueta}</dt>
      <dd>{children}</dd>
    </div>
  )
}

export default function Perfil() {
  const [datos, setDatos] = useState<PerfilDetalle | null>(null)
  const [error, setError] = useState('')
  const [baja, setBaja] = useState(false)
  const { salir } = useSesion()
  const navegar = useNavegar()

  useEffect(() => {
    apiPerfil.detalle()
      .then((d) => {
        setDatos(d)
        document.documentElement.dataset.tema = d.tema
      })
      .catch((e) => setError((e as Error).message))
  }, [])

  if (error) return <div className="aviso aviso--error" role="alert">{error}</div>
  if (!datos) return <div style={{ display: 'grid', gap: 12 }}><Skeleton h={190} /><Skeleton h={120} /><Skeleton h={90} /></div>

  const principal = datos.direcciones[0]
  const direccion = principal
    ? [principal.calle, principal.colonia, principal.ciudad].filter((p) => p.trim() !== '').join(', ')
    : ''
  const sumaEstrellas = Object.values(datos.desglose.por_estrella).reduce((a, b) => a + b, 0)
  const mayorBarra = Math.max(1, ...Object.values(datos.desglose.por_estrella))

  return (
    <div className="perfil-pagina">
      <header className="pagina-cab">
        <div className="rise">
          <h1>Mi perfil</h1>
          <p>Tus datos, la verificación de la cuenta y las opciones de la app.</p>
        </div>
      </header>

      <section className="card perfil-ficha rise" style={{ ['--i' as string]: 1 }}>
        <div className="perfil-ficha__cuerpo">
          <div className="perfil-ficha__foto">
            {datos.usuario.avatar
              ? <img src={datos.usuario.avatar} alt={`Foto de ${datos.usuario.nombre}`} width={96} height={96} />
              : <span aria-hidden="true">{datos.usuario.iniciales}</span>}
          </div>

          <div className="perfil-ficha__datos">
            <div className="perfil-ficha__fila">
              <h2>{datos.usuario.nombre}</h2>
              <Estrellas valor={datos.calificacion.promedio} total={datos.calificacion.total} />
            </div>

            <div className="perfil-ficha__chips">
              <span className="chip chip--info">{datos.etiqueta_rol}</span>
              {datos.verificado
                ? <span className="chip chip--ok"><Icon name="ok" size={13} /> Cuenta verificada</span>
                : <span className="chip chip--alerta">Verificación pendiente</span>}
              <span className="chip chip--neutro">Miembro desde {miembroLegible(datos.miembro)}</span>
            </div>

            <dl className="perfil-ficha__lista">
              <Dato etiqueta="Correo">{datos.usuario.email}</Dato>
              <Dato etiqueta="Teléfono">{datos.usuario.telefono || 'Sin registrar'}</Dato>
              <Dato etiqueta="Dirección principal">{direccion || 'Sin registrar'}</Dato>
              <Dato etiqueta="Último acceso">{datos.ultimo_login ? fecha(datos.ultimo_login) : '—'}</Dato>
            </dl>
          </div>

          <button type="button" className="btn btn--claro perfil-ficha__editar" onClick={() => navegar('/perfil/editar')}>
            <Icon name="editar" size={16} /> Editar
          </button>
        </div>
      </section>

      <nav className="perfil-atajos rise" style={{ ['--i' as string]: 2 }} aria-label="Accesos de la cuenta">
        <Atajo icono="seguridad" titulo="Seguridad" texto="Contraseña y baja de la cuenta" onClick={() => navegar('/perfil/seguridad')} />
        <Atajo icono="ayuda" titulo="Ayuda" texto="Preguntas frecuentes y soporte" onClick={() => navegar('/ayuda')} />
        <Atajo icono="ajustes" titulo="Ajustes" texto="Privacidad, permisos y tema" onClick={() => navegar('/perfil/ajustes')} />
      </nav>

      <section className="card rise" style={{ ['--i' as string]: 3 }}>
        <div className="card__cab">
          <h2 style={{ fontSize: 16 }}>Verificaciones y calificaciones</h2>
          <button type="button" className="btn btn--claro btn--mini" style={{ marginLeft: 'auto' }} onClick={() => navegar('/kyc')}>
            <Icon name="kyc" size={15} /> Ir a verificación
          </button>
        </div>
        <div className="card__cuerpo perfil-calif">
          <div className="perfil-calif__resumen">
            <div>
              <div className="perfil-calif__nota">{datos.calificacion.promedio !== null ? datos.calificacion.promedio.toFixed(1) : '—'}</div>
              <div className="perfil-pista">{datos.calificacion.total} calificaciones</div>
            </div>
            <div className="perfil-calif__barras">
              {['5', '4', '3', '2', '1'].map((estrella) => {
                const n = datos.desglose.por_estrella[estrella] ?? 0
                return (
                  <div className="perfil-barra" key={estrella}>
                    <span>{estrella}</span>
                    <span className="perfil-barra__pista"><span style={{ width: `${Math.round((n / mayorBarra) * 100)}%` }} /></span>
                    <span>{n}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="perfil-comentarios">
            <h3>Comentarios recibidos</h3>
            {datos.desglose.comentarios.length === 0
              ? <p className="perfil-pista">Aún no hay comentarios escritos.</p>
              : datos.desglose.comentarios.map((c, i) => (
                <article className="perfil-comentario" key={`${c.created_at}-${i}`}>
                  <header>
                    <strong>{c.autor}</strong>
                    <span className="perfil-pista">{fecha(c.created_at)}</span>
                  </header>
                  <div className="perfil-comentario__estrellas" aria-label={`${c.puntaje} de 5`}>
                    {'★'.repeat(c.puntaje)}{'☆'.repeat(5 - c.puntaje)}
                  </div>
                  <p>{c.comentario}</p>
                </article>
              ))}
          </div>

          {sumaEstrellas > 0 && datos.calificacion.promedio === null && (
            <p className="perfil-pista">Tu promedio aparecerá cuando alguien te califique.</p>
          )}
        </div>
      </section>

      <div className="perfil-sesion rise" style={{ ['--i' as string]: 4 }}>
        <button type="button" className="btn btn--claro btn--bloque" onClick={() => salir()}>
          <Icon name="salir" size={16} /> Cerrar sesión
        </button>
        <button type="button" className="btn btn--peligro btn--bloque" onClick={() => setBaja(true)}>
          <Icon name="basura" size={16} /> Eliminar cuenta
        </button>
      </div>

      <DialogoBaja abierto={baja} cerrar={() => setBaja(false)} />
    </div>
  )
}
