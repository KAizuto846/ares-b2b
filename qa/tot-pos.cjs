const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright')
;(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] })
  const cv = await b.newContext({ viewport: { width: 1440, height: 950 }, storageState: '/home/rizutov/ares-react/qa/.estado-viejo-comercio.json' })
  const cn = await b.newContext({ viewport: { width: 1440, height: 950 }, storageState: '/home/rizutov/ares-react/qa/.estado-nuevo-comercio.json' })
  const pv = await cv.newPage(); const pn = await cn.newPage()
  for (const p of [pv, pn]) { await p.route('**/*', (r) => (['POST','PUT','PATCH','DELETE'].includes(r.request().method()) ? r.abort() : r.continue())); p.on('dialog', d => d.dismiss().catch(()=>{})) }

  await pv.goto('http://127.0.0.1:3110/pos', { waitUntil: 'networkidle' })
  await pv.fill('#pos-buscar', 'agua'); await pv.waitForTimeout(400)
  await pv.click('.prod:visible >> nth=0')
  const tv = await pv.evaluate(() => ({
    sub: document.getElementById('pos-subtotal')?.textContent, iva: document.getElementById('pos-iva')?.textContent, tot: document.getElementById('pos-total')?.textContent,
    linea: document.querySelector('.pos-linea')?.innerText.replace(/\s+/g,' '),
    conteo: document.getElementById('pos-conteo')?.textContent,
  }))

  await pn.goto('http://127.0.0.1:8081/spa/pos', { waitUntil: 'networkidle' })
  await pn.fill('input[type=search]', 'agua'); await pn.waitForTimeout(500)
  await pn.click('.pos-prod:visible >> nth=0')
  const tn = await pn.evaluate(() => {
    const filas = [...document.querySelectorAll('.pos__totales > div')].map(d => d.innerText.replace(/\s+/g,' '))
    return { filas, linea: document.querySelector('.pos-linea')?.innerText.replace(/\s+/g,' '), conteo: document.querySelector('.pos__ticket-cab .chip')?.textContent }
  })
  console.log('VIEJO :', JSON.stringify(tv))
  console.log('NUEVO :', JSON.stringify(tn))

  // filtro de fechas en ventas
  await pn.goto('http://127.0.0.1:8081/spa/pos/ventas', { waitUntil: 'networkidle' })
  await pn.waitForTimeout(600)
  const antes = await pn.evaluate(() => document.querySelectorAll('tbody tr').length)
  await pn.locator('input[type=date]').first().fill('2026-11-19')
  await pn.waitForTimeout(1000)
  const despues = await pn.evaluate(() => ({ filas: document.querySelectorAll('tbody tr').length, texto: (document.querySelector('tbody')?.innerText||'').replace(/\s+/g,' ').slice(0,80), total: document.querySelector('.pos-filtros__total')?.innerText.replace(/\s+/g,' ') }))
  await pn.click('button:has-text("Todo")'); await pn.waitForTimeout(900)
  const rest = await pn.evaluate(() => document.querySelectorAll('tbody tr').length)
  console.log('FILTRO VENTAS:', JSON.stringify({ antes, despues, rest }))
  await b.close()
})()
