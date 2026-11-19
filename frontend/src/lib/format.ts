export const money = (n: number) => '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const money0 = (n: number) => '$' + n.toLocaleString('es-MX', { maximumFractionDigits: 0 })

export const fecha = (iso: string) =>
  new Date(iso.replace(' ', 'T')).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })

export const relativo = (iso: string) => {
  const d = new Date(iso.replace(' ', 'T')).getTime()
  const min = Math.round((Date.now() - d) / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  const dias = Math.round(h / 24)
  return dias === 1 ? 'ayer' : `hace ${dias} días`
}

export const ESTADOS: Record<string, { texto: string; tono: string }> = {
  borrador: { texto: 'Borrador', tono: 'neutro' },
  pendiente_pago: { texto: 'Pendiente de pago', tono: 'alerta' },
  pendiente_aceptacion: { texto: 'Por aceptar', tono: 'alerta' },
  aceptado: { texto: 'Aceptado', tono: 'info' },
  preparando: { texto: 'Preparando', tono: 'info' },
  en_camino: { texto: 'En camino', tono: 'info' },
  entregado: { texto: 'Entregado', tono: 'ok' },
  pagado: { texto: 'Pagado', tono: 'ok' },
  listo: { texto: 'Listo', tono: 'info' },
  buscando_repartidor: { texto: 'Buscando repartidor', tono: 'alerta' },
  en_reparto: { texto: 'En reparto', tono: 'info' },
  repartidor_asignado: { texto: 'Repartidor asignado', tono: 'info' },
  recibido: { texto: 'Recibido', tono: 'ok' },
  expirado: { texto: 'Expirado', tono: 'neutro' },
  devuelto: { texto: 'Devuelto', tono: 'malo' },
  reembolsado: { texto: 'Reembolsado', tono: 'neutro' },
  en_disputa: { texto: 'En disputa', tono: 'malo' },
  cancelado: { texto: 'Cancelado', tono: 'malo' },
}

/** Etiqueta legible para cualquier estado, aunque no esté en el mapa. */
export const estado = (clave: string) => {
  const e = ESTADOS[clave]
  if (e) return e
  const texto = clave.replace(/_/g, ' ')
  return { texto: texto.charAt(0).toUpperCase() + texto.slice(1), tono: 'neutro' }
}
