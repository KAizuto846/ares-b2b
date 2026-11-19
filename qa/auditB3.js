const { chromium } = require('playwright')
const fs = require('fs')
const BASE = 'http://127.0.0.1:8081'
const OUT = '/home/rizutov/ares-react/qa'

const MEASURE = () => {
  const path = (el) => {
    const parts = []
    let e = el
    for (let i = 0; i < 3 && e && e.nodeType === 1; i++) {
      let s = e.tagName.toLowerCase()
      if (e.id) { s += '#' + e.id; parts.unshift(s); break }
      if (e.className && typeof e.className === 'string') s += '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.')
      parts.unshift(s); e = e.parentElement
    }
    return parts.join(' > ')
  }
  const vis = (el) => { const s = getComputedStyle(el); if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
  const inClosed = (el) => { const d = el.closest('.cajon'); return !!d && !d.classList.contains('abierto') }
  const parse = (c) => { const m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[,/ ]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 } }
  const grad = (i) => { const m = String(i).match(/rgba?\([^)]+\)/g); return m ? parse(m[m.length - 1]) : null }
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const effBg = (el) => { let e = el; while (e && e.nodeType === 1) { const s = getComputedStyle(e); const c = parse(s.backgroundColor); if (c && c.a > 0.03) return c; const g = s.backgroundImage && s.backgroundImage !== 'none' ? grad(s.backgroundImage) : null; if (g) return g; e = e.parentElement } return { r: 255, g: 255, b: 255, a: 1 } }
  const smallFont = [], lowContrast = [], smallTargets = []
  const seen = new Set()
  document.querySelectorAll('body *').forEach((el) => {
    if (!vis(el) || inClosed(el)) return
    const txt = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('')
    if (!txt) return
    const s = getComputedStyle(el), fs = parseFloat(s.fontSize)
    const key = path(el) + '|' + txt.slice(0, 25)
    if (seen.has(key)) return
    seen.add(key)
    if (fs < 12) smallFont.push({ sel: path(el), fs: Math.round(fs * 10) / 10, text: txt.slice(0, 36) })
    const fgc = parse(s.color); if (!fgc) return
    const bg = effBg(el), fg = fgc.a < 1 ? { r: fgc.r * fgc.a + bg.r * (1 - fgc.a), g: fgc.g * fgc.a + bg.g * (1 - fgc.a), b: fgc.b * fgc.a + bg.b * (1 - fgc.a) } : fgc
    const L1 = lum(fg), L2 = lum(bg)
    const ratio = Math.round(((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)) * 100) / 100
    const bold = parseInt(s.fontWeight, 10) >= 700
    const need = fs >= 24 || (bold && fs >= 18.66) ? 3 : 4.5
    if (ratio < need) lowContrast.push({ sel: path(el), fs: Math.round(fs * 10) / 10, bold, ratio, need, fg: s.color, bg: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`, text: txt.slice(0, 36) })
  })
  const seenT = new Set()
  document.querySelectorAll('button, a[href], input, select, textarea, [role="button"]').forEach((el) => {
    if (!vis(el) || inClosed(el)) return
    const r = el.getBoundingClientRect(), w = Math.round(r.width), h = Math.round(r.height)
    const key = path(el) + '|' + w + 'x' + h
    if (seenT.has(key)) return
    seenT.add(key)
    if (w < 44 || h < 44) smallTargets.push({ sel: path(el), tag: el.tagName.toLowerCase(), label: (el.getAttribute('aria-label') || el.textContent || el.value || el.type || '').trim().slice(0, 34), w, h })
  })
  return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, smallFont, lowContrast, smallTargets, hasRail: !!document.querySelector('.rail') }
}

;(async () => {
  const browser = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  let ok = false
  for (let i = 0; i < 4 && !ok; i++) {
    await page.goto(BASE + '/spa', { waitUntil: 'domcontentloaded' })
    if (await page.locator('.rail').count()) { ok = true; break }
    await page.fill('input[type=email]', 'comercio@didi2.mx')
    await page.fill('input[type=password]', 'comercio123')
    await page.click('button[type=submit]')
    await page.waitForTimeout(2500)
    ok = (await page.locator('.rail').count()) > 0
    console.log('login', i + 1, ok)
  }
  if (!ok) { console.log('ABORT login'); await browser.close(); return }

  // pedidos @1440 re-check
  await page.goto(BASE + '/spa/pedidos', { waitUntil: 'networkidle' })
  await page.waitForTimeout(900)
  const ped = await page.evaluate(MEASURE)
  await page.screenshot({ path: `${OUT}/agenteB-1440x900-pedidos.png` })
  console.log('PEDIDOS 1440:', JSON.stringify({ hasRail: ped.hasRail, overflow: ped.overflow, sf: ped.smallFont.length, lc: ped.lowContrast.length, st: ped.smallTargets.length }))

  // ---- drawer focus behaviour ----
  const focusTest = async (w, h, label) => {
    await page.setViewportSize({ width: w, height: h })
    await page.goto(BASE + '/spa/buscar', { waitUntil: 'networkidle' })
    await page.waitForTimeout(800)
    await page.click('#boton-carrito')
    await page.waitForTimeout(700)
    const seq = []
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Tab')
      seq.push(await page.evaluate(() => {
        const a = document.activeElement
        const caja = document.querySelector('.cajon__caja')
        const r = a.getBoundingClientRect()
        return {
          tag: a.tagName.toLowerCase(),
          cls: String(a.className).slice(0, 34),
          label: (a.getAttribute('aria-label') || a.textContent || a.value || '').trim().slice(0, 24),
          insideDrawer: caja.contains(a),
          coveredByVeil: (() => { const hit = document.elementFromPoint(Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 1), Math.min(Math.max(r.top + r.height / 2, 1), innerHeight - 1)); return hit ? !!hit.closest('.cajon__velo') : null })(),
        }
      }))
    }
    const overlayEls = await page.evaluate(() => {
      const total = Array.from(document.querySelectorAll('button, a[href], input, select')).filter((e) => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return s.display !== 'none' && r.width > 0 })
      const behind = total.filter((e) => !e.closest('.cajon__caja'))
      return { focusablesTotal: total.length, focusablesBehindModal: behind.length, samples: behind.slice(0, 3).map((e) => (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 22)) }
    })
    await page.screenshot({ path: `${OUT}/agenteB-${label}-carrito-foco.png` })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
    console.log(`FOCUS ${label}:`, JSON.stringify({ seq, overlayEls }))
    return { seq, overlayEls }
  }
  const f360 = await focusTest(360, 640, '360x640')
  const f1280 = await focusTest(1280, 900, '1280x900')

  // ---- evidence fullPage shots ----
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(BASE + '/spa/perfil', { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/agenteB-390x844-perfil-full.png`, fullPage: true })
  await page.setViewportSize({ width: 360, height: 640 })
  await page.goto(BASE + '/spa/buscar', { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/agenteB-360x640-buscar-fondo.png` })

  // re-measure pedidos + 1440 all routes for completeness
  const extra = []
  for (const route of ['/spa/', '/spa/buscar', '/spa/perfil']) {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(BASE + route, { waitUntil: 'networkidle' })
    await page.waitForTimeout(600)
    extra.push({ route, vp: '1440x900', ...(await page.evaluate(MEASURE)) })
  }
  fs.writeFileSync(`${OUT}/agenteB-check2.json`, JSON.stringify({ ped, focus: { f360, f1280 }, extra }, null, 2))
  console.log('done')
  await browser.close()
})().catch((e) => { console.error('ERR', e); process.exit(1) })
