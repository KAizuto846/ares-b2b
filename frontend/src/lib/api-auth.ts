import { pedir } from './api'

/**
 * Contrato JSON del módulo Auth (backend/app/Api/auth.php).
 *
 * Todas estas rutas son públicas: se usan antes de tener sesión (alta de
 * cuenta, recuperación, verificación y textos legales). Los importes no
 * existen aquí; las fechas llegan como 'YYYY-MM-DD HH:MM:SS'.
 */

export type RolAlta = 'comercio' | 'mayorista' | 'repartidor'

export type RolCatalogo = {
  clave: RolAlta
  titulo: string
  descripcion: string
  detalle: string
  requiere_negocio: boolean
  requiere_rfc: boolean
}

export type UsuarioAlta = {
  id: number
  uuid: string
  nombre: string
  email: string
  telefono: string
  estado: string
  email_verificado: boolean
  created_at: string
}

export type AltaDatos = {
  rol: RolAlta
  nombre: string
  negocio?: string
  email: string
  telefono: string
  password: string
  rfc?: string
}

export type AltaRespuesta = {
  mensaje: string
  rol: RolAlta
  usuario: UsuarioAlta
  rfc: string | null
  /** Solo fuera de producción: token del enlace de confirmación. */
  verificacion?: { token: string; enlace: string }
}

export type RecuperarRespuesta = {
  mensaje: string
  /** Solo fuera de producción: sirven para probar el flujo sin correo/SMS. */
  token?: string
  codigo?: string
  enlace?: string
}

export type RestablecerDatos = {
  password: string
  token?: string
  codigo?: string
  identificador?: string
}

export type EstadoVerificacion = 'ok' | 'caducado' | 'invalido'

export type VerificarRespuesta = {
  estado: EstadoVerificacion
  mensaje: string
}

export type BloqueLegal = {
  titulo: string
  parrafos: string[]
  lista?: string[]
}

export type DocumentoLegal = {
  titulo: string
  actualizado: string
  intro: string
  bloques: BloqueLegal[]
}

export type DocumentoClave = 'terminos' | 'privacidad'

/** Código de error que devuelve el alta cuando el correo ya está tomado. */
export const CODIGO_CORREO_REPETIDO = 'CORREO_REPETIDO'

export const apiAuth = {
  roles: () => pedir<{ roles: RolCatalogo[] }>('/auth/roles').then((r) => r.roles),

  registro: (datos: AltaDatos) =>
    pedir<AltaRespuesta>('/auth/registro', { method: 'POST', body: JSON.stringify(datos) }),

  recuperar: (identificador: string) =>
    pedir<RecuperarRespuesta>('/auth/recuperar', {
      method: 'POST',
      body: JSON.stringify({ identificador }),
    }),

  restablecer: (datos: RestablecerDatos) =>
    pedir<{ mensaje: string }>('/auth/restablecer', {
      method: 'POST',
      body: JSON.stringify(datos),
    }),

  verificar: (token: string) =>
    pedir<VerificarRespuesta>(`/auth/verificar?token=${encodeURIComponent(token)}`),

  legales: (documento: DocumentoClave) =>
    pedir<{ documento: DocumentoLegal }>(`/legales/${documento}`).then((r) => r.documento),
}

export type Fuerza = { nivel: 0 | 1 | 2 | 3 | 4; faltas: string[]; etiqueta: string }

/**
 * Mismas cuatro señales que valida el backend (12 caracteres, mayúscula,
 * número y símbolo). Se usa para el medidor del alta y del restablecimiento.
 */
export function medirPassword(password: string): Fuerza {
  const senales = [
    password.length >= 12,
    /\p{Lu}/u.test(password),
    /\d/.test(password),
    /[^\p{L}\p{N}\s]/u.test(password),
  ]

  const faltas: string[] = []
  if (!senales[0]) faltas.push('12 caracteres')
  if (!senales[1]) faltas.push('una mayúscula')
  if (!senales[2]) faltas.push('un número')
  if (!senales[3]) faltas.push('un símbolo')

  const nivel = senales.filter(Boolean).length as Fuerza['nivel']
  const etiqueta = ['Muy débil', 'Débil', 'Floja', 'Buena', 'Fuerte'][nivel]

  return { nivel, faltas, etiqueta }
}

/** Código de error de una petición fallida (pedir adjunta `code`). */
export function codigoError(error: unknown): string {
  return String((error as { code?: string } | null)?.code ?? '')
}
