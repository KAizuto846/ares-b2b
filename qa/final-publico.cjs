const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright')
const path = require('path')
const PUB = 'https://riz0308.tail0820b4.ts.net/spa'

;(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] })
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  const p = await ctx.newPage()
  const err = []
  p.on('pageerror', (e) => err.push(String(e).slice(0, 160)))
  p.on('console', (m) => { if (m.type() === 'error') err.push(m.text().slice(0, 160)) })

  await p.goto(PUB + '/login', { waitUntil: 'networkidle' })
  await p.waitForTimeout(500)
  await p.screenshot({ path: path.join(__dirname, 'final-login.png') })

  await p.fill('input[type="email"]', 'comercio@didi2.mx')
  await p.fill('input[type="password"]', 'comercio123')
  await p.click('button[type="submit"]')
  await p.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 25000 })
  await p.waitForTimeout(1400)
  await p.screenshot({ path: path.join(__dirname, 'final-inicio.png') })
  console.log('sesion publica ok:', new URL(p.url()).pathname, '|', await p.title())

  await p.goto(PUB + '/pedidos', { waitUntil: 'networkidle' })
  await p.waitForTimeout(900)
  await p.screenshot({ path: path.join(__dirname, 'final-pedidos.png') })
  console.log('pedidos:', (await p.locator('main').innerText()).slice(0, 80).replace(/\n/g, ' · '))
  await ctx.close()

  const m = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  const pm = await m.newPage()
  await pm.goto(PUB + '/login', { waitUntil: 'networkidle' })
  await pm.waitForTimeout(500)
  await pm.screenshot({ path: path.join(__dirname, 'final-login-movil.png') })
  await m.close()
  await b.close()
  console.log('errores:', err.length ? err : 'ninguno')
})()
