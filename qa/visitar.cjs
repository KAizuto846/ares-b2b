const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright');
const OUT = '/home/rizutov/ares-react/qa/';
const BASE = 'http://127.0.0.1:8081/spa';

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
  const errores = [];

  async function sesion(rol, email, pass, ancho = 1440, alto = 900) {
    const ctx = await browser.newContext({ viewport: { width: ancho, height: alto }, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errores.push(`[${rol} ${ancho}] ${m.text()}`); });
    page.on('pageerror', (e) => errores.push(`[${rol} ${ancho}] JS: ${e.message}`));
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    if (await page.locator('input[type=email]').count()) {
      await page.fill('input[type=email]', email);
      await page.fill('input[type=password]', pass);
      await page.click('button[type=submit]');
      await page.waitForSelector('.rail', { timeout: 8000 });
    }
    await page.waitForTimeout(500);
    return { ctx, page };
  }

  // comercio escritorio
  let { page } = await sesion('comercio', 'comercio@didi2.mx', 'comercio123');
  await page.screenshot({ path: OUT + 'inicio.png' });
  await page.click('a[href="/spa/buscar"]');
  await page.waitForTimeout(700);
  await page.screenshot({ path: OUT + 'buscar.png' });
  await page.locator('.producto .btn').first().click();
  await page.waitForTimeout(900);
  await page.click('#boton-carrito');
  await page.waitForTimeout(700);
  await page.screenshot({ path: OUT + 'carrito.png' });
  await page.keyboard.press('Escape');
  await page.click('a[href="/spa/pedidos"]');
  await page.waitForTimeout(600);
  await page.screenshot({ path: OUT + 'pedidos.png' });
  await page.click('a[href="/spa/perfil"]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: OUT + 'perfil.png' });

  const desbordes = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

  // móvil
  const { page: movil } = await sesion('comercio', 'comercio@didi2.mx', 'comercio123', 390, 844);
  await movil.screenshot({ path: OUT + 'movil-inicio.png' });
  await movil.click('a[href="/spa/buscar"]');
  await movil.waitForTimeout(700);
  await movil.screenshot({ path: OUT + 'movil-buscar.png' });
  const desbordeMovil = await movil.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

  // mayorista y admin
  const { page: may } = await sesion('mayorista', 'demo-insumos-del-valle@didi2.mx', 'demo1234');
  await may.screenshot({ path: OUT + 'mayorista.png' });
  await may.click('a[href="/spa/productos"]');
  await may.waitForTimeout(600);
  await may.screenshot({ path: OUT + 'mayorista-productos.png' });

  const { page: adm } = await sesion('admin', 'admin@didi2.mx', 'admin123');
  await adm.screenshot({ path: OUT + 'admin.png' });
  await adm.click('a[href="/spa/admin"]');
  await adm.waitForTimeout(500);
  await adm.screenshot({ path: OUT + 'admin-panel.png' });

  console.log(JSON.stringify({ desbordes, desbordeMovil, errores }, null, 1));
  await browser.close();
})();
