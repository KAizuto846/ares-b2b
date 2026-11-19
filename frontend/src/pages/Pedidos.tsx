import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { apiPedidos } from '../lib/api-pedidos'
import type { Pedido } from '../lib/api'
import { estado, fecha, money, relativo } from '../lib/format'
import { Skeleton, Vacio } from '../components/UI'
import { useNavegar, useSesion } from '../store/session'
import Icon from '../components/Icon'

/** Orden de los filtros: primero lo que pide atención. */
const ORDEN_ESTADOS = [
  'pendiente_pago', 'pendiente_aceptacion', 'aceptado', 'preparando', 'listo_para_recoger',
  'buscando_repartidor', 'repartidor_asignado', 'en_recoleccion', 'en_camino', 'en_puerta',
  'entregado', 'completado', 'recibido', 'en_disputa', 'cancelado', 'rechazado', 'expirado',
]

/** El API devuelve decimales de MySQL como texto: se normalizan antes de pintar. */
const num = (v: number | string) => (typeof v === 'number' ? v : Number(v) || 0)

/** Sólo se puede cobrar mientras el pedido no salga a preparación. */
const puedePagar = (estadoPedido: string) => estadoPedido === 'borrador' || estadoPedido === 'pendiente_pago'

export default function Pedidos() {
  const [pedidos, setPedidos] = useState<Pedido[] | null>(null)
  const [error, setError] = useState('')
  const [filtro, setFiltro] = useState('')
  const { rol, aviso } = useSesion()
  const navegar = useNavegar()
  const [cobrando, setCobrando] = useState('')

  const pagarPedido = async (uuid: string) => {
    setCobrando(uuid)
    try {
      const r = await apiPedidos.pagar(uuid)
      navegar(r.url)
    } catch (e) {
      aviso((e as Error).message)
    } finally {
      setCobrando('')
    }
  }

  useEffect(() => {
    api.pedidos()
      .then((r) => setPedidos(r.pedidos))
      .catch((e) => { setError((e as Error).message); setPedidos([]) })
  }, [])

  const esRepartidor = rol === 'repartidor'
  const esMayorista = rol === 'mayorista'
  const esAdmin = !!rol && rol.startsWith('admin')

  const conteos = useMemo(() => {
    const mapa: Record<string, number> = {}
    for (const p of pedidos ?? []) mapa[p.estado] = (mapa[p.estado] ?? 0) + 1
    return mapa
  }, [pedidos])

  const visibles = useMemo(
    () => (filtro === '' ? pedidos ?? [] : (pedidos ?? []).filter((p) => p.estado === filtro)),
    [pedidos, filtro],
  )

  const titulo = esRepartidor ? 'Reparto' : esMayorista ? 'Pedidos recibidos' : esAdmin ? 'Todos los pedidos' : 'Mis pedidos'
  const subtitulo = esRepartidor
    ? 'Tus viajes, ofertas y PIN se manejan en el panel de reparto.'
    : esMayorista
      ? 'Acepta, prepara y despacha lo que te acaban de pedir.'
      : esAdmin
        ? 'Todos los pedidos de la plataforma, con su estado y total.'
        : 'Todo lo que has comprado y en qué va.'

  if (esRepartidor) {
    return (
      <div style={{ display: 'grid', gap: 18 }}>
        <header className="pagina-cab"><div className="rise"><h1>{titulo}</h1><p>{subtitulo}</p></div></header>
        <div className="card"><Vacio
          titulo="Tu jornada está en el panel de reparto"
          texto="Ahí ves la disponibilidad, las ofertas con tarifa y el viaje con su PIN."
          accion={<button className="btn" onClick={() => navegar('/repartidor')}>Abrir mi ruta</button>}
        /></div>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <header className="pagina-cab">
        <div className="rise"><h1>{titulo}</h1><p>{subtitulo}</p></div>
        {pedidos && pedidos.length > 0 && (
          <span className="chip chip--neutro">{pedidos.length} {pedidos.length === 1 ? 'pedido' : 'pedidos'}</span>
        )}
      </header>

      {error && <div className="aviso aviso--error">{error}</div>}

      {!pedidos ? (
        <div className="card"><div className="card__cuerpo" style={{ display: 'grid', gap: 10 }}>
          <Skeleton h={22} w="60%" /><Skeleton h={40} /><Skeleton h={40} /><Skeleton h={40} />
        </div></div>
      ) : pedidos.length === 0 ? (
        <div className="card"><Vacio
          titulo={esMayorista ? 'Todavía no te han pedido nada' : 'Todavía no hay pedidos'}
          texto={esMayorista ? 'Cuando un comercio compre, el pedido aparecerá aquí para que lo aceptes.' : 'Cuando confirmes tu primer carrito aparecerá aquí.'}
          accion={esMayorista ? undefined : <button className="btn" onClick={() => navegar('/buscar')}>Buscar productos</button>}
        /></div>
      ) : (
        <>
          <div className="filtro-estados rise" style={{ ['--i' as string]: 1 }}>
            <button
              type="button"
              className={`filtro-estado${filtro === '' ? ' activo' : ''}`}
              onClick={() => setFiltro('')}
            >
              Todos <strong>{pedidos.length}</strong>
            </button>
            {ORDEN_ESTADOS.filter((k) => (conteos[k] ?? 0) > 0).map((k) => {
              const e = estado(k)
              return (
                <button
                  type="button"
                  key={k}
                  className={`filtro-estado filtro-estado--${e.tono}${filtro === k ? ' activo' : ''}`}
                  onClick={() => setFiltro(filtro === k ? '' : k)}
                >
                  {e.texto} <strong>{conteos[k]}</strong>
                </button>
              )
            })}
          </div>

          <div className="card rise" style={{ ['--i' as string]: 2, overflow: 'hidden' }}>
            <div className="tabla-scroll">
              <table className="tabla tabla--clicable">
                <thead>
                  <tr>
                    <th>Pedido</th>
                    <th>{esMayorista || esAdmin ? 'Comercio' : 'Proveedor'}</th>
                    <th>Estado</th>
                    <th>Fecha</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th aria-label="Abrir" />
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((p) => {
                    const e = estado(p.estado)
                    const lineas = num(p.lineas)
                    return (
                      <tr
                        key={p.uuid}
                        onClick={() => navegar(`/pedidos/${p.uuid}`)}
                        onKeyDown={(ev) => { if (ev.key === 'Enter') navegar(`/pedidos/${p.uuid}`) }}
                        tabIndex={0}
                      >
                        <td>
                          <code className="folio">{p.uuid.slice(0, 8)}</code>
                          <div className="apunte">{lineas} línea{lineas === 1 ? '' : 's'}</div>
                        </td>
                        <td>{p.contraparte}</td>
                        <td><span className={`chip chip--${e.tono}`}>{e.texto}</span></td>
                        <td><span title={fecha(p.created_at)}>{relativo(p.created_at)}</span></td>
                        <td className="num" style={{ textAlign: 'right', fontWeight: 650 }}>{money(num(p.total))}</td>
                        <td style={{ width: 120, textAlign: 'right' }} onClick={(ev) => ev.stopPropagation()}>
                          {puedePagar(p.estado) ? (
                            <button
                              type="button"
                              className="btn btn--mini"
                              onClick={() => pagarPedido(p.uuid)}
                              disabled={cobrando === p.uuid}
                            >
                              {cobrando === p.uuid ? 'Abriendo…' : 'Pagar'}
                            </button>
                          ) : (
                            <Icon name="flecha" size={16} />
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {visibles.length === 0 && (
                    <tr><td colSpan={6}><div className="vacio"><strong>Sin pedidos en este estado</strong><span>Prueba con otro filtro.</span></div></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
