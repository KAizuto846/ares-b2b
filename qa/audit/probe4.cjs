
const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright');
const QA = '/home/rizutov/ares-react/qa';
const NUEVO = 'http://127.0.0.1:8081/spa', VIEJO='http://127.0.0.1:3110';
async function ver(browser, tag, rol, path){
  const ctx = await browser.newContext({ viewport:{width:1440,height:950}, storageState: `${QA}/.estado-${tag}-${rol}.json` });
  const page = await ctx.newPage();
  await page.goto((tag==='nuevo'?NUEVO:VIEJO)+path,{waitUntil:'networkidle'}).catch(()=>{});
  await page.waitForTimeout(700);
  const d = await page.evaluate(()=>({url:location.pathname, h1:(document.querySelector('h1')||{}).innerText||'', btn:[...document.querySelectorAll('button')].map(b=>b.innerText.trim()).filter(Boolean).slice(0,15), txt: document.body.innerText.slice(0,700)}));
  await ctx.close(); return d;
}
(async()=>{
  const browser = await chromium.launch({channel:'chrome',args:['--no-sandbox']});
  const out={};
  out['mayorista-detalle-preparando-nuevo'] = await ver(browser,'nuevo','mayorista','/pedidos/7194e1c4-e349-11f1-9263-a4bb6d8495fd');
  out['mayorista-detalle-preparando-viejo'] = await ver(browser,'viejo','mayorista','/pedidos/7194e1c4-e349-11f1-9263-a4bb6d8495fd');
  out['repartidor-facturacion-nuevo'] = await ver(browser,'nuevo','repartidor','/facturacion');
  out['repartidor-facturacion-viejo'] = await ver(browser,'viejo','repartidor','/facturacion');
  out['admin-finanzas-nuevo'] = await ver(browser,'nuevo','admin','/finanzas');
  out['admin-finanzas-viejo'] = await ver(browser,'viejo','admin','/finanzas');
  console.log(JSON.stringify(out,null,1));
  await browser.close();
})();
