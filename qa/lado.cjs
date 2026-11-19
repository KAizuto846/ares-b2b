/** Imprime lado a lado los controles y secciones de una pantalla vieja y su equivalente nuevo. */
const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright')

const VIEJO = 'http://127.0.0.1:3110'
const NUEVO = 'http://127.0.0.1:8081/spa'
const [rv, rn] = process.argv.slice(2)

const inventario = () => {
  const txt = (e) => (e.innerText || e.value || e.placeholder || '').replace(/\s+/g, ' ').trim()
  const vis = (e) => {
    const r = e.getBoundingClientRect()
    const s = getComputedStyle(e)
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'
  }
  const lista = (sel) => [...document.querySelectorAll(sel)].filter(vis).map(txt).filter(Boolean)
  return {
    secciones: lista('h1,h2,h3'),
    botones: lista('button, a.btn, .btn, [role="button"]'),
    campos: [...document.querySelectorAll('input,select,textarea')].filter(vis).map((e) => `${e.tagName.toLowerCase()}:${e.name || e.id || e.type}:${e.placeholder || ''}`),
    columnas: lista('th'),
    tabs: lista('[role="tab"], .tabs a, .tab'),
    enlaces: lista('a').filter((t) => t.length < 30),
  }
}

;(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] })
  const cv = await b.newContext({ viewport: { width: 1440, height: 950 }, storageState: __dirname + '/.estado-viejo.json' })
  const cn = await b.newContext({ viewport: { width: 1440, height: 950 }, storageState: __dirname + '/.estado-nuevo.json' })
  let p = await cv.newPage()

  await p.goto(VIEJO + rv, { waitUntil: 'networkidle' })
  await p.waitForTimeout(600)
  const v = await p.evaluate(inventario)

  p = await cn.newPage()
  await p.goto(NUEVO + rn, { waitUntil: 'networkidle' })
  await p.waitForTimeout(900)
  const n = await p.evaluate(inventario)

  for (const k of Object.keys(v)) {
    console.log(`\n=== ${k.toUpperCase()} ===`)
    console.log('VIEJO:', v[k].join(' · ') || '—')
    console.log('NUEVO:', n[k].join(' · ') || '—')
  }
  await b.close()
})()
