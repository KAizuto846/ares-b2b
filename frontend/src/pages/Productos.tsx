import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { money } from '../lib/format'
import { Skeleton, Vacio } from '../components/UI'
import Icon from '../components/Icon'

type P = Record<string, unknown>

export default function Productos() {
  const [productos, setProductos] = useState<P[] | null>(null)
  const [q, setQ] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const t = window.setTimeout(() => {
      api.productos(q).then((r) => setProductos(r.productos)).catch((e) => { setError((e as Error).message); setProductos([]) })
    }, q ? 250 : 0)
    return () => window.clearTimeout(t)
  }, [q])

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <header className="pagina-cab">
        <div className="rise"><h1>Mi catálogo</h1><p>Precios, presentación y existencias de tus productos.</p></div>
      </header>

      <div className="card card--plana rise" style={{ ['--i' as string]: 1 }}>
        <div className="card__cuerpo" style={{ padding: 12 }}>
          <div className="buscador__campo" style={{ maxWidth: 420 }}>
            <Icon name="buscar" size={18} />
            <input type="search" placeholder="Buscar por nombre…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar en el catálogo" />
          </div>
        </div>
      </div>

      {error && <div className="aviso aviso--error">{error}</div>}

      {!productos ? (
        <div className="card"><div className="card__cuerpo" style={{ display: 'grid', gap: 10 }}><Skeleton h={38} /><Skeleton h={38} /><Skeleton h={38} /></div></div>
      ) : productos.length === 0 ? (
        <div className="card"><Vacio titulo="Sin productos" texto="Todavía no hay productos en tu catálogo." /></div>
      ) : (
        <div className="card rise" style={{ ['--i' as string]: 2, overflow: 'hidden' }}>
          <table className="tabla">
            <thead><tr><th>Producto</th><th>Precio</th><th>Unidad</th><th>Stock</th><th>Estado</th></tr></thead>
            <tbody>
              {productos.map((p) => {
                const stock = Number(p.stock_disponible ?? 0)
                const activo = Number(p.activo ?? 1) === 1
                return (
                  <tr key={String(p.uuid)}>
                    <td><strong style={{ fontWeight: 600 }}>{String(p.nombre)}</strong><div style={{ fontSize: 12, color: 'var(--faint)' }}>{String(p.categoria ?? '')}</div></td>
                    <td className="num">{money(Number(p.precio_base ?? 0))}</td>
                    <td style={{ fontSize: 13, color: 'var(--ink-2)' }}>{String(p.unidad_venta ?? '—')} de {String(p.contenido ?? '—')}</td>
                    <td className="num" style={{ color: stock === 0 ? 'var(--rojo)' : 'inherit' }}>{stock}</td>
                    <td><span className={`chip chip--${activo ? 'ok' : 'alerta'}`}>{activo ? 'activo' : 'inactivo'}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
