const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright')
const OUT = '/home/rizutov/ares-react/qa/audit'
;(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] })
  const ctx = await b.newContext({ viewport: { width: 1440, height: 950 }, storageState: `${OUT}/../.estado-nuevo-comercio.json` })
  const p = await ctx.newPage()
  const log = {}

  // ajustes: ¿términos clicable?
  await p.goto('http://127.0.0.1:8081/spa/perfil/ajustes', { waitUntil: 'networkidle' }); await p.waitForTimeout(900)
  log.ajustes_antes = p.url()
  try { await p.getByText('Términos y condiciones').first().click({ timeout: 3000 }) ; await p.waitForTimeout(1200) } catch (e) { log.ajustes_err = String(e).slice(0, 90) }
  log.ajustes_despues = p.url()
  log.ajustes_filas = await p.evaluate(() => [...document.querySelectorAll('.perfil-fila,[class*=fila]')].map(e => e.className + ' :: ' + e.innerText.replace(/\s+/g, ' ').slice(0, 80)).slice(0, 8))

  // ayuda: click en términos y en aviso
  await p.goto('http://127.0.0.1:8081/spa/ayuda', { waitUntil: 'networkidle' }); await p.waitForTimeout(800)
  log.ayuda_antes = p.url()
  try { await p.getByText('Términos y condiciones').first().click({ timeout: 3000 }); await p.waitForTimeout(1200) } catch (e) { log.ayuda_err = String(e).slice(0, 90) }
  log.ayuda_despues = p.url()
  // chat soporte
  try { await p.getByRole('button', { name: /Abrir el chat de soporte/ }).click(); await p.waitForTimeout(1800) } catch (e) { log.chat_err = String(e).slice(0, 90) }
  log.chat_url = p.url()

  // perfil: chip de verificación + ¿Ir a verificación?
  await p.goto('http://127.0.0.1:8081/spa/perfil', { waitUntil: 'networkidle' }); await p.waitForTimeout(900)
  log.perfil_chip = await p.evaluate(() => [...document.querySelectorAll('.chip,[class*=chip]')].map(e => e.innerText.trim()).filter(Boolean))
  await b.close()
  console.log(JSON.stringify(log, null, 1))
})()
