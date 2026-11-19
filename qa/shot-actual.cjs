const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 2 });
  await p.goto('file:///home/rizutov/ares-react/qa/logo-actual.html');
  await p.waitForTimeout(300);
  await p.locator('div').first().screenshot({ path: '/home/rizutov/ares-react/qa/logo-actual-512.png' });
  await b.close();
})();
