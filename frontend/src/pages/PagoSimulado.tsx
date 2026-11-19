import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { estado, money } from '../lib/format'
import { Skeleton } from '../components/UI'
import { useNavegar, useSesion } from '../store/session'
import Icon from '../components/Icon'
import { apiPago } from '../lib/api-pedidos'
import type { PedidoDelPago, PagoSimulado as Pago } from '../lib/api-pedidos'

const ETIQUETA_PAGO: Record<string, { texto: string; tono: string }> = {
  creado: { texto: 'Por pagar', tono: 'alerta' },
  autorizado: { texto: 'Autorizado', tono: 'ok' },
  capturado: { texto: 'Cobrado', tono: 'ok' },
  fallido: { texto: 'Rechazado', tono: 'malo' },
  reembolsado: { texto: 'Reembolsado', tono: 'neutro' },
  reembolsado_parcial: { texto: 'Reembolso parcial', tono: 'neutro' },
}

export default function PagoSimulado() {
  const { referencia = '' } = useParams()
  const { aviso } = useSesion()
  const navegar = useNavegar()

  const [pago, setPago] = useState<Pago | null>(null)
  const [pedidos, setPedidos] = useState<PedidoDelPago[]>([])
  const [error, setError] = useState('')
  const [pagando, setPagando] = useState(false)
  const [hecho, setHecho] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    try {
      const r = await apiPago.ver(referencia)
      setPago(r.pago)
      setPedidos(r.pedidos)
      setError('')
    } catch (e) {
      setError((e as Error).message)
    }
  }, [referencia])

  useEffect(() => { void cargar() }, [cargar])

  const pagar = async () => {
    setPagando(true)
    setError('')
    try {
      const r = await apiPago.confirmar(referencia)
      setHecho(r.mensaje)
      aviso(r.mensaje)
      if (r.pedidos.length > 0) setPedidos(r.pedidos)
      await cargar()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setPagando(false)
    }
  }

  if (error && !pago) return <div className="aviso aviso--error">{error}</div>
  if (!pago) {
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        <Skeleton h={28} w={240} />
        <Skeleton h={220} />
      </div>
    )
  }

  const e = ETIQUETA_PAGO[pago.estado] ?? { texto: pago.estado, tono: 'neutro' }
  const pagado = pago.pagado

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 560 }}>
      <button type="button" className="volver" onClick={() => navegar('/pedidos')}>
        <Icon name="flecha" size={15} /> Pedidos
      </button>

      <header className="pagina-cab">
        <div className="rise">
          <h1>Pago del pedido</h1>
          <p>Pasarela en modo simulado: no se cobra dinero real.</p>
        </div>
      </header>

      {error && <div className="aviso aviso--error">{error}</div>}

      {hecho && (
        <div className="aviso aviso--ok">
          <strong>{hecho}</strong>
          <div style={{ fontSize: 13, marginTop: 4 }}>
            {pedidos.length === 1 ? 'El pedido ya está con el mayorista.' : 'Los pedidos ya están con sus mayoristas.'}
          </div>
        </div>
      )}

      <section className="card rise">
        <div className="card__cuerpo" style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <span className="apunte">Total a pagar</span>
            <span className={`chip chip--${e.tono}`}>{e.texto}</span>
          </div>

          <div>
            <div className="pago-monto">{money(pago.monto)}</div>
            <div className="apunte">Referencia {pago.referencia}</div>
            <div className="apunte">Método {pago.metodo} · creado {pago.creado}</div>
          </div>

          {pedidos.length > 0 && (
            <div style={{ display: 'grid', gap: 6 }}>
              <span className="apunte">{pedidos.length === 1 ? 'Pedido' : 'Pedidos'} que se pagan</span>
              {pedidos.map((p) => {
                const ep = estado(p.estado)
                return (
                  <div className="dato" key={p.uuid}>
                    <code className="folio">{p.uuid.slice(0, 8)}</code>
                    <span className={`chip chip--${ep.tono}`}>{ep.texto}</span>
                    <strong className="num">{money(p.total)}</strong>
                  </div>
                )
              })}
            </div>
          )}

          {pagado ? (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn" onClick={() => navegar('/pedidos')}>Ver mis pedidos</button>
              <button className="btn btn--claro" onClick={() => void cargar()}>Actualizar estado</button>
            </div>
          ) : (
            <button className="btn btn--bloque" style={{ height: 46 }} onClick={() => void pagar()} disabled={pagando}>
              {pagando ? 'Confirmando…' : 'Pagar ahora'}
            </button>
          )}

          <p className="apunte" style={{ textAlign: 'center' }}>
            La confirmación simula la firma HMAC del webhook real: el pedido avanza solo cuando la pasarela responde.
          </p>
        </div>
      </section>
    </div>
  )
}
