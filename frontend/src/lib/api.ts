export type ApiError = { code: string; message: string }

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    ...init,
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data || data.ok === false) {
    const err: ApiError = data?.error ?? { code: 'RED', message: 'Sin conexión con el servidor.' }
    throw Object.assign(new Error(err.message), { code: err.code })
  }
  return data as T
}

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

export const api = {
  session: () => req<{ usuario: Usuario | null; rol: string | null }>('/session'),
  login: (email: string, password: string) => req<{ usuario: Usuario; rol: string }>('/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
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
