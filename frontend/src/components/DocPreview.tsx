import { useEffect, useState } from 'react'

type Props = {
  /** Id del documento KYC en el backend. */
  id: number
  mime: string
  /** Etiqueta accesible. */
  tipo: string
}

/**
 * Previsualización de un documento KYC: imágenes inline, PDF en un iframe y
 * fallback de descarga para lo demás. El archivo se sirve autenticado por
 * GET /admin/kyc/{id}/archivo, así que basta con apuntar la URL.
 */
export default function DocPreview({ id, mime, tipo }: Props) {
  const [abierto, setAbierto] = useState(false)
  const url = `/api/admin/kyc/${id}/archivo`
  const esImagen = mime.startsWith('image/')

  // Cierra con Escape mientras el preview está abierto.
  useEffect(() => {
    if (!abierto) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [abierto])

  if (!abierto) {
    return (
      <button type="button" className="kyc-ver" onClick={() => setAbierto(true)}>
        Ver documento
      </button>
    )
  }

  return (
    <div className="kyc-preview" role="dialog" aria-label={`Documento ${tipo}`} onClick={() => setAbierto(false)}>
      <div className="kyc-preview__caja" onClick={(e) => e.stopPropagation()}>
        <header className="kyc-preview__cab">
          <strong>{tipo}</strong>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <a className="btn btn--claro btn--mini" href={url} download={`kyc-${id}`}>
              Descargar
            </a>
            <button type="button" className="icono-btn icono-btn--mini" onClick={() => setAbierto(false)} aria-label="Cerrar">
              ✕
            </button>
          </div>
        </header>
        <div className="kyc-preview__cuerpo">
          {esImagen ? (
            <img src={url} alt={`Documento ${tipo}`} />
          ) : mime.includes('pdf') ? (
            <iframe src={url} title={`Documento ${tipo}`} />
          ) : (
            <p className="apunte" style={{ padding: 20 }}>
              Este tipo de archivo no se puede previsualizar. Usa «Descargar».
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
