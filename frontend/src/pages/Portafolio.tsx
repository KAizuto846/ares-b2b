import { useCallback, useEffect, useState } from 'react'
import { apiComercio } from '../lib/api-comercio'
import type { Favorito, Sugerencia } from '../lib/api-comercio'
import { money } from '../lib/format'
import { useNavegar, useSesion } from '../store/session'
import Icon from '../components/Icon'
import { Skeleton, Vacio } from '../components/UI'

export default function Portafolio() {
  const [favoritos, setFavoritos] = useState<Favorito[] | null>(null)
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([])
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState('')
  const navegar = useNavegar()
  const { agregar, aviso } = useSesion()

  const recargar = useCallback(async () => {
    try {
      const r = await apiComercio.portafolio()
      setFavoritos(r.favoritos)
      setSugerencias(r.sugerencias)
      setError('')
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => { void recargar() }, [recargar])

  const pedir = async (f: Favorito, boton: HTMLElement | null) => {
    setOcupado(f.uuid)
    try {
      await agregar(f.uuid, f.cantidad_minima, boton)
      await recargar()
    } finally {
      setOcupado('')
    }
  }

  const quitar = async (f: Favorito) => {
    setOcupado(f.uuid)
    try {
      const r = await apiComercio.quitar(f.uuid)
      aviso(r.mensaje)
      await recargar()
    } catch (e) {
      aviso((e as Error).message)
    } finally {
      setOcupado('')
    }
  }

  if (error) return <div className="aviso aviso--error">{error}</div>

  if (!favoritos) {
    return (
      <div style={{ display: 'grid', gap: 14 }}>
        <Skeleton h={32} w={240} />
        <div className="portafolio-grid">{[0, 1, 2].map((i) => <Skeleton key={i} h={210} />)}</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <header className="pagina-cab">
        <div className="rise">
          <h1>Portafolio</h1>
          <p>Los productos que guardaste, con su mayorista, precio y existencias.</p>
        </div>
        <button className="btn rise" style={{ ['--i' as string]: 1 }} onClick={() => navegar('/buscar')}>
          <Icon name="buscar" size={17} /> Buscar productos
        </button>
      </header>

      {favoritos.length === 0 ? (
        <div className="card rise">
          <Vacio
            titulo="Todavía no has guardado productos"
            texto="Cuando encuentres algo que te sirva, guárdalo y aparecerá aquí para volver a pedirlo en un clic."
            accion={<button className="btn" onClick={() => navegar('/buscar')}><Icon name="buscar" size={17} /> Ir al catálogo</button>}
          />
        </div>
      ) : (
        <section className="portafolio-grid rise" style={{ ['--i' as string]: 1 }} aria-label="Productos guardados">
          {favoritos.map((f) => (
            <article className={`portafolio${f.disponible ? '' : ' portafolio--agotado'}`} key={f.uuid}>
              <span className="portafolio__estrella" title="Está en tu portafolio">
                <Icon name="estrella" size={15} />
              </span>

              <h3 className="portafolio__nombre">{f.nombre}</h3>
              <p className="portafolio__mayorista">
                {f.mayorista}
                {f.categoria ? <span> · {f.categoria}</span> : null}
              </p>

              <dl className="portafolio__datos">
                <div><dt>Precio</dt><dd className="num">{money(f.precio_base)}</dd></div>
                <div><dt>Unidades</dt><dd className="num">{f.disponible ? f.stock_disponible : '—'}</dd></div>
              </dl>

              <p className="portafolio__unidad">{f.unidad_venta} de {f.contenido}</p>

              {f.disponible ? (
                <button
                  className="btn portafolio__pedir"
                  disabled={ocupado === f.uuid}
                  onClick={(e) => pedir(f, e.currentTarget)}
                >
                  <Icon name="carrito" size={17} />
                  {ocupado === f.uuid ? 'Agregando…' : 'Volver a pedir'}
                </button>
              ) : (
                <span className="portafolio__agotado">Agotado por ahora</span>
              )}

              <button
                type="button"
                className="portafolio__quitar"
                disabled={ocupado === f.uuid}
                onClick={() => quitar(f)}
              >
                Quitar del portafolio
              </button>
            </article>
          ))}
        </section>
      )}

      {sugerencias.length > 0 && (
        <section className="card rise" style={{ ['--i' as string]: 2 }}>
          <div className="card__cab">
            <h2>Es momento de reabastecer</h2>
            <span className="chip chip--alerta" style={{ marginLeft: 'auto' }}>{sugerencias.length}</span>
          </div>
          <div className="card__cuerpo">
            <ul className="sugerencias">
              {sugerencias.map((s) => (
                <li key={s.producto}>
                  <span>{s.producto}</span>
                  <small>hace {s.dias} días de tu última compra</small>
                </li>
              ))}
            </ul>
            <button className="btn btn--claro" style={{ marginTop: 12 }} onClick={() => navegar('/buscar')}>
              Buscar en el catálogo
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
