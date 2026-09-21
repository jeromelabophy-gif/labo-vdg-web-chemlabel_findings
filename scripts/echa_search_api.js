const {chromium}=require('C:\\Users\\hcteu\\AppData\\Roaming\\npm\\node_modules\\playwright');
(async()=>{
  const b=await chromium.launch({headless:true});
  const p=await b.newPage();
  await p.goto('https://chem.echa.europa.eu', {waitUntil:'networkidle', timeout:30000});
  await p.waitForTimeout(2000);
  const txt = await p.evaluate(async ()=>{
    const r=await fetch('https://chem.echa.europa.eu/substanceSearch/web-components-YEXNEAN2.js');
    return await r.text();
  });
  console.log('len', txt.length);
  const api = [...txt.matchAll(/\/api[^"'\s`]{0,150}/g)].map(m=>m[0]).slice(0,30);
  console.log('api', api);
  const fetchCalls = [...txt.matchAll(/fetch\([^)]{0,300}/g)].map(m=>m[0].slice(0,300)).slice(0,10);
  console.log('fetchCalls', fetchCalls);
  const http = [...txt.matchAll(/http[^"'\s]{0,150}/g)].map(m=>m[0]).slice(0,20);
  console.log('http', http);
  // try to find search
  const idx = txt.indexOf('searchText');
  console.log(txt.slice(Math.max(0,idx-1000), idx+1000).replace(/\n/g,' ').slice(0,2500));
  await b.close();
})()
