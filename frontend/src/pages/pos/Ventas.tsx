import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../components/Icon'
import { Skeleton, Vacio } from '../../components/UI'
import { money } from '../../lib/format'
import { apiPos, fechaHora } from '../../lib/api-pos'
import type { PosVenta } from '../../lib/api-pos'

const METODOS: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
  credito: 'Crédito',
}

/** Ventas de la caja: periodo, folio y acceso al ticket imprimible. */
export default function Ventas() {
  const [ventas, setVentas] = useState<PosVenta[] | null>(null)
  const [total, setTotal] = useState(0)
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [error, setError] = useState('')

  const cargar = useCallback(() => {
    apiPos
      .ventas(desde, hasta)
      .then((d) => {
        setVentas(d.ventas)
        setTotal(d.total)
        setError('')
      })
      .catch((e) => {
        setError((e as Error).message)
        setVentas([])
      })
  }, [desde, hasta])

  useEffect(() => {
    cargar()
  }, [cargar])

  const limpiar = () => {
    setDesde('')
    setHasta('')
  }

  return (
    <>
      <header className="pagina-cab">
        <div>
          <h1 style={{ margin: 0 }}>Ventas</h1>
          <p style={{ margin: '2px 0 0', color: 'var(--muted)', fontSize: 14 }}>
            Últimas ventas de la caja, con su ticket.
          </p>
        </div>
        <div className="pos-atajos">
          <Link className="btn btn--claro btn--mini" to="/pos">
            Ir a caja
          </Link>
          <Link className="btn btn--claro btn--mini" to="/pos/corte">
            Corte
          </Link>
        </div>
      </header>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card__cuerpo pos-filtros">
          <label className="campo">
            <span>Desde</span>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </label>
          <label className="campo">
            <span>Hasta</span>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </label>
          <button type="button" className="btn btn--claro btn--mini" onClick={limpiar}>
            <Icon name="filtro" size={16} /> Todo
          </button>
          <div className="pos-filtros__total">
            <span className="chip chip--ok">{money(total)}</span>
            <span style={{ color: 'var(--muted)', fontSize: 12.5 }}>
              {ventas ? `${ventas.length} ${ventas.length === 1 ? 'venta' : 'ventas'}` : 'Cargando…'}
            </span>
          </div>
        </div>
      </div>

      {error && <div className="aviso aviso--error" style={{ marginBottom: 14 }}>{error}</div>}

      {!ventas ? (
        <div className="card">
          <div className="card__cuerpo" style={{ display: 'grid', gap: 10 }}>
            <Skeleton h={40} />
            <Skeleton h={200} />
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="tabla-scroll">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Folio</th>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Método</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {ventas.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <Vacio titulo="Todavía no hay ventas" texto="Cobra en la caja y aparecerán aquí." />
                    </td>
                  </tr>
                ) : (
                  ventas.map((v) => {
                    const cancelada = v.estado === 'cancelada'
                    return (
                      <tr key={v.uuid} style={cancelada ? { opacity: 0.55 } : undefined}>
                        <td>
                          <Link to={`/pos/ticket/${v.uuid}`} className="pos-enlace">
                            {v.folio}
                          </Link>
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>{fechaHora(v.created_at)}</td>
                        <td>{v.cliente ?? 'Público general'}</td>
                        <td>{v.metodo ? (METODOS[v.metodo] ?? v.metodo) : '—'}</td>
                        <td className="num" style={{ textAlign: 'right' }}>
                          <strong>{money(v.total)}</strong>
                        </td>
                        <td>
                          <span className={`chip chip--${cancelada ? 'alerta' : 'ok'}`}>
                            {cancelada ? 'cancelada' : 'pagada'}
                          </span>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
