const {chromium} = require('C:\\Users\\hcteu\\AppData\\Roaming\\npm\\node_modules\\playwright');
(async()=>{
  const b=await chromium.launch({headless:true});
  const p=await b.newPage();
  await p.goto('https://chem.echa.europa.eu', {waitUntil:'networkidle', timeout:30000});
  await p.waitForTimeout(2000);
  // try API endpoints via page.evaluate fetch
  const probes = [
    'https://chem.echa.europa.eu/api-substance/v1/substance/100.013.805',
    'https://chem.echa.europa.eu/api-substance/v1/substance/100.028.362',
    'https://chem.echa.europa.eu/api-search/v1/search?searchText=potassium%20permanganate',
    'https://chem.echa.europa.eu/api/substance/search?searchText=potassium%20permanganate',
    'https://chem.echa.europa.eu/api/v1/search?searchText=potassium%20permanganate',
    'https://chem.echa.europa.eu/api-search/search?searchText=potassium%20permanganate'
  ];
  for(const url of probes){
    console.log('\n=== probe', url);
    const res = await p.evaluate(async (u)=>{
      try{
        const r = await fetch(u, {headers:{'Accept':'application/json'}});
        const txt = await r.text();
        return {status:r.status, headers:Object.fromEntries(r.headers.entries()), body: txt.slice(0,4000)};
      }catch(e){ return {error: e.message.slice(0,500)}; }
    }, url);
    console.log(JSON.stringify(res,null,2).slice(0,3000));
  }
  // also try to find any XHR in page by looking at JS bundle
  const html = await p.content();
  const apiHints = html.match(/\/api[^"'\s]*/g);
  console.log('\n=== api hints from html', apiHints?.slice(0,20));

  await b.close();
})()
