import { pedir } from './api'

export type Proveedor = {
  uuid: string
  nombre: string
  giro: string
  reputacion: number | null
  horario: string
  monto_minimo: number
  ciudad: string
  total_productos: number
}

export type ProductoProveedor = {
  uuid: string
  nombre: string
  categoria: string
  precio: number
  unidad: string
  contenido: string
  stock: number
  minimo: number
  multiplo: number
}

export const apiProveedor = (uuid: string) =>
  pedir<{ proveedor: Proveedor; productos: ProductoProveedor[] }>(`/proveedor/${uuid}`)
