
const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright');
const QA = '/home/rizutov/ares-react/qa';
const NUEVO='http://127.0.0.1:8081/spa', VIEJO='http://127.0.0.1:3110';
async function ver(browser,tag,rol,path){
  const ctx=await browser.newContext({viewport:{width:1440,height:950},storageState:`${QA}/.estado-${tag}-${rol}.json`});
  const p=await ctx.newPage();
  await p.goto((tag==='nuevo'?NUEVO:VIEJO)+path,{waitUntil:'networkidle'}).catch(()=>{});
  await p.waitForTimeout(700);
  const d=await p.evaluate(()=>({url:location.pathname,
    btn:[...document.querySelectorAll('button')].map(b=>b.innerText.trim().replace(/\s+/g,' ')).filter(x=>x&&x.length<40).slice(0,20),
    links:[...document.querySelectorAll('main a[href],a[href*="/pedidos/"]')].map(a=>a.getAttribute('href')).filter((v,i,s)=>s.indexOf(v)===i).slice(0,15),
    txt:(document.querySelector('main')||document.body).innerText.slice(0,900)}));
  await ctx.close(); return d;
}
(async()=>{
  const b=await chromium.launch({channel:'chrome',args:['--no-sandbox']});
  const o={};
  for (const u of ['71942522-e349-11f1-9263-a4bb6d8495fd']) {
    o['mayorista-asignando-viejo']=await ver(b,'viejo','mayorista','/pedidos/'+u);
    o['mayorista-asignando-nuevo']=await ver(b,'nuevo','mayorista','/pedidos/'+u);
  }
  console.log(JSON.stringify(o,null,1));
  await b.close();
})();
