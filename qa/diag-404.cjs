const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright')
const PUB = 'https://riz0308.tail0820b4.ts.net/spa'
;(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] })
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
  const fail = []
  p.on('response', (r) => { if (r.status() >= 400) fail.push(`${r.status()} ${r.request().resourceType()} ${r.url()}`) })
  p.on('requestfailed', (r) => fail.push(`FAILED ${r.url()} ${r.failure()?.errorText}`))
  await p.goto(PUB + '/login', { waitUntil: 'networkidle' })
  await p.fill('input[type="email"]', 'comercio@didi2.mx')
  await p.fill('input[type="password"]', 'comercio123')
  await p.click('button[type="submit"]')
  await p.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 25000 })
  await p.waitForTimeout(1200)
  for (const r of ['/pedidos', '/buscar', '/finanzas', '/perfil']) {
    await p.goto(PUB + r, { waitUntil: 'networkidle' })
    await p.waitForTimeout(800)
  }
  console.log(fail.length ? [...new Set(fail)].join('\n') : 'sin fallos')
  await b.close()
})()
