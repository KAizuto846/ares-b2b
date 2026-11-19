/** Inicia sesión una vez en el panel viejo y en la SPA y guarda el estado para reutilizarlo. */
const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright')
const fs = require('fs')
const path = require('path')

const CUENTA = { email: 'comercio@didi2.mx', clave: 'comercio123' }

async function entrar(b, base, archivo, rutaLogin, campoclave) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } })
  const p = await ctx.newPage()
  await p.goto(base + rutaLogin, { waitUntil: 'networkidle' })
  await p.fill('input[name=email], input[type=email]', CUENTA.email)
  await p.fill(campoclave, CUENTA.clave)
  await p.click('button[type=submit]')
  await p.waitForTimeout(2500)
  const ok = !/\/login|\/entrar/.test(new URL(p.url()).pathname)
  await ctx.storageState({ path: archivo })
  console.log(base, ok ? 'sesión OK' : 'LOGIN FALLÓ', '→', p.url())
  await ctx.close()
  return ok
}

;(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] })
  const a = await entrar(b, 'http://127.0.0.1:3110', path.join(__dirname, '.estado-viejo.json'), '/login', 'input[name=password]')
  const c = await entrar(b, 'http://127.0.0.1:8081/spa', path.join(__dirname, '.estado-nuevo.json'), '/login', '#clave')
  await b.close()
  process.exit(a && c ? 0 : 1)
})()
