import { useEffect, useRef, useState } from 'react'
import { apiPerfil, leerDataUrl } from '../../lib/api-perfil'
import type { Direccion, PerfilDetalle } from '../../lib/api-perfil'
import { useNavegar } from '../../store/session'
import { Skeleton } from '../../components/UI'
import Icon from '../../components/Icon'

type Formulario = {
  nombre: string
  email: string
  telefono: string
  nombre_negocio: string
  calle: string
  colonia: string
  ciudad: string
  estado_mx: string
  cp: string
  referencias: string
  latitud: string
  longitud: string
}

const vacio: Formulario = {
  nombre: '', email: '', telefono: '', nombre_negocio: '',
  calle: '', colonia: '', ciudad: '', estado_mx: '', cp: '', referencias: '',
  latitud: '19.432600', longitud: '-99.133200',
}

export default function EditarPerfil() {
  const [datos, setDatos] = useState<PerfilDetalle | null>(null)
  const [form, setForm] = useState<Formulario>(vacio)
  const [principal, setPrincipal] = useState<Direccion | null>(null)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const archivo = useRef<HTMLInputElement>(null)
  const navegar = useNavegar()

  useEffect(() => {
    apiPerfil.detalle()
      .then((d) => {
        setDatos(d)
        const p = d.direcciones[0] ?? null
        setPrincipal(p)
        setForm({
          nombre: d.usuario.nombre,
          email: d.usuario.email,
          telefono: d.usuario.telefono,
          nombre_negocio: d.perfil.nombre_negocio || d.perfil.nombre_comercial || '',
          calle: p?.calle ?? '',
          colonia: p?.colonia ?? '',
          ciudad: p?.ciudad ?? '',
          estado_mx: p?.estado_mx ?? '',
          cp: p?.cp ?? '',
          referencias: p?.referencias ?? '',
          latitud: String(p?.latitud ?? 19.4326),
          longitud: String(p?.longitud ?? -99.1332),
        })
      })
      .catch((e) => setError((e as Error).message))
  }, [])

  const cambiar = (clave: keyof Formulario) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [clave]: e.target.value }))

  const subirFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f || !datos) return
    setError('')
    setOk('')
    if (f.size > 2 * 1024 * 1024) {
      setError('La imagen no puede pesar más de 2 MB.')
      return
    }
    setSubiendo(true)
    try {
      const dataUrl = await leerDataUrl(f)
      const r = await apiPerfil.subirAvatar(dataUrl)
      setDatos({ ...datos, usuario: { ...datos.usuario, avatar: r.avatar } })
      setOk(r.mensaje)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubiendo(false)
      if (archivo.current) archivo.current.value = ''
    }
  }

  const quitarFoto = async () => {
    if (!datos) return
    setSubiendo(true)
    setError('')
    setOk('')
    try {
      const r = await apiPerfil.quitarAvatar()
      setDatos({ ...datos, usuario: { ...datos.usuario, avatar: null } })
      setOk(r.mensaje)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubiendo(false)
    }
  }

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setOk('')
    setGuardando(true)

    try {
      const guardado = await apiPerfil.guardar({
        nombre: form.nombre.trim(),
        email: form.email.trim(),
        telefono: form.telefono.trim(),
        ...(datos && (datos.rol === 'comercio' || datos.rol === 'mayorista')
          ? { nombre_negocio: form.nombre_negocio.trim() }
          : {}),
      })

      let mensaje = guardado.mensaje

      const quiereDireccion = form.calle.trim() !== '' && form.ciudad.trim() !== ''
      if (quiereDireccion) {
        const cuerpo = {
          alias: principal?.alias || 'Principal',
          calle: form.calle.trim(),
          colonia: form.colonia.trim(),
          ciudad: form.ciudad.trim(),
          estado_mx: form.estado_mx.trim(),
          cp: form.cp.trim(),
          referencias: form.referencias.trim(),
          latitud: Number(form.latitud) || 19.4326,
          longitud: Number(form.longitud) || -99.1332,
          es_principal: true,
        }

        if (principal) {
          await apiPerfil.editarDireccion(principal.id, cuerpo)
        } else {
          const creada = await apiPerfil.crearDireccion(cuerpo)
          setPrincipal({ ...cuerpo, id: creada.direccion.id, es_principal: 1 })
        }
        mensaje = 'Tus datos y tu dirección se guardaron.'
      }

      setOk(mensaje)
      if (datos) {
        setDatos({
          ...datos,
          usuario: { ...datos.usuario, nombre: guardado.usuario.nombre, email: guardado.usuario.email, telefono: guardado.usuario.telefono },
        })
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  if (error && !datos) return <div className="aviso aviso--error" role="alert">{error}</div>
  if (!datos) return <div style={{ display: 'grid', gap: 12 }}><Skeleton h={140} /><Skeleton h={260} /></div>

  const conNegocio = datos.rol === 'comercio' || datos.rol === 'mayorista'

  return (
    <div className="perfil-form">
      <header className="pagina-cab">
        <div className="rise">
          <h1>Editar cuenta</h1>
          <p>Nombre, contacto, foto y dirección de entrega.</p>
        </div>
        <button type="button" className="btn btn--claro rise" style={{ ['--i' as string]: 1 }} onClick={() => navegar('/perfil')}>
          Volver a mi perfil
        </button>
      </header>

      {ok && <div className="aviso aviso--ok" role="status">{ok}</div>}
      {error && <div className="aviso aviso--error" role="alert">{error}</div>}

      <section className="card rise" style={{ ['--i' as string]: 1 }}>
        <div className="card__cab"><h2 style={{ fontSize: 16 }}>Foto de perfil</h2></div>
        <div className="card__cuerpo perfil-avatar-editor">
          <div className="perfil-avatar-editor__foto">
            {datos.usuario.avatar
              ? <img src={datos.usuario.avatar} alt="Tu foto de perfil" width={96} height={96} />
              : <span aria-hidden="true">{datos.usuario.iniciales}</span>}
          </div>
          <div className="perfil-avatar-editor__acciones">
            <input
              ref={archivo}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={subirFoto}
              style={{ display: 'none' }}
              id="perfil-archivo-avatar"
            />
            <label className="btn btn--claro" htmlFor="perfil-archivo-avatar" aria-disabled={subiendo}>
              <Icon name="subir" size={16} /> {subiendo ? 'Procesando…' : 'Elegir imagen'}
            </label>
            {datos.usuario.avatar && (
              <button type="button" className="btn btn--claro" onClick={quitarFoto} disabled={subiendo}>
                <Icon name="basura" size={16} /> Quitar foto
              </button>
            )}
            <p className="perfil-pista">JPG, PNG o WebP · máximo 2 MB. Se recorta en cuadrado a 256 px.</p>
          </div>
        </div>
      </section>

      <form className="perfil-form__campos" onSubmit={enviar}>
        <section className="card rise" style={{ ['--i' as string]: 2 }}>
          <div className="card__cab"><h2 style={{ fontSize: 16 }}>Datos de la cuenta</h2></div>
          <div className="card__cuerpo perfil-form__rejilla">
            <label className="campo">
              <span>{conNegocio ? 'Nombre del negocio' : 'Nombre'}</span>
              <input type="text" value={form.nombre} onChange={cambiar('nombre')} required minLength={3} autoComplete="organization" />
            </label>

            {conNegocio && (
              <label className="campo">
                <span>Nombre comercial</span>
                <input type="text" value={form.nombre_negocio} onChange={cambiar('nombre_negocio')} autoComplete="organization" />
              </label>
            )}

            <label className="campo">
              <span>Correo</span>
              <input type="email" value={form.email} onChange={cambiar('email')} required autoComplete="email" />
            </label>

            <label className="campo">
              <span>Teléfono</span>
              <input type="tel" value={form.telefono} onChange={cambiar('telefono')} autoComplete="tel" inputMode="tel" placeholder="55 1234 5678" />
            </label>
          </div>
        </section>

        <section className="card rise" style={{ ['--i' as string]: 3 }}>
          <div className="card__cab"><h2 style={{ fontSize: 16 }}>Dirección de entrega</h2></div>
          <div className="card__cuerpo perfil-form__rejilla">
            <label className="campo perfil-form__ancho">
              <span>Calle y número</span>
              <input type="text" value={form.calle} onChange={cambiar('calle')} autoComplete="address-line1" placeholder="Av. Insurgentes Sur 1234" />
            </label>
            <label className="campo">
              <span>Colonia</span>
              <input type="text" value={form.colonia} onChange={cambiar('colonia')} autoComplete="address-line2" />
            </label>
            <label className="campo">
              <span>Ciudad</span>
              <input type="text" value={form.ciudad} onChange={cambiar('ciudad')} autoComplete="address-level2" />
            </label>
            <label className="campo">
              <span>Estado</span>
              <input type="text" value={form.estado_mx} onChange={cambiar('estado_mx')} autoComplete="address-level1" />
            </label>
            <label className="campo">
              <span>C.P.</span>
              <input type="text" value={form.cp} onChange={cambiar('cp')} inputMode="numeric" maxLength={5} autoComplete="postal-code" />
            </label>
            <label className="campo perfil-form__ancho">
              <span>Referencias</span>
              <input type="text" value={form.referencias} onChange={cambiar('referencias')} placeholder="Portón negro, entre calles…" />
            </label>
            <label className="campo">
              <span>Latitud</span>
              <input type="text" value={form.latitud} onChange={cambiar('latitud')} inputMode="decimal" />
            </label>
            <label className="campo">
              <span>Longitud</span>
              <input type="text" value={form.longitud} onChange={cambiar('longitud')} inputMode="decimal" />
            </label>
            <p className="perfil-pista perfil-form__ancho">
              Las coordenadas ubican el punto exacto de entrega. Si no las cambias se usa el centro de la ciudad.
            </p>
          </div>
        </section>

        <div className="perfil-form__acciones">
          <button type="button" className="btn btn--claro" onClick={() => navegar('/perfil')}>Cancelar</button>
          <button type="submit" className="btn" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar cambios'}</button>
        </div>

        <p className="perfil-pista">
          La contraseña y la baja de la cuenta se manejan en <button type="button" className="perfil-enlace" onClick={() => navegar('/perfil/seguridad')}>Seguridad</button>.
        </p>
      </form>
    </div>
  )
}
