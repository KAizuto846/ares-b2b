/* Humo de interacción: usa la UI sin confirmar nada que escriba en la base. */
const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright')

const BASE = 'http://127.0.0.1:8081'
const CUENTAS = {
  comercio: ['comercio@didi2.mx', 'comercio123'],
  mayorista: ['demo-insumos-del-valle@didi2.mx', 'demo1234'],
  admin: ['admin@didi2.mx', 'admin123'],
}

const fallos = []

async function entrar(b, rol) {
  const ctx = await b.newContext({ viewport: { width: 1380, height: 920 } })
  const p = await ctx.newPage()
  const errores = []
  p.on('pageerror', (e) => errores.push(e.message))
  p.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()) })
  await p.goto(`${BASE}/spa/`, { waitUntil: 'domcontentloaded' })
  await p.fill('input[type="email"]', CUENTAS[rol][0])
  await p.fill('input[type="password"]', CUENTAS[rol][1])
  await p.click('button[type="submit"]')
  await p.waitForTimeout(1500)
  return { p, ctx, errores }
}

async function revisar(nombre, fn) {
  try {
    await fn()
    console.log(`ok    ${nombre}`)
  } catch (e) {
    fallos.push(`${nombre}: ${e.message}`)
    console.log(`FALLA ${nombre}: ${e.message}`)
  }
}

;(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] })

  // 1. POS: buscar producto y agregarlo a la venta (no cobra)
  {
    const { p, ctx, errores } = await entrar(b, 'comercio')
    await revisar('POS: buscar y agregar a la venta', async () => {
      await p.goto(`${BASE}/spa/pos`, { waitUntil: 'networkidle' })
      await p.locator('input[placeholder*="clave"], input[placeholder*="nombre"]').first().fill('leche')
      await p.waitForTimeout(900)
      const antes = await p.locator('.contenido').innerText()
      await p.locator('.pos-resultado, .pos-producto, button:has-text("Agregar")').first().click()
      await p.waitForTimeout(600)
      const despues = await p.locator('.contenido').innerText()
      if (antes === despues) throw new Error('la venta no cambió al agregar el producto')
    })
    if (errores.length) fallos.push('POS errores JS: ' + errores[0])
    await ctx.close()
  }

  // 2. Mensajes: cambiar de pestaña y escribir (no envía)
  {
    const { p, ctx, errores } = await entrar(b, 'comercio')
    await revisar('Mensajes: pestañas y redacción', async () => {
      await p.goto(`${BASE}/spa/mensajes`, { waitUntil: 'networkidle' })
      const antes = await p.locator('.contenido').innerText()
      const tab = p.locator('[role="tab"], .msg-tab, button:has-text("Soporte")').first()
      if (await tab.count()) { await tab.click(); await p.waitForTimeout(500) }
      const caja = p.locator('textarea').first()
      await caja.fill('prueba de interfaz, no enviar')
      const texto = await caja.inputValue()
      if (!texto.includes('prueba')) throw new Error('la caja de texto no acepta escritura')
      if (antes.length < 40) throw new Error('la pantalla quedó vacía')
    })
    if (errores.length) fallos.push('Mensajes errores JS: ' + errores[0])
    await ctx.close()
  }

  // 3. Admin usuarios: filtrar
  {
    const { p, ctx, errores } = await entrar(b, 'admin')
    await revisar('Admin usuarios: filtro de búsqueda', async () => {
      await p.goto(`${BASE}/spa/admin/usuarios`, { waitUntil: 'networkidle' })
      const filasAntes = await p.locator('tbody tr').count()
      await p.locator('input[type="search"], input[placeholder*="uscar"]').first().fill('admin')
      await p.waitForTimeout(900)
      const filasDespues = await p.locator('tbody tr').count()
      if (!filasAntes) throw new Error('la tabla no pintó filas')
      if (filasDespues > filasAntes) throw new Error('el filtro no redujo la tabla')
    })
    if (errores.length) fallos.push('Admin errores JS: ' + errores[0])
    await ctx.close()
  }

  // 4. Catálogo: abrir alta de producto y cerrar
  {
    const { p, ctx, errores } = await entrar(b, 'mayorista')
    await revisar('Catálogo: diálogo de alta', async () => {
      await p.goto(`${BASE}/spa/productos`, { waitUntil: 'networkidle' })
      await p.locator('button:has-text("Nuevo"), a:has-text("Nuevo")').first().click()
      await p.waitForTimeout(700)
      const campos = await p.locator('form input').count()
      if (campos < 2) throw new Error('el formulario de alta no abrió')
      await p.keyboard.press('Escape')
    })
    if (errores.length) fallos.push('Catálogo errores JS: ' + errores[0])
    await ctx.close()
  }

  // 5. Finanzas: cambio de periodo
  {
    const { p, ctx, errores } = await entrar(b, 'comercio')
    await revisar('Finanzas: periodo mensual/anual', async () => {
      await p.goto(`${BASE}/spa/finanzas`, { waitUntil: 'networkidle' })
      const antes = await p.locator('.contenido').innerText()
      await p.locator('button:has-text("Mensual"), .fin-tab:has-text("Mensual")').first().click()
      await p.waitForTimeout(700)
      const despues = await p.locator('.contenido').innerText()
      if (antes === despues) throw new Error('el cambio de periodo no redibujó')
    })
    if (errores.length) fallos.push('Finanzas errores JS: ' + errores[0])
    await ctx.close()
  }

  await b.close()
  console.log(fallos.length ? `\n${fallos.length} fallo(s)` : '\nTodo responde')
})()
