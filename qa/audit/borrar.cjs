const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright')
const OUT = '/home/rizutov/ares-react/qa/audit'
const apps = { viejo: 'http://127.0.0.1:3110', nuevo: 'http://127.0.0.1:8081/spa' }
;(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] })
  const out = {}
  for (const [app, base] of Object.entries(apps)) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 950 }, storageState: `${OUT}/../.estado-${app}-comercio.json` })
    const p = await ctx.newPage()
    await p.goto(base + '/mensajes', { waitUntil: 'networkidle' }); await p.waitForTimeout(1500)
    const paso = {}
    paso.botones0 = await p.evaluate(() => [...document.querySelectorAll('button,a.boton,.boton')].filter(e => e.offsetParent).map(e => (e.innerText || e.getAttribute('aria-label') || '').trim()).filter(Boolean))
    // primer toque
    const btn = p.locator('button[title="Eliminar conversaciones"], button[aria-label*="Eliminar"], button:has-text("Eliminar conversaciones")').first()
    try { await btn.click({ timeout: 4000 }) } catch (e) { paso.err1 = String(e).slice(0, 100) }
    await p.waitForTimeout(1200)
    paso.tras1 = await p.evaluate(() => ({
      checks: [...document.querySelectorAll('input[type=checkbox]')].map(c => ({ vis: !!c.offsetParent, label: (c.closest('label') ? c.closest('label').innerText : '').replace(/\s+/g, ' ').slice(0, 50) })),
      botones: [...document.querySelectorAll('button,a.boton,.boton')].filter(e => e.offsetParent).map(e => (e.innerText || e.getAttribute('aria-label') || '').trim()).filter(Boolean),
      dialogoAbierto: !!document.querySelector('dialog[open]'),
    }))
    // marcar y segundo toque (solo abrir confirmación, sin confirmar)
    try { await p.locator('input[type=checkbox]').first().check({ timeout: 3000 }) } catch (e) { paso.err2 = String(e).slice(0, 80) }
    await p.waitForTimeout(500)
    paso.trasMarcar = await p.evaluate(() => [...document.querySelectorAll('button,a.boton,.boton')].filter(e => e.offsetParent).map(e => (e.innerText || e.getAttribute('aria-label') || '').trim()).filter(Boolean))
    if (app === 'nuevo') {
      try { await p.locator('button[aria-label*="Eliminar"], button:has-text("Eliminar seleccionadas"), button:has-text("Eliminar conversaciones")').first().click({ timeout: 3000 }) } catch (e) { paso.err3 = String(e).slice(0, 80) }
      await p.waitForTimeout(900)
    }
    paso.tras2 = await p.evaluate(() => ({ dialogo: document.querySelector('dialog[open]') ? document.querySelector('dialog[open]').innerText.replace(/\s+/g, ' ').slice(0, 200) : null }))
    // cancelar / escape sin borrar
    try { await p.keyboard.press('Escape') } catch (e) {}
    await p.waitForTimeout(400)
    await p.screenshot({ path: `${OUT}/perfil-mensajes-borrado2-${app}.png`, fullPage: true })
    out[app] = paso
    await ctx.close()
  }
  await b.close()
  console.log(JSON.stringify(out, null, 1))
})()
