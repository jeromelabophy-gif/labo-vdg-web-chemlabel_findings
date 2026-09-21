const {chromium}=require('C:\\Users\\hcteu\\AppData\\Roaming\\npm\\node_modules\\playwright');
(async()=>{
  const b=await chromium.launch({headless:true});
  const p=await b.newPage();
  await p.goto('https://chem.echa.europa.eu', {waitUntil:'networkidle', timeout:30000});
  await p.waitForTimeout(2000);
  const tests = [
    'https://chem.echa.europa.eu/api-substance/v1/substance?searchText=potassium%20permanganate',
    'https://chem.echa.europa.eu/api-substance/v1/substance?searchText=potassium%20permanganate&pageIndex=1&pageSize=10',
    'https://chem.echa.europa.eu/api-substance/v1/substance?searchText=7722-64-7',
    'https://chem.echa.europa.eu/api-substance/v1/substance?searchText=231-760-3',
  ];
  for(const u of tests){
    console.log('\n=== GET', u);
    const r=await p.evaluate(async (url)=>{
      try{ const resp=await fetch(url,{headers:{'Accept':'application/json'}}); const t=await resp.text(); return {status:resp.status, body:t.slice(0,5000)} }catch(e){ return {error:e.message}}
    }, u);
    console.log(JSON.stringify(r,null,2).slice(0,3000));
    if(r.body && r.body.includes('permanganate')){
      console.log('FOUND permanganate');
    }
    if(r.body && r.body.includes('rmlId')){
      try{ const j=JSON.parse(r.body); console.log('totalItems', j.totalItems, 'items', j.items?.length); if(j.items) console.log(j.items.slice(0,2).map(i=> ({id:i.rmlId, name:i.rmlName, ec:i.rmlEc}) )); }catch(e){}
    }
  }
  await b.close();
})()
