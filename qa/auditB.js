const { chromium } = require('playwright')
const fs = require('fs')

const BASE = 'http://127.0.0.1:8081'
const ROUTES = ['/spa/', '/spa/buscar', '/spa/pedidos', '/spa/perfil']
const VIEWPORTS = [
  { name: '360x640', width: 360, height: 640 },
  { name: '390x844', width: 390, height: 844 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1280x900', width: 1280, height: 900 },
  { name: '1440x900', width: 1440, height: 900 },
]
const OUT = '/home/rizutov/ares-react/qa'

const MEASURE = () => {
  const vis = (el) => {
    const s = getComputedStyle(el)
    if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0) return false
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  }
  const path = (el) => {
    const parts = []
    let e = el
    for (let i = 0; i < 3 && e && e.nodeType === 1; i++) {
      let s = e.tagName.toLowerCase()
      if (e.id) { s += '#' + e.id; parts.unshift(s); break }
      if (e.className && typeof e.className === 'string') s += '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.')
      parts.unshift(s)
      e = e.parentElement
    }
    return parts.join(' > ')
  }
  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/)
    if (!m) return null
    const p = m[1].split(/[,/ ]+/).filter(Boolean).map(Number)
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }
  }
  const lum = ({ r, g, b }) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const blend = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  })
  const effBg = (el) => {
    let e = el
    while (e && e.nodeType === 1) {
      const s = getComputedStyle(e)
      const c = parse(s.backgroundColor)
      if (c && c.a > 0.03) return { color: c, src: path(e) }
      if (s.backgroundImage && s.backgroundImage !== 'none') return { color: { r: 245, g: 246, b: 241, a: 1 }, src: path(e) + ' (bg-image)' }
      e = e.parentElement
    }
    return { color: { r: 255, g: 255, b: 255, a: 1 }, src: 'canvas' }
  }
  const contrastOf = (el) => {
    const s = getComputedStyle(el)
    const fgc = parse(s.color)
    if (!fgc || s.color === 'rgba(0, 0, 0, 0)') return null
    const bg = effBg(el).color
    const fg = fgc.a < 1 ? blend(fgc, bg) : fgc
    const L1 = lum(fg), L2 = lum(bg)
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)
    return { ratio: Math.round(ratio * 100) / 100, fg: s.color, bg: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`, bgSrc: effBg(el).src }
  }

  const doc = document.documentElement
  const overflow = doc.scrollWidth - doc.clientWidth

  const overEls = []
  document.querySelectorAll('body *').forEach((el) => {
    if (!vis(el)) return
    const r = el.getBoundingClientRect()
    if (r.right > window.innerWidth + 1 || r.left < -1) {
      const s = getComputedStyle(el)
      if (s.position === 'fixed' || s.transform !== 'none') {
        if (s.transform !== 'none' && !s.position.includes('fixed')) { /* off-canvas drawers */ }
      }
      overEls.push({ sel: path(el), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width) })
    }
  })

  const smallFont = []
  const lowContrast = []
  const seen = new Set()
  document.querySelectorAll('body *').forEach((el) => {
    if (!vis(el)) return
    const txt = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('')
    if (!txt) return
    const s = getComputedStyle(el)
    const fs = parseFloat(s.fontSize)
    const key = path(el) + '|' + txt.slice(0, 20)
    if (seen.has(key)) return
    seen.add(key)
    if (fs < 12) smallFont.push({ sel: path(el), fs: Math.round(fs * 10) / 10, text: txt.slice(0, 40) })
    const c = contrastOf(el)
    if (c) {
      const bold = parseInt(s.fontWeight, 10) >= 700
      const large = fs >= 24 || (bold && fs >= 18.66)
      const need = large ? 3 : 4.5
      if (c.ratio < need) lowContrast.push({ sel: path(el), fs: Math.round(fs * 10) / 10, need, ...c, text: txt.slice(0, 40) })
    }
  })

  const smallTargets = []
  const seenT = new Set()
  document.querySelectorAll('button, a[href], input, select, textarea, [role="button"], summary').forEach((el) => {
    if (!vis(el)) return
    const r = el.getBoundingClientRect()
    const w = Math.round(r.width), h = Math.round(r.height)
    const key = path(el) + '|' + w + 'x' + h
    if (seenT.has(key)) return
    seenT.add(key)
    if (w < 44 || h < 44) {
      smallTargets.push({
        sel: path(el),
        tag: el.tagName.toLowerCase(),
        label: (el.getAttribute('aria-label') || el.textContent || el.value || el.type || '').trim().slice(0, 35),
        w, h,
      })
    }
  })

  // bottom bar overlap check (mobile): is any element inside .contenido covered by the rail?
  let covered = []
  const rail = document.querySelector('.rail')
  if (rail) {
    const rr = rail.getBoundingClientRect()
    const fixedBottom = getComputedStyle(rail).position === 'fixed' && rr.bottom >= window.innerHeight - 2
    if (fixedBottom) {
      document.querySelectorAll('.contenido button, .contenido a[href], .contenido input, .contenido .card, .contenido [class*="fila"], .contenido p').forEach((el) => {
        if (!vis(el)) return
        const r = el.getBoundingClientRect()
        const cx = Math.min(Math.max(r.left + r.width / 2, 0), window.innerWidth - 1)
        const cy = Math.min(Math.max(r.top + r.height / 2, 0), window.innerHeight - 1)
        if (cy < rr.top) return
        const hit = document.elementFromPoint(cx, cy)
        if (hit && rail.contains(hit)) covered.push({ sel: path(el), text: (el.textContent || '').trim().slice(0, 30), top: Math.round(r.top), railTop: Math.round(rr.top) })
      })
    }
  }

  return {
    overflow,
    overEls: overEls.slice(0, 12),
    smallFont,
    lowContrast,
    smallTargets,
    covered: covered.slice(0, 8),
    rail: rail ? (() => { const r = rail.getBoundingClientRect(); const s = getComputedStyle(rail); return { pos: s.position, top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), w: Math.round(r.width) } })() : null,
    mainPadBottom: (() => { const m = document.querySelector('.contenido'); return m ? getComputedStyle(m).paddingBottom : null })(),
    bodyH: document.body.scrollHeight,
    vh: window.innerHeight,
  }
}

;(async () => {
  const browser = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] })
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()

  // login
  await page.goto(BASE + '/spa', { waitUntil: 'networkidle' })
  if (await page.locator('input[type=email]').count()) {
    await page.fill('input[type=email]', 'comercio@didi2.mx')
    await page.fill('input[type=password]', 'comercio123')
    await page.click('button[type=submit]')
    await page.waitForTimeout(2500)
  }
  const loggedIn = await page.locator('.rail').count() > 0
  console.log('LOGIN ok:', loggedIn, 'url:', page.url())

  const results = []
  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    for (const route of ROUTES) {
      await page.goto(BASE + route, { waitUntil: 'networkidle' })
      await page.waitForTimeout(700)
      const data = await page.evaluate(MEASURE)
      const shot = `${OUT}/agenteB-${vp.name}-${route.replace(/^\/spa\/?/, '').replace(/\//g, '_') || 'inicio'}.png`
      await page.screenshot({ path: shot, fullPage: false })
      results.push({ vp: vp.name, route, shot, ...data })
      console.log(`--- ${vp.name} ${route} overflow=${data.overflow} smallFont=${data.smallFont.length} lowContrast=${data.lowContrast.length} smallTargets=${data.smallTargets.length} covered=${data.covered.length}`)
    }
  }
  fs.writeFileSync(`${OUT}/agenteB-measure.json`, JSON.stringify(results, null, 2))
  await browser.close()
})().catch((e) => { console.error('ERR', e); process.exit(1) })
