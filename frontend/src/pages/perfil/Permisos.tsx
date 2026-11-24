import { useEffect, useState } from 'react'
import { apiPerfil } from '../../lib/api-perfil'
import type { Permisos as DatosPermisos } from '../../lib/api-perfil'
import { useNavegar } from '../../store/session'
import { Skeleton } from '../../components/UI'
import Icon from '../../components/Icon'

const CLAVE_ALMACEN = 'ares-permisos-dispositivo'

/** Estado guardado de los permisos (encendido por defecto). */
function leerPermisos(claves: string[]): Record<string, boolean> {
  let guardados: Record<string, boolean> = {}
  try {
    guardados = JSON.parse(localStorage.getItem(CLAVE_ALMACEN) ?? '{}') as Record<string, boolean>
  } catch {
    guardados = {}
  }
  const estados: Record<string, boolean> = {}
  for (const c of claves) estados[c] = guardados[c] !== false
  return estados
}

export default function Permisos() {
  const [datos, setDatos] = useState<DatosPermisos | null>(null)
  const [error, setError] = useState('')
  const [estados, setEstados] = useState<Record<string, boolean>>({})
  const navegar = useNavegar()

  useEffect(() => {
    apiPerfil.permisos()
      .then((d) => {
        setDatos(d)
        setEstados(leerPermisos(d.dispositivo.map((x) => x.clave)))
        document.documentElement.dataset.tema = d.tema
      })
      .catch((e) => setError((e as Error).message))
  }, [])

  const alternar = (clave: string, valor: boolean) => {
    setEstados((e) => {
      const siguiente = { ...e, [clave]: valor }
      try {
        localStorage.setItem(CLAVE_ALMACEN, JSON.stringify(siguiente))
      } catch {
        /* sin almacenamiento local la preferencia vive solo en la sesión */
      }
      return siguiente
    })
  }

  if (error) return <div className="aviso aviso--error" role="alert">{error}</div>
  if (!datos) return <div style={{ display: 'grid', gap: 12 }}><Skeleton h={220} /></div>

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
        <div className="card__cab"><h2 style={{ fontSize: 16 }}>Permisos del dispositivo</h2></div>
        <div className="card__cuerpo perfil-opciones">
          <p className="perfil-pista" style={{ margin: 0 }}>
            Ares te los pide al navegador solo cuando de verdad los necesita; apágalo aquí y el navegador
            dejará de ofrecerlo en esta app.
          </p>
          {datos.dispositivo.map((d) => (
            <div className="perfil-opcion" key={d.clave}>
              <div className="perfil-opcion__texto">
                <strong>{d.titulo}</strong>
                <small>{d.texto}</small>
              </div>
              <label className="perfil-interruptor">
                <input
                  type="checkbox"
                  checked={estados[d.clave] !== false}
                  onChange={(e) => alternar(d.clave, e.target.checked)}
                  aria-label={d.titulo}
                />
                <span className="perfil-interruptor__pista" aria-hidden="true" />
              </label>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
