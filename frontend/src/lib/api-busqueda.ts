import { pedir } from './api'

/**
 * Buscador: filtros, resultados paginados, puntos del mapa y foto del producto.
 *
 * Todo pasa por /api/busqueda/* (backend/app/Api/busqueda.php), que a su vez
 * delega en BusquedaService: misma geocerca, mismo tope de 30 km, mismo orden.
 * /api/buscar sigue existiendo y devuelve el mismo contrato de resultados, pero
 * no acepta categoria_id; por eso la pantalla usa /busqueda/productos.
 */

export type CategoriaBusqueda = { id: number; nombre: string }

export type MayoristaResultado = {
  uuid: string
  nombre: string
  reputacion: number | null
  latitud: number
  longitud: number
  monto_minimo: number
}

export type ResultadoBusqueda = {
  uuid: string
  nombre: string
  categoria: string
  categoria_id: number
  precio_base: number
  precio_con_iva: number
  unidad_venta: string
  contenido: string
  stock_disponible: number
  cantidad_minima: number
  multiplo_venta: number
  distancia_km: number
  mayorista: MayoristaResultado
  foto: string | null
}

export type RespuestaBusqueda = {
  ok: true
  resultados: ResultadoBusqueda[]
  total: number
  page: number
  per_page: number
  paginas: number
  radio: number
  orden: string
  cacheado: boolean
  categoria_id: number
  q: string
}

export type PuntoMapa = {
  uuid: string
  nombre: string
  lat: number
  lng: number
  productos: number
  distancia_km: number
  monto_minimo: number
  precio_desde: number
  reputacion: number | null
  categoria: string
}

export type RespuestaMapa = {
  ok: true
  total: number
  mayoristas: number
  puntos: PuntoMapa[]
  centro: { lat: number; lng: number }
  radio: number
  orden: string
  q: string
  categoria_id: number
}

export type RespuestaOpciones = {
  ok: true
  radios: number[]
  radio_max: number
  radio_default: number
  per_page: number
  ordenes: { valor: string; texto: string }[]
  categorias: CategoriaBusqueda[]
}

export type ParametrosBusqueda = {
  q?: string
  categoria_id?: number
  radio?: number
  orden?: string
  lat?: number
  lng?: number
  page?: number
  per_page?: number
}

/** Query string sin vacíos: el backend aplica sus propios valores por defecto. */
function consulta(parametros: ParametrosBusqueda): string {
  const partes = new URLSearchParams()

  for (const [clave, valor] of Object.entries(parametros)) {
    if (valor === undefined || valor === null || valor === '') continue
    partes.set(clave, String(valor))
  }

  return partes.toString()
}

export const apiBusqueda = {
  productos: (parametros: ParametrosBusqueda = {}) =>
    pedir<RespuestaBusqueda>(`/busqueda/productos?${consulta(parametros)}`),
  mapa: (parametros: ParametrosBusqueda = {}) =>
    pedir<RespuestaMapa>(`/busqueda/mapa?${consulta(parametros)}`),
  filtros: () => pedir<RespuestaOpciones>('/busqueda/filtros'),
  categorias: () => pedir<{ ok: true; categorias: CategoriaBusqueda[] }>('/busqueda/categorias'),
}

/** Foto pública del producto (misma que pinta la tarjeta). */
export const urlFoto = (resultado: ResultadoBusqueda): string | null =>
  resultado.foto ?? null
