import { useEffect, useState } from 'react'
import { apiComercio } from '../lib/api-comercio'
import type { Explorar, Metrica } from '../lib/api-comercio'
import { money } from '../lib/format'
import { useNavegar, useSesion } from '../store/session'
import Icon from '../components/Icon'
import { Skeleton } from '../components/UI'

/** Una cifra que espera acción (reclamos, KYC, aceptaciones) se pinta en rojo. */
function pendiente(m: Metrica) {
  const clave = m.etiqueta.toLowerCase()
  const espera = clave.startsWith('reclamos') || clave.startsWith('kyc') || clave.startsWith('por aceptar') || clave.startsWith('envíos sin')
  const cuantos = Number((m.valor.match(/\d+/g) ?? ['0']).join(''))
  return espera && cuantos > 0
}

export default function Inicio() {
  const [datos, setDatos] = useState<Explorar | null>(null)
  const [error, setError] = useState('')
  const navegar = useNavegar()
  const { carrito } = useSesion()

  useEffect(() => {
    apiComercio.explorar().then(setDatos).catch((e) => setError((e as Error).message))
  }, [])

  if (error) return <div className="aviso aviso--error">{error}</div>

  if (!datos) {
    return (
      <div style={{ display: 'grid', gap: 18 }}>
        <Skeleton h={34} w={320} />
        <div className="kpis">{[0, 1, 2].map((i) => <Skeleton key={i} h={84} />)}</div>
        <div className="card">
          <div className="card__cuerpo" style={{ display: 'grid', gap: 12 }}>
            <Skeleton h={56} /><Skeleton h={56} /><Skeleton h={56} />
          </div>
        </div>
      </div>
    )
  }

  const esComercio = datos.rol === 'comercio'
  const unidades = carrito?.grupos.reduce((s, g) => s + g.items.reduce((x, i) => x + i.cantidad, 0), 0) ?? 0

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <header className="pagina-cab">
        <div className="rise">
          <h1>Hola, {datos.nombre}</h1>
          <p>¿Con qué empezamos hoy? Esto es lo que tienes en marcha.</p>
        </div>
        <button className="btn rise" style={{ ['--i' as string]: 1 }} onClick={() => navegar('/buscar')}>
          <Icon name="buscar" size={17} /> Buscar productos
        </button>
      </header>

      {datos.metricas.length > 0 && (
        <section className="kpis rise" style={{ ['--i' as string]: 1 }} aria-label="Tus cifras de hoy">
          {datos.metricas.map((m) => (
            <a
              className={`kpi${pendiente(m) ? ' kpi--alerta' : ''}`}
              key={m.etiqueta}
              href={`/spa${m.href}`}
              onClick={(e) => { e.preventDefault(); navegar(m.href) }}
              title={m.nota ? `${m.etiqueta}: ${m.nota}` : m.etiqueta}
            >
              <span className="kpi__valor">{m.valor}</span>
              <span className="kpi__etiqueta">{m.etiqueta}</span>
              {m.nota && <span className="kpi__nota">{m.nota}</span>}
            </a>
          ))}
        </section>
      )}

      <div className={esComercio ? 'inicio-grid' : ''} style={esComercio ? undefined : { display: 'grid', gap: 18 }}>
        <section className="card rise" style={{ ['--i' as string]: 2 }}>
          <div className="card__cab">
            <h2>Tu día a día</h2>
            {esComercio && <span className="chip chip--neutro" style={{ marginLeft: 'auto' }}>{datos.accesos.length} accesos</span>}
          </div>
          <div className="card__cuerpo inicio-accesos">
            {datos.accesos.map((a, i) => (
              <a
                key={a.href + a.titulo}
                href={`/spa${a.href}`}
                onClick={(e) => { e.preventDefault(); navegar(a.href) }}
                className="acceso"
                style={{ ['--i' as string]: i }}
              >
                <span className="acceso__icono"><Icon name={a.icono} size={19} /></span>
                <span className="acceso__texto"><strong>{a.titulo}</strong><span>{a.texto}</span></span>
                {!!a.globos && a.globos > 0 && <span className="acceso__globo">{a.globos > 99 ? '99+' : a.globos}</span>}
                <Icon name="flecha" size={17} />
              </a>
            ))}
          </div>
        </section>

        {esComercio && (
          <aside className="card rise" style={{ ['--i' as string]: 3 }}>
            <div className="card__cab">
              <h2>Tu carrito</h2>
              {unidades > 0 && <span className="chip chip--ok" style={{ marginLeft: 'auto' }}>{unidades} u.</span>}
            </div>
            <div className="card__cuerpo" style={{ display: 'grid', gap: 10 }}>
              {unidades === 0 ? (
                <>
                  <p style={{ fontSize: 13.5, color: 'var(--muted)' }}>
                    Está vacío. Busca productos y arma tu pedido del día.
                  </p>
                  <button className="btn btn--claro" onClick={() => navegar('/buscar')}>
                    <Icon name="buscar" size={17} /> Buscar productos
                  </button>
                </>
              ) : (
                <>
                  <div className="inicio-carrito">
                    <span className="inicio-carrito__valor">{unidades}</span>
                    <span className="inicio-carrito__texto">
                      unidades en {carrito?.total_grupos ?? 0} proveedor{(carrito?.total_grupos ?? 0) === 1 ? '' : 'es'}
                    </span>
                  </div>
                  <dl className="cifras" style={{ margin: 0 }}>
                    <div><dt>Subtotal</dt><dd>{money(carrito?.subtotal ?? 0)}</dd></div>
                    <div><dt>IVA (16%)</dt><dd>{money(carrito?.iva ?? 0)}</dd></div>
                    <div className="cifras__total"><dt>Total</dt><dd>{money(carrito?.total ?? 0)}</dd></div>
                  </dl>
                  {!carrito?.puede_checkout && (carrito?.problemas.length ?? 0) > 0 && (
                    <p className="aviso aviso--alerta" style={{ fontSize: 12.5 }}>
                      {carrito?.problemas[0]}
                    </p>
                  )}
                  <button className="btn" onClick={() => navegar('/carrito')}>
                    <Icon name="carrito" size={17} /> Ver mi carrito
                  </button>
                </>
              )}
            </div>
          </aside>
        )}
      </div>

      {datos.atajos.length > 0 && (
        <section className="atajos rise" style={{ ['--i' as string]: 4} } aria-label="Más herramientas">
          <h2 className="atajos__titulo">Más herramientas</h2>
          <div className="atajos__fila">
            {datos.atajos.map((a) => (
              <a
                key={a.href}
                href={`/spa${a.href}`}
                onClick={(e) => { e.preventDefault(); navegar(a.href) }}
                className="atajo"
              >
                <span className="atajo__icono"><Icon name={a.icono} size={18} /></span>
                <span className="atajo__texto"><strong>{a.titulo}</strong><span>{a.texto}</span></span>
                {!!a.globos && a.globos > 0 && <span className="atajo__globo">{a.globos > 9 ? '9+' : a.globos}</span>}
                <Icon name="flecha" size={15} />
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
