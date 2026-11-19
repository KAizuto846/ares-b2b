import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import Icon from '../components/Icon'
import { Skeleton, Vacio } from '../components/UI'
import { useNavegar } from '../store/session'
import { urlApp } from '../lib/api'
import { mensajes } from '../lib/api-mensajes'
import type { Aviso, Contacto, Hilo, HiloAbierto, Mensaje, TabMensajes } from '../lib/api-mensajes'

const MAX = 2000
const dos = (n: number) => String(n).padStart(2, '0')

const aFecha = (iso: string): Date | null => {
  if (!iso) return null
  const d = new Date(iso.replace(' ', 'T'))
  return Number.isNaN(d.getTime()) ? null : d
}

/** dd/mm HH:MM, como en la bandeja del panel. */
const horaHilo = (iso: string) => {
  const d = aFecha(iso)
  return d ? `${dos(d.getDate())}/${dos(d.getMonth() + 1)} ${dos(d.getHours())}:${dos(d.getMinutes())}` : ''
}

const horaBurbuja = (iso: string) => {
  const d = aFecha(iso)
  return d ? `${dos(d.getHours())}:${dos(d.getMinutes())}` : ''
}

const iniciales = (texto: string) =>
  texto
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('') || '?';

/** Los avisos guardan enlaces del panel («/pedidos/…»): se abren dentro de la SPA. */
const rutaInterna = (enlace: string) => (enlace.startsWith('/') && !enlace.startsWith('//') ? enlace : null)

function Dialogo({
  abierto,
  alCerrar,
  titulo,
  children,
}: {
  abierto: boolean
  alCerrar: () => void
  titulo: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dlg = ref.current
    if (!dlg) return
    if (abierto && !dlg.open) dlg.showModal()
    if (!abierto && dlg.open) dlg.close()
  }, [abierto])

  return (
    <dialog className="dialogo msg-dialogo" ref={ref} aria-label={titulo} onCancel={(e) => { e.preventDefault(); alCerrar() }} onClose={alCerrar}>
      <h2>{titulo}</h2>
      {children}
    </dialog>
  )
}

export default function Mensajes() {
  const [params, setParams] = useSearchParams()
  const navegar = useNavegar()

  const tab: TabMensajes = params.get('tab') === 'notificaciones' ? 'notificaciones' : 'conversaciones'
  const hiloUuid = params.get('hilo') ?? ''

  const [hilos, setHilos] = useState<Hilo[]>([])
  // Cuenta estable de conversaciones: la pestaña de avisos no la trae en su respuesta.
  const [totalHilos, setTotalHilos] = useState(0)
  const [contactos, setContactos] = useState<Contacto[]>([])
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const [avisosSinLeer, setAvisosSinLeer] = useState(0)
  const [activas, setActivas] = useState(true)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const [abierto, setAbierto] = useState<HiloAbierto | null>(null)
  const [mensajesHilo, setMensajesHilo] = useState<Mensaje[]>([])
  const [cargandoHilo, setCargandoHilo] = useState(false)
  const [borrador, setBorrador] = useState('')
  const [enviando, setEnviando] = useState(false)
  const ultimoRef = useRef(0)
  const cuerpoRef = useRef<HTMLDivElement>(null)

  const [recarga, setRecarga] = useState(0)

  // Borrado en dos toques: primero modo selección, luego confirmación.
  const [modoBorrar, setModoBorrar] = useState(false)
  const [seleccion, setSeleccion] = useState<string[]>([])
  const [temblor, setTemblor] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const [borrando, setBorrando] = useState(false)

  const [dlgNueva, setDlgNueva] = useState(false)
  const [contactoElegido, setContactoElegido] = useState('')
  const [soporteTexto, setSoporteTexto] = useState('')
  const [enviandoSoporte, setEnviandoSoporte] = useState(false)

  const [dlgConfig, setDlgConfig] = useState(false)
  const [switchAvisos, setSwitchAvisos] = useState(true)
  const [guardandoConfig, setGuardandoConfig] = useState(false)

  const poner = useCallback(
    (clave: string, valor: string | null) => {
      setParams(
        (previos) => {
          const siguiente = new URLSearchParams(previos)
          if (valor === null || valor === '') siguiente.delete(clave)
          else siguiente.set(clave, valor)
          return siguiente
        },
        { replace: false },
      )
    },
    [setParams],
  )

  useEffect(() => {
    if (tab !== 'notificaciones') return
    let vivo = true
    mensajes.bandeja('conversaciones')
      .then((r) => { if (vivo && r.tab === 'conversaciones') setTotalHilos(r.hilos.length) })
      .catch(() => {})
    return () => { vivo = false }
  }, [tab])

  // ---------------------------------------------------------------- bandeja
  useEffect(() => {
    let vivo = true
    setCargando(true)

    mensajes
      .bandeja(tab)
      .then((r) => {
        if (!vivo) return
        if (r.tab === 'notificaciones') {
          setAvisos(r.avisos)
          setAvisosSinLeer(r.sin_leer)
          setActivas(r.activas)
          setSwitchAvisos(r.activas)
        } else {
          setHilos(r.hilos)
          setContactos(r.contactos)
          setTotalHilos(r.hilos.length)
        }
        setError('')
      })
      .catch((e: unknown) => vivo && setError((e as Error).message))
      .finally(() => vivo && setCargando(false))

    return () => {
      vivo = false
    }
  }, [tab, recarga])

  // ------------------------------------------------------------- hilo abierto
  useEffect(() => {
    if (!hiloUuid) {
      setAbierto(null)
      setMensajesHilo([])
      ultimoRef.current = 0
      return
    }

    let vivo = true
    setCargandoHilo(true)

    mensajes
      .abrir(hiloUuid)
      .then((r) => {
        if (!vivo) return
        setAbierto(r.hilo)
        setMensajesHilo(r.mensajes)
        ultimoRef.current = r.ultimo_id
        setError('')
        // El servidor ya marcó leído: el globo del hilo desaparece.
        setHilos((previos) => previos.map((h) => (h.uuid === r.hilo.uuid ? { ...h, no_leidos: 0 } : h)))
      })
      .catch((e: unknown) => {
        if (!vivo) return
        setError((e as Error).message)
        setAbierto(null)
        setMensajesHilo([])
      })
      .finally(() => vivo && setCargandoHilo(false))

    return () => {
      vivo = false
    }
  }, [hiloUuid])

  // Bajar al final cuando cambia el hilo o llega un mensaje.
  useEffect(() => {
    const caja = cuerpoRef.current
    if (caja) caja.scrollTop = caja.scrollHeight
  }, [mensajesHilo, abierto])

  // Polling del hilo abierto, igual que el panel (8 s, pausado si la pestaña está oculta).
  useEffect(() => {
    if (!abierto || tab !== 'conversaciones') return

    const consultar = () => {
      if (document.hidden) return
      mensajes
        .nuevos(abierto.uuid, ultimoRef.current)
        .then((r) => {
          if (r.mensajes.length === 0) return
          setMensajesHilo((previos) => [...previos, ...r.mensajes])
          ultimoRef.current = Math.max(ultimoRef.current, ...r.mensajes.map((m) => m.id))
        })
        .catch(() => {
          /* sin red: se reintenta en el siguiente ciclo */
        })
    }

    const reloj = window.setInterval(consultar, 8000)
    document.addEventListener('visibilitychange', consultar)

    return () => {
      window.clearInterval(reloj)
      document.removeEventListener('visibilitychange', consultar)
    }
  }, [abierto, tab])

  // ------------------------------------------------------------------ acciones
  const abrirHilo = (uuid: string) => {
    setOk('')
    poner('hilo', uuid)
  }

  const cerrarHilo = () => {
    poner('hilo', null)
  }

  const enviar = async () => {
    const texto = borrador.trim()
    if (!texto || !abierto || enviando) return

    setEnviando(true)
    setError('')
    try {
      const r = await mensajes.enviar(abierto.uuid, texto)
      setMensajesHilo((previos) => [...previos, r.mensaje])
      ultimoRef.current = Math.max(ultimoRef.current, r.mensaje.id)
      setBorrador('')
      setRecarga((n) => n + 1)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  const tocarBorrar = () => {
    if (!modoBorrar) {
      setOk('')
      setModoBorrar(true)
      return
    }

    if (seleccion.length === 0) {
      setTemblor(true)
      window.setTimeout(() => setTemblor(false), 600)
      return
    }

    setConfirmar(true)
  }

  const salirDeBorrado = () => {
    setModoBorrar(false)
    setSeleccion([])
    setConfirmar(false)
  }

  const alternarSeleccion = (uuid: string) =>
    setSeleccion((previos) => (previos.includes(uuid) ? previos.filter((u) => u !== uuid) : [...previos, uuid]))

  const confirmarBorrado = async () => {
    if (seleccion.length === 0 || borrando) return
    setBorrando(true)
    setError('')
    try {
      const r = await mensajes.eliminar(seleccion)
      const total = r.total
      setConfirmar(false)
      salirDeBorrado()
      if (hiloUuid && seleccion.includes(hiloUuid)) cerrarHilo()
      setRecarga((n) => n + 1)
      setOk(total === 1 ? 'Se eliminó 1 conversación.' : `Se eliminaron ${total} conversaciones.`)
    } catch (e) {
      setError((e as Error).message)
      setConfirmar(false)
    } finally {
      setBorrando(false)
    }
  }

  const abrirDirecto = async () => {
    const id = Number(contactoElegido)
    if (!id) return
    setError('')
    try {
      const r = await mensajes.directo({ usuario_id: id })
      setDlgNueva(false)
      setContactoElegido('')
      setRecarga((n) => n + 1)
      abrirHilo(r.uuid)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const abrirSoporte = async () => {
    const texto = soporteTexto.trim()
    if (!texto || enviandoSoporte) return
    setEnviandoSoporte(true)
    setError('')
    try {
      const r = await mensajes.soporte(texto)
      setSoporteTexto('')
      setDlgNueva(false)
      setRecarga((n) => n + 1)
      abrirHilo(r.uuid)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setEnviandoSoporte(false)
    }
  }

  const guardarConfig = async () => {
    if (guardandoConfig) return
    setGuardandoConfig(true)
    setError('')
    try {
      const r = await mensajes.guardarConfig(switchAvisos)
      setActivas(r.activas)
      setDlgConfig(false)
      setOk(r.activas ? 'Avisos activados.' : 'Avisos desactivados.')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGuardandoConfig(false)
    }
  }

  const seguirEnlace = (enlace: string) => {
    const interna = rutaInterna(enlace)
    if (interna) navegar(interna)
  }

  const abrirConfig = () => {
    setSwitchAvisos(activas)
    setDlgConfig(true)
  }

  // ---------------------------------------------------------------- piezas ui
  const glifo = (h: Hilo) =>
    h.avatar ? (
      <img className="msg-avatar" src={urlApp(h.avatar)} alt="" width={38} height={38} />
    ) : (
      <span className={`msg-avatar msg-avatar--iniciales ${h.tipo === 'soporte' ? 'msg-avatar--soporte' : ''}`}>
        {h.tipo === 'soporte' ? <Icon name="ayuda" size={19} /> : iniciales(h.titulo)}
      </span>
    )

  const contenidoFila = (h: Hilo) => (
    <>
      {glifo(h)}
      <span className="msg-hilo__texto">
        <span className="msg-hilo__nombre">{h.titulo}</span>
        <span className="msg-hilo__resumen">{h.ultimo || 'Sin mensajes todavía'}</span>
      </span>
      <span className="msg-hilo__lado">
        <span className="msg-hilo__hora">{horaHilo(h.ultimo_at || h.created_at)}</span>
        {h.no_leidos > 0 && <span className="msg-hilo__no-leido">{h.no_leidos > 99 ? '99+' : h.no_leidos}</span>}
      </span>
    </>
  )

  return (
    <>
      <header className="pagina-cab">
        <div className="rise">
          <h1>Centro de mensajes</h1>
          <p>Conversaciones y avisos del sitio, en un solo lugar.</p>
        </div>
      </header>

      <nav className="msg-tabs" role="tablist" aria-label="Secciones del centro de mensajes">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'conversaciones'}
          className="msg-tabs__tab"
          data-activo={tab === 'conversaciones' ? '1' : '0'}
          onClick={() => poner('tab', null)}
        >
          Conversaciones
          <span className="msg-tabs__cuenta">{totalHilos}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'notificaciones'}
          className="msg-tabs__tab"
          data-activo={tab === 'notificaciones' ? '1' : '0'}
          onClick={() => poner('tab', 'notificaciones')}
        >
          Notificaciones
          {avisosSinLeer > 0 && <span className="msg-tabs__cuenta msg-tabs__cuenta--nueva">{avisosSinLeer}</span>}
        </button>
      </nav>

      {error && (
        <div className="aviso aviso--error" style={{ marginBottom: 14 }} role="alert">
          {error}
        </div>
      )}
      {ok && (
        <div className="aviso aviso--ok" style={{ marginBottom: 14 }} role="status">
          {ok}
        </div>
      )}

      {tab === 'notificaciones' ? (
        <section className="card msg-avisos" aria-label="Notificaciones">
          {cargando ? (
            <div className="card__cuerpo" style={{ display: 'grid', gap: 10 }}>
              <Skeleton h={64} />
              <Skeleton h={64} />
              <Skeleton h={64} />
            </div>
          ) : avisos.length === 0 ? (
            <Vacio titulo="No tienes notificaciones del sitio." texto="Aquí llegan los avisos de pedidos, pagos y cuenta." />
          ) : (
            avisos.map((a) => (
              <article className={`msg-aviso ${a.leido ? '' : 'msg-aviso--nueva'}`} key={a.id}>
                <span className="msg-aviso__punto" aria-hidden="true" />
                <div className="msg-aviso__cuerpo">
                  <div className="msg-aviso__cab">
                    <strong>{a.asunto}</strong>
                    <span className="msg-aviso__hora">{horaHilo(a.cuando)}</span>
                  </div>
                  {a.cuerpo && <p className="msg-aviso__texto">{a.cuerpo}</p>}
                  {rutaInterna(a.enlace) && (
                    <button type="button" className="msg-aviso__enlace" onClick={() => seguirEnlace(a.enlace)}>
                      Ver detalle ›
                    </button>
                  )}
                </div>
              </article>
            ))
          )}
        </section>
      ) : (
        <div className="msg-layout" data-vista={hiloUuid ? 'chat' : 'lista'}>
          <div className="card msg-lista">
            <div className="card__cab msg-lista__cab">
              <strong>Conversaciones</strong>
              <div className="msg-lista__acciones">
                <button type="button" className="icono-btn" aria-label="Nueva conversación" title="Nueva conversación" onClick={() => setDlgNueva(true)}>
                  <Icon name="mas" size={19} />
                </button>
                <button type="button" className="icono-btn" aria-label="Configuración" title="Configuración" onClick={abrirConfig}>
                  <Icon name="ajustes" size={19} />
                </button>
                <button
                  type="button"
                  className={`icono-btn msg-borrar ${modoBorrar ? 'msg-borrar--activo' : ''} ${temblor ? 'msg-borrar--temblor' : ''}`}
                  aria-label={modoBorrar ? 'Eliminar seleccionadas' : 'Eliminar conversaciones'}
                  aria-pressed={modoBorrar}
                  title="Eliminar conversaciones"
                  onClick={tocarBorrar}
                >
                  <Icon name="basura" size={19} />
                </button>
              </div>
            </div>

            {modoBorrar && (
              <div className="msg-modo" role="status">
                <span>Marca las conversaciones que quieras quitar de tu bandeja.</span>
                <button type="button" className="btn btn--fantasma btn--mini" onClick={salirDeBorrado}>
                  Cancelar
                </button>
              </div>
            )}

            <div className="msg-lista__filas">
              {cargando && hilos.length === 0 ? (
                <div style={{ display: 'grid', gap: 8, padding: 12 }}>
                  <Skeleton h={56} />
                  <Skeleton h={56} />
                  <Skeleton h={56} />
                </div>
              ) : hilos.length === 0 ? (
                <Vacio
                  titulo="Todavía no tienes conversaciones"
                  texto="Abre un chat con un proveedor o escribe a soporte."
                  accion={
                    <button type="button" className="btn" onClick={() => setDlgNueva(true)}>
                      Empezar una
                    </button>
                  }
                />
              ) : (
                hilos.map((h) =>
                  modoBorrar ? (
                    <label key={h.uuid} className={`msg-fila msg-fila--sel ${seleccion.includes(h.uuid) ? 'msg-fila--marcada' : ''}`}>
                      <input
                        type="checkbox"
                        className="msg-casilla"
                        checked={seleccion.includes(h.uuid)}
                        onChange={() => alternarSeleccion(h.uuid)}
                        aria-label={`Seleccionar ${h.titulo}`}
                      />
                      <span className="msg-hilo msg-hilo--estatico">{contenidoFila(h)}</span>
                    </label>
                  ) : (
                    <div key={h.uuid} className="msg-fila">
                      <button
                        type="button"
                        className="msg-hilo"
                        data-activo={h.uuid === hiloUuid ? '1' : '0'}
                        onClick={() => abrirHilo(h.uuid)}
                        aria-current={h.uuid === hiloUuid ? 'true' : undefined}
                      >
                        {contenidoFila(h)}
                      </button>
                    </div>
                  ),
                )
              )}
            </div>
          </div>

          <div className={`card msg-chat ${abierto ? '' : 'msg-chat--vacio'}`}>
            {!abierto ? (
              <div className="msg-chat__portada">
                <strong>Tus mensajes</strong>
                <p>Elige una conversación de la lista. Aquí solo ves los hilos en los que participas.</p>
              </div>
            ) : (
              <>
                <div className="msg-chat__cab">
                  <button type="button" className="icono-btn msg-chat__volver" aria-label="Volver a la lista" onClick={cerrarHilo}>
                    <Icon name="flecha" size={18} />
                  </button>
                  <div className="msg-chat__quien">
                    <strong>{abierto.titulo}</strong>
                    {abierto.soporte && <span className="chip chip--info">soporte</span>}
                  </div>
                </div>

                <div className="msg-chat__cuerpo" ref={cuerpoRef}>
                  {cargandoHilo && mensajesHilo.length === 0 ? (
                    <div style={{ display: 'grid', gap: 8 }}>
                      <Skeleton h={44} w="60%" />
                      <Skeleton h={44} w="45%" />
                    </div>
                  ) : mensajesHilo.length === 0 ? (
                    <p className="msg-chat__nota">Aún no hay mensajes. Escribe el primero.</p>
                  ) : (
                    mensajesHilo.map((m) => (
                      <div className={`msg-burbuja ${m.mio ? 'msg-burbuja--yo' : 'msg-burbuja--otro'}`} key={m.id}>
                        {!m.mio && <span className="msg-burbuja__autor">{m.autor}</span>}
                        <span className="msg-burbuja__cuerpo">{m.cuerpo}</span>
                        <span className="msg-burbuja__hora">{horaBurbuja(m.created_at)}</span>
                      </div>
                    ))
                  )}
                </div>

                <form
                  className="msg-forma"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void enviar()
                  }}
                >
                  <label className="msg-forma__campo">
                    <span className="msg-oculto">Escribe un mensaje</span>
                    <textarea
                      className="msg-forma__area"
                      placeholder="Escribe un mensaje…"
                      maxLength={MAX}
                      rows={2}
                      value={borrador}
                      onChange={(e) => setBorrador(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          void enviar()
                        }
                      }}
                      autoFocus
                    />
                  </label>
                  <div className="msg-forma__pie">
                    <span className="msg-forma__cuenta">{borrador.length}/{MAX}</span>
                    <button type="submit" className="btn" disabled={!borrador.trim() || enviando}>
                      {enviando ? 'Enviando…' : 'Enviar'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------- nueva conversación */}
      <Dialogo abierto={dlgNueva} alCerrar={() => setDlgNueva(false)} titulo="Nueva conversación">
        <p className="msg-dialogo__texto">Elige con quién quieres hablar. El chat queda dentro de Ares.</p>

        {contactos.length === 0 ? (
          <p className="msg-pista">No hay contactos disponibles todavía.</p>
        ) : (
          <div className="msg-dialogo__bloque">
            <label className="campo">
              <span>Contacto</span>
              <select value={contactoElegido} onChange={(e) => setContactoElegido(e.target.value)}>
                <option value="">Elige un contacto</option>
                {contactos.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.nombre} · {c.rol}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="btn btn--bloque" disabled={!contactoElegido} onClick={abrirDirecto}>
              Abrir chat
            </button>
          </div>
        )}

        <div className="msg-dialogo__bloque msg-dialogo__bloque--soporte">
          <strong>Soporte Didi2</strong>
          <p className="msg-pista">
            Un solo canal con el equipo: no importa quién responda, siempre verás «Soporte».
          </p>
          <label className="campo">
            <span>¿Qué necesitas?</span>
            <textarea
              className="msg-forma__area"
              rows={3}
              maxLength={MAX}
              placeholder="Cuéntanos qué pasa con tu pedido, pago o cuenta…"
              value={soporteTexto}
              onChange={(e) => setSoporteTexto(e.target.value)}
            />
          </label>
          <button type="button" className="btn btn--claro btn--bloque" disabled={!soporteTexto.trim() || enviandoSoporte} onClick={abrirSoporte}>
            {enviandoSoporte ? 'Abriendo…' : 'Abrir canal de soporte'}
          </button>
        </div>

        <div className="dialogo__acciones">
          <button type="button" className="btn btn--claro" onClick={() => setDlgNueva(false)}>
            Cancelar
          </button>
        </div>
      </Dialogo>

      {/* ------------------------------------------------------------ configuración */}
      <Dialogo abierto={dlgConfig} alCerrar={() => setDlgConfig(false)} titulo="Configuración">
        <label className="msg-opcion">
          <span className="msg-opcion__texto">
            <strong>Habilitar notificaciones</strong>
            <small>Avisos de pedidos, pagos y cuenta. Si lo apagas, no llega ninguno salvo los de seguridad.</small>
          </span>
          <span className="msg-switch">
            <input type="checkbox" checked={switchAvisos} onChange={(e) => setSwitchAvisos(e.target.checked)} />
            <span className="msg-switch__pista" aria-hidden="true" />
          </span>
        </label>
        <div className="dialogo__acciones">
          <button type="button" className="btn btn--claro" onClick={() => setDlgConfig(false)}>
            Cancelar
          </button>
          <button type="button" className="btn" disabled={guardandoConfig} onClick={guardarConfig}>
            {guardandoConfig ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </Dialogo>

      {/* -------------------------------------------------------- confirmar borrado */}
      <Dialogo abierto={confirmar} alCerrar={() => { setConfirmar(false); salirDeBorrado() }} titulo="Eliminar conversaciones">
        <p className="msg-dialogo__texto">
          {seleccion.length === 1
            ? 'Se quitará 1 conversación de tu bandeja. La otra persona conserva su historial.'
            : `Se quitarán ${seleccion.length} conversaciones de tu bandeja. La otra persona conserva su historial.`}
        </p>
        <div className="dialogo__acciones">
          <button type="button" className="btn btn--claro" onClick={() => { setConfirmar(false); salirDeBorrado() }}>
            Cancelar
          </button>
          <button type="button" className="btn btn--peligro" disabled={borrando} onClick={confirmarBorrado}>
            {borrando ? 'Eliminando…' : 'Eliminar'}
          </button>
        </div>
      </Dialogo>
    </>
  )
}
