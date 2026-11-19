const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1100, height: 1200 }, deviceScaleFactor: 1 });
  await p.goto('file:///home/rizutov/ares-react/qa/hoja3.html');
  await p.waitForTimeout(500);
  await p.screenshot({ path: '/home/rizutov/ares-react/qa/flux3-hoja.png', fullPage: true });
  await b.close();
})();
