import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../components/Icon'
import { Skeleton } from '../../components/UI'
import { money } from '../../lib/format'
import { apiPos, centavos, claveProducto, fotoProducto, sinAcentos } from '../../lib/api-pos'
import type { PosCliente, PosEstado, PosProducto, PosVentaHecha } from '../../lib/api-pos'

type Linea = { p: PosProducto; cantidad: number }

const TOPE = 24
const METODOS = [
  { valor: 'efectivo', texto: 'Efectivo' },
  { valor: 'tarjeta', texto: 'Tarjeta' },
  { valor: 'transferencia', texto: 'Transferencia' },
  { valor: 'credito', texto: 'Crédito' },
]

/** Caja: catálogo a la izquierda, ticket a la derecha. El catálogo sólo aparece al buscar. */
export default function Caja() {
  const [datos, setDatos] = useState<PosEstado | null>(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [q, setQ] = useState('')
  const [lineas, setLineas] = useState<Linea[]>([])
  const [cobrando, setCobrando] = useState(false)
  const [hecha, setHecha] = useState<PosVentaHecha | null>(null)
  const [fondo, setFondo] = useState('200')
  const [abriendo, setAbriendo] = useState(false)
  const buscador = useRef<HTMLInputElement | null>(null)

  const cargar = useCallback(() => {
    apiPos
      .estado()
      .then((d) => {
        setDatos(d)
        setError('')
      })
      .catch((e) => setError((e as Error).message))
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const productos = useMemo(() => datos?.productos ?? [], [datos])
  const ivaIncluido = (datos?.ajustes.iva_incluido ?? 1) === 1

  const totales = useMemo(() => {
    let subtotal = 0
    let total = 0
    for (const l of lineas) {
      const bruto = centavos(l.p.precio_venta * l.cantidad)
      if (ivaIncluido) {
        total += bruto
        subtotal += centavos(bruto / (1 + l.p.iva_tasa))
      } else {
        subtotal += bruto
        total += centavos(bruto * (1 + l.p.iva_tasa))
      }
    }
    const sub = centavos(subtotal)
    const tot = centavos(total)
    return { subtotal: sub, iva: centavos(tot - sub), total: tot }
  }, [lineas, ivaIncluido])

  const clave = sinAcentos(q.trim())
  const encontrados = useMemo(
    () => (clave ? productos.filter((p) => claveProducto(p).includes(clave)) : []),
    [clave, productos],
  )
  const visibles = encontrados.slice(0, TOPE)

  const articulos = lineas.reduce((n, l) => n + l.cantidad, 0)

  const agregar = (p: PosProducto) => {
    setAviso('')
    const ya = lineas.find((l) => l.p.id === p.id)
    if (ya && ya.cantidad + 1 > p.stock) {
      setAviso(`Sólo quedan ${p.stock} ${p.unidad} de ${p.nombre}.`)
      return
    }
    if (!ya && p.stock < 1) {
      setAviso(`${p.nombre} está agotado.`)
      return
    }
    setLineas((prev) =>
      prev.some((l) => l.p.id === p.id)
        ? prev.map((l) => (l.p.id === p.id ? { ...l, cantidad: l.cantidad + 1 } : l))
        : [...prev, { p, cantidad: 1 }],
    )
  }

  const mover = (id: number, delta: number) => {
    setLineas((prev) =>
      prev
        .map((l) => {
          if (l.p.id !== id) return l
          const siguiente = l.cantidad + delta
          if (siguiente > l.p.stock) {
            setAviso(`No hay más stock de ${l.p.nombre}.`)
            return l
          }
          return { ...l, cantidad: siguiente }
        })
        .filter((l) => l.cantidad > 0),
    )
  }

  const quitar = (id: number) => setLineas((prev) => prev.filter((l) => l.p.id !== id))

  const limpiar = () => {
    setLineas([])
    setAviso('')
  }

  const abrirCaja = async (e: React.FormEvent) => {
    e.preventDefault()
    setAbriendo(true)
    try {
      await apiPos.abrirTurno(Math.max(0, Number(fondo) || 0))
      cargar()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setAbriendo(false)
    }
  }

  if (error && !datos) return <div className="aviso aviso--error">{error}</div>

  if (!datos)
    return (
      <div className="card">
        <div className="card__cuerpo" style={{ display: 'grid', gap: 12 }}>
          <Skeleton h={44} />
          <Skeleton h={220} />
        </div>
      </div>
    )

  if (!datos.turno) {
    return (
      <div className="pos-apertura">
        <div className="card">
          <div className="card__cuerpo" style={{ display: 'grid', gap: 14 }}>
            <div>
              <h1 style={{ margin: 0 }}>Abrir caja</h1>
              <p style={{ color: 'var(--muted)', margin: '6px 0 0', fontSize: 14 }}>
                Antes de cobrar declara con cuánto efectivo empiezas el turno.
              </p>
            </div>

            <div className="kpis">
              <div className="kpi">
                <span className="kpi__valor">{datos.productos.length}</span>
                <span className="kpi__etiqueta">Productos en inventario</span>
              </div>
              <div className="kpi">
                <span className="kpi__valor">{Math.round(datos.ajustes.margen_venta)}%</span>
                <span className="kpi__etiqueta">Margen de venta</span>
              </div>
            </div>

            <form onSubmit={abrirCaja} style={{ display: 'grid', gap: 12 }}>
              <label className="campo">
                <span>Fondo inicial en efectivo</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={fondo}
                  onChange={(e) => setFondo(e.target.value)}
                  required
                  autoFocus
                />
              </label>
              {error && <div className="aviso aviso--error">{error}</div>}
              <button type="submit" className="btn btn--bloque" disabled={abriendo}>
                {abriendo ? 'Abriendo…' : 'Abrir caja'}
              </button>
            </form>

            <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
              Si tu inventario está vacío se llena solo con los pedidos que ya te entregaron.
            </p>
            <Link className="btn btn--claro btn--bloque" to="/pos/inventario">
              Revisar inventario
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <header className="pagina-cab">
        <div>
          <h1 style={{ margin: 0 }}>Caja</h1>
          <p style={{ margin: '2px 0 0', color: 'var(--muted)', fontSize: 14 }}>
            Turno #{datos.turno.id} abierto · vendido hoy {money(datos.vendido)} · en caja{' '}
            {money(datos.turno.efectivo_esperado ?? datos.turno.fondo_inicial)}
          </p>
        </div>
        <div className="pos-atajos">
          <Link className="btn btn--claro btn--mini" to="/pos/ventas">
            Ventas
          </Link>
          <Link className="btn btn--claro btn--mini" to="/pos/inventario">
            Inventario
          </Link>
          <Link className="btn btn--claro btn--mini" to="/pos/corte">
            Corte
          </Link>
        </div>
      </header>

      <div className="pos">
        <section className="pos__catalogo" aria-label="Catálogo">
          <div className="pos__isla">
            <Icon name="buscar" size={19} />
            <input
              ref={buscador}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar producto, clave o código…"
              aria-label="Buscar producto, clave o código de barras"
              autoComplete="off"
              enterKeyHint="search"
            />
            {q !== '' && (
              <button type="button" className="pos__isla-x" aria-label="Limpiar búsqueda" onClick={() => setQ('')}>
                <Icon name="x" size={16} />
              </button>
            )}
          </div>

          {aviso && <div className="aviso aviso--info pos__aviso">{aviso}</div>}

          {clave === '' ? (
            <div className="pos__sin-buscar">
              <Icon name="buscar" size={26} />
              <strong>Busca un producto</strong>
              <span>Escribe el nombre o la clave, o pasa el lector de código de barras.</span>
            </div>
          ) : encontrados.length === 0 ? (
            <div className="pos__sin-buscar">
              <strong>Sin resultados</strong>
              <span>No hay productos que coincidan. Prueba con otra palabra.</span>
            </div>
          ) : (
            <>
              <p className="pos__resultados">
                {encontrados.length > TOPE
                  ? `Mostrando ${TOPE} de ${encontrados.length} · escribe más para afinar`
                  : encontrados.length === 1
                    ? '1 producto'
                    : `${encontrados.length} productos`}
              </p>
              <div className="pos__grid">
                {visibles.map((p) => {
                  const agotado = p.stock <= 0
                  const bajo = p.stock <= p.stock_minimo
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className="pos-prod"
                      onClick={() => agregar(p)}
                      disabled={agotado}
                      aria-label={`Agregar ${p.nombre}`}
                    >
                      <span className="pos-prod__foto">
                        <img src={fotoProducto(p)} alt="" loading="lazy" width={200} height={200} />
                      </span>
                      <span className="pos-prod__nom">{p.nombre}</span>
                      <span className="pos-prod__precio">{money(p.precio_venta)}</span>
                      <span className={`chip chip--${agotado ? 'malo' : bajo ? 'alerta' : 'ok'}`}>
                        {agotado ? 'agotado' : `${p.stock} ${p.unidad}`}
                      </span>
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </section>

        <aside className="pos__ticket" aria-label="Ticket">
          <div className="pos__ticket-cab">
            <strong>Ticket</strong>
            <span className="chip chip--neutro">{articulos === 1 ? '1 artículo' : `${articulos} artículos`}</span>
          </div>

          <div className="pos__lineas">
            {lineas.length === 0 ? (
              <p style={{ color: 'var(--muted)', textAlign: 'center', margin: '24px 0', fontSize: 13.5 }}>
                Toca un producto para agregarlo.
              </p>
            ) : (
              lineas.map((l) => (
                <div className="pos-linea" key={l.p.id}>
                  <div className="pos-linea__info">
                    <strong>{l.p.nombre}</strong>
                    <span>
                      {money(l.p.precio_venta)} · {l.p.unidad}
                    </span>
                  </div>
                  <div className="pos-linea__ctrl">
                    <button type="button" onClick={() => mover(l.p.id, -1)} aria-label={`Quitar uno de ${l.p.nombre}`}>
                      <Icon name="menos" size={16} />
                    </button>
                    <span className="num">{l.cantidad}</span>
                    <button type="button" onClick={() => mover(l.p.id, 1)} aria-label={`Agregar uno de ${l.p.nombre}`}>
                      <Icon name="mas" size={16} />
                    </button>
                    <button
                      type="button"
                      className="pos-linea__quitar"
                      onClick={() => quitar(l.p.id)}
                      aria-label={`Quitar ${l.p.nombre} del ticket`}
                    >
                      <Icon name="x" size={14} />
                    </button>
                  </div>
                  <div className="pos-linea__total num">{money(centavos(l.p.precio_venta * l.cantidad))}</div>
                </div>
              ))
            )}
          </div>

          <div className="pos__totales">
            <div>
              <span>Subtotal</span>
              <span className="num">{money(totales.subtotal)}</span>
            </div>
            <div>
              <span>IVA</span>
              <span className="num">{money(totales.iva)}</span>
            </div>
            <div className="pos__total">
              <span>Total</span>
              <span className="num">{money(totales.total)}</span>
            </div>
          </div>

          <button
            type="button"
            className="btn btn--bloque pos__cobrar"
            disabled={lineas.length === 0}
            onClick={() => setCobrando(true)}
          >
            {lineas.length ? `Cobrar ${money(totales.total)}` : 'Cobrar'}
          </button>
          <button type="button" className="btn btn--claro btn--bloque" style={{ marginTop: 8 }} onClick={limpiar}>
            Limpiar ticket
          </button>
        </aside>
      </div>

      {cobrando && (
        <DialogoCobro
          total={totales.total}
          clientes={datos.clientes}
          onCerrar={() => setCobrando(false)}
          onVender={(metodo, recibido, clienteId) =>
            apiPos
              .vender({
                lineas: lineas.map((l) => ({ producto_id: l.p.id, cantidad: l.cantidad })),
                cliente_id: clienteId,
                metodo_pago: metodo,
                recibido,
              })
              .then((r) => {
                setHecha(r)
                setCobrando(false)
                setLineas([])
                setQ('')
                cargar()
              })
          }
        />
      )}

      {hecha && (
        <div className="pos-modal" role="dialog" aria-modal="true" aria-labelledby="pos-ok-titulo">
          <div className="pos-modal__caja">
            <div className="pos-modal__icono">
              <Icon name="check" size={26} />
            </div>
            <h2 id="pos-ok-titulo">Venta {hecha.folio}</h2>
            <p style={{ color: 'var(--muted)', margin: '6px 0 0', fontSize: 14 }}>
              Total {money(hecha.total)}
              {hecha.cambio > 0 ? ` · Cambio ${money(hecha.cambio)}` : ''}
            </p>
            <div style={{ display: 'grid', gap: 8, marginTop: 18 }}>
              <Link className="btn btn--claro" to={`/pos/ticket/${hecha.uuid}`}>
                Ver ticket
              </Link>
              <button type="button" className="btn" onClick={() => setHecha(null)}>
                Nueva venta
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/** Diálogo de cobro: método de pago, efectivo recibido y cambio. */
function DialogoCobro({
  total,
  clientes,
  onCerrar,
  onVender,
}: {
  total: number
  clientes: PosCliente[]
  onCerrar: () => void
  onVender: (metodo: string, recibido: number, clienteId: number | null) => Promise<unknown>
}) {
  const [metodo, setMetodo] = useState('efectivo')
  const [recibido, setRecibido] = useState(total.toFixed(2))
  const [cliente, setCliente] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const primero = useRef<HTMLSelectElement | null>(null)

  useEffect(() => {
    primero.current?.focus()
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar()
    }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onCerrar])

  const efectivo = metodo === 'efectivo'
  const pagado = efectivo ? Number(recibido || 0) : total
  const cambio = Math.max(0, centavos(pagado - total))
  const falta = centavos(total - pagado)
  const puede = !efectivo || pagado + 0.001 >= total

  const cobrar = async () => {
    setOcupado(true)
    setError('')
    try {
      await onVender(metodo, efectivo ? Number(recibido || 0) : total, cliente ? Number(cliente) : null)
    } catch (e) {
      setError((e as Error).message)
      setOcupado(false)
    }
  }

  return (
    <div className="pos-modal" role="dialog" aria-modal="true" aria-labelledby="pos-cobro-titulo">
      <div className="pos-modal__caja">
        <h2 id="pos-cobro-titulo" style={{ margin: 0 }}>
          Cobrar {money(total)}
        </h2>
        <p style={{ color: 'var(--muted)', margin: '4px 0 16px', fontSize: 13.5 }}>
          Elige cómo paga el cliente. El cambio se calcula solo.
        </p>

        <div style={{ display: 'grid', gap: 12 }}>
          <label className="campo">
            <span>Método de pago</span>
            <select ref={primero} value={metodo} onChange={(e) => setMetodo(e.target.value)}>
              {METODOS.map((m) => (
                <option key={m.valor} value={m.valor}>
                  {m.texto}
                </option>
              ))}
            </select>
          </label>

          {efectivo && (
            <>
              <label className="campo">
                <span>Efectivo recibido</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={recibido}
                  onChange={(e) => setRecibido(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && puede) cobrar()
                  }}
                />
              </label>
              <div className="pos-rapidos">
                <button type="button" onClick={() => setRecibido(total.toFixed(2))}>
                  Exacto
                </button>
                {[100, 200, 500].map((m) => (
                  <button key={m} type="button" onClick={() => setRecibido(String(m))}>
                    ${m}
                  </button>
                ))}
              </div>
            </>
          )}

          <label className="campo">
            <span>Cliente</span>
            <select value={cliente} onChange={(e) => setCliente(e.target.value)}>
              <option value="">Público general</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>

          {efectivo && (
            <div className={`pos-cambio ${falta > 0 ? 'pos-cambio--falta' : ''}`}>
              <span>{falta > 0 ? 'Falta' : 'Cambio'}</span>
              <strong className="num">{money(falta > 0 ? falta : cambio)}</strong>
            </div>
          )}

          {error && <div className="aviso aviso--error">{error}</div>}

          <div className="pos-modal__acciones">
            <button type="button" className="btn btn--claro" onClick={onCerrar} disabled={ocupado}>
              Cancelar
            </button>
            <button type="button" className="btn" onClick={cobrar} disabled={!puede || ocupado}>
              {ocupado ? 'Cobrando…' : `Cobrar ${money(total)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
