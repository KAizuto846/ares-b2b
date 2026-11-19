import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../components/Icon'
import { Skeleton, Vacio } from '../../components/UI'
import { money } from '../../lib/format'
import { apiPos } from '../../lib/api-pos'
import type { PosInventario, PosProducto } from '../../lib/api-pos'

/** Inventario del punto de venta: tabla, alta/edición en diálogo, reposición y ajustes. */
export default function Inventario() {
  const [inv, setInv] = useState<PosInventario | null>(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [editando, setEditando] = useState<PosProducto | 'nuevo' | null>(null)
  const [reponiendo, setReponiendo] = useState<PosProducto | null>(null)
  const [quitando, setQuitando] = useState<PosProducto | null>(null)
  const [ajustes, setAjustes] = useState({ margen: '30', iva: true, reorden: true })
  const [guardandoAjustes, setGuardandoAjustes] = useState(false)

  const cargar = useCallback(() => {
    apiPos
      .inventario()
      .then((d) => {
        setInv(d)
        setAjustes({
          margen: String(Math.round(d.ajustes.margen_venta)),
          iva: d.ajustes.iva_incluido === 1,
          reorden: d.ajustes.reorden_auto === 1,
        })
        setError('')
      })
      .catch((e) => setError((e as Error).message))
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const guardarAjustes = async () => {
    setGuardandoAjustes(true)
    try {
      await apiPos.guardarAjustes({
        margen_venta: Math.max(0, Number(ajustes.margen) || 0),
        iva_incluido: ajustes.iva ? 1 : 0,
        reorden_auto: ajustes.reorden ? 1 : 0,
      })
      setAviso('Ajustes guardados.')
      cargar()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGuardandoAjustes(false)
    }
  }

  if (error && !inv) return <div className="aviso aviso--error">{error}</div>

  if (!inv)
    return (
      <div className="card">
        <div className="card__cuerpo" style={{ display: 'grid', gap: 12 }}>
          <Skeleton h={40} />
          <Skeleton h={240} />
        </div>
      </div>
    )

  return (
    <>
      <header className="pagina-cab">
        <div>
          <h1 style={{ margin: 0 }}>Inventario</h1>
          <p style={{ margin: '2px 0 0', color: 'var(--muted)', fontSize: 14 }}>
            Precios, existencias y reposición de la caja.
          </p>
        </div>
        <div className="pos-atajos">
          <button type="button" className="btn btn--mini" onClick={() => setEditando('nuevo')}>
            <Icon name="mas" size={17} /> Producto
          </button>
          <Link className="btn btn--claro btn--mini" to="/pos">
            Ir a caja
          </Link>
        </div>
      </header>

      {aviso && <div className="aviso aviso--ok" style={{ marginBottom: 14 }}>{aviso}</div>}
      {error && <div className="aviso aviso--error" style={{ marginBottom: 14 }}>{error}</div>}

      {inv.sugerencias.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card__cab">
            <Icon name="alerta" size={18} />
            <strong>Reposición sugerida</strong>
            <span className="chip chip--alerta">{inv.sugerencias.length}</span>
          </div>
          <div className="card__cuerpo" style={{ display: 'grid', gap: 8 }}>
            {inv.sugerencias.map((s) => (
              <div className="pos-sug" key={s.producto_id}>
                <div>
                  <strong>{s.nombre}</strong>
                  <div style={{ color: 'var(--muted)', fontSize: 12.5 }}>
                    Quedan {s.stock} · mínimo {s.minimo}
                  </div>
                </div>
                <span className="chip chip--alerta">pedir {s.sugerido}</span>
                <button
                  type="button"
                  className="btn btn--claro btn--mini"
                  onClick={() => {
                    const p = inv.productos.find((x) => x.id === s.producto_id)
                    if (p) setReponiendo(p)
                  }}
                >
                  Reponer
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="pos-inv">
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="tabla-scroll">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Compra</th>
                  <th>Venta</th>
                  <th>Stock</th>
                  <th>Mínimo</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {inv.productos.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <Vacio
                        titulo="Sin productos"
                        texto="Se importan solos de tus pedidos entregados, o captúralos aquí."
                      />
                    </td>
                  </tr>
                ) : (
                  inv.productos.map((p) => {
                    const bajo = p.stock <= p.stock_minimo
                    return (
                      <tr key={p.id}>
                        <td>
                          <strong>{p.nombre}</strong>
                          {p.sku && (
                            <div style={{ color: 'var(--muted)', fontSize: 12.5 }}>{p.sku}</div>
                          )}
                        </td>
                        <td className="num">{money(p.precio_compra)}</td>
                        <td className="num">{money(p.precio_venta)}</td>
                        <td>
                          <span className={`chip chip--${p.stock <= 0 ? 'malo' : bajo ? 'alerta' : 'ok'}`}>
                            {p.stock} {p.unidad}
                          </span>
                        </td>
                        <td className="num">{p.stock_minimo}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button
                            type="button"
                            className="pos-accion"
                            onClick={() => setReponiendo(p)}
                            aria-label={`Reponer ${p.nombre}`}
                          >
                            <Icon name="masCirculo" size={16} /> Reponer
                          </button>
                          <button
                            type="button"
                            className="pos-accion"
                            onClick={() => setEditando(p)}
                            aria-label={`Editar ${p.nombre}`}
                          >
                            <Icon name="editar" size={16} /> Editar
                          </button>
                          <button
                            type="button"
                            className="pos-accion pos-accion--malo"
                            onClick={() => setQuitando(p)}
                            aria-label={`Quitar ${p.nombre}`}
                          >
                            <Icon name="basura" size={16} /> Quitar
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card" style={{ alignSelf: 'start' }}>
          <div className="card__cab">
            <Icon name="ajustes" size={18} />
            <strong>Ajustes de la caja</strong>
          </div>
          <div className="card__cuerpo" style={{ display: 'grid', gap: 12 }}>
            <label className="campo">
              <span>Margen al importar pedidos (%)</span>
              <input
                type="number"
                min={0}
                max={300}
                step={1}
                value={ajustes.margen}
                onChange={(e) => setAjustes({ ...ajustes, margen: e.target.value })}
              />
            </label>
            <label className="pos-check">
              <input
                type="checkbox"
                checked={ajustes.iva}
                onChange={(e) => setAjustes({ ...ajustes, iva: e.target.checked })}
              />
              <span>Los precios ya incluyen IVA</span>
            </label>
            <label className="pos-check">
              <input
                type="checkbox"
                checked={ajustes.reorden}
                onChange={(e) => setAjustes({ ...ajustes, reorden: e.target.checked })}
              />
              <span>Avisarme cuando un producto llegue al mínimo</span>
            </label>
            <button type="button" className="btn btn--claro btn--bloque" onClick={guardarAjustes} disabled={guardandoAjustes}>
              {guardandoAjustes ? 'Guardando…' : 'Guardar ajustes'}
            </button>
          </div>
        </div>
      </div>

      {editando && (
        <FormularioProducto
          producto={editando === 'nuevo' ? null : editando}
          onCerrar={() => setEditando(null)}
          onGuardado={(texto) => {
            setEditando(null)
            setAviso(texto)
            setError('')
            cargar()
          }}
        />
      )}

      {reponiendo && (
        <DialogoReponer
          producto={reponiendo}
          sugerido={inv.sugerencias.find((s) => s.producto_id === reponiendo.id)?.sugerido}
          onCerrar={() => setReponiendo(null)}
          onHecho={(texto) => {
            setReponiendo(null)
            setAviso(texto)
            cargar()
          }}
        />
      )}

      {quitando && (
        <div className="pos-modal" role="dialog" aria-modal="true" aria-labelledby="pos-quitar">
          <div className="pos-modal__caja">
            <h2 id="pos-quitar" style={{ margin: 0 }}>
              ¿Desactivar «{quitando.nombre}»?
            </h2>
            <p style={{ color: 'var(--muted)', margin: '6px 0 18px', fontSize: 13.5 }}>
              Deja de aparecer en la caja. Las ventas anteriores no se tocan.
            </p>
            <div className="pos-modal__acciones">
              <button type="button" className="btn btn--claro" onClick={() => setQuitando(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn--peligro"
                onClick={() => {
                  apiPos
                    .desactivarProducto(quitando.id)
                    .then(() => {
                      setAviso('Producto desactivado.')
                      setQuitando(null)
                      cargar()
                    })
                    .catch((e) => setError((e as Error).message))
                }}
              >
                Desactivar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const VACIO = {
  nombre: '',
  sku: '',
  codigo_barras: '',
  precio_compra: '0',
  precio_venta: '0',
  iva_tasa: '0.16',
  stock: '0',
  stock_minimo: '1',
  unidad: 'pieza',
}

function FormularioProducto({
  producto,
  onCerrar,
  onGuardado,
}: {
  producto: PosProducto | null
  onCerrar: () => void
  onGuardado: (texto: string) => void
}) {
  const [f, setF] = useState(
    producto
      ? {
          nombre: producto.nombre,
          sku: producto.sku,
          codigo_barras: producto.codigo_barras,
          precio_compra: String(producto.precio_compra),
          precio_venta: String(producto.precio_venta),
          iva_tasa: String(producto.iva_tasa),
          stock: String(producto.stock),
          stock_minimo: String(producto.stock_minimo),
          unidad: producto.unidad,
        }
      : VACIO,
  )
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const poner = (clave: keyof typeof VACIO) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [clave]: e.target.value })

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (f.nombre.trim() === '') {
      setError('El nombre es obligatorio.')
      return
    }
    setOcupado(true)
    setError('')
    const datos = {
      nombre: f.nombre.trim(),
      sku: f.sku.trim(),
      codigo_barras: f.codigo_barras.trim(),
      precio_compra: Math.max(0, Number(f.precio_compra) || 0),
      precio_venta: Math.max(0, Number(f.precio_venta) || 0),
      iva_tasa: Number(f.iva_tasa) || 0,
      stock: Number(f.stock) || 0,
      stock_minimo: Math.max(0, Number(f.stock_minimo) || 0),
      unidad: f.unidad.trim() || 'pieza',
    }
    try {
      if (producto) {
        await apiPos.editarProducto(producto.id, datos)
        onGuardado('Producto actualizado.')
      } else {
        await apiPos.crearProducto({ ...datos, activo: 1 })
        onGuardado('Producto agregado al inventario.')
      }
    } catch (err) {
      setError((err as Error).message)
      setOcupado(false)
    }
  }

  return (
    <div className="pos-modal" role="dialog" aria-modal="true" aria-labelledby="pos-prod-titulo">
      <div className="pos-modal__caja pos-modal__caja--ancha">
        <h2 id="pos-prod-titulo" style={{ margin: '0 0 14px' }}>
          {producto ? 'Editar producto' : 'Nuevo producto'}
        </h2>
        <form onSubmit={guardar} style={{ display: 'grid', gap: 12 }}>
          <label className="campo">
            <span>Nombre</span>
            <input value={f.nombre} onChange={poner('nombre')} maxLength={180} required autoFocus />
          </label>
          <div className="pos-fila">
            <label className="campo">
              <span>SKU</span>
              <input value={f.sku} onChange={poner('sku')} maxLength={60} />
            </label>
            <label className="campo">
              <span>Código de barras</span>
              <input value={f.codigo_barras} onChange={poner('codigo_barras')} maxLength={60} />
            </label>
          </div>
          <div className="pos-fila">
            <label className="campo">
              <span>Costo</span>
              <input type="number" min={0} step="0.01" value={f.precio_compra} onChange={poner('precio_compra')} />
            </label>
            <label className="campo">
              <span>Precio venta</span>
              <input type="number" min={0} step="0.01" value={f.precio_venta} onChange={poner('precio_venta')} />
            </label>
          </div>
          <div className="pos-fila">
            <label className="campo">
              <span>Stock</span>
              <input type="number" step="0.001" value={f.stock} onChange={poner('stock')} />
            </label>
            <label className="campo">
              <span>Mínimo</span>
              <input type="number" min={0} step="0.001" value={f.stock_minimo} onChange={poner('stock_minimo')} />
            </label>
          </div>
          <div className="pos-fila">
            <label className="campo">
              <span>IVA</span>
              <select value={f.iva_tasa} onChange={poner('iva_tasa')}>
                <option value="0.16">16%</option>
                <option value="0.08">8%</option>
                <option value="0">Exento</option>
              </select>
            </label>
            <label className="campo">
              <span>Unidad</span>
              <input value={f.unidad} onChange={poner('unidad')} maxLength={30} />
            </label>
          </div>

          {error && <div className="aviso aviso--error">{error}</div>}

          <div className="pos-modal__acciones">
            <button type="button" className="btn btn--claro" onClick={onCerrar} disabled={ocupado}>
              Cancelar
            </button>
            <button type="submit" className="btn" disabled={ocupado}>
              {ocupado ? 'Guardando…' : producto ? 'Guardar cambios' : 'Agregar producto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function DialogoReponer({
  producto,
  sugerido,
  onCerrar,
  onHecho,
}: {
  producto: PosProducto
  sugerido?: number
  onCerrar: () => void
  onHecho: (texto: string) => void
}) {
  const [cantidad, setCantidad] = useState(String(sugerido ?? 1))
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const reponer = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = Number(cantidad)
    if (!(n > 0)) {
      setError('Escribe una cantidad mayor que cero.')
      return
    }
    setOcupado(true)
    try {
      const r = await apiPos.reponer(producto.id, n)
      onHecho(`Stock de ${producto.nombre}: ${r.stock} ${producto.unidad}.`)
    } catch (err) {
      setError((err as Error).message)
      setOcupado(false)
    }
  }

  return (
    <div className="pos-modal" role="dialog" aria-modal="true" aria-labelledby="pos-reponer">
      <div className="pos-modal__caja">
        <h2 id="pos-reponer" style={{ margin: 0 }}>
          Reponer {producto.nombre}
        </h2>
        <p style={{ color: 'var(--muted)', margin: '6px 0 14px', fontSize: 13.5 }}>
          Stock actual: {producto.stock} {producto.unidad}. Se suma al inventario y queda el movimiento en el turno.
        </p>
        <form onSubmit={reponer} style={{ display: 'grid', gap: 12 }}>
          <label className="campo">
            <span>Cantidad a agregar</span>
            <input
              type="number"
              min={0.001}
              step="0.001"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              autoFocus
              required
            />
          </label>
          {error && <div className="aviso aviso--error">{error}</div>}
          <div className="pos-modal__acciones">
            <button type="button" className="btn btn--claro" onClick={onCerrar} disabled={ocupado}>
              Cancelar
            </button>
            <button type="submit" className="btn" disabled={ocupado}>
              {ocupado ? 'Reponiendo…' : 'Reponer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
