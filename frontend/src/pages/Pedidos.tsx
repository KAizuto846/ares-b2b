import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { Pedido } from '../lib/api'
import { estado, fecha, money, relativo } from '../lib/format'
import { Skeleton, Vacio } from '../components/UI'
import { useNavegar } from '../store/session'

export default function Pedidos() {
  const [pedidos, setPedidos] = useState<Pedido[] | null>(null)
  const [error, setError] = useState('')
  const navegar = useNavegar()

  useEffect(() => { api.pedidos().then((r) => setPedidos(r.pedidos)).catch((e) => { setError((e as Error).message); setPedidos([]) }) }, [])

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <header className="pagina-cab"><div className="rise"><h1>Pedidos</h1><p>Todo lo que has comprado y en qué va.</p></div></header>

      {error && <div className="aviso aviso--error">{error}</div>}

      {!pedidos ? (
        <div className="card"><div className="card__cuerpo" style={{ display: 'grid', gap: 10 }}><Skeleton h={40} /><Skeleton h={40} /><Skeleton h={40} /></div></div>
      ) : pedidos.length === 0 ? (
        <div className="card"><Vacio titulo="Todavía no tienes pedidos" texto="Cuando confirmes tu primer carrito aparecerá aquí." accion={<button className="btn" onClick={() => navegar('/buscar')}>Buscar productos</button>} /></div>
      ) : (
        <div className="card rise" style={{ ['--i' as string]: 1, overflow: 'hidden' }}>
          <table className="tabla">
            <thead><tr><th>Pedido</th><th>Proveedor</th><th>Estado</th><th>Fecha</th><th style={{ textAlign: 'right' }}>Total</th></tr></thead>
            <tbody>
              {pedidos.map((p) => {
                const e = estado(p.estado)
                return (
                  <tr key={p.uuid}>
                    <td><code style={{ fontSize: 12.5 }}>{p.uuid.slice(0, 8)}</code><div style={{ fontSize: 12, color: 'var(--faint)' }}>{p.lineas} línea{p.lineas === 1 ? '' : 's'}</div></td>
                    <td>{p.contraparte}</td>
                    <td><span className={`chip chip--${e.tono}`}>{e.texto}</span></td>
                    <td><span title={fecha(p.created_at)}>{relativo(p.created_at)}</span></td>
                    <td className="num" style={{ textAlign: 'right', fontWeight: 650 }}>{money(p.total)}</td>
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
