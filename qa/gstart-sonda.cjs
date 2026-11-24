// Sonda del inicio: mide secciones y captura para los tres roles.
const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright')
const BASE = 'http://127.0.0.1:8081/spa'
const CUENTAS = {
  comercio: { email: 'comercio@didi2.mx', clave: 'comercio123' },
  mayorista: { email: 'demo-insumos-del-valle@didi2.mx', clave: 'demo1234' },
}
;(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] })
  const out = {}
  for (const [rol, c] of Object.entries(CUENTAS)) {
    const pg = await b.newPage({ viewport: { width: 1280, height: 900 } })
    await pg.goto(BASE + '/login', { waitUntil: 'networkidle' })
    await pg.fill('input[type=email]', c.email)
    await pg.fill('input[type=password]', c.clave)
    await pg.click('button[type=submit]')
    await pg.waitForURL('**/spa/**', { timeout: 20000 })
    await pg.waitForTimeout(1800)
    await pg.screenshot({ path: `/home/rizutov/ares-react/qa/gstart-${rol}-1280.png` })
    out[rol] = await pg.evaluate(() => {
      const o = { url: location.pathname, secciones: [] }
      document.querySelectorAll('.contenido section, .contenido .tarjeta, [class*=ficha]').forEach((el) => {
        const r = el.getBoundingClientRect()
        if (r.width > 0) o.secciones.push({ cls: String(el.className).slice(0, 44), w: Math.round(r.width), h: Math.round(r.height) })
      })
      const pub = document.querySelector('.publicidades')
      if (pub) o.publicidades = { cols: getComputedStyle(pub).gridTemplateColumns, fichas: pub.querySelectorAll('.publicidad').length }
      o.mainWidth = Math.round(document.querySelector('.contenido')?.getBoundingClientRect().width || 0)
      o.desborde = document.documentElement.scrollWidth - document.documentElement.clientWidth
      return o
    })
    await pg.close()
  }
  console.log(JSON.stringify(out, null, 1))
  await b.close()
})().catch((e) => { console.error(e.message); process.exit(1) })
