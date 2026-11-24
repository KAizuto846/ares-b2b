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
  resumen: {
    mensajes: number; portafolio: number; pedidos: number
    detalle: { estado: string; cuantos: number }[]
    /** Lista individual de pedidos en curso (solo mayorista). */
    lista?: { uuid: string; comercio: string; total: number; estado: string }[]
  }
  /** Cifras del día para el bloque «Pedidos» del mayorista. */
  pedidos_hoy: { pedidos: number; monto: number }
  preferencias?: { id: number; nombre: string }[]
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

// ---------------------------------------------------------------- extras
export type Banner = { id: number; titulo: string; texto: string; imagen: string | null; color: string; href: string }
export type Anuncio = { id: number; titulo: string; cuerpo: string; imagen: string | null; cta_href: string | null; cta_texto: string | null }
/** Anuncio publicado en la sección del inicio del comercio. */
export type AnuncioPublicacion = {
  id: number
  titulo: string
  cuerpo: string
  imagen: string | null
  monto_pagado: number
  vence_el: string
  mayorista: string
  mayorista_uuid: string
}
/** Anuncio del mayorista con su avance de días y clics. */
export type AnuncioPublicador = {
  id: number
  titulo: string
  cuerpo: string
  imagen: string | null
  monto: number
  estado: 'pendiente_pago' | 'activo' | 'caducado'
  dias: { lleva: number; total: number }
  vence_el: string | null
  clics: number
}
export type PublicarAnuncio = { titulo: string; cuerpo: string; plan: number; metodo_pago: 'efectivo' | 'tarjeta'; imagen?: string | null }
export type Plan = { clave: string; nombre: string; descripcion: string; precio_mensual: number; flags: Record<string, boolean | number | null> }
export type Suscripcion = { plan: string; nombre: string; hasta: string | null } | null

export const apiExtras = {
  banners: () => pedir<{ banners: Banner[] }>('/banners'),
  anuncio: () => pedir<{ anuncio: Anuncio | null }>('/anuncios'),
  anuncioVisto: (id: number, clic = false) =>
    pedir<{ ok: true }>(`/anuncios/${id}/${clic ? 'clic' : 'visto'}`, { method: 'POST', body: '{}' }),
  planes: () => pedir<{ planes: Plan[]; suscripcion: Suscripcion }>('/planes'),
  suscribir: (plan: string) =>
    pedir<{ mensaje: string; referencia: string }>('/planes/suscribir', { method: 'POST', body: JSON.stringify({ plan }) }),
  preferenciasCategorias: () =>
    pedir<{ categorias: { id: number; nombre: string }[]; seleccionadas: number[] }>('/perfil/categorias'),
  guardarPreferencias: (categoria_ids: number[]) =>
    pedir<{ ok: true; guardadas: number }>('/perfil/categorias', { method: 'POST', body: JSON.stringify({ categoria_ids }) }),
}

/** Sección de anuncios de mercado (marketplace) y publicaciones del mayorista. */
export const apiAnuncios = {
  /** 20 anuncios activos para el inicio del comercio, priorizados por pago. */
  marketplace: () => pedir<{ anuncios: AnuncioPublicacion[] }>('/anuncios/marketplace'),
  /** Los anuncios del mayorista en sesión. */
  publicaciones: () => pedir<{ anuncios: AnuncioPublicador[] }>('/anuncios/publicaciones'),
  publicar: (datos: PublicarAnuncio) =>
    pedir<{ ok: true; id: number; estado: string; referencia: string; vence_el: string | null; mensaje: string }>(
      '/anuncios/publicaciones',
      { method: 'POST', body: JSON.stringify(datos) },
    ),
  clic: (id: number) => pedir<{ ok: true }>(`/anuncios/${id}/clic`, { method: 'POST', body: '{}' }),
}
