const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright');
const fs = require('fs');
const OUT = '/home/rizutov/ares-react/qa/audit';

const dump = () => {
  const q = (s) => Array.from(document.querySelectorAll(s));
  const txt = (e) => (e.innerText || e.value || '').replace(/\s+/g, ' ').trim();
  const vis = (e) => { const r = e.getBoundingClientRect(); const st = getComputedStyle(e); return r.width > 0 && r.height > 0 && st.visibility !== 'hidden'; };
  return {
    buttons: q('button').filter(vis).map((b) => txt(b) || b.getAttribute('aria-label') || '').filter(Boolean).slice(0, 50),
    fields: q('input,select,textarea').filter(vis).map((f) => `${f.type}|${f.placeholder || ''}|${(f.labels && f.labels[0] ? txt(f.labels[0]) : '') || f.getAttribute('aria-label') || ''}`).slice(0, 30),
    selects: q('select').filter(vis).map((s) => `${(s.labels && s.labels[0] ? txt(s.labels[0]) : '')}: ${Array.from(s.options).map(txt).join(' / ')}`).slice(0, 10),
    text: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 2200),
  };
};

async function run(side, cobrar) {
  const base = side === 'viejo' ? 'http://127.0.0.1:3110' : 'http://127.0.0.1:8081/spa';
  const browser = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 950 },
    storageState: `/home/rizutov/ares-react/qa/.estado-${side}-comercio.json`,
    locale: 'es-MX',
  });
  const page = await ctx.newPage();
  const out = {};
  await page.goto(base + '/pos', { waitUntil: 'networkidle' });
  const buscador = await page.$('input[type=search]');
  if (buscador) { await buscador.type('aceite', { delay: 60 }); await page.waitForTimeout(900); }
  out.buscado = await page.evaluate(dump);
  await page.screenshot({ path: `${OUT}/pos-buscado-${side}.png` });

  // Primer producto del catálogo (solo estado del cliente, no envía nada).
  const prod = await page.$('button.prod, .pos-prod button, .pos-prod, .prod');
  if (prod) { await prod.click().catch(() => {}); await page.waitForTimeout(600); }
  out.conTicket = await page.evaluate(dump);
  await page.screenshot({ path: `${OUT}/pos-ticket-${side}.png` });

  if (cobrar) {
    const b = await page.$('#pos-cobrar, button:has-text("Cobrar")');
    if (b) { await b.click().catch(() => {}); await page.waitForTimeout(700); }
    out.cobro = await page.evaluate(dump);
    await page.screenshot({ path: `${OUT}/pos-cobro-${side}.png` });
  }
  await browser.close();
  return out;
}

(async () => {
  const res = {};
  res.nuevo = await run('nuevo', true);
  res.viejo = await run('viejo', false); // no se pulsa Cobrar en la vieja: POST /pos/vender
  fs.writeFileSync(`${OUT}/pos.json`, JSON.stringify(res, null, 2));
  console.log('ok');
})();
