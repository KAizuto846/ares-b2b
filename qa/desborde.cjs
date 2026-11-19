const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.goto('http://127.0.0.1:8081/spa/', { waitUntil: 'networkidle' });
  await p.fill('input[type=email]', 'comercio@didi2.mx');
  await p.fill('input[type=password]', 'comercio123');
  await p.click('button[type=submit]');
  await p.waitForSelector('.rail');
  await p.goto('http://127.0.0.1:8081/spa/perfil', { waitUntil: 'networkidle' });
  await p.waitForTimeout(400);
  console.log(await p.evaluate(() => {
    const w = document.documentElement.clientWidth;
    return [...document.querySelectorAll('body *')]
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter((x) => x.r.right > w + 1)
      .slice(0, 6)
      .map((x) => `${x.el.tagName}.${x.el.className} right=${Math.round(x.r.right)} w=${Math.round(x.r.width)}`);
  }));
  await p.screenshot({ path: '/home/rizutov/ares-react/qa/movil-perfil.png' });
  await b.close();
})();
