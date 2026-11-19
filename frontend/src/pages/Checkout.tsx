import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { Carrito } from '../lib/api'
import { useNavegar, useSesion } from '../store/session'
import { money } from '../lib/format'
import Icon from '../components/Icon'
import { Skeleton, Vacio } from '../components/UI'

type Direccion = { id: number; calle: string; colonia: string; ciudad: string }

export default function Checkout() {
  const { refrescarCarrito, aviso } = useSesion()
  const navegar = useNavegar()
  const [resumen, setResumen] = useState<Carrito | null>(null)
  const [direcciones, setDirecciones] = useState<Direccion[]>([])
  const [elegida, setElegida] = useState<number>(0)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [listo, setListo] = useState<{ pedidos: { uuid: string; total: number }[]; total: number; quedan: number } | null>(null)

  useEffect(() => {
    api.checkout()
      .then((r) => {
        setResumen(r.resumen)
        setDirecciones(r.direcciones)
        if (r.direcciones[0]) setElegida(r.direcciones[0].id)
      })
      .catch((e) => setError((e as Error).message))
  }, [])

  const confirmar = async () => {
    setEnviando(true)
    setError('')
    try {
      const r = await api.confirmar(elegida)
      setListo(r.data)
      await refrescarCarrito()
      aviso('Pedido confirmado')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  if (listo) {
    return (
      <div className="card rise" style={{ maxWidth: 620, margin: '40px auto' }}>
        <div className="card__cuerpo" style={{ display: 'grid', gap: 14, textAlign: 'center', padding: 34 }}>
          <div style={{ display: 'grid', placeItems: 'center', width: 56, height: 56, borderRadius: 99, background: 'var(--verde-suave)', color: 'var(--verde)', margin: '0 auto' }}>
            <Icon name="ok" size={26} stroke={2.2} />
          </div>
          <h1 style={{ fontSize: 24 }}>Pedido confirmado</h1>
          <p style={{ color: 'var(--muted)' }}>Reservamos el stock por 15 minutos. Confirma el pago para que el mayorista lo reciba.</p>
          <div className="kpis" style={{ marginTop: 6 }}>
            <div className="kpi"><span className="kpi__valor">{money(listo.total)}</span><span className="kpi__etiqueta">Total</span></div>
            <div className="kpi"><span className="kpi__valor">{listo.pedidos.length}</span><span className="kpi__etiqueta">Pedidos generados</span></div>
            {listo.quedan > 0 && <div className="kpi"><span className="kpi__valor">{listo.quedan}</span><span className="kpi__etiqueta">Proveedores en el carrito</span></div>}
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 8 }}>
            <button className="btn" onClick={() => navegar('/pedidos')}>Ver mis pedidos</button>
            <button className="btn btn--claro" onClick={() => navegar('/buscar')}>Seguir comprando</button>
          </div>
        </div>
      </div>
    )
  }

  if (!resumen && error) return <div className="aviso aviso--error">{error}</div>
  if (!resumen) return <div style={{ display: 'grid', gap: 12 }}><Skeleton h={28} w={260} /><Skeleton h={280} /></div>

  const listos = resumen.grupos.filter((g) => g.listo)
  const quedan = resumen.grupos.length - listos.length
  const sinNada = listos.length === 0

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <header className="pagina-cab"><div className="rise"><h1>Confirmar pedido</h1><p>Revisa la dirección y lo que se va a cobrar.</p></div></header>
      {error && <div className="aviso aviso--error">{error}</div>}

      {sinNada ? (
        <div className="card"><Vacio titulo="Ningún proveedor alcanza su mínimo" texto="Agrega más productos para poder confirmar." accion={<button className="btn" onClick={() => navegar('/buscar')}>Buscar productos</button>} /></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', gap: 18, alignItems: 'start' }} className="checkout-grid">
          <section className="card rise" style={{ ['--i' as string]: 1 }}>
            <div className="card__cab"><h2>Resumen</h2></div>
            <div className="card__cuerpo" style={{ display: 'grid', gap: 12 }}>
              {listos.map((g) => (
                <div key={g.mayorista_uuid} style={{ display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <strong style={{ fontSize: 14 }}>{g.mayorista} <span style={{ color: 'var(--faint)', fontWeight: 500, fontSize: 12.5 }}>({g.items.length} productos)</span></strong>
                    <span className="num" style={{ fontWeight: 700 }}>{money(g.total)}</span>
                  </div>
                  {g.items.map((i) => (
                    <div key={i.producto_uuid} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--muted)', paddingLeft: 4 }}>
                      <span>{i.cantidad} × {i.nombre}</span>
                      <span className="num">{money(i.total)}</span>
                    </div>
                  ))}
                </div>
              ))}

              {quedan > 0 && (
                <p className="aviso aviso--info">
                  {quedan} proveedor{quedan === 1 ? '' : 'es'} aún no alcanza{quedan === 1 ? '' : 'n'} su mínimo y se queda{quedan === 1 ? '' : 'n'} en tu carrito.
                </p>
              )}

              <dl className="cifras" style={{ marginTop: 4 }}>
                <div><dt>Subtotal</dt><dd>{money(resumen.subtotal_listo)}</dd></div>
                <div><dt>IVA (16%)</dt><dd>{money(resumen.iva_listo)}</dd></div>
                <div className="cifras__total"><dt>Total</dt><dd>{money(resumen.total_listo)}</dd></div>
              </dl>
            </div>
          </section>

          <section className="card rise" style={{ ['--i' as string]: 2 }}>
            <div className="card__cab"><h2>Dirección de entrega</h2></div>
            <div className="card__cuerpo" style={{ display: 'grid', gap: 12 }}>
              {direcciones.length === 0 ? (
                <p style={{ fontSize: 13.5, color: 'var(--muted)' }}>No tienes direcciones guardadas.</p>
              ) : (
                <label className="campo">
                  <span>Entregar en</span>
                  <select value={elegida} onChange={(e) => setElegida(Number(e.target.value))}>
                    {direcciones.map((d) => <option key={d.id} value={d.id}>{d.calle}, {d.colonia} · {d.ciudad}</option>)}
                  </select>
                </label>
              )}
              <button className="btn btn--bloque" disabled={enviando || direcciones.length === 0} onClick={confirmar}>
                {enviando ? 'Confirmando…' : 'Confirmar pedido'}
              </button>
              <p style={{ fontSize: 12, color: 'var(--faint)', textAlign: 'center' }}>Al confirmar se reserva el stock por 15 minutos.</p>
            </div>
          </section>
        </div>
      )}
      <style>{`@media (max-width: 900px){ .checkout-grid { grid-template-columns: minmax(0,1fr) !important; } }`}</style>
    </div>
  )
}
