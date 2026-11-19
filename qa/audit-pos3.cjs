const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright')
const fs = require('fs'), path = require('path')
const OUT = '/home/rizutov/ares-react/qa/audit'
const V = 'http://127.0.0.1:3110', N = 'http://127.0.0.1:8081/spa'
const PARES = [['pos', '/pos', '/pos'], ['inventario', '/pos/inventario', '/pos/inventario'], ['ventas', '/pos/ventas', '/pos/ventas'], ['corte', '/pos/corte', '/pos/corte'], ['clientes', '/pos/clientes', '/pos/clientes']]

const TROZOS = () => {
  const t = (e) => (e.innerText || '').replace(/\s+/g, ' ').trim()
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' }
  const out = new Set()
  document.querySelectorAll('h1,h2,h3,th,label > span,dt,p,button,a,strong,small,span.pista,span.silencio,.chip,.kpi__etiqueta,.pista').forEach((e) => {
    if (!vis(e)) return
    const x = t(e)
    if (x && x.length > 2 && x.length < 70) out.add(x)
  })
  return [...out]
}
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim()

;(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] })
  const ctxV = await b.newContext({ viewport: { width: 1440, height: 950 }, storageState: '/home/rizutov/ares-react/qa/.estado-viejo-comercio.json' })
  const ctxN = await b.newContext({ viewport: { width: 1440, height: 950 }, storageState: '/home/rizutov/ares-react/qa/.estado-nuevo-comercio.json' })
  const pv = await ctxV.newPage(); const pn = await ctxN.newPage()
  const informe = []
  for (const [slug, rv, rn] of PARES) {
    await pv.goto(V + rv, { waitUntil: 'networkidle' }); await pv.waitForTimeout(700)
    const a = await pv.evaluate(TROZOS)
    await pn.goto(N + rn, { waitUntil: 'networkidle' }); await pn.waitForTimeout(900)
    const c = await pn.evaluate(TROZOS)
    const hay = new Set(c.map(norm))
    const soloViejo = a.filter((x) => {
      const n = norm(x); if (n.length < 4) return false
      if (hay.has(n)) return false
      const pal = n.split(' ').filter((w) => w.length > 3)
      if (!pal.length) return false
      return ![...hay].some((y) => pal.every((w) => y.includes(w)))
    })
    informe.push({ slug, soloViejo, viejo: a.length, nuevo: c.length })
    console.log(`\n===== ${slug} · viejo ${a.length} trozos / nuevo ${c.length}`)
    console.log('  SOLO EN VIEJO:', soloViejo.join(' || ') || '(nada)')
  }
  fs.writeFileSync(path.join(OUT, 'texto-pos.json'), JSON.stringify(informe, null, 2))
  await b.close()
})()
