import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import { money } from '../lib/format'

/* ------------------------------------------------------------------ *
 * Regla de la casa: esto es una pasarela DEMO. El número, el titular,
 * el vencimiento y el CVV viven sólo en el estado de este componente:
 * no se guardan en el padre, no se persisten y no viajan al backend.
 * ------------------------------------------------------------------ */

export type MarcaTarjeta = 'visa' | 'mastercard' | 'amex' | 'generica'

export const soloDigitos = (v: string) => v.replace(/\D/g, '')

/** Algoritmo de Luhn: true si el número es autoconsistente (dígito verificador). */
export function luhn(numero: string): boolean {
  const d = soloDigitos(numero)
  if (d.length < 13 || d.length > 19) return false
  let suma = 0
  for (let i = 0; i < d.length; i++) {
    let x = Number(d[d.length - 1 - i])
    if (i % 2 === 1) {
      x *= 2
      if (x > 9) x -= 9
    }
    suma += x
  }
  return suma % 10 === 0
}

export function marcaDe(numero: string): MarcaTarjeta {
  const d = soloDigitos(numero)
  if (d.startsWith('4')) return 'visa'
  if (d.startsWith('5')) return 'mastercard'
  if (d.startsWith('3')) return 'amex'
  return 'generica'
}

const NOMBRE_MARCA: Record<MarcaTarjeta, string> = {
  visa: 'VISA',
  mastercard: 'Mastercard',
  amex: 'Amex',
  generica: 'Tarjeta',
}

const LARGO_MAX: Record<MarcaTarjeta, number> = {
  visa: 16,
  mastercard: 16,
  amex: 15,
  generica: 19,
}

/** Agrupa los dígitos en bloques de cuatro: «4242 4242 4242 4242». */
export function agrupar(digitos: string): string {
  return soloDigitos(digitos).replace(/(\d{4})(?=\d)/g, '$1 ')
}

/**
 * Vencimiento MM/AA. El mes debe existir y la tarjeta sigue siendo válida
 * durante todo su mes de vencimiento (compara contra el mes actual).
 */
export function vencimientoValido(v: string, hoy: Date = new Date()): boolean {
  const m = /^(\d{2})\/(\d{2})$/.exec(v.trim())
  if (!m) return false
  const mes = Number(m[1])
  const anio = 2000 + Number(m[2])
  if (mes < 1 || mes > 12) return false
  // Primer día del mes siguiente al vencimiento vs. primer día del mes actual.
  const finDeMes = new Date(anio, mes, 1)
  const inicioDeMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
  return finDeMes > inicioDeMes
}

/** Amex usa 4 dígitos de CVV; el resto acepta 3 o 4. */
export function cvvValido(cvv: string, marca: MarcaTarjeta): boolean {
  const d = soloDigitos(cvv)
  return marca === 'amex' ? d.length === 4 : d.length === 3 || d.length === 4
}

const errorEstilo = { color: '#8f1d17', fontSize: 12, lineHeight: 1.35 } as const

/**
 * Pantalla de datos de tarjeta del cobro del POS (demo).
 * Valida formato, marca y Luhn en el cliente; al confirmar sólo avisa al
 * padre para que mande el método «tarjeta» como siempre.
 */
export default function TarjetaDemo({
  total,
  alListar,
  alCancelar,
}: {
  total?: number
  alListar: () => void
  alCancelar: () => void
}) {
  const [numero, setNumero] = useState('')
  const [titular, setTitular] = useState('')
  const [vence, setVence] = useState('')
  const [cvv, setCvv] = useState('')
  const [tocado, setTocado] = useState<Record<string, boolean>>({})
  const [enviando, setEnviando] = useState(false)
  const primero = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    primero.current?.focus()
  }, [])

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') alCancelar()
    }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [alCancelar])

  const marca = marcaDe(numero)
  const dig = soloDigitos(numero)
  const numeroOk = dig.length >= 13 && luhn(dig)
  const venceOk = vencimientoValido(vence)
  const cvvOk = cvvValido(cvv, marca)
  const titularOk = titular.trim().length >= 3
  const listo = numeroOk && venceOk && cvvOk && titularOk

  const marcar = (campo: string) => setTocado((t) => ({ ...t, [campo]: true }))

  const errores: Record<string, string> = {}
  if (tocado.numero && dig.length > 0 && !numeroOk) {
    errores.numero =
      dig.length < 13 ? 'El número está incompleto.' : 'El número no es válido: falla el dígito verificador.'
  }
  if (tocado.vence && vence !== '' && !venceOk) {
    const m = /^(\d{2})\/(\d{2})$/.exec(vence)
    errores.vence = !m ? 'Usa el formato MM/AA.' : Number(m[1]) < 1 || Number(m[1]) > 12 ? 'El mes va del 01 al 12.' : 'La tarjeta está vencida.'
  }
  if (tocado.cvv && cvv !== '' && !cvvOk) {
    errores.cvv = marca === 'amex' ? 'Amex usa 4 dígitos.' : 'Escribe 3 o 4 dígitos.'
  }
  if (tocado.titular && titular !== '' && !titularOk) {
    errores.titular = 'Escribe el nombre como aparece en la tarjeta.'
  }

  const escribirNumero = (v: string) => {
    const d = soloDigitos(v).slice(0, LARGO_MAX[marcaDe(v)])
    setNumero(agrupar(d))
  }

  const escribirVence = (v: string) => {
    const d = soloDigitos(v).slice(0, 4)
    setVence(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d)
  }

  const confirmar = () => {
    if (!listo || enviando) return
    setEnviando(true)
    alListar()
  }

  return (
    <div className="pos-modal" role="dialog" aria-modal="true" aria-labelledby="tarjeta-titulo">
      <div className="pos-modal__caja pos-modal__caja--ancha">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span className="pos-modal__icono" style={{ margin: 0, width: 42, height: 42 }}>
            <Icon name="dinero" size={20} />
          </span>
          <div>
            <h2 id="tarjeta-titulo" style={{ margin: 0, fontSize: 19 }}>
              Datos de la tarjeta
            </h2>
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>
              {total != null ? `Cobro de ${money(total)} · ` : ''}validación local, sin pasarela real
            </p>
          </div>
        </div>

        <div className="aviso aviso--info" style={{ marginBottom: 14, alignItems: 'flex-start' }}>
          <Icon name="candado" size={16} />
          <span>
            Modo prueba: no se realiza ningún cobro real y tus datos no se guardan ni salen de tu navegador.
          </span>
        </div>

        <div
          aria-hidden="true"
          style={{
            display: 'grid',
            gap: 10,
            padding: '15px 18px',
            marginBottom: 16,
            borderRadius: 14,
            background: 'linear-gradient(135deg, #14352a, #1f5c44)',
            color: '#eaf5ee',
            boxShadow: '0 8px 20px rgba(10, 30, 22, .22)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', opacity: 0.75 }}>
              Modo prueba
            </span>
            <strong style={{ fontSize: 13, letterSpacing: '.05em' }}>{NOMBRE_MARCA[marca]}</strong>
          </div>
          <div
            className="num"
            style={{ fontSize: 19, fontWeight: 650, letterSpacing: '.08em', wordBreak: 'break-word' }}
          >
            {numero || '•••• •••• •••• ••••'}
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              fontSize: 12.5,
              letterSpacing: '.05em',
              textTransform: 'uppercase',
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {titular.trim() || 'Nombre del titular'}
            </span>
            <span className="num" style={{ flex: '0 0 auto' }}>
              {vence || 'MM/AA'}
            </span>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            confirmar()
          }}
          style={{ display: 'grid', gap: 12 }}
        >
          <label className="campo">
            <span>Número de tarjeta</span>
            <input
              ref={primero}
              type="text"
              className="num"
              style={{ width: '100%' }}
              value={numero}
              onChange={(e) => escribirNumero(e.target.value)}
              onBlur={() => marcar('numero')}
              placeholder="4242 4242 4242 4242"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={Boolean(errores.numero)}
            />
            {errores.numero && <small style={errorEstilo}>{errores.numero}</small>}
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label className="campo">
              <span>Vencimiento</span>
              <input
                type="text"
                className="num"
                style={{ width: '100%' }}
                value={vence}
                onChange={(e) => escribirVence(e.target.value)}
                onBlur={() => marcar('vence')}
                placeholder="MM/AA"
                inputMode="numeric"
                autoComplete="off"
                aria-invalid={Boolean(errores.vence)}
              />
              {errores.vence && <small style={errorEstilo}>{errores.vence}</small>}
            </label>

            <label className="campo">
              <span>CVV</span>
              <input
                type="text"
                className="num"
                style={{ width: '100%' }}
                value={cvv}
                onChange={(e) => setCvv(soloDigitos(e.target.value).slice(0, 4))}
                onBlur={() => marcar('cvv')}
                placeholder={marca === 'amex' ? '1234' : '123'}
                inputMode="numeric"
                autoComplete="off"
                aria-invalid={Boolean(errores.cvv)}
              />
              {errores.cvv && <small style={errorEstilo}>{errores.cvv}</small>}
            </label>
          </div>

          <label className="campo">
            <span>Nombre del titular</span>
            <input
              type="text"
              style={{ width: '100%' }}
              value={titular}
              onChange={(e) => setTitular(e.target.value)}
              onBlur={() => marcar('titular')}
              placeholder="Como aparece en la tarjeta"
              autoComplete="off"
              aria-invalid={Boolean(errores.titular)}
            />
            {errores.titular && <small style={errorEstilo}>{errores.titular}</small>}
          </label>

          <p className="apunte" style={{ margin: 0 }}>
            Prueba con 4242 4242 4242 4242 · cualquier vencimiento futuro y un CVV de 3 dígitos.
          </p>

          <div className="pos-modal__acciones">
            <button type="button" className="btn btn--claro" onClick={alCancelar} disabled={enviando}>
              Cancelar
            </button>
            <button type="submit" className="btn" disabled={!listo || enviando}>
              {enviando ? 'Procesando…' : 'Confirmar pago'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
