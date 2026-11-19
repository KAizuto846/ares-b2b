const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright');
const OUT = '/home/rizutov/ares-react/qa/audit';

const dump = () => {
  const q = (s) => Array.from(document.querySelectorAll(s));
  const txt = (e) => (e.innerText || e.value || '').replace(/\s+/g, ' ').trim();
  const vis = (e) => { const r = e.getBoundingClientRect(); const st = getComputedStyle(e); return r.width > 0 && r.height > 0 && st.visibility !== 'hidden'; };
  return {
    buttons: q('button').filter(vis).map((b) => txt(b) || b.getAttribute('aria-label') || '').filter(Boolean).slice(0, 40),
    checks: q('input[type=checkbox]').map((c) => `${c.getAttribute('aria-label') || (c.labels && c.labels[0] ? txt(c.labels[0]) : '')}`),
    text: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 1600),
  };
};

(async () => {
  const res = {};
  for (const side of ['viejo', 'nuevo']) {
    const base = side === 'viejo' ? 'http://127.0.0.1:3110' : 'http://127.0.0.1:8081/spa';
    const browser = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, storageState: `/home/rizutov/ares-react/qa/.estado-${side}-comercio.json`, locale: 'es-MX' });
    const page = await ctx.newPage();
    await page.goto(base + '/mensajes', { waitUntil: 'networkidle' });
    // modo borrado
    await page.click('button[aria-label="Eliminar conversaciones"], #btn-borrar', { timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(600);
    res[side + '_borrado'] = await page.evaluate(dump);
    await page.screenshot({ path: `${OUT}/msg-borrado-${side}.png` });
    // configuración
    await page.click('button[aria-label="Configuración"]', { timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(600);
    res[side + '_config'] = await page.evaluate(dump);
    await page.screenshot({ path: `${OUT}/msg-config-${side}.png` });
    await browser.close();
  }
  console.log(JSON.stringify(res, null, 2));
})();
