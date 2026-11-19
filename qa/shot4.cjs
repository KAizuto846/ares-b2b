const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1024, height: 1024 } });
  await p.goto('file:///home/rizutov/ares-react/qa/logo-plano.html');
  await p.waitForTimeout(300);
  await p.screenshot({ path: '/home/rizutov/ares-react/qa/logo-plano-1024.png' });
  await b.close();
})();
