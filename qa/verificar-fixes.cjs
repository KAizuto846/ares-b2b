const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright');
const B = 'https://riz0308.tail0820b4.ts.net:8443';
(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });

  await p.goto(B + '/spa/', { waitUntil: 'networkidle' });
  await p.fill('input[type=email]', 'comercio@didi2.mx');
  await p.fill('input[type=password]', 'comercio123');
  await p.click('button[type=submit]');
  await p.waitForSelector('.rail');

  await p.click('a[href="/spa/buscar"]');
  await p.waitForSelector('.producto');
  await p.locator('.producto .stepper button').nth(1).click(); // +1
  await p.locator('.producto .btn').first().click();
  await p.waitForTimeout(900);

  const globo = await p.locator('#boton-carrito .carrito-btn__globo').innerText();
  await p.click('#boton-carrito');
  await p.waitForTimeout(600);
  const cabecera = await p.locator('.cajon__cuenta').innerText();
  const focoDentro = await p.evaluate(() => !!document.activeElement?.closest('.cajon__caja'));
  const inertes = await p.evaluate(() => {
    const c = document.querySelector('.cajon');
    return c ? getComputedStyle(c).visibility : 'n/a';
  });
  await p.keyboard.press('Escape');
  await p.waitForTimeout(500);
  const cerrado = await p.evaluate(() => getComputedStyle(document.querySelector('.cajon')).visibility);

  // vaciar para dejar el carrito como estaba
  await p.click('#boton-carrito');
  await p.waitForTimeout(400);
  const vaciar = p.getByRole('button', { name: 'Vaciar' });
  if (await vaciar.count()) { await vaciar.click(); await p.waitForTimeout(600); }

  console.log(JSON.stringify({ globo, cabecera, focoDentro, visibilidadAbierto: inertes, visibilidadCerrado: cerrado, errores }, null, 1));
  await b.close();
})();
