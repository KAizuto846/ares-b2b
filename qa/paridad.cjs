/* Barrido de paridad de la SPA: 4 roles × todas sus rutas.
 * Uso: node paridad.cjs [rol|todos]
 * Salida: qa/paridad/<rol>_<ruta>.png + paridad.json
 */
const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright')
const fs = require('fs')
const path = require('path')

const BASE = 'http://127.0.0.1:8081'
const SALIDA = path.join(__dirname, 'paridad')

const CUENTAS = {
  comercio: { email: 'comercio@didi2.mx', clave: 'comercio123' },
  mayorista: { email: 'demo-insumos-del-valle@didi2.mx', clave: 'demo1234' },
  repartidor: { email: 'repartidor@didi2.mx', clave: 'repartidor123' },
  admin: { email: 'admin@didi2.mx', clave: 'admin123' },
}

const RUTAS = {
  comercio: ['/', '/buscar', '/carrito', '/checkout', '/pedidos', '/finanzas', '/portafolio', '/agendar',
    '/mensajes', '/perfil', '/perfil/editar', '/perfil/privacidad', '/perfil/ajustes', '/perfil/seguridad',
    '/perfil/permisos', '/ayuda', '/kyc', '/pos', '/pos/inventario', '/pos/ventas', '/pos/corte', '/pos/clientes'],
  mayorista: ['/', '/buscar', '/productos', '/productos/nuevo', '/productos/importar', '/pedidos',
    '/facturacion', '/finanzas', '/mensajes', '/perfil', '/perfil/editar', '/ayuda'],
  repartidor: ['/', '/repartidor', '/buscar', '/finanzas', '/mensajes', '/perfil', '/ayuda'],
  admin: ['/', '/admin', '/admin/usuarios', '/admin/kyc', '/admin/reclamos', '/admin/parametros',
    '/admin/postmvp', '/mensajes', '/perfil', '/perfil/editar', '/ayuda'],
}

const MEDIR = () => {
  const doc = document.documentElement
  const desborde = doc.scrollWidth - doc.clientWidth
  const chicos = []
  const taps = []
  document.querySelectorAll('body *').forEach((el) => {
    const r = el.getBoundingClientRect()
    if (!r.width && !r.height) return
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none') return
    const txt = (el.children.length === 0 ? el.textContent || '' : '').trim()
    if (txt && parseFloat(cs.fontSize) < 12) chicos.push(`${el.tagName}.${el.className} ${cs.fontSize}`)
    if (['BUTTON', 'A', 'INPUT', 'SELECT'].includes(el.tagName) && (r.width < 44 || r.height < 44)) {
      taps.push(`${el.tagName}.${el.className} ${Math.round(r.width)}x${Math.round(r.height)}`)
    }
  })
  return {
    desborde,
    chicos: [...new Set(chicos)].slice(0, 6),
    taps: [...new Set(taps)].slice(0, 8),
    pendiente: document.body.innerText.includes('Pendiente de portar'),
    vacio: document.body.innerText.trim().length < 40,
  }
}

const slug = (r) => (r === '/' ? 'inicio' : r.replace(/^\//, '').replace(/\//g, '-'))

;(async () => {
  const objetivo = process.argv[2] || 'todos'
  const roles = objetivo === 'todos' ? Object.keys(RUTAS) : [objetivo]
  fs.mkdirSync(SALIDA, { recursive: true })
  const navegador = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox', '--disable-gpu'] })
  const informe = []

  for (const rol of roles) {
    const ctx = await navegador.newContext({ viewport: { width: 1360, height: 900 } })
    const page = await ctx.newPage()
    const errores = []
    page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text().slice(0, 200)) })
    page.on('pageerror', (e) => errores.push('PAGEERROR ' + e.message.slice(0, 200)))
    page.on('response', (r) => {
      if (r.url().includes('/api/') && r.status() >= 400) errores.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE, '')}`)
    })

    await page.goto(`${BASE}/spa/`, { waitUntil: 'domcontentloaded' })
    await page.fill('input[type="email"]', CUENTAS[rol].email)
    await page.fill('input[type="password"]', CUENTAS[rol].clave)
    await Promise.all([
      page.waitForFunction(() => !!document.querySelector('.rail'), { timeout: 25000 }).catch(() => {}),
      page.click('button[type="submit"]'),
    ])
    await page.waitForTimeout(900)

    for (const ruta of RUTAS[rol]) {
      errores.length = 0
      const destino = `${BASE}/spa${ruta}`
      await page.goto(destino, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {})
      await page.waitForTimeout(650)
      const m = await page.evaluate(MEDIR).catch(() => ({ desborde: -1, chicos: [], taps: [], pendiente: false, vacio: true }))
      await page.screenshot({ path: path.join(SALIDA, `${rol}_${slug(ruta)}.png`), fullPage: false })
      informe.push({ rol, ruta, url: page.url().replace(BASE, ''), ...m, errores: [...new Set(errores)].slice(0, 5) })
      const marca = m.pendiente ? 'PENDIENTE' : (m.errores === 0 ? 'ok' : 'ERRORES')
      console.log(`${rol.padEnd(10)} ${ruta.padEnd(28)} ${String(m.desborde).padStart(4)}px  ${m.chicos.length}c ${m.taps.length}t  ${marca}`)
    }

    await ctx.close()
  }

  fs.writeFileSync(path.join(__dirname, 'paridad.json'), JSON.stringify(informe, null, 2))
  await navegador.close()
  const malas = informe.filter((x) => x.pendiente || x.errores.length || x.desborde > 0 || x.vacio)
  console.log(`\n${informe.length} rutas · ${malas.length} con problemas`)
  for (const m of malas) console.log(` - ${m.rol} ${m.ruta}: ${m.pendiente ? 'pendiente ' : ''}${m.desborde > 0 ? `desborde ${m.desborde} ` : ''}${m.vacio ? 'vacía ' : ''}${m.errores.slice(0, 2).join(' | ')}`)
})()
