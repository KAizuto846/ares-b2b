import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { estado } from '../lib/format'
import { Skeleton } from '../components/UI'
import { useNavegar } from '../store/session'
import Icon from '../components/Icon'
import { apiTracking } from '../lib/api-pedidos'
import type { DatosTracking } from '../lib/api-pedidos'

/* Leaflet llega como global desde /assets/leaflet/leaflet.js. Se tipa laxo a
   propósito: no se añaden dependencias ni @types nuevos. */
type LeafletGlobal = {
  map: (el: HTMLElement, opciones?: Record<string, unknown>) => LeafletMapa
  tileLayer: (url: string, opciones?: Record<string, unknown>) => { addTo: (m: unknown) => unknown }
  marker: (pos: [number, number], opciones?: Record<string, unknown>) => LeafletCapa
  circleMarker: (pos: [number, number], opciones?: Record<string, unknown>) => LeafletCapa
  polyline: (ruta: [number, number][], opciones?: Record<string, unknown>) => LeafletCapa
  latLngBounds: (puntos: [number, number][]) => { pad: (n: number) => unknown }
}
type LeafletMapa = {
  setView: (pos: [number, number], zoom: number) => void
  fitBounds: (b: unknown) => void
  remove: () => void
}
type LeafletCapa = {
  addTo: (m: unknown) => LeafletCapa
  setLatLng: (pos: [number, number]) => void
  setLatLngs: (ruta: [number, number][]) => void
  bindPopup: (texto: string) => LeafletCapa
}

declare global {
  interface Window { L?: LeafletGlobal }
}

/** Carga Leaflet una sola vez desde los assets del backend. */
function cargarLeaflet(): Promise<LeafletGlobal> {
  if (window.L) return Promise.resolve(window.L)

  return new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-leaflet]')) {
      const css = document.createElement('link')
      css.rel = 'stylesheet'
      css.href = '/assets/leaflet/leaflet.css'
      css.dataset.leaflet = '1'
      document.head.appendChild(css)
    }

    const script = document.createElement('script')
    script.src = '/assets/leaflet/leaflet.js'
    script.async = true
    script.dataset.leaflet = '1'
    script.onload = () => (window.L ? resolve(window.L) : reject(new Error('Leaflet no quedó disponible')))
    script.onerror = () => reject(new Error('No se pudo cargar el mapa'))
    document.head.appendChild(script)
  })
}

export default function Tracking() {
  const { uuid = '' } = useParams()
  const navegar = useNavegar()

  const [datos, setDatos] = useState<DatosTracking | null>(null)
  const [error, setError] = useState('')
  const [sinMapa, setSinMapa] = useState(false)

  const caja = useRef<HTMLDivElement | null>(null)
  const mapaEn = useRef<HTMLDivElement | null>(null)
  const mapa = useRef<LeafletMapa | null>(null)
  const marcadorRep = useRef<LeafletCapa | null>(null)
  const marcadorDestino = useRef<LeafletCapa | null>(null)
  const linea = useRef<LeafletCapa | null>(null)
  const encuadrado = useRef(false)

  const cargar = useCallback(async () => {
    try {
      const r = await apiTracking.consultar(uuid)
      setDatos(r.tracking)
      setError('')
    } catch (e) {
      setError((e as Error).message)
    }
  }, [uuid])

  useEffect(() => { void cargar() }, [cargar])

  useEffect(() => {
    const id = window.setInterval(() => { void cargar() }, 15000)
    return () => window.clearInterval(id)
  }, [cargar])

  // Dibujo del mapa: solo cuando hay seguimiento y Leaflet cargó.
  useEffect(() => {
    if (!datos?.disponible || sinMapa || !caja.current) return

    let vivo = true

    void cargarLeaflet()
      .then((L) => {
        if (!vivo || !caja.current) return

        if (!mapa.current || mapaEn.current !== caja.current) {
          // El contenedor cambia cuando el mapa se oculta y se vuelve a mostrar:
          // Leaflet no puede reengancharse, se crea de nuevo.
          mapa.current?.remove()
          marcadorRep.current = null
          marcadorDestino.current = null
          linea.current = null
          encuadrado.current = false
          mapa.current = L.map(caja.current, { scrollWheelZoom: true })
          mapaEn.current = caja.current
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap',
          }).addTo(mapa.current)
        }

        const m = mapa.current
        const destino: [number, number] | null = datos.destino ? [datos.destino.lat, datos.destino.lng] : null

        if (destino) {
          if (marcadorDestino.current) {
            marcadorDestino.current.setLatLng(destino)
          } else {
            marcadorDestino.current = L.marker(destino).addTo(m).bindPopup('Entrega: ' + (datos.destino?.calle ?? ''))
          }
        }

        if (datos.repartidor && destino) {
          const pos: [number, number] = [datos.repartidor.lat, datos.repartidor.lng]

          if (marcadorRep.current) {
            marcadorRep.current.setLatLng(pos)
          } else {
            marcadorRep.current = L.circleMarker(pos, {
              radius: 9, color: '#14532d', weight: 3, fillColor: '#2f9e63', fillOpacity: 1,
            }).addTo(m).bindPopup('Repartidor')
          }

          const ruta: [number, number][] = datos.ruta.length > 0 ? datos.ruta : [pos, destino]

          if (linea.current) {
            linea.current.setLatLngs(ruta)
          } else {
            linea.current = L.polyline(ruta, { color: '#1d4ed8', weight: 4, opacity: 0.7 }).addTo(m)
          }

          if (!encuadrado.current) {
            m.fitBounds(L.latLngBounds([pos, destino]).pad(0.25))
            encuadrado.current = true
          }
        } else if (destino && !encuadrado.current) {
          m.setView(destino, 14)
          encuadrado.current = true
        }
      })
      .catch(() => { if (vivo) setSinMapa(true) })

    return () => { vivo = false }
  }, [datos, sinMapa])

  useEffect(() => () => { mapa.current?.remove(); mapa.current = null }, [])

  if (error && !datos) return <div className="aviso aviso--error">{error}</div>

  if (!datos) {
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        <Skeleton h={30} w={260} />
        <Skeleton h={90} />
        <Skeleton h={360} />
      </div>
    )
  }

  const e = estado(datos.estado)
  const hayMapa = datos.disponible && !sinMapa

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <button type="button" className="volver" onClick={() => navegar(`/pedidos/${uuid}`)}>
        <Icon name="flecha" size={15} /> Pedido {datos.folio}
      </button>

      <header className="pagina-cab">
        <div className="rise">
          <h1>Seguimiento</h1>
          <p>{datos.mayorista} · pedido {datos.folio}</p>
        </div>
        <span className={`chip chip--${e.tono}`}>{e.texto}</span>
      </header>

      {error && <div className="aviso aviso--error">{error}</div>}

      {datos.motivo && <div className="aviso aviso--alerta">{datos.motivo}</div>}

      <div className="kpis">
        <div className="kpi">
          <span className="kpi__valor">{datos.eta_min !== null ? `${datos.eta_min} min` : '—'}</span>
          <span className="kpi__etiqueta">Llega en</span>
        </div>
        <div className="kpi">
          <span className="kpi__valor">{datos.distancia_km !== null ? `${datos.distancia_km} km` : '—'}</span>
          <span className="kpi__etiqueta">Distancia</span>
        </div>
        <div className="kpi">
          <span className="kpi__valor" style={{ fontSize: 18 }}>{e.texto}</span>
          <span className="kpi__etiqueta">Estado</span>
          <span className="kpi__nota">Se actualiza cada 15 s</span>
        </div>
      </div>

      {hayMapa ? (
        <div className="mapa-reparto" ref={caja} />
      ) : (
        <div className="mapa-reparto mapa-reparto--vacio">
          <div className="mapa-reparto__leyenda">
            <div>
              <span className="apunte">Origen del viaje</span>
              <strong>{datos.destino?.calle ?? 'Sin dirección'}</strong>
              <span className="apunte">{datos.destino ? [datos.destino.colonia, datos.destino.ciudad].filter(Boolean).join(', ') : ''}</span>
            </div>
            <div className="mapa-reparto__linea" aria-hidden="true" />
            <div>
              <span className="apunte">Repartidor</span>
              <strong>{datos.repartidor ? 'En ruta' : 'Sin posición todavía'}</strong>
              <span className="apunte">
                {datos.repartidor ? `Actualizado ${datos.repartidor.actualizado}` : 'El mapa aparece cuando el repartidor empieza a transmitir.'}
              </span>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button className="btn btn--claro" onClick={() => void cargar()}>Actualizar ahora</button>
        <button className="btn btn--claro" onClick={() => navegar(`/pedidos/${uuid}`)}>Volver al pedido</button>
      </div>
    </div>
  )
}
