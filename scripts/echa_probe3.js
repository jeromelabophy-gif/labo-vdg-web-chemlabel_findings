const {chromium}=require('C:\\Users\\hcteu\\AppData\\Roaming\\npm\\node_modules\\playwright');
(async()=>{
  const b=await chromium.launch({headless:true});
  const p=await b.newPage();
  await p.goto('https://chem.echa.europa.eu', {waitUntil:'networkidle', timeout:30000});
  await p.waitForTimeout(2000);
  // get all script src
  const scripts = await p.evaluate(()=> Array.from(document.querySelectorAll('script')).map(s=>s.src).filter(Boolean));
  console.log('scripts', scripts);
  // fetch main bundle fully
  const main = scripts.find(s=> s.includes('main-'));
  if(main){
    const txt = await p.evaluate(async (url)=>{
      const r=await fetch(url); const t=await r.text(); return t;
    }, main);
    console.log('main len', txt.length);
    // search for api
    const apiMatches = [...txt.matchAll(/\/api[^"'`\s]{0,100}/g)].map(m=>m[0]).slice(0,40);
    console.log('api matches', apiMatches);
    const searchMatches = [...txt.matchAll(/search[^"'`\s]{0,80}/gi)].map(m=>m[0]).slice(0,40);
    console.log('search matches', searchMatches);
    // find chunk urls in main
    const chunkMatches = [...txt.matchAll(/chunk[^"'`\s]*\.js/g)].map(m=>m[0]).slice(0,20);
    console.log('chunks', chunkMatches);
    // also look for href
    const hrefs = [...txt.matchAll(/href[^,]{0,100}/g)].map(m=>m[0]).slice(0,20);
    console.log('hrefs', hrefs.slice(0,10));
  }
  // try POST candidates
  const candidates = [
    'https://chem.echa.europa.eu/api-substance/v1/search',
    'https://chem.echa.europa.eu/api-substance/v1/substance/search',
    'https://chem.echa.europa.eu/api/search',
    'https://chem.echa.europa.eu/api/dossier/search'
  ];
  for(const u of candidates){
    console.log('\n=== POST try', u);
    const r = await p.evaluate(async (url)=>{
      try{
        const resp = await fetch(url, {method:'POST', headers:{'Content-Type':'application/json','Accept':'application/json'}, body: JSON.stringify({searchText:'potassium permanganate'})});
        const t=await resp.text();
        return {status:resp.status, body:t.slice(0,3000)};
      }catch(e){ return {error:e.message};}
    }, u);
    console.log(JSON.stringify(r,null,2).slice(0,2000));
  }
  await b.close();
})()
