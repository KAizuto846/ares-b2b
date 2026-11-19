import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiGuardarParametro, apiParametros } from '../../lib/api-admin'
import type { ListaParametros } from '../../lib/api-admin'
import { fecha } from '../../lib/format'
import Icon from '../../components/Icon'
import { Skeleton, Vacio } from '../../components/UI'

const TONO_TIPO: Record<string, string> = { int: 'info', float: 'info', bool: 'alerta', json: 'neutro', string: 'neutro' }

export default function AdminParametros() {
  const [datos, setDatos] = useState<ListaParametros | null>(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState<{ tipo: string; texto: string } | null>(null)
  const [valores, setValores] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')

  const cargar = useCallback(() => {
    apiParametros()
      .then((d) => {
        setDatos(d)
        setValores(Object.fromEntries(d.parametros.map((p) => [p.clave, p.valor_actual])))
        setError('')
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const guardar = async (clave: string) => {
    setGuardando(clave)
    setAviso(null)
    try {
      const r = await apiGuardarParametro(clave, valores[clave] ?? '')
      setAviso({ tipo: 'ok', texto: r.mensaje })
      if (!r.sin_cambios) cargar()
    } catch (e) {
      setAviso({ tipo: 'error', texto: (e as Error).message })
    } finally {
      setGuardando(null)
    }
  }

  const lista = useMemo(() => {
    if (!datos) return []
    const t = busqueda.trim().toLowerCase()
    if (t === '') return datos.parametros
    return datos.parametros.filter(
      (p) => p.clave.toLowerCase().includes(t) || (p.descripcion ?? '').toLowerCase().includes(t)
    )
  }, [datos, busqueda])

  const puede = datos?.permisos.puede_mutar ?? false

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <header className="pagina-cab">
        <div className="rise">
          <h1>Parámetros del sistema</h1>
          <p>Los cambios se guardan con versionado automático y registro de quién y desde dónde los modificó.</p>
        </div>
        <div className="admin-cab rise" style={{ ['--i' as string]: 1 }}>
          <Link to="/admin" className="btn btn--claro btn--mini">
            <Icon name="admin" size={16} /> Panel
          </Link>
        </div>
      </header>

      {aviso && <div className={`aviso aviso--${aviso.tipo}`}>{aviso.texto}</div>}
      {error && <div className="aviso aviso--error">{error}</div>}
      {!puede && datos && <div className="aviso aviso--info">Tu rol es de consulta: los valores no se pueden editar.</div>}

      <div className="admin-filtros rise" style={{ ['--i' as string]: 1 }}>
        <label className="campo campo--busqueda">
          <span>Filtrar</span>
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Clave o descripción…"
            aria-label="Filtrar parámetros"
          />
        </label>
        <span className="admin-nota">{lista.length} parámetro(s)</span>
      </div>

      <section className="card rise" style={{ ['--i' as string]: 2 }}>
        {!datos ? (
          <div className="card__cuerpo" style={{ display: 'grid', gap: 10 }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} h={40} />
            ))}
          </div>
        ) : lista.length === 0 ? (
          <Vacio titulo="Sin parámetros" texto="No hay claves que coincidan con el filtro." />
        ) : (
          <div className="tabla-scroll">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Clave</th>
                  <th>Valor</th>
                  <th>Tipo</th>
                  <th>Descripción</th>
                  <th style={{ textAlign: 'right' }}>Versión</th>
                  <th>Cambiado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lista.map((p) => {
                  const valor = valores[p.clave] ?? ''
                  const sucio = valor !== p.valor_actual
                  return (
                    <tr key={p.clave}>
                      <td>
                        <code className="param-clave">{p.clave}</code>
                      </td>
                      <td>
                        <div className="param-valor">
                          <input
                            type="text"
                            value={valor}
                            onChange={(e) => setValores({ ...valores, [p.clave]: e.target.value })}
                            disabled={!puede}
                            aria-label={`Valor de ${p.clave}`}
                          />
                        </div>
                      </td>
                      <td>
                        <span className={`chip chip--${TONO_TIPO[p.tipo] ?? 'neutro'}`}>{p.tipo}</span>
                      </td>
                      <td style={{ color: 'var(--muted)', minWidth: 180 }}>{p.descripcion || '—'}</td>
                      <td style={{ textAlign: 'right' }} className="num">
                        v{p.version}
                      </td>
                      <td>
                        <div className="admin-celda">
                          <small style={{ whiteSpace: 'nowrap' }}>{fecha(p.cambiado_at)}</small>
                          <small>{p.cambiado_por_email || 'sin registro'}</small>
                        </div>
                      </td>
                      <td>
                        <div className="admin-fila-acciones">
                          <button
                            type="button"
                            className="btn btn--mini"
                            onClick={() => guardar(p.clave)}
                            disabled={!puede || !sucio || guardando === p.clave}
                          >
                            {guardando === p.clave ? 'Guardando…' : 'Guardar'}
                          </button>
                          <Link to={`/admin/parametros/${encodeURIComponent(p.clave)}/historial`} className="btn btn--claro btn--mini">
                            Historial
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
