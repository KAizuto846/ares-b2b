import { pedir } from './api'

/** Utilidades del módulo de administración. Todo pasa por la API; nada en localStorage. */

export type Permisos = { rol: string; puede_mutar: boolean }

export type Contadores = {
  usuarios: number
  comercios: number
  mayoristas: number
  pedidos_hoy: number
  pedidos_activos: number
  kyc_documentos: number
  kyc_perfiles: number
  reclamos_abiertos: number
  envios_sin_repartidor: number
}

export type Pendiente = {
  tipo: string
  cantidad: number
  titulo: string
  texto: string
  accion: string
  href: string
}

export type Actividad = {
  id: number
  usuario_id: number | null
  accion: string
  entidad: string | null
  entidad_id: string | null
  descripcion: string
  created_at: string
  quien: string
  rol: string
}

export type Panel = {
  ok: true
  contadores: Contadores
  pendientes: Pendiente[]
  actividad: Actividad[]
  permisos: Permisos
}

export type UsuarioFila = {
  id: number
  nombre: string
  email: string
  estado: string
  created_at: string
  ultimo_login_at: string | null
  roles: string[]
  kyc: string
}

export type ListaUsuarios = {
  ok: true
  usuarios: UsuarioFila[]
  total: number
  page: number
  paginas: number
  per_page: number
  roles_disponibles: string[]
  filtros: { q: string; rol: string; estado: string }
  permisos: Permisos
}

export type PerfilComercio = {
  id: number
  nombre_negocio: string
  giro: string
  telefono_contacto: string | null
  gasto_mes_actual: string
  created_at: string
}

export type PerfilMayorista = {
  id: number
  uuid: string
  nombre_comercial: string
  razon_social: string | null
  categoria_giro: string
  monto_minimo: string
  estado_kyc: string
  activo: number
  created_at: string
}

export type PerfilRepartidor = {
  id: number
  estado_kyc: string
  disponible: number
  calificacion_promedio: string | null
  created_at: string
}

export type PedidoFila = { uuid: string; total: string; estado: string; created_at: string }

export type DocumentoKyc = {
  id: number
  tipo: string
  ruta_archivo: string
  mime: string
  tamano_bytes: number
  estado: string
  motivo_rechazo: string | null
  created_at: string
  updated_at?: string
}

export type AuditoriaFila = {
  accion: string
  entidad: string | null
  entidad_id: string | null
  descripcion: string
  created_at: string
  ip: string
}

export type DetalleUsuario = {
  ok: true
  usuario: {
    id: number
    uuid: string
    nombre: string
    email: string
    telefono: string
    estado: string
    created_at: string
    updated_at: string
    ultimo_login_at: string | null
    email_verificado_at: string | null
    telefono_verificado_at: string | null
    roles: string[]
  }
  perfiles: {
    comercio: PerfilComercio | null
    mayorista: PerfilMayorista | null
    repartidor: PerfilRepartidor | null
  }
  pedidos: PedidoFila[]
  documentos: DocumentoKyc[]
  auditoria: AuditoriaFila[]
  roles_disponibles: string[]
  permisos: Permisos
}

export type ColaKyc = {
  ok: true
  estado: string
  usuarios: {
    usuario_id: number
    nombre: string
    email: string
    negocio: string
    estado_perfil: string
    documentos: DocumentoKyc[]
  }[]
  perfiles_pendientes: {
    usuario_id: number
    nombre: string
    email: string
    negocio: string
    tipo_perfil: string
    estado_kyc: string
  }[]
  permisos: Permisos
}

export type Reclamo = {
  id: number
  uuid: string
  tipo: string
  descripcion: string
  estado: string
  resolucion: string | null
  monto_reembolso: string | null
  responsable: string | null
  respuesta: string | null
  created_at: string
  updated_at: string
  pedido_uuid: string
  pedido_total: string
  pedido_estado: string
  comercio: string
  mayorista: string
}

export type ListaReclamos = {
  ok: true
  estado: string
  reclamos: Reclamo[]
  conteo: Record<string, number>
  permisos: Permisos
}

export type Parametro = {
  clave: string
  valor_actual: string
  tipo: string
  descripcion: string | null
  version: number
  cambiado_at: string
  cambiado_por_email: string
  cambiado_por_nombre: string
}

export type ListaParametros = { ok: true; parametros: Parametro[]; permisos: Permisos }

export type HistorialParametro = {
  ok: true
  clave: string
  parametro: { clave: string; valor_actual: string; tipo: string; descripcion: string | null; version: number; cambiado_at: string }
  historial: {
    id: number
    version: number
    valor_anterior: string | null
    valor_nuevo: string
    cambiado_at: string
    ip: string
    admin_email: string
    admin_nombre: string
  }[]
}

export type Consolidacion = {
  id: number
  uuid: string
  flete_original: string
  flete_consolidado: string
  ahorro: string
  estado: string
  creado_at: string
  mayorista: string
  pedidos: number
}

export type PlanBnpl = {
  id: number
  uuid: string
  total: string
  cuotas: number
  cuota_monto: string
  cuota_actual: number
  estado: string
  primera_cuota: string
  ultima_cuota: string
  creado_at: string
  pedido_uuid: string
  mayorista: string
  pagadas: number
}

export type Licitacion = {
  id: number
  uuid: string
  titulo: string
  descripcion: string | null
  monto_minimo: string | null
  monto_maximo: string | null
  estado: string
  vence_en: string
  creado_at: string
  mayorista: string
  comercio_adjudicado: string | null
  cotizaciones: number
}

export type PostMvp = {
  ok: true
  resumen: { consolidaciones_activas: number; bnpl_activos: number; licitaciones_abiertas: number; ahorro_total: number }
  consolidaciones: Consolidacion[]
  bnpl: PlanBnpl[]
  licitaciones: Licitacion[]
  mayoristas: { id: number; nombre_comercial: string }[]
  pedidos: { id: number; uuid: string; total: string; envio: string; estado: string; mayorista_id: number; mayorista: string }[]
  parametros: { consolidacion_min_pedidos: number; bnpl_cuotas_max: number; licitacion_ventana_horas: number }
  permisos: Permisos
}

const enviar = (path: string, cuerpo: unknown) =>
  pedir<{ ok: true; mensaje: string }>(path, { method: 'POST', body: JSON.stringify(cuerpo) })

// ------------------------------------------------------------------ panel

export const apiPanel = () => pedir<Panel>('/admin/panel')

// --------------------------------------------------------------- usuarios

export const apiUsuarios = (f: { q?: string; rol?: string; estado?: string; page?: number }) => {
  const p = new URLSearchParams()
  if (f.q) p.set('q', f.q)
  if (f.rol) p.set('rol', f.rol)
  if (f.estado) p.set('estado', f.estado)
  if (f.page && f.page > 1) p.set('page', String(f.page))
  const qs = p.toString()

  return pedir<ListaUsuarios>(`/admin/usuarios${qs ? `?${qs}` : ''}`)
}

export const apiUsuario = (id: number | string) => pedir<DetalleUsuario>(`/admin/usuarios/${id}`)

export const apiGuardarRoles = (id: number, roles: string[]) =>
  enviar(`/admin/usuarios/${id}/roles`, { roles })

export const apiCambiarEstado = (id: number, activo: boolean) =>
  enviar(`/admin/usuarios/${id}/estado`, { activo })

// -------------------------------------------------------------------- KYC

export const apiKyc = (estado = 'pendiente') =>
  pedir<ColaKyc>(`/admin/kyc?estado=${encodeURIComponent(estado)}`)

export const apiDecidirKyc = (id: number, decision: 'aprobar' | 'rechazar', motivo = '') =>
  enviar(`/admin/kyc/${id}`, { decision, motivo })

// --------------------------------------------------------------- reclamos

export const apiReclamos = (estado = '') =>
  pedir<ListaReclamos>(`/admin/reclamos${estado ? `?estado=${encodeURIComponent(estado)}` : ''}`)

export const apiResolverReclamo = (
  id: number,
  datos: { estado: string; resolucion?: string; monto_reembolso?: number | null; respuesta?: string }
) => enviar(`/admin/reclamos/${id}`, datos)

// ------------------------------------------------------------- parámetros

export const apiParametros = () => pedir<ListaParametros>('/admin/parametros')

export const apiGuardarParametro = (clave: string, valor: string) =>
  pedir<{ ok: true; mensaje: string; version: number; sin_cambios?: boolean }>(
    `/admin/parametros/${encodeURIComponent(clave)}`,
    { method: 'POST', body: JSON.stringify({ valor }) }
  )

export const apiHistorialParametro = (clave: string) =>
  pedir<HistorialParametro>(`/admin/parametros/${encodeURIComponent(clave)}/historial`)

// ---------------------------------------------------------------- post-MVP

export const apiPostMvp = () => pedir<PostMvp>('/admin/postmvp')

export const apiCrearConsolidacion = (mayorista_id: number, pedidos_ids: string[]) =>
  enviar('/admin/postmvp/consolidaciones', { mayorista_id, pedidos_ids })

export const apiCrearBnpl = (pedido_id: number, cuotas: number) => enviar('/admin/postmvp/bnpl', { pedido_id, cuotas })

export const apiCrearLicitacion = (datos: {
  mayorista_id: number
  titulo: string
  descripcion?: string
  monto_minimo?: number | null
  monto_maximo?: number | null
  ventana_horas?: number
}) => enviar('/admin/postmvp/licitaciones', datos)

export const apiEstadoPostMvp = (recurso: 'consolidaciones' | 'bnpl' | 'licitaciones', id: number, estado: string) =>
  enviar(`/admin/postmvp/${recurso}/${id}/estado`, { estado })
