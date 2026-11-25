export type ApiError = { code: string; message: string }

/**
 * Base de la app tal como la ve el navegador ("/spa"). Se usa para armar las
 * rutas de la API: en local quedan en /spa/api y el Funnel, que recorta el
 * prefijo, las recibe como /api. Así funciona igual servida en la raíz.
 */
export const BASE_APP = import.meta.env.BASE_URL.replace(/\/$/, '')
export const URL_API = `${BASE_APP}/api`

/**
 * Convierte una ruta del servidor (/avatar/2, /assets/img/…) en una que sobrevive
 * al Funnel: se pide bajo la base de la app y el proxy recorta el prefijo.
 */
export const urlApp = (ruta?: string | null): string => {
  if (!ruta) return ''
  if (/^(https?:|data:|blob:)/.test(ruta)) return ruta
  return `${BASE_APP}${ruta.startsWith('/') ? '' : '/'}${ruta}`
}

/**
 * Tokens JWT (Bearer). El access token vive en localStorage (vida corta, 30 min)
 * y el refresh token permite renovarlo sin volver a pedir credenciales.
 */
const CLAVE_TOKEN = 'ares_jwt'
const CLAVE_REFRESCO = 'ares_jwt_refresh'

export const jwtToken = (): string => localStorage.getItem(CLAVE_TOKEN) ?? ''
export const jwtGuardar = (access: string, refresh?: string): void => {
 localStorage.setItem(CLAVE_TOKEN, access)
 if (refresh) localStorage.setItem(CLAVE_REFRESCO, refresh)
}
export const jwtLimpiar = (): void => {
 localStorage.removeItem(CLAVE_TOKEN)
 localStorage.removeItem(CLAVE_REFRESCO)
}

/** Renueva el access token con el refresh token. Devuelve true si logró renovar. */
async function renovarToken(): Promise<boolean> {
 const refresh = localStorage.getItem(CLAVE_REFRESCO)
 if (!refresh) return false
 const res = await fetch(`${URL_API}/auth/refresh`, {
 method: 'POST',
 credentials: 'same-origin',
 headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
 body: JSON.stringify({ refresh_token: refresh }),
 })
 const data = await res.json().catch(() => null)
 if (!res.ok || !data?.ok) {
 jwtLimpiar()
 return false
 }
 localStorage.setItem(CLAVE_TOKEN, data.access_token)
 return true
}

/** Petición JSON genérica. Los módulos la reutilizan para no duplicar manejo de errores. */
export async function pedir<T>(path: string, init: RequestInit = {}): Promise<T> {
 const token = jwtToken()
 const cabeceras: Record<string, string> = {
 'Content-Type': 'application/json',
 Accept: 'application/json',
 ...(token ? { Authorization: `Bearer ${token}` } : {}),
 ...((init.headers as Record<string, string>) ?? {}),
 }

 const res = await fetch(`${URL_API}${path}`, {
 credentials: 'same-origin',
 headers: cabeceras,
 ...init,
 })
 const data = await res.json().catch(() => null)

 // Access token expirado: un intento de renovación y reintento único.
 if (res.status === 401 && data?.error?.code === 'TOKEN_EXPIRADO') {
 if (await renovarToken()) {
 return pedir<T>(path, init)
 }
 }

 if (!res.ok || !data || data.ok === false) {
 const err: ApiError = data?.error ?? { code: 'RED', message: 'Sin conexión con el servidor.' }
 throw Object.assign(new Error(err.message), { code: err.code })
 }
 return data as T
}

const req = pedir

export type Usuario = { id: number; nombre: string; email: string; telefono?: string; avatar: string | null; roles: string[] }
export type Metrica = { valor: string; etiqueta: string; nota?: string; href: string }
export type Acceso = { href: string; titulo: string; texto: string; icono: string; globos?: number }
export type Producto = {
  uuid: string; nombre: string; precio_base: number; unidad_venta: string; contenido: string
  stock_disponible: number; cantidad_minima: number; multiplo_venta: number; categoria: string
  distancia_km: number; mayorista: { uuid: string; nombre: string }
}
export type Linea = { producto_uuid: string; nombre: string; cantidad: number; total: number; unidad_venta: string; contenido: string; agotado: boolean }
export type Grupo = { mayorista: string; mayorista_uuid: string; items: Linea[]; total: number; subtotal: number; monto_minimo: number; faltante: number; cumple_minimo: boolean; listo: boolean; bloqueado?: boolean }
export type Carrito = {
  grupos: Grupo[]; subtotal: number; iva: number; total: number; items: number
  listos: number; total_grupos: number; subtotal_listo: number; iva_listo: number; total_listo: number
  puede_checkout: boolean; problemas: string[]
}
export type Pedido = { uuid: string; estado: string; total: number; created_at: string; contraparte: string; lineas: number }

export type Suscripcion = { plan: string; flags: Record<string, boolean> }

export const api = {
  session: () => req<{ usuario: Usuario | null; rol: string | null; tema?: 'claro' | 'oscuro'; onboarding_completo?: boolean | null; suscripcion?: Suscripcion | null }>('/session'),
  login: (email: string, password: string, recordar = false) => req<{ access_token: string; refresh_token: string; token_type: string; expires_in: number; usuario: Usuario; rol: string; tema?: 'claro' | 'oscuro'; onboarding_completo?: boolean | null; suscripcion?: Suscripcion | null }>('/login', { method: 'POST', body: JSON.stringify({ email, password, recordar }) }),
  completarOnboarding: () => req<{ ok: true; onboarding_completo: boolean }>('/session/onboarding', { method: 'POST', body: '{}' }),
  logout: () => req('/logout', { method: 'POST' }),
  inicio: () => req<{ nombre: string; rol: string; metricas: Metrica[]; accesos: Acceso[]; herramientas: Acceso[] }>('/inicio'),
  buscar: (p: Record<string, string | number>) => req<{ resultados: Producto[]; total: number; paginas: number; page: number }>(`/buscar?${new URLSearchParams(p as never)}`),
  carrito: () => req<Carrito & { ok: true }>('/carrito'),
  agregar: (producto: string, cantidad: number) => req<{ mensaje: string; carrito: Carrito }>('/carrito/agregar', { method: 'POST', body: JSON.stringify({ producto, cantidad }) }),
  item: (producto: string, cantidad: number) => req<{ carrito: Carrito }>('/carrito/item', { method: 'PATCH', body: JSON.stringify({ producto, cantidad }) }),
  quitar: (producto: string) => req<{ carrito: Carrito }>('/carrito/item', { method: 'DELETE', body: JSON.stringify({ producto }) }),
  vaciar: () => req<{ carrito: Carrito }>('/carrito', { method: 'DELETE' }),
  checkout: () => req<{ resumen: Carrito; direcciones: { id: number; calle: string; colonia: string; ciudad: string }[] }>('/checkout'),
  confirmar: (direccion_id: number) => req<{ data: { pedidos: { uuid: string; total: number }[]; total: number; quedan: number }; carrito: Carrito }>('/checkout', { method: 'POST', body: JSON.stringify({ direccion_id, idempotency_key: crypto.randomUUID() }) }),
  pedidos: () => req<{ pedidos: Pedido[] }>('/pedidos'),
  perfil: () => req<{ usuario: Usuario; perfil: Record<string, unknown>; direcciones: { id: number; calle: string; colonia: string; ciudad: string }[]; miembro: string }>('/perfil'),
  productos: (q = '') => req<{ productos: Record<string, unknown>[] }>(`/productos?q=${encodeURIComponent(q)}`),
  admin: () => req<{ resumen: Record<string, number> }>('/admin'),
}
