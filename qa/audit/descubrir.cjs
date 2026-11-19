const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright');
const fs = require('fs');

const VIEJO = 'http://127.0.0.1:3110';
const NUEVO = 'http://127.0.0.1:8081/spa';
const QA = '/home/rizutov/ares-react/qa';

const roles = ['mayorista', 'admin', 'repartidor'];
const roots = { mayorista: '/mayorista', admin: '/admin', repartidor: '/repartidor' };

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
  const out = {};
  for (const rol of roles) {
    for (const [tag, base] of [['viejo', VIEJO], ['nuevo', NUEVO]]) {
      const ctx = await browser.newContext({
        viewport: { width: 1440, height: 950 },
        storageState: `${QA}/.estado-${tag}-${rol}.json`,
      });
      const page = await ctx.newPage();
      const errs = [];
      page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
      await page.goto(base + roots[rol], { waitUntil: 'networkidle' });
      await page.waitForTimeout(1200);
      const info = await page.evaluate(() => {
        const links = [...document.querySelectorAll('a[href]')].map((a) => ({
          href: a.getAttribute('href'),
          txt: (a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60),
        }));
        return {
          url: location.href,
          title: document.title,
          h: [...document.querySelectorAll('h1,h2,h3')].map((x) => x.tagName + ':' + x.textContent.trim().replace(/\s+/g, ' ').slice(0, 70)),
          forms: document.querySelectorAll('form').length,
          links,
        };
      });
      out[`${rol}-${tag}`] = { ...info, errs };
      await ctx.close();
    }
  }
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})();
