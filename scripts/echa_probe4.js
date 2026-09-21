const {chromium}=require('C:\\Users\\hcteu\\AppData\\Roaming\\npm\\node_modules\\playwright');
(async()=>{
  const b=await chromium.launch({headless:true});
  const p=await b.newPage();
  await p.goto('https://chem.echa.europa.eu', {waitUntil:'networkidle', timeout:30000});
  await p.waitForTimeout(2000);
  // fetch chunks
  const chunks = ['https://chem.echa.europa.eu/chunk-WII7ZCVL.js','https://chem.echa.europa.eu/chunk-GZ6ZNCXT.js'];
  for(const url of chunks){
    const txt = await p.evaluate(async (u)=>{
      const r=await fetch(u); const t=await r.text(); return t;
    }, url);
    console.log('\n=== chunk', url.slice(-30), 'len', txt.length);
    const api = [...txt.matchAll(/\/api[^"'\s`]{0,120}/g)].map(m=>m[0]).slice(0,30);
    console.log('api', api);
    const search = [...txt.matchAll(/searchText[^}]{0,300}/g)].map(m=>m[0]).slice(0,10);
    console.log('searchText', search.slice(0,2));
  }
  // try GET for search
  const gets = [
    'https://chem.echa.europa.eu/api-substance/v1/substance/search?searchText=potassium%20permanganate',
    'https://chem.echa.europa.eu/api-substance/v1/substance/search?searchText=7722-64-7',
    'https://chem.echa.europa.eu/api-substance/v1/substance/search?query=potassium%20permanganate',
    'https://chem.echa.europa.eu/api-substance/v1/autocomplete?searchText=potassium',
    'https://chem.echa.europa.eu/api-substance/v1/substance/100.028.378',
    'https://chem.echa.europa.eu/api-substance/v1/substance/100.028.38',
  ];
  for(const u of gets){
    console.log('\n=== GET', u);
    const r=await p.evaluate(async (url)=>{
      try{ const resp=await fetch(url,{headers:{'Accept':'application/json'}}); const t=await resp.text(); return {status:resp.status, body:t.slice(0,3000)} }catch(e){ return {error:e.message}}
    }, u);
    console.log(JSON.stringify(r,null,2).slice(0,2000));
  }
  await b.close();
})()
