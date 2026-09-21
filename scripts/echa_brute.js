const {chromium}=require('C:\\Users\\hcteu\\AppData\\Roaming\\npm\\node_modules\\playwright');
(async()=>{
  const b=await chromium.launch({headless:true});
  const p=await b.newPage();
  await p.goto('https://chem.echa.europa.eu', {waitUntil:'networkidle', timeout:30000});
  await p.waitForTimeout(2000);
  // try brute force rmlId for potassium permanganate
  const candidates = [];
  // EC 231-760-3 => try 100.031.xxx, 100.028.xxx, 100.033.xxx
  for(let i=300; i<400; i++){
    candidates.push(`100.028.${String(i).padStart(3,'0')}`);
    candidates.push(`100.031.${String(i).padStart(3,'0')}`);
    candidates.push(`100.030.${String(i).padStart(3,'0')}`);
  }
  // also try known pattern for 215-185-5 => 100.013.805, so 215 -> 013, 231 -> 031? Let's try 100.031.760
  candidates.push('100.031.760','100.031.761','100.031.762','100.028.760','100.013.760');
  // also try via CAS lookup endpoints
  const casEndpoints = [
    'https://chem.echa.europa.eu/api-substance/v1/substance/cas/7722-64-7',
    'https://chem.echa.europa.eu/api-substance/v1/substance/search?cas=7722-64-7',
    'https://chem.echa.europa.eu/api-substance/v1/substance/by-cas/7722-64-7',
    'https://chem.echa.europa.eu/api-substance/v1/substance/ec/231-760-3',
    'https://chem.echa.europa.eu/api-substance/v1/substance/231-760-3',
  ];
  for(const u of casEndpoints){
    console.log('\n=== GET', u);
    const r=await p.evaluate(async (url)=>{
      try{ const resp=await fetch(url,{headers:{'Accept':'application/json'}}); const t=await resp.text(); return {status:resp.status, body:t.slice(0,3000)} }catch(e){ return {error:e.message}}
    }, u);
    console.log(JSON.stringify(r,null,2).slice(0,2000));
  }
  // brute force a subset
  console.log('\n=== brute force rmlId ===');
  for(let i=0;i<30;i++){
    const id = candidates[i];
    const r=await p.evaluate(async (url)=>{
      try{ const resp=await fetch(url,{headers:{'Accept':'application/json'}}); const t=await resp.text(); return {status:resp.status, body:t.slice(0,800)} }catch(e){ return {error:e.message}}
    }, `https://chem.echa.europa.eu/api-substance/v1/substance/${id}`);
    if(r.status===200 && r.body.includes('permanganate')){
      console.log('FOUND', id, r.body.slice(0,500));
    } else if(r.status===200){
      // check name
      try{ const j=JSON.parse(r.body); if(j.rmlName && j.rmlName.toLowerCase().includes('permangan')) console.log('FOUND permangan', id, j.rmlName); }catch(e){}
    }
    if(i<5) console.log(id, r.status, r.body.slice(0,100));
  }
  // more targeted brute force around 100.030.xxx
  for(let n=0; n<200; n++){
    const id = `100.030.${String(700+n).padStart(3,'0')}`;
    const r=await p.evaluate(async (url)=>{
      try{ const resp=await fetch(url,{headers:{'Accept':'application/json'}}); const t=await resp.text(); return {status:resp.status, body:t} }catch(e){ return {error:e.message}}
    }, `https://chem.echa.europa.eu/api-substance/v1/substance/${id}`);
    if(r.status===200){
      try{ const j=JSON.parse(r.body); if(j.rmlName && j.rmlName.toLowerCase().includes('potassium permanganate')){ console.log('FOUND TARGET', id, JSON.stringify(j).slice(0,500)); break; } }catch(e){}
    }
  }
  await b.close();
})()
