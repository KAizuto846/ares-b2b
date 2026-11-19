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
  await p.fill('input[type=email]', 'demo-insumos-del-valle@didi2.mx');
  await p.fill('input[type=password]', 'demo1234');
  await p.click('button[type=submit]');
  await p.waitForSelector('.rail');
  await p.goto(B + '/spa/buscar', { waitUntil: 'networkidle' });
  await p.waitForTimeout(700);
  const urlMayorista = p.url();
  await p.screenshot({ path: '/home/rizutov/ares-react/qa/final-mayorista.png' });

  const ctx2 = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const p2 = await ctx2.newPage();
  await p2.goto(B + '/spa/', { waitUntil: 'networkidle' });
  await p2.fill('input[type=email]', 'comercio@didi2.mx');
  await p2.fill('input[type=password]', 'comercio123');
  await p2.click('button[type=submit]');
  await p2.waitForSelector('.rail');
  await p2.waitForTimeout(800);
  await p2.screenshot({ path: '/home/rizutov/ares-react/qa/final-inicio.png' });
  await p2.click('a[href="/spa/buscar"]');
  await p2.waitForTimeout(800);
  await p2.screenshot({ path: '/home/rizutov/ares-react/qa/final-buscar.png' });

  console.log(JSON.stringify({ urlMayorista, errores }, null, 1));
  await b.close();
})();
