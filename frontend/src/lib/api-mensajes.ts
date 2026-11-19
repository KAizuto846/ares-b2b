import { pedir } from './api'

/** Una fila de la bandeja: la conversación vista desde el usuario en sesión. */
export type Hilo = {
  uuid: string
  tipo: 'directa' | 'soporte'
  titulo: string
  avatar: string | null
  interlocutor_id: number | null
  ultimo: string
  ultimo_at: string
  created_at: string
  no_leidos: number
}

export type Mensaje = {
  id: number
  cuerpo: string
  created_at: string
  /** «Tú» o el nombre visible del otro lado; en soporte siempre «Soporte». */
  autor: string
  mio: boolean
}

export type HiloAbierto = { uuid: string; tipo: string; titulo: string; soporte: boolean }

export type Aviso = {
  id: number
  tipo: string
  asunto: string
  cuerpo: string
  enlace: string
  cuando: string
  leido: boolean
}

export type Contacto = { id: number; nombre: string; rol: string }

export type TabMensajes = 'conversaciones' | 'notificaciones'

export type RespuestaHilos = {
  tab: 'conversaciones'
  hilos: Hilo[]
  contactos: Contacto[]
  es_admin: boolean
}

export type RespuestaAvisos = {
  tab: 'notificaciones'
  avisos: Aviso[]
  sin_leer: number
  activas: boolean
}

export type RespuestaBandeja = RespuestaHilos | RespuestaAvisos

export type AperturaHilo = { hilo: HiloAbierto; mensajes: Mensaje[]; ultimo_id: number }

export type ResultadoBorrado = { total: number }

const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) })

export const mensajes = {
  /** Globo del menú. Barato: una consulta por cambio de ruta. */
  resumen: () => pedir<{ sin_leer: number }>('/mensajes/resumen'),

  bandeja: (tab: TabMensajes) =>
    pedir<RespuestaBandeja>(`/mensajes?tab=${tab === 'notificaciones' ? 'notificaciones' : 'conversaciones'}`),

  /** Abre el hilo y lo marca leído en el servidor. */
  abrir: (uuid: string) => pedir<AperturaHilo>(`/mensajes/${encodeURIComponent(uuid)}`),

  /** Mensajes posteriores a `desde` para el hilo abierto. */
  nuevos: (uuid: string, desde: number) =>
    pedir<{ mensajes: Mensaje[] }>(`/mensajes/${encodeURIComponent(uuid)}/nuevos?desde=${desde}`),

  enviar: (conversacion: string, cuerpo: string) =>
    pedir<{ mensaje: Mensaje }>('/mensajes/enviar', json({ conversacion, cuerpo })),

  directo: (destino: { usuario_id: number } | { pedido_uuid: string }) =>
    pedir<{ uuid: string }>('/mensajes/directo', json(destino)),

  soporte: (cuerpo: string) => pedir<{ uuid: string; hilo: HiloAbierto }>('/mensajes/soporte', json({ cuerpo })),

  eliminar: (conversaciones: string[]) =>
    pedir<ResultadoBorrado>('/mensajes/eliminar', json({ conversaciones })),

  leido: (conversacion: string, ultimo_id: number) =>
    pedir<{ ultimo_leido: number }>('/mensajes/leido', json({ conversacion, ultimo_id })),

  config: () => pedir<{ activas: boolean }>('/mensajes/config'),

  guardarConfig: (notificaciones: boolean) =>
    pedir<{ activas: boolean }>('/mensajes/config', json({ notificaciones })),

  avisos: () => pedir<RespuestaAvisos>('/notificaciones'),
}
