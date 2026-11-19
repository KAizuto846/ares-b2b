const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright')
const fs = require('fs'), path = require('path')
const OUT = '/home/rizutov/ares-react/qa/audit'
fs.mkdirSync(OUT, { recursive: true })
const V = 'http://127.0.0.1:3110', N = 'http://127.0.0.1:8081/spa'

const CAMPOS = () => {
  const t = (e) => (e.innerText || '').replace(/\s+/g, ' ').trim()
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' }
  return [...document.querySelectorAll('input, select, textarea, button')].filter(vis).map((e) => {
    let et = ''
    const lab = e.closest('label')
    if (lab) { const sp = lab.querySelector('span'); if (sp) et = t(sp) }
    if (!et && e.id) { const l = document.querySelector(`label[for="${e.id}"]`); if (l) et = t(l) }
    if (!et && e.placeholder) et = 'ph:' + e.placeholder
    if (!et) et = t(e)
    return `${e.tagName === 'BUTTON' ? 'BTN' : 'FLD'}:${et.slice(0, 45)}`
  })
}

;(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] })
  const ctxV = await b.newContext({ viewport: { width: 1440, height: 950 }, storageState: '/home/rizutov/ares-react/qa/.estado-viejo-comercio.json' })
  const ctxN = await b.newContext({ viewport: { width: 1440, height: 950 }, storageState: '/home/rizutov/ares-react/qa/.estado-nuevo-comercio.json' })
  const pv = await ctxV.newPage(); const pn = await ctxN.newPage()
  // Nunca dejar pasar un POST/PUT/DELETE: la auditoría es de solo lectura.
  for (const p of [pv, pn]) {
    await p.route('**/*', (r) => (['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.request().method()) ? r.abort() : r.continue()))
    p.on('dialog', (d) => d.dismiss().catch(() => {}))
  }
  const shot = async (p, n) => { await p.waitForTimeout(450); await p.screenshot({ path: path.join(OUT, n) }); return p.evaluate(CAMPOS) }
  const log = {}

  // ---------- CAJA: cargar ticket ----------
  await pv.goto(V + '/pos', { waitUntil: 'networkidle' }); await pv.fill('#pos-buscar', 'a'); await pv.waitForTimeout(400)
  await pv.click('.prod:not([disabled]):visible >> nth=0')
  log['caja-ticket-viejo'] = await shot(pv, 'pos-caja-ticket-viejo.png')

  await pn.goto(N + '/pos', { waitUntil: 'networkidle' }); await pn.fill('input[type=search]', 'a'); await pn.waitForTimeout(500)
  await pn.click('.pos-prod:not([disabled]) >> nth=0')
  log['caja-ticket-nuevo'] = await shot(pn, 'pos-caja-ticket-nuevo.png')
  await pn.click('.pos__cobrar')
  log['caja-cobro-dialogo-nuevo'] = await shot(pn, 'pos-caja-cobro-nuevo.png')
  await pn.keyboard.press('Escape')

  // ---------- INVENTARIO ----------
  await pv.goto(V + '/pos/inventario', { waitUntil: 'networkidle' })
  log['inv-alta-viejo'] = await shot(pv, 'pos-inventario-alta-viejo.png')
  await pv.click('a:has-text("Editar") >> nth=0'); await pv.waitForTimeout(600)
  log['inv-editar-viejo'] = await shot(pv, 'pos-inventario-editar-viejo.png')

  await pn.goto(N + '/pos/inventario', { waitUntil: 'networkidle' })
  await pn.click('button:has-text("Producto")')
  log['inv-alta-nuevo'] = await shot(pn, 'pos-inventario-alta-nuevo.png')
  await pn.click('button:has-text("Cancelar") >> nth=0')
  await pn.click('button[aria-label^="Editar"] >> nth=0')
  log['inv-editar-nuevo'] = await shot(pn, 'pos-inventario-editar-nuevo.png')
  await pn.click('button:has-text("Cancelar") >> nth=0')
  await pn.click('button[aria-label^="Reponer"] >> nth=0')
  log['inv-reponer-nuevo'] = await shot(pn, 'pos-inventario-reponer-nuevo.png')
  await pn.click('button:has-text("Cancelar") >> nth=0')
  await pn.click('button[aria-label^="Quitar"] >> nth=0')
  log['inv-quitar-nuevo'] = await shot(pn, 'pos-inventario-quitar-nuevo.png')
  await pn.click('button:has-text("Cancelar") >> nth=0')

  // ---------- VENTAS + TICKET ----------
  await pv.goto(V + '/pos/ventas', { waitUntil: 'networkidle' })
  log['ventas-viejo'] = await shot(pv, 'pos-ventas-viejo.png')
  await pv.click('tbody tr:first-child a'); await pv.waitForTimeout(700)
  log['ticket-viejo'] = await shot(pv, 'pos-ventas-ticket-viejo.png')

  await pn.goto(N + '/pos/ventas', { waitUntil: 'networkidle' })
  log['ventas-nuevo'] = await shot(pn, 'pos-ventas-nuevo.png')
  await pn.click('tbody tr:first-child a'); await pn.waitForTimeout(800)
  log['ticket-nuevo'] = await shot(pn, 'pos-ventas-ticket-nuevo.png')

  // ---------- CORTE ----------
  await pv.goto(V + '/pos/corte', { waitUntil: 'networkidle' })
  log['corte-viejo'] = await shot(pv, 'pos-corte-viejo.png')
  await pn.goto(N + '/pos/corte', { waitUntil: 'networkidle' })
  log['corte-nuevo'] = await shot(pn, 'pos-corte-nuevo.png')
  await pn.click('button:has-text("Cerrar caja") >> nth=0')
  log['corte-cerrar-dialogo-nuevo'] = await shot(pn, 'pos-corte-cerrar-nuevo.png')
  await pn.click('button:has-text("Cancelar") >> nth=0')

  // ---------- CLIENTES ----------
  await pv.goto(V + '/pos/clientes', { waitUntil: 'networkidle' })
  log['clientes-viejo'] = await shot(pv, 'pos-clientes-viejo.png')
  await pn.goto(N + '/pos/clientes', { waitUntil: 'networkidle' })
  log['clientes-nuevo'] = await shot(pn, 'pos-clientes-nuevo.png')
  await pn.click('button:has-text("Cliente") >> nth=0')
  log['clientes-alta-nuevo'] = await shot(pn, 'pos-clientes-alta-nuevo.png')

  fs.writeFileSync(path.join(OUT, 'campos-pos.json'), JSON.stringify(log, null, 2))
  for (const k of Object.keys(log)) console.log(`\n### ${k}\n  ` + log[k].join('  |  '))
  await b.close()
})()
