import { useEffect, useState } from 'react'
import { apiPerfil } from '../../lib/api-perfil'
import type { Permisos as DatosPermisos } from '../../lib/api-perfil'
import { useNavegar } from '../../store/session'
import { Skeleton } from '../../components/UI'
import Icon from '../../components/Icon'

const VERIFICACION: Record<string, { texto: string; tono: string }> = {
  aprobado: { texto: 'Verificado', tono: 'ok' },
  en_revision: { texto: 'En revisión', tono: 'alerta' },
  rechazado: { texto: 'Rechazado', tono: 'malo' },
  sin_verificar: { texto: 'Sin verificar', tono: 'neutro' },
}

export default function Permisos() {
  const [datos, setDatos] = useState<DatosPermisos | null>(null)
  const [error, setError] = useState('')
  const navegar = useNavegar()

  useEffect(() => {
    apiPerfil.permisos()
      .then(setDatos)
      .catch((e) => setError((e as Error).message))
  }, [])

  if (error) return <div className="aviso aviso--error" role="alert">{error}</div>
  if (!datos) return <div style={{ display: 'grid', gap: 12 }}><Skeleton h={80} /><Skeleton h={220} /><Skeleton h={180} /></div>

  return (
    <div className="perfil-form">
      <header className="pagina-cab">
        <div className="rise">
          <h1>Permisos</h1>
          <p>Qué puede hacer tu cuenta y qué te pedirá el navegador.</p>
        </div>
        <button type="button" className="btn btn--claro rise" style={{ ['--i' as string]: 1 }} onClick={() => navegar('/perfil/ajustes')}>
          <Icon name="flecha" size={15} /> Ajustes
        </button>
      </header>

      <section className="card rise" style={{ ['--i' as string]: 1 }}>
        <div className="card__cab"><h2 style={{ fontSize: 16 }}>Tu cuenta</h2></div>
        <div className="card__cuerpo perfil-permisos">
          {datos.roles.map((r) => {
            const v = VERIFICACION[r.verificacion] ?? VERIFICACION.sin_verificar
            return (
              <article className="perfil-permiso" key={r.nombre}>
                <header className="perfil-permiso__cab">
                  <div>
                    <strong>{r.etiqueta}</strong>
                    <small className="perfil-pista">Rol «{r.nombre}»</small>
                  </div>
                  <span className={`chip chip--${v.tono}`}>{v.texto}</span>
                </header>

                <ul className="perfil-permiso__lista">
                  {r.permite.map((p) => (
                    <li key={p}><Icon name="ok" size={14} /> {p}</li>
                  ))}
                </ul>

                {r.kyc.length > 0 && (
                  <p className="perfil-pista">
                    Documentos de verificación: {r.kyc.join(', ')}.{' '}
                    <button type="button" className="perfil-enlace" onClick={() => navegar('/kyc')}>Revisar</button>
                  </p>
                )}
              </article>
            )
          })}
        </div>
      </section>

      <section className="card rise" style={{ ['--i' as string]: 2 }}>
        <div className="card__cab"><h2 style={{ fontSize: 16 }}>Permisos del dispositivo</h2></div>
        <div className="card__cuerpo perfil-opciones">
          <p className="perfil-pista" style={{ margin: 0 }}>
            Ares te los pide al navegador solo cuando de verdad los necesita; puedes revocarlos en cualquier
            momento desde la configuración del navegador y te los volverá a pedir la próxima vez.
          </p>
          {datos.dispositivo.map((d) => (
            <div className="perfil-opcion" key={d.clave}>
              <div className="perfil-opcion__texto">
                <strong>{d.titulo}</strong>
                <small>{d.texto}</small>
              </div>
              <span className="chip chip--neutro">Se pide al usarse</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
