import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { Acceso, Metrica, Pedido } from '../lib/api'
import { estado, money, relativo } from '../lib/format'
import { useNavegar } from '../store/session'
import Icon from '../components/Icon'
import { Skeleton } from '../components/UI'

type Datos = { nombre: string; rol: string; metricas: Metrica[]; accesos: Acceso[]; herramientas: Acceso[] }

export default function Inicio() {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [error, setError] = useState('')
  const navegar = useNavegar()

  useEffect(() => {
    api.inicio().then(setDatos).catch((e) => setError((e as Error).message))
    api.pedidos().then((r) => setPedidos(r.pedidos.slice(0, 4))).catch(() => setPedidos([]))
  }, [])

  if (error) return <div className="aviso aviso--error">{error}</div>

  if (!datos) {
    return (
      <div style={{ display: 'grid', gap: 18 }}>
        <Skeleton h={34} w={320} />
        <div className="kpis">{[0, 1, 2].map((i) => <Skeleton key={i} h={84} />)}</div>
        <div className="card"><div className="card__cuerpo" style={{ display: 'grid', gap: 12 }}><Skeleton h={56} /><Skeleton h={56} /><Skeleton h={56} /></div></div>
      </div>
    )
  }

  const primero = datos.nombre.split(' ')[0]

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <header className="pagina-cab">
        <div className="rise">
          <h1>Hola, {primero}</h1>
          <p>¿Con qué empezamos hoy? Esto es lo que tienes en marcha.</p>
        </div>
        {datos.rol === 'comercio' && (
          <button className="btn rise" style={{ ['--i' as string]: 1 }} onClick={() => navegar('/buscar')}>
            <Icon name="buscar" size={17} /> Buscar productos
          </button>
        )}
      </header>

      <section className="kpis rise" style={{ ['--i' as string]: 1 }}>
        {datos.metricas.map((m) => (
          <a className="kpi" key={m.etiqueta} href="/spa" onClick={(e) => { e.preventDefault(); navegar(m.href) }}>
            <span className="kpi__valor">{m.valor}</span>
            <span className="kpi__etiqueta">{m.etiqueta}</span>
            {m.nota && <span className="kpi__nota">{m.nota}</span>}
          </a>
        ))}
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: (datos.rol === 'comercio' || datos.herramientas.length > 0) ? 'minmax(0,1.5fr) minmax(0,1fr)' : 'minmax(0,1fr)', gap: 16, alignItems: 'start' }} className="inicio-grid">
        <section className="card rise" style={{ ['--i' as string]: 2 }}>
          <div className="card__cab"><h2>Tu día a día</h2></div>
          <div className="card__cuerpo" style={{ display: 'grid', gap: 8 }}>
            {datos.accesos.map((a, i) => (
              <a
                key={a.titulo}
                href="/spa"
                onClick={(e) => { e.preventDefault(); navegar(a.href) }}
                className="acceso"
                style={{ ['--i' as string]: i }}
              >
                <span className="acceso__icono"><Icon name={a.icono} size={19} /></span>
                <span className="acceso__texto"><strong>{a.titulo}</strong><span>{a.texto}</span></span>
                {!!a.globos && <span className="nav__globo" style={{ background: 'var(--oro)' }}>{a.globos}</span>}
                <Icon name="flecha" size={17} />
              </a>
            ))}
          </div>
        </section>

        {datos.rol === 'comercio' ? (
          <aside className="card rise" style={{ ['--i' as string]: 3, overflow: 'hidden' }}>
            <div className="card__cab">
              <h2>Últimos pedidos</h2>
              <button className="btn btn--fantasma btn--mini" style={{ marginLeft: 'auto' }} onClick={() => navegar('/pedidos')}>Ver todos</button>
            </div>
            {pedidos.length === 0 ? (
              <div className="card__cuerpo" style={{ color: 'var(--muted)', fontSize: 13.5 }}>Todavía no hay pedidos.</div>
            ) : (
              <div style={{ display: 'grid' }}>
                {pedidos.map((p) => {
                  const e = estado(p.estado)
                  return (
                    <div key={p.uuid} className="mini-pedido">
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ fontSize: 13.5, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.contraparte}</strong>
                        <span style={{ fontSize: 12, color: 'var(--faint)' }}>{relativo(p.created_at)} · {money(p.total)}</span>
                      </div>
                      <span className={`chip chip--${e.tono}`}>{e.texto}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </aside>
        ) : datos.herramientas.length > 0 && (
          <aside className="card rise" style={{ ['--i' as string]: 3 }}>
            <div className="card__cab"><h2>Herramientas</h2></div>
            <div className="card__cuerpo" style={{ display: 'grid', gap: 6 }}>
              {datos.herramientas.map((h) => (
                <a key={h.titulo} href="/spa" onClick={(e) => { e.preventDefault(); navegar(h.href) }} className="acceso acceso--compacto">
                  <span className="acceso__icono"><Icon name={h.icono} size={18} /></span>
                  <span className="acceso__texto"><strong>{h.titulo}</strong><span>{h.texto}</span></span>
                </a>
              ))}
            </div>
          </aside>
        )}
      </div>

      <style>{`
        .acceso {
          display: flex; align-items: center; gap: 12px; padding: 11px 12px;
          border-radius: 12px; text-decoration: none; color: inherit;
          border: 1px solid transparent;
          transition: background var(--t-fast), border-color var(--t-fast), transform var(--t-fast);
        }
        .acceso:hover { background: #fafbf6; border-color: var(--line-soft); transform: translateX(2px); }
        .acceso__icono {
          width: 38px; height: 38px; border-radius: 11px; flex: 0 0 auto;
          display: grid; place-items: center;
          background: var(--verde-suave); color: var(--verde);
        }
        .acceso__texto { display: grid; gap: 1px; min-width: 0; flex: 1; }
        .acceso__texto strong { font-size: 14px; }
        .acceso__texto span { font-size: 12.5px; color: var(--muted); }
        .acceso--compacto { padding: 9px 10px; }
        .mini-pedido { display: flex; align-items: center; gap: 10px; padding: 11px 16px; border-top: 1px solid var(--line-soft); }
        .mini-pedido:first-child { border-top: 0; }
        @media (max-width: 900px) { .inicio-grid { grid-template-columns: minmax(0,1fr) !important; } }
      `}</style>
    </div>
  )
}
