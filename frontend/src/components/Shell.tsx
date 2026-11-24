import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import Icon from './Icon'
import { useSesion, useNavegar } from '../store/session'
import { money } from '../lib/format'
import { pedir, urlApp } from '../lib/api'
import type { Carrito } from '../lib/api'
import type { Anuncio } from '../lib/api-comercio'

const TITULOS: Record<string, string> = {
  '/': 'Inicio',
  '/buscar': 'Buscar',
  '/carrito': 'Mi carrito',
  '/checkout': 'Confirmar pedido',
  '/pedidos': 'Pedidos',
  '/perfil': 'Mi perfil',
  '/finanzas': 'Finanzas',
  '/planes': 'Planes',
  '/facturacion': 'Facturación',
  '/portafolio': 'Portafolio',
  '/agendar': 'Agendar pedido',
  '/mensajes': 'Mensajes',
  '/productos': 'Catálogo',
  '/admin': 'Administración',
  '/pos': 'Caja',
  '/pos/inventario': 'Inventario',
  '/pos/ventas': 'Ventas',
  '/pos/corte': 'Corte de caja',
  '/pos/clientes': 'Clientes',
  '/repartidor': 'Reparto',
  '/ayuda': 'Ayuda',
  '/kyc': 'Verificación',
}

type Enlace = { to: string; texto: string; icono: string; movil?: boolean }
type Bloque = { grupo: string; items: Enlace[] }

function navDe(rol: string | null): Bloque[] {
  if (rol === 'comercio') {
    return [
      {
        grupo: 'Principal',
        items: [
          { to: '/', texto: 'Inicio', icono: 'inicio', movil: true },
          { to: '/buscar', texto: 'Buscar', icono: 'buscar', movil: true },
          { to: '/pedidos', texto: 'Pedidos', icono: 'pedidos' },
          { to: '/finanzas', texto: 'Finanzas', icono: 'finanzas' },
          { to: '/portafolio', texto: 'Portafolio', icono: 'estrella' },
          { to: '/agendar', texto: 'Agendar', icono: 'calendario' },
          { to: '/mensajes', texto: 'Mensajes', icono: 'mensajes', movil: true },
          { to: '/perfil', texto: 'Perfil', icono: 'perfil', movil: true },
        ],
      },
      {
        grupo: 'Punto de venta',
        items: [
          { to: '/pos', texto: 'Caja', icono: 'pos' },
          { to: '/pos/inventario', texto: 'Inventario', icono: 'inventario' },
          { to: '/pos/ventas', texto: 'Ventas', icono: 'ventas' },
          { to: '/pos/corte', texto: 'Corte', icono: 'corte' },
          { to: '/pos/clientes', texto: 'Clientes', icono: 'clientes' },
        ],
      },
    ]
  }

  if (rol === 'mayorista') {
    // El mayorista no navega a Buscar, Portafolio ni Agendar: no existen para su rol.
    return [{
      grupo: 'Principal',
      items: [
        { to: '/', texto: 'Inicio', icono: 'inicio', movil: true },
        { to: '/productos', texto: 'Catálogo', icono: 'productos', movil: true },
        { to: '/pedidos', texto: 'Pedidos', icono: 'pedidos', movil: true },
        { to: '/finanzas', texto: 'Finanzas', icono: 'finanzas' },
        { to: '/planes', texto: 'Planes', icono: 'estrella' },
        { to: '/mensajes', texto: 'Mensajes', icono: 'mensajes', movil: true },
        { to: '/perfil', texto: 'Perfil', icono: 'perfil', movil: true },
      ],
    }]
  }

  if (rol === 'repartidor') {
    return [{
      grupo: 'Principal',
      items: [
        { to: '/', texto: 'Inicio', icono: 'inicio', movil: true },
        { to: '/repartidor', texto: 'Reparto', icono: 'reparto', movil: true },
        { to: '/buscar', texto: 'Buscar', icono: 'buscar' },
        { to: '/finanzas', texto: 'Finanzas', icono: 'finanzas' },
        { to: '/mensajes', texto: 'Mensajes', icono: 'mensajes', movil: true },
        { to: '/perfil', texto: 'Perfil', icono: 'perfil', movil: true },
      ],
    }]
  }

  if (rol && rol.startsWith('admin')) {
    return [{
      grupo: 'Administración',
      items: [
        { to: '/', texto: 'Inicio', icono: 'inicio', movil: true },
        { to: '/admin', texto: 'Panel', icono: 'admin', movil: true },
        { to: '/admin/usuarios', texto: 'Usuarios', icono: 'usuarios' },
        { to: '/admin/kyc', texto: 'Verificaciones', icono: 'kyc' },
        { to: '/admin/reclamos', texto: 'Reclamos', icono: 'reclamos' },
        { to: '/admin/parametros', texto: 'Parámetros', icono: 'parametros' },
        { to: '/mensajes', texto: 'Mensajes', icono: 'mensajes', movil: true },
        { to: '/perfil', texto: 'Perfil', icono: 'perfil', movil: true },
      ],
    }]
  }

  return [{ grupo: 'Principal', items: [{ to: '/', texto: 'Inicio', icono: 'inicio', movil: true }] }]
}

function Drawer({ carrito }: { carrito: Carrito | null }) {
  const { cajonAbierto, cerrarCarrito, cambiar, quitarItem, vaciar } = useSesion()
  const navegar = useNavegar()
  const caja = useRef<HTMLElement>(null)
  const botonCerrar = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrarCarrito() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [cerrarCarrito])

  // Foco dentro del diálogo y atrapado mientras está abierto.
  useEffect(() => {
    if (!cajonAbierto) return
    const previo = document.activeElement as HTMLElement | null
    botonCerrar.current?.focus()

    const atrapar = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !caja.current) return
      const focos = [...caja.current.querySelectorAll<HTMLElement>('button, a[href], input, select, [tabindex]:not([tabindex="-1"])')]
        .filter((el) => !el.hasAttribute('disabled'))
      if (focos.length === 0) return
      const primero = focos[0]
      const ultimo = focos[focos.length - 1]
      if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus() }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus() }
    }

    document.addEventListener('keydown', atrapar)
    return () => {
      document.removeEventListener('keydown', atrapar)
      previo?.focus?.()
    }
  }, [cajonAbierto])

  const listos = carrito?.listos ?? 0
  const totalGrupos = carrito?.total_grupos ?? 0
  const parcial = listos > 0 && listos < totalGrupos
  const cobraTodo = listos === 0 || listos === totalGrupos
  const subtotal = cobraTodo ? carrito?.subtotal ?? 0 : carrito?.subtotal_listo ?? 0
  const iva = cobraTodo ? carrito?.iva ?? 0 : carrito?.iva_listo ?? 0
  const total = cobraTodo ? carrito?.total ?? 0 : carrito?.total_listo ?? 0
  const unidades = carrito?.grupos.reduce((s, g) => s + g.items.reduce((x, i) => x + i.cantidad, 0), 0) ?? 0

  return (
    <div className={`cajon ${cajonAbierto ? 'abierto' : ''}`} aria-hidden={!cajonAbierto}>
      <div className="cajon__velo" onClick={cerrarCarrito} />
      <aside className="cajon__caja" role="dialog" aria-modal="true" aria-label="Mi carrito" ref={caja}>
        <header className="cajon__cab">
          <h2 className="cajon__titulo">Mi carrito <span className="cajon__cuenta">{unidades}</span></h2>
          {unidades > 0 && <button className="btn btn--fantasma btn--mini" onClick={vaciar} style={{ marginLeft: 'auto' }}>Vaciar</button>}
          <button className="icono-btn" onClick={cerrarCarrito} aria-label="Cerrar carrito" ref={botonCerrar} style={{ marginLeft: unidades > 0 ? 4 : 'auto' }}>
            <Icon name="cerrar" size={17} />
          </button>
        </header>

        <div className="cajon__scroll">
          {!carrito || carrito.items === 0 ? (
            <div className="vacio">
              <strong>Tu carrito está vacío</strong>
              <span>Busca productos y agrégalos desde aquí.</span>
              <button className="btn" onClick={() => { cerrarCarrito(); navegar('/buscar') }}>Buscar productos</button>
            </div>
          ) : (
            carrito.grupos.map((g) => {
              const pct = Math.min(100, (g.subtotal / Math.max(1, g.monto_minimo)) * 100)
              return (
                <section className="grupo" key={g.mayorista_uuid}>
                  <div className="grupo__cab">
                    <span className="grupo__nom">{g.mayorista}</span>
                    {g.listo && <span className="chip chip--ok">Listo</span>}
                    <span className="grupo__total">{money(g.total)}</span>
                  </div>
                  <div className="grupo__prog" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
                    <i style={{ width: pct < 2 ? 0 : `${pct}%` }} />
                  </div>
                  <p className="grupo__estado">
                    {g.cumple_minimo ? 'Mínimo cumplido' : `Faltan ${money(g.faltante)} para el mínimo`}
                  </p>
                  <a className="grupo__mas" href="/spa/buscar" onClick={(e) => { e.preventDefault(); cerrarCarrito(); navegar('/buscar') }}>
                    + Agregar más de este proveedor
                  </a>

                  {g.items.map((i) => (
                    <div className="linea" key={i.producto_uuid}>
                      <div className="linea__info">
                        <span className="linea__nom">{i.nombre}</span>
                        <span className="linea__sub">{i.unidad_venta} de {i.contenido}</span>
                      </div>
                      <span className="linea__precio">{money(i.total)}</span>
                      <div className="stepper">
                        <button
                          aria-label={i.cantidad === 1 ? `Quitar ${i.nombre}` : `Disminuir ${i.nombre}`}
                          onClick={() => (i.cantidad === 1 ? quitarItem(i.producto_uuid, i.nombre) : cambiar(i.producto_uuid, i.cantidad - 1, i.nombre))}
                        >
                          <Icon name={i.cantidad === 1 ? 'basura' : 'menos'} size={14} stroke={2} />
                        </button>
                        <span className="stepper__valor">{i.cantidad}</span>
                        <button aria-label={`Aumentar ${i.nombre}`} onClick={() => cambiar(i.producto_uuid, i.cantidad + 1, i.nombre)}>
                          <Icon name="mas" size={14} stroke={2} />
                        </button>
                      </div>
                    </div>
                  ))}
                </section>
              )
            })
          )}
        </div>

        {carrito && carrito.items > 0 && (
          <footer className="cajon__pie">
            <dl className="cifras">
              <div><dt>{parcial ? 'Subtotal a pagar' : 'Subtotal'}</dt><dd>{money(subtotal)}</dd></div>
              <div><dt>IVA (16%)</dt><dd>{money(iva)}</dd></div>
              <div><dt>Cargos de la app</dt><dd>—</dd></div>
              <div className="cifras__total"><dt>Total a pagar</dt><dd>{money(total)}</dd></div>
            </dl>

            {parcial && (
              <p className="aviso aviso--info" style={{ marginBottom: 10 }}>
                {listos} de {totalGrupos} proveedores alcanzan el mínimo. Los demás se quedan en el carrito.
              </p>
            )}

            {listos > 0 ? (
              <button className="btn btn--bloque" onClick={() => { cerrarCarrito(); navegar('/checkout') }}>
                {parcial ? `Continuar con ${listos} proveedor${listos === 1 ? '' : 'es'}` : 'Continuar el pago'}
              </button>
            ) : (
              <>
                <button className="btn btn--bloque" disabled>Continuar el pago</button>
                <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 8, textAlign: 'center' }}>
                  Completa el mínimo de cada proveedor para continuar.
                </p>
              </>
            )}
          </footer>
        )}
      </aside>
    </div>
  )
}

export default function Shell({ children }: { children: ReactNode }) {
  const { usuario, rol, salir, carrito, abrirCarrito, avisos } = useSesion()
  const navegar = useNavegar()
  const { pathname } = useLocation()
  const rolUi = rol && rol.startsWith('admin') ? 'admin' : rol
  const bloques = navDe(rol)
  const unidades = carrito?.grupos.reduce((s, g) => s + g.items.reduce((x, i) => x + i.cantidad, 0), 0) ?? 0
  const [sinLeer, setSinLeer] = useState(0)
  // Anuncio personalizado en ventana aparte: máx. 2 impresiones por usuario.
  const [anuncio, setAnuncio] = useState<Anuncio | null>(null)

  // Globo de mensajes sin leer; si el módulo aún no responde, se queda en 0.
  useEffect(() => {
    let vivo = true
    pedir<{ sin_leer: number }>('/mensajes/resumen')
      .then((r) => { if (vivo) setSinLeer(Number(r.sin_leer) || 0) })
      .catch(() => { if (vivo) setSinLeer(0) })
    return () => { vivo = false }
  }, [pathname])

  // Anuncio: se pide una vez por sesión de página y solo se muestra en Inicio
  // para no interrumpir operaciones; la ventana abre a los 900 ms con delay.
  useEffect(() => {
    let vivo = true
    pedir<{ anuncio: Anuncio | null }>('/anuncios')
      .then((r) => { if (vivo && r.anuncio && pathname === '/') {
        const t = window.setTimeout(() => { if (vivo) setAnuncio(r.anuncio) }, 900)
        return () => window.clearTimeout(t)
      } })
      .catch(() => {})
    return () => { vivo = false }
  }, [pathname])

  const marcarAnuncio = async (id: number, clic = false) => {
    setAnuncio(null)
    try { await pedir(`/anuncios/${id}/${clic ? 'clic' : 'visto'}`, { method: 'POST', body: '{}' }) } catch { /* silencio */ }
  }

  const titulo = TITULOS[pathname]
    ?? bloques.flatMap((b) => b.items).find((n) => n.to === pathname)?.texto
    ?? (pathname.startsWith('/pedidos/') ? 'Detalle del pedido'
      : pathname.startsWith('/productos') ? 'Productos'
      : pathname.startsWith('/admin') ? 'Administración'
      : pathname.startsWith('/pos') ? 'Punto de venta'
      : pathname.startsWith('/perfil') ? 'Mi perfil'
      : 'Ares')

  // Título de la pestaña y regreso al inicio en cada navegación: sin esto la
  // pantalla nueva se abría a media altura de la anterior.
  useEffect(() => {
    document.title = titulo === 'Inicio' ? 'Ares · B2B' : `${titulo} · Ares`
    window.scrollTo(0, 0)
  }, [titulo, pathname])

  const enlace = (n: Enlace) => (
    <NavLink
      key={n.to}
      to={n.to}
      end={n.to === '/'}
      className={({ isActive }) => `nav__item ${isActive ? 'activo' : ''} ${n.movil ? '' : 'nav__item--no-movil'}`}
    >
      <Icon name={n.icono} size={19} />
      <span>{n.texto}</span>
      {n.to === '/mensajes' && sinLeer > 0 && <span className="nav__globo">{sinLeer > 9 ? '9+' : sinLeer}</span>}
      {n.to === '/carrito' && unidades > 0 && <span className="nav__globo">{unidades > 99 ? '99+' : unidades}</span>}
    </NavLink>
  )

  // Grupos colapsables: abiertos por defecto; se recuerdan entre páginas.
  const gruposKey = bloques.map((b) => b.grupo).join('|')
  const [contraidos, setContraidos] = useState<Record<string, boolean>>({})
  useEffect(() => {
    try {
      const guardado = JSON.parse(sessionStorage.getItem('ares-nav-contraidos') ?? '{}')
      setContraidos(guardado && typeof guardado === 'object' ? guardado : {})
    } catch { /* ignore */ }
  }, [])
  useEffect(() => {
    sessionStorage.setItem('ares-nav-contraidos', JSON.stringify(contraidos))
  }, [contraidos])
  const alternar = (g: string) => setContraidos((c) => ({ ...c, [g]: !c[g] }))
  void gruposKey

  return (
    <div className="app">
      <aside className="rail">
        <a className="marca" href="/spa/" onClick={(e) => { e.preventDefault(); navegar('/') }}>
          <span className="marca__logo"><img src="/spa/favicon.svg" alt="Ares" width="20" height="20" /></span>
          <span className="marca__texto"><strong>Ares</strong><span>B2B</span></span>
        </a>

        <nav className="nav" aria-label="Principal">
          {bloques.map((b, i) => {
            const abierto = !contraidos[b.grupo]
            return (
              <section className={`nav__seccion ${abierto ? '' : 'nav__seccion--cerrada'}`} key={`b${i}`}>
                <button
                  type="button"
                  className="nav__grupo"
                  onClick={() => alternar(b.grupo)}
                  aria-expanded={abierto}
                  aria-controls={`nav-grupo-${i}`}
                >
                  <span>{b.grupo}</span>
                  <Icon name="flecha" size={13} stroke={2.2} />
                </button>
                {abierto && (
                  <div className="nav__items" id={`nav-grupo-${i}`}>
                    {b.items.map(enlace)}
                  </div>
                )}
              </section>
            )
          })}
        </nav>

        <div className="rail__pie">
          <a className="rail__cuenta" href="/spa/perfil" onClick={(e) => { e.preventDefault(); navegar('/perfil') }}>
            {usuario?.avatar
              ? <img src={urlApp(usuario.avatar)} alt="" />
              : <span className="iniciales">{(usuario?.nombre ?? 'A').slice(0, 2).toUpperCase()}</span>}
            <span>
              <strong style={{ fontSize: 13, display: 'block' }}>{usuario?.nombre ?? 'Cuenta'}</strong>
              <small>{rolUi}</small>
            </span>
          </a>
          <button className="btn btn--fantasma rail__salir" style={{ color: '#c3d3c9', justifyContent: 'flex-start', gap: 10 }} onClick={() => salir()}>
            <Icon name="salir" size={17} /> Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <span className="topbar__titulo">{titulo}</span>
          <div className="topbar__acciones">
            {rolUi === 'comercio' && (
              <button id="boton-carrito" className="icono-btn carrito-btn" aria-label="Abrir carrito" onClick={abrirCarrito}>
                <Icon name="carrito" size={19} />
                {unidades > 0 && <span className="carrito-btn__globo">{unidades > 99 ? '99+' : unidades}</span>}
              </button>
            )}
          </div>
        </header>

        <main className="contenido">{children}</main>
      </div>

      {rolUi === 'comercio' && <Drawer carrito={carrito} />}

      <div className="toasts">
        {avisos.map((a) => (
          <div className="toast" key={a.id}>
            <span>{a.texto}</span>
            {a.accion && <button onClick={a.accion.hacer}>{a.accion.texto}</button>}
          </div>
        ))}
      </div>

      {/* Anuncio en ventana aparte: la URL lo abre con su href y marca clic. */}
      {anuncio && (
        <div className="anuncio-modal" role="dialog" aria-modal="true" aria-label={anuncio.titulo}>
          <div className="anuncio-modal__velo" onClick={() => void marcarAnuncio(anuncio.id)} />
          <div className="anuncio-modal__caja">
            <header>
              <span className="chip chip--info">Para ti</span>
              <button className="icono-btn icono-btn--mini" aria-label="Cerrar" onClick={() => void marcarAnuncio(anuncio.id)}>
                <Icon name="cerrar" size={15} />
              </button>
            </header>
            <h2>{anuncio.titulo}</h2>
            <p>{anuncio.cuerpo}</p>
            {anuncio.cta_href && (
              <button
                className="btn btn--bloque"
                onClick={() => { void marcarAnuncio(anuncio.id, true); navegar(anuncio.cta_href as string) }}
              >
                {anuncio.cta_texto ?? 'Ver más'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
