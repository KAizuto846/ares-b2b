const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright')
;(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] })
  const ctx = await b.newContext({ viewport: { width: 1440, height: 950 }, storageState: '/home/rizutov/ares-react/qa/.estado-nuevo-comercio.json' })
  const p = await ctx.newPage()
  p.on('dialog', (d) => d.dismiss().catch(() => {}))

  // A) diálogo de edición: ¿valores precargados?
  await p.goto('http://127.0.0.1:8081/spa/pos/inventario', { waitUntil: 'networkidle' })
  await p.waitForTimeout(800)
  const fila = await p.evaluate(() => {
    const tr = document.querySelector('tbody tr')
    return tr ? [...tr.querySelectorAll('td')].map((td) => td.innerText.replace(/\s+/g, ' ').trim()) : null
  })
  console.log('FILA TABLA:', JSON.stringify(fila))
  await p.click('button[aria-label^="Editar"] >> nth=0')
  await p.waitForTimeout(400)
  const vals = await p.evaluate(() => [...document.querySelectorAll('.pos-modal input, .pos-modal select')].map((e) => `${e.closest('label')?.querySelector('span')?.innerText}:${e.value}`))
  console.log('DIALOGO EDICION:', JSON.stringify(vals))

  // B) diálogo de cobro: clientes disponibles
  await p.goto('http://127.0.0.1:8081/spa/pos', { waitUntil: 'networkidle' })
  await p.fill('input[type=search]', 'agua'); await p.waitForTimeout(400)
  await p.click('.pos-prod >> nth=0'); await p.click('.pos__cobrar'); await p.waitForTimeout(400)
  const opciones = await p.evaluate(() => {
    const sels = [...document.querySelectorAll('.pos-modal select')]
    const cli = sels.find((s) => /Cliente/.test(s.closest('label')?.innerText || ''))
    return { metodos: sels[0] ? [...sels[0].options].map((o) => o.text) : [], clientes: cli ? [...cli.options].map((o) => o.text) : [], cambio: document.querySelector('.pos-cambio')?.innerText.replace(/\s+/g, ' ') }
  })
  console.log('DIALOGO COBRO:', JSON.stringify(opciones))

  // C) corte: prefill de efectivo contado
  await p.goto('http://127.0.0.1:8081/spa/pos/corte', { waitUntil: 'networkidle' })
  await p.waitForTimeout(600)
  const kpis = await p.evaluate(() => [...document.querySelectorAll('.kpi')].map((k) => k.innerText.replace(/\s+/g, ' ').trim()))
  console.log('KPIS CORTE:', JSON.stringify(kpis))
  await p.click('button:has-text("Cerrar caja") >> nth=0'); await p.waitForTimeout(400)
  const pre = await p.evaluate(() => ({ contado: document.querySelector('.pos-modal input[type=number]')?.value, diff: document.querySelector('.pos-modal .pos-cambio')?.innerText.replace(/\s+/g, ' ') }))
  console.log('DIALOGO CERRAR:', JSON.stringify(pre))

  // D) filtro de fechas en ventas (GET)
  await p.goto('http://127.0.0.1:8081/spa/pos/ventas', { waitUntil: 'networkidle' })
  await p.waitForTimeout(600)
  const sinFiltro = await p.evaluate(() => document.querySelectorAll('tbody tr').length)
  await p.fill('input[type=date] >> nth=0', '2026-11-19'); await p.waitForTimeout(900)
  const conFiltro = await p.evaluate(() => ({ filas: document.querySelectorAll('tbody tr').length, texto: document.querySelector('tbody')?.innerText.replace(/\s+/g, ' ').slice(0, 120) }))
  console.log('VENTAS filtro:', JSON.stringify({ sinFiltro, conFiltro }))
  await b.close()
})()
