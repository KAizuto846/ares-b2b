import { pedir } from './api'

export type Direccion = {
  id: number
  alias: string
  calle: string
  colonia: string
  ciudad: string
  estado_mx: string
  cp: string
  latitud: number
  longitud: number
  referencias: string
  es_principal: number
}

export type Calificacion = { promedio: number | null; total: number }

export type Comentario = { puntaje: number; comentario: string; autor: string; created_at: string }

export type KycDocumento = {
  id: number
  tipo: string
  estado: string
  motivo_rechazo: string
  created_at: string
  mime: string
  tamano_bytes: number
}

export type KycEstado = {
  documentos: KycDocumento[]
  requeridos: string[]
  faltantes: string[]
  completo: boolean
  en_revision: number
  aprobados: number
  estado: string
}

export type PerfilDetalle = {
  ok: true
  usuario: {
    id: number
    nombre: string
    email: string
    telefono: string
    avatar: string | null
    iniciales: string
    roles: string[]
  }
  rol: string
  etiqueta_rol: string
  perfil: {
    nombre_negocio: string
    nombre_comercial: string
    giro: string
    razon_social: string
    activo: number | null
  }
  direcciones: Direccion[]
  miembro: string
  calificacion: Calificacion
  desglose: { por_estrella: Record<string, number>; comentarios: Comentario[] }
  kyc: KycEstado
  verificado: boolean
  tema: 'claro' | 'oscuro'
  ultimo_login: string
}

export type DatosEdicion = {
  ok: true
  usuario: { id: number; nombre: string; email: string; telefono: string; avatar: string | null }
}

export type Preferencias = { notificaciones: boolean; sms: boolean; correo: boolean; ubicacion: boolean }

export type Acceso = { accion: string; entidad: string; descripcion: string; ip: string; user_agent: string; created_at: string }

export type Seguridad = {
  ok: true
  tema: 'claro' | 'oscuro'
  correo: string
  telefono: string
  ultimo_login: string
  miembro: string
  roles: { nombre: string; etiqueta: string; estado_verificacion: string }[]
  accesos: Acceso[]
  reglas_password: { minimo: number; mayuscula: boolean; numero: boolean; simbolo: boolean }
}

export type RolPermisos = { nombre: string; etiqueta: string; permite: string[]; kyc: string[]; verificacion: string }

export type Permisos = {
  ok: true
  tema: 'claro' | 'oscuro'
  roles: RolPermisos[]
  dispositivo: { clave: string; titulo: string; texto: string }[]
}

export type Kyc = {
  ok: true
  rol: string
  tema: 'claro' | 'oscuro'
  estado: KycEstado
  tipos: string[]
  limites: { max_bytes: number; mimes: string[] }
}

export type Faq = { pregunta: string; respuesta: string; enlace?: { texto: string; href: string } }

export type Ayuda = {
  ok: true
  tema: 'claro' | 'oscuro'
  soporte: { href: string; texto: string; horario: string }
  faqs: Faq[]
  legal: { texto: string; href: string }[]
}

export type DireccionNueva = {
  alias?: string
  calle: string
  colonia?: string
  ciudad: string
  estado_mx?: string
  cp?: string
  latitud?: number
  longitud?: number
  referencias?: string
  es_principal?: boolean
}

const json = (metodo: string, cuerpo?: unknown): RequestInit => ({
  method: metodo,
  ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
})

export const apiPerfil = {
  detalle: () => pedir<PerfilDetalle>('/perfil/detalle'),
  guardar: (datos: { nombre: string; email: string; telefono: string; nombre_negocio?: string }) =>
    pedir<DatosEdicion & { mensaje: string }>('/perfil', json('PATCH', datos)),
  subirAvatar: (data_url: string) => pedir<{ ok: true; mensaje: string; avatar: string }>('/perfil/avatar', json('POST', { data_url })),
  quitarAvatar: () => pedir<{ ok: true; mensaje: string; avatar: null }>('/perfil/avatar', json('DELETE')),
  crearDireccion: (d: DireccionNueva) =>
    pedir<{ ok: true; mensaje: string; direccion: { id: number }; direcciones: Direccion[] }>('/perfil/direccion', json('POST', d)),
  editarDireccion: (id: number, d: DireccionNueva) =>
    pedir<{ ok: true; mensaje: string; direcciones: Direccion[] }>(`/perfil/direccion/${id}`, json('PATCH', d)),
  borrarDireccion: (id: number) =>
    pedir<{ ok: true; mensaje: string; direcciones: Direccion[] }>(`/perfil/direccion/${id}`, json('DELETE')),
  privacidad: () => pedir<{ ok: true; preferencias: Preferencias }>('/perfil/privacidad'),
  guardarPrivacidad: (p: Preferencias) =>
    pedir<{ ok: true; mensaje: string; preferencias: Preferencias }>('/perfil/privacidad', json('POST', p)),
  password: (actual: string, nueva: string) =>
    pedir<{ ok: true; mensaje: string }>('/perfil/password', json('POST', { actual, nueva })),
  tema: (tema: 'claro' | 'oscuro') => pedir<{ ok: true; tema: string; mensaje: string }>('/perfil/tema', json('POST', { tema })),
  seguridad: () => pedir<Seguridad>('/perfil/seguridad'),
  permisos: () => pedir<Permisos>('/perfil/permisos'),
  kyc: () => pedir<Kyc>('/kyc'),
  subirKyc: (tipo: string, data_url: string) =>
    pedir<{ ok: true; mensaje: string; estado: KycEstado }>('/kyc', json('POST', { tipo, data_url })),
  ayuda: () => pedir<Ayuda>('/ayuda'),
  eliminar: (confirmacion: string, motivo: string) =>
    pedir<{ ok: true; mensaje: string }>('/perfil/eliminar', json('POST', { confirmacion, motivo })),
  calificar: (evaluado_id: number, puntaje: number, pedido_id?: number, comentario?: string) =>
    pedir<{ ok: true; mensaje: string; calificacion: Calificacion }>(
      '/perfil/calificar',
      json('POST', { evaluado_id, puntaje, pedido_id: pedido_id ?? 0, comentario: comentario ?? '' }),
    ),
}

/** Lee un archivo de imagen y lo entrega como data URL base64. */
export function leerDataUrl(archivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader()
    lector.onload = () => resolve(String(lector.result ?? ''))
    lector.onerror = () => reject(new Error('No se pudo leer el archivo.'))
    lector.readAsDataURL(archivo)
  })
}
