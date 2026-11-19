/**
 * Compara el panel PHP viejo (:3110) con la SPA (:8081/spa) pantalla por pantalla.
 *
 * Para cada par captura captura completa + firma de la página (títulos, botones,
 * etiquetas, pestañas, enlaces de navegación, tablas e inputs) y reporta lo que
 * existe en el viejo y no en el nuevo.
 *
 *   node comparar.cjs              # rol comercio
 *   node comparar.cjs mayorista    # otro rol
 */
const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright')
const fs = require('fs')
const path = require('path')

const VIEJO = 'http://127.0.0.1:3110'
const NUEVO = 'http://127.0.0.1:8081/spa'
const CUENTAS = {
  comercio: ['comercio@didi2.mx', 'comercio123'],
  mayorista: ['mayorista@didi2.mx', 'comercio123'],
  repartidor: ['repartidor@didi2.mx', 'comercio123'],
  admin: ['admin@didi2.mx', 'comercio123'],
}

const PARES = {
  comercio: [
    ['login', '/login', '/login'],
    ['explorar', '/explorar', '/buscar'],
    ['buscar', '/buscar', '/buscar'],
    ['carrito', '/carrito', '/carrito'],
    ['checkout', '/checkout', '/checkout'],
    ['pedidos', '/pedidos', '/pedidos'],
    ['favoritos', '/favoritos', null],
    ['programados', '/programados', null],
    ['pos', '/pos', '/pos'],
    ['pos-inventario', '/pos/inventario', '/pos/inventario'],
    ['pos-ventas', '/pos/ventas', '/pos/ventas'],
    ['pos-corte', '/pos/corte', '/pos/corte'],
    ['pos-clientes', '/pos/clientes', '/pos/clientes'],
    ['finanzas', '/finanzas', '/finanzas'],
    ['facturacion', '/facturacion', '/facturacion'],
    ['portafolio', '/portafolio', '/portafolio'],
    ['agendar', '/agendar', '/agendar'],
    ['mensajes', '/mensajes', '/mensajes'],
    ['notificaciones', '/notificaciones', '/notificaciones'],
    ['perfil', '/perfil', '/perfil'],
    ['perfil-editar', '/perfil/editar', '/perfil/editar'],
    ['perfil-privacidad', '/perfil/privacidad', '/perfil/privacidad'],
    ['perfil-ajustes', '/perfil/ajustes', '/perfil/ajustes'],
    ['perfil-seguridad', '/perfil/seguridad', '/perfil/seguridad'],
    ['perfil-permisos', '/perfil/permisos', '/perfil/permisos'],
    ['kyc', '/kyc', '/kyc'],
    ['ayuda', '/ayuda', '/ayuda'],
  ],
  mayorista: [
    ['mayorista', '/mayorista', '/'],
    ['productos', '/mayorista/productos', '/productos'],
    ['producto-nuevo', '/mayorista/productos/nuevo', '/productos/nuevo'],
    ['pedidos-mayorista', '/mayorista/pedidos', '/pedidos'],
    ['finanzas', '/finanzas', '/finanzas'],
    ['mensajes', '/mensajes', '/mensajes'],
  ],
  repartidor: [
    ['repartidor', '/repartidor', '/repartidor'],
    ['mensajes', '/mensajes', '/mensajes'],
  ],
  admin: [
    ['admin', '/admin', '/admin'],
    ['admin-usuarios', '/admin/usuarios', '/admin/usuarios'],
    ['admin-kyc', '/admin/kyc', '/admin/kyc'],
    ['admin-reclamos', '/admin/reclamos', '/admin/reclamos'],
    ['admin-parametros', '/admin/parametros', '/admin/parametros'],
    ['postmvp', '/postmvp', '/admin/postmvp'],
  ],
}

const firma = () => {
  const txt = (e) => (e.innerText || '').replace(/\s+/g, ' ').trim()
  const vis = (e) => {
    const r = e.getBoundingClientRect()
    const s = getComputedStyle(e)
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'
  }
  const q = (sel, max = 60) =>
    [...document.querySelectorAll(sel)].filter(vis).map(txt).filter((t) => t && t.length < 60).slice(0, max)
  return {
    h: q('h1,h2,h3', 40),
    btn: [...document.querySelectorAll('button, a.btn, .btn, [role="button"]')]
      .filter(vis).map(txt).filter((t) => t && t.length < 40).slice(0, 60),
    etiquetas: q('th, label, .campo > span, dt', 80),
    tabs: q('[role="tab"], .tabs a, .tab, nav.nav a, .nav a', 40),
    tablas: document.querySelectorAll('table').length,
    inputs: document.querySelectorAll('form input, form select, form textarea').length,
    vacio: /no hay|sin resultados|vac[ií]o|nada por/i.test(document.body.innerText),
    largo: document.body.innerText.replace(/\s+/g, ' ').length,
  }
}

const norm = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9áéíóúñ ]/g, ' ').replace(/\s+/g, ' ').trim()

async function entrar(page, base, [email, clave]) {
  await page.goto(base + '/login', { waitUntil: 'networkidle' })
  await page.fill('input[name=email], input[type=email]', email)
  await page.fill('input[name=password], #clave', clave)
  await page.click('button[type=submit]')
  await page.waitForTimeout(2200)
  return page.url()
}

;(async () => {
  const rol = process.argv[2] || 'comercio'
  const salida = path.join(__dirname, 'comp')
  fs.mkdirSync(salida, { recursive: true })

  const b = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] })
  const ctxV = await b.newContext({ viewport: { width: 1440, height: 950 } })
  const ctxN = await b.newContext({ viewport: { width: 1440, height: 950 } })
  const pv = await ctxV.newPage()
  const pn = await ctxN.newPage()

  await entrar(pv, VIEJO, CUENTAS[rol])
  await entrar(pn, NUEVO, CUENTAS[rol])

  const informe = []
  for (const [slug, rv, rn] of PARES[rol]) {
    const fila = { slug, viejo: rv, nuevo: rn, faltantes: [], notas: [] }

    await pv.goto(VIEJO + rv, { waitUntil: 'networkidle' })
    await pv.waitForTimeout(700)
    const fv = await pv.evaluate(firma)
    await pv.screenshot({ path: path.join(salida, `${rol}-${slug}-viejo.png`), fullPage: true })

    if (!rn) {
      fila.notas.push('RUTA AUSENTE en la SPA')
      fila.faltantes = [...fv.btn, ...fv.h]
    } else {
      await pn.goto(NUEVO + rn, { waitUntil: 'networkidle' })
      await pn.waitForTimeout(900)
      const fn = await pn.evaluate(firma)
      await pn.screenshot({ path: path.join(salida, `${rol}-${slug}-nuevo.png`), fullPage: true })

      const enNuevo = new Set([...fn.btn, ...fn.h, ...fn.etiquetas, ...fn.tabs].map(norm))
      const candidatos = [...new Set([...fv.btn, ...fv.h, ...fv.etiquetas, ...fv.tabs])]
      fila.faltantes = candidatos.filter((t) => {
        const n = norm(t)
        if (n.length < 4) return false
        if (enNuevo.has(n)) return false
        const palabras = n.split(' ').filter((w) => w.length > 3)
        if (!palabras.length) return false
        return ![...enNuevo].some((x) => palabras.every((w) => x.includes(w)))
      })
      fila.viejo = { ...fv, btn: fv.btn.length }
      fila.nuevo = { ...fn, btn: fn.btn.length }
    }
    informe.push(fila)
    console.log(`${slug.padEnd(20)} faltan ${String(fila.faltantes.length).padStart(2)} · ${fila.viejo.largo || 0} vs ${(fila.nuevo && fila.nuevo.largo) || 0} letras`)
  }

  fs.writeFileSync(path.join(salida, `informe-${rol}.json`), JSON.stringify(informe, null, 2))
  const total = informe.reduce((a, f) => a + f.faltantes.length, 0)
  console.log(`\n${informe.length} pantallas · ${total} elementos del viejo sin equivalente`)
  await b.close()
})()
