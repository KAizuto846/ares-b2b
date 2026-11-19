import { pedir } from './api'

/** Punto de la serie de gastos/ingresos que pinta la gráfica de barras. */
export type SeriePunto = { etiqueta: string; valor: number; alto?: number }

/** Fila de la tabla de movimientos (los campos cambian según el rol). */
export type Movimiento = {
  uuid: string
  fecha: string
  monto: number
  estado: string
  contraparte?: string
  mayorista?: string
  subtotal?: number
  iva?: number
  envio?: number
  distancia_km?: number
}

export type FacturaResumen = {
  uuid: string
  serie: string
  folio: number
  folio_texto: string
  total: number
  estado: string
  fecha: string
  razon_social_emisor: string
  pedido_uuid: string
}

export type Periodo = {
  anio: number
  mes: number | null
  etiqueta: string
  desde: string
  hasta: string
  anterior: { desde: string; hasta: string }
}

export type Comparacion = {
  total_anterior: number
  pedidos_anterior: number
  delta_pct: number | null
}

export type VistaFinanzas = 'anual' | 'mensual'

/** Respuesta de GET /finanzas (los importes del resumen dependen del rol). */
export type FinanzasDatos = {
  ok: true
  rol: string
  vista?: VistaFinanzas
  periodo: Periodo
  resumen: Record<string, number>
  comparacion: Comparacion
  serie: SeriePunto[]
  movimientos: Movimiento[]
  facturas: FacturaResumen[]
}

export type Concepto = {
  descripcion: string
  cantidad: number
  precio_unitario: number
  iva_tasa: number
  importe: number
}

export type FacturaDetalle = {
  uuid: string
  serie: string
  folio: number
  folio_texto: string
  estado: 'generada' | 'timbrada' | 'cancelada'
  fecha: string
  uuid_timbrado: string | null
  metodo_pago: string
  forma_pago: string
  lugar_expedicion: string
  subtotal: number
  iva: number
  total: number
  pedido: { uuid: string; estado: string; fecha: string }
  emisor: { rfc: string; razon_social: string; regimen_fiscal: string }
  receptor: { rfc: string; razon_social: string; cp: string; uso_cfdi: string }
}

export type DatosFiscales = {
  rfc: string
  razon_social: string
  regimen_fiscal: string
  cp: string
  uso_cfdi: string
  correo_receptor: string
}

export type ClaveCatalogo = { clave: string; nombre: string }

export type FacturaListada = {
  uuid: string
  serie: string
  folio: number
  folio_texto: string
  estado: string
  total: number
  subtotal: number
  iva: number
  fecha: string
  uuid_timbrado: string | null
  rfc_emisor: string
  rfc_receptor: string
  razon_social_emisor: string
  razon_social_receptor: string
  direccion: 'emitida' | 'recibida'
  pedido_uuid: string
  pedido_estado: string
}

export type FacturacionDatos = {
  ok: true
  rol: string
  es_comercio: boolean
  datos_fiscales: DatosFiscales | null
  regimenes: ClaveCatalogo[]
  usos: ClaveCatalogo[]
  facturas: FacturaListada[]
  facturables: { uuid: string; total: number; fecha: string; mayorista: string }[]
  estados_facturables: string[]
}

export type SolicitudFactura = {
  ok: true
  pendiente: boolean
  mensaje: string
  factura: { uuid: string; serie: string; folio: number; estado: string; total: number }
}

/** Parámetros del panel de finanzas (el rol decide qué llega). */
export type ParamsFinanzas = {
  vista?: VistaFinanzas
  anio?: number
  mes?: number
  desde?: string
  hasta?: string
}

export function apiFinanzas(p: ParamsFinanzas = {}) {
  const q = new URLSearchParams()
  if (p.vista) q.set('vista', p.vista)
  if (p.anio) q.set('anio', String(p.anio))
  if (p.mes) q.set('mes', String(p.mes))
  if (p.desde) q.set('desde', p.desde)
  if (p.hasta) q.set('hasta', p.hasta)
  const cadena = q.toString()

  return pedir<FinanzasDatos>(`/finanzas${cadena === '' ? '' : '?' + cadena}`)
}

export const apiFactura = (uuid: string) =>
  pedir<{ factura: FacturaDetalle; conceptos: Concepto[] }>(`/finanzas/factura/${encodeURIComponent(uuid)}`)

export const apiFacturacion = () => pedir<FacturacionDatos>('/facturacion')

export const apiGuardarDatosFiscales = (datos: DatosFiscales) =>
  pedir<{ datos_fiscales: DatosFiscales; mensaje: string }>('/facturacion/datos', {
    method: 'POST',
    body: JSON.stringify(datos),
  })

export const apiSolicitarFactura = (uuid: string) =>
  pedir<SolicitudFactura>(`/pedidos/${encodeURIComponent(uuid)}/factura`, { method: 'POST' })

/** URL del CSV (se usa en un <a download>; lleva la cookie de sesión). */
export const urlExport = (desde: string, hasta: string) =>
  `/api/finanzas/export?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`

/** RFC del SAT (persona física o moral). Misma regla que el backend. */
export const RFC_VALIDO = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/
/** Código postal mexicano. */
export const CP_VALIDO = /^\d{5}$/
