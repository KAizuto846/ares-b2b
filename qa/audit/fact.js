const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright');
(async () => {
  const res = {};
  for (const side of ['viejo', 'nuevo']) {
    const base = side === 'viejo' ? 'http://127.0.0.1:3110' : 'http://127.0.0.1:8081/spa';
    const browser = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, storageState: `/home/rizutov/ares-react/qa/.estado-${side}-comercio.json` });
    const page = await ctx.newPage();
    for (const ruta of ['/facturacion', '/finanzas?tab=facturacion']) {
      await page.goto(base + ruta, { waitUntil: 'networkidle' }).catch(() => {});
      await page.waitForTimeout(1200);
      res[`${side}${ruta}`] = {
        url: page.url(),
        h1: await page.evaluate(() => Array.from(document.querySelectorAll('h1,h2')).slice(0, 6).map((e) => e.innerText.trim())),
        tieneTabFacturas: await page.evaluate(() => /Facturaci[oó]n/i.test(document.body.innerText)),
        texto: await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 300)),
      };
      await page.screenshot({ path: `/home/rizutov/ares-react/qa/audit/fact-${side}${ruta.replace(/[/?=]/g, '_')}.png` });
    }
    await browser.close();
  }
  console.log(JSON.stringify(res, null, 2));
})();
