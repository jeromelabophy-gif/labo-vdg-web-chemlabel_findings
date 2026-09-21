const {chromium}=require('C:\\Users\\hcteu\\AppData\\Roaming\\npm\\node_modules\\playwright');
(async()=>{
  const b=await chromium.launch({headless:true});
  const p=await b.newPage();
  await p.goto('https://chem.echa.europa.eu', {waitUntil:'networkidle', timeout:30000});
  await p.waitForTimeout(2000);
  const scripts = await p.evaluate(()=> Array.from(document.querySelectorAll('script')).map(s=> s.src).filter(Boolean).slice(0,20));
  console.log('scripts', scripts);
  // fetch main bundle and search for api
  for(const src of scripts.slice(0,3)){
    try{
      const txt = await p.evaluate(async (u)=>{
        const r=await fetch(u); const t=await r.text(); return t.slice(0,8000);
      }, src);
      console.log('\n=== bundle', src.slice(0,80));
      const matches = txt.match(/\/api[^"']{0,80}/g);
      console.log(matches?.slice(0,20));
      const searchHints = txt.match(/searchText[^}]{0,200}/g);
      console.log('searchText hints', searchHints?.slice(0,10));
    }catch(e){ console.log('fetch err', e.message.slice(0,200));}
  }
  // try direct search API candidates
  const candidates = [
    'https://chem.echa.europa.eu/api-substance/v1/search?searchText=potassium%20permanganate',
    'https://chem.echa.europa.eu/api-substance/v1/substances/search?searchText=potassium%20permanganate',
    'https://chem.echa.europa.eu/api/substances/search?searchText=potassium%20permanganate',
    'https://chem.echa.europa.eu/api-search/v1/substances?searchText=potassium%20permanganate',
    'https://chem.echa.europa.eu/api-substance/v1/autocomplete?searchText=potassium%20permanganate'
  ];
  for(const u of candidates){
    console.log('\n=== try', u);
    const r = await p.evaluate(async (url)=>{
      try{ const resp=await fetch(url,{headers:{'Accept':'application/json'}}); const t=await resp.text(); return {status:resp.status, body:t.slice(0,3000)}; }catch(e){ return {error:e.message};}
    }, u);
    console.log(JSON.stringify(r,null,2).slice(0,2000));
  }
  await b.close();
})()
