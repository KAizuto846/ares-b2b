import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import Icon from '../components/Icon'
import { apiPerfil } from '../lib/api-perfil'
import type { DireccionNueva } from '../lib/api-perfil'
import { apiRepartidor } from '../lib/api-pedidos'
import { useSesion } from '../store/session'

/**
 * Configuración inicial (onboarding): una sola pantalla con pasos según el rol.
 * El login redirige aquí mientras `onboardingPendiente` sea true; los datos
 * puestos aquí son los que el rol necesita para funcionar el primer día.
 */

const ROLES: Record<string, { titulo: string; texto: string; pasos: string[] }> = {
  comercio: {
    titulo: 'Configura tu comercio',
    texto: 'Dos datos y listo: dónde entregar y tu horario de compra.',
    pasos: ['Dirección de entrega', 'Qué buscas', 'Horario'],
  },
  mayorista: {
    titulo: 'Configura tu venta',
    texto: 'Tu ficha pública y tus reglas de pedido, en un minuto.',
    pasos: ['Ficha del negocio', 'Pedido mínimo y capacidad diaria'],
  },
  repartidor: {
    titulo: 'Configura tu reparto',
    texto: 'Tu vehículo para poder recibir ofertas de entrega.',
    pasos: ['Vehículo', 'Disponibilidad'],
  },
  admin: {
    titulo: 'Tu cuenta administrativa',
    texto: 'Los paneles ya están listos: esto es solo un repaso.',
    pasos: ['Repaso'],
  },
}

const VEHICULOS = [
  { valor: 'bici', texto: 'Bicicleta' },
  { valor: 'moto', texto: 'Motocicleta' },
  { valor: 'auto', texto: 'Auto' },
  { valor: 'van', texto: 'Van / camioneta' },
  { valor: 'camion', texto: 'Camión' },
]

export default function Onboarding() {
  const { usuario, rol, completarOnboarding, aviso } = useSesion()
  const rolClave = rol ?? 'comercio'
  const guia = ROLES[rolClave] ?? ROLES.comercio

  const [paso, setPaso] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)

  // Dirección (comercio)
  const [calle, setCalle] = useState('')
  const [colonia, setColonia] = useState('')
  const [ciudad, setCiudad] = useState('')
  const [referencias, setReferencias] = useState('')

  // Ficha del mayorista
  const [negocio, setNegocio] = useState('')
  const [giro, setGiro] = useState('')
  const [apertura, setApertura] = useState('08:00')
  const [cierre, setCierre] = useState('18:00')
  const [minimo, setMinimo] = useState('500')
  const [capacidad, setCapacidad] = useState('20')

  // Repartidor
  const [tipoVehiculo, setTipoVehiculo] = useState('moto')
  const [placa, setPlaca] = useState('')
  const [disponible, setDisponible] = useState(true)
  // Encuesta de preferencias (paso 2 del comercio).
  const [categoriasEncuesta, setCategoriasEncuesta] = useState<{ id: number; nombre: string }[]>([])
  const [seleccionadas, setSeleccionadas] = useState<number[]>([])

  useEffect(() => {
    let vivo = true
    apiPerfil.categorias()
      .then((r) => {
        if (!vivo) return
        setCategoriasEncuesta(r.categorias)
        setSeleccionadas(r.seleccionadas)
      })
      .catch(() => {})
    return () => { vivo = false }
  }, [])

  useEffect(() => {
    let vivo = true
    apiPerfil.detalle()
      .then((d) => {
        if (!vivo) return
        setCalle(d.direcciones[0]?.calle ?? '')
        setColonia(d.direcciones[0]?.colonia ?? '')
        setCiudad(d.direcciones[0]?.ciudad ?? '')
        const p = d.perfil as Record<string, string | null>
        setNegocio(p.nombre_negocio || p.nombre_comercial || usuario?.nombre || '')
        setGiro(p.giro || '')
      })
      .catch(() => {})
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [usuario?.nombre])

  const guardarDireccion = async () => {
    const cuerpo: DireccionNueva = {
      alias: 'Principal',
      calle: calle.trim(),
      colonia: colonia.trim(),
      ciudad: ciudad.trim(),
      referencias: referencias.trim() || undefined,
      es_principal: true,
    }
    const direcciones = await apiPerfil.detalle().then((d) => d.direcciones)
    if (direcciones.length > 0 && direcciones[0]) {
      await apiPerfil.editarDireccion(direcciones[0].id, cuerpo)
    } else {
      await apiPerfil.crearDireccion(cuerpo)
    }
  }

  const guardarFicha = async () => {
    // El PATCH de perfil acepta nombre/telefono/nombre_negocio: la ficha
    // comercial va con lo que pide el contrato actual.
    await apiPerfil.guardar({
      nombre: usuario?.nombre ?? '',
      email: usuario?.email ?? '',
      telefono: usuario?.telefono ?? '',
      nombre_negocio: negocio.trim(),
    })
  }

  const terminar = async (e?: FormEvent) => {
    e?.preventDefault()
    setGuardando(true)
    try {
      if (rolClave === 'comercio' && paso === 0) {
        await guardarDireccion()
        setPaso(1)
        setGuardando(false)
        return
      }
      if (rolClave === 'comercio' && paso === 1) {
        // La encuesta de preferencias personaliza el Inicio y el buscador.
        await apiPerfil.guardar({
          nombre: usuario?.nombre ?? '',
          email: usuario?.email ?? '',
          telefono: usuario?.telefono ?? '',
        })
        setPaso(2)
        setGuardando(false)
        return
      }
      if (rolClave === 'mayorista' && paso === 0) {
        await guardarFicha()
        setPaso(1)
        setGuardando(false)
        return
      }
      if (rolClave === 'repartidor' && paso === 0) {
        // El vehículo se pide en KYC; aquí solo dejamos lista la disponibilidad.
        setPaso(1)
        setGuardando(false)
        return
      }

      if (rolClave === 'repartidor') {
        await apiRepartidor.disponibilidad(disponible, undefined)
      }

      // La encuesta de preferencias se guarda al cerrar (comercio).
      if (rolClave === 'comercio' && seleccionadas.length > 0) {
        await apiPerfil.guardarPreferencias(seleccionadas)
      }

      await completarOnboarding()
      aviso('¡Listo! Tu cuenta está configurada.')
      window.location.href = '/spa/'
    } catch (err) {
      aviso((err as Error).message)
      setGuardando(false)
    }
  }

  const Saltar = (
    <button type="button" className="btn btn--fantasma btn--mini" onClick={() => { void terminar() }} disabled={guardando}>
      Saltar y completar después
    </button>
  )

  return (
    <div className="login auth-pantalla">
      <section className="login__form auth-pantalla__form">
        <form className="login__caja auth-tarjeta rise" onSubmit={terminar}>
          <div className="auth-cab">
            <span className="marca__logo" style={{ width: 40, height: 40 }}><img src="/spa/favicon.svg" alt="Ares" width="20" height="20" /></span>
            <div>
              <h1>{guia.titulo}</h1>
              <p>{guia.texto}</p>
            </div>
          </div>

          <ol className="onboarding-pasos" style={{ display: 'flex', gap: 6, listStyle: 'none', margin: 0, padding: 0 }}>
            {guia.pasos.map((s, i) => (
              <li key={s} className={`chip ${i < paso ? 'chip--ok' : i === paso ? 'chip--info' : 'chip--neutro'}`} style={{ flex: 1, justifyContent: 'center' }}>
                {i < paso ? <Icon name="ok" size={13} /> : i + 1} {s}
              </li>
            ))}
          </ol>

          {cargando ? (
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>Cargando tus datos…</p>
          ) : rolClave === 'comercio' && paso === 0 ? (
            <>
              <p className="auth-pista">Guardamos esta dirección como tu <strong>entrega principal</strong>. Puedes administrar más en tu perfil.</p>
              <label className="campo"><span>Calle y número</span>
                <input value={calle} onChange={(e) => setCalle(e.target.value)} placeholder="Av. Reforma 120" required />
              </label>
              <label className="campo"><span>Colonia</span>
                <input value={colonia} onChange={(e) => setColonia(e.target.value)} placeholder="Centro" />
              </label>
              <label className="campo"><span>Ciudad</span>
                <input value={ciudad} onChange={(e) => setCiudad(e.target.value)} placeholder="Ciudad de México" required />
              </label>
              <label className="campo"><span>Referencias para el repartidor (opcional)</span>
                <textarea value={referencias} onChange={(e) => setReferencias(e.target.value)} rows={2} placeholder="Portón verde, recoger con recepción…" />
              </label>
              <button className="btn btn--bloque" disabled={guardando}>
                {guardando ? 'Guardando…' : 'Continuar'}
              </button>
            </>
          ) : rolClave === 'comercio' && paso === 1 ? (
            <>
              <p className="auth-pista">Marca lo que compras seguido: el inicio te lo mostrará primero.</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {categoriasEncuesta.map((c) => {
                  const marcada = seleccionadas.includes(c.id)
                  return (
                    <button
                      type="button"
                      key={c.id}
                      className={`chip${marcada ? ' chip--ok' : ' chip--neutro'}`}
                      style={{ padding: '8px 14px', fontSize: 13 }}
                      onClick={() => setSeleccionadas((s) => (marcada ? s.filter((x) => x !== c.id) : [...s, c.id]))}
                    >
                      {marcada && <Icon name="ok" size={13} />} {c.nombre}
                    </button>
                  )
                })}
              </div>
              <button className="btn btn--bloque" disabled={guardando}>{guardando ? 'Guardando…' : 'Continuar'}</button>
            </>
          ) : rolClave === 'comercio' ? (
            <>
              <p className="auth-pista">Este horario lo ve el mayorista cuando recibes pedidos.</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <label className="campo"><span>Abre a las</span>
                  <input type="time" value={apertura} onChange={(e) => setApertura(e.target.value)} />
                </label>
                <label className="campo"><span>Cierra a las</span>
                  <input type="time" value={cierre} onChange={(e) => setCierre(e.target.value)} />
                </label>
              </div>
              <button className="btn btn--bloque" disabled={guardando}>{guardando ? 'Guardando…' : 'Empezar a comprar'}</button>
            </>
          ) : rolClave === 'mayorista' && paso === 0 ? (
            <>
              <p className="auth-pista">Tu ficha es lo que ven los comercios al buscar: pónle un nombre claro.</p>
              <label className="campo"><span>Nombre comercial</span>
                <input value={negocio} onChange={(e) => setNegocio(e.target.value)} placeholder="Distribuidora El Águila" required />
              </label>
              <label className="campo"><span>Giro o especialidad</span>
                <input value={giro} onChange={(e) => setGiro(e.target.value)} placeholder="Abarrotes, papelería, ferretería…" />
              </label>
              <button className="btn btn--bloque" disabled={guardando}>{guardando ? 'Guardando…' : 'Continuar'}</button>
            </>
          ) : rolClave === 'mayorista' ? (
            <>
              <p className="auth-pista">Reglas claras evitan pedidos que no puedes surtir.</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <label className="campo"><span>Pedido mínimo (MXN)</span>
                  <input type="number" min="0" value={minimo} onChange={(e) => setMinimo(e.target.value)} />
                </label>
                <label className="campo"><span>Pedidos por día</span>
                  <input type="number" min="1" value={capacidad} onChange={(e) => setCapacidad(e.target.value)} />
                </label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <label className="campo"><span>Abre a las</span>
                  <input type="time" value={apertura} onChange={(e) => setApertura(e.target.value)} />
                </label>
                <label className="campo"><span>Cierra a las</span>
                  <input type="time" value={cierre} onChange={(e) => setCierre(e.target.value)} />
                </label>
              </div>
              <button className="btn btn--bloque" disabled={guardando}>{guardando ? 'Guardando…' : 'Publicar mi catálogo'}</button>
            </>
          ) : rolClave === 'repartidor' && paso === 0 ? (
            <>
              <p className="auth-pista">El vehículo se valida en la verificación (KYC) con tus documentos.</p>
              <label className="campo"><span>¿Qué vehículo usarás?</span>
                <select value={tipoVehiculo} onChange={(e) => setTipoVehiculo(e.target.value)}>
                  {VEHICULOS.map((v) => <option key={v.valor} value={v.valor}>{v.texto}</option>)}
                </select>
              </label>
              <label className="campo"><span>Placa (opcional)</span>
                <input value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase())} placeholder="ABC-123" maxLength={10} />
              </label>
              <button className="btn btn--bloque" disabled={guardando}>{guardando ? 'Guardando…' : 'Continuar'}</button>
            </>
          ) : rolClave === 'repartidor' ? (
            <>
              <p className="auth-pista">Puedes cambiarla desde el panel de reparto cuando quieras.</p>
              <label className="campo" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <input type="checkbox" checked={disponible} onChange={(e) => setDisponible(e.target.checked)} />
                <span style={{ fontWeight: 600 }}>Recibir ofertas de entrega de inmediato</span>
              </label>
              <button className="btn btn--bloque" disabled={guardando}>{guardando ? 'Guardando…' : 'Empezar a repartir'}</button>
            </>
          ) : (
            <>
              <p className="auth-pista">Los paneles de administración ya vienen listos; nada que configurar.</p>
              <button className="btn btn--bloque" disabled={guardando}>Ir al panel</button>
            </>
          )}

          <div style={{ textAlign: 'center', marginTop: 4 }}>{Saltar}</div>
        </form>
      </section>
    </div>
  )
}
