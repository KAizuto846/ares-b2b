const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright')
const fs = require('fs')
const OUT = '/home/rizutov/ares-react/qa/audit'
const apps = { viejo: 'http://127.0.0.1:3110', nuevo: 'http://127.0.0.1:8081/spa' }
;(async () => {
  const browser = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] })
  const out = {}
  // 1) hilo: texto completo + historial
  for (const [app, base] of Object.entries(apps)) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, storageState: `${OUT}/../.estado-${app}-comercio.json` })
    const page = await ctx.newPage()
    await page.goto(base + '/mensajes?hilo=bc6ed9cd-4e90-7ae0-5291-a9d5cd8af235', { waitUntil: 'networkidle' })
    await page.waitForTimeout(1500)
    out[app + ':hilo-texto'] = await page.evaluate(() => document.body.innerText.replace(/\n{3,}/g, '\n').slice(0, 1600))
    // 2) notificaciones: url destino de cada Ver detalle
    await page.goto(base + '/mensajes?tab=notificaciones', { waitUntil: 'networkidle' }); await page.waitForTimeout(1000)
    const destinos = []
    const n = await page.getByText('Ver detalle').count()
    for (let i = 0; i < n; i++) {
      await page.goto(base + '/mensajes?tab=notificaciones', { waitUntil: 'networkidle' }); await page.waitForTimeout(600)
      try { await page.getByText('Ver detalle').nth(i).click(); await page.waitForTimeout(1500); destinos.push(page.url()) } catch (e) { destinos.push('ERR ' + String(e).slice(0, 60)) }
    }
    out[app + ':notif-destinos'] = destinos
    await ctx.close()
    // 3) KYC con rol repartidor (rol que sí exige documentos)
    const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 950 }, storageState: `${OUT}/../.estado-${app}-repartidor.json` })
    const p2 = await ctx2.newPage()
    await p2.goto(base + '/kyc', { waitUntil: 'networkidle' }); await p2.waitForTimeout(1200)
    out[app + ':kyc-repartidor'] = await p2.evaluate(() => {
      const t = (e) => (e.innerText || '').replace(/\s+/g, ' ').trim()
      return {
        url: location.href,
        tablas: [...document.querySelectorAll('table')].map(tb => ({ columnas: [...tb.querySelectorAll('thead th')].map(th => t(th)), filas: [...tb.querySelectorAll('tbody tr')].map(r => t(r)) })),
        texto: document.body.innerText.replace(/\n{3,}/g, '\n').slice(0, 1600),
      }
    })
    await p2.screenshot({ path: `${OUT}/perfil-kyc-repartidor-${app}.png`, fullPage: true })
    // 4) perfil del repartidor (chip de verificación y atajos)
    await p2.goto(base + '/perfil', { waitUntil: 'networkidle' }); await p2.waitForTimeout(1000)
    out[app + ':perfil-repartidor'] = await p2.evaluate(() => document.body.innerText.replace(/\n{3,}/g, '\n').slice(0, 1200))
    await ctx2.close()
  }
  await browser.close()
  fs.writeFileSync(`${OUT}/interacciones2.json`, JSON.stringify(out, null, 1))
  console.log(JSON.stringify(out, null, 1))
})()
