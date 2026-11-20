/* Comprueba los tres arreglos visuales concretos. */
const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright')
const BASE = 'http://127.0.0.1:8081/spa'

;(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] })
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
  await p.goto(BASE + '/login', { waitUntil: 'networkidle' })
  await p.fill('input[type="email"]', 'comercio@didi2.mx')
  await p.fill('input[type="password"]', 'comercio123')
  await p.click('button[type="submit"]')
  await p.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 20000 })

  // Caja: etiqueta del turno y botón Cobrar deshabilitado
  await p.goto(BASE + '/pos', { waitUntil: 'networkidle' })
  await p.waitForTimeout(1200)
  const cab = (await p.locator('.pagina-cab p').first().innerText()).replace(/\n/g, ' ')
  console.log('caja:', cab)
  const cobrar = await p.evaluate(() => {
    const bt = [...document.querySelectorAll('button')].find((x) => x.textContent.trim().startsWith('Cobrar'))
    if (!bt) return null
    const cs = getComputedStyle(bt)
    return { texto: bt.textContent.trim(), disabled: bt.disabled, fondo: cs.backgroundColor, color: cs.color, opacidad: cs.opacity }
  })
  console.log('Cobrar:', JSON.stringify(cobrar))

  // Finanzas: cuántas tarjetas KPI y si queda la de «Sin datos previos»
  await p.goto(BASE + '/finanzas', { waitUntil: 'networkidle' })
  await p.waitForTimeout(1200)
  const fin = await p.evaluate(() => {
    const kpis = [...document.querySelectorAll('.kpi')]
    return {
      cuantas: kpis.length,
      textos: kpis.map((k) => k.textContent.replace(/\s+/g, ' ').trim()),
      sinDatos: document.body.innerText.includes('Sin datos previos'),
    }
  })
  console.log('finanzas:', JSON.stringify(fin))
  await b.close()
})()
