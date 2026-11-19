const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright');
const fs = require('fs');

const VIEJO = 'http://127.0.0.1:3110';
const NUEVO = 'http://127.0.0.1:8081/spa';
const OUT = '/home/rizutov/ares-react/qa/audit';

const PAIRS = [
  ['explorar', '/explorar', '/'],
  ['buscar', '/buscar', '/buscar'],
  ['carrito', '/carrito', '/carrito'],
  ['checkout', '/checkout', '/checkout'],
  ['pedidos', '/pedidos', '/pedidos'],
  ['mensajes', '/mensajes', '/mensajes'],
  ['finanzas', '/finanzas', '/finanzas'],
  ['portafolio', '/portafolio', '/portafolio'],
  ['agendar', '/agendar', '/agendar'],
  ['pos', '/pos', '/pos'],
  ['pos-inventario', '/pos/inventario', '/pos/inventario'],
  ['pos-ventas', '/pos/ventas', '/pos/ventas'],
  ['pos-corte', '/pos/corte', '/pos/corte'],
  ['pos-clientes', '/pos/clientes', '/pos/clientes'],
  ['perfil', '/perfil', '/perfil'],
  ['perfil-editar', '/perfil/editar', '/perfil/editar'],
  ['perfil-ajustes', '/perfil/ajustes', '/perfil/ajustes'],
  ['perfil-seguridad', '/perfil/seguridad', '/perfil/seguridad'],
  ['perfil-permisos', '/perfil/permisos', '/perfil/permisos'],
  ['perfil-kyc', '/perfil/kyc', '/kyc'],
  ['perfil-ayuda', '/perfil/ayuda', '/ayuda'],
];

const snap = () => {
  const q = (s) => Array.from(document.querySelectorAll(s));
  const txt = (e) => (e.innerText || e.value || '').replace(/\s+/g, ' ').trim();
  const uniq = (a) => Array.from(new Set(a.map((x) => x.trim()).filter(Boolean)));
  const vis = (e) => {
    const r = e.getBoundingClientRect();
    const st = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none';
  };
  return {
    url: location.pathname + location.search,
    title: document.title,
    h1: uniq(q('h1,h2').map(txt)).slice(0, 12),
    nav: uniq(q('nav a, .sidebar a, aside a, header a').filter(vis).map(txt)).slice(0, 40),
    buttons: uniq(q('button, [role=button], input[type=submit]').filter(vis).map((b) => txt(b) || b.getAttribute('aria-label') || b.getAttribute('title') || '')).slice(0, 60),
    tabs: uniq(q('[role=tab], .tab, .tabs a, .tabs button, .chip--tab').filter(vis).map(txt)).slice(0, 30),
    links: uniq(q('a[href]').filter(vis).map((a) => txt(a) + ' -> ' + a.getAttribute('href'))).slice(0, 60),
    fields: q('input, select, textarea').filter(vis).map((f) => ({
      tag: f.tagName.toLowerCase(),
      type: f.type || '',
      name: f.name || '',
      id: f.id || '',
      ph: f.placeholder || '',
      label: (f.labels && f.labels[0] ? txt(f.labels[0]) : '') || f.getAttribute('aria-label') || '',
      opts: f.tagName === 'SELECT' ? Array.from(f.options).map((o) => txt(o)).filter(Boolean) : undefined,
    })).slice(0, 60),
    tableHeads: uniq(q('table thead th').filter(vis).map(txt)).slice(0, 40),
    rowActions: uniq(q('table tbody button, table tbody a, table tbody [role=button]').filter(vis).map(txt)).slice(0, 30),
    rows: q('table tbody tr').length,
    empty: uniq(q('.vacio, .empty, .sin-resultados, .aviso--info').filter(vis).map(txt)).slice(0, 5),
    text: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 3000),
  };
};

(async () => {
  const res = {};
  for (const [name, rold, rnew] of PAIRS) {
    for (const side of ['viejo', 'nuevo']) {
      const browser = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
      const ctx = await browser.newContext({
        viewport: { width: 1440, height: 950 },
        storageState: `/home/rizutov/ares-react/qa/.estado-${side}-comercio.json`,
        locale: 'es-MX',
      });
      const page = await ctx.newPage();
      const errs = [];
      page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });
      page.on('response', (r) => { if (r.status() >= 400) errs.push(r.status() + ' ' + r.url().slice(0, 160)); });
      const base = side === 'viejo' ? VIEJO : NUEVO;
      const path = side === 'viejo' ? rold : rnew;
      try {
        await page.goto(base + path, { waitUntil: 'networkidle', timeout: 45000 });
        await page.waitForTimeout(1200);
        res[`${name}.${side}`] = await page.evaluate(snap);
        res[`${name}.${side}`].errores = errs.slice(0, 8);
      } catch (e) {
        res[`${name}.${side}`] = { url: path, error: String(e).slice(0, 200) };
      }
      try {
        await page.screenshot({ path: `${OUT}/${name}-${side}.png`, fullPage: true });
      } catch {}
      await browser.close();
    }
  }
  fs.writeFileSync(`${OUT}/inventario.json`, JSON.stringify(res, null, 2));
  console.log('listo: ' + Object.keys(res).length + ' capturas de pantalla/entradas');
})();
