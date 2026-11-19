import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { Pedido } from '../lib/api'
import { estado, money, relativo } from '../lib/format'
import { Skeleton } from '../components/UI'
import Icon from '../components/Icon'
import { useNavegar } from '../store/session'

export default function Admin() {
  const [r, setR] = useState<Record<string, number> | null>(null)
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const navegar = useNavegar()

  useEffect(() => {
    api.admin().then((x) => setR(x.resumen)).catch(() => setR({}))
    api.pedidos().then((x) => setPedidos(x.pedidos.slice(0, 6))).catch(() => setPedidos([]))
  }, [])

  if (!r) return <div className="kpis">{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={84} />)}</div>

  const tarjetas = [
    { k: 'usuarios', t: 'Usuarios' },
    { k: 'comercios', t: 'Comercios' },
    { k: 'mayoristas', t: 'Mayoristas' },
    { k: 'pedidos', t: 'Pedidos totales' },
    { k: 'kyc', t: 'KYC pendientes', alerta: true },
    { k: 'reclamos', t: 'Reclamos abiertos', alerta: true },
  ]

  const pendientes = [
    { n: r.kyc ?? 0, t: 'Verificaciones KYC por revisar', href: '/admin' },
    { n: r.reclamos ?? 0, t: 'Reclamos abiertos', href: '/admin' },
  ].filter((p) => p.n > 0)

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <header className="pagina-cab"><div className="rise"><h1>Panel de administración</h1><p>Estado general de la plataforma.</p></div></header>

      <div className="kpis rise" style={{ ['--i' as string]: 1 }}>
        {tarjetas.map((t) => {
          const v = r[t.k] ?? 0
          const alerta = t.alerta && v > 0
          return (
            <div className={`kpi ${alerta ? 'kpi--alerta' : ''}`} key={t.k}>
              <span className="kpi__valor">{v}</span>
              <span className="kpi__etiqueta">{t.t}</span>
              {t.alerta && <span className="kpi__nota">{v > 0 ? 'Requiere revisión' : 'Al día'}</span>}
            </div>
          )
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }} className="admin-grid">
        <section className="card rise" style={{ ['--i' as string]: 2, overflow: 'hidden' }}>
          <div className="card__cab">
            <h2>Últimos pedidos</h2>
            <button className="btn btn--fantasma btn--mini" style={{ marginLeft: 'auto' }} onClick={() => navegar('/pedidos')}>Ver todos</button>
          </div>
          {pedidos.length === 0 ? (
            <div className="card__cuerpo" style={{ color: 'var(--muted)', fontSize: 13.5 }}>Sin pedidos todavía.</div>
          ) : (
            <table className="tabla">
              <thead><tr><th>Pedido</th><th>Proveedor</th><th>Estado</th><th style={{ textAlign: 'right' }}>Total</th></tr></thead>
              <tbody>
                {pedidos.map((p) => {
                  const e = estado(p.estado)
                  return (
                    <tr key={p.uuid}>
                      <td><code style={{ fontSize: 12.5 }}>{p.uuid.slice(0, 8)}</code><div style={{ fontSize: 12, color: 'var(--faint)' }}>{relativo(p.created_at)}</div></td>
                      <td>{p.contraparte}</td>
                      <td><span className={`chip chip--${e.tono}`}>{e.texto}</span></td>
                      <td className="num" style={{ textAlign: 'right', fontWeight: 650 }}>{money(p.total)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </section>

        <aside className="card rise" style={{ ['--i' as string]: 3 }}>
          <div className="card__cab"><h2>Requiere tu atención</h2></div>
          <div className="card__cuerpo" style={{ display: 'grid', gap: 8 }}>
            {pendientes.length === 0 ? (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', color: 'var(--verde)', fontSize: 13.5 }}>
                <Icon name="ok" size={18} /> Nada pendiente por hoy.
              </div>
            ) : pendientes.map((p) => (
              <a key={p.t} href="/spa/admin" onClick={(e) => { e.preventDefault(); navegar(p.href) }} className="pendiente">
                <span className="pendiente__n">{p.n}</span>
                <span>{p.t}</span>
                <Icon name="flecha" size={16} />
              </a>
            ))}
          </div>
        </aside>
      </div>

      <style>{`
        .pendiente { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 12px; text-decoration: none; color: inherit; font-size: 13.5px; transition: background var(--t-fast), transform var(--t-fast); }
        .pendiente:hover { background: #fafbf6; transform: translateX(2px); }
        .pendiente__n { display: grid; place-items: center; min-width: 26px; height: 26px; border-radius: 8px; background: var(--oro-suave); color: #6b4a08; font-weight: 750; font-size: 13px; }
        .pendiente svg { margin-left: auto; color: var(--faint); }
        @media (max-width: 900px) { .admin-grid { grid-template-columns: minmax(0,1fr) !important; } }
      `}</style>
    </div>
  )
}
