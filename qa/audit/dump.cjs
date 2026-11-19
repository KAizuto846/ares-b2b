const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright')
const fs = require('fs')

const VIEJO = 'http://127.0.0.1:3110'
const NUEVO = 'http://127.0.0.1:8081/spa'
const OUT = '/home/rizutov/ares-react/qa/audit'

const rutas = [
  ['perfil', '/perfil'],
  ['perfil-editar', '/perfil/editar'],
  ['perfil-privacidad', '/perfil/privacidad'],
  ['perfil-ajustes', '/perfil/ajustes'],
  ['perfil-seguridad', '/perfil/seguridad'],
  ['perfil-permisos', '/perfil/permisos'],
  ['kyc', '/kyc'],
  ['ayuda', '/ayuda'],
  ['mensajes', '/mensajes'],
  ['mensajes-notif', '/mensajes?tab=notificaciones'],
  ['notificaciones', '/notificaciones'],
]

async function dump(page) {
  return await page.evaluate(() => {
    const t = (e) => (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim()
    const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' }
    const heads = [...document.querySelectorAll('h1,h2,h3,h4')].filter(vis).map(e => e.tagName + ': ' + t(e))
    const campos = [...document.querySelectorAll('input,select,textarea')].filter(vis).map(e => {
      let lab = ''
      if (e.id) { const l = document.querySelector('label[for="' + e.id + '"]'); if (l) lab = t(l) }
      if (!lab) { const p = e.closest('label'); if (p) lab = t(p) }
      if (!lab && e.getAttribute('aria-label')) lab = e.getAttribute('aria-label')
      return { tipo: e.tagName.toLowerCase() + (e.type ? '[' + e.type + ']' : ''), nombre: e.name || e.id || '', label: lab.slice(0, 90), placeholder: e.placeholder || '', valor: (e.type === 'checkbox' || e.type === 'radio') ? (e.checked ? 'marcado' : 'sin marcar') : (e.value || '').toString().slice(0, 60), requerido: e.required, deshabilitado: e.disabled, opciones: e.tagName === 'SELECT' ? [...e.options].map(o => o.text.trim()).slice(0, 20) : undefined }
    })
    const botones = [...document.querySelectorAll('button,input[type=submit],input[type=button],[role=button]')].filter(vis).map(e => t(e) || e.value || e.getAttribute('aria-label') || '').filter(Boolean)
    const enlaces = [...document.querySelectorAll('a[href]')].filter(vis).map(e => ({ texto: t(e).slice(0, 60), href: e.getAttribute('href') }))
    const tablas = [...document.querySelectorAll('table')].filter(vis).map(tb => ({ columnas: [...tb.querySelectorAll('thead th')].map(th => t(th)), filas: tb.querySelectorAll('tbody tr').length }))
    const interruptores = [...document.querySelectorAll('input[type=checkbox],[role=switch],.interruptor,.switch,.toggle')].filter(vis).length
    const secciones = [...document.querySelectorAll('section,[class*=tarjeta],[class*=card],[class*=panel],[class*=bloque]')].filter(vis).slice(0, 40).map(e => t(e).slice(0, 120)).filter(s => s.length > 2)
    return { titulo: document.title, heads, campos, botones, enlaces, tablas, interruptores, secciones, texto: (document.body.innerText || '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 4000) }
  })
}

;(async () => {
  const browser = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] })
  const out = {}
  for (const [app, base, estado] of [['viejo', VIEJO, 'viejo'], ['nuevo', NUEVO, 'nuevo']]) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, storageState: `${OUT}/../.estado-${estado}-comercio.json` })
    const page = await ctx.newPage()
    const errs = []
    page.on('pageerror', e => errs.push(String(e).slice(0, 200)))
    page.on('response', r => { if (r.status() >= 400) errs.push(r.status() + ' ' + r.url().slice(0, 120)) })
    for (const [nombre, ruta] of rutas) {
      try {
        await page.goto(base + ruta, { waitUntil: 'networkidle', timeout: 30000 })
        await page.waitForTimeout(2600)
        const d = await dump(page)
        d.urlFinal = page.url()
        d.errores = errs.splice(0)
        out[app + ':' + nombre] = d
        await page.screenshot({ path: `${OUT}/perfil-${nombre}-${app}.png`, fullPage: true })
      } catch (e) {
        out[app + ':' + nombre] = { error: String(e).slice(0, 200) }
      }
    }
    await ctx.close()
  }
  await browser.close()
  fs.writeFileSync(`${OUT}/dump.json`, JSON.stringify(out, null, 1))
  for (const k of Object.keys(out)) {
    const d = out[k]
    console.log('=== ' + k + ' | ' + (d.urlFinal || d.error || '') + ' | campos:' + (d.campos ? d.campos.length : '-') + ' botones:' + (d.botones ? d.botones.length : '-') + ' tablas:' + (d.tablas ? d.tablas.length : '-'))
  }
})()
