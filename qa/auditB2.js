const { chromium } = require('playwright')
const fs = require('fs')
const BASE = 'http://127.0.0.1:8081'
const ROUTES = ['/spa/', '/spa/buscar', '/spa/pedidos', '/spa/perfil']
const VPS = [
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
  const inClosedDrawer = (el) => {
    const d = el.closest('.cajon')
    return !!d && !d.classList.contains('abierto')
  }
  const parse = (c) => {
    const m = String(c).match(/rgba?\(([^)]+)\)/)
    if (!m) return null
    const p = m[1].split(/[,/ ]+/).filter(Boolean).map(Number)
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }
  }
  const gradColor = (img) => {
    const m = String(img).match(/rgba?\([^)]+\)/g)
    if (!m) return null
    return parse(m[m.length - 1])
  }
  const lum = ({ r, g, b }) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const blend = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 })
  const effBg = (el) => {
    let e = el
    while (e && e.nodeType === 1) {
      const s = getComputedStyle(e)
      const c = parse(s.backgroundColor)
      if (c && c.a > 0.03) return c.a < 1 ? { c, partial: true } : { c }
      const g = s.backgroundImage && s.backgroundImage !== 'none' ? gradColor(s.backgroundImage) : null
      if (g) return { c: g }
      e = e.parentElement
    }
    return { c: { r: 255, g: 255, b: 255, a: 1 } }
  }
  const doc = document.documentElement
  const overflow = doc.scrollWidth - doc.clientWidth

  const smallFont = [], lowContrast = [], smallTargets = []
  const seen = new Set()
  document.querySelectorAll('body *').forEach((el) => {
    if (!vis(el) || inClosedDrawer(el)) return
    const txt = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('')
    if (!txt) return
    const s = getComputedStyle(el)
    const fs = parseFloat(s.fontSize)
    const key = path(el) + '|' + txt.slice(0, 25)
    if (seen.has(key)) return
    seen.add(key)
    if (fs < 12) smallFont.push({ sel: path(el), fs: Math.round(fs * 10) / 10, text: txt.slice(0, 36) })
    const fgc = parse(s.color)
    if (!fgc || s.color === 'rgba(0, 0, 0, 0)') return
    const bg = effBg(el).c
    const fg = fgc.a < 1 ? blend(fgc, bg) : fgc
    const L1 = lum(fg), L2 = lum(bg)
    const ratio = Math.round(((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)) * 100) / 100
    const bold = parseInt(s.fontWeight, 10) >= 700
    const need = fs >= 24 || (bold && fs >= 18.66) ? 3 : 4.5
    if (ratio < need) lowContrast.push({
      sel: path(el), fs: Math.round(fs * 10) / 10, bold, ratio, need,
      fg: s.color, bg: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`, text: txt.slice(0, 36),
    })
  })
  const seenT = new Set()
  document.querySelectorAll('button, a[href], input, select, textarea, [role="button"], summary').forEach((el) => {
    if (!vis(el) || inClosedDrawer(el)) return
    const r = el.getBoundingClientRect()
    const w = Math.round(r.width), h = Math.round(r.height)
    const key = path(el) + '|' + w + 'x' + h
    if (seenT.has(key)) return
    seenT.add(key)
    if (w < 44 || h < 44) smallTargets.push({ sel: path(el), tag: el.tagName.toLowerCase(), label: (el.getAttribute('aria-label') || el.textContent || el.value || el.type || '').trim().slice(0, 34), w, h })
  })
  // overflows
  const overEls = []
  document.querySelectorAll('body *').forEach((el) => {
    if (!vis(el) || inClosedDrawer(el)) return
    const r = el.getBoundingClientRect()
    if (r.right > window.innerWidth + 1) overEls.push({ sel: path(el), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), text: (el.textContent || '').trim().slice(0, 30) })
  })
  return { overflow, overEls: overEls.slice(0, 8), smallFont, lowContrast, smallTargets, rail: (() => { const r = document.querySelector('.rail'); if (!r) return null; const b = r.getBoundingClientRect(); const s = getComputedStyle(r); return { pos: s.position, top: Math.round(b.top), h: Math.round(b.height), w: Math.round(b.width) } })(), vh: window.innerHeight, scrollH: document.documentElement.scrollHeight }
}

const BOTTOM = () => {
  const rail = document.querySelector('.rail')
  const m = document.querySelector('.contenido')
  if (!rail || !m) return null
  const rr = rail.getBoundingClientRect()
  if (getComputedStyle(rail).position !== 'fixed') return { fixed: false }
  // last visible block inside contenido
  const kids = Array.from(m.querySelectorAll('*')).filter((e) => { const b = e.getBoundingClientRect(); return b.width > 40 && b.height > 20 })
  const last = kids[kids.length - 1]
  const lb = last.getBoundingClientRect()
  const padB = parseFloat(getComputedStyle(m).paddingBottom)
  const atBottom = Math.abs(window.scrollY + window.innerHeight - document.documentElement.scrollHeight) < 2
  let coveredBy = null
  const cx = Math.min(Math.max(lb.left + lb.width / 2, 1), window.innerWidth - 1)
  const cy = Math.min(lb.top + Math.min(lb.height / 2, 10), window.innerHeight - 2)
  const hit = document.elementFromPoint(cx, cy)
  if (hit && rail.contains(hit)) coveredBy = hit.className || hit.tagName
  return {
    fixed: true, railTop: Math.round(rr.top), railH: Math.round(rr.height), padBottom: padB,
    lastEl: last.className || last.tagName, lastBottom: Math.round(lb.bottom), coveredBy, atBottom,
    gap: Math.round(rr.top - lb.bottom),
  }
}

;(async () => {
  const browser = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] })
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()

  // ---- login with retry (rate-limited server) ----
  let ok = false
  for (let i = 0; i < 20 && !ok; i++) {
    await page.goto(BASE + '/spa', { waitUntil: 'domcontentloaded' })
    if (await page.locator('.rail').count()) { ok = true; break }
    if (await page.locator('input[type=email]').count()) {
      await page.fill('input[type=email]', 'comercio@didi2.mx')
      await page.fill('input[type=password]', 'comercio123')
      const [resp] = await Promise.all([
        page.waitForResponse((r) => r.url().includes('/api/login'), { timeout: 15000 }).catch(() => null),
        page.click('button[type=submit]'),
      ])
      await page.waitForTimeout(1800)
      ok = (await page.locator('.rail').count()) > 0
      console.log(`login try ${i + 1}: status=${resp ? resp.status() : '?'} ok=${ok}`)
    }
    if (!ok) await page.waitForTimeout(45000)
  }
  if (!ok) { console.log('NO LOGIN - abort'); await browser.close(); process.exit(2) }

  const all = { measure: [], bottom: {}, keyboard: {}, drawer: {}, perfilDiag: {} }

  for (const vp of VPS) {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    for (const route of ROUTES) {
      await page.goto(BASE + route, { waitUntil: 'networkidle' })
      await page.waitForTimeout(600)
      const data = await page.evaluate(MEASURE)
      const slug = route.replace(/^\/spa\/?/, '').replace(/\//g, '_') || 'inicio'
      const shot = `${OUT}/agenteB-${vp.name}-${slug}.png`
      await page.screenshot({ path: shot })
      let bottom = null
      if (vp.width <= 760) {
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
        await page.waitForTimeout(400)
        bottom = await page.evaluate(BOTTOM)
        await page.screenshot({ path: `${OUT}/agenteB-${vp.name}-${slug}-fondo.png` })
        await page.evaluate(() => window.scrollTo(0, 0))
      }
      all.measure.push({ vp: vp.name, route, shot, ...data })
      if (bottom) all.bottom[`${vp.name} ${route}`] = bottom
      const lc = data.lowContrast.filter((x) => x.ratio < (x.need === 3 ? 3 : 4))
      console.log(`--- ${vp.name} ${route} ovf=${data.overflow} smallFont=${data.smallFont.length} lowC=${data.lowContrast.length} smallT=${data.smallTargets.length} rail=${data.rail ? data.rail.pos + ':' + data.rail.h : '-'}`)
    }
  }

  // ---------- perfil 390 diagnostic ----------
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(BASE + '/spa/perfil', { waitUntil: 'networkidle' })
  await page.waitForTimeout(700)
  all.perfilDiag = await page.evaluate(() => {
    const out = { scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth, chain: [] }
    let worst = null
    document.querySelectorAll('.contenido *').forEach((el) => {
      const r = el.getBoundingClientRect()
      if (r.right > window.innerWidth + 1 && (!worst || r.right > worst.r.right)) worst = { el, r }
    })
    if (worst) {
      let e = worst.el
      while (e && e !== document.body) {
        const s = getComputedStyle(e), r = e.getBoundingClientRect()
        out.chain.unshift({
          tag: e.tagName.toLowerCase(), cls: String(e.className).slice(0, 40),
          w: Math.round(r.width), left: Math.round(r.left), right: Math.round(r.right),
          display: s.display, minWidth: s.minWidth, flex: s.flex, whiteSpace: s.whiteSpace, overflowX: s.overflowX, text: (e.textContent || '').trim().slice(0, 40),
        })
        e = e.parentElement
      }
    }
    return out
  })
  await page.screenshot({ path: `${OUT}/agenteB-390x844-perfil-overflow.png` })

  // ---------- keyboard ----------
  const kb = async (w, h, label) => {
    await page.setViewportSize({ width: w, height: h })
    await page.goto(BASE + '/spa/buscar', { waitUntil: 'networkidle' })
    await page.waitForTimeout(700)
    await page.evaluate(() => document.activeElement && document.activeElement.blur())
    const seq = []
    for (let i = 0; i < 26; i++) {
      await page.keyboard.press('Tab')
      const info = await page.evaluate(() => {
        const a = document.activeElement
        if (!a || a === document.body) return { tag: 'body' }
        const s = getComputedStyle(a)
        const r = a.getBoundingClientRect()
        return {
          tag: a.tagName.toLowerCase(),
          cls: String(a.className).slice(0, 40),
          label: (a.getAttribute('aria-label') || a.textContent || a.value || '').trim().slice(0, 26),
          inRail: !!a.closest('.rail'),
          inClosedDrawer: !!a.closest('.cajon') && !a.closest('.cajon').classList.contains('abierto'),
          visible: !(r.width === 0 || r.height === 0 || s.visibility === 'hidden'),
          focusVisible: a.matches(':focus-visible'),
          outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`,
          shadow: s.boxShadow === 'none' ? 'none' : 'yes',
        }
      })
      seq.push(info)
    }
    await page.keyboard.press('Tab')
    await page.screenshot({ path: `${OUT}/agenteB-${label}-foco-teclado.png` })
    all.keyboard[label] = seq
    const invisible = seq.filter((s) => s.inClosedDrawer)
    const noFocusStyle = seq.filter((s) => s.focusVisible && s.outline.startsWith('none') && s.shadow === 'none')
    console.log(`KB ${label}: railHits=${seq.filter((s) => s.inRail).length} closedDrawerHits=${invisible.length} noVisibleFocus=${noFocusStyle.length}`)
  }
  await kb(360, 640, '360x640')
  await kb(1280, 900, '1280x900')

  // ---------- drawer ----------
  const drawer = async (w, h, label) => {
    await page.setViewportSize({ width: w, height: h })
    await page.goto(BASE + '/spa/buscar', { waitUntil: 'networkidle' })
    await page.waitForTimeout(700)
    const before = await page.evaluate(() => {
      const a = document.activeElement
      return { focusWidth: a ? a.tagName : null, caja: (() => { const c = document.querySelector('.cajon__caja'); const s = getComputedStyle(c); return { w: c.getBoundingClientRect().width, transform: s.transform, display: s.display, visibility: s.visibility, transition: s.transitionDuration } })() }
    })
    await page.click('#boton-carrito')
    await page.waitForTimeout(700)
    const open = await page.evaluate(() => {
      const c = document.querySelector('.cajon')
      const caja = document.querySelector('.cajon__caja')
      const r = caja.getBoundingClientRect()
      const a = document.activeElement
      return {
        clase: c.className, ariaHidden: c.getAttribute('aria-hidden'),
        cajaW: Math.round(r.width), cajaLeft: Math.round(r.left), cajaRight: Math.round(r.right),
        vw: window.innerWidth, vh: window.innerHeight, cajaH: Math.round(r.height),
        pctW: Math.round((r.width / window.innerWidth) * 100),
        focusInside: !!a.closest('.cajon__caja'), focusTag: a.tagName, focusLabel: (a.getAttribute('aria-label') || a.textContent || '').trim().slice(0, 20),
        scrollLock: getComputedStyle(document.body).overflow,
      }
    })
    await page.screenshot({ path: `${OUT}/agenteB-${label}-carrito-abierto.png` })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(600)
    const afterEsc = await page.evaluate(() => {
      const c = document.querySelector('.cajon')
      const a = document.activeElement
      return { clase: c.className, ariaHidden: c.getAttribute('aria-hidden'), focusTag: a.tagName, focusLabel: (a.getAttribute('aria-label') || a.textContent || '').trim().slice(0, 24) }
    })
    all.drawer[label] = { before, open, afterEsc }
    console.log(`DRAWER ${label}: pctW=${open.pctW}% open=${open.clase} esc->${afterEsc.clase} focusInside=${open.focusInside}`)
  }
  await drawer(360, 640, '360x640')
  await drawer(390, 844, '390x844')
  await drawer(1280, 900, '1280x900')

  fs.writeFileSync(`${OUT}/agenteB-final.json`, JSON.stringify(all, null, 2))
  await browser.close()
})().catch((e) => { console.error('ERR', e); process.exit(1) })
