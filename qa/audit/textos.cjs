const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright');
const fs = require('fs');
const VIEJO = 'http://127.0.0.1:3110', NUEVO = 'http://127.0.0.1:8081/spa';
const QA = '/home/rizutov/ares-react/qa', OUT = QA + '/audit';
const P = JSON.parse(fs.readFileSync(OUT + '/rutas.json', 'utf8'));

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
  for (const [rol, nombre, vp, np] of P) {
    for (const [tag, base, path] of [['viejo', VIEJO, vp], ['nuevo', NUEVO, np]]) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, storageState: `${QA}/.estado-${tag}-${rol}.json` });
      const page = await ctx.newPage();
      try {
        await page.goto(base + path, { waitUntil: 'networkidle', timeout: 25000 });
        await page.waitForTimeout(800);
        const d = await page.evaluate(() => ({
          url: location.pathname,
          text: (document.querySelector('main') || document.body).innerText,
          allButtons: [...document.querySelectorAll('button,a.boton,[role=button],summary')].map((b) => (b.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40)).filter(Boolean),
          hrefs: [...new Set([...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')))],
        }));
        fs.writeFileSync(`${OUT}/txt-${rol}-${nombre}-${tag}.txt`, `URL:${d.url}\nBOTONES:${d.allButtons.join(' | ')}\nHREFS:${d.hrefs.join(' | ')}\n----\n${d.text}`);
      } catch (e) { fs.writeFileSync(`${OUT}/txt-${rol}-${nombre}-${tag}.txt`, 'ERROR ' + e.message.slice(0, 150)); }
      await ctx.close();
    }
  }
  console.log('done');
  await browser.close();
})();
