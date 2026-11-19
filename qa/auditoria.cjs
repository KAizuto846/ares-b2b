const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright');
const BASE = 'http://127.0.0.1:8081/spa';

const MEDIR = () => {
  const doc = document.documentElement;
  const desborde = doc.scrollWidth - doc.clientWidth;
  const chicos = [];
  const taps = [];
  document.querySelectorAll('body *').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') return;
    const txt = (el.children.length === 0 ? el.textContent || '' : '').trim();
    if (txt && parseFloat(cs.fontSize) < 12) chicos.push(`${el.tagName.toLowerCase()}.${el.className} ${cs.fontSize} "${txt.slice(0, 24)}"`);
    if (['BUTTON', 'A', 'INPUT', 'SELECT'].includes(el.tagName)) {
      if (r.width < 44 || r.height < 44) taps.push(`${el.tagName.toLowerCase()}.${el.className} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
  });
  return { desborde, chicos: chicos.slice(0, 5), taps: taps.slice(0, 6) };
};

(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  await p.fill('input[type=email]', 'comercio@didi2.mx');
  await p.fill('input[type=password]', 'comercio123');
  await p.click('button[type=submit]');
  await p.waitForSelector('.rail');

  const salida = [];
  for (const ancho of [360, 390, 768, 1280, 1440]) {
    await p.setViewportSize({ width: ancho, height: ancho < 500 ? 780 : 900 });
    for (const ruta of ['/', '/buscar', '/pedidos', '/perfil']) {
      await p.goto(BASE + ruta, { waitUntil: 'networkidle' });
      await p.waitForTimeout(350);
      const m = await p.evaluate(MEDIR);
      salida.push({ ancho, ruta, ...m });
    }
  }
  console.log(JSON.stringify({ salida, errores: errores.slice(0, 5) }, null, 1));
  await b.close();
})();
