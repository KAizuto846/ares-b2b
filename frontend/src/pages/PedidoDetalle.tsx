import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { estado, money } from '../lib/format'
import { Skeleton } from '../components/UI'
import { useNavegar, useSesion } from '../store/session'
import Icon from '../components/Icon'
import { apiPedidos, apiRepartidor } from '../lib/api-pedidos'
import { apiComercio } from '../lib/api-comercio'
import { mensajes } from '../lib/api-mensajes'
import type { Mensaje } from '../lib/api-mensajes'
import type { AccionPedido, PedidoDetalle as Pedido } from '../lib/api-pedidos'

export default function PedidoDetalle() {
  const { uuid = '' } = useParams()
  const { aviso, rol, refrescarCarrito } = useSesion()
  const navegar = useNavegar()

  const [p, setP] = useState<Pedido | null>(null)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState('')
  const [pinAccion, setPinAccion] = useState<AccionPedido | null>(null)
  const [pin, setPin] = useState('')
  const [cancelando, setCancelando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [puntaje, setPuntaje] = useState(0)
  const [comentario, setComentario] = useState('')
  const [calificando, setCalificando] = useState(false)
  const [pinRecoleccion, setPinRecoleccion] = useState<string | null>(null)
  const [cobrando, setCobrando] = useState(false)
  const [chat, setChat] = useState<{ uuid: string; mensajes: Mensaje[] } | null>(null)
  const [textoChat, setTextoChat] = useState('')
  const [enviandoChat, setEnviandoChat] = useState(false)

  // El hilo del pedido se abre solo: el comercio habla con el mayorista, el
  // mayorista con el comercio y el repartidor con el comercio.
  useEffect(() => {
    if (!uuid) return
    let vivo = true
    mensajes.directo({ pedido_uuid: uuid })
      .then((r) => mensajes.abrir(r.uuid))
      .then((a) => { if (vivo) setChat({ uuid: a.hilo.uuid, mensajes: a.mensajes }) })
      .catch(() => { if (vivo) setChat(null) })
    return () => { vivo = false }
  }, [uuid])

  const enviarChat = async (e: FormEvent) => {
    e.preventDefault()
    if (!chat || textoChat.trim() === '') return
    setEnviandoChat(true)
    try {
      const r = await mensajes.enviar(chat.uuid, textoChat.trim())
      setChat({ ...chat, mensajes: [...chat.mensajes, r.mensaje] })
      setTextoChat('')
    } catch (err) {
      aviso((err as Error).message)
    } finally {
      setEnviandoChat(false)
    }
  }

  const pagarPedido = async () => {
    setCobrando(true)
    try {
      const r = await apiPedidos.pagar(uuid)
      navegar(r.url)
    } catch (e) {
      aviso((e as Error).message)
    } finally {
      setCobrando(false)
    }
  }

  const cargar = useCallback(async () => {
    try {
      const r = await apiPedidos.detalle(uuid)
      setP(r.pedido)
      setPuntaje(r.pedido.calificacion?.puntaje ?? 0)
      setComentario(r.pedido.calificacion?.comentario ?? '')
      setError('')
    } catch (e) {
      setError((e as Error).message)
    }
  }, [uuid])

  useEffect(() => { void cargar() }, [cargar])

  const transicion = async (accion: string, nota?: string) => {
    setOcupado(accion)
    setError('')
    try {
      const r = await apiPedidos.estado(uuid, accion, nota)
      aviso(r.mensaje)
      if (r.pin_recoleccion) setPinRecoleccion(r.pin_recoleccion)
      setCancelando(false)
      setMotivo('')
      setPinAccion(null)
      setPin('')
      await cargar()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setOcupado('')
    }
  }

  const ejecutar = (accion: AccionPedido) => {
    if (accion.tipo === 'mapa') {
      navegar(`/tracking/${uuid}`)
      return
    }
    if (accion.codigo === 'cancelar') {
      setCancelando(true)
      return
    }
    if (accion.tipo === 'pin') {
      setPinAccion(accion)
      setPin('')
      return
    }
    void transicion(accion.codigo)
  }

  const enviarPin = async (ev: FormEvent) => {
    ev.preventDefault()
    if (!pinAccion) return
    setOcupado(pinAccion.codigo)
    setError('')
    try {
      const r = pinAccion.codigo === 'recoger'
        ? await apiRepartidor.recoger(uuid, pin)
        : await apiRepartidor.entregar(uuid, pin)
      aviso(r.mensaje)
      setPinAccion(null)
      setPin('')
      await cargar()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setOcupado('')
    }
  }

  const calificar = async (ev: FormEvent) => {
    ev.preventDefault()
    if (puntaje < 1) {
      setError('Elige de 1 a 5 estrellas.')
      return
    }
    setCalificando(true)
    setError('')
    try {
      const r = await apiPedidos.calificar(uuid, puntaje, comentario)
      aviso(r.mensaje)
      await cargar()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setCalificando(false)
    }
  }

  if (error && !p) return <div className="aviso aviso--error">{error}</div>
  if (!p) {
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        <Skeleton h={30} w={280} />
        <Skeleton h={190} />
        <Skeleton h={240} />
      </div>
    )
  }

  const e = estado(p.estado)
  const puedeVerMapa = p.direccion.lat !== null && (p.papeles.comercio || p.papeles.repartidor || p.papeles.admin)

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <button type="button" className="volver" onClick={() => navegar('/pedidos')}>
        <Icon name="flecha" size={15} /> Pedidos
      </button>

      <header className="pagina-cab">
        <div className="rise">
          <h1>Pedido {p.folio}</h1>
          <p>{p.mayorista.nombre} → {p.comercio.nombre} · creado el {p.creado}</p>
        </div>
        <div className="detalle-cab__lado">
          <span className={`chip chip--${e.tono}`}>{e.texto}</span>
          <strong className="detalle-total">{money(p.total)}</strong>
          {rol === 'comercio' && (p.estado === 'entregado' || p.estado === 'recibido' || p.estado === 'completado') && (
            <button
              type="button"
              className="btn btn--claro btn--mini"
              disabled={ocupado === 'recompra'}
              onClick={async () => {
                setOcupado('recompra')
                try {
                  const r = await apiComercio.recompra(uuid)
                  await refrescarCarrito()
                  aviso(r.agregados > 0
                    ? `${r.agregados} producto${r.agregados === 1 ? '' : 's'} agregado${r.agregados === 1 ? '' : 's'} al carrito`
                    : r.mensaje, {
                    texto: 'Ver carrito',
                    hacer: () => navegar('/carrito'),
                  })
                } catch (err) {
                  aviso((err as Error).message)
                } finally {
                  setOcupado('')
                }
              }}
            >
              <Icon name="carrito" size={15} /> Volver a pedir
            </button>
          )}
        </div>
      </header>

      {error && <div className="aviso aviso--error">{error}</div>}

      {pinRecoleccion && (
        <div className="pin-aviso pin-aviso--rec">
          <span>PIN de recolección: dictalo al repartidor cuando llegue</span>
          <strong>{pinRecoleccion}</strong>
          <span className="apunte">Se muestra solo esta vez. Si lo pierdes, pide a soporte reemitirlo.</span>
        </div>
      )}

      {p.pin_entrega && (
        <div className="pin-aviso">
          <span>Da este código al repartidor cuando llegue</span>
          <strong>{p.pin_entrega}</strong>
        </div>
      )}

      {p.acciones.length > 0 && (
        <div className="acciones-pedido rise">
          {p.acciones.map((a) => (
            <button
              key={a.codigo}
              type="button"
              className={`btn${a.tono === 'claro' ? ' btn--claro' : ''}${a.tono === 'peligro' ? ' btn--peligro' : ''}`}
              disabled={ocupado !== ''}
              onClick={() => ejecutar(a)}
            >
              {ocupado === a.codigo ? 'Procesando…' : a.texto}
            </button>
          ))}
        </div>
      )}

      {pinAccion && (
        <form className="caja-pin" onSubmit={enviarPin}>
          <div>
            <strong>{pinAccion.texto}</strong>
            <span className="apunte">{pinAccion.pin_ayuda} · {pinAccion.pin_largo} dígitos</span>
          </div>
          <input
            value={pin}
            onChange={(ev) => setPin(ev.target.value.replace(/\D/g, '').slice(0, pinAccion.pin_largo ?? 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={pinAccion.pin_largo}
            placeholder={'•'.repeat(pinAccion.pin_largo ?? 6)}
            aria-label="PIN"
            autoFocus
          />
          <button className="btn" type="submit" disabled={ocupado !== '' || pin.length < (pinAccion.pin_largo ?? 4)}>Confirmar</button>
          <button className="btn btn--claro" type="button" onClick={() => { setPinAccion(null); setPin('') }}>Cancelar</button>
        </form>
      )}

      <div className="detalle-grid">
        <div style={{ display: 'grid', gap: 18 }}>
          <section className="card rise" style={{ ['--i' as string]: 1 }}>
            <div className="card__cab"><h2>Productos</h2><span className="apunte">{p.lineas.length} líneas</span></div>
            <div className="tabla-scroll">
              <table className="tabla">
                <thead>
                  <tr><th>Producto</th><th style={{ textAlign: 'right' }}>Cant.</th><th style={{ textAlign: 'right' }}>Unitario</th><th style={{ textAlign: 'right' }}>Subtotal</th></tr>
                </thead>
                <tbody>
                  {p.lineas.map((l, i) => (
                    <tr key={`${l.nombre}-${i}`}>
                      <td>
                        {l.nombre}
                        {l.escala && <div className="apunte">{l.escala}</div>}
                      </td>
                      <td className="num" style={{ textAlign: 'right' }}>{l.cantidad}</td>
                      <td className="num" style={{ textAlign: 'right' }}>{money(l.precio_unitario)}</td>
                      <td className="num" style={{ textAlign: 'right' }}>{money(l.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card__cuerpo" style={{ paddingTop: 0 }}>
              <dl className="cifras">
                <div><dt>Subtotal</dt><dd>{money(p.subtotal)}</dd></div>
                <div><dt>IVA</dt><dd>{money(p.iva)}</dd></div>
                {p.envio > 0 && <div><dt>Envío</dt><dd>{money(p.envio)}</dd></div>}
                <div className="cifras__total"><dt>Total</dt><dd>{money(p.total)}</dd></div>
              </dl>
            </div>
          </section>

          <section className="card rise" style={{ ['--i' as string]: 2 }}>
            <div className="card__cab"><h2>Cronología</h2></div>
            <div className="card__cuerpo">
              {p.eventos.length === 0 ? (
                <p className="apunte">Sin movimientos registrados.</p>
              ) : (
                <ol className="linea-tiempo">
                  {p.eventos.map((ev, i) => (
                    <li key={`${ev.estado}-${ev.fecha}-${i}`} className={i === p.eventos.length - 1 ? 'linea-tiempo__paso actual' : 'linea-tiempo__paso'}>
                      <span className="linea-tiempo__punto" aria-hidden="true" />
                      <div>
                        <strong>{ev.texto}</strong>
                        <span className="apunte">{ev.fecha}</span>
                        {ev.nota && <p>{ev.nota}</p>}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>
        </div>

        <aside style={{ display: 'grid', gap: 18, alignContent: 'start' }}>
          <section className="card rise" style={{ ['--i' as string]: 1 }}>
            <div className="card__cab"><h2>Entrega</h2></div>
            <div className="card__cuerpo" style={{ display: 'grid', gap: 6 }}>
              <strong>{p.direccion.calle}</strong>
              <span className="apunte">
                {[p.direccion.colonia, p.direccion.ciudad, p.direccion.cp].filter(Boolean).join(', ')}
              </span>
              {p.direccion.referencias && <span className="apunte">Referencias: {p.direccion.referencias}</span>}
              {puedeVerMapa && (
                <button className="btn btn--claro btn--mini" style={{ justifySelf: 'start', marginTop: 6 }} onClick={() => navegar(`/tracking/${uuid}`)}>
                  <Icon name="mapa" size={15} /> Seguimiento
                </button>
              )}
            </div>
          </section>

          <section className="card rise" style={{ ['--i' as string]: 2 }}>
            <div className="card__cab"><h2>Envío</h2></div>
            <div className="card__cuerpo" style={{ display: 'grid', gap: 6 }}>
              <div className="dato"><span>Repartidor</span><strong>{p.envio_datos.repartidor ?? 'Aún sin asignar'}</strong></div>
              {p.envio_datos.distancia_km !== null && (
                <div className="dato"><span>Distancia</span><strong>{p.envio_datos.distancia_km} km</strong></div>
              )}
              {p.envio_datos.tarifa !== null && (
                <div className="dato"><span>Tarifa</span><strong>{money(p.envio_datos.tarifa)}</strong></div>
              )}
              {p.acepta_antes_de && p.estado === 'pendiente_aceptacion' && (
                <div className="aviso aviso--info" style={{ marginTop: 4 }}>
                  El mayorista debe aceptar antes de {p.acepta_antes_de}.
                </div>
              )}
            </div>
          </section>

          {!p.pago && (p.estado === 'borrador' || p.estado === 'pendiente_pago') && (
            <section className="card rise" style={{ ['--i' as string]: 3 }}>
              <div className="card__cab"><h2>Pago</h2><span className="chip chip--alerta">Sin cobrar</span></div>
              <div className="card__cuerpo" style={{ display: 'grid', gap: 8 }}>
                <span className="apunte">Todavía no se ha iniciado el cobro de este pedido.</span>
                <button className="btn btn--bloque" onClick={pagarPedido} disabled={cobrando}>
                  {cobrando ? 'Abriendo…' : 'Pagar pedido'}
                </button>
              </div>
            </section>
          )}

          <section className="card rise" style={{ ['--i' as string]: 4 }}>
            <div className="card__cab"><h2>Mensajes del pedido</h2></div>
            <div className="card__cuerpo pedido-chat">
              {chat === null ? (
                <span className="apunte">Abriendo el chat…</span>
              ) : chat.mensajes.length === 0 ? (
                <span className="apunte">
                  Todavía no hay mensajes. Usa el chat para coordinar la entrega; no compartas teléfonos ni correos.
                </span>
              ) : (
                <ul className="pedido-chat__lista">
                  {chat.mensajes.map((m) => (
                    <li key={m.id} className={m.mio ? 'pedido-chat__msg pedido-chat__msg--mio' : 'pedido-chat__msg'}>
                      <span>{m.cuerpo}</span>
                      <em>{m.autor}</em>
                    </li>
                  ))}
                </ul>
              )}

              <form className="pedido-chat__form" onSubmit={enviarChat}>
                <input
                  type="text"
                  value={textoChat}
                  onChange={(e) => setTextoChat(e.target.value)}
                  placeholder="Escribe un mensaje…"
                  maxLength={1000}
                  aria-label="Mensaje para el pedido"
                />
                <button className="btn btn--mini" type="submit" disabled={enviandoChat || textoChat.trim() === ''}>
                  {enviandoChat ? 'Enviando…' : 'Enviar'}
                </button>
              </form>
            </div>
          </section>

          {p.pago && (
            <section className="card rise" style={{ ['--i' as string]: 3 }}>
              <div className="card__cab"><h2>Pago</h2><span className={`chip chip--${p.pago.estado === 'autorizado' ? 'ok' : 'alerta'}`}>{p.pago.estado}</span></div>
              <div className="card__cuerpo" style={{ display: 'grid', gap: 8 }}>
                <div className="dato"><span>Monto</span><strong>{money(p.pago.monto)}</strong></div>
                <span className="apunte">Referencia {p.pago.referencia}</span>
                {p.pago.estado === 'creado' && (
                  <button className="btn btn--bloque" onClick={() => navegar(`/pago/simulado/${p.pago?.referencia}`)}>Ir al pago</button>
                )}
              </div>
            </section>
          )}

          {p.calificacion && p.calificacion.puede && (
            <section className="card rise" style={{ ['--i' as string]: 4 }}>
              <div className="card__cab"><h2>{p.calificacion.puntaje !== null ? 'Tu calificación' : 'Calificar'}</h2></div>
              <form className="card__cuerpo" onSubmit={calificar} style={{ display: 'grid', gap: 10 }}>
                <p className="apunte">
                  {p.calificacion.puntaje !== null
                    ? `Ya puntuaste a ${p.calificacion.nombre} con ${p.calificacion.puntaje} de 5. Puedes cambiarlo.`
                    : `¿Cómo estuvo ${p.calificacion.nombre}? Solo lo ve tu contraparte como promedio.`}
                </p>
                <div className="estrellas" role="radiogroup" aria-label="Puntaje">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`estrella${puntaje >= n ? ' llena' : ''}`}
                      role="radio"
                      aria-checked={puntaje === n}
                      aria-label={`${n} de 5`}
                      onClick={() => setPuntaje(n)}
                    >
                      ★
                    </button>
                  ))}
                </div>
                <label className="campo">
                  <span>Comentario (opcional)</span>
                  <input value={comentario} maxLength={280} onChange={(ev) => setComentario(ev.target.value)} placeholder="Llegó a tiempo y completo" />
                </label>
                <button className="btn" type="submit" disabled={calificando}>
                  {calificando ? 'Guardando…' : p.calificacion.puntaje !== null ? 'Actualizar calificación' : 'Enviar calificación'}
                </button>
              </form>
            </section>
          )}

          {p.calificacion && !p.calificacion.puede && p.calificacion.puntaje !== null && (
            <section className="card card--plana">
              <div className="card__cuerpo" style={{ display: 'grid', gap: 4 }}>
                <span className="apunte">Tu calificación</span>
                <strong>{'★'.repeat(p.calificacion.puntaje)}<span style={{ color: 'var(--line)' }}>{'★'.repeat(5 - p.calificacion.puntaje)}</span></strong>
              </div>
            </section>
          )}
        </aside>
      </div>

      {cancelando && (
        <div className="modal-velo" role="dialog" aria-modal="true" onClick={() => setCancelando(false)}>
          <div className="modal" onClick={(ev) => ev.stopPropagation()}>
            <h2>{p.estado === 'pendiente_aceptacion' && p.papeles.mayorista ? 'Rechazar el pedido' : 'Cancelar el pedido'}</h2>
            <p className="apunte">
              {p.papeles.mayorista
                ? 'Se libera el stock reservado y el comercio recibe el aviso.'
                : 'Si ya se cobró, el reembolso se gestiona desde el pedido.'}
            </p>
            <label className="campo">
              <span>Motivo (opcional)</span>
              <input value={motivo} maxLength={200} onChange={(ev) => setMotivo(ev.target.value)} placeholder="Sin stock suficiente" autoFocus />
            </label>
            <div className="modal__pie">
              <button className="btn btn--claro" type="button" onClick={() => setCancelando(false)}>Volver</button>
              <button
                className="btn btn--peligro"
                type="button"
                disabled={ocupado !== ''}
                onClick={() => void transicion('cancelar', motivo || undefined)}
              >
                {ocupado === 'cancelar' ? 'Procesando…' : 'Sí, continuar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
