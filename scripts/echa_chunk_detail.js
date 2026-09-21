const {chromium}=require('C:\\Users\\hcteu\\AppData\\Roaming\\npm\\node_modules\\playwright');
(async()=>{
  const b=await chromium.launch({headless:true});
  const p=await b.newPage();
  await p.goto('https://chem.echa.europa.eu', {waitUntil:'networkidle', timeout:30000});
  await p.waitForTimeout(2000);
  const txt = await p.evaluate(async ()=>{
    const r=await fetch('https://chem.echa.europa.eu/chunk-GZ6ZNCXT.js');
    const t=await r.text();
    return t;
  });
  console.log('len', txt.length);
  // find searchText occurrences
  const indices = [];
  let idx = txt.indexOf('searchText');
  while(idx!==-1){
    indices.push(idx);
    idx = txt.indexOf('searchText', idx+1);
  }
  console.log('indices', indices.slice(0,5));
  for(const i of indices.slice(0,3)){
    console.log('\n=== context around', i);
    console.log(txt.slice(Math.max(0,i-800), i+800).replace(/\n/g,' ').slice(0,2000));
  }
  // also search for fetch
  const fetchIdx = [];
  idx = txt.indexOf('fetch');
  while(idx!==-1){ fetchIdx.push(idx); idx=txt.indexOf('fetch', idx+1); }
  console.log('\nfetch indices', fetchIdx.slice(0,10));
  for(const i of fetchIdx.slice(0,3)){
    console.log(txt.slice(Math.max(0,i-400), i+400).replace(/\n/g,' ').slice(0,1000));
  }
  // search for api
  const apiIdx = [];
  idx = txt.toLowerCase().indexOf('api');
  while(idx!==-1){ apiIdx.push(idx); idx=txt.toLowerCase().indexOf('api', idx+1); }
  console.log('\napi count', apiIdx.length);
  for(const i of apiIdx.slice(0,5)){
    console.log(txt.slice(Math.max(0,i-200), i+200).replace(/\n/g,' ').slice(0,600));
  }
  await b.close();
})()
