import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api, jwtGuardar, jwtLimpiar } from '../lib/api'
import type { Carrito, Suscripcion, Usuario } from '../lib/api'

type Aviso = { id: number; texto: string; accion?: { texto: string; hacer: () => void } }

type Contexto = {
  usuario: Usuario | null
  rol: string | null
  cargando: boolean
  /** Configuración inicial pendiente: true/false, o null para admin/sin sesión. */
  onboardingPendiente: boolean | null
  /** Suscripción vigente (plan + flags) o null: el front pinta muros y bloqueos. */
  suscripcion: Suscripcion | null
  completarOnboarding: () => Promise<void>
  /** Vuelve a leer /session para sincronizar nombre/foto editados en el panel. */
  refrescarUsuario: () => Promise<void>
  entrar: (email: string, password: string, recordar?: boolean) => Promise<void>
  salir: () => Promise<void>
  carrito: Carrito | null
  refrescarCarrito: () => Promise<void>
  agregar: (producto: string, cantidad: number, origen?: HTMLElement | null) => Promise<void>
  cambiar: (producto: string, cantidad: number, nombre: string) => Promise<void>
  quitarItem: (producto: string, nombre: string) => Promise<void>
  vaciar: () => Promise<void>
  cajonAbierto: boolean
  abrirCarrito: () => void
  cerrarCarrito: () => void
  aviso: (texto: string, accion?: Aviso['accion']) => void
  avisos: Aviso[]
}

const Ctx = createContext<Contexto | null>(null)

export function useSesion() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useSesion fuera del proveedor')
  return c
}

/** Navegación con transición de vista nativa (con respaldo silencioso). */
export function useNavegar() {
  const navigate = useNavigate()
  return useCallback((to: string) => {
    const doc = document as Document & { startViewTransition?: (cb: () => void) => void }
    if (doc.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      doc.startViewTransition(() => navigate(to))
    } else {
      navigate(to)
    }
  }, [navigate])
}

export function Proveedor({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [rol, setRol] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [carrito, setCarrito] = useState<Carrito | null>(null)
  const [cajonAbierto, setCajonAbierto] = useState(false)
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const [onboardingPendiente, setOnboardingPendiente] = useState<boolean | null>(null)
  const [suscripcion, setSuscripcion] = useState<Suscripcion | null>(null)
  const secuencia = useRef(0)
  const ubicacion = useLocation()

  const aviso = useCallback((texto: string, accion?: Aviso['accion']) => {
    const id = ++secuencia.current
    setAvisos((prev) => [...prev.slice(-2), { id, texto, accion }])
    window.setTimeout(() => setAvisos((prev) => prev.filter((a) => a.id !== id)), 4200)
  }, [])

  const refrescarCarrito = useCallback(async () => {
    try {
      setCarrito(await api.carrito())
    } catch {
      /* sin sesión de comercio no hay carrito */
    }
  }, [])

  useEffect(() => {
    let vivo = true
    api.session()
      .then((r) => {
        if (!vivo) return
        setUsuario(r.usuario)
        setRol(r.rol)
        setOnboardingPendiente(r.onboarding_completo === null || r.onboarding_completo === undefined ? null : !r.onboarding_completo)
        setSuscripcion(r.suscripcion ?? null)
        document.documentElement.dataset.tema = r.tema === 'oscuro' ? 'oscuro' : 'claro'
      })
      .catch(() => { if (vivo) { setUsuario(null); setRol(null); setSuscripcion(null) } })
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [])

  useEffect(() => {
    if (!usuario) { setCarrito(null); return }
    if (rol === 'comercio') refrescarCarrito()
  }, [usuario, rol, refrescarCarrito])

  // Cerrar el cajón al cambiar de ruta.
  useEffect(() => { setCajonAbierto(false) }, [ubicacion.pathname])

  const refrescarUsuario = useCallback(async () => {
    try {
      const r = await api.session()
      if (r.usuario) setUsuario(r.usuario)
      setSuscripcion(r.suscripcion ?? null)
    } catch {
      /* la sesión sigue viva aunque falle el refresco */
    }
  }, [])

  const entrar = useCallback(async (email: string, password: string, recordar = false) => {
  const r = await api.login(email, password, recordar)
  // JWT: se guardan los tokens para autenticar por Bearer en cada petición.
  jwtGuardar(r.access_token, r.refresh_token)
  setUsuario(r.usuario)
    setRol(r.rol)
    setOnboardingPendiente(r.onboarding_completo === null || r.onboarding_completo === undefined ? null : !r.onboarding_completo)
    setSuscripcion(r.suscripcion ?? null)
    document.documentElement.dataset.tema = r.tema === 'oscuro' ? 'oscuro' : 'claro'
    if (r.rol === 'comercio') await refrescarCarrito()
  }, [refrescarCarrito])

  const salir = useCallback(async () => {
  await api.logout()
  jwtLimpiar()
  setUsuario(null)
    setRol(null)
    setOnboardingPendiente(null)
    setSuscripcion(null)
    setCarrito(null)
    document.documentElement.dataset.tema = 'claro'
  }, [])

  /** Marca la configuración inicial como completada en el servidor. */
  const completarOnboarding = useCallback(async () => {
    await api.completarOnboarding()
    setOnboardingPendiente(false)
  }, [])

  const volar = useCallback((origen: HTMLElement | null, cantidad: number) => {
    const destino = document.getElementById('boton-carrito')
    if (!origen || !destino) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const a = origen.getBoundingClientRect()
    const b = destino.getBoundingClientRect()
    const x0 = a.left + a.width / 2
    const y0 = a.top + a.height / 2
    const x1 = b.left + b.width / 2
    const y1 = b.top + b.height / 2

    const p = document.createElement('div')
    p.className = 'vuelo'
    p.textContent = `+${cantidad}`
    document.body.appendChild(p)

    p.animate(
      [
        { transform: `translate(${x0}px, ${y0}px) translate(-50%,-50%) scale(.85)`, opacity: 0.95 },
        { transform: `translate(${(x0 + x1) / 2}px, ${Math.min(y0, y1) - 90}px) translate(-50%,-50%) scale(1.12)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${x1}px, ${y1}px) translate(-50%,-50%) scale(.45)`, opacity: 0.9 },
      ],
      { duration: 420, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' },
    ).onfinish = () => {
      p.remove()
      destino.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(.94)' }, { transform: 'scale(1)' }],
        { duration: 380, easing: 'ease-out' },
      )
    }
  }, [])

  const agregar = useCallback(async (producto: string, cantidad: number, origen?: HTMLElement | null) => {
    volar(origen ?? null, cantidad)
    try {
      const r = await api.agregar(producto, cantidad)
      setCarrito(r.carrito)
      aviso('Agregado al carrito')
    } catch (e) {
      aviso((e as Error).message)
      await refrescarCarrito()
    }
  }, [aviso, refrescarCarrito, volar])

  const cambiar = useCallback(async (producto: string, cantidad: number, nombre: string) => {
    try {
      const r = await api.item(producto, cantidad)
      setCarrito(r.carrito)
    } catch (e) {
      aviso((e as Error).message)
      await refrescarCarrito()
    }
    void nombre
  }, [aviso, refrescarCarrito])

  const quitarItem = useCallback(async (producto: string, nombre: string) => {
    const previo = carrito
    try {
      const r = await api.quitar(producto)
      setCarrito(r.carrito)
      aviso(`${nombre} eliminado`, {
        texto: 'Deshacer',
        hacer: async () => {
          if (!previo) return
          const linea = previo.grupos.flatMap((g) => g.items).find((i) => i.producto_uuid === producto)
          if (linea) {
            const r2 = await api.agregar(producto, linea.cantidad)
            setCarrito(r2.carrito)
          }
        },
      })
    } catch (e) {
      aviso((e as Error).message)
    }
  }, [aviso, carrito])

  const vaciar = useCallback(async () => {
    const r = await api.vaciar()
    setCarrito(r.carrito)
    aviso('Carrito vaciado')
  }, [aviso])

  const valor = useMemo<Contexto>(() => ({
    usuario, rol, cargando, onboardingPendiente, suscripcion, completarOnboarding, entrar, salir, refrescarUsuario,
    carrito, refrescarCarrito, agregar, cambiar, quitarItem, vaciar,
    cajonAbierto,
    abrirCarrito: () => setCajonAbierto(true),
    cerrarCarrito: () => setCajonAbierto(false),
    aviso, avisos,
  }), [usuario, rol, cargando, onboardingPendiente, suscripcion, completarOnboarding, entrar, salir, refrescarUsuario, carrito, refrescarCarrito, agregar, cambiar, quitarItem, vaciar, cajonAbierto, aviso, avisos])

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}
