import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiCambiarEstado, apiGuardarRoles, apiUsuario } from '../../lib/api-admin'
import type { DetalleUsuario } from '../../lib/api-admin'
import { estado as estadoPedido, fecha, money } from '../../lib/format'
import Icon from '../../components/Icon'
import { Skeleton, Vacio } from '../../components/UI'

const tonoKyc = (valor: string) => {
  if (valor === 'aprobado') return 'ok'
  if (valor === 'rechazado' || valor === 'vencido') return 'malo'
  if (valor === 'pendiente' || valor === 'en_revision') return 'alerta'
  return 'neutro'
}

export default function AdminUsuarioDetalle() {
  const { id = '' } = useParams()
  const [datos, setDatos] = useState<DetalleUsuario | null>(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState<{ tipo: string; texto: string } | null>(null)
  const [roles, setRoles] = useState<string[]>([])
  const [guardandoRoles, setGuardandoRoles] = useState(false)
  const [confirmarEstado, setConfirmarEstado] = useState(false)
  const [cambiandoEstado, setCambiandoEstado] = useState(false)

  const cargar = useCallback(() => {
    apiUsuario(id)
      .then((d) => {
        setDatos(d)
        setRoles(d.usuario.roles)
        setError('')
      })
      .catch((e: Error) => setError(e.message))
  }, [id])

  useEffect(() => {
    cargar()
  }, [cargar])

  if (error) {
    return (
      <div style={{ display: 'grid', gap: 14 }}>
        <div className="aviso aviso--error">{error}</div>
        <Link to="/admin/usuarios" className="btn btn--claro" style={{ justifySelf: 'start' }}>
          ← Volver a usuarios
        </Link>
      </div>
    )
  }

  if (!datos) {
    return (
      <div style={{ display: 'grid', gap: 14 }}>
        <Skeleton h={44} w={280} />
        <Skeleton h={160} r={16} />
        <Skeleton h={220} r={16} />
      </div>
    )
  }

  const u = datos.usuario
  const activo = u.estado === 'activo'
  const puede = datos.permisos.puede_mutar
  const cambiosRoles = [...roles].sort().join('|') !== [...u.roles].sort().join('|')

  const alternarRol = (rol: string) => {
    setRoles((prev) => (prev.includes(rol) ? prev.filter((r) => r !== rol) : [...prev, rol]))
  }

  const guardarRoles = async () => {
    if (roles.length === 0) {
      setAviso({ tipo: 'error', texto: 'El usuario necesita al menos un rol.' })
      return
    }
    setGuardandoRoles(true)
    try {
      const r = await apiGuardarRoles(u.id, roles)
      setAviso({ tipo: 'ok', texto: r.mensaje })
      cargar()
    } catch (e) {
      setAviso({ tipo: 'error', texto: (e as Error).message })
    } finally {
      setGuardandoRoles(false)
    }
  }

  const cambiarEstado = async () => {
    setCambiandoEstado(true)
    try {
      const r = await apiCambiarEstado(u.id, !activo)
      setAviso({ tipo: 'ok', texto: r.mensaje })
      setConfirmarEstado(false)
      cargar()
    } catch (e) {
      setAviso({ tipo: 'error', texto: (e as Error).message })
      setConfirmarEstado(false)
    } finally {
      setCambiandoEstado(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <header className="pagina-cab">
        <div className="rise">
          <h1>{u.nombre || `Usuario #${u.id}`}</h1>
          <p>
            {u.email} · alta {fecha(u.created_at)}
          </p>
        </div>
        <div className="admin-cab rise" style={{ ['--i' as string]: 1 }}>
          <Link to="/admin/usuarios" className="btn btn--claro btn--mini">
            ← Usuarios
          </Link>
        </div>
      </header>

      {aviso && <div className={`aviso aviso--${aviso.tipo}`}>{aviso.texto}</div>}

      <div className="admin-doble rise" style={{ ['--i' as string]: 1 }}>
        <section className="card">
          <div className="card__cab">
            <h2>Ficha</h2>
            <span className={`chip chip--${activo ? 'ok' : 'malo'}`} style={{ marginLeft: 'auto' }}>
              {u.estado}
            </span>
          </div>
          <div className="card__cuerpo" style={{ display: 'grid', gap: 10 }}>
            <div className="admin-chips">
              {u.roles.length === 0 ? (
                <span className="chip chip--neutro">sin rol</span>
              ) : (
                u.roles.map((r) => (
                  <span key={r} className="chip chip--info">
                    {r}
                  </span>
                ))
              )}
            </div>
            <dl className="cifras" style={{ margin: 0 }}>
              <div>
                <dt>Identificador</dt>
                <dd>#{u.id}</dd>
              </div>
              <div>
                <dt>Correo</dt>
                <dd>{u.email}</dd>
              </div>
              <div>
                <dt>Teléfono</dt>
                <dd>{u.telefono || '—'}</dd>
              </div>
              <div>
                <dt>Correo verificado</dt>
                <dd>{u.email_verificado_at ? fecha(u.email_verificado_at) : 'no'}</dd>
              </div>
              <div>
                <dt>Teléfono verificado</dt>
                <dd>{u.telefono_verificado_at ? fecha(u.telefono_verificado_at) : 'no'}</dd>
              </div>
              <div>
                <dt>Último acceso</dt>
                <dd>{u.ultimo_login_at ? fecha(u.ultimo_login_at) : 'nunca'}</dd>
              </div>
              <div>
                <dt>Última actualización</dt>
                <dd>{fecha(u.updated_at)}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="card">
          <div className="card__cab">
            <h2>Roles</h2>
          </div>
          <div className="card__cuerpo" style={{ display: 'grid', gap: 12 }}>
            {!puede && <div className="aviso aviso--info">Tu rol es de consulta: no puedes cambiar roles.</div>}
            <div className="admin-checks">
              {datos.roles_disponibles.map((rol) => (
                <label key={rol} className="admin-check">
                  <input
                    type="checkbox"
                    checked={roles.includes(rol)}
                    onChange={() => alternarRol(rol)}
                    disabled={!puede}
                  />
                  <span>{rol}</span>
                </label>
              ))}
            </div>
            <div className="admin-fila-acciones">
              <button
                type="button"
                className="btn"
                onClick={guardarRoles}
                disabled={!puede || !cambiosRoles || guardandoRoles}
              >
                <Icon name="ok" size={17} /> {guardandoRoles ? 'Guardando…' : 'Guardar roles'}
              </button>
              {cambiosRoles && (
                <button type="button" className="btn btn--claro" onClick={() => setRoles(u.roles)} disabled={guardandoRoles}>
                  Descartar
                </button>
              )}
            </div>
            <hr style={{ border: 0, borderTop: '1px solid var(--line-soft)' }} />
            <button
              type="button"
              className={`btn ${activo ? 'btn--peligro' : 'btn--claro'}`}
              onClick={() => setConfirmarEstado(true)}
              disabled={!puede}
            >
              {activo ? 'Suspender cuenta' : 'Reactivar cuenta'}
            </button>
          </div>
        </section>
      </div>

      <section className="card rise" style={{ ['--i' as string]: 2 }}>
        <div className="card__cab">
          <h2>Perfiles</h2>
        </div>
        <div className="card__cuerpo admin-rejilla">
          {datos.perfiles.comercio ? (
            <div>
              <strong>Comercio</strong>
              <div className="admin-nota">
                {datos.perfiles.comercio.nombre_negocio} · giro {datos.perfiles.comercio.giro || '—'}
              </div>
              <div className="admin-nota">
                Gasto del mes: {money(Number(datos.perfiles.comercio.gasto_mes_actual) || 0)}
              </div>
            </div>
          ) : null}
          {datos.perfiles.mayorista ? (
            <div>
              <strong>Mayorista</strong>
              <div className="admin-nota">
                {datos.perfiles.mayorista.nombre_comercial} · {datos.perfiles.mayorista.categoria_giro || 'sin giro'}
              </div>
              <div className="admin-chips" style={{ marginTop: 6 }}>
                <span className={`chip chip--${tonoKyc(datos.perfiles.mayorista.estado_kyc)}`}>
                  KYC {datos.perfiles.mayorista.estado_kyc}
                </span>
                <span className={`chip chip--${datos.perfiles.mayorista.activo ? 'ok' : 'neutro'}`}>
                  {datos.perfiles.mayorista.activo ? 'publica' : 'no publica'}
                </span>
              </div>
              <div className="admin-nota" style={{ marginTop: 6 }}>
                Compra mínima {money(Number(datos.perfiles.mayorista.monto_minimo) || 0)}
              </div>
            </div>
          ) : null}
          {datos.perfiles.repartidor ? (
            <div>
              <strong>Repartidor</strong>
              <div className="admin-nota">
                {datos.perfiles.repartidor.disponible ? 'Disponible' : 'No disponible'} · calificación{' '}
                {datos.perfiles.repartidor.calificacion_promedio ?? '—'}
              </div>
              <div className="admin-chips" style={{ marginTop: 6 }}>
                <span className={`chip chip--${tonoKyc(datos.perfiles.repartidor.estado_kyc)}`}>
                  KYC {datos.perfiles.repartidor.estado_kyc}
                </span>
              </div>
            </div>
          ) : null}
          {!datos.perfiles.comercio && !datos.perfiles.mayorista && !datos.perfiles.repartidor && (
            <span className="admin-nota">Esta cuenta todavía no tiene perfil de negocio.</span>
          )}
        </div>
      </section>

      <div className="admin-doble rise" style={{ ['--i' as string]: 3 }}>
        <section className="card">
          <div className="card__cab">
            <h2>Pedidos recientes</h2>
          </div>
          {datos.pedidos.length === 0 ? (
            <Vacio titulo="Sin pedidos" texto="Esta cuenta no ha comprado ni recibido pedidos." />
          ) : (
            <div className="tabla-scroll">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Pedido</th>
                    <th>Estado</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.pedidos.map((p) => {
                    const e = estadoPedido(p.estado)
                    return (
                      <tr key={p.uuid}>
                        <td>
                          <Link to={`/pedidos/${p.uuid}`} style={{ color: 'inherit' }}>
                            <code style={{ fontSize: 12.5 }}>{p.uuid.slice(0, 8)}</code>
                          </Link>
                        </td>
                        <td>
                          <span className={`chip chip--${e.tono}`}>{e.texto}</span>
                        </td>
                        <td className="num" style={{ textAlign: 'right' }}>
                          {money(Number(p.total) || 0)}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>{fecha(p.created_at)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card">
          <div className="card__cab">
            <h2>Documentos KYC</h2>
          </div>
          {datos.documentos.length === 0 ? (
            <div className="card__cuerpo admin-nota">Sin documentos cargados.</div>
          ) : (
            <div className="card__cuerpo" style={{ display: 'grid', gap: 8 }}>
              {datos.documentos.map((d) => (
                <div key={d.id} className="kyc-doc">
                  <span className="kyc-doc__info">
                    <strong style={{ fontSize: 13 }}>{d.tipo.replace(/_/g, ' ')}</strong>
                    <small>
                      {fecha(d.created_at)} · {(d.tamano_bytes / 1024).toFixed(0)} KB
                    </small>
                  </span>
                  <span className={`chip chip--${tonoKyc(d.estado)}`}>{d.estado}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="card rise" style={{ ['--i' as string]: 4 }}>
        <div className="card__cab">
          <h2>Auditoría reciente</h2>
        </div>
        {datos.auditoria.length === 0 ? (
          <div className="card__cuerpo admin-nota">Sin movimientos registrados.</div>
        ) : (
          <div className="tabla-scroll">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Cuándo</th>
                  <th>Acción</th>
                  <th>Entidad</th>
                  <th>Detalle</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {datos.auditoria.map((a, i) => (
                  <tr key={`${a.created_at}-${i}`}>
                    <td style={{ whiteSpace: 'nowrap' }}>{a.created_at.slice(0, 16)}</td>
                    <td>
                      <code style={{ fontSize: 12.5 }}>{a.accion}</code>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {a.entidad ?? '—'}
                      {a.entidad_id ? <span className="admin-sub"> #{a.entidad_id}</span> : null}
                    </td>
                    <td style={{ color: 'var(--muted)' }}>{a.descripcion || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{a.ip || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {confirmarEstado && (
        <div className="dialogo" role="dialog" aria-modal="true" aria-labelledby="titulo-estado">
          <button type="button" className="dialogo__velo" aria-label="Cancelar" onClick={() => setConfirmarEstado(false)} />
          <div className="dialogo__caja">
            <div className="dialogo__cab">
              <h2 id="titulo-estado">{activo ? 'Suspender cuenta' : 'Reactivar cuenta'}</h2>
              <button
                type="button"
                className="icono-btn dialogo__cerrar"
                aria-label="Cerrar"
                onClick={() => setConfirmarEstado(false)}
              >
                <Icon name="cerrar" size={18} />
              </button>
            </div>
            <div className="dialogo__cuerpo">
              <p style={{ fontSize: 13.5, color: 'var(--muted)' }}>
                {activo
                  ? `${u.email} no podrá iniciar sesión ni operar mientras la cuenta esté suspendida. Podrás reactivarla después.`
                  : `${u.email} podrá iniciar sesión y operar de nuevo como ${u.roles.join(', ') || 'usuario'}.`}
              </p>
            </div>
            <div className="dialogo__pie">
              <button type="button" className="btn btn--claro" onClick={() => setConfirmarEstado(false)}>
                Cancelar
              </button>
              <button
                type="button"
                className={`btn ${activo ? 'btn--peligro' : ''}`}
                onClick={cambiarEstado}
                disabled={cambiandoEstado}
              >
                {cambiandoEstado ? 'Aplicando…' : activo ? 'Sí, suspender' : 'Sí, reactivar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
