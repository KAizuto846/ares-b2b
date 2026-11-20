/* Capturas de revisión de diseño — SPA Ares */
const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright')
const path = require('path')
const fs = require('fs')
const SALIDA = path.join(__dirname, 'diseno')
fs.mkdirSync(SALIDA, { recursive: true })

const BASE = 'http://127.0.0.1:8081/spa'
const CUENTAS = {
  comercio: { email: 'comercio@didi2.mx', clave: 'comercio123' },
  mayorista: { email: 'demo-insumos-del-valle@didi2.mx', clave: 'demo1234' },
  repartidor: { email: 'repartidor@didi2.mx', clave: 'repartidor123' },
  admin: { email: 'admin@didi2.mx', clave: 'admin123' },
}
const RUTAS = {
  comercio: ['/', '/buscar', '/pedidos', '/finanzas', '/portafolio', '/pos', '/mensajes', '/perfil'],
  mayorista: ['/', '/productos', '/pedidos', '/finanzas'],
  repartidor: ['/', '/repartidor'],
  admin: ['/', '/admin', '/admin/usuarios'],
}

;(async () => {
  const browser = await chromium.launch({ executablePath: '/home/rizutov/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell' })
  for (const [rol, cuenta] of Object.entries(CUENTAS)) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
    const page = await ctx.newPage()
    const errores = []
    page.on('pageerror', (e) => errores.push(String(e).slice(0, 160)))
    await page.goto(BASE + '/login', { waitUntil: 'networkidle' })
    await page.fill('input[type="email"]', cuenta.email)
    await page.fill('input[type="password"]', cuenta.clave)
    await page.click('button[type="submit"]')
    await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 20000 }).catch(() => {})
    for (const ruta of RUTAS[rol]) {
      await page.goto(BASE + ruta, { waitUntil: 'networkidle' }).catch(() => {})
      await page.waitForTimeout(900)
      const nombre = `${rol}-${ruta === '/' ? 'inicio' : ruta.slice(1).replace(/\//g, '-')}`
      await page.screenshot({ path: path.join(SALIDA, nombre + '.png') })
    }
    if (errores.length) console.log(rol, 'ERRORES', errores.slice(0, 3))
    await ctx.close()
  }
  // Público en móvil
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const pm = await m.newPage()
  for (const ruta of ['/login', '/registro']) {
    await pm.goto(BASE + ruta, { waitUntil: 'networkidle' })
    await pm.waitForTimeout(600)
    await pm.screenshot({ path: path.join(SALIDA, 'movil-' + ruta.slice(1) + '.png') })
  }
  await m.close()
  await browser.close()
  console.log('listo', fs.readdirSync(SALIDA).length, 'capturas')
})()
