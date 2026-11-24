import { useEffect, useState } from 'react'
import Icon from './Icon'

/* Conexión con Canva (demo): la app no tiene client_id de Canva Connect, así que
   el flujo guarda el vínculo de la cuenta y guía la exportación: el usuario abre
   su diseño en Canva, lo exporta como PNG y lo sube con el botón de imagen.
   El diálogo muestra el estado y el enlace a canva.com. */

export const CANVA_CLAVE = 'ares-canva-vinculado'
export const CANVA_URL = 'https://www.canva.com'

/** ¿La cuenta quedó vinculada en este navegador? (localStorage, tolerante a modo privado). */
export function leerCanvaVinculado(): boolean {
  try {
    return localStorage.getItem(CANVA_CLAVE) === '1'
  } catch {
    return false
  }
}

function guardarVinculo(vinculado: boolean) {
  try {
    if (vinculado) localStorage.setItem(CANVA_CLAVE, '1')
    else localStorage.removeItem(CANVA_CLAVE)
  } catch {
    /* sin storage: el vínculo vive solo en el estado de esta sesión */
  }
}

type Props = {
  abierto: boolean
  onCerrar: () => void
  /** Avisa al padre para pintar el chip sin cerrar el diálogo. */
  onCambio?: (vinculado: boolean) => void
  /** Abre el selector de archivo del publicador (paso 1). */
  onSubirImagen?: () => void
}

const PASOS = [
  <>Abre tu diseño en <strong>Canva</strong> y ajústalo a formato vertical.</>,
  <>Entra a <strong>Compartir → Descargar</strong>.</>,
  <>Elige <strong>PNG</strong> y tamaño <strong>1080 × 1350 px</strong> (4:5, como en las fichas).</>,
  <>Vuelve aquí y usa <strong>Subir imagen</strong> para cargarlo en tu anuncio.</>,
]

export default function Canva({ abierto, onCerrar, onCambio, onSubirImagen }: Props) {
  const [vinculado, setVinculado] = useState<boolean>(leerCanvaVinculado)

  // Al abrir, relee la bandera: otra pestaña pudo conectarlo o desconectarlo.
  useEffect(() => {
    if (abierto) setVinculado(leerCanvaVinculado())
  }, [abierto])

  // Cierra con Escape mientras el diálogo está abierto.
  useEffect(() => {
    if (!abierto) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [abierto, onCerrar])

  if (!abierto) return null

  const abrirCanva = () => {
    window.open(CANVA_URL, '_blank', 'noopener,noreferrer')
  }

  const conectar = () => {
    guardarVinculo(true)
    setVinculado(true)
    onCambio?.(true)
    abrirCanva()
  }

  const desconectar = () => {
    guardarVinculo(false)
    setVinculado(false)
    onCambio?.(false)
  }

  return (
    <div className="canva__panel" role="dialog" aria-modal="true" aria-labelledby="canva-titulo">
      <div className="publicador__velo" onClick={onCerrar} />
      <div className="canva__caja">
        <header className="publicador__cab">
          <h2 id="canva-titulo">Canva</h2>
          <button type="button" className="icono-btn icono-btn--mini" onClick={onCerrar} aria-label="Cerrar">
            <Icon name="cerrar" size={16} />
          </button>
        </header>

        <div className="canva__cuerpo">
          <div className="canva__estado">
            <span className="canva__marca" aria-hidden="true">C</span>
            <div>
              <strong>Diseña tu anuncio en Canva</strong>
              <small>{vinculado ? 'Cuenta vinculada en este navegador.' : 'Aún no vinculas tu cuenta.'}</small>
            </div>
          </div>

          {vinculado ? (
            <p className="canva__texto">
              <span className="chip chip--ok"><Icon name="ok" size={12} /> Canva conectado</span>{' '}
              Abre Canva, exporta tu diseño y súbelo aquí. Puedes desconectar cuando quieras.
            </p>
          ) : (
            <p className="canva__texto">
              Conecta tu cuenta para diseñar con tus plantillas y subir el resultado como imagen del anuncio.
            </p>
          )}

          <ol className="canva__pasos">
            {PASOS.map((paso, i) => <li key={i}>{paso}</li>)}
          </ol>

          {!vinculado && (
            <p className="canva__aviso">
              Se abrirá canva.com en una pestaña nueva. Vínculo demo: no se pide contraseña ni se accede a tu cuenta.
            </p>
          )}
        </div>

        <footer className="canva__pie">
          {vinculado ? (
            <>
              <button type="button" className="btn btn--claro btn--mini" onClick={abrirCanva}>
                <Icon name="flecha" size={15} /> Abrir Canva
              </button>
              <button type="button" className="btn btn--claro btn--mini" onClick={desconectar}>
                Desconectar
              </button>
            </>
          ) : (
            <button type="button" className="btn btn--claro btn--mini" onClick={conectar}>
              <Icon name="rayo" size={15} /> Conectar Canva
            </button>
          )}
          {onSubirImagen && (
            <button type="button" className="btn btn--mini" onClick={onSubirImagen}>
              <Icon name="subir" size={15} /> Subir imagen
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}
