import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Aviso, Skeleton, Vacio } from '../components/UI'
import { money } from '../lib/format'
import { apiFacturacion, apiGuardarDatosFiscales, apiSolicitarFactura, CP_VALIDO, RFC_VALIDO } from '../lib/api-finanzas'
import type { DatosFiscales, FacturacionDatos } from '../lib/api-finanzas'
import { useNavegar } from '../store/session'

const VACIO: DatosFiscales = { rfc: '', razon_social: '', regimen_fiscal: '', cp: '', uso_cfdi: '', correo_receptor: '' }

const TONO: Record<string, string> = { timbrada: 'ok', generada: 'alerta', cancelada: 'malo' }
const ETIQUETA: Record<string, string> = { timbrada: 'Timbrada', generada: 'Pendiente de timbrar', cancelada: 'Cancelada' }

type Mensaje = { tipo: 'ok' | 'error' | 'info'; texto: string } | null

export default function Facturacion() {
  const navegar = useNavegar()
  const [info, setInfo] = useState<FacturacionDatos | null>(null)
  const [error, setError] = useState('')
  const [form, setForm] = useState<DatosFiscales>(VACIO)
  const [aviso, setAviso] = useState<Mensaje>(null)
  const [guardando, setGuardando] = useState(false)
  const [solicitando, setSolicitando] = useState('')

  useEffect(() => {
    apiFacturacion()
      .then((r) => {
        setInfo(r)
        if (r.datos_fiscales) {
          setForm(r.datos_fiscales)
        } else {
          setForm({
            ...VACIO,
            regimen_fiscal: r.regimenes[0]?.clave ?? '',
            uso_cfdi: r.usos.find((u) => u.clave === 'G01')?.clave ?? r.usos[0]?.clave ?? '',
          })
        }
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  const errores = useMemo(() => {
    const e: Record<string, string> = {}
    if (form.rfc !== '' && !RFC_VALIDO.test(form.rfc.toUpperCase())) e.rfc = 'Formato: 3 o 4 letras, 6 dígitos de fecha y 3 de homoclave.'
    if (form.cp !== '' && !CP_VALIDO.test(form.cp)) e.cp = 'Cinco dígitos.'
    return e
  }, [form.rfc, form.cp])

  const puedeGuardar =
    RFC_VALIDO.test(form.rfc.toUpperCase()) &&
    form.razon_social.trim() !== '' &&
    CP_VALIDO.test(form.cp) &&
    form.regimen_fiscal !== '' &&
    form.uso_cfdi !== ''

  const campo = (clave: keyof DatosFiscales, valor: string) => setForm((f) => ({ ...f, [clave]: valor }))

  const guardar = (ev: FormEvent) => {
    ev.preventDefault()
    if (!puedeGuardar) {
      setAviso({ tipo: 'error', texto: 'Revisa los campos marcados antes de guardar.' })
      return
    }
    setGuardando(true)
    setAviso(null)
    apiGuardarDatosFiscales({ ...form, rfc: form.rfc.toUpperCase() })
      .then((r) => {
        setAviso({ tipo: 'ok', texto: r.mensaje })
        setForm(r.datos_fiscales)
        setInfo((i) => (i ? { ...i, datos_fiscales: r.datos_fiscales } : i))
      })
      .catch((e: Error) => setAviso({ tipo: 'error', texto: e.message }))
      .finally(() => setGuardando(false))
  }

  const solicitar = (uuid: string) => {
    setSolicitando(uuid)
    setAviso(null)
    apiSolicitarFactura(uuid)
      .then((r) => {
        setAviso({ tipo: 'ok', texto: r.mensaje })
        return apiFacturacion().then(setInfo)
      })
      .catch((e: Error) => setAviso({ tipo: 'error', texto: e.message }))
      .finally(() => setSolicitando(''))
  }

  if (error) return <Aviso tipo="error">{error}</Aviso>
  if (!info) {
    return (
      <div style={{ display: 'grid', gap: 18 }}>
        <Skeleton h={44} w="40%" />
        <div className="card"><div className="card__cuerpo"><Skeleton h={200} /></div></div>
      </div>
    )
  }

  return (
    <div className="fin-pagina">
      <header className="pagina-cab">
        <div className="rise">
          <h1>Facturación</h1>
          <p>Tus datos fiscales y las facturas en las que participas.</p>
        </div>
      </header>

      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}

      <section className="card rise" style={{ ['--i' as string]: 1 }}>
        <div className="card__cab">
          <h2>{info.datos_fiscales === null ? 'Registra tus datos fiscales' : 'Tus datos fiscales'}</h2>
        </div>
        <div className="card__cuerpo">
          <p className="fin-nota" style={{ marginTop: 0 }}>
            Son necesarios para emitir facturas CFDI 4.0. El RFC y el código postal se validan con el formato oficial del SAT.
          </p>
          <form className="fin-form" onSubmit={guardar} noValidate>
            <label className="campo">
              <span>RFC</span>
              <input
                value={form.rfc}
                onChange={(e) => campo('rfc', e.target.value.toUpperCase())}
                placeholder="XAXX010101000"
                maxLength={13}
                required
                autoComplete="off"
                aria-invalid={!!errores.rfc}
              />
              {errores.rfc && <small className="fin-error">{errores.rfc}</small>}
            </label>
            <label className="campo">
              <span>Razón social</span>
              <input
                value={form.razon_social}
                onChange={(e) => campo('razon_social', e.target.value)}
                maxLength={200}
                required
                autoComplete="off"
              />
            </label>
            <label className="campo">
              <span>Régimen fiscal</span>
              <select value={form.regimen_fiscal} onChange={(e) => campo('regimen_fiscal', e.target.value)} required>
                <option value="" disabled>Elige un régimen</option>
                {info.regimenes.map((r) => <option key={r.clave} value={r.clave}>{r.clave} · {r.nombre}</option>)}
              </select>
            </label>
            <label className="campo">
              <span>Código postal</span>
              <input
                value={form.cp}
                onChange={(e) => campo('cp', e.target.value.replace(/\D/g, '').slice(0, 5))}
                placeholder="01000"
                inputMode="numeric"
                maxLength={5}
                required
                autoComplete="postal-code"
                aria-invalid={!!errores.cp}
              />
              {errores.cp && <small className="fin-error">{errores.cp}</small>}
            </label>
            <label className="campo">
              <span>Uso de CFDI</span>
              <select value={form.uso_cfdi} onChange={(e) => campo('uso_cfdi', e.target.value)} required>
                <option value="" disabled>Elige un uso</option>
                {info.usos.map((u) => <option key={u.clave} value={u.clave}>{u.clave} · {u.nombre}</option>)}
              </select>
            </label>
            <label className="campo">
              <span>Correo de recepción</span>
              <input
                type="email"
                value={form.correo_receptor}
                onChange={(e) => campo('correo_receptor', e.target.value)}
                placeholder="facturas@correo.com"
                autoComplete="email"
              />
            </label>
            <div className="fin-form__pie">
              <button type="submit" className="btn" disabled={guardando || !puedeGuardar}>
                {guardando ? 'Guardando…' : 'Guardar datos'}
              </button>
              {!puedeGuardar && <span className="fin-nota">Completa RFC, razón social, régimen, CP y uso de CFDI.</span>}
            </div>
          </form>
        </div>
      </section>

      {info.es_comercio && (
        <section className="card rise" style={{ ['--i' as string]: 2 }}>
          <div className="card__cab"><h2>Pedidos listos para facturar</h2></div>
          {info.facturables.length === 0 ? (
            <div className="card__cuerpo fin-nota">Sin pedidos cerrados pendientes de facturar.</div>
          ) : (
            <div className="tabla-scroll">
              <table className="tabla">
                <thead><tr><th>Pedido</th><th>Mayorista</th><th>Fecha</th><th style={{ textAlign: 'right' }}>Total</th><th /></tr></thead>
                <tbody>
                  {info.facturables.map((p) => (
                    <tr key={p.uuid}>
                      <td><code style={{ fontSize: 12.5 }}>{p.uuid.slice(0, 8)}</code></td>
                      <td>{p.mayorista}</td>
                      <td>{p.fecha}</td>
                      <td className="num" style={{ textAlign: 'right', fontWeight: 650 }}>{money(p.total)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button type="button" className="btn btn--claro btn--mini" disabled={solicitando === p.uuid} onClick={() => solicitar(p.uuid)}>
                          {solicitando === p.uuid ? 'Solicitando…' : 'Solicitar factura'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <section className="card rise" style={{ ['--i' as string]: 3 }}>
        <div className="card__cab">
          <h2>Facturas</h2>
          <span className="fin-nota">{info.facturas.length}</span>
        </div>
        {info.facturas.length === 0 ? (
          <Vacio titulo="Todavía no hay facturas" texto="Aparecerán aquí en cuanto se emita la primera de tus pedidos." />
        ) : (
          <div className="tabla-scroll">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Folio</th>
                  <th>Sentido</th>
                  <th>RFC emisor</th>
                  <th>RFC receptor</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th>UUID timbre</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {info.facturas.map((f) => (
                  <tr key={f.uuid}>
                    <td><code style={{ fontSize: 12.5 }}>{f.folio_texto}</code></td>
                    <td>
                      <span className={`chip chip--${f.direccion === 'emitida' ? 'info' : 'neutro'}`}>
                        {f.direccion === 'emitida' ? 'Emitida' : 'Recibida'}
                      </span>
                    </td>
                    <td>{f.rfc_emisor === '' ? '—' : f.rfc_emisor}</td>
                    <td>{f.rfc_receptor === '' ? '—' : f.rfc_receptor}</td>
                    <td className="num" style={{ textAlign: 'right', fontWeight: 650 }}>{money(f.total)}</td>
                    <td><code style={{ fontSize: 12 }}>{f.uuid_timbrado ? f.uuid_timbrado.slice(0, 8) + '…' : 'sin timbre'}</code></td>
                    <td><span className={`chip chip--${TONO[f.estado] ?? 'neutro'}`}>{ETIQUETA[f.estado] ?? f.estado}</span></td>
                    <td style={{ textAlign: 'right' }}>
                      <button type="button" className="btn btn--claro btn--mini" onClick={() => navegar(`/finanzas/factura/${f.uuid}`)}>
                        Ver hoja
                      </button>
                    </td>
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
