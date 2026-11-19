const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright');
const fs = require('fs');
const OUT = '/home/rizutov/ares-react/qa/audit';
const UUIDS = {
  recibido: 'ae12fa30-e2f9-11f1-9263-a4bb6d8495fd',
  preparando: '7194e1c4-e349-11f1-9263-a4bb6d8495fd',
  expirado: 'b3ec91dc-d5f9-4359-802b-f6caf1b5acbc',
};

const dump = () => {
  const q = (s) => Array.from(document.querySelectorAll(s));
  const txt = (e) => (e.innerText || e.value || '').replace(/\s+/g, ' ').trim();
  const vis = (e) => { const r = e.getBoundingClientRect(); const st = getComputedStyle(e); return r.width > 0 && r.height > 0 && st.visibility !== 'hidden'; };
  return {
    headings: q('h1,h2,h3').filter(vis).map(txt),
    buttons: q('button, a.btn, .boton').filter(vis).map((b) => txt(b)).filter(Boolean).slice(0, 30),
    fields: q('input,select,textarea').filter(vis).map((f) => `${f.type}|${f.placeholder || ''}|${f.name || ''}`),
    th: q('th').filter(vis).map(txt),
    text: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 2600),
  };
};

(async () => {
  const res = {};
  for (const [estado, uuid] of Object.entries(UUIDS)) {
    for (const side of ['viejo', 'nuevo']) {
      const base = side === 'viejo' ? 'http://127.0.0.1:3110' : 'http://127.0.0.1:8081/spa';
      const browser = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, storageState: `/home/rizutov/ares-react/qa/.estado-${side}-comercio.json`, locale: 'es-MX' });
      const page = await ctx.newPage();
      try {
        await page.goto(`${base}/pedidos/${uuid}`, { waitUntil: 'networkidle', timeout: 40000 });
        await page.waitForTimeout(900);
        res[`${estado}_${side}`] = await page.evaluate(dump);
        await page.screenshot({ path: `${OUT}/pedido-${estado}-${side}.png`, fullPage: true });
      } catch (e) { res[`${estado}_${side}`] = { error: String(e).slice(0, 200) }; }
      await browser.close();
    }
  }
  fs.writeFileSync(`${OUT}/pedidos-detalle.json`, JSON.stringify(res, null, 2));
  console.log('ok');
})();
