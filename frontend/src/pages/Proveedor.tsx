import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import Icon from '../components/Icon'
import { Skeleton, Vacio } from '../components/UI'
import { money } from '../lib/format'
import { useNavegar } from '../store/session'
import { apiProveedor } from '../lib/api-proveedor'
import type { ProductoProveedor, Proveedor as Ficha } from '../lib/api-proveedor'

export default function Proveedor() {
  const { uuid } = useParams<{ uuid: string }>()
  const navegar = useNavegar()
  const [ficha, setFicha] = useState<Ficha | null>(null)
  const [productos, setProductos] = useState<ProductoProveedor[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!uuid) return
    let vivo = true
    apiProveedor(uuid)
      .then((r) => { if (vivo) { setFicha(r.proveedor); setProductos(r.productos) } })
      .catch((e) => { if (vivo) setError((e as Error).message) })
    return () => { vivo = false }
  }, [uuid])

  if (error) return <div className="aviso aviso--error">{error}</div>

  if (!ficha) {
    return <div className="card"><div className="card__cuerpo" style={{ display: 'grid', gap: 12 }}>
      <Skeleton h={22} w={240} />
      <Skeleton h={16} w="60%" />
      <Skeleton h={120} />
    </div></div>
  }

  return (
    <>
      <header className="pagina-cab">
        <div>
          <h1>{ficha.nombre}</h1>
          <p>
            {ficha.giro || 'Proveedor'}
            {ficha.reputacion !== null ? ` · ★ ${ficha.reputacion.toFixed(1)} / 5` : ' · Sin calificaciones'}
            {ficha.ciudad ? ` · ${ficha.ciudad}` : ''}
          </p>
        </div>
        <button className="btn btn--claro" onClick={() => navegar('/buscar')}>
          <Icon name="flecha" size={16} /> Volver a la búsqueda
        </button>
      </header>

      <div className="kpis" style={{ marginBottom: 18 }}>
        <div className="kpi"><span className="kpi__valor" style={{ fontSize: 16 }}>{ficha.horario}</span><span className="kpi__etiqueta">Horario</span></div>
        <div className="kpi"><span className="kpi__valor" style={{ fontSize: 16 }}>{money(ficha.monto_minimo)}</span><span className="kpi__etiqueta">Pedido mínimo</span></div>
        <div className="kpi"><span className="kpi__valor" style={{ fontSize: 16 }}>{ficha.total_productos}</span><span className="kpi__etiqueta">Productos</span></div>
      </div>

      <div className="card">
        <div className="card__cab"><h2>Catálogo</h2></div>
        <div className="card__cuerpo" style={{ padding: 0 }}>
          {productos.length === 0 ? (
            <Vacio titulo="Sin productos disponibles" texto="Este proveedor no tiene catálogo activo ahora mismo." />
          ) : (
            <div className="tabla-scroll">
              <table className="tabla">
                <thead>
                  <tr><th>Producto</th><th>Precio</th><th>Presentación</th><th>Stock</th></tr>
                </thead>
                <tbody>
                  {productos.map((p) => (
                    <tr key={p.uuid}>
                      <td>
                        <strong>{p.nombre}</strong>
                        <div style={{ fontSize: 12, color: 'var(--faint)' }}>{p.categoria}</div>
                      </td>
                      <td className="num">{money(p.precio)}</td>
                      <td>{p.unidad} · {p.contenido}</td>
                      <td className="num">{p.stock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
