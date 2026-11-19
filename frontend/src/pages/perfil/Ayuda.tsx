import { useEffect, useState } from 'react'
import { apiPerfil } from '../../lib/api-perfil'
import type { Ayuda as DatosAyuda } from '../../lib/api-perfil'
import { useNavegar } from '../../store/session'
import { Skeleton } from '../../components/UI'
import Icon from '../../components/Icon'

export default function Ayuda() {
  const [datos, setDatos] = useState<DatosAyuda | null>(null)
  const [error, setError] = useState('')
  const navegar = useNavegar()

  useEffect(() => {
    apiPerfil.ayuda()
      .then(setDatos)
      .catch((e) => setError((e as Error).message))
  }, [])

  if (error) return <div className="aviso aviso--error" role="alert">{error}</div>
  if (!datos) return <div style={{ display: 'grid', gap: 12 }}><Skeleton h={80} /><Skeleton h={150} /><Skeleton h={280} /></div>

  return (
    <div className="perfil-form">
      <header className="pagina-cab">
        <div className="rise">
          <h1>Ayuda</h1>
          <p>{datos.soporte.horario}</p>
        </div>
        <button type="button" className="btn btn--claro rise" style={{ ['--i' as string]: 1 }} onClick={() => navegar('/perfil')}>
          <Icon name="flecha" size={15} /> Mi cuenta
        </button>
      </header>

      <section className="card rise" style={{ ['--i' as string]: 1 }}>
        <div className="card__cab"><h2 style={{ fontSize: 16 }}>Hablar con una persona</h2></div>
        <div className="card__cuerpo perfil-ayuda">
          <p style={{ margin: 0 }}>{datos.soporte.texto}</p>
          <button type="button" className="btn" onClick={() => navegar(datos.soporte.href)}>
            <Icon name="mensajes" size={16} /> Abrir el chat de soporte
          </button>
        </div>
      </section>

      <section className="card rise" style={{ ['--i' as string]: 2 }}>
        <div className="card__cab"><h2 style={{ fontSize: 16 }}>Problemas frecuentes</h2></div>
        <div className="perfil-faq">
          {datos.faqs.map((f) => (
            <details className="perfil-faq__item" key={f.pregunta}>
              <summary>{f.pregunta}</summary>
              <p>{f.respuesta}</p>
              {f.enlace && (
                <button type="button" className="perfil-enlace" onClick={() => navegar(f.enlace!.href)}>
                  {f.enlace.texto}
                </button>
              )}
            </details>
          ))}
        </div>
      </section>

      <section className="card rise" style={{ ['--i' as string]: 3 }}>
        <div className="card__cab"><h2 style={{ fontSize: 16 }}>Tu cuenta</h2></div>
        <div className="perfil-lista">
          <button type="button" className="perfil-fila" onClick={() => navegar('/kyc')}>
            <span><strong>Verificación de identidad</strong><small>Documentos y estado de la cuenta</small></span>
            <Icon name="flecha" size={16} />
          </button>
          <button type="button" className="perfil-fila" onClick={() => navegar('/perfil/seguridad')}>
            <span><strong>Seguridad</strong><small>Contraseña y baja de la cuenta</small></span>
            <Icon name="flecha" size={16} />
          </button>
        </div>
      </section>

      <section className="card rise" style={{ ['--i' as string]: 4 }}>
        <div className="card__cab"><h2 style={{ fontSize: 16 }}>Legal</h2></div>
        <div className="perfil-lista">
          {datos.legal.map((l) => (
            <div className="perfil-fila perfil-fila--estatica" key={l.href}>
              <span><strong>{l.texto}</strong><small>Disponible en el sitio principal de Ares</small></span>
              <span className="chip chip--neutro">{l.href}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
