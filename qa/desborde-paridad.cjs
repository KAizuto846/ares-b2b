/* Sonda de desborde: lista los elementos que se salen del viewport. */
const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright')

const BASE = 'http://127.0.0.1:8081'
const CUENTAS = {
  comercio: ['comercio@didi2.mx', 'comercio123'],
  mayorista: ['demo-insumos-del-valle@didi2.mx', 'demo1234'],
  repartidor: ['repartidor@didi2.mx', 'repartidor123'],
  admin: ['admin@didi2.mx', 'admin123'],
}
const OBJETIVO = [
  ['mayorista', '/productos/importar'],
  ['admin', '/admin'],
  ['admin', '/admin/usuarios'],
  ['admin', '/admin/kyc'],
  ['admin', '/admin/parametros'],
]

;(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] })
  for (const [rol, ruta] of OBJETIVO) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    const p = await ctx.newPage()
    await p.goto(`${BASE}/spa/`, { waitUntil: 'domcontentloaded' })
    await p.fill('input[type="email"]', CUENTAS[rol][0])
    await p.fill('input[type="password"]', CUENTAS[rol][1])
    await p.click('button[type="submit"]')
    await p.waitForTimeout(1200)
    await p.goto(`${BASE}/spa${ruta}`, { waitUntil: 'networkidle' })
    await p.waitForTimeout(500)
    const datos = await p.evaluate(() => {
      const ancho = document.documentElement.clientWidth
      const fuera = []
      document.querySelectorAll('body *').forEach((el) => {
        const r = el.getBoundingClientRect()
        if (r.width === 0) return
        if (r.right > ancho + 1) {
          const cs = getComputedStyle(el)
          fuera.push({
            tag: el.tagName,
            clase: (el.className || '').toString().slice(0, 60),
            right: Math.round(r.right),
            ancho: Math.round(r.width),
            overflow: cs.overflowX,
            padre: (el.parentElement?.className || '').toString().slice(0, 40),
          })
        }
      })
      return { ancho, doc: document.documentElement.scrollWidth, fuera: fuera.slice(0, 12) }
    })
    console.log(`\n== ${rol} ${ruta} · viewport ${datos.ancho} · doc ${datos.doc}`)
    for (const f of datos.fuera) console.log(`  ${f.tag}.${f.clase} right=${f.right} w=${f.ancho} ovx=${f.overflow} padre=${f.padre}`)
    await ctx.close()
  }
  await b.close()
})()
