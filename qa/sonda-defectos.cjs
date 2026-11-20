/* Sonda de defectos objetivos: texto recortado, columnas vacías, imágenes sin alt,
   contraste bajo y controles sin nombre accesible. Sin juicios estéticos. */
const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright')
const BASE = 'http://127.0.0.1:8081/spa'
const CUENTAS = {
  comercio: { email: 'comercio@didi2.mx', clave: 'comercio123' },
  mayorista: { email: 'demo-insumos-del-valle@didi2.mx', clave: 'demo1234' },
  admin: { email: 'admin@didi2.mx', clave: 'admin123' },
}
const RUTAS = {
  comercio: ['/', '/buscar', '/pedidos', '/finanzas', '/perfil', '/pos'],
  mayorista: ['/', '/productos', '/pedidos', '/finanzas'],
  admin: ['/admin', '/admin/usuarios'],
}

const SONDA = () => {
  const recortados = [], sinAlt = [], sinNombre = [], columnasVacias = []
  document.querySelectorAll('body *').forEach((el) => {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') return
    if (el.children.length === 0 && el.textContent.trim()) {
      const oculto = cs.overflow === 'hidden' || cs.textOverflow === 'ellipsis'
      if (oculto && el.scrollWidth > el.clientWidth + 1) {
        recortados.push(`${el.tagName}.${el.className} "${el.textContent.trim().slice(0, 40)}" ${el.clientWidth}<${el.scrollWidth}`)
      }
    }
    if (el.tagName === 'IMG' && !el.getAttribute('alt') && el.getAttribute('alt') !== '') {
      sinAlt.push(el.getAttribute('src')?.slice(0, 60))
    }
    if (['BUTTON', 'A'].includes(el.tagName) && !el.textContent.trim() && !el.getAttribute('aria-label') && !el.getAttribute('title')) {
      sinNombre.push(`${el.tagName}.${el.className}`)
    }
  })
  document.querySelectorAll('table').forEach((t) => {
    const ths = [...t.querySelectorAll('thead th')]
    const filas = [...t.querySelectorAll('tbody tr')]
    ths.forEach((th, i) => {
      const vacia = filas.length > 0 && filas.every((f) => {
        const c = f.children[i]
        if (!c) return true
        return !c.textContent.trim() && !c.querySelector('img,svg,button,a,input')
      })
      if (vacia) columnasVacias.push(`${th.textContent.trim()} (col ${i + 1})`)
    })
  })
  return {
    recortados: [...new Set(recortados)].slice(0, 6),
    sinAlt: [...new Set(sinAlt)].slice(0, 5),
    sinNombre: [...new Set(sinNombre)].slice(0, 6),
    columnasVacias: [...new Set(columnasVacias)].slice(0, 6),
  }
}

;(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] })
  for (const [rol, cuenta] of Object.entries(CUENTAS)) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
    const p = await ctx.newPage()
    await p.goto(BASE + '/login', { waitUntil: 'networkidle' })
    await p.fill('input[type="email"]', cuenta.email)
    await p.fill('input[type="password"]', cuenta.clave)
    await p.click('button[type="submit"]')
    await p.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 20000 }).catch(() => {})
    for (const ruta of RUTAS[rol]) {
      await p.goto(BASE + ruta, { waitUntil: 'networkidle' }).catch(() => {})
      await p.waitForTimeout(600)
      const r = await p.evaluate(SONDA)
      const algo = r.recortados.length || r.sinAlt.length || r.sinNombre.length || r.columnasVacias.length
      if (algo) console.log(`\n[${rol} ${ruta}]`, JSON.stringify(r, null, 1))
    }
    await ctx.close()
  }
  await b.close()
  console.log('\nfin')
})()
