import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiDecidirKyc, apiKyc } from '../../lib/api-admin'
import type { ColaKyc } from '../../lib/api-admin'
import { fecha } from '../../lib/format'
import Icon from '../../components/Icon'
import DocPreview from '../../components/DocPreview'
import { Skeleton, Vacio } from '../../components/UI'

const tonoKyc = (valor: string) => {
  if (valor === 'aprobado') return 'ok'
  if (valor === 'rechazado' || valor === 'vencido') return 'malo'
  if (valor === 'pendiente' || valor === 'en_revision') return 'alerta'
  return 'neutro'
}

const FILTROS = [
  { valor: 'pendiente', texto: 'Pendientes' },
  { valor: 'aprobado', texto: 'Aprobados' },
  { valor: 'rechazado', texto: 'Rechazados' },
  { valor: 'vencido', texto: 'Vencidos' },
  { valor: 'todos', texto: 'Todos' },
]

type Dialogo = { documento: number; decision: 'aprobar' | 'rechazar'; usuario: string; tipo: string }

export default function AdminKyc() {
  const [filtro, setFiltro] = useState('pendiente')
  const [datos, setDatos] = useState<ColaKyc | null>(null)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState<{ tipo: string; texto: string } | null>(null)
  const [dialogo, setDialogo] = useState<Dialogo | null>(null)
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)

  const cargar = useCallback(() => {
    apiKyc(filtro)
      .then((d) => {
        setDatos(d)
        setError('')
      })
      .catch((e: Error) => setError(e.message))
  }, [filtro])

  useEffect(() => {
    cargar()
  }, [cargar])

  const abrir = (documento: number, decision: 'aprobar' | 'rechazar', usuario: string, tipo: string) => {
    setMotivo('')
    setDialogo({ documento, decision, usuario, tipo })
  }

  const confirmar = async () => {
    if (!dialogo) return
    if (dialogo.decision === 'rechazar' && motivo.trim() === '') {
      setAviso({ tipo: 'error', texto: 'Escribe el motivo del rechazo: el usuario lo verá.' })
      return
    }
    setEnviando(true)
    try {
      const r = await apiDecidirKyc(dialogo.documento, dialogo.decision, motivo.trim())
      setAviso({ tipo: 'ok', texto: r.mensaje })
      setDialogo(null)
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
          <h1>Cola de verificación</h1>
          <p>Documentos esperando revisión, del más antiguo al más reciente.</p>
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
      {!puede && <div className="aviso aviso--info">Tu rol es de consulta: puedes revisar, no decidir.</div>}

      {!datos ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <Skeleton h={140} r={16} />
          <Skeleton h={140} r={16} />
        </div>
      ) : (
        <>
          {datos.usuarios.length === 0 ? (
            <section className="card">
              <Vacio
                titulo={filtro === 'pendiente' ? 'Nada por revisar' : 'Sin documentos en este estado'}
                texto={
                  filtro === 'pendiente'
                    ? 'Cuando alguien suba un documento aparecerá aquí.'
                    : 'Prueba con otro filtro para ver el historial.'
                }
              />
            </section>
          ) : (
            datos.usuarios.map((u) => (
              <section className="card rise" key={u.usuario_id}>
                <div className="card__cab">
                  <div className="admin-celda">
                    <strong>
                      <Link to={`/admin/usuarios/${u.usuario_id}`} style={{ color: 'inherit' }}>
                        {u.nombre || `Usuario #${u.usuario_id}`}
                      </Link>
                    </strong>
                    <small>
                      {u.email}
                      {u.negocio ? ` · ${u.negocio}` : ''}
                    </small>
                  </div>
                  <span className={`chip chip--${tonoKyc(u.estado_perfil)}`} style={{ marginLeft: 'auto' }}>
                    perfil {u.estado_perfil.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="card__cuerpo kyc-tarjeta">
                  {u.documentos.map((d) => (
                    <div className="kyc-doc" key={d.id}>
                      <span className="kyc-doc__info">
                        <strong style={{ fontSize: 13.5 }}>{d.tipo.replace(/_/g, ' ')}</strong>
                        <small>
                          Recibido {fecha(d.created_at)} · {(d.tamano_bytes / 1024).toFixed(0)} KB · {d.mime || 'sin tipo'}
                        </small>
                        {d.motivo_rechazo && <small style={{ color: 'var(--rojo)' }}>Motivo: {d.motivo_rechazo}</small>}
                      </span>
                      <span className={`chip chip--${tonoKyc(d.estado)}`}>{d.estado}</span>
                      <DocPreview id={d.id} mime={d.mime} tipo={d.tipo.replace(/_/g, ' ')} />
                      {d.estado === 'pendiente' && puede && (
                        <span className="kyc-doc__acciones">
                          <button
                            type="button"
                            className="btn btn--mini"
                            onClick={() => abrir(d.id, 'aprobar', u.email, d.tipo)}
                          >
                            <Icon name="ok" size={16} /> Aprobar
                          </button>
                          <button
                            type="button"
                            className="btn btn--claro btn--mini"
                            style={{ color: 'var(--rojo)' }}
                            onClick={() => abrir(d.id, 'rechazar', u.email, d.tipo)}
                          >
                            <Icon name="x" size={16} /> Rechazar
                          </button>
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))
          )}

          {datos.perfiles_pendientes.length > 0 && (
            <section className="card rise">
              <div className="card__cab">
                <h2>Perfiles sin documentos aprobados</h2>
                <span className="admin-nota" style={{ marginLeft: 'auto' }}>
                  {datos.perfiles_pendientes.length} cuenta(s)
                </span>
              </div>
              <div className="tabla-scroll">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Cuenta</th>
                      <th>Negocio</th>
                      <th>Tipo</th>
                      <th>Estado</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {datos.perfiles_pendientes.map((p) => (
                      <tr key={`${p.tipo_perfil}-${p.usuario_id}`}>
                        <td>
                          <div className="admin-celda">
                            <strong>{p.nombre || p.email}</strong>
                            <small>{p.email}</small>
                          </div>
                        </td>
                        <td>{p.negocio}</td>
                        <td>{p.tipo_perfil}</td>
                        <td>
                          <span className={`chip chip--${tonoKyc(p.estado_kyc)}`}>{p.estado_kyc.replace(/_/g, ' ')}</span>
                        </td>
                        <td>
                          <Link to={`/admin/usuarios/${p.usuario_id}`} className="btn btn--claro btn--mini">
                            Ver cuenta
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      {dialogo && (
        <div className="dialogo" role="dialog" aria-modal="true" aria-labelledby="titulo-kyc">
          <button type="button" className="dialogo__velo" aria-label="Cancelar" onClick={() => setDialogo(null)} />
          <div className="dialogo__caja">
            <div className="dialogo__cab">
              <h2 id="titulo-kyc">{dialogo.decision === 'aprobar' ? 'Aprobar documento' : 'Rechazar documento'}</h2>
              <button type="button" className="icono-btn dialogo__cerrar" aria-label="Cerrar" onClick={() => setDialogo(null)}>
                <Icon name="cerrar" size={18} />
              </button>
            </div>
            <div className="dialogo__cuerpo">
              <p style={{ fontSize: 13.5, color: 'var(--muted)' }}>
                {dialogo.tipo.replace(/_/g, ' ')} de <strong>{dialogo.usuario}</strong>.{' '}
                {dialogo.decision === 'aprobar'
                  ? 'Se marcará su perfil como aprobado y podrá publicar.'
                  : 'El motivo se guardará en el expediente y el usuario lo verá.'}
              </p>
              {dialogo.decision === 'rechazar' && (
                <label className="campo">
                  <span>Motivo del rechazo</span>
                  <textarea
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder="Documento ilegible, datos no coinciden…"
                    aria-label="Motivo del rechazo"
                  />
                </label>
              )}
            </div>
            <div className="dialogo__pie">
              <button type="button" className="btn btn--claro" onClick={() => setDialogo(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className={`btn ${dialogo.decision === 'rechazar' ? 'btn--peligro' : ''}`}
                onClick={confirmar}
                disabled={enviando}
              >
                {enviando ? 'Guardando…' : dialogo.decision === 'aprobar' ? 'Aprobar' : 'Rechazar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
