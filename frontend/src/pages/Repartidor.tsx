import { useCallback, useEffect, useState } from 'react'
import { money } from '../lib/format'
import { Skeleton, Vacio } from '../components/UI'
import { useNavegar, useSesion } from '../store/session'
import Icon from '../components/Icon'
import { apiPedidos, apiRepartidor, apiTracking } from '../lib/api-pedidos'
import type { Punto, PanelRepartidor, ViajeRepartidor, ViajeRuta } from '../lib/api-pedidos'

/** Estados en los que el repartidor transmite posición (mismos que el backend). */
const TRANSMITEN = ['en_recoleccion', 'en_camino', 'en_puerta']

export default function Repartidor() {
  const { aviso } = useSesion()
  const navegar = useNavegar()

  const [panel, setPanel] = useState<PanelRepartidor | null>(null)
  const [ruta, setRuta] = useState<ViajeRuta | null>(null)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState('')
  const [pines, setPines] = useState<Record<string, string>>({})
  const [ahora, setAhora] = useState(() => Date.now())

  const cargar = useCallback(async () => {
    try {
      const [p, v] = await Promise.all([
        apiRepartidor.panel(),
        apiRepartidor.viajeActual().catch(() => null),
      ])
      setPanel(p)
      setRuta(v?.viaje ?? null)
      setError('')
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  // Refresco periódico: las ofertas caducan en 60 s.
  useEffect(() => {
    const id = window.setInterval(() => { void cargar() }, 20000)
    return () => window.clearInterval(id)
  }, [cargar])

  useEffect(() => {
    const id = window.setInterval(() => setAhora(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const viajeActivo = (panel?.viajes ?? []).find((v) => TRANSMITEN.includes(v.estado)) ?? null

  // Durante el viaje se manda el GPS en lotes cada 12 s, igual que el panel PHP.
  useEffect(() => {
    if (!viajeActivo || !('geolocation' in navigator)) return

    const cola: Punto[] = []
    const vigilancia = navigator.geolocation.watchPosition(
      (pos) => {
        cola.push({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          precision_m: Math.round(pos.coords.accuracy || 0),
          capturado_en: new Date(pos.timestamp).toISOString(),
        })
      },
      () => { /* sin GPS: el viaje sigue, solo no hay mapa */ },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
    )

    const envio = window.setInterval(() => {
      if (cola.length === 0) return
      const lote = cola.splice(0, 20)
      void apiTracking.posicion(lote).catch(() => { /* se reintenta al siguiente ciclo */ })
    }, 12000)

    return () => {
      navigator.geolocation.clearWatch(vigilancia)
      window.clearInterval(envio)
    }
  }, [viajeActivo?.uuid, viajeActivo?.estado])

  const alternar = async () => {
    if (!panel) return
    setOcupado('disponibilidad')
    setError('')
    try {
      const coords = await new Promise<{ lat: number; lng: number } | undefined>((resolve) => {
        if (!('geolocation' in navigator)) return resolve(undefined)
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          () => resolve(undefined),
          { timeout: 6000 },
        )
      })
      const r = await apiRepartidor.disponibilidad(!panel.repartidor.disponible, coords)
      aviso(r.mensaje)
      await cargar()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setOcupado('')
    }
  }

  const responderOferta = async (id: number, aceptar: boolean) => {
    setOcupado(`oferta-${id}`)
    setError('')
    try {
      const r = await apiRepartidor.oferta(id, aceptar)
      aviso(r.mensaje)
      await cargar()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setOcupado('')
    }
  }

  const paso = async (v: ViajeRepartidor, codigo: string) => {
    setOcupado(`${v.uuid}-${codigo}`)
    setError('')
    try {
      const r = codigo === 'recoger'
        ? await apiRepartidor.recoger(v.uuid, pines[v.uuid] ?? '')
        : codigo === 'entregar'
          ? await apiRepartidor.entregar(v.uuid, pines[v.uuid] ?? '')
          : await apiPedidos.estado(v.uuid, codigo)
      aviso(r.mensaje)
      setPines((prev) => ({ ...prev, [v.uuid]: '' }))
      await cargar()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setOcupado('')
    }
  }

  if (error && !panel) return <div className="aviso aviso--error">{error}</div>
  if (!panel) {
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        <Skeleton h={30} w={240} />
        <Skeleton h={130} />
        <Skeleton h={200} />
      </div>
    )
  }

  const { repartidor, ofertas, viajes, entregas, ganancias_hoy } = panel

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <header className="pagina-cab">
        <div className="rise">
          <h1>Mi ruta</h1>
          <p>Ponte en línea para recibir ofertas. Durante el viaje compartes tu posición con el comercio.</p>
        </div>
        <button className="btn btn--claro" onClick={() => void cargar()} disabled={ocupado !== ''}>
          <Icon name="reloj" size={15} /> Actualizar
        </button>
      </header>

      {error && <div className="aviso aviso--error">{error}</div>}

      {/* Ruta consolidada: paradas en orden óptimo (OSRM). Solo aparece con
          más de un envío en el mismo viaje. */}
      {ruta && ruta.paradas.filter((p) => p.parada_completada_at === null).length > 1 && (
        <section className="card rise" style={{ ['--i' as string]: 1, borderColor: 'rgba(47,158,99,.35)' }}>
          <div className="card__cab">
            <h2>Tu ruta</h2>
            <span className="chip chip--ok" style={{ marginLeft: 'auto' }}>
              {ruta.paradas.filter((p) => p.parada_completada_at === null).length} parada{ruta.paradas.filter((p) => p.parada_completada_at === null).length === 1 ? '' : 's'} pendiente{ruta.paradas.filter((p) => p.parada_completada_at === null).length === 1 ? '' : 's'}
            </span>
            {ruta.duracion_est_min !== null && (
              <span className="apunte">≈ {ruta.duracion_est_min} min · {ruta.distancia_total_km ? Number(ruta.distancia_total_km).toFixed(1) : '—'} km</span>
            )}
          </div>
          <div className="card__cuerpo" style={{ display: 'grid', gap: 10 }}>
            {ruta.paradas.map((p, i) => {
              const hecha = p.parada_completada_at !== null
              const siguiente = !hecha && ruta.paradas.slice(0, i).every((x) => x.parada_completada_at !== null)
              return (
                <div
                  key={p.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                    borderRadius: 12, border: `1px solid ${hecha ? 'var(--line-soft)' : siguiente ? 'rgba(47,158,99,.4)' : 'var(--line)'}`,
                    background: hecha ? 'var(--line-soft)' : siguiente ? 'var(--verde-suave)' : '#fff',
                    opacity: hecha ? 0.65 : 1, flexWrap: 'wrap',
                  }}
                >
                  <span className={`chip ${hecha ? 'chip--ok' : siguiente ? 'chip--info' : 'chip--neutro'}`}>#{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <strong style={{ fontSize: 13.5 }}>{p.mayorista} → {p.colonia || p.ciudad}</strong>
                    <span className="apunte" style={{ display: 'block' }}>
                      {p.calle} · {money(Number(p.total))}{p.tarifa !== null ? ` · tarifa ${money(Number(p.tarifa))}` : ''}
                    </span>
                  </div>
                  {p.destino_lat !== null && p.destino_lng !== null && !hecha && (
                    <a
                      className="btn btn--claro btn--mini"
                      href={`https://waze.com/ul?ll=${p.destino_lat},${p.destino_lng}&navigate=yes`}
                      target="_blank" rel="noreferrer"
                    >
                      <Icon name="mapa" size={14} /> Ir
                    </a>
                  )}
                  <button
                    type="button"
                    className="btn btn--mini"
                    disabled={hecha || !siguiente}
                    onClick={() => navegar(`/pedidos/${p.uuid}`)}
                  >
                    {hecha ? <Icon name="ok" size={15} /> : siguiente ? 'Atender parada' : 'En espera'}
                  </button>
                </div>
              )
            })}
            <p className="apunte">El orden lo calcula el sistema para acortar tu camino. Las paradas se atienden en secuencia.</p>
          </div>
        </section>
      )}

      <div className="kpis rise" style={{ ['--i' as string]: 1 }}>
        <div className={`kpi${repartidor.disponible ? '' : ' kpi--alerta'}`}>
          <span className="kpi__valor">{repartidor.disponible ? 'En línea' : 'Fuera'}</span>
          <span className="kpi__etiqueta">Disponibilidad</span>
          {repartidor.vehiculo && <span className="kpi__nota">{repartidor.vehiculo.tipo} · {repartidor.vehiculo.placa}</span>}
        </div>
        <div className="kpi">
          <span className="kpi__valor">{money(ganancias_hoy)}</span>
          <span className="kpi__etiqueta">Ganado hoy</span>
          <span className="kpi__nota">{entregas.length} entrega{entregas.length === 1 ? '' : 's'}</span>
        </div>
        <div className="kpi">
          <span className="kpi__valor">{viajes.length}</span>
          <span className="kpi__etiqueta">Viajes activos</span>
          <span className="kpi__nota">{ofertas.length} oferta{ofertas.length === 1 ? '' : 's'} esperando</span>
        </div>
        <div className="kpi">
          <span className="kpi__valor">{repartidor.calificacion !== null ? repartidor.calificacion.toFixed(1) : '—'}</span>
          <span className="kpi__etiqueta">Calificación</span>
          <span className="kpi__nota">{repartidor.kyc === 'aprobado' ? 'Verificación aprobada' : 'Verificación ' + repartidor.kyc}</span>
        </div>
      </div>

      <section className="card rise" style={{ ['--i' as string]: 2 }}>
        <div className="card__cuerpo barra-disponible">
          <div>
            <strong>{repartidor.disponible ? 'Recibes ofertas de envío' : 'No recibes ofertas'}</strong>
            <span className="apunte">
              {repartidor.ultima_posicion_at ? `Última posición ${repartidor.ultima_posicion_at}` : 'Aún sin posición registrada'}
            </span>
          </div>
          <button
            className={`btn${repartidor.disponible ? ' btn--claro' : ''}`}
            onClick={() => void alternar()}
            disabled={ocupado !== ''}
          >
            {repartidor.disponible ? 'Salir de línea' : 'Ponerme en línea'}
          </button>
        </div>
      </section>

      <section style={{ display: 'grid', gap: 10 }}>
        <div className="seccion-cab"><h2>Ofertas</h2><span className="apunte">{ofertas.length} disponibles</span></div>
        {ofertas.length === 0 ? (
          <div className="card card--plana"><div className="card__cuerpo apunte">No tienes ofertas pendientes.</div></div>
        ) : (
          <div className="ofertas">
            {ofertas.map((o) => {
              const limite = new Date(o.expira_en.replace(' ', 'T')).getTime()
              const resta = Math.max(0, Math.round((limite - ahora) / 1000))
              return (
                <article className="oferta rise" key={o.id}>
                  <div className="oferta__cab">
                    <strong>{o.mayorista} → {o.comercio}</strong>
                    <span className="oferta__tarifa">{money(o.tarifa)}</span>
                  </div>
                  <p className="apunte">
                    {o.distancia_km} km de recorrido · {o.calle}, {o.ciudad}
                  </p>
                  <div className="oferta__pie">
                    <span className={`chip chip--${resta > 15 ? 'alerta' : 'malo'}`}>
                      {resta > 0 ? `Quedan ${resta} s` : 'Vencida'}
                    </span>
                    <span className="apunte">Pedido {o.pedido_uuid.slice(0, 8)} · {money(o.total)}</span>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                      <button className="btn btn--claro btn--mini" disabled={ocupado !== ''} onClick={() => void responderOferta(o.id, false)}>
                        Rechazar
                      </button>
                      <button className="btn btn--mini" disabled={ocupado !== '' || resta === 0} onClick={() => void responderOferta(o.id, true)}>
                        Aceptar envío
                      </button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section style={{ display: 'grid', gap: 10 }}>
        <div className="seccion-cab"><h2>Viajes asignados</h2></div>
        {viajes.length === 0 ? (
          <div className="card card--plana"><div className="card__cuerpo apunte">Sin entregas asignadas.</div></div>
        ) : (
          viajes.map((v) => {
            const pinActual = v.pin
            return (
              <article className={`viaje${TRANSMITEN.includes(v.estado) ? ' viaje--activo' : ''}`} key={v.uuid}>
                <div className="viaje__cab">
                  <div>
                    <strong>{v.mayorista} → {v.comercio}</strong>
                    <span className="apunte">{v.destino.calle}, {v.destino.colonia} · {v.destino.ciudad}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span className="chip chip--info">{v.estado_texto}</span>
                    {v.tarifa !== null && <div className="viaje__tarifa">{money(v.tarifa)}</div>}
                  </div>
                </div>

                {pinActual && (
                  <form
                    className="caja-pin caja-pin--viaje"
                    onSubmit={(ev) => { ev.preventDefault(); void paso(v, pinActual.tipo === 'recoleccion' ? 'recoger' : 'entregar') }}
                  >
                    <div>
                      <strong>PIN de {pinActual.tipo}</strong>
                      <span className="apunte">{pinActual.largo} dígitos · pídelo a {pinActual.de}</span>
                    </div>
                    <input
                      value={pines[v.uuid] ?? ''}
                      onChange={(ev) => setPines((prev) => ({ ...prev, [v.uuid]: ev.target.value.replace(/\D/g, '').slice(0, pinActual.largo) }))}
                      inputMode="numeric"
                      maxLength={pinActual.largo}
                      placeholder={'•'.repeat(pinActual.largo)}
                      aria-label={`PIN de ${pinActual.tipo}`}
                    />
                    <button className="btn" type="submit" disabled={ocupado !== '' || (pines[v.uuid] ?? '').length < pinActual.largo}>
                      {pinActual.tipo === 'recoleccion' ? 'Confirmar recolección' : 'Confirmar entrega'}
                    </button>
                  </form>
                )}

                <div className="viaje__pie">
                  {v.estado === 'en_recoleccion' && (
                    <button className="btn" disabled={ocupado !== ''} onClick={() => void paso(v, 'salir')}>Salir a entregar</button>
                  )}
                  {v.estado === 'en_camino' && (
                    <button className="btn" disabled={ocupado !== ''} onClick={() => void paso(v, 'llegue')}>Llegué al comercio</button>
                  )}
                  {v.destino.lat !== null && v.destino.lng !== null && (
                    <>
                      <a
                        className="btn btn--claro btn--mini"
                        href={`https://waze.com/ul?ll=${v.destino.lat},${v.destino.lng}&navigate=yes`}
                        target="_blank"
                        rel="noreferrer"
                        title="Navegar con Waze"
                      >
                        <Icon name="mapa" size={14} /> Waze
                      </a>
                      <a
                        className="btn btn--claro btn--mini"
                        href={`https://www.google.com/maps/dir/?api=1&destination=${v.destino.lat},${v.destino.lng}&travelmode=driving`}
                        target="_blank"
                        rel="noreferrer"
                        title="Navegar con Google Maps"
                      >
                        <Icon name="mapa" size={14} /> Maps
                      </a>
                    </>
                  )}
                  <button className="btn btn--claro btn--mini" onClick={() => navegar(`/pedidos/${v.uuid}`)}>
                    Abrir pedido
                  </button>
                  <button className="btn btn--claro btn--mini" onClick={() => navegar(`/tracking/${v.uuid}`)}>
                    <Icon name="mapa" size={14} /> Mapa
                  </button>
                  {v.distancia_km !== null && <span className="apunte" style={{ marginLeft: 'auto' }}>{v.distancia_km} km · total {money(v.total)}</span>}
                </div>
              </article>
            )
          })
        )}
      </section>

      <section style={{ display: 'grid', gap: 10 }}>
        <div className="seccion-cab"><h2>Entregas de hoy</h2><span className="apunte">{money(ganancias_hoy)}</span></div>
        {entregas.length === 0 ? (
          <div className="card card--plana"><div className="card__cuerpo apunte">Todavía no has cerrado entregas hoy.</div></div>
        ) : (
          <div className="card" style={{ overflow: 'hidden' }}>
            <div className="tabla-scroll">
              <table className="tabla">
                <thead><tr><th>Pedido</th><th>Comercio</th><th>Cerrada</th><th style={{ textAlign: 'right' }}>Tu tarifa</th></tr></thead>
                <tbody>
                  {entregas.map((en) => (
                    <tr key={en.uuid} onClick={() => navegar(`/pedidos/${en.uuid}`)} style={{ cursor: 'pointer' }}>
                      <td><code className="folio">{en.uuid.slice(0, 8)}</code></td>
                      <td>{en.comercio}</td>
                      <td>{en.entregado_en ?? '—'}</td>
                      <td className="num" style={{ textAlign: 'right', fontWeight: 650 }}>{money(en.tarifa)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {viajeActivo && (
        <p className="apunte" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Icon name="ubicacion" size={14} /> Compartiendo posición con el comercio mientras el viaje está activo.
        </p>
      )}
      {!viajeActivo && viajes.length === 0 && (
        <Vacio titulo="Sin viaje en curso" texto="Cuando aceptes una oferta aparecerá aquí con su PIN." />
      )}
    </div>
  )
}
