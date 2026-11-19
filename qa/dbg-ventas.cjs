const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright')
;(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] })
  const ctx = await b.newContext({ viewport: { width: 1440, height: 950 }, storageState: '/home/rizutov/ares-react/qa/.estado-nuevo-comercio.json' })
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(String(e)))
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
  await p.goto('http://127.0.0.1:8081/spa/pos/ventas', { waitUntil: 'networkidle' })
  await p.waitForTimeout(1200)
  const info = await p.evaluate(() => ({
    url: location.pathname,
    inputs: [...document.querySelectorAll('input')].map((i) => i.type),
    filas: document.querySelectorAll('tbody tr').length,
    th: [...document.querySelectorAll('th')].map((t) => t.innerText),
    encabezado: document.querySelector('h1')?.innerText,
    texto: document.body.innerText.replace(/\s+/g, ' ').slice(0, 300),
  }))
  console.log(JSON.stringify(info, null, 1))
  console.log('ERRORES:', errs)
  await b.close()
})()
