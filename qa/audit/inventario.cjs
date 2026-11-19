const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright');
const fs = require('fs');

const VIEJO = 'http://127.0.0.1:3110';
const NUEVO = 'http://127.0.0.1:8081/spa';
const QA = '/home/rizutov/ares-react/qa';
const OUT = `${QA}/audit`;

const P = [
  // rol, nombre, viejo, nuevo
  ['mayorista', 'panel', '/mayorista', '/'],
  ['mayorista', 'productos', '/mayorista/productos', '/productos'],
  ['mayorista', 'producto-nuevo', '/mayorista/productos/nuevo', '/productos/nuevo'],
  ['mayorista', 'producto-editar', '/mayorista/productos/ce9cd884-1619-46c8-b4b3-39e2e6999670/editar', '/productos/ce9cd884-1619-46c8-b4b3-39e2e6999670/editar'],
  ['mayorista', 'pedidos', '/mayorista/pedidos', '/pedidos'],
  ['mayorista', 'facturacion', '/facturacion', '/facturacion'],
  ['mayorista', 'finanzas', '/finanzas', '/finanzas'],
  ['admin', 'panel', '/admin', '/admin'],
  ['admin', 'usuarios', '/admin/usuarios', '/admin/usuarios'],
  ['admin', 'kyc', '/admin/kyc', '/admin/kyc'],
  ['admin', 'reclamos', '/admin/reclamos', '/admin/reclamos'],
  ['admin', 'parametros', '/admin/parametros', '/admin/parametros'],
  ['admin', 'postmvp', '/postmvp', '/admin/postmvp'],
  ['admin', 'consolidaciones', '/postmvp/consolidaciones', '/admin/postmvp/consolidaciones'],
  ['admin', 'bnpl', '/postmvp/bnpl', '/admin/postmvp/bnpl'],
  ['repartidor', 'panel', '/repartidor', '/repartidor'],
  ['repartidor', 'pedido-detalle', '/pedidos/71954494-e349-11f1-9263-a4bb6d8495fd', '/pedidos/71954494-e349-11f1-9263-a4bb6d8495fd'],
];

const EXTRACT = () => {
  const txt = (el) => (el.textContent || '').trim().replace(/\s+/g, ' ');
  const uniq = (a) => [...new Set(a)];
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  const heads = [...document.querySelectorAll('h1,h2,h3,h4')].filter(vis).map((h) => h.tagName + ': ' + txt(h).slice(0, 80));
  const buttons = uniq([...document.querySelectorAll('button, .boton, [role=button]')].filter(vis).map((b) => txt(b).slice(0, 50)).filter(Boolean));
  const links = [...document.querySelectorAll('a[href]')].filter(vis).map((a) => txt(a).slice(0, 50) + ' -> ' + a.getAttribute('href'));
  const tables = [...document.querySelectorAll('table')].map((t) => ({
    th: [...t.querySelectorAll('thead th')].map((x) => txt(x)),
    rows: t.querySelectorAll('tbody tr').length,
    filaBotones: uniq([...t.querySelectorAll('tbody button, tbody a')].map((x) => txt(x).slice(0, 30)).filter(Boolean)),
  }));
  const fields = [...document.querySelectorAll('input,select,textarea')].filter(vis).map((f) => {
    const lab = f.closest('label') ? txt(f.closest('label')).slice(0, 60) : '';
    let lbl = '';
    if (f.id) { const l = document.querySelector(`label[for="${f.id}"]`); if (l) lbl = txt(l); }
    const parentLab = f.parentElement && f.parentElement.tagName === 'LABEL' ? txt(f.parentElement) : '';
    return {
      t: f.tagName.toLowerCase() + (f.type ? ':' + f.type : ''),
      name: f.name || f.id || '',
      ph: f.placeholder || '',
      label: (lab || lbl || parentLab).slice(0, 60),
      req: f.required || false,
      opts: f.tagName === 'SELECT' ? [...f.options].map((o) => o.text.trim()).slice(0, 25) : undefined,
      val: f.type === 'checkbox' || f.type === 'radio' ? f.checked : undefined,
    };
  });
  const selects = fields.filter((f) => f.t.startsWith('select'));
  const nav = uniq([...document.querySelectorAll('nav a, aside a, header a, .rail a, .nav a')].filter(vis).map((a) => txt(a).slice(0, 40)).filter(Boolean));
  const dialogs = [...document.querySelectorAll('dialog')].map((d) => ({ open: d.open, h: txt(d).slice(0, 60) }));
  return { url: location.pathname + location.search, title: document.title, heads, nav, buttons, links, tables, fields, selects, dialogs, bodyLen: document.body.innerText.length };
};

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
  const res = {};
  for (const [rol, nombre, vp, np] of P) {
    for (const [tag, base, path] of [['viejo', VIEJO, vp], ['nuevo', NUEVO, np]]) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, storageState: `${QA}/.estado-${tag}-${rol}.json` });
      const page = await ctx.newPage();
      const errs = []; const bad = [];
      page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
      page.on('response', (r) => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 90)); });
      let data = null;
      try {
        await page.goto(base + path, { waitUntil: 'networkidle', timeout: 25000 });
        await page.waitForTimeout(900);
        data = await page.evaluate(EXTRACT);
      } catch (e) { data = { error: String(e).slice(0, 120) }; }
      await page.screenshot({ path: `${OUT}/${rol}-${nombre}-${tag}.png`, fullPage: false }).catch(() => {});
      res[`${rol}|${nombre}|${tag}`] = { pedido: path, ...data, errs, bad: [...new Set(bad)] };
      await ctx.close();
    }
  }
  fs.writeFileSync(`${OUT}/inventario.json`, JSON.stringify(res, null, 1));
  console.log('OK', Object.keys(res).length);
  await browser.close();
})();
