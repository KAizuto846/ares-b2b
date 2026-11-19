import { pedir } from './api'

/** Categoría activa del catálogo (las restringidas dejan el producto inactivo). */
export type Categoria = { id: number; nombre: string; restringida: boolean }

/** Producto tal como lo devuelve la lista: números, no cadenas con «$». */
export type ProductoCatalogo = {
  uuid: string
  nombre: string
  descripcion: string
  categoria: string
  categoria_id: number
  precio_base: number
  precio_con_iva: number
  iva_tasa: number
  unidad_venta: string
  contenido: string
  presentacion: string
  peso_kg: number
  volumen_m3: number
  cantidad_minima: number
  multiplo_venta: number
  stock: number
  activo: boolean
  perecedero: boolean
  requiere_frio: boolean
  inflamable: boolean
  restringido: boolean
  foto: string | null
  /** En la lista es el número de tramos; en el detalle, los tramos. */
  escalas: number
  created_at: string
  updated_at: string
}

/** Tramo de precio por volumen: de `desde` a `hasta` (null = en adelante). */
export type EscalaTramo = {
  desde: number
  hasta: number | null
  precio: number
  tipo?: string
  valor?: number
  etiqueta?: string
}

export type ProductoDetalle = Omit<ProductoCatalogo, 'escalas'> & {
  escalas: EscalaTramo[]
  imagenes: { url: string; orden: number }[]
  puede_publicar: boolean
}

export type ConteosCatalogo = {
  total: number
  activos: number
  agotados: number
  borrador: number
  unidades: number
  valor_inventario: number
}

export type ListaCatalogo = {
  productos: ProductoCatalogo[]
  total: number
  page: number
  paginas: number
  per_page: number
  conteos: ConteosCatalogo
  puede_publicar: boolean
}

/** Lo que se manda al alta o a la edición. */
export type EntradaProducto = {
  nombre: string
  categoria_id: number
  descripcion?: string
  unidad_venta: string
  contenido: string
  precio_base: number
  iva_tasa?: number
  peso_kg?: number
  volumen_m3?: number
  stock?: number
  cantidad_minima?: number
  multiplo_venta?: number
  perecedero?: boolean
  requiere_frio?: boolean
  inflamable?: boolean
  restringido?: boolean
  activo?: boolean
  escalas?: { desde: number; hasta?: number | null; precio: number }[]
  imagen?: string
  quitar_imagen?: boolean
}

export type ResultadoImportacion = {
  creados: number
  total: number
  errores: { linea: number; motivo: string }[]
}

/** Error con el detalle por campo que manda el servidor (422). */
export type ErrorCatalogo = Error & { code?: string; campos?: Record<string, string> }

async function pedirConCampos<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    ...init,
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data || data.ok === false) {
    const err = data?.error ?? { code: 'RED', message: 'Sin conexión con el servidor.' }
    throw Object.assign(new Error(err.message ?? 'No se pudo guardar.'), {
      code: err.code,
      campos: err.campos ?? {},
    }) as ErrorCatalogo
  }
  return data as T
}

export const apiCatalogo = {
  lista: (params: { q?: string; estado?: string; page?: number; per_page?: number } = {}) => {
    const qs = new URLSearchParams()
    if (params.q) qs.set('q', params.q)
    if (params.estado) qs.set('estado', params.estado)
    if (params.page) qs.set('page', String(params.page))
    if (params.per_page) qs.set('per_page', String(params.per_page))
    const cola = qs.toString()
    return pedir<ListaCatalogo>(`/catalogo${cola ? `?${cola}` : ''}`)
  },

  categorias: () => pedir<{ categorias: Categoria[] }>('/catalogo/categorias'),

  detalle: (uuid: string) => pedir<{ producto: ProductoDetalle }>(`/catalogo/${uuid}`),

  crear: (datos: EntradaProducto) =>
    pedirConCampos<{ uuid: string; mensaje: string }>('/catalogo', { method: 'POST', body: JSON.stringify(datos) }),

  actualizar: (uuid: string, datos: Partial<EntradaProducto>) =>
    pedirConCampos<{ uuid: string; mensaje: string; producto: ProductoCatalogo }>(`/catalogo/${uuid}`, {
      method: 'PATCH',
      body: JSON.stringify(datos),
    }),

  borrar: (uuid: string) => pedir<{ mensaje: string }>(`/catalogo/${uuid}`, { method: 'DELETE' }),

  guardarEscalas: (uuid: string, escalas: { desde: number; hasta?: number | null; precio: number }[]) =>
    pedirConCampos<{ mensaje: string; escalas: EscalaTramo[] }>(`/catalogo/${uuid}/escalas`, {
      method: 'POST',
      body: JSON.stringify({ escalas }),
    }),

  importar: (contenido: string) =>
    pedirConCampos<ResultadoImportacion>('/catalogo/importar', {
      method: 'POST',
      body: JSON.stringify({ contenido }),
    }),
}

/** URL de la foto guardada (SIEMPRE por la API, nunca un archivo suelto). */
export const urlFoto = (uuid: string) => `/api/catalogo/imagen/${uuid}`

/** Enlace de descarga de la plantilla CSV. */
export const URL_PLANTILLA = '/api/catalogo/plantilla'
