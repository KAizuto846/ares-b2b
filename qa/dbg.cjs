const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto('http://127.0.0.1:8081/spa/', { waitUntil: 'networkidle' });
  if (await p.locator('input[type=email]').count()) {
    await p.fill('input[type=email]', 'comercio@didi2.mx');
    await p.fill('input[type=password]', 'comercio123');
    await p.click('button[type=submit]');
    await p.waitForSelector('.rail');
  }
  console.log('url', p.url());
  console.log(await p.evaluate(() => [...document.querySelectorAll('a')].map(a => a.getAttribute('href')).join(' | ')));
  await b.close();
})();
