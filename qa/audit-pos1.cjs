const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright')
const fs = require('fs'), path = require('path')
const OUT = '/home/rizutov/ares-react/qa/audit'
fs.mkdirSync(OUT, { recursive: true })

const INVENTARIO = () => {
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' }
  const t = (e) => (e.innerText || e.value || '').replace(/\s+/g, ' ').trim()
  const campo = (e) => {
    let et = ''
    if (e.id) { const l = document.querySelector(`label[for="${e.id}"]`); if (l) et = t(l) }
    if (!et) { const l = e.closest('label'); if (l) et = t(l) }
    if (!et && e.getAttribute('aria-label')) et = e.getAttribute('aria-label')
    if (!et && e.placeholder) et = 'ph:' + e.placeholder
    if (!et && e.previousElementSibling && e.previousElementSibling.tagName === 'LABEL') et = t(e.previousElementSibling)
    return { tag: e.tagName, tipo: e.type || '', nombre: e.name || e.id || '', etiqueta: et.slice(0, 60), opciones: e.tagName === 'SELECT' ? [...e.options].map(o => t(o)).slice(0, 12) : undefined }
  }
  return {
    h: [...document.querySelectorAll('h1,h2,h3')].filter(vis).map(t),
    botones: [...document.querySelectorAll('button, a.btn, .btn, .boton, [role="button"], a[class*="btn"]')].filter(vis).map(t).filter(x => x && x.length < 45),
    campos: [...document.querySelectorAll('input, select, textarea')].filter(vis).map(campo),
    th: [...document.querySelectorAll('th')].filter(vis).map(t),
    filas: [...document.querySelectorAll('tbody tr')].filter(vis).length,
    accionesFila: [...document.querySelectorAll('tbody tr:first-child button, tbody tr:first-child a, tbody tr:first-child [class*="accion"]')].filter(vis).map(t).filter(Boolean),
    textos: document.body.innerText.replace(/\s+/g, ' ').slice(0, 3000),
    dialogos: [...document.querySelectorAll('dialog, [class*="modal"], [class*="dialog"]')].filter(vis).length,
  }
}

;(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] })
  const ctxV = await b.newContext({ viewport: { width: 1440, height: 950 }, storageState: '/home/rizutov/ares-react/qa/.estado-viejo-comercio.json' })
  const ctxN = await b.newContext({ viewport: { width: 1440, height: 950 }, storageState: '/home/rizutov/ares-react/qa/.estado-nuevo-comercio.json' })
  const pv = await ctxV.newPage(); const pn = await ctxN.newPage()
  const res = {}
  const pantallas = [['pos', '/pos'], ['inventario', '/pos/inventario'], ['ventas', '/pos/ventas'], ['corte', '/pos/corte'], ['clientes', '/pos/clientes']]
  for (const [slug, ruta] of pantallas) {
    for (const [lado, page, base] of [['viejo', pv, 'http://127.0.0.1:3110'], ['nuevo', pn, 'http://127.0.0.1:8081/spa']]) {
      await page.goto(base + ruta, { waitUntil: 'networkidle' })
      await page.waitForTimeout(1200)
      res[`${slug}-${lado}`] = { url: page.url(), ...(await page.evaluate(INVENTARIO)) }
      await page.screenshot({ path: path.join(OUT, `pos-${slug}-${lado}.png`), fullPage: true })
    }
  }
  fs.writeFileSync(path.join(OUT, 'inventario-pos.json'), JSON.stringify(res, null, 2))
  for (const k of Object.keys(res)) {
    const r = res[k]
    console.log(`\n===== ${k} (${r.url}) filas=${r.filas} dialogs=${r.dialogos}`)
    console.log('H:', r.h.join(' | '))
    console.log('BTN:', r.botones.join(' ¦ '))
    console.log('CAMPOS:', r.campos.map(c => `${c.etiqueta}[${c.tipo}${c.nombre ? ':' + c.nombre : ''}]`).join(' ¦ '))
    console.log('TH:', r.th.join(' ¦ '))
    console.log('ACC-FILA:', r.accionesFila.join(' ¦ '))
  }
  await b.close()
})()
