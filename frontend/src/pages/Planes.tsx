import { useEffect, useState } from 'react'
import { apiExtras } from '../lib/api-comercio'
import type { Plan, Suscripcion as Suscrip } from '../lib/api-comercio'
import { money } from '../lib/format'
import { useSesion } from '../store/session'
import Icon from '../components/Icon'
import { Skeleton } from '../components/UI'

const FUNCIONES: Record<string, { texto: string; icono: string }[]> = {
  max_productos: [{ texto: 'Productos ilimitados', icono: 'productos' }],
  destacado: [{ texto: 'Tus fichas destacadas en la búsqueda', icono: 'estrella' }],
  analiticas: [{ texto: 'Analíticas avanzadas de ventas', icono: 'grafica' }],
  banner: [{ texto: 'Banner promocional en el explore', icono: 'etiqueta' }],
}

export default function Planes() {
  const { aviso } = useSesion()
  const [planes, setPlanes] = useState<Plan[] | null>(null)
  const [suscripcion, setSuscripcion] = useState<Suscrip>(null)
  const [guardando, setGuardando] = useState('')

  useEffect(() => {
    apiExtras.planes()
      .then((r) => { setPlanes(r.planes); setSuscripcion(r.suscripcion) })
      .catch((e: Error) => aviso(e.message))
  }, [aviso])

  const suscribir = async (clave: string) => {
    setGuardando(clave)
    try {
      const r = await apiExtras.suscribir(clave)
      const detalle = await apiExtras.planes()
      setSuscripcion(detalle.suscripcion)
      aviso(r.mensaje)
    } catch (e) {
      aviso((e as Error).message)
    } finally {
      setGuardando('')
    }
  }

  if (!planes) {
    return (
      <div style={{ display: 'grid', gap: 14 }}>
        <Skeleton h={34} w={280} />
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))' }}>
          <Skeleton h={320} /><Skeleton h={320} />
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <header className="pagina-cab">
        <div className="rise">
          <h1>Planes</h1>
          <p>Todo lo esencial es gratuito. Premium desbloquea las herramientas que hacen crecer tu venta.</p>
        </div>
        {suscripcion && (
          <span className="chip chip--ok">
            Plan {suscripcion.nombre}{suscripcion.hasta ? ` hasta ${suscripcion.hasta}` : ''}
          </span>
        )}
      </header>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', alignItems: 'start' }}>
        {planes.map((p, i) => {
          const activo = suscripcion?.plan === p.clave
          const funciones = Object.entries(p.flags)
            .flatMap(([clave, valor]) => {
              if (!valor || valor === 0) return []
              return FUNCIONES[clave] ?? [{ texto: clave, icono: 'ok' }]
            })

          return (
            <section key={p.clave} className={`card rise${activo ? '' : ' card--plana'}`} style={{ ['--i' as string]: i + 1, borderColor: activo ? 'var(--verde-2)' : undefined, borderWidth: activo ? 2 : undefined }}>
              <div className="card__cab">
                <h2>{p.nombre}</h2>
                {p.clave === 'premium' && <span className="chip chip--alerta" style={{ marginLeft: 'auto' }}>Recomendado</span>}
                {activo && <span className="chip chip--ok" style={{ marginLeft: 'auto' }}>Tu plan</span>}
              </div>
              <div className="card__cuerpo" style={{ display: 'grid', gap: 14 }}>
                <div>
                  <span style={{ fontSize: 30, fontWeight: 750, letterSpacing: '-.03em' }}>
                    {p.precio_mensual > 0 ? `$${p.precio_mensual.toFixed(0)}` : 'Gratis'}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--muted)', marginLeft: 6 }}>
                    {p.precio_mensual > 0 ? 'MXN / mes' : 'para siempre'}
                  </span>
                </div>
                <p style={{ fontSize: 13.5, color: 'var(--muted)', minHeight: 40 }}>{p.descripcion}</p>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
                  {funciones.map((f) => (
                    <li key={f.texto} style={{ display: 'flex', gap: 9, alignItems: 'center', fontSize: 13.5 }}>
                      <span className="acceso__icono" style={{ width: 28, height: 28, borderRadius: 8 }}>
                        <Icon name={f.icono} size={14} />
                      </span>
                      {f.texto}
                    </li>
                  ))}
                </ul>
                {p.clave !== 'gratis' && (
                  <button
                    className="btn btn--bloque"
                    disabled={activo || guardando !== ''}
                    onClick={() => void suscribir(p.clave)}
                  >
                    {activo ? 'Plan activo' : guardando === p.clave ? 'Activando…' : `Activar por ${money(p.precio_mensual)}/mes`}
                  </button>
                )}
                {p.clave === 'gratis' && (
                  <button className="btn btn--bloque btn--claro" disabled={!!suscripcion}>
                    {suscripcion ? 'No aplicable' : 'Tu plan actual'}
                  </button>
                )}
              </div>
            </section>
          )
        })}
      </div>

      <p className="apunte" style={{ maxWidth: 60 }}>
        El cobro es simulado con la pasarela de pruebas de la plataforma. Al conectar una pasarela real
        (SPEI o tarjeta) se sustituye la confirmación del pago sin cambiar el resto del flujo.
      </p>
    </div>
  )
}
