const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright')
const fs = require('fs')
const OUT = '/home/rizutov/ares-react/qa/audit'
const apps = { viejo: 'http://127.0.0.1:3110', nuevo: 'http://127.0.0.1:8081/spa' }

async function info(page) {
  return await page.evaluate(() => {
    const t = (e) => (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim()
    const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' }
    const campos = [...document.querySelectorAll('input,select,textarea')].filter(vis).map(e => ({ tipo: e.tagName.toLowerCase() + (e.type ? '[' + e.type + ']' : ''), label: (e.closest('label') ? t(e.closest('label')) : (e.getAttribute('aria-label') || e.placeholder || '')).slice(0, 70), req: e.required }))
    const botones = [...document.querySelectorAll('button,input[type=submit]')].filter(vis).map(e => t(e) || e.value).filter(Boolean)
    const dialogs = [...document.querySelectorAll('dialog')].filter(e => e.open).map(e => t(e).slice(0, 300))
    return { url: location.href, campos, botones, dialogs, texto: document.body.innerText.replace(/\n{3,}/g, '\n').slice(0, 1800) }
  })
}

;(async () => {
  const browser = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] })
  const res = {}
  for (const [app, base] of Object.entries(apps)) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, storageState: `${OUT}/../.estado-${app}-comercio.json` })
    const page = await ctx.newPage()
    const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 150)))

    // --- hilo abierto
    await page.goto(base + '/mensajes', { waitUntil: 'networkidle' }); await page.waitForTimeout(1000)
    const fila = page.locator('[class*=msg-fila], .hilo, .conversacion').first()
    try { await fila.click(); await page.waitForTimeout(1500) } catch (e) {}
    res[app + ':hilo'] = await info(page)
    await page.screenshot({ path: `${OUT}/perfil-mensajes-hilo-${app}.png`, fullPage: true })

    // --- modo borrado
    await page.goto(base + '/mensajes', { waitUntil: 'networkidle' }); await page.waitForTimeout(800)
    const btn = page.getByRole('button', { name: /Eliminar conversaciones|Eliminar seleccionadas/ }).first()
    try { await btn.click(); await page.waitForTimeout(900) } catch (e) { res[app + ':borrar-err'] = String(e).slice(0, 120) }
    res[app + ':borrar'] = await info(page)
    await page.screenshot({ path: `${OUT}/perfil-mensajes-borrado-${app}.png`, fullPage: true })

    // --- nueva conversacion + configuracion dialogs
    for (const nombre of ['Nueva conversación', 'Configuración']) {
      await page.goto(base + '/mensajes', { waitUntil: 'networkidle' }); await page.waitForTimeout(700)
      try { await page.getByRole('button', { name: nombre }).first().click(); await page.waitForTimeout(800) } catch (e) {}
      res[app + ':dlg-' + nombre] = await info(page)
    }

    // --- notificaciones: click primer Ver detalle
    await page.goto(base + '/mensajes?tab=notificaciones', { waitUntil: 'networkidle' }); await page.waitForTimeout(900)
    try { await page.getByText('Ver detalle').first().click(); await page.waitForTimeout(1800) } catch (e) {}
    res[app + ':notif-detalle'] = await info(page)

    // --- ayuda: comprobar enlaces legales clicables
    await page.goto(base + '/ayuda', { waitUntil: 'networkidle' }); await page.waitForTimeout(800)
    res[app + ':ayuda'] = await page.evaluate(() => {
      const t = (e) => (e.innerText || '').replace(/\s+/g, ' ').trim()
      const anchors = [...document.querySelectorAll('a')].map(a => ({ txt: t(a).slice(0, 40), href: a.getAttribute('href') }))
      const legales = [...document.querySelectorAll('*')].filter(e => /términos y condiciones|Términos y condiciones/i.test(e.textContent || '') && e.children.length === 0).map(e => ({ txt: t(e), tag: e.tagName, clickable: !!e.closest('a,button') }))
      return { anchors, legales }
    })
    res[app + ':errores'] = errs
    await ctx.close()
  }
  await browser.close()
  fs.writeFileSync(`${OUT}/interacciones.json`, JSON.stringify(res, null, 1))
  for (const k of Object.keys(res)) {
    if (k.endsWith('errores')) { console.log(k, res[k]); continue }
    const v = res[k]
    console.log('=== ' + k + ' | ' + v.url)
    console.log('  campos:', JSON.stringify(v.campos))
    console.log('  botones:', JSON.stringify(v.botones))
    if (v.dialogs && v.dialogs.length) console.log('  dialogs:', JSON.stringify(v.dialogs))
    if (v.anchors) console.log('  anchors:', JSON.stringify(v.anchors))
    if (v.legales) console.log('  legales:', JSON.stringify(v.legales))
  }
})()
