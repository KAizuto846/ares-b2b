import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import Icon from '../components/Icon'
import { apiAuth } from '../lib/api-auth'
import type { DocumentoClave, DocumentoLegal } from '../lib/api-auth'

type Props = {
  /** Si no llega, se decide por la ruta: /terminos o /privacidad. */
  documento?: DocumentoClave
}

const slug = (texto: string) =>
  texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/**
 * Términos y condiciones / aviso de privacidad en una sola columna, con índice.
 * El texto vive en el backend (GET /legales/terminos | /legales/privacidad) para
 * que la SPA y el panel PHP digan exactamente lo mismo.
 */
export default function Legales({ documento }: Props) {
  const { pathname } = useLocation()
  const clave: DocumentoClave = documento ?? (pathname.includes('privacidad') ? 'privacidad' : 'terminos')

  const [texto, setTexto] = useState<DocumentoLegal | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let vivo = true
    setTexto(null)
    setError('')
    apiAuth.legales(clave)
      .then((d) => { if (vivo) setTexto(d) })
      .catch((err: Error) => { if (vivo) setError(err.message) })
    return () => { vivo = false }
  }, [clave])

  return (
    <div className="legal-pantalla">
      <div className="legal-pantalla__barra">
        <Link className="legal-pantalla__marca" to="/login">
          <span className="marca__logo" style={{ width: 34, height: 34, fontSize: 15 }}>A</span>
          <span>Ares</span>
        </Link>
        <nav className="legal-pantalla__nav" aria-label="Documentos legales">
          <Link className={clave === 'terminos' ? 'legal-tab legal-tab--activo' : 'legal-tab'} to="/terminos">
            Términos
          </Link>
          <Link className={clave === 'privacidad' ? 'legal-tab legal-tab--activo' : 'legal-tab'} to="/privacidad">
            Privacidad
          </Link>
          <Link className="legal-tab" to="/login">Entrar</Link>
        </nav>
      </div>

      <main className="legal">
        {error && (
          <div className="aviso aviso--error" role="alert">
            <span>{error}</span>
          </div>
        )}

        {!texto && !error && (
          <div className="card">
            <div className="card__cuerpo">
              <div className="skel" style={{ height: 26, width: '55%', marginBottom: 14 }} />
              <div className="skel" style={{ height: 120 }} />
            </div>
          </div>
        )}

        {texto && (
          <article className="legal__doc">
            <header className="legal__cab">
              <h1>{texto.titulo}</h1>
              <p className="legal__fecha">{texto.actualizado}</p>
              {texto.intro && <p className="legal__intro">{texto.intro}</p>}
            </header>

            {texto.bloques.length > 1 && (
              <nav className="legal__indice" aria-label="Índice del documento">
                <p className="legal__indice-titulo">
                  <Icon name="etiqueta" size={15} /> En este documento
                </p>
                <ol>
                  {texto.bloques.map((b) => (
                    <li key={b.titulo}>
                      <a href={`#${slug(b.titulo)}`}>{b.titulo}</a>
                    </li>
                  ))}
                </ol>
              </nav>
            )}

            <div className="legal__cuerpo">
              {texto.bloques.map((b) => (
                <section key={b.titulo} id={slug(b.titulo)} className="legal__bloque">
                  <h2>{b.titulo}</h2>
                  {b.parrafos.map((p) => (
                    <p key={p.slice(0, 40)}>{p}</p>
                  ))}
                  {b.lista && b.lista.length > 0 && (
                    <ul>
                      {b.lista.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  )}
                </section>
              ))}
            </div>

            <footer className="legal__pie">
              <p>
                ¿Dudas sobre este documento? Escríbenos a <a href="mailto:soporte@did2.mx">soporte@did2.mx</a>.
              </p>
              <div className="legal__acciones">
                <Link className="btn btn--claro" to="/login">Volver a entrar</Link>
                <Link className="btn" to="/registro">Crear cuenta</Link>
              </div>
            </footer>
          </article>
        )}
      </main>
    </div>
  )
}
