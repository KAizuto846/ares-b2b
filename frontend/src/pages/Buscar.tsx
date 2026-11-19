import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/Icon'
import { Skeleton, Vacio } from '../components/UI'
import { money } from '../lib/format'
import { urlApp } from '../lib/api'
import { apiBusqueda } from '../lib/api-busqueda'
import type { PuntoMapa, RespuestaMapa, RespuestaBusqueda, RespuestaOpciones, ResultadoBusqueda } from '../lib/api-busqueda'
import { useSesion } from '../store/session'

/* ------------------------------------------------------------------ Leaflet
   Llega como global desde /assets/leaflet/leaflet.js (assets del backend, sin
   CDN). Se tipa laxo a propósito: no se añaden dependencias ni @types. */
type Punto = { lat: number; lng: number }

type MapaLeaflet = {
  setView: (pos: [number, number], zoom: number, opciones?: { animate?: boolean }) => MapaLeaflet
  getZoom: () => number
  getCenter: () => Punto
  project: (pos: [number, number], zoom: number) => { x: number; y: number }
  on: (evento: string, fn: () => void) => MapaLeaflet
  remove: () => void
}

type Marcador = {
  addTo: (destino: unknown) => Marcador
  bindPopup: (html: string) => Marcador
  bindTooltip: (html: string, opciones?: Record<string, unknown>) => Marcador
  on: (evento: string, fn: () => void) => Marcador
  openPopup: () => Marcador
}

type GrupoCapas = {
  addTo: (destino: unknown) => GrupoCapas
  addLayer: (capa: unknown) => GrupoCapas
  clearLayers: () => void
}

type Leaflet = {
  map: (el: HTMLElement, opciones?: Record<string, unknown>) => MapaLeaflet
  tileLayer: (url: string, opciones?: Record<string, unknown>) => Marcador
  marker: (pos: [number, number], opciones?: Record<string, unknown>) => Marcador
  divIcon: (opciones: Record<string, unknown>) => unknown
  layerGroup: () => GrupoCapas
}

const URL_TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const CIUDAD: Punto = { lat: 19.4326, lng: -99.1332 }
const POR_PAGINA = 20
const CELDA = 64

let cargaLeaflet: Promise<Leaflet> | null = null

/** Carga Leaflet una sola vez desde los assets locales del backend. */
function cargarLeaflet(): Promise<Leaflet> {
  const yaEsta = window.L as unknown as Leaflet | undefined
  if (yaEsta) return Promise.resolve(yaEsta)
  if (cargaLeaflet) return cargaLeaflet

  cargaLeaflet = new Promise<Leaflet>((resolve, reject) => {
    if (!document.querySelector('link[data-leaflet]')) {
      const css = document.createElement('link')
      css.rel = 'stylesheet'
      css.href = urlApp('/assets/leaflet/leaflet.css')
      css.dataset.leaflet = '1'
      document.head.appendChild(css)
    }

    const script = document.createElement('script')
    script.src = urlApp('/assets/leaflet/leaflet.js')
    script.async = true
    script.dataset.leaflet = '1'
    script.onload = () => {
      const L = window.L as unknown as Leaflet | undefined
      if (L) resolve(L)
      else reject(new Error('Leaflet no quedó disponible'))
    }
    script.onerror = () => reject(new Error('No se pudo cargar el mapa'))
    document.head.appendChild(script)
  }).catch((error: unknown) => {
    cargaLeaflet = null
    throw error
  })

  return cargaLeaflet
}

/** Distancia en km entre dos coordenadas (Haversine). */
function distanciaKm(a: Punto, b: Punto): number {
  const R = 6371
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2

  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Texto seguro para el HTML de un popup de Leaflet. */
function escapar(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => {
    const mapa: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
    return mapa[c] ?? c
  })
}

type Filtros = { q: string; categoria: number; radio: number; orden: string }

export default function Buscar() {
  const { agregar, rol } = useSesion()

  const [opciones, setOpciones] = useState<RespuestaOpciones | null>(null)
  const [texto, setTexto] = useState('')
  const [filtros, setFiltros] = useState<Filtros>({ q: '', categoria: 0, radio: 10, orden: 'distancia' })
  const [centro, setCentro] = useState<Punto>(CIUDAD)
  const [ubicacion, setUbicacion] = useState<'pendiente' | 'gps' | 'respaldo'>('pendiente')
  const [page, setPage] = useState(1)

  const [datos, setDatos] = useState<RespuestaBusqueda | null>(null)
  const [puntos, setPuntos] = useState<RespuestaMapa | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [cantidades, setCantidades] = useState<Record<string, number>>({})
  const [activo, setActivo] = useState('')

  const [mapaVisible, setMapaVisible] = useState(() => (typeof window === 'undefined' ? true : window.innerWidth >= 992))
  const [sinMapa, setSinMapa] = useState(false)

  const resultadosRef = useRef<HTMLDivElement | null>(null)
  const cajaRef = useRef<HTMLDivElement | null>(null)
  const mapaRef = useRef<MapaLeaflet | null>(null)
  const capaRef = useRef<GrupoCapas | null>(null)
  const marcadoresRef = useRef<Map<string, Marcador>>(new Map())
  const puntosRef = useRef<PuntoMapa[]>([])
  const firmaRef = useRef('')
  const pintarRef = useRef<() => void>(() => {})
  const centroRef = useRef<Punto>(CIUDAD)
  const turnoRef = useRef(0)
  const moverRef = useRef<number | undefined>(undefined)
  const fallosRef = useRef(0)

  /* ------------------------------------------------------------- opciones */
  useEffect(() => {
    let vivo = true
    apiBusqueda
      .filtros()
      .then((r) => {
        if (!vivo) return
        setOpciones(r)
        setFiltros((f) => (f.radio === r.radio_default ? f : { ...f, radio: r.radio_default }))
      })
      .catch(() => {
        if (vivo) setOpciones(null)
      })
    return () => {
      vivo = false
    }
  }, [])

  /* ---------------------------------------------------------- ubicación */
  useEffect(() => {
    let vivo = true
    const respaldo = () => {
      if (!vivo) return
      setCentro(CIUDAD)
      setUbicacion('respaldo')
    }

    if (!('geolocation' in navigator)) {
      respaldo()
      return
    }

    const reloj = window.setTimeout(respaldo, 6000)

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        window.clearTimeout(reloj)
        if (!vivo) return
        setCentro({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setUbicacion('gps')
      },
      () => {
        window.clearTimeout(reloj)
        respaldo()
      },
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 },
    )

    return () => {
      vivo = false
      window.clearTimeout(reloj)
    }
  }, [])

  const pedirUbicacion = () => {
    if (!('geolocation' in navigator)) {
      setUbicacion('respaldo')
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCentro({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setUbicacion('gps')
        setPage(1)
      },
      () => setUbicacion('respaldo'),
      { enableHighAccuracy: false, timeout: 5000 },
    )
  }

  /* ------------------------------------------------- búsqueda con debounce */
  useEffect(() => {
    const limpio = texto.trim()
    if (limpio === filtros.q) return

    const id = window.setTimeout(() => {
      setFiltros((f) => ({ ...f, q: limpio }))
      setPage(1)
    }, 320)

    return () => window.clearTimeout(id)
  }, [texto, filtros.q])

  // Productos y puntos del mapa se piden juntos: la tarjeta y el marcador
  // siempre hablan de la misma búsqueda. Un contador de turno descarta la
  // respuesta vieja si el usuario escribe o mueve el mapa rápido.
  useEffect(() => {
    if (ubicacion === 'pendiente') return

    const turno = ++turnoRef.current
    setCargando(true)

    const parametros = {
      q: filtros.q,
      categoria_id: filtros.categoria > 0 ? filtros.categoria : undefined,
      radio: filtros.radio,
      orden: filtros.orden,
      lat: Number(centro.lat.toFixed(6)),
      lng: Number(centro.lng.toFixed(6)),
    }

    Promise.all([
      apiBusqueda.productos({ ...parametros, page, per_page: POR_PAGINA }),
      apiBusqueda.mapa(parametros),
    ])
      .then(([lista, mapa]) => {
        if (turno !== turnoRef.current) return
        setDatos(lista)
        setPuntos(mapa)
        setError('')
      })
      .catch((e: unknown) => {
        // Sin overlays flotantes: se avisa arriba y se conservan los
        // resultados anteriores, como hace el panel.
        if (turno !== turnoRef.current) return
        setError((e as Error).message)
      })
      .finally(() => {
        if (turno === turnoRef.current) setCargando(false)
      })
  }, [filtros, centro, page, ubicacion])

  /* --------------------------------------------------------------- mapa */
  const pintar = useCallback(() => {
    const L = window.L as unknown as Leaflet | undefined
    const mapa = mapaRef.current
    const capa = capaRef.current
    if (!L || !mapa || !capa) return

    const lista = puntosRef.current.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
    if (lista.length === 0) {
      capa.clearLayers()
      marcadoresRef.current.clear()
      firmaRef.current = 'vacio'
      return
    }

    // Agrupación por cuadrícula de 64 px en píxeles de pantalla: al acercar,
    // las celdas se separan solas y el contador baja, sin pedir datos de nuevo.
    const zoom = mapa.getZoom()
    const origen = mapa.project([mapa.getCenter().lat, mapa.getCenter().lng], zoom)
    const grupos = new Map<string, PuntoMapa[]>()

    for (const punto of lista) {
      const px = mapa.project([punto.lat, punto.lng], zoom)
      const clave = `${Math.floor((px.x - origen.x) / CELDA)}:${Math.floor((px.y - origen.y) / CELDA)}`
      const grupo = grupos.get(clave)
      if (grupo) grupo.push(punto)
      else grupos.set(clave, [punto])
    }

    const firma =
      `${zoom}|` +
      [...grupos.entries()]
        .map(([clave, grupo]) => `${clave}=${grupo.map((p) => p.uuid).join('.')}`)
        .sort()
        .join(';')

    if (firma === firmaRef.current) return
    firmaRef.current = firma

    capa.clearLayers()
    marcadoresRef.current.clear()

    grupos.forEach((grupo) => {
      if (grupo.length === 1) {
        const punto = grupo[0]
        const icono = L.divIcon({ className: 'busq-pin', html: '<span>📦</span>', iconSize: [28, 28], iconAnchor: [14, 28] })
        const marcador = L.marker([punto.lat, punto.lng], { icon: icono, keyboard: false, riseOnHover: true })
          .bindPopup(
            `<strong>${escapar(punto.nombre)}</strong><br>` +
              `${punto.productos} producto${punto.productos === 1 ? '' : 's'} · a ${punto.distancia_km.toFixed(1)} km<br>` +
              `Compra mínima ${money(punto.monto_minimo)}`,
          )
          .addTo(capa)

        marcador.on('click', () => setActivo(punto.uuid))
        marcadoresRef.current.set(punto.uuid, marcador)
        return
      }

      const lat = grupo.reduce((total, p) => total + p.lat, 0) / grupo.length
      const lng = grupo.reduce((total, p) => total + p.lng, 0) / grupo.length
      const icono = L.divIcon({
        className: 'busq-cluster',
        html: `<span>${grupo.length}</span>`,
        iconSize: [42, 42],
        iconAnchor: [21, 21],
      })
      const marcador = L.marker([lat, lng], { icon: icono, keyboard: false }).addTo(capa)
      const nombres = grupo.slice(0, 4).map((p) => p.nombre).join(' · ')

      marcador.bindTooltip(`${nombres}${grupo.length > 4 ? ` y ${grupo.length - 4} más` : ''}`, {
        direction: 'top',
        offset: [0, -14],
      })
      marcador.on('click', () => {
        const actual = mapaRef.current
        if (actual) actual.setView([lat, lng], Math.min(18, actual.getZoom() + 2), { animate: true })
      })
    })
  }, [])

  useEffect(() => {
    pintarRef.current = pintar
  }, [pintar])

  useEffect(() => {
    puntosRef.current = puntos?.puntos ?? []
    firmaRef.current = ''
    pintarRef.current()
  }, [puntos])

  // Crear / destruir el mapa según visibilidad y disponibilidad de tiles.
  useEffect(() => {
    if (!mapaVisible || sinMapa) return

    let vivo = true

    void cargarLeaflet()
      .then((L) => {
        if (!vivo || !cajaRef.current || mapaRef.current) return

        const mapa = L.map(cajaRef.current, { scrollWheelZoom: false })
        mapa.setView([centroRef.current.lat, centroRef.current.lng], 12)

        const capa = L.layerGroup().addTo(mapa)
        const tiles = L.tileLayer(URL_TILES, { maxZoom: 19, attribution: '© OpenStreetMap' })

        // Si los tiles no cargan (sin red, proxy, CSP) el mapa se degrada a un
        // panel de posición en vez de dejar un recuadro gris.
        tiles.on('tileerror', () => {
          fallosRef.current += 1
          if (fallosRef.current >= 3) setSinMapa(true)
        })
        tiles.addTo(mapa)

        mapa.on('zoomend', () => {
          firmaRef.current = ''
          pintarRef.current()
        })

        // Mover el mapa vuelve a buscar con el centro nuevo, como el panel,
        // pero solo si de verdad se movió (0.3 km) y con retardo.
        mapa.on('moveend', () => {
          const c = mapa.getCenter()
          if (distanciaKm(centroRef.current, c) < 0.3) return
          window.clearTimeout(moverRef.current)
          moverRef.current = window.setTimeout(() => {
            setCentro({ lat: Number(c.lat.toFixed(6)), lng: Number(c.lng.toFixed(6)) })
            setPage(1)
          }, 420)
        })

        mapaRef.current = mapa
        capaRef.current = capa
        firmaRef.current = ''
        pintarRef.current()
      })
      .catch(() => {
        if (vivo) setSinMapa(true)
      })

    return () => {
      vivo = false
      window.clearTimeout(moverRef.current)
      mapaRef.current?.remove()
      mapaRef.current = null
      capaRef.current = null
      marcadoresRef.current.clear()
      firmaRef.current = ''
    }
  }, [mapaVisible, sinMapa])

  // Seguir el centro activo (geolocalización, filtros) sin pelearse con el
  // arrastre del usuario: solo se recentra si el mapa quedó lejos.
  useEffect(() => {
    centroRef.current = centro
    const mapa = mapaRef.current
    if (!mapa) return
    if (distanciaKm(mapa.getCenter(), centro) > 0.05) mapa.setView([centro.lat, centro.lng], mapa.getZoom())
  }, [centro])

  // Tarjeta activa → su marcador abre el globo.
  useEffect(() => {
    if (!activo) return
    marcadoresRef.current.get(activo)?.openPopup()
  }, [activo])

  /* ------------------------------------------------------------ carrito */
  const cantidadDe = (p: ResultadoBusqueda) => cantidades[p.uuid] ?? p.cantidad_minima

  const sumar = (p: ResultadoBusqueda, delta: number) => {
    setCantidades((previo) => {
      const actual = previo[p.uuid] ?? p.cantidad_minima
      const paso = Math.max(1, p.multiplo_venta)
      const tope = Math.max(p.cantidad_minima, p.stock_disponible)
      const siguiente = Math.min(tope, Math.max(p.cantidad_minima, actual + delta * paso))
      return { ...previo, [p.uuid]: siguiente }
    })
  }

  const agregarProducto = async (p: ResultadoBusqueda, boton: HTMLElement) => {
    await agregar(p.uuid, cantidadDe(p), boton)
  }

  /* ------------------------------------------------------------ filtros */
  const cambiarRadio = (radio: number) => {
    setFiltros((f) => ({ ...f, radio }))
    setPage(1)
  }

  const cambiarCategoria = (categoria: number) => {
    setFiltros((f) => ({ ...f, categoria }))
    setPage(1)
  }

  const cambiarOrden = (orden: string) => {
    setFiltros((f) => ({ ...f, orden }))
    setPage(1)
  }

  const limpiar = () => {
    setTexto('')
    setFiltros({ q: '', categoria: 0, radio: opciones?.radio_default ?? 10, orden: 'distancia' })
    setPage(1)
  }

  const irPagina = (destino: number) => {
    setPage(destino)
    resultadosRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    resultadosRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  const hayFiltros =
    filtros.q !== '' ||
    filtros.categoria > 0 ||
    filtros.radio !== (opciones?.radio_default ?? 10) ||
    filtros.orden !== 'distancia'

  const nombreCategoria = useMemo(() => {
    const id = filtros.categoria
    return opciones?.categorias.find((c) => c.id === id)?.nombre ?? ''
  }, [filtros.categoria, opciones])

  const total = datos?.total ?? 0
  const resumen = total === 1 ? '1 producto' : `${total} productos`
  const lista = datos?.resultados ?? []

  return (
    <>
      <header className="pagina-cab">
        <div className="rise">
          <h1>Buscar productos</h1>
          <p>{ubicacion === 'pendiente' ? 'Ubicando tu comercio…' : `${resumen} de mayoristas verificados cerca de ti.`}</p>
        </div>
        <button type="button" className="btn btn--claro btn--mini" onClick={pedirUbicacion}>
          <Icon name="ubicacion" size={15} /> Mi ubicación
        </button>
      </header>

      <form
        className="busq-form rise"
        onSubmit={(e) => {
          e.preventDefault()
          setFiltros((f) => ({ ...f, q: texto.trim() }))
          setPage(1)
        }}
      >
        <div className="buscador__campo busq-busca">
          <Icon name="buscar" size={18} />
          <input
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="¿Qué buscas? café, cloro, tornillo…"
            aria-label="Buscar productos"
          />
        </div>

        <label className="campo busq-campo">
          <span>Categoría</span>
          <select value={filtros.categoria} onChange={(e) => cambiarCategoria(Number(e.target.value))}>
            <option value={0}>Todas</option>
            {(opciones?.categorias ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>

        <label className="campo busq-campo busq-campo--corto">
          <span>Radio</span>
          <select value={filtros.radio} onChange={(e) => cambiarRadio(Number(e.target.value))}>
            {(opciones?.radios ?? [2, 5, 10, 20, 30]).map((km) => (
              <option key={km} value={km}>
                {km} km
              </option>
            ))}
          </select>
        </label>

        <label className="campo busq-campo">
          <span>Orden</span>
          <select value={filtros.orden} onChange={(e) => cambiarOrden(e.target.value)}>
            {(opciones?.ordenes ?? [{ valor: 'distancia', texto: 'Más cercano' }]).map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.texto}
              </option>
            ))}
          </select>
        </label>

        <button type="submit" className="btn busq-enviar">
          Buscar
        </button>
      </form>

      <div className="busq-pie-filtros rise">
        <span className="busq-posicion-txt">
          <Icon name="ubicacion" size={13} />
          {ubicacion === 'gps' ? 'Tu ubicación' : ubicacion === 'respaldo' ? 'Centro de la zona (sin GPS)' : 'Ubicando…'}
          {' · '}
          {centro.lat.toFixed(4)}, {centro.lng.toFixed(4)}
        </span>

        {hayFiltros && (
          <div className="busq-chips">
            <span className="busq-chips__lbl">Filtros:</span>
            {filtros.q !== '' && (
              <button
                type="button"
                className="chip chip--neutro busq-chip"
                onClick={() => {
                  setTexto('')
                  setFiltros((f) => ({ ...f, q: '' }))
                  setPage(1)
                }}
              >
                «{filtros.q}» <Icon name="cerrar" size={11} />
              </button>
            )}
            {filtros.categoria > 0 && (
              <button type="button" className="chip chip--neutro busq-chip" onClick={() => cambiarCategoria(0)}>
                {nombreCategoria} <Icon name="cerrar" size={11} />
              </button>
            )}
            {filtros.radio !== (opciones?.radio_default ?? 10) && (
              <button type="button" className="chip chip--neutro busq-chip" onClick={() => cambiarRadio(opciones?.radio_default ?? 10)}>
                {filtros.radio} km <Icon name="cerrar" size={11} />
              </button>
            )}
            {filtros.orden !== 'distancia' && (
              <button type="button" className="chip chip--neutro busq-chip" onClick={() => cambiarOrden('distancia')}>
                {opciones?.ordenes.find((o) => o.valor === filtros.orden)?.texto ?? filtros.orden} <Icon name="cerrar" size={11} />
              </button>
            )}
            <button type="button" className="btn btn--claro btn--mini busq-limpiar" onClick={limpiar}>
              Limpiar
            </button>
          </div>
        )}
      </div>

      {error && <div className="aviso aviso--error">{error}</div>}

      <div className={`busq-layout${mapaVisible ? '' : ' busq-layout--sin-mapa'}`}>
        <div className="busq-resultados" ref={resultadosRef} aria-busy={cargando}>
          {datos === null && cargando && (
            <div className="busq-esqueletos">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} h={116} r={16} />
              ))}
            </div>
          )}

          {datos === null && !cargando && error !== '' && (
            <div className="card">
              <Vacio
                titulo="No se pudo buscar"
                texto="Revisa tu conexión o vuelve a intentarlo."
                accion={
                  <button type="button" className="btn btn--claro btn--mini" onClick={() => setCentro((c) => ({ ...c }))}>
                    Reintentar
                  </button>
                }
              />
            </div>
          )}

          {datos !== null && lista.length === 0 && (
            <div className="card">
              <Vacio
                titulo="Sin resultados"
                texto={
                  filtros.radio < (opciones?.radio_max ?? 30)
                    ? `No hay productos en ${filtros.radio} km. Prueba ampliando el radio o cambiando la búsqueda.`
                    : 'No hay productos que coincidan. Prueba con otra palabra o quita filtros.'
                }
                accion={
                  filtros.radio < (opciones?.radio_max ?? 30) ? (
                    <button type="button" className="btn btn--claro btn--mini" onClick={() => cambiarRadio(opciones?.radio_max ?? 30)}>
                      Ampliar a {opciones?.radio_max ?? 30} km
                    </button>
                  ) : hayFiltros ? (
                    <button type="button" className="btn btn--claro btn--mini" onClick={limpiar}>
                      Limpiar filtros
                    </button>
                  ) : undefined
                }
              />
            </div>
          )}

          {lista.map((p, i) => (
            <article
              key={p.uuid}
              className={`busq-ficha rise${activo === p.mayorista.uuid ? ' busq-ficha--activa' : ''}`}
              style={{ ['--i' as string]: Math.min(i, 8) }}
              onClick={() => setActivo(p.mayorista.uuid)}
            >
              {p.foto && (
                <img
                  className="busq-ficha__foto"
                  src={urlApp(p.foto)}
                  alt=""
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                />
              )}

              <div className="busq-ficha__cuerpo">
                <div className="busq-ficha__cab">
                  <div className="busq-ficha__texto">
                    <h3>{p.nombre}</h3>
                    <p className="busq-ficha__prov">
                      <Link
                        to={`/proveedor/${p.mayorista.uuid}`}
                        className="busq-ficha__ver"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {p.mayorista.nombre}
                      </Link>
                      <span className="chip chip--plano">{p.categoria}</span>
                      {p.distancia_km > 0 && <span className="busq-ficha__dist">a {p.distancia_km.toFixed(1)} km</span>}
                    </p>
                  </div>
                  <div className="busq-ficha__precio">
                    {money(p.precio_base)}
                    <span>
                      + IVA · {p.unidad_venta} de {p.contenido}
                    </span>
                  </div>
                </div>

                <div className="busq-ficha__pie">
                  <span className={`chip ${p.stock_disponible > 0 ? 'chip--ok' : 'chip--malo'}`}>
                    {p.stock_disponible > 0 ? `${p.stock_disponible} disponibles` : 'Agotado'}
                  </span>
                  <span className="busq-ficha__min">Mínimo de compra {money(p.mayorista.monto_minimo)}</span>

                  {rol === 'comercio' && (
                    <div className="busq-compra" onClick={(e) => e.stopPropagation()}>
                      <div className="stepper">
                        <button
                          type="button"
                          onClick={() => sumar(p, -1)}
                          disabled={cantidadDe(p) <= p.cantidad_minima}
                          aria-label={`Quitar uno de ${p.nombre}`}
                        >
                          <Icon name="menos" size={14} stroke={2} />
                        </button>
                        <span className="stepper__valor">{cantidadDe(p)}</span>
                        <button
                          type="button"
                          onClick={() => sumar(p, 1)}
                          disabled={cantidadDe(p) >= p.stock_disponible}
                          aria-label={`Agregar uno de ${p.nombre}`}
                        >
                          <Icon name="mas" size={14} stroke={2} />
                        </button>
                      </div>
                      <button
                        type="button"
                        className="btn btn--mini busq-agregar"
                        disabled={p.stock_disponible <= 0}
                        onClick={(e) => {
                          void agregarProducto(p, e.currentTarget)
                        }}
                      >
                        <Icon name="carrito" size={15} /> Agregar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </article>
          ))}

          {datos !== null && datos.paginas > 1 && (
            <nav className="busq-pag" aria-label="Paginación de resultados">
              <button
                type="button"
                className="btn btn--claro btn--mini"
                disabled={datos.page <= 1 || cargando}
                onClick={() => irPagina(datos.page - 1)}
              >
                Anterior
              </button>
              <span>
                Página {datos.page} de {datos.paginas} · {resumen}
              </span>
              <button
                type="button"
                className="btn btn--claro btn--mini"
                disabled={datos.page >= datos.paginas || cargando}
                onClick={() => irPagina(datos.page + 1)}
              >
                Siguiente
              </button>
            </nav>
          )}
        </div>

        <aside className="busq-mapa-col">
          <div className="busq-mapa-cab">
            <div className="busq-mapa-info">
              <strong>{puntos ? `${puntos.mayoristas} mayorista${puntos.mayoristas === 1 ? '' : 's'}` : 'Mapa'}</strong>
              <span>
                {puntos ? `${puntos.total} producto${puntos.total === 1 ? '' : 's'} en ${filtros.radio} km` : 'Cargando resultados…'}
              </span>
            </div>
            <button
              type="button"
              className="btn btn--claro btn--mini"
              aria-expanded={mapaVisible}
              onClick={() => setMapaVisible((v) => !v)}
            >
              <Icon name="ubicacion" size={15} /> {mapaVisible ? 'Ocultar mapa' : 'Ver mapa'}
            </button>
          </div>

          {mapaVisible &&
            (sinMapa ? (
              <div className="busq-posicion-panel" role="status">
                <Icon name="ubicacion" size={22} />
                <strong>Mapa no disponible</strong>
                <span>Se siguen mostrando los resultados de tu búsqueda.</span>
                <span className="busq-posicion-datos">
                  Centro: {centro.lat.toFixed(4)}, {centro.lng.toFixed(4)} · radio {filtros.radio} km
                </span>
                <button
                  type="button"
                  className="btn btn--claro btn--mini"
                  onClick={() => {
                    fallosRef.current = 0
                    setSinMapa(false)
                  }}
                >
                  Reintentar mapa
                </button>
              </div>
            ) : (
              <div className="busq-mapa" ref={cajaRef} aria-label="Mapa de mayoristas cercanos" />
            ))}
        </aside>
      </div>
    </>
  )
}
