const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright')
const OUT = '/home/rizutov/ares-react/qa/audit'
;(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] })
  const ctx = await b.newContext({ viewport: { width: 1440, height: 950 }, storageState: `${OUT}/../.estado-nuevo-comercio.json` })
  const p = await ctx.newPage()
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 160)))
  p.on('requestfailed', r => errs.push('FAIL ' + r.url().slice(0, 90)))
  await p.goto('http://127.0.0.1:8081/spa/perfil/editar', { waitUntil: 'networkidle' })
  await p.waitForTimeout(1500)
  const antes = await p.evaluate(() => {
    const bs = [...document.querySelectorAll('button')].map(e => { const r = e.getBoundingClientRect(); return { t: (e.innerText || '').replace(/\s+/g, ' ').trim(), w: Math.round(r.width), h: Math.round(r.height), disp: getComputedStyle(e).display, op: getComputedStyle(e).opacity } })
    return { total: bs.length, ubicar: bs.filter(x => /mapa/i.test(x.t)), all: bs.map(x => x.t + '[' + x.w + 'x' + x.h + ']') }
  })
  let click = 'no'
  try { await p.getByRole('button', { name: /Ubicar en el mapa/ }).click({ timeout: 4000 }); click = 'ok' } catch (e) { click = 'ERR ' + String(e).slice(0, 100) }
  await p.waitForTimeout(2500)
  const despues = await p.evaluate(() => {
    const d = document.querySelector('[aria-label="Ubicar dirección"], .dialogo__caja--ancha')
    const cont = document.querySelector('.perfil-mapa')
    return { dialogo: d ? (d.innerText || '').replace(/\s+/g, ' ').slice(0, 200) : null, mapaHijos: cont ? cont.children.length : null, mapaAlto: cont ? Math.round(cont.getBoundingClientRect().height) : null, tiles: document.querySelectorAll('.leaflet-tile').length }
  })
  await p.screenshot({ path: `${OUT}/perfil-perfil-editar-mapa-nuevo.png`, fullPage: false })
  await b.close()
  console.log(JSON.stringify({ antes, click, despues, errs: errs.slice(0, 6) }, null, 1))
})()
