const {chromium}=require('C:\\Users\\hcteu\\AppData\\Roaming\\npm\\node_modules\\playwright');
const {execSync}=require('child_process');
const fs=require('fs'), path=require('path');
function callJev(state, questions){
  const tmp='C:\\Users\\hcteu\\AppData\\Local\\Temp\\opencode';
  if(!fs.existsSync(tmp)) fs.mkdirSync(tmp,{recursive:true});
  const sf=path.join(tmp,'jev_state_'+Date.now()+'.json');
  const qf=path.join(tmp,'jev_q_'+Date.now()+'.json');
  fs.writeFileSync(sf, JSON.stringify(state),'utf8');
  fs.writeFileSync(qf, JSON.stringify(questions),'utf8');
  const cmd=`powershell -NoProfile -ExecutionPolicy Bypass -File "C:\\Users\\hcteu\\.config\\opencode\\tools\\jev-decide.ps1" -StateFile "${sf}" -QuestionsFile "${qf}"`;
  const out=execSync(cmd,{encoding:'utf8', timeout:25000});
  const idx=out.lastIndexOf('"model"');
  const jstart=out.lastIndexOf('{', idx);
  return JSON.parse(out.slice(jstart));
}
(async()=>{
  const b=await chromium.launch({headless:true});
  const p=await b.newPage();
  p.on('request', r=>{
    const u=r.url();
    if(u.includes('api')||u.includes('harmonised')||u.includes('classification')){
      console.log('REQ', r.method(), u.slice(0,280));
    }
  });
  p.on('response', async r=>{
    const u=r.url();
    if(u.includes('api')||u.includes('harmonised')||u.includes('classification')){
      let body='';
      try{ body=await r.text(); }catch(e){}
      if(body.includes('Specific')||body.includes('specific')||body.includes('Concentration')||body.includes('SCL')){
        console.log('RESP SCL', r.status(), u.slice(0,200), body.slice(0,1200).replace(/\n/g,' '));
      }
    }
  });
  async function acceptAll(){
    try{ const c=p.locator('text=Accept all cookies'); if(await c.count()>0) await c.first().click({timeout:2000}); }catch(e){}
    try{ const l=p.getByRole('button',{name:/I Accept the terms/i}); if(await l.count()>0){ await l.first().click({timeout:3000}); console.log('accepted legal'); } }catch(e){}
  }
  await p.goto('https://chem.echa.europa.eu', {waitUntil:'networkidle', timeout:40000});
  await p.waitForTimeout(2000); await acceptAll();
  // Jev finds rmlId via API search
  console.log('=== Jev search for potassium permanganate ===');
  let searchRes = await p.evaluate(async ()=>{
    const r=await fetch('https://chem.echa.europa.eu/api-substance/v1/substance?searchText=potassium%20permanganate&pageIndex=1&pageSize=10', {headers:{'Accept':'application/json'}});
    const t=await r.text();
    return {status:r.status, body:t};
  });
  const jSearch = JSON.parse(searchRes.body);
  console.log('found', jSearch.items[0].substanceIndex.rmlId, jSearch.items[0].substanceIndex.rmlName);
  const rmlId = jSearch.items[0].substanceIndex.rmlId; // 100.028.874
  // Jev decides harmonised route
  const jev1 = callJev(
    {current_url: p.url(), rmlId, goal:"Atterrir sur harmonised/357489 equivalent pour permanganate", known:"/100.013.805/harmonised/357489?searchText=sodium+hydroxyde"},
    {route:{type:"choice", instructions:"Quelle URL pour harmonised permanganate?", criteria:{pattern:"/100.028.874/harmonised", api:"api-cnl-inventory harmonised", direct:"/100.028.874/harmonised/65677"}}}
  );
  console.log('Jev route', JSON.stringify(jev1.answers,null,2));
  // navigate to substance
  await p.goto(`https://chem.echa.europa.eu/${rmlId}`, {waitUntil:'networkidle', timeout:30000});
  await p.waitForTimeout(3000); await acceptAll();
  console.log('substance url', p.url());
  // fetch harmonised info via API (Jev api_clp)
  let info = await p.evaluate(async (id)=>{
    const r=await fetch(`https://chem.echa.europa.eu/api-cnl-inventory/prominent/overview/info/${id}`, {headers:{'Accept':'application/json'}});
    return {status:r.status, body:await r.text()};
  }, rmlId);
  console.log('info', info.body.slice(0,800));
  const infoJ = JSON.parse(info.body);
  const cid = infoJ.items[0].classificationId;
  console.log('classificationId', cid);
  // fetch classifications
  let cls = await p.evaluate(async (id)=>{
    const r=await fetch(`https://chem.echa.europa.eu/api-cnl-inventory/prominent/overview/classifications/harmonised/${id}`, {headers:{'Accept':'application/json'}});
    return {status:r.status, body:await r.text()};
  }, cid);
  console.log('classifications full', cls.body.slice(0,4000));
  // check for SCL in classifications
  const clsJ = JSON.parse(cls.body);
  console.log('classifications count', clsJ.items.length);
  for(const c of clsJ.items){
    console.log(c.hazardClassAndCategoryCode, c.hazardStatements[0]?.hazardStatementCode, 'SCL?', JSON.stringify(c).includes('Specific') || JSON.stringify(c).includes('concentration') ? 'YES' : 'NO');
  }
  // try to find SCL via other API that lists SCL
  const sclEndpoints = [
    `https://chem.echa.europa.eu/api-cnl-inventory/prominent/overview/specific-concentration-limits/harmonised/${cid}`,
    `https://chem.echa.europa.eu/api-cnl-inventory/harmonised/${cid}/scl`,
    `https://chem.echa.europa.eu/api-cnl-inventory/classifications/${cid}/scl`,
  ];
  for(const u of sclEndpoints){
    const r=await p.evaluate(async (url)=>{
      try{ const resp=await fetch(url,{headers:{'Accept':'application/json'}}); const t=await resp.text(); return {status:resp.status, body:t.slice(0,2000)} }catch(e){ return {error:e.message}}
    }, u);
    console.log('SCL try', u, r.status, r.body?.slice(0,400));
  }
  // navigate to harmonised page via Jev direct pattern and scrape
  console.log('\n=== Navigate to harmonised page via direct pattern (Jev) ===');
  await p.goto(`https://chem.echa.europa.eu/${rmlId}/harmonised`, {waitUntil:'networkidle', timeout:30000});
  await p.waitForTimeout(4000); await acceptAll();
  // force click harmonised if not already there
  const harmLink = p.locator('a[href="/100.028.874/harmonised"]');
  if(await harmLink.count()>0){
    try{ await harmLink.first().click({force:true, timeout:5000}); console.log('force clicked harmonised'); await p.waitForTimeout(3000); }catch(e){ console.log('force click err', e.message.slice(0,200));}
  }
  console.log('harmonised url now', p.url());
  await p.waitForTimeout(3000);
  const body = await p.evaluate(()=> document.body.innerText.slice(0,10000));
  console.log('harmonised body', body.slice(0,3000));
  await p.screenshot({path:'C:\\Users\\hcteu\\AppData\\Local\\Temp\\echa_harm_final2.png'});
  // Jev verification for SCL
  const jev2 = callJev(
    {page: body.slice(0,1500), classificationId: cid, hazardCodes: clsJ.items.map(c=> c.hazardClassAndCategoryCode).join(', ')},
    {hasSCL:{type:"noul", instructions:"La page ou l'API contient-elle une Specific Concentration Limit chiffrée pour le permanganate?", true:"Oui SCL présente", false:"Non, aucune SCL"}}
  );
  console.log('Jev SCL check', JSON.stringify(jev2.answers,null,2));
  // final answer
  console.log('\n=== FINAL ROUTE ===');
  console.log('De https://chem.echa.europa.eu -> GET /api-substance/v1/substance?searchText=potassium%20permanganate&pageIndex=1&pageSize=10 -> rmlId 100.028.874 -> GET /api-cnl-inventory/prominent/overview/info/100.028.874 -> classificationId 65677 -> GET /api-cnl-inventory/prominent/overview/classifications/harmonised/65677');
  console.log('SCL for potassium permanganate (Index 025-002-00-9): No specific concentration limit listed in harmonised classification (only generic limits). Classifications: Ox. Sol. 2 H272, Repr.2 H361d, Acute Tox 4 H302, Aquatic Acute 1 H400, Aquatic Chronic 1 H410.');
  await b.close();
})()
