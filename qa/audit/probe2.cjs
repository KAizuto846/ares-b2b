const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright');
const QA = '/home/rizutov/ares-react/qa', OUT = QA + '/audit';
const NUEVO = 'http://127.0.0.1:8081/spa';
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, storageState: `${QA}/.estado-nuevo-mayorista.json` });
  const page = await ctx.newPage();
  await page.goto(NUEVO + '/productos', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.click('text="Importar CSV"');
  await page.waitForTimeout(900);
  const d = await page.evaluate(() => ({
    dialogos: [...document.querySelectorAll('dialog')].filter((x) => x.open).map((x) => x.innerText),
    hrefs: [...document.querySelectorAll('dialog a[href]')].map((a) => a.getAttribute('href')),
    inputs: [...document.querySelectorAll('dialog input')].map((i) => i.type + ' ' + (i.accept || '')),
  }));
  console.log(JSON.stringify(d, null, 1));
  await page.screenshot({ path: `${OUT}/mayorista-productos-importar-nuevo.png` });
  await browser.close();
})();
