import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api'
import type { Producto } from '../lib/api'
import { useSesion } from '../store/session'
import Icon from '../components/Icon'
import { Skeleton, Vacio } from '../components/UI'
import { money } from '../lib/format'

export default function Buscar() {
  const { agregar, rol } = useSesion()
  const [q, setQ] = useState('')
  const [radio, setRadio] = useState('25')
  const [orden, setOrden] = useState('distancia')
  const [productos, setProductos] = useState<Producto[] | null>(null)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState('')
  const [cantidades, setCantidades] = useState<Record<string, number>>({})
  const temporizador = useRef<number | undefined>(undefined)

  useEffect(() => {
    const correr = () => {
      setProductos(null)
      api.buscar({ q, radio, orden, lat: 19.4326, lng: -99.1332, per_page: 24 })
        .then((r) => { setProductos(r.resultados); setTotal(r.total); setError('') })
        .catch((e) => { setError((e as Error).message); setProductos([]) })
    }
    window.clearTimeout(temporizador.current)
    temporizador.current = window.setTimeout(correr, q ? 260 : 0)
    return () => window.clearTimeout(temporizador.current)
  }, [q, radio, orden])

  const cantidadDe = (p: Producto) => cantidades[p.uuid] ?? p.cantidad_minima

  const sumar = (p: Producto, delta: number) => {
    setCantidades((prev) => {
      const actual = prev[p.uuid] ?? p.cantidad_minima
      const paso = Math.max(1, p.multiplo_venta)
      const siguiente = Math.min(p.stock_disponible, Math.max(p.cantidad_minima, actual + delta * paso))
      return { ...prev, [p.uuid]: siguiente }
    })
  }

  const agregarProducto = async (p: Producto, boton: HTMLElement) => {
    await agregar(p.uuid, cantidadDe(p), boton)
  }

  const resumen = useMemo(() => (total === 1 ? '1 producto' : `${total} productos`), [total])

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <header className="pagina-cab">
        <div className="rise">
          <h1>Buscar productos</h1>
          <p>{productos === null ? 'Buscando en tu zona…' : `${resumen} de proveedores verificados cerca de ti.`}</p>
        </div>
      </header>

      <div className="card card--plana rise" style={{ ['--i' as string]: 1 }}>
        <div className="card__cuerpo" style={{ padding: 12 }}>
          <div className="buscador">
            <div className="buscador__campo">
              <Icon name="buscar" size={18} />
              <input
                type="search"
                placeholder="Busca por nombre, marca o categoría…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Buscar productos"
              />
            </div>
            <select value={radio} onChange={(e) => setRadio(e.target.value)} aria-label="Radio de búsqueda">
              <option value="5">5 km</option>
              <option value="10">10 km</option>
              <option value="25">25 km</option>
              <option value="30">30 km</option>
            </select>
            <select value={orden} onChange={(e) => setOrden(e.target.value)} aria-label="Ordenar por">
              <option value="distancia">Más cercano</option>
              <option value="precio_asc">Menor precio</option>
              <option value="reputacion">Mejor calificados</option>
            </select>
          </div>
        </div>
      </div>

      {error && <div className="aviso aviso--error">{error}</div>}

      {productos === null ? (
        <div className="rejilla">
          {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} h={176} r={18} />)}
        </div>
      ) : productos.length === 0 ? (
        <div className="card"><Vacio titulo="Sin resultados" texto="Prueba con otra palabra o amplía la distancia." /></div>
      ) : (
        <div className="rejilla">
          {productos.map((p, i) => (
            <article className="producto rise" key={p.uuid} style={{ ['--i' as string]: Math.min(i, 8) }}>
              <div className="producto__cab">
                <div style={{ minWidth: 0 }}>
                  <h3 className="producto__nombre">{p.nombre}</h3>
                  <p className="producto__prov">
                    {p.mayorista.nombre}
                    {p.distancia_km > 0 && <><span className="punto" />a {p.distancia_km.toFixed(1)} km</>}
                  </p>
                </div>
                <div className="producto__precio">
                  {money(p.precio_base)}
                  <span>+ IVA · {p.unidad_venta} de {p.contenido}</span>
                </div>
              </div>

              <div className="producto__meta">
                <span className={`chip ${p.stock_disponible > 0 ? 'chip--ok' : 'chip--malo'}`}>
                  {p.stock_disponible > 0 ? `${p.stock_disponible} disponibles` : 'Agotado'}
                </span>
                <span className="chip chip--plano">{p.categoria}</span>
              </div>

              {rol === 'comercio' && (
                <div className="producto__compra">
                  <div className="stepper">
                    <button type="button" onClick={() => sumar(p, -1)} aria-label={`Quitar uno de ${p.nombre}`} disabled={cantidadDe(p) <= p.cantidad_minima}>
                      <Icon name="menos" size={14} stroke={2} />
                    </button>
                    <span className="stepper__valor">{cantidadDe(p)}</span>
                    <button type="button" onClick={() => sumar(p, 1)} aria-label={`Agregar uno de ${p.nombre}`} disabled={cantidadDe(p) >= p.stock_disponible}>
                      <Icon name="mas" size={14} stroke={2} />
                    </button>
                  </div>
                  <button
                    className="btn btn--mini producto__btn"
                    disabled={p.stock_disponible <= 0}
                    onClick={(e) => agregarProducto(p, e.currentTarget)}
                  >
                    <Icon name="carrito" size={15} /> Agregar
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      <style>{`
        .rejilla { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 12px; }
        .producto {
          display: grid; gap: 10px; padding: 14px 16px; min-height: 156px; align-content: space-between;
          background: #fff; border: 1px solid var(--line); border-radius: var(--r-lg);
          box-shadow: var(--s-1);
          transition: transform var(--t-base) var(--ease-out), box-shadow var(--t-base), border-color var(--t-base);
        }
        .producto:hover { transform: translateY(-2px); box-shadow: var(--s-2); border-color: #d3dad0; }
        .producto__cab { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
        .producto__nombre { font-size: 15px; line-height: 1.3; }
        .producto__prov { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--muted); margin-top: 3px; flex-wrap: wrap; }
        .producto__precio { text-align: right; font-size: 19px; font-weight: 750; letter-spacing: -.02em; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .producto__precio span { display: block; font-size: 12px; font-weight: 500; color: var(--faint); letter-spacing: 0; }
        .producto__meta { display: flex; align-items: center; gap: 10px; }
        .producto__prov .punto { width: 3px; height: 3px; border-radius: 99px; background: var(--faint); display: inline-block; }
        .producto__meta { justify-content: flex-start; }
        @media (max-width: 480px) {
          .producto { min-height: 0; }
          .producto__meta .chip--plano { display: none; }
          .producto .stepper button { width: 44px; height: 44px; }
          .producto__btn { min-height: 44px; }
        }
        .producto__compra { display: flex; align-items: center; gap: 8px; }
        .producto__btn { margin-left: auto; }
        .producto .stepper button:disabled { opacity: .35; cursor: not-allowed; }
      `}</style>
    </div>
  )
}
