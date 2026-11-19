import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiHistorialParametro } from '../../lib/api-admin'
import type { HistorialParametro } from '../../lib/api-admin'
import { fecha } from '../../lib/format'
import Icon from '../../components/Icon'
import { Skeleton, Vacio } from '../../components/UI'

export default function AdminParametroHistorial() {
  const { clave = '' } = useParams()
  const [datos, setDatos] = useState<HistorialParametro | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    apiHistorialParametro(clave)
      .then((d) => {
        setDatos(d)
        setError('')
      })
      .catch((e: Error) => setError(e.message))
  }, [clave])

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <header className="pagina-cab">
        <div className="rise">
          <h1>
            Historial: <code style={{ fontSize: '0.8em' }}>{clave}</code>
          </h1>
          <p>Cada guardado crea una versión con quién la hizo, cuándo y desde qué dirección.</p>
        </div>
        <div className="admin-cab rise" style={{ ['--i' as string]: 1 }}>
          <Link to="/admin/parametros" className="btn btn--claro btn--mini">
            ← Parámetros
          </Link>
        </div>
      </header>

      {error && (
        <div style={{ display: 'grid', gap: 14 }}>
          <div className="aviso aviso--error">{error}</div>
          <Link to="/admin/parametros" className="btn btn--claro" style={{ justifySelf: 'start' }}>
            Volver a parámetros
          </Link>
        </div>
      )}

      {!datos && !error && (
        <div style={{ display: 'grid', gap: 12 }}>
          <Skeleton h={90} r={16} />
          <Skeleton h={220} r={16} />
        </div>
      )}

      {datos && (
        <>
          <section className="card rise" style={{ ['--i' as string]: 1 }}>
            <div className="card__cab">
              <h2>Valor actual</h2>
              <span className="chip chip--info" style={{ marginLeft: 'auto' }}>
                v{datos.parametro.version}
              </span>
            </div>
            <div className="card__cuerpo" style={{ display: 'grid', gap: 8 }}>
              <code style={{ fontSize: 15, wordBreak: 'break-all' }}>{datos.parametro.valor_actual}</code>
              <div className="admin-nota">
                {datos.parametro.descripcion || 'Sin descripción'} · tipo {datos.parametro.tipo} · última edición{' '}
                {fecha(datos.parametro.cambiado_at)}
              </div>
            </div>
          </section>

          <section className="card rise" style={{ ['--i' as string]: 2 }}>
            <div className="card__cab">
              <h2>Versiones</h2>
              <span className="admin-nota" style={{ marginLeft: 'auto' }}>
                {datos.historial.length} registro(s)
              </span>
            </div>

            {datos.historial.length === 0 ? (
              <Vacio titulo="Sin historial" texto="Este parámetro todavía no se ha modificado." />
            ) : (
              <div className="tabla-scroll">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Admin</th>
                      <th>Anterior</th>
                      <th>Nuevo</th>
                      <th style={{ textAlign: 'right' }}>Versión</th>
                      <th>IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.historial.map((h) => (
                      <tr key={h.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>{h.cambiado_at.slice(0, 16)}</td>
                        <td>
                          <div className="admin-celda">
                            <span>{h.admin_email}</span>
                            {h.admin_nombre && <small>{h.admin_nombre}</small>}
                          </div>
                        </td>
                        <td style={{ color: 'var(--muted)', wordBreak: 'break-all', maxWidth: 220 }}>
                          <code style={{ fontSize: 12 }}>{h.valor_anterior === null || h.valor_anterior === '' ? '—' : h.valor_anterior}</code>
                        </td>
                        <td style={{ wordBreak: 'break-all', maxWidth: 220 }}>
                          <code style={{ fontSize: 12 }}>{h.valor_nuevo === '' ? '—' : h.valor_nuevo}</code>
                        </td>
                        <td style={{ textAlign: 'right' }} className="num">
                          v{h.version}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>{h.ip || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="admin-acciones">
            <Link to="/admin/parametros" className="btn btn--claro">
              <Icon name="parametros" size={16} /> Todos los parámetros
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
