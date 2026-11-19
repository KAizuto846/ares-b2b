const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1180, height: 470 }, deviceScaleFactor: 1 });
  await p.goto('file:///home/rizutov/ares-react/qa/hoja6.html');
  await p.waitForTimeout(500);
  await p.screenshot({ path: '/home/rizutov/ares-react/qa/preview-casco.png', fullPage: true });
  await b.close();
})();
