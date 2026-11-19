/** Guarda el estado de sesión de cada rol en el panel viejo y en la SPA. */
const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright')
const path = require('path')

const CUENTAS = {
  comercio: ['comercio@didi2.mx', 'comercio123'],
  mayorista: ['demo-insumos-del-valle@didi2.mx', 'demo1234'],
  repartidor: ['repartidor@didi2.mx', 'repartidor123'],
  admin: ['admin@didi2.mx', 'admin123'],
}

async function entrar(b, base, ruta, campo, email, clave, archivo) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } })
  const p = await ctx.newPage()
  await p.goto(base + ruta, { waitUntil: 'networkidle' })
  await p.fill('input[name=email], input[type=email]', email)
  await p.fill(campo, clave)
  await p.click('button[type=submit]')
  await p.waitForTimeout(2500)
  const ok = !/bloqueado|\/login/.test(p.url())
  if (ok) await ctx.storageState({ path: archivo })
  console.log(`${email.padEnd(24)} ${base.includes('3110') ? 'viejo' : 'spa  '} ${ok ? 'OK  ' : 'FALLÓ'} ${p.url()}`)
  await ctx.close()
  return { ok, url: p.url() }
}

;(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] })
  const res = {}
  for (const [rol, [email, clave]] of Object.entries(CUENTAS)) {
    const v = await entrar(b, 'http://127.0.0.1:3110', '/login', 'input[name=password]', email, clave, path.join(__dirname, `.estado-viejo-${rol}.json`))
    const n = await entrar(b, 'http://127.0.0.1:8081/spa', '/login', '#clave', email, clave, path.join(__dirname, `.estado-nuevo-${rol}.json`))
    res[rol] = { viejo: v.ok, spa: n.ok }
  }
  await b.close()
  console.log(JSON.stringify(res))
})()
