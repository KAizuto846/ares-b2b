const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright');
const QA = '/home/rizutov/ares-react/qa', OUT = QA + '/audit';
const NUEVO = 'http://127.0.0.1:8081/spa', VIEJO = 'http://127.0.0.1:3110';

async function abrir(browser, tag, rol, path) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, storageState: `${QA}/.estado-${tag}-${rol}.json` });
  const page = await ctx.newPage();
  const bad = [];
  page.on('response', (r) => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url().slice(0, 100)); });
  page.on('pageerror', (e) => bad.push('JS ' + String(e).slice(0, 100)));
  await page.goto((tag === 'nuevo' ? NUEVO : VIEJO) + path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  return { ctx, page, bad };
}

const snap = (page) => page.evaluate(() => ({
  url: location.pathname,
  dialogs: [...document.querySelectorAll('dialog')].filter((d) => d.open).map((d) => d.innerText.replace(/\n{2,}/g, '\n').slice(0, 500)),
  text: (document.querySelector('main') || document.body).innerText.slice(0, 2500),
  botones: [...document.querySelectorAll('button')].map((b) => (b.textContent || '').trim()).filter(Boolean).slice(0, 40),
}));

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
  const out = {};

  // 1) Nuevo postmvp: pestañas BNPL y Licitaciones
  {
    const { ctx, page, bad } = await abrir(browser, 'nuevo', 'admin', '/admin/postmvp');
    for (const t of ['Planes BNPL', 'Licitaciones']) {
      try {
        await page.click(`text="${t}"`, { timeout: 4000 });
        await page.waitForTimeout(700);
        out['postmvp-tab-' + t] = { ...(await snap(page)), bad };
        await page.screenshot({ path: `${OUT}/admin-postmvp-tab-${t.replace(/\s+/g, '')}-nuevo.png` });
      } catch (e) { out['postmvp-tab-' + t] = { err: String(e).slice(0, 100) }; }
    }
    await ctx.close();
  }

  // 2) Viejo licitaciones
  for (const [tag, path] of [['viejo', '/postmvp/licitaciones'], ['nuevo', '/admin/postmvp/licitaciones']]) {
    const { ctx, page, bad } = await abrir(browser, tag, 'admin', path);
    out['licitaciones-' + tag] = { ...(await snap(page)), bad };
    await ctx.close();
  }

  // 3) Mayorista: fila de pedido clickeable en nuevo
  {
    const { ctx, page, bad } = await abrir(browser, 'nuevo', 'mayorista', '/pedidos');
    const antes = page.url();
    try {
      await page.click('tbody tr:nth-child(2) td:nth-child(1)', { timeout: 4000 });
      await page.waitForTimeout(1200);
      out['pedidos-fila-click'] = { antes, despues: page.url(), bad, ...(await snap(page)) };
      await page.screenshot({ path: `${OUT}/mayorista-pedidos-fila-click-nuevo.png` });
    } catch (e) { out['pedidos-fila-click'] = { err: String(e).slice(0, 120), antes, despues: page.url() }; }
    await ctx.close();
  }

  // 4) Mayorista productos: dialog Escalas + Importar CSV
  {
    const { ctx, page, bad } = await abrir(browser, 'nuevo', 'mayorista', '/productos');
    try {
      await page.click('text="Escalas"', { timeout: 4000 });
      await page.waitForTimeout(800);
      out['productos-escalas'] = { ...(await snap(page)), bad };
      await page.screenshot({ path: `${OUT}/mayorista-productos-escalas-nuevo.png` });
    } catch (e) { out['productos-escalas'] = { err: String(e).slice(0, 120) }; }
    await ctx.close();
  }

  // 5) Repartidor detalle: botones Confirmar recolección y Seguimiento
  for (const tag of ['viejo', 'nuevo']) {
    const { ctx, page, bad } = await abrir(browser, tag, 'repartidor', '/pedidos/71954494-e349-11f1-9263-a4bb6d8495fd');
    out['detalle-' + tag] = { ...(await snap(page)), bad };
    await page.screenshot({ path: `${OUT}/repartidor-pedido-detalle-full-${tag}.png`, fullPage: true });
    try {
      await page.click('text=/Seguimiento|Mapa|Ver seguimiento/i', { timeout: 3000 });
      await page.waitForTimeout(1000);
      out['detalle-seguimiento-' + tag] = { ...(await snap(page)) };
      await page.screenshot({ path: `${OUT}/repartidor-seguimiento-${tag}.png` });
    } catch (e) { out['detalle-seguimiento-' + tag] = { err: 'no button' }; }
    await ctx.close();
  }

  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})();
