const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright')
const OUT = '/home/rizutov/ares-react/qa/audit'
;(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] })
  const out = {}
  // NUEVO: qué pasa al entrar a /mensajes?soporte=1
  let ctx = await b.newContext({ viewport: { width: 1440, height: 950 }, storageState: `${OUT}/../.estado-nuevo-comercio.json` })
  let p = await ctx.newPage()
  await p.goto('http://127.0.0.1:8081/spa/mensajes?soporte=1', { waitUntil: 'networkidle' }); await p.waitForTimeout(2000)
  out.nuevo_soporte = await p.evaluate(() => ({
    url: location.href,
    dialogo: document.querySelector('dialog[open]') ? document.querySelector('dialog[open]').innerText.replace(/\s+/g, ' ').slice(0, 160) : null,
    textarea: !!document.querySelector('textarea'),
    hilo: /Soporte/.test(document.body.innerText) ? 'menciona soporte' : 'no',
    texto: document.body.innerText.replace(/\n{3,}/g, '\n').slice(-700),
  }))
  await p.screenshot({ path: `${OUT}/perfil-mensajes-soporte-nuevo.png`, fullPage: true })
  await ctx.close()
  // VIEJO: /mensajes/soporte
  ctx = await b.newContext({ viewport: { width: 1440, height: 950 }, storageState: `${OUT}/../.estado-viejo-comercio.json` })
  p = await ctx.newPage()
  await p.goto('http://127.0.0.1:3110/mensajes/soporte', { waitUntil: 'networkidle' }); await p.waitForTimeout(2000)
  out.viejo_soporte = await p.evaluate(() => ({
    url: location.href,
    textarea: !!document.querySelector('textarea'),
    texto: document.body.innerText.replace(/\n{3,}/g, '\n').slice(-700),
  }))
  await p.screenshot({ path: `${OUT}/perfil-mensajes-soporte-viejo.png`, fullPage: true })
  await ctx.close()
  await b.close()
  console.log(JSON.stringify(out, null, 1))
})()
