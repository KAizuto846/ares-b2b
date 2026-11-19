const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 2 });
  await p.goto('file:///home/rizutov/ares-react/qa/logo-preview.html');
  await p.waitForTimeout(300);
  await p.screenshot({ path: '/home/rizutov/ares-react/qa/logo-preview.png', fullPage: true });
  await b.close();
})();
