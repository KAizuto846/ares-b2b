import { pedir } from './api'
import type { Carrito, Grupo, Linea } from './api'

/** Cifra del día enlazada a la pantalla donde se resuelve. */
export type Metrica = { valor: string; etiqueta: string; nota?: string; href: string }

/** Acción de la tarjeta «Tu día a día» o de la franja de atajos. */
export type Acceso = { href: string; titulo: string; texto: string; icono: string; globos?: number }

export type Explorar = {
  nombre: string
  rol: string
  metricas: Metrica[]
  accesos: Acceso[]
  atajos: Acceso[]
  resumen: { mensajes: number; portafolio: number; pedidos: number }
}

/** Línea del carrito con los campos de precio que devuelve el backend. */
export type LineaPagina = Linea & {
  precio_unitario: number
  subtotal: number
  iva_tasa: number
  iva_total: number
  escala_aplicada: string | null
  stock_disponible: number
  inactivo: boolean
}

export type GrupoPagina = Omit<Grupo, 'items'> & { items: LineaPagina[] }

/** Carrito completo tal como lo devuelve la página (incluye unidades). */
export type PaginaCarrito = Omit<Carrito, 'grupos'> & { grupos: GrupoPagina[]; unidades: number }

export type Favorito = {
  uuid: string
  nombre: string
  mayorista: string
  mayorista_uuid: string
  carpeta: string
  categoria: string
  precio_base: number
  unidad_venta: string
  contenido: string
  cantidad_minima: number
  stock_disponible: number
  disponible: boolean
}

export type Sugerencia = { producto: string; dias: number }

export type ListaProgramada = {
  id: number
  estado: 'activa' | 'pausada' | 'cancelada'
  frecuencia: string
  fecha_deseada: string | null
  hora: string | null
  proximo_envio: string
  mayorista: string
  mayorista_uuid: string
  lineas: number
  items: { producto_uuid: string; nombre: string; cantidad: number }[]
}

export type ProductoAgenda = {
  uuid: string
  nombre: string
  mayorista: string
  mayorista_uuid: string
  precio_base: number
  cantidad_minima: number
  unidad_venta: string
  contenido: string
}

export type ItemNuevo = { producto_uuid: string; cantidad: number }

export type Recompra = {
  agregados: number
  omitidos: { nombre: string; motivo: string; alternativa: string | null }[]
  mensaje: string
  carrito: Carrito
}

export const apiComercio = {
  explorar: () => pedir<Explorar & { ok: true }>('/explorar'),

  carritoPagina: () => pedir<PaginaCarrito & { ok: true }>('/carrito/pagina'),

  portafolio: () => pedir<{ favoritos: Favorito[]; sugerencias: Sugerencia[] }>('/portafolio'),
  guardar: (producto_uuid: string) =>
    pedir<{ mensaje: string }>('/portafolio/agregar', { method: 'POST', body: JSON.stringify({ producto_uuid }) }),
  quitar: (producto_uuid: string) =>
    pedir<{ mensaje: string }>('/portafolio/quitar', { method: 'POST', body: JSON.stringify({ producto_uuid }) }),
  recompra: (uuid: string) => pedir<Recompra>(`/portafolio/recompra/${encodeURIComponent(uuid)}`, { method: 'POST', body: '{}' }),

  agendar: () =>
    pedir<{ listas: ListaProgramada[]; productos: ProductoAgenda[]; hoy: string }>('/agendar'),
  crearLista: (fecha_deseada: string, hora: string, items: ItemNuevo[]) =>
    pedir<{ id: number; mensaje: string; lista: ListaProgramada }>('/agendar', {
      method: 'POST',
      body: JSON.stringify({ fecha_deseada, hora, items }),
    }),
  cancelarLista: (id: number) =>
    pedir<{ mensaje: string }>(`/agendar/${id}`, { method: 'DELETE', body: '{}' }),
  estadoLista: (id: number, estado: 'activa' | 'pausada') =>
    pedir<{ mensaje: string }>(`/agendar/${id}/estado`, { method: 'POST', body: JSON.stringify({ estado }) }),
}
