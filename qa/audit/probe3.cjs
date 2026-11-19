
const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright');
const QA = '/home/rizutov/ares-react/qa', OUT = QA + '/audit';
const NUEVO = 'http://127.0.0.1:8081/spa';
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, storageState: `${QA}/.estado-nuevo-mayorista.json` });
  const page = await ctx.newPage();
  await page.goto(NUEVO + '/productos', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const antes = await page.evaluate(() => document.body.innerText.length);
  await page.click('text="Importar CSV"');
  await page.waitForTimeout(1200);
  const d = await page.evaluate(() => ({
    url: location.pathname,
    texto: document.body.innerText.slice(0, 1600),
    dialogsAny: [...document.querySelectorAll('dialog,[role=dialog],.dialogo,.modal')].map(x => x.tagName+':'+(x.open!==undefined?x.open:'')+':'+x.innerText.slice(0,200)),
    fileInputs: [...document.querySelectorAll('input[type=file]')].length,
  }));
  console.log(JSON.stringify({antes, ...d}, null, 1));
  await page.screenshot({ path: OUT + '/mayorista-productos-importar-nuevo.png' });
  await browser.close();
})();
