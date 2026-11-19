import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiReclamos, apiResolverReclamo } from '../../lib/api-admin'
import type { ListaReclamos, Reclamo } from '../../lib/api-admin'
import { fecha, money } from '../../lib/format'
import Icon from '../../components/Icon'
import { Skeleton, Vacio } from '../../components/UI'

const tonoReclamo = (estado: string) => {
  if (estado === 'abierto') return 'malo'
  if (estado === 'respondido') return 'alerta'
  if (estado === 'resuelto') return 'ok'
  return 'neutro'
}

const FILTROS = [
  { valor: '', texto: 'Todos' },
  { valor: 'abierto', texto: 'Abiertos' },
  { valor: 'respondido', texto: 'Respondidos' },
  { valor: 'resuelto', texto: 'Resueltos' },
  { valor: 'rechazado', texto: 'Rechazados' },
]

const TIPOS_RECLAMO: Record<string, string> = {
  faltante: 'Producto faltante',
  danado: 'Producto dañado',
  producto_incorrecto: 'Producto incorrecto',
  calidad: 'Problema de calidad',
}

export default function AdminReclamos() {
  const [filtro, setFiltro] = useState('')
  const [datos, setDatos] = useState<ListaReclamos | null>(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState<{ tipo: string; texto: string } | null>(null)
  const [abierto, setAbierto] = useState<Reclamo | null>(null)
  const [form, setForm] = useState({ estado: 'resuelto', resolucion: 'sin_reembolso', monto: '', respuesta: '' })
  const [enviando, setEnviando] = useState(false)

  const cargar = useCallback(() => {
    apiReclamos(filtro)
      .then((d) => {
        setDatos(d)
        setError('')
      })
      .catch((e: Error) => setError(e.message))
  }, [filtro])

  useEffect(() => {
    cargar()
  }, [cargar])

  const abrir = (r: Reclamo) => {
    setAviso(null)
    setForm({ estado: 'resuelto', resolucion: 'sin_reembolso', monto: '', respuesta: '' })
    setAbierto(r)
  }

  const enviar = async () => {
    if (!abierto) return

    if (form.resolucion === 'reembolso_parcial' && (form.monto === '' || Number(form.monto) <= 0)) {
      setAviso({ tipo: 'error', texto: 'Escribe el monto a reembolsar (mayor que cero).' })
      return
    }

    setEnviando(true)
    try {
      const r = await apiResolverReclamo(abierto.id, {
        estado: form.estado,
        resolucion: form.estado === 'respondido' ? undefined : form.resolucion,
        monto_reembolso: form.resolucion === 'reembolso_parcial' ? Number(form.monto) : null,
        respuesta: form.respuesta.trim(),
      })
      setAviso({ tipo: 'ok', texto: r.mensaje })
      setAbierto(null)
      cargar()
    } catch (e) {
      setAviso({ tipo: 'error', texto: (e as Error).message })
    } finally {
      setEnviando(false)
    }
  }

  const puede = datos?.permisos.puede_mutar ?? false

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <header className="pagina-cab">
        <div className="rise">
          <h1>Reclamos y disputas</h1>
          <p>Resuelve faltantes, daños y productos incorrectos con reembolso o sin él.</p>
        </div>
        <div className="admin-cab rise" style={{ ['--i' as string]: 1 }}>
          <label className="campo">
            <span>Estado</span>
            <select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
              {FILTROS.map((f) => (
                <option key={f.valor} value={f.valor}>
                  {f.texto}
                </option>
              ))}
            </select>
          </label>
          <Link to="/admin" className="btn btn--claro btn--mini">
            <Icon name="admin" size={16} /> Panel
          </Link>
        </div>
      </header>

      {aviso && <div className={`aviso aviso--${aviso.tipo}`}>{aviso.texto}</div>}
      {error && <div className="aviso aviso--error">{error}</div>}
      {!puede && datos && <div className="aviso aviso--info">Tu rol es de consulta: puedes leer, no resolver.</div>}

      {datos && Object.keys(datos.conteo).length > 0 && (
        <div className="admin-chips rise">
          {Object.entries(datos.conteo).map(([clave, n]) => (
            <span key={clave} className={`chip chip--${tonoReclamo(clave)}`}>
              {clave}: {n}
            </span>
          ))}
        </div>
      )}

      <section className="card rise" style={{ ['--i' as string]: 2 }}>
        <div className="card__cab">
          <h2>Listado</h2>
          <span className="admin-nota" style={{ marginLeft: 'auto' }}>
            {datos ? `${datos.reclamos.length} reclamo(s)` : 'Cargando…'}
          </span>
        </div>

        {!datos ? (
          <div className="card__cuerpo" style={{ display: 'grid', gap: 10 }}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} h={40} />
            ))}
          </div>
        ) : datos.reclamos.length === 0 ? (
          <Vacio
            titulo="Sin reclamos"
            texto={filtro ? 'No hay reclamos con ese estado.' : 'Nadie ha levantado un reclamo todavía.'}
          />
        ) : (
          <div className="tabla-scroll">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Reclamo</th>
                  <th>Tipo</th>
                  <th>Estado</th>
                  <th>Comercio → Mayorista</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th>Fecha</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {datos.reclamos.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="admin-celda">
                        <code style={{ fontSize: 12.5 }}>{r.uuid.slice(0, 8)}</code>
                        <small title={r.descripcion}>
                          {r.descripcion.length > 44 ? `${r.descripcion.slice(0, 44)}…` : r.descripcion}
                        </small>
                      </div>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{TIPOS_RECLAMO[r.tipo] ?? r.tipo}</td>
                    <td>
                      <span className={`chip chip--${tonoReclamo(r.estado)}`}>{r.estado}</span>
                    </td>
                    <td>
                      <div className="admin-celda">
                        <span>{r.comercio}</span>
                        <small>→ {r.mayorista}</small>
                      </div>
                    </td>
                    <td className="num" style={{ textAlign: 'right' }}>
                      {money(Number(r.pedido_total) || 0)}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fecha(r.created_at)}</td>
                    <td>
                      <button type="button" className="btn btn--claro btn--mini" onClick={() => abrir(r)}>
                        {r.estado === 'abierto' || r.estado === 'respondido' ? 'Resolver' : 'Revisar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {abierto && (
        <div className="dialogo" role="dialog" aria-modal="true" aria-labelledby="titulo-reclamo">
          <button type="button" className="dialogo__velo" aria-label="Cancelar" onClick={() => setAbierto(null)} />
          <div className="dialogo__caja">
            <div className="dialogo__cab">
              <h2 id="titulo-reclamo">Reclamo {abierto.uuid.slice(0, 8)}</h2>
              <button type="button" className="icono-btn dialogo__cerrar" aria-label="Cerrar" onClick={() => setAbierto(null)}>
                <Icon name="cerrar" size={18} />
              </button>
            </div>
            <div className="dialogo__cuerpo">
              <p style={{ fontSize: 13.5, color: 'var(--muted)' }}>
                {TIPOS_RECLAMO[abierto.tipo] ?? abierto.tipo} · {abierto.comercio} → {abierto.mayorista} ·{' '}
                {money(Number(abierto.pedido_total) || 0)}
              </p>
              <div style={{ fontSize: 13, background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 12 }}>
                {abierto.descripcion}
              </div>

              <label className="campo">
                <span>Nuevo estado</span>
                <select
                  value={form.estado}
                  onChange={(e) => setForm({ ...form, estado: e.target.value })}
                  disabled={!puede}
                >
                  <option value="respondido">Respondido (sigue abierto)</option>
                  <option value="resuelto">Resuelto</option>
                  <option value="rechazado">Rechazado</option>
                </select>
              </label>

              {form.estado !== 'respondido' && (
                <label className="campo">
                  <span>Resolución</span>
                  <select
                    value={form.resolucion}
                    onChange={(e) => setForm({ ...form, resolucion: e.target.value })}
                    disabled={!puede}
                  >
                    <option value="sin_reembolso">Sin reembolso</option>
                    <option value="reembolso_parcial">Reembolso parcial</option>
                    <option value="reembolso_total">Reembolso total</option>
                  </select>
                </label>
              )}

              {form.estado !== 'respondido' && form.resolucion === 'reembolso_parcial' && (
                <label className="campo">
                  <span>Monto a reembolsar</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={form.monto}
                    onChange={(e) => setForm({ ...form, monto: e.target.value })}
                    disabled={!puede}
                    placeholder="0.00"
                  />
                </label>
              )}

              <label className="campo">
                <span>Respuesta al comercio (opcional)</span>
                <textarea
                  value={form.respuesta}
                  onChange={(e) => setForm({ ...form, respuesta: e.target.value })}
                  disabled={!puede}
                  placeholder="Explica la decisión…"
                  aria-label="Respuesta"
                />
              </label>
            </div>
            <div className="dialogo__pie">
              <button type="button" className="btn btn--claro" onClick={() => setAbierto(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className={`btn ${form.estado === 'rechazado' ? 'btn--peligro' : ''}`}
                onClick={enviar}
                disabled={!puede || enviando}
              >
                {enviando ? 'Guardando…' : 'Guardar decisión'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
