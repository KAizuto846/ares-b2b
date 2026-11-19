const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1180, height: 720 }, deviceScaleFactor: 2 });
  await p.goto('file:///home/rizutov/ares-react/qa/marca-propuestas.html');
  await p.waitForTimeout(400);
  await p.screenshot({ path: '/home/rizutov/ares-react/qa/marca-propuestas.png', fullPage: true });
  await b.close();
})();
