import { useEffect, useMemo, useState } from 'react'
import { useNavegar, useSesion } from '../store/session'
import { estado, money, money0 } from '../lib/format'
import { Skeleton, Vacio, Aviso } from '../components/UI'
import Icon from '../components/Icon'
import { apiFinanzas, apiSolicitarFactura, urlExport } from '../lib/api-finanzas'
import type { FinanzasDatos, Movimiento, ParamsFinanzas, SeriePunto, VistaFinanzas } from '../lib/api-finanzas'

/** Estados de pedido que ya se pueden facturar (los mismos que acepta la API). */
const CERRADOS = ['recibido', 'completado', 'entregado']

/** Tono del chip para el estado de una factura. */
const tonoFactura = (e: string) => (e === 'timbrada' ? 'ok' : e === 'generada' ? 'alerta' : e === 'cancelada' ? 'malo' : 'neutro')

/** Saltos candidatos del eje: se elige el primero que deje la barra más alta por debajo del techo. */
const SALTOS = [50, 100, 200, 250, 500, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 7500, 10000, 15000, 20000, 25000, 50000, 100000]

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

function corto(v: number) {
  if (v >= 1000) return '$' + (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return money0(v)
}

function Grafica({ serie, mensual }: { serie: SeriePunto[]; mensual: boolean }) {
  const maximo = serie.reduce((m, p) => Math.max(m, p.valor), 0)
  const paso = SALTOS.find((c) => c >= maximo / 4) ?? SALTOS[SALTOS.length - 1]
  const tope = paso * 4
  const eje = [4, 3, 2, 1, 0]

  return (
    <div className="fin-grafica" role="img" aria-label={`Gasto por ${mensual ? 'día' : 'mes'}: máximo ${money(maximo)}`}>
      <div className="fin-eje-y" aria-hidden="true">
        {eje.map((i) => (
          <span key={i} style={{ bottom: `${i * 25}%` }}>{corto(paso * i)}</span>
        ))}
      </div>
      <div className="fin-plot">
        {eje.map((i) => <i key={i} className="fin-linea" style={{ bottom: `${i * 25}%` }} />)}
        <div className="fin-barras">
          {serie.map((p, i) => {
            const alto = p.valor > 0 ? Math.max(3, Math.round((p.valor / Math.max(tope, 0.01)) * 100)) : 0
            const verEtiqueta = !mensual || serie.length <= 16 || Number(p.etiqueta) % 5 === 0 || i === 0
            return (
              <div
                key={`${p.etiqueta}-${i}`}
                className={`fin-barra${p.valor > 0 ? '' : ' fin-barra--vacia'}`}
                title={`${p.etiqueta} · ${money(p.valor)}`}
              >
                <span className="fin-barra__pista">{p.valor > 0 ? money0(p.valor) : ''}</span>
                <i style={{ height: `${Math.max(0.6, alto)}%` }} />
                <b className={verEtiqueta ? '' : 'fin-oculta'}>{p.etiqueta}</b>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Kpi({ valor, etiqueta, nota }: { valor: string; etiqueta: string; nota?: string }) {
  return (
    <div className="kpi">
      <span className="kpi__valor">{valor}</span>
      <span className="kpi__etiqueta">{etiqueta}</span>
      {nota && <span className="kpi__nota">{nota}</span>}
    </div>
  )
}

function Delta({ datos }: { datos: FinanzasDatos }) {
  const d = datos.comparacion.delta_pct
  const previo = datos.comparacion.total_anterior
  if (d === null) {
    return <Kpi valor="—" etiqueta="Vs periodo anterior" nota={previo > 0 ? money(previo) : 'Sin datos previos'} />
  }
  const color = d > 0 ? 'var(--rojo)' : d < 0 ? 'var(--verde)' : 'var(--muted)'
  const signo = d > 0 ? '+' : ''
  return (
    <div className="kpi">
      <span className="kpi__valor" style={{ color }}>{signo}{d.toLocaleString('es-MX', { maximumFractionDigits: 1 })}%</span>
      <span className="kpi__etiqueta">Vs periodo anterior</span>
      <span className="kpi__nota">{money(previo)} antes</span>
    </div>
  )
}

export default function Finanzas() {
  const navegar = useNavegar()
  const [datos, setDatos] = useState<FinanzasDatos | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'gastos' | 'facturas'>('gastos')
  const [vista, setVista] = useState<VistaFinanzas>('anual')
  const hoy = useMemo(() => new Date(), [])
  const [anio, setAnio] = useState(hoy.getFullYear())
  const [mes, setMes] = useState(hoy.getMonth() + 1)
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [rango, setRango] = useState<{ desde: string; hasta: string } | null>(null)
  const [aviso, setAviso] = useState<{ tipo: string; texto: string } | null>(null)
  const [solicitando, setSolicitando] = useState('')

  const params = useMemo<ParamsFinanzas>(() => {
    if (datos?.rol === 'comercio' || datos === null) return { vista, anio, mes }
    return rango ? { desde: rango.desde, hasta: rango.hasta } : {}
  }, [datos?.rol, vista, anio, mes, rango])

  useEffect(() => {
    let vivo = true
    setError('')
    apiFinanzas(params)
      .then((r) => { if (vivo) { setDatos(r); if (r.periodo.desde) { setDesde(r.periodo.desde); setHasta(r.periodo.hasta) } } })
      .catch((e: Error) => { if (vivo) setError(e.message) })
    return () => { vivo = false }
  }, [params])

  const esComercio = datos?.rol === 'comercio'
  const mensual = datos?.vista === 'mensual'

  const kpis = useMemo(() => {
    if (!datos) return []
    const r = datos.resumen
    if (datos.rol === 'comercio') {
      return [
        { valor: money(r.total ?? 0), etiqueta: 'Gastado en el periodo', nota: `${r.pedidos ?? 0} pedido${(r.pedidos ?? 0) === 1 ? '' : 's'}` },
        { valor: money(r.iva ?? 0), etiqueta: 'IVA de tus compras' },
        { valor: money(r.envio ?? 0), etiqueta: 'Envíos pagados' },
        { valor: money(r.promedio ?? 0), etiqueta: 'Ticket promedio' },
      ]
    }
    if (datos.rol === 'mayorista') {
      return [
        { valor: money(r.total ?? 0), etiqueta: 'Venta del periodo', nota: `${r.pedidos ?? 0} pedido${(r.pedidos ?? 0) === 1 ? '' : 's'} cerrados` },
        { valor: money(r.iva ?? 0), etiqueta: 'IVA trasladado' },
        { valor: (r.comision ?? 0) > 0 ? '−' + money(r.comision) : money(0), etiqueta: 'Comisión de plataforma' },
        { valor: money(r.neto ?? 0), etiqueta: 'Neto a cobrar' },
      ]
    }
    if (datos.rol === 'repartidor') {
      return [
        { valor: String(r.viajes ?? 0), etiqueta: 'Viajes completados' },
        { valor: money(r.total ?? 0), etiqueta: 'Ganado en el periodo' },
        { valor: `${(r.km ?? 0).toLocaleString('es-MX', { maximumFractionDigits: 1 })} km`, etiqueta: 'Distancia recorrida' },
        { valor: money(r.promedio ?? 0), etiqueta: 'Promedio por viaje' },
      ]
    }
    return [
      { valor: String(r.pedidos ?? 0), etiqueta: 'Pedidos del periodo' },
      { valor: money(r.total ?? 0), etiqueta: 'Valor de la operación' },
      { valor: money(r.comisiones ?? 0), etiqueta: 'Comisiones registradas' },
      { valor: String(r.facturas ?? 0), etiqueta: 'Facturas emitidas' },
    ]
  }, [datos])

  const porFacturar = useMemo(() => {
    if (!datos || datos.rol !== 'comercio') return []
    return datos.movimientos.filter(
      (m) => CERRADOS.includes(m.estado) && !datos.facturas.some((f) => f.pedido_uuid === m.uuid),
    )
  }, [datos])

  const titulo = datos?.rol === 'mayorista'
    ? 'Finanzas'
    : datos?.rol === 'repartidor'
      ? 'Mis ganancias'
      : datos?.rol?.startsWith('admin')
        ? 'Finanzas de la plataforma'
        : 'Finanzas'
  const subtitulo = datos?.rol === 'comercio'
    ? 'Lo que has gastado y las facturas de tus pedidos, en un solo lugar.'
    : datos?.rol === 'mayorista'
      ? 'Ventas cerradas, comisión y lo que te queda.'
      : datos?.rol === 'repartidor'
        ? 'Tus viajes completados y lo que has ganado.'
        : 'Movimiento de la plataforma en el periodo.'

  const solicitar = (uuid: string) => {
    setSolicitando(uuid)
    setAviso(null)
    apiSolicitarFactura(uuid)
      .then((r) => {
        setAviso({ tipo: 'ok', texto: r.mensaje })
        apiFinanzas(params).then(setDatos).catch(() => undefined)
      })
      .catch((e: Error) => setAviso({ tipo: 'error', texto: e.message }))
      .finally(() => setSolicitando(''))
  }

  if (error && !datos) return <Aviso tipo="error">{error}</Aviso>
  if (!datos) {
    return (
      <div style={{ display: 'grid', gap: 18 }}>
        <Skeleton h={44} w="45%" />
        <div className="kpis">{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={84} />)}</div>
        <div className="card"><div className="card__cuerpo"><Skeleton h={220} /></div></div>
      </div>
    )
  }

  const columnas: { titulo: string; alineada?: boolean }[] = datos.rol === 'repartidor'
    ? [{ titulo: 'Pedido' }, { titulo: 'Fecha' }, { titulo: 'Comercio' }, { titulo: 'Distancia', alineada: true }, { titulo: 'Tarifa', alineada: true }]
    : [{ titulo: 'Pedido' }, { titulo: 'Fecha' }, { titulo: datos.rol === 'comercio' ? 'Mayorista' : 'Contraparte' }, { titulo: 'Estado' }, { titulo: 'Monto', alineada: true }]

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <header className="pagina-cab">
        <div className="rise">
          <h1>{titulo}</h1>
          <p>{subtitulo}</p>
        </div>
        {datos.periodo.desde && (
          <a className="btn btn--claro" href={urlExport(datos.periodo.desde, datos.periodo.hasta)} download>
            <Icon name="documento" size={17} /> Exportar CSV
          </a>
        )}
      </header>

      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
      {error && <Aviso tipo="error">{error}</Aviso>}

      {esComercio && (
        <nav className="fin-tabs" aria-label="Secciones de finanzas">
          <button type="button" className={`fin-tab${tab === 'gastos' ? ' activo' : ''}`} onClick={() => setTab('gastos')}>Estado de gastos</button>
          <button type="button" className={`fin-tab${tab === 'facturas' ? ' activo' : ''}`} onClick={() => setTab('facturas')}>
            Facturación <span className="fin-cuenta">{datos.facturas.length}</span>
          </button>
        </nav>
      )}

      {(!esComercio || tab === 'gastos') && (
        <>
          <div className="fin-herramientas">
            {esComercio ? (
              <>
                <div className="fin-segmento" role="group" aria-label="Vista del periodo">
                  <button type="button" className={vista === 'anual' ? 'activo' : ''} onClick={() => setVista('anual')}>Anual</button>
                  <button type="button" className={vista === 'mensual' ? 'activo' : ''} onClick={() => setVista('mensual')}>Mensual</button>
                </div>
                <label className="campo fin-campo">
                  <span>Año</span>
                  <select value={anio} onChange={(e) => setAnio(Number(e.target.value))}>
                    {[0, 1, 2].map((d) => <option key={d} value={hoy.getFullYear() - d}>Año {hoy.getFullYear() - d}</option>)}
                  </select>
                </label>
                {vista === 'mensual' && (
                  <label className="campo fin-campo">
                    <span>Mes</span>
                    <select value={mes} onChange={(e) => setMes(Number(e.target.value))}>
                      {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                    </select>
                  </label>
                )}
              </>
            ) : (
              <>
                <label className="campo fin-campo">
                  <span>Desde</span>
                  <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
                </label>
                <label className="campo fin-campo">
                  <span>Hasta</span>
                  <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
                </label>
                <button
                  type="button"
                  className="btn btn--claro"
                  disabled={desde === '' || hasta === '' || desde > hasta}
                  onClick={() => setRango({ desde, hasta })}
                >
                  Aplicar
                </button>
              </>
            )}
            <span className="fin-nota">Periodo: {datos.periodo.etiqueta}</span>
          </div>

          <div className="kpis rise" style={{ ['--i' as string]: 1 }}>
            {kpis.map((k) => <Kpi key={k.etiqueta} valor={k.valor} etiqueta={k.etiqueta} nota={k.nota} />)}
            {esComercio && <Delta datos={datos} />}
          </div>

          <section className="card rise" style={{ ['--i' as string]: 2 }}>
            <div className="card__cab">
              <h2>{esComercio ? `Gasto por ${mensual ? 'día' : 'mes'}` : 'Ingresos por mes'}</h2>
              <span className="fin-total">{money(datos.resumen.total ?? 0)}</span>
            </div>
            <div className="card__cuerpo">
              <Grafica serie={datos.serie} mensual={!!mensual} />
            </div>
          </section>

          <section className="card rise" style={{ ['--i' as string]: 3 }}>
            <div className="card__cab">
              <h2>Movimientos</h2>
              <span className="fin-nota">{datos.movimientos.length} en el periodo</span>
            </div>
            {datos.movimientos.length === 0 ? (
              <Vacio
                titulo="Sin movimientos en este periodo"
                texto={esComercio ? 'Cambia el periodo o explora proveedores.' : 'Prueba otro rango de fechas.'}
                accion={esComercio ? <button className="btn" onClick={() => navegar('/buscar')}>Buscar productos</button> : undefined}
              />
            ) : (
              <div className="tabla-scroll">
                <table className="tabla">
                  <thead>
                    <tr>
                      {columnas.map((c) => <th key={c.titulo} style={c.alineada ? { textAlign: 'right' } : undefined}>{c.titulo}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {datos.movimientos.map((m: Movimiento) => {
                      const e = estado(m.estado)
                      return (
                        <tr key={m.uuid + m.fecha}>
                          <td>
                            <button type="button" className="fin-enlace" onClick={() => navegar(`/pedidos/${m.uuid}`)}>
                              {m.uuid.slice(0, 8)}
                            </button>
                          </td>
                          <td>{m.fecha}</td>
                          <td>{m.mayorista ?? m.contraparte ?? '—'}</td>
                          {datos.rol === 'repartidor' ? (
                            <td className="num" style={{ textAlign: 'right' }}>{(m.distancia_km ?? 0).toLocaleString('es-MX', { maximumFractionDigits: 1 })} km</td>
                          ) : (
                            <td><span className={`chip chip--${e.tono}`}>{e.texto}</span></td>
                          )}
                          <td className="num" style={{ textAlign: 'right', fontWeight: 650 }}>{money(m.monto)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {esComercio && tab === 'facturas' && (
        <>
          <section className="card rise" style={{ ['--i' as string]: 1 }}>
            <div className="card__cab"><h2>Pedidos por facturar</h2></div>
            {porFacturar.length === 0 ? (
              <div className="card__cuerpo fin-nota">No hay pedidos entregados pendientes de factura.</div>
            ) : (
              <div className="tabla-scroll">
                <table className="tabla">
                  <thead><tr><th>Pedido</th><th>Mayorista</th><th>Fecha</th><th style={{ textAlign: 'right' }}>Total</th><th /></tr></thead>
                  <tbody>
                    {porFacturar.map((m) => (
                      <tr key={m.uuid}>
                        <td><code style={{ fontSize: 12.5 }}>{m.uuid.slice(0, 8)}</code></td>
                        <td>{m.mayorista ?? '—'}</td>
                        <td>{m.fecha}</td>
                        <td className="num" style={{ textAlign: 'right', fontWeight: 650 }}>{money(m.monto)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button type="button" className="btn btn--claro btn--mini" disabled={solicitando === m.uuid} onClick={() => solicitar(m.uuid)}>
                            {solicitando === m.uuid ? 'Solicitando…' : 'Solicitar factura'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card rise" style={{ ['--i' as string]: 2 }}>
            <div className="card__cab">
              <h2>Tus facturas</h2>
              <span className="fin-nota">{datos.facturas.length}</span>
            </div>
            {datos.facturas.length === 0 ? (
              <Vacio titulo="Todavía no tienes facturas" texto="Las emite el mayorista al cerrar cada pedido." />
            ) : (
              <div className="tabla-scroll">
                <table className="tabla">
                  <thead><tr><th>Folio</th><th>Emisor</th><th>Fecha</th><th>Estado</th><th style={{ textAlign: 'right' }}>Total</th><th /></tr></thead>
                  <tbody>
                    {datos.facturas.map((f) => {
                      const e = estado(f.estado)
                      return (
                        <tr key={f.uuid}>
                          <td><code style={{ fontSize: 12.5 }}>{f.folio_texto}</code></td>
                          <td>{f.razon_social_emisor}</td>
                          <td>{f.fecha}</td>
                          <td><span className={`chip chip--${e.tono}`}>{e.texto}</span></td>
                          <td className="num" style={{ textAlign: 'right', fontWeight: 650 }}>{money(f.total)}</td>
                          <td style={{ textAlign: 'right' }}>
                            <button type="button" className="btn btn--claro btn--mini" onClick={() => navegar(`/finanzas/factura/${f.uuid}`)}>
                              Ver hoja
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
