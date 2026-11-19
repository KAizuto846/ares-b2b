const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright');
const OUT = '/home/rizutov/ares-react/qa/';
(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
  const c1 = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p1 = await c1.newPage();
  await p1.goto('http://127.0.0.1:8081/spa/', { waitUntil: 'networkidle' });
  await p1.waitForTimeout(600);
  await p1.screenshot({ path: OUT + 'login.png' });
  console.log('login visible', await p1.locator('.login').count());

  for (const [rol, mail, pass, file] of [
    ['admin', 'admin@didi2.mx', 'admin123', 'admin'],
    ['mayorista', 'demo-insumos-del-valle@didi2.mx', 'demo1234', 'mayorista'],
  ]) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();
    await p.goto('http://127.0.0.1:8081/spa/', { waitUntil: 'networkidle' });
    await p.fill('input[type=email]', mail);
    await p.fill('input[type=password]', pass);
    await p.click('button[type=submit]');
    await p.waitForSelector('.rail');
    await p.waitForTimeout(500);
    await p.screenshot({ path: OUT + file + '-inicio.png' });
    if (rol === 'admin') { await p.click('a[href="/spa/admin"]'); await p.waitForTimeout(500); await p.screenshot({ path: OUT + 'admin-panel.png' }); }
    if (rol === 'mayorista') { await p.click('a[href="/spa/productos"]'); await p.waitForTimeout(700); await p.screenshot({ path: OUT + 'mayorista-productos.png' }); }
  }
  await b.close();
})();
