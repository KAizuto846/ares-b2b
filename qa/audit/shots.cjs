
const { chromium } = require('/home/rizutov/didi2-b2b/node_modules/playwright');
const QA='/home/rizutov/ares-react/qa', OUT=QA+'/audit';
const NUEVO='http://127.0.0.1:8081/spa', VIEJO='http://127.0.0.1:3110';
(async()=>{
  const b=await chromium.launch({channel:'chrome',args:['--no-sandbox']});
  const pares=[
    ['mayorista','pedido-detalle','/pedidos/71942522-e349-11f1-9263-a4bb6d8495fd','/pedidos/71942522-e349-11f1-9263-a4bb6d8495fd'],
    ['admin','postmvp-ruta-bnpl','/postmvp/bnpl','/admin/postmvp/bnpl'],
    ['mayorista','producto-editar-ruta','/mayorista/productos/ce9cd884-1619-46c8-b4b3-39e2e6999670/editar','/productos/ce9cd884-1619-46c8-b4b3-39e2e6999670/editar'],
  ];
  for (const [rol,nombre,vp,np] of pares){
    for (const [tag,base,path] of [['viejo',VIEJO,vp],['nuevo',NUEVO,np]]){
      const ctx=await b.newContext({viewport:{width:1440,height:950},storageState:`${QA}/.estado-${tag}-${rol}.json`});
      const p=await ctx.newPage();
      await p.goto(base+path,{waitUntil:'networkidle'}).catch(()=>{});
      await p.waitForTimeout(900);
      await p.screenshot({path:`${OUT}/${rol}-${nombre}-${tag}.png`,fullPage:true});
      console.log(rol,nombre,tag,await p.evaluate(()=>location.pathname));
      await ctx.close();
    }
  }
  await b.close();
})();
