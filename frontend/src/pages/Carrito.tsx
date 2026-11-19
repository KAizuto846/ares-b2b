import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { apiComercio } from '../lib/api-comercio'
import type { PaginaCarrito } from '../lib/api-comercio'
import { money } from '../lib/format'
import { useNavegar, useSesion } from '../store/session'
import Icon from '../components/Icon'
import { Skeleton, Vacio } from '../components/UI'

/** Diálogo de confirmación propio (nunca `confirm()` del navegador). */
function Confirmacion({ abierto, titulo, onCerrar, children, acciones }: {
  abierto: boolean
  titulo: string
  onCerrar: () => void
  children: ReactNode
  acciones: ReactNode
}) {
  useEffect(() => {
    if (!abierto) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [abierto, onCerrar])

  if (!abierto) return null

  return (
    <div className="dialogo" onClick={onCerrar} role="presentation">
      <div
        className="dialogo__caja"
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="dialogo__cab">
          <h2>{titulo}</h2>
          <button className="icono-btn" onClick={onCerrar} aria-label="Cerrar">
            <Icon name="cerrar" size={17} />
          </button>
        </header>
        <div className="dialogo__cuerpo">{children}</div>
        <footer className="dialogo__acciones">{acciones}</footer>
      </div>
    </div>
  )
}

export default function Carrito() {
  const [pagina, setPagina] = useState<PaginaCarrito | null>(null)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [preguntarVaciar, setPreguntarVaciar] = useState(false)
  const navegar = useNavegar()
  const { cambiar, quitarItem, vaciar } = useSesion()

  const recargar = useCallback(async () => {
    try {
      setPagina(await apiComercio.carritoPagina())
      setError('')
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => { void recargar() }, [recargar])

  const paso = async (uuid: string, cantidad: number, nombre: string) => {
    if (ocupado) return
    setOcupado(true)
    try {
      if (cantidad < 1 || nombre === '') {
        await quitarItem(uuid, nombre)
      } else {
        await cambiar(uuid, cantidad, nombre)
      }
      await recargar()
    } finally {
      setOcupado(false)
    }
  }

  const vaciarTodo = async () => {
    setPreguntarVaciar(false)
    setOcupado(true)
    try {
      await vaciar()
      await recargar()
    } finally {
      setOcupado(false)
    }
  }

  if (error && !pagina) return <div className="aviso aviso--error">{error}</div>

  if (!pagina) {
    return (
      <div style={{ display: 'grid', gap: 14 }}>
        <Skeleton h={32} w={220} />
        <Skeleton h={200} />
        <Skeleton h={120} />
      </div>
    )
  }

  const listos = pagina.listos
  const totalGrupos = pagina.total_grupos
  const parcial = listos > 0 && listos < totalGrupos
  const cobraTodo = listos === 0 || listos === totalGrupos
  const subtotal = cobraTodo ? pagina.subtotal : pagina.subtotal_listo
  const iva = cobraTodo ? pagina.iva : pagina.iva_listo
  const total = cobraTodo ? pagina.total : pagina.total_listo
  const vacio = pagina.items === 0

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <header className="pagina-cab">
        <div className="rise">
          <h1>Mi carrito</h1>
          <p>
            {vacio
              ? 'Todavía no tienes productos. Lo que agregues se agrupa por proveedor.'
              : `${pagina.unidades} unidad${pagina.unidades === 1 ? '' : 'es'} en ${totalGrupos} proveedor${totalGrupos === 1 ? '' : 'es'}.`}
          </p>
        </div>
        {!vacio && (
          <div className="carrito-acciones rise" style={{ ['--i' as string]: 1 }}>
            <button className="btn btn--claro" onClick={() => navegar('/buscar')}>
              <Icon name="buscar" size={17} /> Seguir comprando
            </button>
            <button className="btn btn--fantasma carrito-acciones__peligro" onClick={() => setPreguntarVaciar(true)} disabled={ocupado}>
              <Icon name="basura" size={17} /> Vaciar
            </button>
          </div>
        )}
      </header>

      {error && <div className="aviso aviso--error">{error}</div>}

      {pagina.problemas.length > 0 && (
        <div className="aviso aviso--alerta">
          <strong>Revisa esto antes de continuar:</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {pagina.problemas.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </div>
      )}

      {vacio ? (
        <div className="card rise">
          <Vacio
            titulo="Tu carrito está vacío"
            texto="Busca productos por proveedor y agrégalos: aquí verás cantidades, mínimos y totales."
            accion={<button className="btn" onClick={() => navegar('/buscar')}><Icon name="buscar" size={17} /> Buscar productos</button>}
          />
        </div>
      ) : (
        <div className="carrito-grid">
          <div style={{ display: 'grid', gap: 14 }}>
            {pagina.grupos.map((g, gi) => {
              const pct = g.monto_minimo > 0 ? Math.min(100, Math.max(0, (g.subtotal / g.monto_minimo) * 100)) : 100

              return (
                <section className="grupo rise" key={g.mayorista_uuid || g.mayorista} style={{ ['--i' as string]: gi }}>
                  <header className="grupo__cab">
                    <span className="grupo__nom">{g.mayorista}</span>
                    {g.listo
                      ? <span className="chip chip--ok">Listo</span>
                      : g.bloqueado
                        ? <span className="chip chip--malo">Revisar</span>
                        : <span className="chip chip--alerta">Falta mínimo</span>}
                    <span className="grupo__total">{money(g.total)}</span>
                  </header>

                  <div className="grupo__prog" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={`Avance al mínimo de ${g.mayorista}`}>
                    <i style={{ width: pct < 2 ? 0 : `${pct}%` }} />
                  </div>

                  <p className="grupo__estado">
                    {g.cumple_minimo
                      ? <>Mínimo cumplido · pedido mínimo {money(g.monto_minimo)}</>
                      : <>Faltan {money(g.faltante)} para el mínimo de {money(g.monto_minimo)}</>}
                  </p>

                  <a
                    className="grupo__mas"
                    href={`/spa/buscar?mayorista=${g.mayorista_uuid}`}
                    onClick={(e) => { e.preventDefault(); navegar(`/buscar?mayorista=${g.mayorista_uuid}`) }}
                  >
                    + Agregar más de este proveedor
                  </a>

                  <ul className="clista">
                    {g.items.map((i) => (
                      <li className={`clinea${i.agotado || i.inactivo ? ' clinea--alerta' : ''}`} key={i.producto_uuid}>
                        <div className="clinea__info">
                          <span className="clinea__nom">
                            {i.nombre}
                            {(i.agotado || i.inactivo) && <span className="clinea__aviso">{i.inactivo ? 'no disponible' : 'agotado'}</span>}
                          </span>
                          <span className="clinea__sub">
                            {i.unidad_venta} de {i.contenido}
                            {i.escala_aplicada ? ` · ${i.escala_aplicada}` : ''}
                          </span>
                        </div>

                        <span className="clinea__unit num">
                          {money(i.precio_unitario)}
                          <small>c/u</small>
                        </span>

                        <div className="stepper" role="group" aria-label={`Cantidad de ${i.nombre}`}>
                          <button
                            type="button"
                            disabled={ocupado}
                            aria-label={i.cantidad === 1 ? `Quitar ${i.nombre}` : `Disminuir ${i.nombre}`}
                            onClick={() => paso(i.producto_uuid, i.cantidad - 1, i.cantidad === 1 ? i.nombre : i.nombre)}
                          >
                            <Icon name={i.cantidad === 1 ? 'basura' : 'menos'} size={15} stroke={2} />
                          </button>
                          <span className="stepper__valor">{i.cantidad}</span>
                          <button
                            type="button"
                            disabled={ocupado || i.cantidad >= i.stock_disponible}
                            aria-label={`Aumentar ${i.nombre}`}
                            onClick={() => paso(i.producto_uuid, i.cantidad + 1, i.nombre)}
                          >
                            <Icon name="mas" size={15} stroke={2} />
                          </button>
                        </div>

                        <span className="clinea__total num">{money(i.total)}</span>

                        <button
                          type="button"
                          className="clinea__quitar"
                          disabled={ocupado}
                          onClick={() => paso(i.producto_uuid, 0, i.nombre)}
                        >
                          Quitar
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })}
          </div>

          <aside className="card carrito-pie rise" style={{ ['--i' as string]: 2 }}>
            <div className="card__cab"><h2>Resumen</h2></div>
            <div className="card__cuerpo" style={{ display: 'grid', gap: 12 }}>
              <dl className="cifras" style={{ margin: 0 }}>
                <div><dt>{parcial ? 'Subtotal a pagar' : 'Subtotal'}</dt><dd>{money(subtotal)}</dd></div>
                <div><dt>IVA (16%)</dt><dd>{money(iva)}</dd></div>
                <div><dt>Cargos de la app</dt><dd>—</dd></div>
                <div className="cifras__total"><dt>Total a pagar</dt><dd>{money(total)}</dd></div>
              </dl>

              {parcial && (
                <p className="aviso aviso--info" style={{ fontSize: 12.5 }}>
                  Solo se cobrarán los {listos} proveedores que alcanzan su mínimo; el resto sigue en el carrito.
                </p>
              )}

              {pagina.puede_checkout ? (
                <button className="btn btn--bloque" onClick={() => navegar('/checkout')}>
                  {parcial ? `Continuar con ${listos} proveedor${listos === 1 ? '' : 'es'}` : 'Continuar al pago'}
                  <Icon name="flecha" size={17} />
                </button>
              ) : (
                <>
                  <button className="btn btn--bloque" disabled>Continuar al pago</button>
                  <p style={{ fontSize: 12.5, color: 'var(--muted)', textAlign: 'center' }}>
                    Completa el mínimo de cada proveedor para continuar.
                  </p>
                </>
              )}

              <p style={{ fontSize: 12, color: 'var(--faint)', textAlign: 'center' }}>
                Los precios y el stock se recalculan al abrir el carrito.
              </p>
            </div>
          </aside>
        </div>
      )}

      <Confirmacion
        abierto={preguntarVaciar}
        titulo="¿Vaciar el carrito?"
        onCerrar={() => setPreguntarVaciar(false)}
        acciones={
          <>
            <button className="btn btn--claro" onClick={() => setPreguntarVaciar(false)}>Cancelar</button>
            <button className="btn btn--peligro" onClick={vaciarTodo}>Sí, vaciar</button>
          </>
        }
      >
        <p style={{ color: 'var(--muted)', fontSize: 13.5 }}>
          Se quitarán los {pagina.items} producto{pagina.items === 1 ? '' : 's'} del carrito. Esta acción no se puede deshacer.
        </p>
      </Confirmacion>
    </div>
  )
}
