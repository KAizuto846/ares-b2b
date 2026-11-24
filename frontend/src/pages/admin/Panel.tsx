import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiPanel } from '../../lib/api-admin'
import type { Panel as Datos } from '../../lib/api-admin'
import { relativo } from '../../lib/format'
import Icon from '../../components/Icon'
import { Skeleton, Vacio } from '../../components/UI'

export default function AdminPanel() {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    apiPanel()
      .then(setDatos)
      .catch((e: Error) => setError(e.message))
  }, [])

  if (error) return <div className="aviso aviso--error">{error}</div>

  if (!datos) {
    return (
      <div style={{ display: 'grid', gap: 16 }}>
        <div className="kpis">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} h={78} />
          ))}
        </div>
        <Skeleton h={220} r={16} />
      </div>
    )
  }

  const c = datos.contadores
  const kycTotal = c.kyc_documentos + c.kyc_perfiles

  const tarjetas = [
    { valor: c.usuarios, etiqueta: 'Usuarios', nota: 'Ver todos', href: '/admin/usuarios', alerta: false },
    { valor: c.comercios, etiqueta: 'Comercios', nota: 'Ver lista', href: '/admin/usuarios?rol=comercio', alerta: false },
    { valor: c.mayoristas, etiqueta: 'Mayoristas', nota: 'Ver lista', href: '/admin/usuarios?rol=mayorista', alerta: false },
    { valor: c.pedidos_hoy, etiqueta: 'Pedidos hoy', nota: `${c.pedidos_activos} en curso`, href: '/pedidos', alerta: false },
    {
      valor: kycTotal,
      etiqueta: 'KYC pendientes',
      nota: kycTotal > 0 ? 'Requieren revisión' : 'Al día',
      href: '/admin/kyc',
      alerta: kycTotal > 0,
    },
    {
      valor: c.reclamos_abiertos,
      etiqueta: 'Reclamos abiertos',
      nota: c.reclamos_abiertos > 0 ? 'Sin resolver' : 'Al día',
      href: '/admin/reclamos',
      alerta: c.reclamos_abiertos > 0,
    },
    {
      valor: c.envios_sin_repartidor,
      etiqueta: 'Envíos sin repartidor',
      nota: c.envios_sin_repartidor > 0 ? 'Por asignar' : 'Ninguno',
      href: '/pedidos',
      alerta: c.envios_sin_repartidor > 0,
    },
  ]

  const flota = c.flota
    ? [
        { valor: c.flota.repartidores_en_linea, etiqueta: 'Repartidores en línea', nota: 'Disponibles ahora' },
        { valor: c.flota.viajes_activos, etiqueta: 'Rutas activas', nota: `${c.flota.paradas_pendientes} parada(s) pendiente(s)` },
        { valor: c.flota.rescatados_hoy, etiqueta: 'Rescates hoy', nota: 'Vía red externa' },
      ]
    : []

  const accesos = [
    { href: '/admin/usuarios', texto: 'Usuarios', icono: 'usuarios' },
    { href: '/admin/kyc', texto: 'Verificaciones', icono: 'kyc' },
    { href: '/admin/reclamos', texto: 'Reclamos', icono: 'reclamos' },
    { href: '/admin/parametros', texto: 'Parámetros', icono: 'parametros' },
    { href: '/admin/postmvp', texto: 'Post-MVP', icono: 'grafica' },
  ]

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <header className="pagina-cab">
        <div className="rise">
          <h1>Panel de administración</h1>
          <p>Resumen de la operación y lo que necesita una decisión hoy.</p>
        </div>
        <div className="admin-cab rise" style={{ ['--i' as string]: 1 }}>
          <span className="chip chip--info">{datos.permisos.rol}</span>
          {!datos.permisos.puede_mutar && <span className="chip chip--neutro">Solo consulta</span>}
        </div>
      </header>

      <div className="kpis rise" style={{ ['--i' as string]: 1 }}>
        {tarjetas.map((t) => (
          <Link key={t.etiqueta} to={t.href} className={`kpi ${t.alerta ? 'kpi--alerta' : ''}`}>
            <span className="kpi__valor">{t.valor}</span>
            <span className="kpi__etiqueta">{t.etiqueta}</span>
            <span className="kpi__nota">{t.nota}</span>
          </Link>
        ))}
      </div>

      {flota.length > 0 && (
        <section className="card card--plana rise" style={{ ['--i' as string]: 1 }}>
          <div className="card__cab">
            <h2>Flota de reparto</h2>
            <span className="chip chip--neutro" style={{ marginLeft: 'auto' }}>Hoy</span>
          </div>
          <div className="kpis card__cuerpo" style={{ padding: '14px 16px' }}>
            {flota.map((t) => (
              <div key={t.etiqueta} className="kpi">
                <span className="kpi__valor">{t.valor}</span>
                <span className="kpi__etiqueta">{t.etiqueta}</span>
                <span className="kpi__nota">{t.nota}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="admin-doble rise" style={{ ['--i' as string]: 2 }}>
        <section className="card">
          <div className="card__cab">
            <h2>Requiere tu atención</h2>
          </div>
          <div className="card__cuerpo" style={{ display: 'grid', gap: 10 }}>
            {datos.pendientes.length === 0 ? (
              <div className="aviso aviso--ok">
                <Icon name="ok" size={18} /> Nada pendiente: verificaciones y reclamos al día.
              </div>
            ) : (
              datos.pendientes.map((p) => (
                <Link key={p.tipo} to={p.href} className="admin-pendiente">
                  <span className="admin-pendiente__n">{p.cantidad}</span>
                  <span className="admin-pendiente__texto">
                    <strong>{p.titulo}</strong>
                    <span>{p.texto}</span>
                  </span>
                  <span className="admin-pendiente__accion">{p.accion} →</span>
                </Link>
              ))
            )}
          </div>
        </section>

        <aside className="card">
          <div className="card__cab">
            <h2>Ir a</h2>
          </div>
          <div className="card__cuerpo" style={{ display: 'grid', gap: 10 }}>
            {accesos.map((a) => (
              <Link key={a.href} to={a.href} className="admin-pendiente">
                <span className="admin-pendiente__n" style={{ background: 'var(--verde-suave)', color: 'var(--verde)' }}>
                  <Icon name={a.icono} size={18} />
                </span>
                <span className="admin-pendiente__texto">
                  <strong>{a.texto}</strong>
                </span>
                <span className="admin-pendiente__accion">
                  <Icon name="flecha" size={16} />
                </span>
              </Link>
            ))}
          </div>
        </aside>
      </div>

      <section className="card rise" style={{ ['--i' as string]: 3 }}>
        <div className="card__cab">
          <h2>Actividad reciente</h2>
          <span className="admin-nota" style={{ marginLeft: 'auto' }}>
            Últimos 10 movimientos auditados
          </span>
        </div>
        {datos.actividad.length === 0 ? (
          <Vacio titulo="Sin actividad registrada" texto="Cuando alguien inicie sesión o cambie algo, aparecerá aquí." />
        ) : (
          <div className="tabla-scroll">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Cuándo</th>
                  <th>Quién</th>
                  <th>Acción</th>
                  <th>Entidad</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {datos.actividad.map((a) => (
                  <tr key={a.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{relativo(a.created_at)}</td>
                    <td>
                      <div className="admin-celda">
                        <strong>{a.quien}</strong>
                        <small>{a.rol}</small>
                      </div>
                    </td>
                    <td>
                      <code style={{ fontSize: 12.5 }}>{a.accion}</code>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {a.entidad ?? '—'}
                      {a.entidad_id ? <span className="admin-sub"> #{a.entidad_id}</span> : null}
                    </td>
                    <td style={{ color: 'var(--muted)' }}>{a.descripcion || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
