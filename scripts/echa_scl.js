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
  async function acceptAll(){
    try{
      const c=p.locator('text=Accept all cookies');
      if(await c.count()>0) await c.first().click({timeout:2000});
    }catch(e){}
    try{
      const l=p.getByRole('button',{name:/I Accept the terms/i});
      if(await l.count()>0){ await l.first().click({timeout:3000}); console.log('accepted legal'); }
    }catch(e){}
    try{
      const alt=p.locator('text=I Accept the terms');
      if(await alt.count()>0) await alt.first().click({timeout:2000});
    }catch(e){}
  }
  await p.goto('https://chem.echa.europa.eu', {waitUntil:'networkidle', timeout:40000});
  await p.waitForTimeout(2000);
  await acceptAll();
  // fetch harmonised classifications for potassium permanganate via API that we discovered
  console.log('=== fetch harmonised overview ===');
  const info = await p.evaluate(async ()=>{
    const r=await fetch('https://chem.echa.europa.eu/api-cnl-inventory/prominent/overview/info/100.028.874', {headers:{'Accept':'application/json'}});
    const t=await r.text();
    return {status:r.status, body:t};
  });
  console.log(info.body.slice(0,1000));
  const jInfo = JSON.parse(info.body);
  const cid = jInfo.items[0].classificationId;
  console.log('classificationId', cid);
  // fetch classifications
  const cls = await p.evaluate(async (id)=>{
    const r=await fetch(`https://chem.echa.europa.eu/api-cnl-inventory/prominent/overview/classifications/harmonised/${id}`, {headers:{'Accept':'application/json'}});
    return {status:r.status, body:await r.text()};
  }, cid);
  console.log('classifications', cls.body.slice(0,3000));
  // try to find SCL endpoints
  const sclCandidates = [
    `https://chem.echa.europa.eu/api-cnl-inventory/prominent/overview/specific-concentration-limits/harmonised/${cid}`,
    `https://chem.echa.europa.eu/api-cnl-inventory/prominent/overview/scl/harmonised/${cid}`,
    `https://chem.echa.europa.eu/api-cnl-inventory/harmonised/${cid}/specific-concentration-limits`,
    `https://chem.echa.europa.eu/api-cnl-inventory/prominent/overview/limits/harmonised/${cid}`,
    `https://chem.echa.europa.eu/api-cnl-inventory/classifications/harmonised/${cid}/specific-concentration-limits`,
  ];
  for(const u of sclCandidates){
    const r=await p.evaluate(async (url)=>{
      try{ const resp=await fetch(url,{headers:{'Accept':'application/json'}}); const t=await resp.text(); return {status:resp.status, body:t.slice(0,3000)} }catch(e){ return {error:e.message}}
    }, u);
    console.log('\nGET', u, JSON.stringify(r,null,2).slice(0,1200));
  }
  // try to scrape page after navigating to harmonised
  console.log('\n=== navigate to harmonised page ===');
  await p.goto('https://chem.echa.europa.eu/100.028.874/harmonised', {waitUntil:'networkidle', timeout:30000});
  await p.waitForTimeout(4000);
  await acceptAll();
  await p.waitForTimeout(2000);
  // try force click via JS
  await p.evaluate(()=>{
    const a=document.querySelector('a[href="/100.028.874/harmonised"]');
    if(a){ a.click(); console.log('JS clicked harmonised'); }
  });
  await p.waitForTimeout(4000);
  console.log('url now', p.url());
  const txt = await p.evaluate(()=> document.body.innerText.slice(0,10000));
  console.log('harmonised body', txt.slice(0,4000));
  await p.screenshot({path:'C:\\Users\\hcteu\\AppData\\Local\\Temp\\echa_harm_final.png'});
  // try to find SCL in body
  const sclSnippet = await p.evaluate(()=>{
    const body=document.body.innerText;
    const idx=body.indexOf('Specific');
    if(idx!==-1) return body.slice(Math.max(0,idx-800), idx+2000);
    const idx2=body.indexOf('Concentration');
    if(idx2!==-1) return body.slice(Math.max(0,idx2-800), idx2+2000);
    const idx3=body.indexOf('025-002');
    if(idx3!==-1) return body.slice(Math.max(0,idx3-800), idx3+2000);
    return body.slice(0,4000);
  });
  console.log('\n=== SCL snippet ===\n', sclSnippet.slice(0,3000));
  // use Jev to verify if SCL found
  const jev=callJev(
    {page_snippet: sclSnippet.slice(0,1000), goal:"Trouver Specific Concentration Limit pour permanganate de potassium", classificationId: cid},
    {found:{type:"noul", instructions:"Le snippet contient-il une Specific Concentration Limit (SCL) chiffrée?", true:"Oui SCL trouvée", false:"Non"}}
  );
  console.log('Jev verification', JSON.stringify(jev.answers,null,2));
  await b.close();
})()
