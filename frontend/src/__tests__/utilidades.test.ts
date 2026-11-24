import { describe, expect, it } from 'vitest'
import { luhn, marcaDe, agrupar, vencimientoValido, cvvValido } from '../components/TarjetaDemo'
import { money, money0, estado } from '../lib/format'

// TarjetaDemo: validación de tarjeta (paso de pago del POS y de anuncios)
describe('luhn', () => {
  it('acepta un número válido', () => {
    expect(luhn('4242 4242 4242 4242')).toBe(true)
  })
  it('rechaza un número inválido', () => {
    expect(luhn('4242 4242 4242 4241')).toBe(false)
  })
  it('rechaza cadenas con letras', () => {
    expect(luhn('4242abcd')).toBe(false)
  })
})

describe('marcaDe', () => {
  it('visa empieza con 4', () => {
    expect(marcaDe('4242424242424242')).toBe('visa')
  })
  it('mastercard empieza con 51-55', () => {
    expect(marcaDe('5105105105105100')).toBe('mastercard')
  })
})

describe('agrupar', () => {
  it('agrupa en bloques de 4', () => {
    expect(agrupar('4242424242424242')).toBe('4242 4242 4242 4242')
  })
  it('deja el último bloque incompleto tal cual', () => {
    expect(agrupar('42424')).toBe('4242 4')
  })
})

describe('vencimientoValido', () => {
  it('acepta un mes futuro', () => {
    expect(vencimientoValido('12/99', new Date('2026-01-01'))).toBe(true)
  })
  it('rechaza un mes pasado', () => {
    expect(vencimientoValido('01/24', new Date('2026-01-01'))).toBe(false)
  })
})

describe('cvvValido', () => {
  it('3 dígitos para visa', () => {
    expect(cvvValido('123', 'visa')).toBe(true)
  })
  it('rechaza 2 dígitos', () => {
    expect(cvvValido('12', 'visa')).toBe(false)
  })
})

// format: dinero y estados
describe('money', () => {
  it('formatea con 2 decimales y coma de miles', () => {
    expect(money(1278)).toBe('$1,278.00')
  })
})

describe('money0', () => {
  it('formatea sin decimales', () => {
    expect(money0(1278.4)).toBe('$1,278')
  })
})

describe('estado', () => {
  it('devuelve texto y tono para estados conocidos', () => {
    const e = estado('listo_para_recoger')
    expect(e.texto.length).toBeGreaterThan(0)
    expect(e.tono.length).toBeGreaterThan(0)
  })
  it('no truena con un estado desconocido', () => {
    expect(estado('no_existe')).toBeDefined()
  })
})
