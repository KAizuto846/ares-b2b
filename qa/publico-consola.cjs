const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright')
;(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] })
  const p = await (await b.newContext()).newPage()
  const err = [], fail = []
  p.on('console', (m) => { if (m.type() === 'error') err.push(m.text().slice(0, 220)) })
  p.on('pageerror', (e) => err.push('PAGEERROR ' + String(e).slice(0, 200)))
  p.on('response', (r) => { if (r.status() >= 400) fail.push(`${r.status()} ${r.url()}`) })
  await p.goto('https://riz0308.tail0820b4.ts.net/spa/login', { waitUntil: 'networkidle' })
  console.log('titulo:', await p.title())
  console.log('CONSOLA:', err.length ? err : 'limpia')
  console.log('>=400:', fail.length ? fail : 'ninguna')
  await b.close()
})()
