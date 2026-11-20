const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright')
const EXE = '/home/rizutov/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell'
const BASE = 'http://127.0.0.1:8081/spa'

;(async () => {
  const b = await chromium.launch({ executablePath: EXE })
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
  const p = await ctx.newPage()
  const errores = [], fallos = []
  p.on('pageerror', (e) => errores.push(String(e).slice(0, 200)))
  p.on('console', (m) => { if (m.type() === 'error') errores.push(m.text().slice(0, 200)) })
  p.on('response', (r) => { if (r.status() >= 400) fallos.push(`${r.status()} ${r.url()}`) })

  await p.goto(BASE + '/login', { waitUntil: 'networkidle' })
  console.log('titulo login:', await p.title())
  console.log('splash visible:', await p.locator('#inicio-pantalla').count())
  console.log('fuente:', await p.evaluate(() => getComputedStyle(document.body).fontFamily))
  console.log('manifest:', await p.evaluate(() => document.querySelector('link[rel=manifest]')?.getAttribute('href')))

  await p.fill('input[type="email"]', 'comercio@didi2.mx')
  await p.fill('input[type="password"]', 'comercio123')
  await p.click('button[type="submit"]')
  await p.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 20000 })
  await p.waitForTimeout(1200)
  console.log('titulo inicio:', await p.title())

  for (const ruta of ['/buscar', '/pedidos', '/pos', '/finanzas', '/perfil', '/mensajes']) {
    await p.click(`a[href="/spa${ruta}"]`).catch(async () => { await p.goto(BASE + ruta) })
    await p.waitForTimeout(700)
    const t = await p.title()
    const carga = await p.locator('.ruta-cargando').count()
    console.log(ruta, '|', t, '| esqueleto:', carga)
  }

  console.log('errores:', errores.length ? errores : 'ninguno')
  console.log('respuestas >=400:', fallos.length ? fallos.slice(0, 8) : 'ninguna')
  await b.close()
})()
