const {chromium}=require('C:\\Users\\hcteu\\AppData\\Roaming\\npm\\node_modules\\playwright');
(async()=>{
  const b=await chromium.launch({headless:true});
  const p=await b.newPage();
  await p.goto('https://chem.echa.europa.eu', {waitUntil:'networkidle', timeout:30000});
  await p.waitForTimeout(2000);
  const txt = await p.evaluate(async ()=>{
    const r=await fetch('https://chem.echa.europa.eu/chunk-GZ6ZNCXT.js');
    return await r.text();
  });
  // find K definition
  const kIdx = txt.indexOf('substanceApiUrl');
  console.log(txt.slice(Math.max(0,kIdx-1500), kIdx+1500).replace(/\n/g,' '));
  const dossierIdx = txt.indexOf('dossierApiUrl');
  console.log('\n--- dossier ---');
  console.log(txt.slice(Math.max(0,dossierIdx-1500), dossierIdx+800).replace(/\n/g,' '));
  // also look for K object
  const kObj = txt.match(/K\s*=\s*\{[^}]{0,500}substanceApiUrl[^}]{0,500}\}/);
  console.log('\nK obj', kObj?.[0]?.slice(0,800));
  // try to find all api urls
  const allUrls = [...txt.matchAll(/https?:\/\/[^"'\s]+/g)].map(m=>m[0]).slice(0,20);
  console.log('\nallUrls', allUrls.slice(0,10));
  // look for config
  const configIdx = txt.indexOf('config');
  console.log(txt.slice(configIdx-500, configIdx+1000).replace(/\n/g,' ').slice(0,2000));
  await b.close();
})()
