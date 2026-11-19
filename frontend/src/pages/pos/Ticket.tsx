import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Icon from '../../components/Icon'
import { Skeleton } from '../../components/UI'
import { money } from '../../lib/format'
import { apiPos, fechaHora } from '../../lib/api-pos'
import type { PosTicket } from '../../lib/api-pos'

/** Ticket imprimible (80 mm) de una venta. Se abre desde la caja y desde Ventas. */
export default function Ticket() {
  const { uuid = '' } = useParams()
  const [datos, setDatos] = useState<PosTicket | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    apiPos
      .ticket(uuid)
      .then(setDatos)
      .catch((e) => setError((e as Error).message))
  }, [uuid])

  if (error) return <div className="aviso aviso--error">{error}</div>

  if (!datos)
    return (
      <div className="card">
        <div className="card__cuerpo" style={{ display: 'grid', gap: 10 }}>
          <Skeleton h={30} />
          <Skeleton h={180} />
        </div>
      </div>
    )

  const pago = datos.pagos[0]

  return (
    <>
      <div className="pos-ticket-acciones no-imprimir">
        <button type="button" className="btn" onClick={() => window.print()}>
          <Icon name="imprimir" size={17} /> Imprimir
        </button>
        <Link className="btn btn--claro" to="/pos">
          Volver a caja
        </Link>
        <Link className="btn btn--claro" to="/pos/ventas">
          Ventas
        </Link>
      </div>

      <div className="pos-hoja">
        <h2 className="pos-hoja__marca">{datos.negocio || 'Ares'}</h2>
        <div className="pos-hoja__sub">Comprobante de venta</div>
        <div className="pos-hoja__linea" />

        <div className="pos-hoja__fila">
          <span>Folio</span>
          <span>{datos.venta.folio}</span>
        </div>
        <div className="pos-hoja__fila">
          <span>Fecha</span>
          <span>{fechaHora(datos.venta.created_at)}</span>
        </div>
        <div className="pos-hoja__fila">
          <span>Estado</span>
          <span>{datos.venta.estado}</span>
        </div>
        {datos.cliente && (
          <div className="pos-hoja__fila">
            <span>Cliente</span>
            <span>{datos.cliente.nombre}</span>
          </div>
        )}
        {datos.cliente?.rfc && (
          <div className="pos-hoja__fila">
            <span>RFC</span>
            <span>{datos.cliente.rfc}</span>
          </div>
        )}

        <div className="pos-hoja__linea" />

        <table className="pos-hoja__tabla">
          <tbody>
            {datos.lineas.map((l) => (
              <tr key={l.id}>
                <td>
                  {l.descripcion}
                  <div className="pos-hoja__small">
                    {l.cantidad} × {money(l.precio_unitario)}
                  </div>
                </td>
                <td className="pos-hoja__der">{money(l.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="pos-hoja__linea" />

        <div className="pos-hoja__fila">
          <span>Subtotal</span>
          <span>{money(datos.venta.subtotal)}</span>
        </div>
        <div className="pos-hoja__fila">
          <span>IVA</span>
          <span>{money(datos.venta.iva)}</span>
        </div>
        <div className="pos-hoja__total">
          <span>TOTAL</span>
          <span>{money(datos.venta.total)}</span>
        </div>

        {pago && (
          <>
            <div className="pos-hoja__linea" />
            <div className="pos-hoja__fila">
              <span>Pago</span>
              <span>{pago.metodo.charAt(0).toUpperCase() + pago.metodo.slice(1)}</span>
            </div>
            <div className="pos-hoja__fila">
              <span>Recibido</span>
              <span>{money(pago.recibido)}</span>
            </div>
            <div className="pos-hoja__fila">
              <span>Cambio</span>
              <span>{money(pago.cambio)}</span>
            </div>
          </>
        )}

        <div className="pos-hoja__linea" />
        <div className="pos-hoja__sub">¡Gracias por su compra!</div>
      </div>
    </>
  )
}
