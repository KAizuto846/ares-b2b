import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { apiUsuarios } from '../../lib/api-admin'
import type { ListaUsuarios } from '../../lib/api-admin'
import { fecha } from '../../lib/format'
import Icon from '../../components/Icon'
import { Skeleton, Vacio } from '../../components/UI'

const ROLES = ['comercio', 'mayorista', 'repartidor', 'admin_total', 'admin_kyc', 'admin_soporte', 'admin_finanzas']

const tonoKyc = (estado: string) => {
  if (estado === 'aprobado') return 'ok'
  if (estado === 'rechazado') return 'malo'
  if (estado === 'pendiente' || estado === 'en_revision') return 'alerta'
  return 'neutro'
}

export default function AdminUsuarios() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const rol = params.get('rol') ?? ''
  const estadoFiltro = params.get('estado') ?? ''
  const page = Number(params.get('page') ?? '1') || 1

  const [busqueda, setBusqueda] = useState(q)
  const [datos, setDatos] = useState<ListaUsuarios | null>(null)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    setBusqueda(q)
  }, [q])

  useEffect(() => {
    let vivo = true
    setCargando(true)
    apiUsuarios({ q, rol, estado: estadoFiltro, page })
      .then((d) => {
        if (!vivo) return
        setDatos(d)
        setError('')
      })
      .catch((e: Error) => vivo && setError(e.message))
      .finally(() => vivo && setCargando(false))

    return () => {
      vivo = false
    }
  }, [q, rol, estadoFiltro, page])

  const aplicar = (cambios: Record<string, string>) => {
    const p = new URLSearchParams(params)
    for (const [clave, valor] of Object.entries(cambios)) {
      if (valor) p.set(clave, valor)
      else p.delete(clave)
    }
    if (!('page' in cambios)) p.delete('page')
    setParams(p, { replace: true })
  }

  const buscar = (e: FormEvent) => {
    e.preventDefault()
    aplicar({ q: busqueda.trim() })
  }

  const rolesDisponibles = datos?.roles_disponibles?.length ? datos.roles_disponibles : ROLES
  const filtrosActivos = Boolean(q || rol || estadoFiltro)

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <header className="pagina-cab">
        <div className="rise">
          <h1>Usuarios</h1>
          <p>Busca cuentas, revisa sus roles y su estado de verificación.</p>
        </div>
        <div className="admin-cab rise" style={{ ['--i' as string]: 1 }}>
          <Link to="/admin" className="btn btn--claro btn--mini">
            <Icon name="admin" size={16} /> Panel
          </Link>
        </div>
      </header>

      <form className="card rise" style={{ ['--i' as string]: 1 }} onSubmit={buscar}>
        <div className="card__cuerpo admin-filtros">
          <label className="campo campo--busqueda">
            <span>Buscar</span>
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Nombre o correo…"
              aria-label="Buscar usuarios por nombre o correo"
            />
          </label>

          <label className="campo">
            <span>Rol</span>
            <select value={rol} onChange={(e) => aplicar({ rol: e.target.value })}>
              <option value="">Todos</option>
              {rolesDisponibles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>

          <label className="campo">
            <span>Estado</span>
            <select value={estadoFiltro} onChange={(e) => aplicar({ estado: e.target.value })}>
              <option value="">Todos</option>
              <option value="activo">Activo</option>
              <option value="suspendido">Suspendido</option>
              <option value="pendiente">Pendiente</option>
              <option value="baneado">Baneado</option>
            </select>
          </label>

          <button type="submit" className="btn">
            <Icon name="buscar" size={17} /> Buscar
          </button>

          {filtrosActivos && (
            <button
              type="button"
              className="btn btn--claro"
              onClick={() => {
                setBusqueda('')
                setParams(new URLSearchParams(), { replace: true })
              }}
            >
              Limpiar
            </button>
          )}
        </div>
      </form>

      {error && <div className="aviso aviso--error">{error}</div>}

      <section className="card rise" style={{ ['--i' as string]: 2 }}>
        <div className="card__cab">
          <h2>Listado</h2>
          <span className="admin-nota" style={{ marginLeft: 'auto' }}>
            {datos ? `${datos.total} cuenta${datos.total === 1 ? '' : 's'}` : 'Cargando…'}
          </span>
        </div>

        {cargando && !datos ? (
          <div className="card__cuerpo" style={{ display: 'grid', gap: 10 }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} h={38} />
            ))}
          </div>
        ) : !datos || datos.usuarios.length === 0 ? (
          <Vacio
            titulo="Sin usuarios que coincidan"
            texto={filtrosActivos ? 'Prueba con otro término o quita los filtros.' : 'Todavía no hay cuentas registradas.'}
          />
        ) : (
          <>
            <div className="tabla-scroll">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Cuenta</th>
                    <th>Roles</th>
                    <th>Estado</th>
                    <th>KYC</th>
                    <th>Alta</th>
                    <th>Último acceso</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {datos.usuarios.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div className="admin-celda">
                          <Link to={`/admin/usuarios/${u.id}`} style={{ fontWeight: 650, color: 'inherit' }}>
                            {u.nombre || `Usuario #${u.id}`}
                          </Link>
                          <small>{u.email}</small>
                        </div>
                      </td>
                      <td>
                        <div className="admin-chips">
                          {u.roles.length === 0 ? (
                            <span className="chip chip--neutro">sin rol</span>
                          ) : (
                            u.roles.map((r) => (
                              <span key={r} className="chip chip--neutro">
                                {r}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td>
                        <span className={`chip chip--${u.estado === 'activo' ? 'ok' : 'malo'}`}>{u.estado}</span>
                      </td>
                      <td>
                        <span className={`chip chip--${tonoKyc(u.kyc)}`}>{u.kyc.replace(/_/g, ' ')}</span>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{fecha(u.created_at)}</td>
                      <td style={{ whiteSpace: 'nowrap', color: 'var(--muted)' }}>
                        {u.ultimo_login_at ? fecha(u.ultimo_login_at) : 'nunca'}
                      </td>
                      <td>
                        <Link to={`/admin/usuarios/${u.id}`} className="btn btn--claro btn--mini">
                          Ver
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="admin-paginacion">
              <span>
                Página {datos.page} de {datos.paginas}
              </span>
              <button
                type="button"
                className="btn btn--claro btn--mini"
                disabled={datos.page <= 1}
                onClick={() => aplicar({ page: String(datos.page - 1) })}
              >
                Anterior
              </button>
              <button
                type="button"
                className="btn btn--claro btn--mini"
                disabled={datos.page >= datos.paginas}
                onClick={() => aplicar({ page: String(datos.page + 1) })}
              >
                Siguiente
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
