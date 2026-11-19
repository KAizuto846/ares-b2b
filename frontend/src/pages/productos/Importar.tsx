import { useRef, useState } from 'react'
import { apiCatalogo, URL_PLANTILLA } from '../../lib/api-catalogo'
import type { ResultadoImportacion } from '../../lib/api-catalogo'
import Icon from '../../components/Icon'
import { useNavegar } from '../../store/session'

const COLUMNAS: { clave: string; que: string; ejemplo: string }[] = [
  { clave: 'nombre', que: 'Cómo lo verá el comercio en el catálogo.', ejemplo: 'Azúcar estándar 50 kg' },
  { clave: 'categoria', que: 'Nombre exacto de una categoría activa.', ejemplo: 'Abarrotes' },
  { clave: 'unidad', que: 'Cómo se vende: Caja, Pieza, Costal…', ejemplo: 'Costal' },
  { clave: 'contenido', que: 'Qué lleva cada unidad de venta.', ejemplo: '50 kg' },
  { clave: 'precio', que: 'Precio por unidad de venta, sin IVA. Solo números y punto decimal.', ejemplo: '1250.00' },
  { clave: 'stock', que: 'Piezas que tienes hoy. Si es 0 aparece como agotado.', ejemplo: '20' },
  { clave: 'minimo', que: 'Mínimo que puede pedir el comercio.', ejemplo: '1' },
  { clave: 'multiplo', que: 'De cuánto en cuánto se puede pedir.', ejemplo: '1' },
]

const EJEMPLO = `nombre,categoria,unidad,contenido,precio,stock,minimo,multiplo
Azúcar estándar 50 kg,Abarrotes,Costal,50 kg,1250.00,20,1,1
Café molido 1 kg,Abarrotes,Pieza,1 kg,185.50,40,1,1`

const MAX_BYTES = 5 * 1024 * 1024

export default function ProductoImportar() {
  const [texto, setTexto] = useState('')
  const [nombreArchivo, setNombreArchivo] = useState('')
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const archivoRef = useRef<HTMLInputElement | null>(null)
  const navegar = useNavegar()

  const leerArchivo = (archivo: File | undefined) => {
    if (!archivo) return
    setError('')

    if (archivo.size > MAX_BYTES) {
      setError('El archivo pasa de 5 MB. Divide el inventario en partes más pequeñas.')
      return
    }

    const lector = new FileReader()
    lector.onload = () => {
      setTexto(String(lector.result ?? ''))
      setNombreArchivo(archivo.name)
    }
    lector.onerror = () => setError('No se pudo leer el archivo. Intenta de nuevo.')
    lector.readAsText(archivo, 'utf-8')
  }

  const importar = async () => {
    setError('')
    setResultado(null)

    if (texto.trim() === '') {
      setError('Pega el contenido del CSV o elige un archivo.')
      return
    }

    setEnviando(true)
    try {
      const r = await apiCatalogo.importar(texto)
      setResultado(r)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="cat-pagina">
      <header className="pagina-cab">
        <div className="rise">
          <h1>Importar catálogo</h1>
          <p>Da de alta muchos productos de una vez con un archivo CSV. Sirve para montar el catálogo la primera vez o para cargar surtido nuevo sin capturar producto por producto.</p>
        </div>
        <div className="cat-acciones-cab rise" style={{ ['--i' as string]: 1 }}>
          <button type="button" className="btn btn--claro" onClick={() => navegar('/productos')}>
            Volver al catálogo
          </button>
        </div>
      </header>

      <ol className="cat-pasos rise" style={{ ['--i' as string]: 2 }}>
        <li>
          <span className="cat-pasos__num" aria-hidden="true">1</span>
          <strong>Descarga la plantilla</strong>
          <span>Trae los encabezados exactos y dos filas de ejemplo.</span>
        </li>
        <li>
          <span className="cat-pasos__num" aria-hidden="true">2</span>
          <strong>Llena una fila por producto</strong>
          <span>No cambies el nombre de las columnas y borra las filas de ejemplo antes de subir.</span>
        </li>
        <li>
          <span className="cat-pasos__num" aria-hidden="true">3</span>
          <strong>Sube el archivo</strong>
          <span>Te decimos cuántos entraron y, si alguno falla, en qué línea está el problema.</span>
        </li>
      </ol>

      <div className="card rise" style={{ ['--i' as string]: 3 }}>
        <div className="card__cab">
          <Icon name="etiqueta" size={18} />
          <h2>Qué va en cada columna</h2>
        </div>
        <div className="tabla-scroll">
          <table className="tabla cat-tabla-columnas">
            <thead>
              <tr>
                <th>Columna</th>
                <th>Qué es</th>
                <th>Ejemplo</th>
              </tr>
            </thead>
            <tbody>
              {COLUMNAS.map((c) => (
                <tr key={c.clave}>
                  <td>
                    <code>{c.clave}</code>
                  </td>
                  <td>{c.que}</td>
                  <td>
                    <code>{c.ejemplo}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card__cuerpo cat-importar-nota">
          <p>
            Todos los productos entran con 1 kg y 0.001 m³ de envío; ajústalo después al editarlos. Los que no tengan precio válido,
            categoría existente o cantidad mínima coherente se reportan por línea y el resto sí se importa.
          </p>
          <a className="btn btn--claro btn--mini" href={URL_PLANTILLA} download>
            <Icon name="descargar" size={15} /> Descargar plantilla
          </a>
        </div>
      </div>

      <div className="card rise" style={{ ['--i' as string]: 4 }}>
        <div className="card__cab">
          <Icon name="subir" size={18} />
          <h2>Subir el archivo</h2>
        </div>
        <div className="card__cuerpo cat-importar">
          <div className="cat-importar__archivo">
            <input
              ref={archivoRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                leerArchivo(e.target.files?.[0])
                e.target.value = ''
              }}
            />
            <button type="button" className="btn btn--claro btn--mini" onClick={() => archivoRef.current?.click()}>
              <Icon name="subir" size={15} /> Elegir archivo CSV
            </button>
            <span className="cat-importar__nombre">
              {nombreArchivo !== '' ? nombreArchivo : 'Ningún archivo elegido'}
            </span>
          </div>

          <label className="campo">
            <span>…o pega el contenido</span>
            <textarea
              className="cat-importar__texto"
              rows={9}
              spellCheck={false}
              placeholder={EJEMPLO}
              value={texto}
              onChange={(e) => {
                setTexto(e.target.value)
                setNombreArchivo('')
              }}
            />
          </label>

          <div className="cat-importar__acciones">
            <button type="button" className="btn" onClick={importar} disabled={enviando}>
              {enviando ? 'Importando…' : 'Importar productos'}
            </button>
            {texto.trim() !== '' && (
              <button
                type="button"
                className="btn btn--fantasma btn--mini"
                onClick={() => {
                  setTexto('')
                  setNombreArchivo('')
                  setResultado(null)
                }}
              >
                Limpiar
              </button>
            )}
          </div>

          {error && <div className="aviso aviso--error">{error}</div>}

          {resultado && (
            <div className="cat-importar__resultado">
              <div className={`aviso ${resultado.creados > 0 ? 'aviso--ok' : 'aviso--error'}`}>
                {resultado.creados > 0
                  ? `Se crearon ${resultado.creados} producto${resultado.creados === 1 ? '' : 's'} de ${resultado.total} línea${resultado.total === 1 ? '' : 's'}.`
                  : 'No se creó ningún producto.'}
              </div>

              {resultado.errores.length > 0 && (
                <>
                  <h3>Filas con problemas</h3>
                  <ul className="cat-importar__errores">
                    {resultado.errores.map((e) => (
                      <li key={e.linea}>
                        <strong>Línea {e.linea}:</strong> {e.motivo}
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <div className="cat-importar__acciones">
                <button type="button" className="btn btn--claro" onClick={() => navegar('/productos')}>
                  Ver catálogo
                </button>
                <button
                  type="button"
                  className="btn btn--fantasma btn--mini"
                  onClick={() => {
                    setResultado(null)
                    setTexto('')
                    setNombreArchivo('')
                  }}
                >
                  Importar otro archivo
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
