import { pedir } from './api'

/** Papeles del usuario sobre un pedido concreto, tal como los calcula el API. */
export type Papeles = { comercio: boolean; mayorista: boolean; repartidor: boolean; admin: boolean }

/** Acción contextual: transición de estado, PIN o enlace al mapa. */
export type AccionPedido = {
  codigo: string
  texto: string
  tono?: 'ok' | 'claro' | 'peligro'
  tipo: 'transicion' | 'pin' | 'mapa'
  pin_largo?: number
  pin_ayuda?: string
}

export type LineaPedido = {
  nombre: string
  cantidad: number
  precio_unitario: number
  subtotal: number
  escala: string
  iva_tasa: number
}

export type EventoPedido = {
  estado: string
  texto: string
  anterior: string | null
  nota: string | null
  fecha: string
  actor: number | null
}

export type CalificacionPedido = {
  evaluado_id: number
  nombre: string
  puede: boolean
  puntaje: number | null
  comentario: string
}

export type PagoResumen = { referencia: string; monto: number; estado: string }

export type PedidoDetalle = {
  uuid: string
  folio: string
  estado: string
  estado_texto: string
  creado: string
  acepta_antes_de: string | null
  nota: string
  comercio: { nombre: string }
  mayorista: { nombre: string }
  direccion: {
    calle: string
    colonia: string
    ciudad: string
    cp: string
    referencias: string
    lat: number | null
    lng: number | null
  }
  subtotal: number
  iva: number
  envio: number
  total: number
  lineas: LineaPedido[]
  eventos: EventoPedido[]
  envio_datos: { repartidor: string | null; tarifa: number | null; distancia_km: number | null; estado: string }
  acciones: AccionPedido[]
  calificacion: CalificacionPedido | null
  pin_entrega: string | null
  pago: PagoResumen | null
  papeles: Papeles
}

export type OfertaEnvio = {
  id: number
  tarifa: number
  distancia_km: number
  ronda: number
  expira_en: string
  segundos: number
  pedido_uuid: string
  total: number
  mayorista: string
  comercio: string
  calle: string
  colonia: string
  ciudad: string
}

export type PinViaje = { tipo: 'recoleccion' | 'entrega'; largo: number; de: string; valor: string | null }

export type ViajeRepartidor = {
  uuid: string
  estado: string
  estado_texto: string
  total: number
  tarifa: number | null
  distancia_km: number | null
  comercio: string
  mayorista: string
  destino: { calle: string; colonia: string; ciudad: string; lat: number | null; lng: number | null }
  pin: PinViaje | null
}

export type EntregaRepartidor = {
  uuid: string
  estado: string
  estado_texto: string
  comercio: string
  total: number
  tarifa: number
  entregado_en: string | null
}

export type PanelRepartidor = {
  repartidor: {
    disponible: boolean
    kyc: string
    calificacion: number | null
    ultima_posicion_at: string | null
    vehiculo: { tipo: string; placa: string } | null
  }
  ofertas: OfertaEnvio[]
  viajes: ViajeRepartidor[]
  entregas: EntregaRepartidor[]
  ganancias_hoy: number
  actualizado: string
}

export type PuntoTracking = { lat: number; lng: number; actualizado: string } | null

export type DatosTracking = {
  pedido: string
  folio: string
  estado: string
  estado_texto: string
  disponible: boolean
  motivo: string | null
  destino: { lat: number; lng: number; calle: string; colonia: string; ciudad: string } | null
  repartidor: PuntoTracking
  ruta: [number, number][]
  eta_min: number | null
  distancia_km: number | null
  mayorista: string
}

export type PagoSimulado = {
  referencia: string
  monto: number
  estado: string
  metodo: string
  creado: string
  pagado: boolean
}

export type PedidoDelPago = { uuid: string; total: number; estado: string; estado_texto: string }

export type Punto = { lat: number; lng: number; precision_m?: number; capturado_en?: string }

export const apiPedidos = {
  detalle: (uuid: string) => pedir<{ pedido: PedidoDetalle }>(`/pedidos/${uuid}`),
  estado: (uuid: string, accion: string, motivo?: string) =>
    pedir<{ mensaje: string; estado: string; estado_texto: string; pin_entrega: string | null }>(
      `/pedidos/${uuid}/estado`,
      { method: 'POST', body: JSON.stringify({ accion, motivo }) },
    ),
  calificar: (uuid: string, puntaje: number, comentario: string) =>
    pedir<{ mensaje: string; puntaje: number }>(`/pedidos/${uuid}/calificar`, {
      method: 'POST',
      body: JSON.stringify({ puntaje, comentario }),
    }),
}

export const apiRepartidor = {
  panel: () => pedir<PanelRepartidor>('/repartidor'),
  disponibilidad: (disponible: boolean, coords?: { lat: number; lng: number }) =>
    pedir<{ disponible: boolean; mensaje: string }>('/repartidor/disponibilidad', {
      method: 'POST',
      body: JSON.stringify({ disponible, ...coords }),
    }),
  oferta: (id: number, aceptar: boolean) =>
    pedir<{ mensaje: string }>(`/repartidor/ofertas/${id}`, { method: 'POST', body: JSON.stringify({ aceptar }) }),
  recoger: (uuid: string, pin: string) =>
    pedir<{ mensaje: string; estado: string }>(`/repartidor/pedidos/${uuid}/recoger`, {
      method: 'POST',
      body: JSON.stringify({ pin }),
    }),
  entregar: (uuid: string, pin: string) =>
    pedir<{ mensaje: string; estado: string }>(`/repartidor/pedidos/${uuid}/entregar`, {
      method: 'POST',
      body: JSON.stringify({ pin }),
    }),
}

export const apiTracking = {
  consultar: (uuid: string) => pedir<{ tracking: DatosTracking }>(`/tracking/${uuid}`),
  posicion: (punto: Punto | Punto[]) =>
    pedir<{ aceptados: number; descartados: number }>('/tracking/posicion', {
      method: 'POST',
      body: JSON.stringify(punto),
    }),
}

export const apiPago = {
  ver: (referencia: string) =>
    pedir<{ pago: PagoSimulado; pedidos: PedidoDelPago[] }>(`/pago/simulado/${referencia}`),
  confirmar: (referencia: string) =>
    pedir<{ mensaje: string; codigo: string; pedidos: PedidoDelPago[] }>(`/pago/simulado/${referencia}`, {
      method: 'POST',
    }),
}
