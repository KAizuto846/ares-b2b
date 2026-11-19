import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Aviso, Skeleton } from '../components/UI'
import Icon from '../components/Icon'
import { money } from '../lib/format'
import { apiFactura } from '../lib/api-finanzas'
import type { Concepto, FacturaDetalle } from '../lib/api-finanzas'
import { useNavegar } from '../store/session'

const TONO: Record<string, string> = { timbrada: 'ok', generada: 'alerta', cancelada: 'malo' }
const ETIQUETA: Record<string, string> = { timbrada: 'Timbrada', generada: 'Pendiente de timbrar', cancelada: 'Cancelada' }

export default function Factura() {
  const { uuid } = useParams<{ uuid: string }>()
  const navegar = useNavegar()
  const [factura, setFactura] = useState<FacturaDetalle | null>(null)
  const [conceptos, setConceptos] = useState<Concepto[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!uuid) {
      setError('Falta la factura que quieres ver.')
      return
    }
    apiFactura(uuid)
      .then((r) => { setFactura(r.factura); setConceptos(r.conceptos) })
      .catch((e: Error) => setError(e.message))
  }, [uuid])

  if (error) {
    return (
      <div style={{ display: 'grid', gap: 14 }}>
        <Aviso tipo="error">{error}</Aviso>
        <div>
          <button type="button" className="btn btn--claro" onClick={() => navegar('/finanzas')}>Volver a finanzas</button>
        </div>
      </div>
    )
  }

  if (!factura) {
    return (
      <div className="card">
        <div className="card__cuerpo" style={{ display: 'grid', gap: 12 }}>
          <Skeleton h={28} w="40%" />
          <Skeleton h={120} />
          <Skeleton h={64} />
        </div>
      </div>
    )
  }

  const tono = TONO[factura.estado] ?? 'neutro'
  const etiqueta = ETIQUETA[factura.estado] ?? factura.estado

  return (
    <div className="fin-factura">
      <div className="fin-factura__acciones fin-no-imprimir">
        <button type="button" className="btn btn--claro" onClick={() => navegar('/finanzas')}>
          <Icon name="flecha" size={17} /> Volver a finanzas
        </button>
        <button type="button" className="btn" onClick={() => window.print()}>
          <Icon name="imprimir" size={17} /> Imprimir o guardar PDF
        </button>
      </div>

      <article className="factura-hoja" aria-label={`Factura ${factura.folio_texto}`}>
        <header className="factura-hoja__cabeza">
          <div className="factura-hoja__emisor">
            <strong>{factura.emisor.razon_social}</strong>
            <span>RFC {factura.emisor.rfc === '' ? 'sin registrar' : factura.emisor.rfc}</span>
            <span>Régimen fiscal {factura.emisor.regimen_fiscal === '' ? 'sin registrar' : factura.emisor.regimen_fiscal}</span>
            <span>Lugar de expedición {factura.lugar_expedicion === '' ? 'sin registrar' : factura.lugar_expedicion}</span>
          </div>
          <div className="factura-hoja__folio">
            <span className="factura-hoja__tipo">Factura</span>
            <strong>{factura.folio_texto}</strong>
            <span className={`chip chip--${tono}`}>{etiqueta}</span>
          </div>
        </header>

        <section className="factura-hoja__partes">
          <div>
            <h3>Receptor</h3>
            <strong>{factura.receptor.razon_social}</strong>
            <span>RFC {factura.receptor.rfc === '' ? 'sin registrar' : factura.receptor.rfc}</span>
            <span>CP {factura.receptor.cp === '' ? 'sin registrar' : factura.receptor.cp} · Uso CFDI {factura.receptor.uso_cfdi === '' ? 'sin registrar' : factura.receptor.uso_cfdi}</span>
          </div>
          <div>
            <h3>Datos del comprobante</h3>
            <span>Fecha de emisión: {factura.fecha}</span>
            <span>Método de pago: {factura.metodo_pago}</span>
            <span>Forma de pago: {factura.forma_pago}</span>
            <span>Pedido: {factura.pedido.uuid.slice(0, 8)}</span>
          </div>
        </section>

        <div className="tabla-scroll fin-hoja-tabla">
          <table className="tabla factura-hoja__tabla">
            <thead>
              <tr>
                <th>Concepto</th>
                <th style={{ textAlign: 'right' }}>Cantidad</th>
                <th style={{ textAlign: 'right' }}>Precio unitario</th>
                <th style={{ textAlign: 'right' }}>Importe</th>
              </tr>
            </thead>
            <tbody>
              {conceptos.map((c, i) => (
                <tr key={`${c.descripcion}-${i}`}>
                  <td>{c.descripcion}</td>
                  <td className="num" style={{ textAlign: 'right' }}>{c.cantidad.toLocaleString('es-MX')}</td>
                  <td className="num" style={{ textAlign: 'right' }}>{money(c.precio_unitario)}</td>
                  <td className="num" style={{ textAlign: 'right' }}>{money(c.importe)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="factura-hoja__totales">
          <div><span>Subtotal</span><b>{money(factura.subtotal)}</b></div>
          <div><span>IVA</span><b>{money(factura.iva)}</b></div>
          <div className="factura-hoja__total"><span>Total</span><b>{money(factura.total)}</b></div>
        </div>

        <footer className="factura-hoja__pie">
          <span>Comprobante fiscal emitido por el mayorista por este pedido.</span>
          {factura.estado === 'generada' && (
            <span className="factura-hoja__nota">Solicitud registrada: falta el timbrado del emisor.</span>
          )}
          {factura.uuid_timbrado && (
            <span className="factura-hoja__uuid">Folio fiscal {factura.uuid_timbrado}</span>
          )}
        </footer>
      </article>
    </div>
  )
}
