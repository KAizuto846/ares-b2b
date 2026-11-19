const { chromium } = require('playwright')
;(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] })
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
  const p = await ctx.newPage()
  await p.goto('http://127.0.0.1:8081/spa', { waitUntil: 'networkidle' })
  await p.fill('input[type=email]', 'comercio@didi2.mx')
  await p.fill('input[type=password]', 'comercio123')
  await p.click('button[type=submit]')
  await p.waitForTimeout(2500)
  for (const w of [390, 360]) {
    await p.setViewportSize({ width: w, height: 844 })
    await p.goto('http://127.0.0.1:8081/spa/perfil', { waitUntil: 'networkidle' })
    await p.waitForTimeout(800)
    const out = await p.evaluate(() => {
      const res = { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, bad: [] }
      const deem = (el) => {
        const r = el.getBoundingClientRect()
        const s = getComputedStyle(el)
        return { tag: el.tagName, cls: el.className, text: (el.textContent || '').trim().slice(0, 45), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), ws: s.whiteSpace, minW: s.minWidth, overflowX: s.overflowX, display: s.display, parentW: Math.round(el.parentElement.getBoundingClientRect().width), parentOverflow: getComputedStyle(el.parentElement).overflowX }
      }
      document.querySelectorAll('.contenido *').forEach((el) => {
        const r = el.getBoundingClientRect()
        if (r.right > window.innerWidth + 1) res.bad.push(deem(el))
      })
      res.bad = res.bad.slice(0, 6)
      // scroll containers that could hide it
      res.scrollers = Array.from(document.querySelectorAll('.card, .card__cuerpo, .contenido')).map((e) => ({ cls: e.className, ow: e.scrollWidth, cw: e.clientWidth }))
      return res
    })
    console.log('=== width', w, JSON.stringify(out, null, 1))
    await p.screenshot({ path: `/home/rizutov/ares-react/qa/agenteB-perfil-${w}-diag.png`, fullPage: false })
  }
  await b.close()
})()
