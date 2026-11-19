import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useSesion } from '../store/session'
import { Skeleton } from '../components/UI'
import Icon from '../components/Icon'

type Datos = Awaited<ReturnType<typeof api.perfil>>

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export default function Perfil() {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState('')
  const { salir, rol } = useSesion()

  useEffect(() => { api.perfil().then(setDatos).catch((e) => setError((e as Error).message)) }, [])

  if (error) return <div className="aviso aviso--error">{error}</div>
  if (!datos) return <div style={{ display: 'grid', gap: 12 }}><Skeleton h={160} /><Skeleton h={120} /></div>

  const miembro = datos.miembro ? (() => {
    const [a, m] = datos.miembro.split('-').map(Number)
    return `${MESES[m - 1]} de ${a}`
  })() : '—'

  const iniciales = datos.usuario.nombre.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <header className="pagina-cab">
        <div className="rise"><h1>Mi perfil</h1><p>Tus datos y direcciones de entrega.</p></div>
        <button className="btn btn--claro rise" style={{ ['--i' as string]: 1 }} onClick={() => salir()}><Icon name="salir" size={16} /> Cerrar sesión</button>
      </header>

      <section className="card rise" style={{ ['--i' as string]: 1 }}>
        <div className="card__cuerpo" style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ width: 72, height: 72, borderRadius: 18, display: 'grid', placeItems: 'center', background: 'linear-gradient(145deg,#2f9e63,#14532d)', color: '#fff', fontSize: 24, fontWeight: 800 }}>
            {iniciales}
          </div>
          <div style={{ display: 'grid', gap: 4, flex: '1 1 220px', minWidth: 0 }}>
            <h2 style={{ fontSize: 20, overflowWrap: 'anywhere' }}>{datos.usuario.nombre}</h2>
            <span style={{ color: 'var(--muted)', fontSize: 13.5 }}>{datos.usuario.email}</span>
            <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
              <span className="chip chip--ok">{rol}</span>
              <span className="chip">Miembro desde {miembro}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="card rise" style={{ ['--i' as string]: 2 }}>
        <div className="card__cab"><h2>Direcciones de entrega</h2></div>
        <div className="card__cuerpo" style={{ display: 'grid', gap: 10 }}>
          {datos.direcciones.length === 0 ? (
            <p style={{ fontSize: 13.5, color: 'var(--muted)' }}>Aún no tienes direcciones guardadas.</p>
          ) : datos.direcciones.map((d) => (
            <div key={d.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 14px', border: '1px solid var(--line)', borderRadius: 12 }}>
              <span style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'var(--verde-suave)', color: 'var(--verde)' }}><Icon name="ubicacion" size={17} /></span>
              <div><strong style={{ fontSize: 13.5 }}>{d.calle}</strong><div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{d.colonia} · {d.ciudad}</div></div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
