import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { apiComercio } from '../lib/api-comercio'
import type { ListaProgramada, ProductoAgenda } from '../lib/api-comercio'
import { fecha, money } from '../lib/format'
import { useNavegar, useSesion } from '../store/session'
import Icon from '../components/Icon'
import { Skeleton, Vacio } from '../components/UI'

type Linea = { producto_uuid: string; cantidad: number }

const ESTADOS: Record<string, { texto: string; tono: string }> = {
  activa: { texto: 'Agendada', tono: 'ok' },
  pausada: { texto: 'Pausada', tono: 'alerta' },
  cancelada: { texto: 'Cancelada', tono: 'neutro' },
}

/** Día local a partir de un `YYYY-MM-DD` (sin corrimiento por zona horaria). */
function dia(iso: string) {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(a, (m ?? 1) - 1, d ?? 1).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

function sumarDias(iso: string, dias: number) {
  const [a, m, d] = iso.split('-').map(Number)
  const f = new Date(a, (m ?? 1) - 1, d ?? 1)
  f.setDate(f.getDate() + dias)
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`
}

function Dialogo({ abierto, titulo, onCerrar, children, acciones }: {
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
      <div className="dialogo__caja dialogo__caja--ancha" role="dialog" aria-modal="true" aria-label={titulo} onClick={(e) => e.stopPropagation()}>
        <header className="dialogo__cab">
          <h2>{titulo}</h2>
          <button className="icono-btn" onClick={onCerrar} aria-label="Cerrar"><Icon name="cerrar" size={17} /></button>
        </header>
        <div className="dialogo__cuerpo">{children}</div>
        <footer className="dialogo__acciones">{acciones}</footer>
      </div>
    </div>
  )
}

export default function Agendar() {
  const [datos, setDatos] = useState<{ listas: ListaProgramada[]; productos: ProductoAgenda[]; hoy: string } | null>(null)
  const [error, setError] = useState('')
  const [abierto, setAbierto] = useState(false)
  const [fechaDeseada, setFechaDeseada] = useState('')
  const [hora, setHora] = useState('09:00')
  const [lineas, setLineas] = useState<Linea[]>([])
  const [enviando, setEnviando] = useState(false)
  const [errorDialogo, setErrorDialogo] = useState('')
  const [cancelar, setCancelar] = useState<ListaProgramada | null>(null)
  const [ocupado, setOcupado] = useState(0)
  const navegar = useNavegar()
  const { aviso } = useSesion()

  const recargar = useCallback(async () => {
    try {
      const r = await apiComercio.agendar()
      setDatos(r)
      setError('')
      return r
    } catch (e) {
      setError((e as Error).message)
      return null
    }
  }, [])

  useEffect(() => { void recargar() }, [recargar])

  const productos = datos?.productos ?? []

  const abrir = () => {
    const hoy = datos?.hoy ?? new Date().toISOString().slice(0, 10)
    setFechaDeseada(sumarDias(hoy, 3))
    setHora('09:00')
    setLineas([{ producto_uuid: datos?.productos[0]?.uuid ?? '', cantidad: datos?.productos[0]?.cantidad_minima ?? 1 }])
    setErrorDialogo('')
    setAbierto(true)
  }

  const proveedorDe = useCallback(
    (uuid: string) => productos.find((p) => p.uuid === uuid)?.mayorista_uuid ?? '',
    [productos],
  )

  const mezcla = useMemo(() => {
    const claves = new Set(lineas.map((l) => proveedorDe(l.producto_uuid)).filter(Boolean))
    return claves.size > 1
  }, [lineas, proveedorDe])

  const nombreProveedor = useCallback(
    (uuid: string) => productos.find((p) => p.uuid === uuid)?.mayorista ?? '',
    [productos],
  )

  const agregarLinea = () => {
    const primero = productos[0]
    setLineas((prev) => [...prev, { producto_uuid: primero?.uuid ?? '', cantidad: primero?.cantidad_minima ?? 1 }])
  }

  const crear = async () => {
    if (!datos) return
    setEnviando(true)
    setErrorDialogo('')
    try {
      const r = await apiComercio.crearLista(
        fechaDeseada,
        hora,
        lineas.filter((l) => l.producto_uuid !== '').map((l) => ({ producto_uuid: l.producto_uuid, cantidad: Math.max(1, l.cantidad) })),
      )
      setAbierto(false)
      aviso(r.mensaje)
      await recargar()
    } catch (e) {
      setErrorDialogo((e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  const cambiarEstado = async (l: ListaProgramada) => {
    setOcupado(l.id)
    try {
      const r = await apiComercio.estadoLista(l.id, l.estado === 'activa' ? 'pausada' : 'activa')
      aviso(r.mensaje)
      await recargar()
    } catch (e) {
      aviso((e as Error).message)
    } finally {
      setOcupado(0)
    }
  }

  const cancelarLista = async () => {
    if (!cancelar) return
    const lista = cancelar
    setCancelar(null)
    setOcupado(lista.id)
    try {
      const r = await apiComercio.cancelarLista(lista.id)
      aviso(r.mensaje)
      await recargar()
    } catch (e) {
      aviso((e as Error).message)
    } finally {
      setOcupado(0)
    }
  }

  if (error) return <div className="aviso aviso--error">{error}</div>

  if (!datos) {
    return (
      <div style={{ display: 'grid', gap: 14 }}>
        <Skeleton h={32} w={240} />
        <div className="lista-grid">{[0, 1].map((i) => <Skeleton key={i} h={170} />)}</div>
      </div>
    )
  }

  const activas = datos.listas.filter((l) => l.estado !== 'cancelada').length

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <header className="pagina-cab">
        <div className="rise">
          <h1>Agendar</h1>
          <p>Arma tu lista de productos y elige el día y la hora en que la quieres recibir.</p>
        </div>
        <button className="btn rise" style={{ ['--i' as string]: 1 }} onClick={abrir} disabled={productos.length === 0}>
          <Icon name="mas" size={17} /> Crear nueva lista
        </button>
      </header>

      <div className="agendar-cabeza rise">
        <h2>Mis listas</h2>
        <span className="chip chip--neutro">
          {activas} activa{activas === 1 ? '' : 's'} de {datos.listas.length}
        </span>
      </div>

      {datos.listas.length === 0 ? (
        <div className="card rise">
          <Vacio
            titulo="Todavía no tienes listas"
            texto="Crea la primera y elige el día en que la quieres: una lista es de un solo mayorista."
            accion={<button className="btn" onClick={abrir} disabled={productos.length === 0}><Icon name="mas" size={17} /> Crear nueva lista</button>}
          />
        </div>
      ) : (
        <section className="lista-grid rise" style={{ ['--i' as string]: 2 }} aria-label="Listas agendadas">
          {datos.listas.map((l) => {
            const e = ESTADOS[l.estado] ?? { texto: l.estado, tono: 'neutro' }
            const cuando = l.fecha_deseada
              ? `${dia(l.fecha_deseada)}${l.hora ? ` a las ${l.hora}` : ''}`
              : fecha(l.proximo_envio)

            return (
              <article className={`lista lista--${l.estado}`} key={l.id}>
                <header className="lista__cab">
                  <div style={{ minWidth: 0 }}>
                    <h3>{l.mayorista}</h3>
                    <p>{l.lineas} producto{l.lineas === 1 ? '' : 's'}</p>
                  </div>
                  <span className={`chip chip--${e.tono}`}>{e.texto}</span>
                </header>

                <div className="lista__cuando">
                  <span className="lista__etiqueta">Entrega</span>
                  <strong>{cuando}</strong>
                </div>

                {l.items.length > 0 && (
                  <ul className="lista__items">
                    {l.items.map((i) => (
                      <li key={`${l.id}-${i.producto_uuid}`}>
                        <span>{i.nombre}</span>
                        <span className="num">×{i.cantidad}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <footer className="lista__acciones">
                  {l.estado !== 'cancelada' && (
                    <button
                      className="btn btn--claro btn--mini"
                      disabled={ocupado === l.id}
                      onClick={() => cambiarEstado(l)}
                    >
                      {l.estado === 'activa' ? 'Pausar' : 'Reactivar'}
                    </button>
                  )}
                  {l.estado !== 'cancelada' && (
                    <button className="lista__cancelar" disabled={ocupado === l.id} onClick={() => setCancelar(l)}>
                      Cancelar
                    </button>
                  )}
                  {l.estado === 'cancelada' && (
                    <button className="btn btn--claro btn--mini" onClick={abrir} disabled={productos.length === 0}>
                      Agendar otra
                    </button>
                  )}
                </footer>
              </article>
            )
          })}
        </section>
      )}

      {productos.length === 0 && (
        <div className="aviso aviso--info">
          No hay productos con existencia para agendar en este momento.
        </div>
      )}

      <Dialogo
        abierto={abierto}
        titulo="Tarjeta de pedido"
        onCerrar={() => setAbierto(false)}
        acciones={
          <>
            <button className="btn btn--claro" onClick={() => setAbierto(false)} disabled={enviando}>Cancelar</button>
            <button
              className="btn"
              onClick={crear}
              disabled={enviando || mezcla || lineas.every((l) => l.producto_uuid === '')}
            >
              {enviando ? 'Agendando…' : 'Agendar'}
            </button>
          </>
        }
      >
        <div className="fila">
          <label className="campo">
            <span>¿Qué día lo quieres?</span>
            <input type="date" value={fechaDeseada} min={datos.hoy} onChange={(e) => setFechaDeseada(e.target.value)} required />
          </label>
          <label className="campo">
            <span>¿A qué hora?</span>
            <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} required />
          </label>
        </div>

        <div className="lineas">
          {lineas.map((l, i) => (
            <div className="linea-form" key={i}>
              <label className="campo">
                <span>Producto</span>
                <select
                  value={l.producto_uuid}
                  onChange={(e) => {
                    const uuid = e.target.value
                    const minimo = productos.find((p) => p.uuid === uuid)?.cantidad_minima ?? 1
                    setLineas((prev) => prev.map((x, j) => (j === i ? { producto_uuid: uuid, cantidad: minimo } : x)))
                  }}
                >
                  {[...new Set(productos.map((p) => p.mayorista))].map((m) => (
                    <optgroup key={m} label={m}>
                      {productos.filter((p) => p.mayorista === m).map((p) => (
                        <option key={p.uuid} value={p.uuid}>
                          {p.nombre} · {money(p.precio_base)} · {p.unidad_venta}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>

              <label className="campo campo--corto">
                <span>Cantidad</span>
                <input
                  type="number"
                  min={1}
                  value={l.cantidad}
                  onChange={(e) => {
                    const n = Math.max(1, Number(e.target.value) || 1)
                    setLineas((prev) => prev.map((x, j) => (j === i ? { ...x, cantidad: n } : x)))
                  }}
                />
              </label>

              <button
                type="button"
                className="linea-form__quitar"
                aria-label="Quitar producto"
                disabled={lineas.length === 1}
                onClick={() => setLineas((prev) => prev.filter((_, j) => j !== i))}
              >
                <Icon name="cerrar" size={15} />
              </button>
            </div>
          ))}
        </div>

        <button type="button" className="lineas__mas" onClick={agregarLinea}>
          <Icon name="mas" size={15} /> Agregar otro producto
        </button>

        {mezcla && (
          <p className="aviso aviso--alerta" style={{ marginTop: 10 }}>
            Una lista es de un solo mayorista: estás mezclando {[...new Set(lineas.map((l) => nombreProveedor(l.producto_uuid)).filter(Boolean))].join(' y ')}.
          </p>
        )}

        {errorDialogo && <p className="aviso aviso--error" style={{ marginTop: 10 }}>{errorDialogo}</p>}

        <p style={{ marginTop: 10, fontSize: 12.5, color: 'var(--faint)' }}>
          Agendar no cobra nada: el pedido se prepara con precios del día y tú lo confirmas.
        </p>
      </Dialogo>

      <Dialogo
        abierto={cancelar !== null}
        titulo="¿Cancelar esta lista?"
        onCerrar={() => setCancelar(null)}
        acciones={
          <>
            <button className="btn btn--claro" onClick={() => setCancelar(null)}>Mejor no</button>
            <button className="btn btn--peligro" onClick={cancelarLista}>Sí, cancelar</button>
          </>
        }
      >
        <p style={{ color: 'var(--muted)', fontSize: 13.5 }}>
          {cancelar ? `${cancelar.mayorista} · ${cancelar.lineas} producto${cancelar.lineas === 1 ? '' : 's'}. ` : ''}
          Dejará de aparecer como agendada y no se preparará ningún pedido.
        </p>
      </Dialogo>

      <button className="agendar-volver" onClick={() => navegar('/buscar')}>
        <Icon name="buscar" size={15} /> Buscar productos para la próxima lista
      </button>
    </div>
  )
}
