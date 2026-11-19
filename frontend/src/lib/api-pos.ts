import { pedir } from './api'

/**
 * Contrato JSON del punto de venta (backend/app/Api/pos.php).
 * Todos los importes llegan como números; el formato se hace en la pantalla.
 */

export type PosAjustes = { margen_venta: number; reorden_auto: number; iva_incluido: number }

export type PosProducto = {
  id: number
  nombre: string
  imagen: string | null
  sku: string
  codigo_barras: string
  precio_compra: number
  precio_venta: number
  iva_tasa: number
  stock: number
  stock_minimo: number
  unidad: string
  activo: number
}

export type PosCliente = { id: number; nombre: string; telefono: string; email: string; rfc: string }

export type PosTurno = {
  id: number
  abierto_at: string
  fondo_inicial: number
  estado: string
  cerrado_at?: string | null
}

export type PosVenta = {
  id: number
  uuid: string
  turno_id: number
  folio: string
  cliente: string | null
  cliente_id: number | null
  subtotal: number
  iva: number
  total: number
  estado: string
  notas: string | null
  created_at: string
  metodo: string | null
}

export type PosEstado = {
  turno: PosTurno | null
  ultimo_turno: { id: number; estado: string; cerrado_at: string | null } | null
  ajustes: PosAjustes
  productos: PosProducto[]
  clientes: PosCliente[]
  vendido: number
}

export type PosSugerencia = { producto_id: number; nombre: string; stock: number; minimo: number; sugerido: number }

export type PosInventario = {
  productos: PosProducto[]
  sugerencias: PosSugerencia[]
  ajustes: PosAjustes
  turno: { id: number; abierto_at: string } | null
}

export type PosResumenMetodo = { metodo: string; ventas: number; total: number }

export type PosCorte = {
  turno: {
    id: number
    abierto_at: string
    cerrado_at: string | null
    fondo_inicial: number
    estado: string
    notas: string | null
    abierto: boolean
  }
  resumen: PosResumenMetodo[]
  ventas: PosVenta[]
  movimientos: { id: number; tipo: string; monto: number; concepto: string; referencia: string | null; created_at: string }[]
  total: number
  total_metodos: number
  efectivo: number
  esperado: number
  contado: number | null
  diferencia: number | null
  cuadra: boolean
}

export type PosTicket = {
  venta: PosVenta
  lineas: {
    id: number
    descripcion: string
    cantidad: number
    precio_unitario: number
    descuento: number
    iva_tasa: number
    subtotal: number
    total: number
  }[]
  pagos: { metodo: string; monto: number; recibido: number; cambio: number }[]
  cliente: { nombre: string; rfc: string; telefono: string; email: string } | null
  negocio: string
}

export type PosVentaHecha = {
  folio: string
  uuid: string
  subtotal: number
  iva: number
  total: number
  cambio: number
  metodo: string
  turno_id: number
}

export const apiPos = {
  estado: () => pedir<PosEstado>('/pos'),

  abrirTurno: (fondo: number) =>
    pedir<{ turno: PosTurno }>('/pos/turno/abrir', { method: 'POST', body: JSON.stringify({ fondo }) }),

  cerrarTurno: (contado: number, notas = '') =>
    pedir<{ corte: PosCorte }>('/pos/turno/cerrar', { method: 'POST', body: JSON.stringify({ contado, notas }) }),

  vender: (p: {
    lineas: { producto_id: number; cantidad: number }[]
    cliente_id?: number | null
    metodo_pago: string
    recibido: number
  }) => pedir<PosVentaHecha>('/pos/vender', { method: 'POST', body: JSON.stringify(p) }),

  inventario: () => pedir<PosInventario>('/pos/inventario'),

  crearProducto: (p: Partial<PosProducto>) =>
    pedir<{ id: number }>('/pos/productos', { method: 'POST', body: JSON.stringify(p) }),

  editarProducto: (id: number, p: Partial<PosProducto>) =>
    pedir<{ producto: PosProducto }>(`/pos/productos/${id}`, { method: 'PATCH', body: JSON.stringify(p) }),

  desactivarProducto: (id: number) => pedir<{ id: number }>(`/pos/productos/${id}`, { method: 'DELETE' }),

  reponer: (producto_id: number, cantidad: number) =>
    pedir<{ stock: number; mensaje: string }>('/pos/reponer', {
      method: 'POST',
      body: JSON.stringify({ producto_id, cantidad }),
    }),

  ventas: (desde = '', hasta = '') => {
    const q = new URLSearchParams()
    if (desde) q.set('desde', desde)
    if (hasta) q.set('hasta', hasta)
    const extra = q.toString()
    return pedir<{ ventas: PosVenta[]; total: number }>(`/pos/ventas${extra ? `?${extra}` : ''}`)
  },

  ticket: (uuid: string) => pedir<PosTicket>(`/pos/ticket/${uuid}`),

  corte: (turno?: number) => pedir<PosCorte>(`/pos/corte${turno ? `?turno=${turno}` : ''}`),

  clientes: () => pedir<{ clientes: PosCliente[] }>('/pos/clientes'),

  crearCliente: (c: { nombre: string; telefono?: string; email?: string; rfc?: string }) =>
    pedir<{ id: number }>('/pos/clientes', { method: 'POST', body: JSON.stringify(c) }),

  guardarAjustes: (a: PosAjustes) =>
    pedir<{ ajustes: PosAjustes }>('/pos/ajustes', { method: 'POST', body: JSON.stringify(a) }),
}

/** Redondeo a centavos, igual que el backend (evita 0.30000000000000004). */
export const centavos = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/** Clave de búsqueda sin acentos: «cafe» encuentra «Café molido». */
export const sinAcentos = (texto: string) =>
  texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ñ/g, 'n')

/** Clave del buscador: nombre + sku + código de barras (el lector sigue sirviendo). */
export const claveProducto = (p: PosProducto) =>
  sinAcentos(`${p.nombre} ${p.sku ?? ''} ${p.codigo_barras ?? ''}`)

/** Foto del producto; sin foto entra la genérica, nunca un hueco. */
export const fotoProducto = (p: PosProducto) => p.imagen || '/assets/img/productos/generico.svg'

/** Fecha y hora cortas para tablas y ticket (el helper fecha() es solo día). */
export const fechaHora = (iso: string) => {
  const d = new Date(iso.replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
