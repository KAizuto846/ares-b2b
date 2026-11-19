import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Icon from '../../components/Icon'
import { Skeleton, Vacio } from '../../components/UI'
import { money } from '../../lib/format'
import { apiPos, fechaHora } from '../../lib/api-pos'
import type { PosCorte } from '../../lib/api-pos'

const ETIQUETAS: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
  credito: 'Crédito',
  venta: 'Venta',
  ingreso: 'Ingreso',
  retiro: 'Retiro',
  devolucion: 'Devolución',
}

/** Corte de caja: desglose por método, esperado contra contado y diferencia. */
export default function Corte() {
  const [params] = useSearchParams()
  const turnoParam = Number(params.get('turno') ?? 0)
  const [corte, setCorte] = useState<PosCorte | null>(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [cerrando, setCerrando] = useState(false)

  const cargar = useCallback(() => {
    apiPos
      .corte(turnoParam || undefined)
      .then((d) => {
        setCorte(d)
        setError('')
      })
      .catch((e) => setError((e as Error).message))
  }, [turnoParam])

  useEffect(() => {
    cargar()
  }, [cargar])

  if (error && !corte) return <div className="aviso aviso--error">{error}</div>

  if (!corte)
    return (
      <div className="card">
        <div className="card__cuerpo" style={{ display: 'grid', gap: 12 }}>
          <Skeleton h={40} />
          <Skeleton h={220} />
        </div>
      </div>
    )

  const { turno } = corte
  const descuadre = !corte.cuadra && corte.diferencia !== null && Math.abs(corte.diferencia) >= 0.01

  return (
    <>
      <header className="pagina-cab">
        <div>
          <h1 style={{ margin: 0 }}>Corte de caja</h1>
          <p style={{ margin: '2px 0 0', color: 'var(--muted)', fontSize: 14 }}>
            Turno #{turno.id} · {fechaHora(turno.abierto_at)}
            {turno.cerrado_at ? ` → ${fechaHora(turno.cerrado_at)}` : ' (abierto)'}
          </p>
        </div>
        <div className="pos-atajos pos-atajos--no-imprimir">
          <button type="button" className="btn btn--claro btn--mini" onClick={() => window.print()}>
            <Icon name="imprimir" size={16} /> Imprimir
          </button>
          <Link className="btn btn--claro btn--mini" to="/pos">
            Ir a caja
          </Link>
        </div>
      </header>

      {aviso && <div className="aviso aviso--ok pos-atajos--no-imprimir" style={{ marginBottom: 14 }}>{aviso}</div>}
      {error && <div className="aviso aviso--error" style={{ marginBottom: 14 }}>{error}</div>}

      <div className="kpis" style={{ marginBottom: 18 }}>
        <div className="kpi">
          <span className="kpi__etiqueta">Total vendido</span>
          <span className="kpi__valor num">{money(corte.total)}</span>
        </div>
        <div className="kpi">
          <span className="kpi__etiqueta">Fondo inicial</span>
          <span className="kpi__valor num">{money(turno.fondo_inicial)}</span>
        </div>
        <div className="kpi">
          <span className="kpi__etiqueta">Efectivo en caja</span>
          <span className="kpi__valor num">{money(turno.fondo_inicial + corte.efectivo)}</span>
        </div>
        {!turno.abierto && (
          <div className="kpi">
            <span className="kpi__etiqueta">Contado</span>
            <span className="kpi__valor num">{money(corte.contado ?? 0)}</span>
          </div>
        )}
        {!turno.abierto && corte.diferencia !== null && (
          <div className={`kpi ${descuadre ? 'kpi--alerta' : ''}`}>
            <span className="kpi__etiqueta">Diferencia</span>
            <span
              className="kpi__valor num"
              style={{ color: descuadre ? 'var(--rojo)' : 'var(--verde)' }}
            >
              {money(corte.diferencia)}
            </span>
            <span className="kpi__nota">
              {descuadre ? 'No cuadra con lo esperado' : 'Cuadra con lo esperado'}
            </span>
          </div>
        )}
      </div>

      <h2 style={{ fontSize: 17, margin: '0 0 10px' }}>Por método de pago</h2>
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 18 }}>
        <div className="tabla-scroll">
          <table className="tabla">
            <thead>
              <tr>
                <th>Método</th>
                <th>Ventas</th>
                <th style={{ textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {corte.resumen.length === 0 ? (
                <tr>
                  <td colSpan={3}>
                    <Vacio titulo="Sin ventas en este turno" texto="Aún no se ha cobrado nada." />
                  </td>
                </tr>
              ) : (
                corte.resumen.map((r) => (
                  <tr key={r.metodo}>
                    <td>{ETIQUETAS[r.metodo] ?? r.metodo}</td>
                    <td className="num">{r.ventas}</td>
                    <td className="num" style={{ textAlign: 'right' }}>
                      <strong>{money(r.total)}</strong>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <h2 style={{ fontSize: 17, margin: '0 0 10px' }}>Movimientos de caja</h2>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="tabla-scroll">
          <table className="tabla">
            <thead>
              <tr>
                <th>Hora</th>
                <th>Tipo</th>
                <th>Concepto</th>
                <th style={{ textAlign: 'right' }}>Monto</th>
              </tr>
            </thead>
            <tbody>
              {corte.movimientos.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <Vacio titulo="Sin movimientos" texto="Los cobros en efectivo aparecen aquí." />
                  </td>
                </tr>
              ) : (
                corte.movimientos.map((m) => (
                  <tr key={m.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fechaHora(m.created_at)}</td>
                    <td>{ETIQUETAS[m.tipo] ?? m.tipo}</td>
                    <td>{m.concepto}</td>
                    <td className="num" style={{ textAlign: 'right' }}>
                      {money(m.monto)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {turno.abierto && (
        <div className="card pos-atajos--no-imprimir" style={{ marginTop: 18, maxWidth: 460 }}>
          <div className="card__cuerpo" style={{ display: 'grid', gap: 10 }}>
            <strong>Cerrar turno</strong>
            <p style={{ color: 'var(--muted)', margin: 0, fontSize: 13.5 }}>
              Esperado en efectivo: <strong>{money(corte.esperado)}</strong>
            </p>
            <button type="button" className="btn btn--claro btn--bloque" onClick={() => setCerrando(true)}>
              Cerrar caja
            </button>
          </div>
        </div>
      )}

      {cerrando && (
        <DialogoCerrar
          esperado={corte.esperado}
          onCerrar={() => setCerrando(false)}
          onHecho={(texto, nuevo) => {
            setCerrando(false)
            setCorte(nuevo)
            setAviso(texto)
          }}
        />
      )}
    </>
  )
}

function DialogoCerrar({
  esperado,
  onCerrar,
  onHecho,
}: {
  esperado: number
  onCerrar: () => void
  onHecho: (texto: string, corte: PosCorte) => void
}) {
  const [contado, setContado] = useState(esperado.toFixed(2))
  const [notas, setNotas] = useState('')
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const diferencia = Number(contado || 0) - esperado

  const cerrar = async (e: React.FormEvent) => {
    e.preventDefault()
    setOcupado(true)
    setError('')
    try {
      const r = await apiPos.cerrarTurno(Math.max(0, Number(contado) || 0), notas)
      onHecho('Turno cerrado. El corte ya está disponible.', r.corte)
    } catch (err) {
      setError((err as Error).message)
      setOcupado(false)
    }
  }

  return (
    <div className="pos-modal" role="dialog" aria-modal="true" aria-labelledby="pos-cerrar">
      <div className="pos-modal__caja">
        <h2 id="pos-cerrar" style={{ margin: 0 }}>
          Cerrar caja
        </h2>
        <p style={{ color: 'var(--muted)', margin: '6px 0 14px', fontSize: 13.5 }}>
          Cuenta el efectivo físico y déjalo aquí. Se comparará con lo esperado ({money(esperado)}).
        </p>
        <form onSubmit={cerrar} style={{ display: 'grid', gap: 12 }}>
          <label className="campo">
            <span>Efectivo contado</span>
            <input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={contado}
              onChange={(e) => setContado(e.target.value)}
              autoFocus
              required
            />
          </label>
          <label className="campo">
            <span>Notas (opcional)</span>
            <input value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={255} />
          </label>
          <div className={`pos-cambio ${Math.abs(diferencia) >= 0.01 ? 'pos-cambio--falta' : ''}`}>
            <span>Diferencia</span>
            <strong className="num">{money(diferencia)}</strong>
          </div>
          {error && <div className="aviso aviso--error">{error}</div>}
          <div className="pos-modal__acciones">
            <button type="button" className="btn btn--claro" onClick={onCerrar} disabled={ocupado}>
              Cancelar
            </button>
            <button type="submit" className="btn" disabled={ocupado}>
              {ocupado ? 'Cerrando…' : 'Cerrar turno'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
