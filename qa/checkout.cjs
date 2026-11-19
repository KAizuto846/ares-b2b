const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright');
const OUT = '/home/rizutov/ares-react/qa/';
(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errores = [];
  p.on('pageerror', (e) => errores.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
  await p.goto('http://127.0.0.1:8081/spa/', { waitUntil: 'networkidle' });
  if (await p.locator('input[type=email]').count()) {
    await p.fill('input[type=email]', 'comercio@didi2.mx');
    await p.fill('input[type=password]', 'comercio123');
    await p.click('button[type=submit]');
    await p.waitForSelector('.rail');
  }
  await p.goto('http://127.0.0.1:8081/spa/checkout', { waitUntil: 'networkidle' });
  await p.waitForTimeout(700);
  await p.screenshot({ path: OUT + 'checkout.png' });
  const btn = p.getByRole('button', { name: 'Confirmar pedido' });
  console.log('boton visible', await btn.isVisible(), 'habilitado', await btn.isEnabled());
  await btn.click();
  await p.waitForSelector('text=Pedido confirmado', { timeout: 15000 });
  await p.waitForTimeout(500);
  await p.screenshot({ path: OUT + 'checkout-ok.png' });
  console.log('pedidos visibles:', await p.locator('.kpi__valor').allInnerTexts());
  console.log('errores', JSON.stringify(errores));
  await b.close();
})();
