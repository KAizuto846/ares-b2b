import { useEffect, useRef, useState } from 'react'
import { apiComercio, apiAnuncios } from '../lib/api-comercio'
import type { Explorar, AnuncioPublicacion, AnuncioPublicador } from '../lib/api-comercio'
import { apiPerfil, leerDataUrl } from '../lib/api-perfil'
import type { PerfilDetalle } from '../lib/api-perfil'
import { useNavegar, useSesion } from '../store/session'
import { Skeleton } from '../components/UI'
import Icon from '../components/Icon'

const PLANES = [
  { monto: 400, dias: 4 },
  { monto: 1200, dias: 12 },
  { monto: 2000, dias: 21 },
  { monto: 3000, dias: 31 },
]

const MONTO = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })
const DIA = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long' })

/* ============================== anuncios del comercio ==================== */

/** Franja de anuncios sin título: dos columnas de hasta 10 fichas con scroll. */
function Publicidades() {
  const [publicaciones, setPublicaciones] = useState<AnuncioPublicacion[] | null>(null)
  const navegar = useNavegar()

  useEffect(() => {
    let vivo = true
    apiAnuncios.marketplace()
      .then((r) => { if (vivo) setPublicaciones(r.anuncios) })
      .catch(() => { if (vivo) setPublicaciones([]) })
    return () => { vivo = false }
  }, [])

  const anuncios = publicaciones

  if (!anuncios) return null
  if (anuncios.length === 0) return null

  // Reparto en dos columnas: 0-9 a la izquierda, 10-19 a la derecha.
  const izquierda = anuncios.slice(0, 10)
  const derecha = anuncios.slice(10, 20)

  const abrir = (a: AnuncioPublicacion) => {
    void apiAnuncios.clic(a.id).catch(() => {})
    if (a.mayorista_uuid) navegar(`/proveedor/${a.mayorista_uuid}`)
  }

  return (
    <section className="publicidades rise" style={{ ['--i' as string]: 1 }} aria-label="Anuncios">
      {[izquierda, derecha].map((columna, i) => (
        <div className="publicidades__columna" key={i}>
          {columna.map((a, j) => (
            <button type="button" className="publicidad" key={a.id} style={{ ['--i' as string]: j }} onClick={() => abrir(a)}>
              <span className="publicidad__imagen" aria-hidden="true">
                {a.imagen ? <img src={a.imagen} alt="" loading="lazy" /> : <span className="publicidad__fallo">{a.mayorista.slice(0, 2).toUpperCase()}</span>}
              </span>
              <span className="publicidad__texto">
                <strong>{a.titulo}</strong>
                <small>{a.cuerpo}</small>
              </span>
              <Icon name="flecha" size={15} />
            </button>
          ))}
        </div>
      ))}
    </section>
  )
}

/* ============================== anuncios del mayorista =================== */

type Borrador = { titulo: string; cuerpo: string; plan: number | null; imagen: string | null; metodo_pago: 'efectivo' | 'tarjeta' | '' }

const borradorVacio: Borrador = { titulo: '', cuerpo: '', plan: null, imagen: null, metodo_pago: '' }

function Publicador() {
  const [publicaciones, setPublicaciones] = useState<AnuncioPublicador[] | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [borrador, setBorrador] = useState<Borrador>(borradorVacio)
  const [vacio, setVacio] = useState(false)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const archivo = useRef<HTMLInputElement>(null)
  const { aviso } = useSesion()

  const cargar = async () => {
    try {
      const r = await apiAnuncios.publicaciones()
      setPublicaciones(r.anuncios)
    } catch (e) {
      setError((e as Error).message)
      setPublicaciones([])
    }
  }

  useEffect(() => { void cargar() }, [])

  const activos = publicaciones?.filter((a) => a.estado === 'activo') ?? []

  const descartar = () => {
    setBorrador(borradorVacio)
    setVacio(true)
  }

  const abrirPanel = () => {
    if (vacio) {
      // Un borrador descartado no vuelve por sí solo: se arma uno nuevo.
      setBorrador(borradorVacio)
      setVacio(false)
    }
    setAbierto(true)
  }

  const cerrarPanel = () => setAbierto(false)

  const elegirImagen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > 2 * 1024 * 1024) {
      setError('La imagen no puede pesar más de 2 MB.')
      return
    }
    try {
      const dataUrl = await leerDataUrl(f)
      setBorrador((b) => ({ ...b, imagen: dataUrl }))
      setError('')
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const continuarPago = async () => {
    if (!borrador.plan || !borrador.metodo_pago) {
      setError('Elige un plan y un método de pago.')
      return
    }
    setEnviando(true)
    setError('')
    try {
      const r = await apiAnuncios.publicar({
        titulo: borrador.titulo.trim(),
        cuerpo: borrador.cuerpo.trim(),
        plan: borrador.plan,
        metodo_pago: borrador.metodo_pago,
        imagen: borrador.imagen,
      })
      aviso(r.mensaje)
      setBorrador(borradorVacio)
      setVacio(false)
      setAbierto(false)
      await cargar()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  // El vencimiento se fija al elegir el plan (el backend también lo valida).
  const [finPlan, setFinPlan] = useState<Date | null>(null)
  const elegirPlan = (plan: number) => {
    setBorrador((b) => ({ ...b, plan }))
    const dias = PLANES.find((p) => p.monto === plan)?.dias
    setFinPlan(dias ? new Date(Date.now() + dias * 24 * 60 * 60 * 1000) : null)
  }
  const [hoyPlan, setHoyPlan] = useState<Date | null>(null)
  useEffect(() => {
    setHoyPlan(finPlan ? new Date() : null)
  }, [finPlan])

  return (
    <section className="card rise" style={{ ['--i' as string]: 3 }}>
      <div className="card__cab">
        <h2>Anuncios</h2>
        {activos.length > 0 && <span className="chip chip--ok" style={{ marginLeft: 'auto' }}>{activos.length} activo{activos.length === 1 ? '' : 's'}</span>}
      </div>
      <div className="card__cuerpo" style={{ display: 'grid', gap: 12 }}>
        {publicaciones === null ? (
          <Skeleton h={80} />
        ) : activos.length === 0 ? (
          <p className="perfil-pista" style={{ margin: 0 }}>
            No tienes anuncios publicados. Crea uno para aparecer en el inicio de los comercios.
          </p>
        ) : (
          <ul className="publicador__lista">
            {activos.map((a) => {
              const faltan = Math.max(0, a.dias.total - a.dias.lleva)
              return (
                <li className="publicador__item" key={a.id}>
                  <span className="publicador__progreso" role="progressbar" aria-valuenow={a.dias.lleva} aria-valuemin={0} aria-valuemax={a.dias.total}>
                    <i style={{ width: `${Math.min(100, (a.dias.lleva / Math.max(1, a.dias.total)) * 100)}%` }} />
                  </span>
                  <span className="publicador__detalle">
                    <strong>{a.titulo}</strong>
                    <small>Día {a.dias.lleva} de {a.dias.total} · faltan {faltan} · {MONTO.format(a.monto)}</small>
                  </span>
                  <span className="publicador__clics" title="Clics recibidos">
                    <Icon name="globo" size={14} /> {a.clics}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
        <button
          type="button"
          className="btn"
          onClick={() => (abierto ? cerrarPanel() : abrirPanel())}
        >
          <Icon name="mas" size={17} />
          {abierto ? 'Seguir editando' : '+ Agregar nuevo anuncio'}
        </button>
      </div>

      {error && <div className="aviso aviso--error" role="alert">{error}</div>}

      {abierto && (
        <div className="publicador__panel" role="dialog" aria-modal="true" aria-labelledby="publicador-titulo">
          <div className="publicador__velo" onClick={cerrarPanel} />
          <aside className="publicador__caja">
            <header className="publicador__cab">
              <h2 id="publicador-titulo">Crear nuevo anuncio</h2>
              <button type="button" className="perfil-enlace" onClick={descartar}>Descartar borrador</button>
            </header>

            <div className="publicador__cuerpo">
              {/* Paso 1: contenido del anuncio */}
              <section className="publicador__paso">
                <h3>Paso 1 · Diseña tu anuncio</h3>
                <label className="campo">
                  <span>Título del anuncio</span>
                  <input
                    type="text"
                    value={borrador.titulo}
                    onChange={(e) => setBorrador((b) => ({ ...b, titulo: e.target.value }))}
                    placeholder="Ej. Café de especialidad al mayoreo"
                    maxLength={60}
                  />
                </label>
                <label className="campo" style={{ marginTop: 10 }}>
                  <span>Descripción</span>
                  <textarea
                    rows={3}
                    value={borrador.cuerpo}
                    onChange={(e) => setBorrador((b) => ({ ...b, cuerpo: e.target.value }))}
                    placeholder="Cuenta qué ofreces: precio, cantidad o promoción…"
                    maxLength={200}
                    style={{ resize: 'vertical', minHeight: 70 }}
                  />
                </label>
                <label className="publicador__archivo" onClick={(e) => { e.preventDefault(); archivo.current?.click() }}>
                  {borrador.imagen
                    ? <img src={borrador.imagen} alt="Vista previa del anuncio" />
                    : <span><Icon name="subir" size={22} /> Sube una imagen</span>}
                </label>
                <input ref={archivo} type="file" accept="image/jpeg,image/png,image/webp" onChange={elegirImagen} style={{ display: 'none' }} />
              </section>

              {/* Paso 2: plan */}
              <section className="publicador__paso">
                <h3>Paso 2 · Elige tu plan</h3>
                <div className="publicador__planes">
                  {PLANES.map((p) => (
                    <button
                      type="button"
                      key={p.monto}
                      className={`publicador__plan${borrador.plan === p.monto ? ' elegido' : ''}`}
                      onClick={() => elegirPlan(p.monto)}
                      aria-pressed={borrador.plan === p.monto}
                    >
                      <strong>{MONTO.format(p.monto)}</strong>
                      <small>{p.dias} días · IVA incluido</small>
                    </button>
                  ))}
                </div>
                <p className="perfil-pista" style={{ margin: '10px 0 0' }}>
                  {finPlan && hoyPlan
                    ? <>Tu anuncio va del <strong>{DIA.format(hoyPlan)}</strong> al <strong>{DIA.format(finPlan)}</strong>.</>
                    : 'Elige un plan para ver las fechas.'}
                </p>
              </section>

              {/* Paso 3: método de pago */}
              <section className="publicador__paso">
                <h3>Paso 3 · Método de pago</h3>
                <div className="publicador__pagos">
                  {(['efectivo', 'tarjeta'] as const).map((m) => (
                    <button
                      type="button"
                      key={m}
                      className={`publicador__pago${borrador.metodo_pago === m ? ' elegido' : ''}`}
                      onClick={() => setBorrador((b) => ({ ...b, metodo_pago: m }))}
                      aria-pressed={borrador.metodo_pago === m}
                    >
                      {m === 'efectivo' ? 'Efectivo' : 'Tarjeta'}
                    </button>
                  ))}
                </div>
              </section>
            </div>

            <footer className="publicador__pie">
              <button
                type="button"
                className="btn btn--bloque"
                style={{ background: 'var(--verde-2)' }}
                disabled={!borrador.titulo.trim() || borrador.titulo.trim().length < 5 || !borrador.cuerpo.trim() || borrador.cuerpo.trim().length < 10 || !borrador.plan || !borrador.metodo_pago || enviando}
                onClick={continuarPago}
              >
                {enviando ? 'Procesando…' : 'Continuar pago'}
              </button>
            </footer>
          </aside>
        </div>
      )}
    </section>
  )
}

/* ============================== Inicio ================================== */

export default function Inicio() {
  const [datos, setDatos] = useState<Explorar | null>(null)
  const [error, setError] = useState('')
  const navegar = useNavegar()
  const { rol } = useSesion()

  const esMayorista = rol === 'mayorista'

  // El nombre visible del mayorista viene del perfil (no de la sesión congelada).
  const [perfil, setPerfil] = useState<PerfilDetalle | null>(null)

  useEffect(() => {
    apiComercio.explorar().then(setDatos).catch((e) => setError((e as Error).message))
  }, [])

  useEffect(() => {
    if (!esMayorista) return
    let vivo = true
    apiPerfil.detalle()
      .then((d) => { if (vivo) setPerfil(d) })
      .catch(() => {})
    return () => { vivo = false }
  }, [esMayorista])

  if (error) return <div className="aviso aviso--error">{error}</div>

  if (!datos) {
    return (
      <div style={{ display: 'grid', gap: 18 }}>
        <Skeleton h={34} w={320} />
        <div className="kpis">{[0, 1, 2].map((i) => <Skeleton key={i} h={84} />)}</div>
        <div className="card">
          <div className="card__cuerpo" style={{ display: 'grid', gap: 12 }}>
            <Skeleton h={56} /><Skeleton h={56} /><Skeleton h={56} />
          </div>
        </div>
      </div>
    )
  }

  const esComercio = datos.rol === 'comercio'

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <header className="pagina-cab">
        <div className="rise">
          <h1>Hola, {perfil?.usuario.nombre || datos.nombre}</h1>
          <p>¿Con qué empezamos hoy? Esto es lo que tienes en marcha.</p>
        </div>
        <button className="btn rise" style={{ ['--i' as string]: 1 }} onClick={() => navegar('/mensajes')}>
          <Icon name="mensajes" size={17} /> Mensajes
        </button>
      </header>

      {datos.metricas.length > 0 && (
        <section className="kpis rise" style={{ ['--i' as string]: 1 }} aria-label="Tus cifras de hoy">
          {datos.metricas.map((m) => (
            <a
              className="kpi"
              key={m.etiqueta}
              href={`/spa${m.href}`}
              onClick={(e) => { e.preventDefault(); navegar(m.href) }}
              title={m.nota ? `${m.etiqueta}: ${m.nota}` : m.etiqueta}
            >
              <span className="kpi__valor">{m.valor}</span>
              <span className="kpi__etiqueta">{m.etiqueta}</span>
              {m.nota && <span className="kpi__nota">{m.nota}</span>}
            </a>
          ))}
        </section>
      )}

      {esMayorista && (
        <section className="card rise pedidos-ficha" style={{ ['--i' as string]: 2 }}>
          <div className="card__cab"><h2>Pedidos</h2></div>
          <div className="card__cuerpo pedidos-ficha__cuerpo">
            <div className="pedidos-ficha__fila">
              <div className="pedidos-sub">
                <span className="pedidos-sub__encabezado">En curso</span>
                <strong className="pedidos-sub__numero">{datos.resumen.pedidos}</strong>
                {datos.resumen.detalle.length > 0 && (
                  <div className="pedidos-estados">
                    {datos.resumen.detalle.map((d) => (
                      <div className="pedidos-estado" key={d.estado}>
                        <strong>{d.cuantos}</strong>
                        <span className={`chip chip--${d.estado === 'listo_para_recoger' ? 'ok' : 'alerta'}`}>
                          {d.estado === 'listo_para_recoger' ? 'Listo' : 'Preparando'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="pedidos-sub pedidos-sub--vendidos">
                <span className="pedidos-sub__encabezado">Vendidos hoy</span>
                <div className="pedidos-sub__numeros">
                  <strong className="pedidos-sub__numero">{datos.pedidos_hoy.pedidos}</strong>
                  <strong className="pedidos-sub__numero pedidos-sub__numero--monto">{MONTO.format(datos.pedidos_hoy.monto)}</strong>
                </div>
                <span className="pedidos-sub__pie">pedidos y monto del día</span>
              </div>
            </div>
            <button type="button" className="btn btn--claro" style={{ justifySelf: 'start' }} onClick={() => navegar('/pedidos')}>
              <Icon name="pedidos" size={16} /> Detalles
            </button>
          </div>
        </section>
      )}

      <div className={esComercio ? 'inicio-grid' : ''} style={esComercio ? undefined : { display: 'grid', gap: 18 }}>
        <section className="card rise" style={{ ['--i' as string]: 2 }}>
          <div className="card__cab">
            <h2>Tu día a día</h2>
            {esComercio && <span className="chip chip--neutro" style={{ marginLeft: 'auto' }}>{datos.accesos.length} accesos</span>}
          </div>
          <div className="card__cuerpo inicio-accesos">
            {datos.accesos.map((a, i) => (
              <a
                key={a.href + a.titulo}
                href={`/spa${a.href}`}
                onClick={(e) => { e.preventDefault(); navegar(a.href) }}
                className="acceso"
                style={{ ['--i' as string]: i }}
              >
                <span className="acceso__icono"><Icon name={a.icono} size={19} /></span>
                <span className="acceso__texto"><strong>{a.titulo}</strong><span>{a.texto}</span></span>
                {!!a.globos && a.globos > 0 && <span className="acceso__globo">{a.globos > 99 ? '99+' : a.globos}</span>}
                <Icon name="flecha" size={17} />
              </a>
            ))}
          </div>
        </section>

        {esComercio && datos.atajos.length > 0 && (
          <section className="card rise" style={{ ['--i' as string]: 3 }}>
            <div className="card__cab">
              <h2>Punto de venta</h2>
              <span className="chip chip--neutro" style={{ marginLeft: 'auto' }}>tus herramientas</span>
            </div>
            <div className="pos-tarjetas">
              {datos.atajos.map((a, i) => (
                <a
                  key={a.href + a.titulo}
                  href={`/spa${a.href}`}
                  onClick={(e) => { e.preventDefault(); navegar(a.href) }}
                  className="pos-tarjeta"
                  style={{ ['--i' as string]: i }}
                >
                  <span className="pos-tarjeta__icono"><Icon name={a.icono} size={22} /></span>
                  <strong>{a.titulo}</strong>
                  <span className="pos-tarjeta__texto">{a.texto}</span>
                  {!!a.globos && a.globos > 0 && <span className="acceso__globo pos-tarjeta__globo">{a.globos > 99 ? '99+' : a.globos}</span>}
                </a>
              ))}
            </div>
          </section>
        )}

        {esMayorista && <Publicador />}
      </div>

      {esComercio && <Publicidades />}
    </div>
  )
}
