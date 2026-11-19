import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  apiCrearBnpl,
  apiCrearConsolidacion,
  apiCrearLicitacion,
  apiEstadoPostMvp,
  apiPostMvp,
} from '../../lib/api-admin'
import type { PostMvp } from '../../lib/api-admin'
import { fecha, money } from '../../lib/format'
import Icon from '../../components/Icon'
import { Skeleton, Vacio } from '../../components/UI'

type Pestana = 'consolidaciones' | 'bnpl' | 'licitaciones'

const ESTADOS: Record<Pestana, string[]> = {
  consolidaciones: ['activa', 'completada', 'cancelada'],
  bnpl: ['pendiente', 'activo', 'completado', 'moroso', 'cancelado'],
  licitaciones: ['abierta', 'cerrada', 'adjudicada', 'cancelada'],
}

const tonoEstado = (estado: string) => {
  if (['activa', 'abierta', 'activo', 'completado', 'completada', 'adjudicada'].includes(estado)) return 'ok'
  if (['moroso', 'cancelada', 'cancelado'].includes(estado)) return 'malo'
  if (['pendiente', 'cerrada'].includes(estado)) return 'neutro'
  return 'info'
}

const PESTANAS: { clave: Pestana; texto: string; icono: string }[] = [
  { clave: 'consolidaciones', texto: 'Consolidación de fletes', icono: 'reparto' },
  { clave: 'bnpl', texto: 'Planes BNPL', icono: 'finanzas' },
  { clave: 'licitaciones', texto: 'Licitaciones', icono: 'etiqueta' },
]

export default function AdminPostMvp() {
  const [pestana, setPestana] = useState<Pestana>('consolidaciones')
  const [datos, setDatos] = useState<PostMvp | null>(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState<{ tipo: string; texto: string } | null>(null)
  const [creando, setCreando] = useState(false)
  const [enviando, setEnviando] = useState(false)

  // formularios
  const [conMayorista, setConMayorista] = useState('')
  const [conPedidos, setConPedidos] = useState<string[]>([])
  const [bnplPedido, setBnplPedido] = useState('')
  const [bnplCuotas, setBnplCuotas] = useState('3')
  const [lic, setLic] = useState({ mayorista_id: '', titulo: '', descripcion: '', minimo: '', maximo: '', ventana: '' })

  const cargar = useCallback(() => {
    apiPostMvp()
      .then((d) => {
        setDatos(d)
        setError('')
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  if (error) return <div className="aviso aviso--error">{error}</div>

  if (!datos) {
    return (
      <div style={{ display: 'grid', gap: 14 }}>
        <div className="kpis">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} h={78} />
          ))}
        </div>
        <Skeleton h={240} r={16} />
      </div>
    )
  }

  const puede = datos.permisos.puede_mutar
  const r = datos.resumen

  const pedidosMayorista = datos.pedidos.filter((p) => String(p.mayorista_id) === conMayorista)

  const alternarPedido = (uuid: string) =>
    setConPedidos((prev) => (prev.includes(uuid) ? prev.filter((u) => u !== uuid) : [...prev, uuid]))

  const crearConsolidacion = async () => {
    setAviso(null)
    if (conMayorista === '' || conPedidos.length < datos.parametros.consolidacion_min_pedidos) {
      setAviso({
        tipo: 'error',
        texto: `Elige un mayorista y al menos ${datos.parametros.consolidacion_min_pedidos} pedidos suyos.`,
      })
      return
    }
    setEnviando(true)
    try {
      const res = await apiCrearConsolidacion(Number(conMayorista), conPedidos)
      setAviso({ tipo: 'ok', texto: res.mensaje })
      setConPedidos([])
      setCreando(false)
      cargar()
    } catch (e) {
      setAviso({ tipo: 'error', texto: (e as Error).message })
    } finally {
      setEnviando(false)
    }
  }

  const crearBnpl = async () => {
    setAviso(null)
    if (bnplPedido === '') {
      setAviso({ tipo: 'error', texto: 'Elige el pedido a diferir.' })
      return
    }
    setEnviando(true)
    try {
      const res = await apiCrearBnpl(Number(bnplPedido), Number(bnplCuotas))
      setAviso({ tipo: 'ok', texto: res.mensaje })
      setCreando(false)
      cargar()
    } catch (e) {
      setAviso({ tipo: 'error', texto: (e as Error).message })
    } finally {
      setEnviando(false)
    }
  }

  const crearLicitacion = async () => {
    setAviso(null)
    if (lic.mayorista_id === '' || lic.titulo.trim() === '') {
      setAviso({ tipo: 'error', texto: 'Elige el mayorista y escribe un título.' })
      return
    }
    setEnviando(true)
    try {
      const res = await apiCrearLicitacion({
        mayorista_id: Number(lic.mayorista_id),
        titulo: lic.titulo.trim(),
        descripcion: lic.descripcion.trim(),
        monto_minimo: lic.minimo === '' ? null : Number(lic.minimo),
        monto_maximo: lic.maximo === '' ? null : Number(lic.maximo),
        ventana_horas: lic.ventana === '' ? datos.parametros.licitacion_ventana_horas : Number(lic.ventana),
      })
      setAviso({ tipo: 'ok', texto: res.mensaje })
      setLic({ mayorista_id: '', titulo: '', descripcion: '', minimo: '', maximo: '', ventana: '' })
      setCreando(false)
      cargar()
    } catch (e) {
      setAviso({ tipo: 'error', texto: (e as Error).message })
    } finally {
      setEnviando(false)
    }
  }

  const cambiarEstado = async (recurso: Pestana, id: number, estado: string) => {
    setAviso(null)
    try {
      const res = await apiEstadoPostMvp(recurso, id, estado)
      setAviso({ tipo: 'ok', texto: res.mensaje })
      cargar()
    } catch (e) {
      setAviso({ tipo: 'error', texto: (e as Error).message })
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <header className="pagina-cab">
        <div className="rise">
          <h1>Post-MVP</h1>
          <p>Consolidación de fletes, planes BNPL y licitaciones entre comercios y mayoristas.</p>
        </div>
        <div className="admin-cab rise" style={{ ['--i' as string]: 1 }}>
          <Link to="/admin" className="btn btn--claro btn--mini">
            <Icon name="admin" size={16} /> Panel
          </Link>
        </div>
      </header>

      <div className="kpis rise" style={{ ['--i' as string]: 1 }}>
        <div className="kpi">
          <span className="kpi__valor">{r.consolidaciones_activas}</span>
          <span className="kpi__etiqueta">Consolidaciones activas</span>
        </div>
        <div className="kpi">
          <span className="kpi__valor">{r.bnpl_activos}</span>
          <span className="kpi__etiqueta">Planes BNPL activos</span>
        </div>
        <div className="kpi">
          <span className="kpi__valor">{r.licitaciones_abiertas}</span>
          <span className="kpi__etiqueta">Licitaciones abiertas</span>
        </div>
        <div className="kpi">
          <span className="kpi__valor" style={{ color: 'var(--verde)' }}>
            {money(r.ahorro_total || 0)}
          </span>
          <span className="kpi__etiqueta">Ahorro en fletes</span>
        </div>
      </div>

      {aviso && <div className={`aviso aviso--${aviso.tipo}`}>{aviso.texto}</div>}
      {!puede && <div className="aviso aviso--info">Tu rol es de consulta: no puedes crear ni cambiar estados.</div>}

      <div className="pestanas rise" style={{ ['--i' as string]: 2 }} role="tablist">
        {PESTANAS.map((p) => (
          <button
            key={p.clave}
            type="button"
            role="tab"
            aria-selected={pestana === p.clave}
            className={`pestana ${pestana === p.clave ? 'activa' : ''}`}
            onClick={() => {
              setPestana(p.clave)
              setCreando(false)
              setAviso(null)
            }}
          >
            <Icon name={p.icono} size={16} /> {p.texto}
          </button>
        ))}
      </div>

      {puede && (
        <div className="admin-acciones">
          <button type="button" className={creando ? 'btn btn--claro' : 'btn'} onClick={() => setCreando(!creando)}>
            <Icon name={creando ? 'cerrar' : 'mas'} size={17} />
            {creando ? 'Cerrar formulario' : pestana === 'consolidaciones' ? 'Nueva consolidación' : pestana === 'bnpl' ? 'Nuevo plan BNPL' : 'Nueva licitación'}
          </button>
        </div>
      )}

      {creando && puede && (
        <section className="card rise">
          <div className="card__cab">
            <h2>
              {pestana === 'consolidaciones' ? 'Consolidar fletes' : pestana === 'bnpl' ? 'Crear plan BNPL' : 'Abrir licitación'}
            </h2>
          </div>
          <div className="card__cuerpo">
            {pestana === 'consolidaciones' && (
              <div style={{ display: 'grid', gap: 12 }}>
                <label className="campo">
                  <span>Mayorista</span>
                  <select
                    value={conMayorista}
                    onChange={(e) => {
                      setConMayorista(e.target.value)
                      setConPedidos([])
                    }}
                  >
                    <option value="">Elige uno…</option>
                    {datos.mayoristas.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nombre_comercial}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="campo">
                  <span>
                    Pedidos a consolidar ({conPedidos.length} elegidos, mínimo {datos.parametros.consolidacion_min_pedidos})
                  </span>
                  {conMayorista === '' ? (
                    <p className="admin-nota">Elige primero el mayorista para ver sus pedidos.</p>
                  ) : pedidosMayorista.length === 0 ? (
                    <p className="admin-nota">Ese mayorista no tiene pedidos abiertos.</p>
                  ) : (
                    <div className="admin-checks">
                      {pedidosMayorista.map((p) => (
                        <label key={p.uuid} className="admin-check">
                          <input
                            type="checkbox"
                            checked={conPedidos.includes(p.uuid)}
                            onChange={() => alternarPedido(p.uuid)}
                          />
                          <span>
                            <code style={{ fontSize: 12 }}>{p.uuid.slice(0, 8)}</code> · {money(Number(p.total) || 0)} · envío{' '}
                            {money(Number(p.envio) || 0)}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <div className="admin-acciones">
                  <button type="button" className="btn" onClick={crearConsolidacion} disabled={enviando}>
                    {enviando ? 'Creando…' : 'Crear consolidación'}
                  </button>
                </div>
              </div>
            )}

            {pestana === 'bnpl' && (
              <div className="admin-form">
                <label className="campo">
                  <span>Pedido</span>
                  <select value={bnplPedido} onChange={(e) => setBnplPedido(e.target.value)}>
                    <option value="">Elige uno…</option>
                    {datos.pedidos.map((p) => (
                      <option key={p.uuid} value={p.id}>
                        {p.uuid.slice(0, 8)} · {p.mayorista} · {money(Number(p.total) || 0)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="campo">
                  <span>Cuotas (2–{datos.parametros.bnpl_cuotas_max})</span>
                  <input
                    type="number"
                    min={2}
                    max={datos.parametros.bnpl_cuotas_max}
                    value={bnplCuotas}
                    onChange={(e) => setBnplCuotas(e.target.value)}
                  />
                </label>
                <div className="admin-acciones">
                  <button type="button" className="btn" onClick={crearBnpl} disabled={enviando}>
                    {enviando ? 'Creando…' : 'Crear plan'}
                  </button>
                </div>
              </div>
            )}

            {pestana === 'licitaciones' && (
              <div className="admin-form">
                <label className="campo">
                  <span>Mayorista</span>
                  <select value={lic.mayorista_id} onChange={(e) => setLic({ ...lic, mayorista_id: e.target.value })}>
                    <option value="">Elige uno…</option>
                    {datos.mayoristas.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nombre_comercial}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="campo">
                  <span>Título</span>
                  <input type="text" value={lic.titulo} onChange={(e) => setLic({ ...lic, titulo: e.target.value })} />
                </label>
                <label className="campo">
                  <span>Vence en (horas)</span>
                  <input
                    type="number"
                    min={1}
                    placeholder={String(datos.parametros.licitacion_ventana_horas)}
                    value={lic.ventana}
                    onChange={(e) => setLic({ ...lic, ventana: e.target.value })}
                  />
                </label>
                <label className="campo">
                  <span>Monto mínimo</span>
                  <input type="number" min={0} step="0.01" value={lic.minimo} onChange={(e) => setLic({ ...lic, minimo: e.target.value })} />
                </label>
                <label className="campo">
                  <span>Monto máximo</span>
                  <input type="number" min={0} step="0.01" value={lic.maximo} onChange={(e) => setLic({ ...lic, maximo: e.target.value })} />
                </label>
                <label className="campo campo--ancho">
                  <span>Descripción</span>
                  <input
                    type="text"
                    value={lic.descripcion}
                    onChange={(e) => setLic({ ...lic, descripcion: e.target.value })}
                    placeholder="Productos, volúmenes, condiciones…"
                  />
                </label>
                <div className="admin-acciones campo--ancho">
                  <button type="button" className="btn" onClick={crearLicitacion} disabled={enviando}>
                    {enviando ? 'Creando…' : 'Abrir licitación'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="card rise" style={{ ['--i' as string]: 3 }}>
        <div className="card__cab">
          <h2>
            {pestana === 'consolidaciones' ? 'Consolidaciones' : pestana === 'bnpl' ? 'Planes BNPL' : 'Licitaciones'}
          </h2>
          <span className="admin-nota" style={{ marginLeft: 'auto' }}>
            {pestana === 'consolidaciones'
              ? `${datos.consolidaciones.length} registro(s)`
              : pestana === 'bnpl'
                ? `${datos.bnpl.length} registro(s)`
                : `${datos.licitaciones.length} registro(s)`}
          </span>
        </div>

        {pestana === 'consolidaciones' &&
          (datos.consolidaciones.length === 0 ? (
            <Vacio titulo="Sin consolidaciones" texto="Agrupa pedidos de un mismo mayorista para ahorrar flete." />
          ) : (
            <div className="tabla-scroll">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Mayorista</th>
                    <th style={{ textAlign: 'right' }}>Flete original</th>
                    <th style={{ textAlign: 'right' }}>Flete consolidado</th>
                    <th style={{ textAlign: 'right' }}>Ahorro</th>
                    <th>Pedidos</th>
                    <th>Estado</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.consolidaciones.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <code style={{ fontSize: 12.5 }}>{c.uuid.slice(0, 8)}</code>
                      </td>
                      <td>{c.mayorista}</td>
                      <td className="num" style={{ textAlign: 'right' }}>
                        {money(Number(c.flete_original) || 0)}
                      </td>
                      <td className="num" style={{ textAlign: 'right' }}>
                        {money(Number(c.flete_consolidado) || 0)}
                      </td>
                      <td className="num" style={{ textAlign: 'right', color: 'var(--verde)', fontWeight: 650 }}>
                        {money(Number(c.ahorro) || 0)}
                      </td>
                      <td className="num">{c.pedidos}</td>
                      <td>
                        <div className="admin-fila-acciones">
                          <span className={`chip chip--${tonoEstado(c.estado)}`}>{c.estado}</span>
                          {puede && (
                            <select
                              value={c.estado}
                              aria-label={`Estado de la consolidación ${c.uuid.slice(0, 8)}`}
                              onChange={(e) => cambiarEstado('consolidaciones', c.id, e.target.value)}
                            >
                              {ESTADOS.consolidaciones.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{fecha(c.creado_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

        {pestana === 'bnpl' &&
          (datos.bnpl.length === 0 ? (
            <Vacio titulo="Sin planes BNPL" texto="Difiere un pedido en cuotas para que el comercio pague poco a poco." />
          ) : (
            <div className="tabla-scroll">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Mayorista</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th style={{ textAlign: 'right' }}>Cuota</th>
                    <th>Pagadas</th>
                    <th>Estado</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.bnpl.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <code style={{ fontSize: 12.5 }}>{b.uuid.slice(0, 8)}</code>
                      </td>
                      <td>{b.mayorista}</td>
                      <td className="num" style={{ textAlign: 'right' }}>
                        {money(Number(b.total) || 0)}
                      </td>
                      <td className="num" style={{ textAlign: 'right' }}>
                        {b.cuotas}x {money(Number(b.cuota_monto) || 0)}
                      </td>
                      <td className="num">
                        {b.pagadas}/{b.cuotas}
                      </td>
                      <td>
                        <div className="admin-fila-acciones">
                          <span className={`chip chip--${tonoEstado(b.estado)}`}>{b.estado}</span>
                          {puede && (
                            <select
                              value={b.estado}
                              aria-label={`Estado del plan ${b.uuid.slice(0, 8)}`}
                              onChange={(e) => cambiarEstado('bnpl', b.id, e.target.value)}
                            >
                              {ESTADOS.bnpl.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{fecha(b.creado_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

        {pestana === 'licitaciones' &&
          (datos.licitaciones.length === 0 ? (
            <Vacio titulo="Sin licitaciones" texto="Abre una licitación para que los comercios coticen." />
          ) : (
            <div className="tabla-scroll">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Título</th>
                    <th>Mayorista</th>
                    <th style={{ textAlign: 'right' }}>Mín</th>
                    <th style={{ textAlign: 'right' }}>Máx</th>
                    <th>Cotizaciones</th>
                    <th>Estado</th>
                    <th>Vence</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.licitaciones.map((l) => (
                    <tr key={l.id}>
                      <td>
                        <div className="admin-celda">
                          <strong>{l.titulo}</strong>
                          <small>{l.uuid.slice(0, 8)}</small>
                        </div>
                      </td>
                      <td>{l.mayorista}</td>
                      <td className="num" style={{ textAlign: 'right' }}>
                        {l.monto_minimo ? money(Number(l.monto_minimo)) : '—'}
                      </td>
                      <td className="num" style={{ textAlign: 'right' }}>
                        {l.monto_maximo ? money(Number(l.monto_maximo)) : '—'}
                      </td>
                      <td className="num">{l.cotizaciones}</td>
                      <td>
                        <div className="admin-fila-acciones">
                          <span className={`chip chip--${tonoEstado(l.estado)}`}>{l.estado}</span>
                          {puede && (
                            <select
                              value={l.estado}
                              aria-label={`Estado de la licitación ${l.uuid.slice(0, 8)}`}
                              onChange={(e) => cambiarEstado('licitaciones', l.id, e.target.value)}
                            >
                              {ESTADOS.licitaciones.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{fecha(l.vence_en)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
      </section>
    </div>
  )
}
