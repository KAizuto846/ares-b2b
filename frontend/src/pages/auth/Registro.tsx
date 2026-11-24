import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../components/Icon'
import { CODIGO_CORREO_REPETIDO, apiAuth, codigoError, medirPassword } from '../../lib/api-auth'
import type { AltaRespuesta, RolAlta, RolCatalogo } from '../../lib/api-auth'

type PropsClave = {
  id: string
  etiqueta: string
  valor: string
  alCambiar: (valor: string) => void
  autoComplete?: string
  placeholder?: string
  pista?: string
  error?: string
  autoFocus?: boolean
}

/**
 * Campo de contraseña con botón de ojo (mostrar / ocultar).
 * Vive aquí y lo reutiliza Restablecer para no duplicar el control.
 */
export function CampoClave({
  id, etiqueta, valor, alCambiar, autoComplete = 'new-password', placeholder, pista, error, autoFocus,
}: PropsClave) {
  const [visible, setVisible] = useState(false)

  return (
    <label className="campo" htmlFor={id}>
      <span>{etiqueta}</span>
      <span className="auth-clave">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={valor}
          onChange={(e) => alCambiar(e.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          autoFocus={autoFocus}
          aria-invalid={!!error}
          required
        />
        <button
          type="button"
          className="auth-ojo"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          title={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        >
          <Icon name="ojo" size={18} />
        </button>
      </span>
      {pista && <span className="auth-pista">{pista}</span>}
      {error && <span className="auth-campo-error">{error}</span>}
    </label>
  )
}

/** Catálogo mínimo si /auth/roles no responde: la pantalla nunca queda vacía. */
const ROLES_POR_DEFECTO: RolCatalogo[] = [
  {
    clave: 'comercio',
    titulo: 'Comprar al mayoreo',
    descripcion: 'Surtes tu negocio con varios proveedores en un solo pedido.',
    detalle: 'Necesitas el nombre de tu negocio y un teléfono de contacto.',
    requiere_negocio: false,
    requiere_rfc: false,
  },
  {
    clave: 'mayorista',
    titulo: 'Vender al mayoreo',
    descripcion: 'Publicas tu catálogo y surtes a comercios de tu zona.',
    detalle: 'Necesitas el nombre comercial; el RFC se pide en KYC.',
    requiere_negocio: true,
    requiere_rfc: false,
  },
  {
    clave: 'repartidor',
    titulo: 'Repartir pedidos',
    descripcion: 'Recoges en el mayorista y entregas con el PIN del comprador.',
    detalle: 'Solo tu cuenta; los documentos del vehículo se suben en KYC.',
    requiere_negocio: false,
    requiere_rfc: false,
  },
]

export default function Registro() {
  const [roles, setRoles] = useState<RolCatalogo[]>(ROLES_POR_DEFECTO)
  const [rol, setRol] = useState<RolAlta>('comercio')
  const [nombre, setNombre] = useState('')
  const [negocio, setNegocio] = useState('')
  const [rfc, setRfc] = useState('')
  const [email, setEmail] = useState('')
  const [telefono, setTelefono] = useState('')
  const [password, setPassword] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [error, setError] = useState('')
  const [correoRepetido, setCorreoRepetido] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [alta, setAlta] = useState<AltaRespuesta | null>(null)

  useEffect(() => {
    let vivo = true
    apiAuth.roles()
      .then((lista) => { if (vivo && lista.length > 0) setRoles(lista) })
      .catch(() => { /* se queda el catálogo por defecto */ })
    return () => { vivo = false }
  }, [])

  const fuerza = medirPassword(password)
  const pideNegocio = rol !== 'repartidor'
  const pideRfc = rol === 'mayorista'
  const rolElegido = roles.find((r) => r.clave === rol)

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setCorreoRepetido(false)

    if (fuerza.faltas.length > 0) {
      setError(`A la contraseña le falta ${fuerza.faltas.join(', ')}.`)
      return
    }
    if (password !== confirmacion) {
      setError('Las dos contraseñas no coinciden.')
      return
    }
    if (pideNegocio && rol === 'mayorista' && negocio.trim() === '') {
      setError('Escribe el nombre comercial con el que vendes.')
      return
    }

    setCargando(true)
    try {
      const respuesta = await apiAuth.registro({
        rol,
        nombre: nombre.trim(),
        email: email.trim(),
        telefono: telefono.trim(),
        password,
        ...(pideNegocio && negocio.trim() !== '' ? { negocio: negocio.trim() } : {}),
        ...(pideRfc && rfc.trim() !== '' ? { rfc: rfc.trim() } : {}),
      })
      setAlta(respuesta)
    } catch (err) {
      if (codigoError(err) === CODIGO_CORREO_REPETIDO) setCorreoRepetido(true)
      setError((err as Error).message)
    } finally {
      setCargando(false)
    }
  }

  if (alta) {
    return (
      <div className="login auth-pantalla">
        <section className="login__form auth-pantalla__form">
          <div className="login__caja auth-tarjeta rise">
            <div className="auth-hecho">
              <span className="auth-hecho__icono auth-hecho__icono--ok"><Icon name="ok" size={26} /></span>
              <h1>Revisa tu correo</h1>
              <p>
                {alta.mensaje} Te escribimos a <strong>{alta.usuario.email}</strong>.
                Mientras tanto ya puedes entrar: tu cuenta de {rolElegido?.titulo.toLowerCase() ?? alta.rol} está creada.
              </p>
            </div>

            {alta.verificacion && (
              <div className="aviso aviso--info">
                <span>
                  Modo local: no hay servidor de correo, así que aquí tienes el enlace de confirmación.
                </span>
              </div>
            )}

            {alta.verificacion && (
              <Link className="btn btn--bloque" to={alta.verificacion.enlace}>
                Confirmar mi correo
              </Link>
            )}

            <Link className={alta.verificacion ? 'btn btn--claro btn--bloque' : 'btn btn--bloque'} to="/login">
              Entrar a mi cuenta
            </Link>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="login auth-pantalla">
      <section className="login__form auth-pantalla__form">
        <form className="login__caja auth-tarjeta rise" onSubmit={enviar} noValidate>
          <div className="auth-cab">
            <span className="marca__logo" style={{ width: 40, height: 40 }}><img src="/spa/favicon.svg" alt="Ares" width="20" height="20" /></span>
            <div>
              <h1>Crea tu cuenta</h1>
              <p>Compra al mayoreo, vende tus productos o reparte pedidos.</p>
            </div>
          </div>

          {error && (
            <div className="aviso aviso--error" role="alert">
              <span>{error}</span>
            </div>
          )}

          {correoRepetido && (
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13 }}>
              <Link to="/login" style={{ color: 'var(--verde-2)', fontWeight: 650 }}>Entrar con ese correo</Link>
              <Link to="/recuperar" style={{ color: 'var(--verde-2)', fontWeight: 650 }}>Recuperar la contraseña</Link>
            </div>
          )}

          <fieldset className="auth-roles">
            <legend>Quiero</legend>
            <div className="auth-roles__rejilla" role="radiogroup" aria-label="Tipo de cuenta">
              {roles.map((r) => (
                <button
                  key={r.clave}
                  type="button"
                  role="radio"
                  aria-checked={rol === r.clave}
                  className={rol === r.clave ? 'auth-rol auth-rol--activo' : 'auth-rol'}
                  onClick={() => setRol(r.clave)}
                >
                  <strong>{r.titulo}</strong>
                  <small>{r.descripcion}</small>
                  {rol === r.clave && <span className="auth-rol__detalle">{r.detalle}</span>}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="campo">
            <span>Tu nombre</span>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              autoComplete="name"
              placeholder="Riz Hernández"
              required
            />
          </label>

          {pideNegocio && (
            <label className="campo">
              <span>{rol === 'mayorista' ? 'Nombre comercial' : 'Nombre del negocio'}</span>
              <input
                type="text"
                value={negocio}
                onChange={(e) => setNegocio(e.target.value)}
                autoComplete="organization"
                placeholder={rol === 'mayorista' ? 'Insumos del Valle' : 'Abarrotes La Esquina'}
                required={rol === 'mayorista'}
              />
              {rol === 'comercio' && <span className="auth-pista">Así te verán los mayoristas en tus pedidos.</span>}
            </label>
          )}

          <div className="auth-doble">
            <label className="campo">
              <span>Correo</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="tu@negocio.mx"
                required
              />
            </label>

            <label className="campo">
              <span>Teléfono</span>
              <input
                type="tel"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                autoComplete="tel"
                inputMode="tel"
                placeholder="5512345678"
                required
              />
            </label>
          </div>

          {pideRfc && (
            <label className="campo">
              <span>RFC (opcional)</span>
              <input
                type="text"
                value={rfc}
                onChange={(e) => setRfc(e.target.value.toUpperCase())}
                placeholder="ABC010101AB1"
                maxLength={13}
              />
              <span className="auth-pista">Lo verificado en KYC es lo que aparece en tus facturas.</span>
            </label>
          )}

          <CampoClave
            id="alta-clave"
            etiqueta="Contraseña"
            valor={password}
            alCambiar={setPassword}
            placeholder="Mínimo 12 caracteres"
            pista="Usa mayúsculas, números y un símbolo."
          />

          <div className={`auth-fuerza auth-fuerza--${fuerza.nivel}`} aria-hidden="true">
            <i /><i /><i /><i />
          </div>
          <span className="auth-fuerza__texto">
            {password === '' ? 'Seguridad de la contraseña: sin evaluar' : `Seguridad: ${fuerza.etiqueta}`}
            {password !== '' && fuerza.faltas.length > 0 ? ` · falta ${fuerza.faltas.join(', ')}` : ''}
          </span>

          <CampoClave
            id="alta-clave-2"
            etiqueta="Repite la contraseña"
            valor={confirmacion}
            alCambiar={setConfirmacion}
            placeholder="Otra vez"
          />
          {confirmacion !== '' && confirmacion !== password && (
            <span className="auth-campo-error">Las dos contraseñas no coinciden.</span>
          )}

          <button className="btn btn--bloque" type="submit" disabled={cargando}>
            {cargando ? 'Creando cuenta…' : 'Crear cuenta'}
          </button>

          <p className="auth-pie">
            ¿Ya tienes cuenta? <Link to="/login">Entrar</Link>
          </p>
          <p className="auth-legal">
            Al crear una cuenta aceptas los <Link to="/terminos">términos</Link> y el{' '}
            <Link to="/privacidad">aviso de privacidad</Link>.
          </p>
        </form>
      </section>
    </div>
  )
}
