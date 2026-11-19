import type { ReactNode } from 'react'
import Icon from './Icon'

export function Skeleton({ h = 16, w = '100%', r = 10 }: { h?: number; w?: number | string; r?: number }) {
  return <div className="skel" style={{ height: h, width: w, borderRadius: r }} />
}

export function Vacio({ titulo, texto, accion }: { titulo: string; texto?: string; accion?: ReactNode }) {
  return (
    <div className="vacio">
      <strong>{titulo}</strong>
      {texto && <span>{texto}</span>}
      {accion}
    </div>
  )
}

export function Chip({ children, tono = 'neutro' }: { children: ReactNode; tono?: string }) {
  return <span className={`chip chip--${tono}`}>{children}</span>
}

export function Aviso({ children, tipo = 'info' }: { children: ReactNode; tipo?: string }) {
  return <div className={`aviso aviso--${tipo}`}>{children}</div>
}

export function IconoBoton({ name, label, onClick, badge }: { name: string; label: string; onClick?: () => void; badge?: number }) {
  return (
    <button type="button" className="icono-btn" aria-label={label} onClick={onClick}>
      <Icon name={name} size={19} />
      {!!badge && badge > 0 && <span className="carrito-btn__globo">{badge > 99 ? '99+' : badge}</span>}
    </button>
  )
}
