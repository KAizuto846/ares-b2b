const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright');
const fs = require('fs');
const OUT = '/home/rizutov/ares-react/qa/audit';

const dump = () => {
  const q = (s) => Array.from(document.querySelectorAll(s));
  const txt = (e) => (e.innerText || e.value || '').replace(/\s+/g, ' ').trim();
  const vis = (e) => { const r = e.getBoundingClientRect(); const st = getComputedStyle(e); return r.width > 0 && r.height > 0 && st.visibility !== 'hidden'; };
  return {
    headings: q('h1,h2,h3').filter(vis).map(txt).slice(0, 25),
    buttons: q('button, [role=button], a.btn').filter(vis).map((b) => txt(b) || b.getAttribute('aria-label') || '').filter(Boolean).slice(0, 40),
    fields: q('input,select,textarea').filter(vis).map((f) => `${f.type || f.tagName}|${f.placeholder || ''}|${(f.labels && f.labels[0] ? txt(f.labels[0]) : '') || f.getAttribute('aria-label') || ''}`).slice(0, 30),
    checks: q('input[type=checkbox]').map((c) => `${(c.labels && c.labels[0] ? txt(c.labels[0]) : c.getAttribute('aria-label') || '')}=${c.checked}`).slice(0, 20),
    text: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 2500),
  };
};

async function run(side, steps) {
  const base = side === 'viejo' ? 'http://127.0.0.1:3110' : 'http://127.0.0.1:8081/spa';
  const browser = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 950 },
    storageState: `/home/rizutov/ares-react/qa/.estado-${side}-comercio.json`,
    locale: 'es-MX',
  });
  const page = await ctx.newPage();
  const out = {};
  for (const [nombre, fn] of Object.entries(steps)) {
    try {
      await fn(page, base);
      await page.waitForTimeout(700);
      out[nombre] = await page.evaluate(dump);
      await page.screenshot({ path: `${OUT}/int-${nombre}-${side}.png`, fullPage: false });
    } catch (e) {
      out[nombre] = { error: String(e).slice(0, 300) };
    }
  }
  await browser.close();
  return out;
}

const pasos = {
  cajon: async (page, base) => {
    await page.goto(base + (base.includes('8081') ? '/' : '/explorar'), { waitUntil: 'networkidle' });
    const sel = base.includes('8081') ? 'button[aria-label="Abrir carrito"]' : '[data-abrir-carrito]';
    await page.click(sel, { timeout: 8000 }).catch(() => {});
  },
  caja_ticket: async (page, base) => {
    await page.goto(base + '/pos', { waitUntil: 'networkidle' });
    const prod = base.includes('8081') ? '.prod, .pos-prod, button.pos-prod' : 'button.prod';
    await page.click(prod, { timeout: 8000 }).catch(() => {});
  },
  caja_cobrar: async (page, base) => {
    await page.goto(base + '/pos', { waitUntil: 'networkidle' });
    const prod = base.includes('8081') ? '.prod, .pos-prod, button.pos-prod' : 'button.prod';
    await page.click(prod, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(500);
    const cobrar = base.includes('8081') ? 'button:has-text("Cobrar")' : '#pos-cobrar';
    await page.click(cobrar, { timeout: 8000 }).catch(() => {});
  },
  hilo: async (page, base) => {
    await page.goto(base + '/mensajes', { waitUntil: 'networkidle' });
    const item = base.includes('8081') ? '.msg-hilo' : '.msg-hilo';
    await page.click(item, { timeout: 8000 }).catch(() => {});
  },
  editar: async (page, base) => {
    await page.goto(base + '/perfil/editar', { waitUntil: 'networkidle' });
  },
  permisos: async (page, base) => {
    await page.goto(base + '/perfil/permisos', { waitUntil: 'networkidle' });
  },
};

(async () => {
  const res = {};
  res.nuevo = await run('nuevo', pasos);
  // En la app vieja NO se pulsa Cobrar: envía POST /pos/vender y crearía una venta.
  const { caja_cobrar, ...sinCobrar } = pasos;
  res.viejo = await run('viejo', sinCobrar);
  fs.writeFileSync(`${OUT}/interactivo.json`, JSON.stringify(res, null, 2));
  console.log('ok');
})();
