import { useEffect, useRef, useState } from 'react'
import { apiPerfil, leerDataUrl } from '../../lib/api-perfil'
import type { Kyc as DatosKyc } from '../../lib/api-perfil'
import { useNavegar } from '../../store/session'
import { Skeleton } from '../../components/UI'
import Icon from '../../components/Icon'

const ETIQUETAS: Record<string, string> = {
  identificacion: 'Identificación oficial',
  licencia: 'Licencia de conducir',
  tarjeta_circulacion: 'Tarjeta de circulación',
  antecedentes: 'Carta de antecedentes',
  selfie: 'Selfie con identificación',
  constancia_sat: 'Constancia de situación fiscal',
  comprobante_domicilio: 'Comprobante de domicilio',
  rfc_documento: 'Documento del RFC',
}

const ESTADOS: Record<string, { texto: string; tono: string }> = {
  aprobado: { texto: 'Aprobado', tono: 'ok' },
  pendiente: { texto: 'En revisión', tono: 'alerta' },
  rechazado: { texto: 'Rechazado', tono: 'malo' },
  vencido: { texto: 'Vencido', tono: 'neutro' },
}

const estado = (clave: string) => ESTADOS[clave] ?? { texto: clave, tono: 'neutro' }

export default function Kyc() {
  const [datos, setDatos] = useState<DatosKyc | null>(null)
  const [tipo, setTipo] = useState('identificacion')
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [subiendo, setSubiendo] = useState(false)
  const archivo = useRef<HTMLInputElement>(null)
  const navegar = useNavegar()

  useEffect(() => {
    apiPerfil.kyc()
      .then((d) => {
        setDatos(d)
        setTipo(d.tipos[0] ?? 'identificacion')
        document.documentElement.dataset.tema = d.tema
      })
      .catch((e) => setError((e as Error).message))
  }, [])

  const subir = async (e: React.FormEvent) => {
    e.preventDefault()
    const f = archivo.current?.files?.[0]
    if (!f) {
      setError('Elige el archivo del documento.')
      return
    }
    if (f.size > 10 * 1024 * 1024) {
      setError('El archivo pasa de 10 MB.')
      return
    }

    setSubiendo(true)
    setError('')
    setOk('')
    try {
      const dataUrl = await leerDataUrl(f)
      const r = await apiPerfil.subirKyc(tipo, dataUrl)
      setDatos((d) => (d ? { ...d, estado: r.estado } : d))
      setOk(r.mensaje)
      if (archivo.current) archivo.current.value = ''
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubiendo(false)
    }
  }

  if (error && !datos) return <div className="aviso aviso--error" role="alert">{error}</div>
  if (!datos) return <div style={{ display: 'grid', gap: 12 }}><Skeleton h={110} /><Skeleton h={220} /><Skeleton h={180} /></div>

  const k = datos.estado
  const sinRequerimientos = k.requeridos.length === 0

  return (
    <div className="perfil-form">
      <header className="pagina-cab">
        <div className="rise">
          <h1>Verificación de identidad</h1>
          <p>Sube tus documentos en JPG, PNG o PDF (máximo 10 MB cada uno).</p>
        </div>
        <button type="button" className="btn btn--claro rise" style={{ ['--i' as string]: 1 }} onClick={() => navegar('/perfil')}>
          <Icon name="flecha" size={15} /> Mi perfil
        </button>
      </header>

      {ok && <div className="aviso aviso--ok" role="status">{ok}</div>}
      {error && <div className="aviso aviso--error" role="alert">{error}</div>}

      <section className="card rise" style={{ ['--i' as string]: 1 }}>
        <div className="card__cab">
          <h2 style={{ fontSize: 16 }}>Estado de la cuenta</h2>
          {sinRequerimientos
            ? <span className="chip chip--neutro" style={{ marginLeft: 'auto' }}>Tu rol no requiere documentos</span>
            : k.completo
              ? <span className="chip chip--ok" style={{ marginLeft: 'auto' }}><Icon name="ok" size={13} /> Verificado</span>
              : <span className="chip chip--alerta" style={{ marginLeft: 'auto' }}>Verificación pendiente</span>}
        </div>
        <div className="card__cuerpo perfil-kyc">
          {sinRequerimientos ? (
            <p className="perfil-pista" style={{ margin: 0 }}>
              Con tu rol actual no necesitas documentos para operar. Si más adelante te sumas como mayorista o
              repartidor, aquí aparecerá la lista que te toca.
            </p>
          ) : (
            <>
              <div className="perfil-kyc__resumen">
                <div>
                  <strong>Documentos obligatorios</strong>
                  <p className="perfil-pista" style={{ margin: '2px 0 0' }}>{k.requeridos.map((r) => ETIQUETAS[r] ?? r).join(' · ')}</p>
                </div>
                <div className="perfil-kyc__cifras">
                  <span><strong>{k.aprobados}</strong> aprobados</span>
                  <span><strong>{k.en_revision}</strong> en revisión</span>
                  <span><strong>{k.faltantes.length}</strong> faltantes</span>
                </div>
              </div>

              {k.faltantes.length > 0 && (
                <div className="aviso aviso--info">
                  Falta aprobar: {k.faltantes.map((f) => ETIQUETAS[f] ?? f).join(', ')}.
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <section className="card rise" style={{ ['--i' as string]: 2 }}>
        <div className="card__cab"><h2 style={{ fontSize: 16 }}>Subir documento</h2></div>
        <div className="card__cuerpo">
          <form className="perfil-form__rejilla" onSubmit={subir}>
            <label className="campo">
              <span>Tipo de documento</span>
              <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
                {datos.tipos.map((t) => (
                  <option value={t} key={t}>{ETIQUETAS[t] ?? t}</option>
                ))}
              </select>
            </label>

            <label className="campo">
              <span>Archivo</span>
              <input ref={archivo} type="file" accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf" required />
            </label>

            <div className="perfil-form__acciones perfil-form__ancho">
              <button type="submit" className="btn" disabled={subiendo}>
                <Icon name="subir" size={16} /> {subiendo ? 'Subiendo…' : 'Subir documento'}
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className="card rise" style={{ ['--i' as string]: 3 }}>
        <div className="card__cab"><h2 style={{ fontSize: 16 }}>Mis documentos</h2></div>
        <div className="tabla-scroll">
          <table className="tabla">
            <thead>
              <tr><th>Documento</th><th>Estado</th><th>Enviado</th><th>Motivo</th></tr>
            </thead>
            <tbody>
              {k.documentos.length === 0 && (
                <tr><td colSpan={4}><span className="perfil-pista">Sin documentos todavía.</span></td></tr>
              )}
                {k.documentos.map((d) => {
                  const e = estado(d.estado)
                  return (
                    <tr key={d.id}>
                      <td>{ETIQUETAS[d.tipo] ?? d.tipo}</td>
                      <td><span className={`chip chip--${e.tono}`}>{e.texto}</span></td>
                      <td>{d.created_at}</td>
                      <td><span className="perfil-pista">{d.motivo_rechazo || '—'}</span></td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
