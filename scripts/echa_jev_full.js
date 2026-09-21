const {chromium} = require('C:\\Users\\hcteu\\AppData\\Roaming\\npm\\node_modules\\playwright');
const { execSync } = require('child_process');
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
  const logs=[];
  p.on('request', r=>{
    const u=r.url();
    if(u.includes('api')||u.includes('search')||u.includes('substance')){
      logs.push({type:'REQ', method:r.method(), url:u.slice(0,250)});
      console.log('REQ', r.method(), u.slice(0,250));
    }
  });
  p.on('response', async r=>{
    const u=r.url();
    if(u.includes('api')||u.includes('search')||u.includes('substance')){
      let body='';
      try{ body=await r.text(); }catch(e){}
      console.log('RESP', r.status(), u.slice(0,250), body.slice(0,500).replace(/\n/g,' '));
    }
  });
  await p.goto('https://chem.echa.europa.eu', {waitUntil:'networkidle', timeout:40000});
  await p.waitForTimeout(2500);
  try{ const loc=p.locator('text=Accept all cookies'); if(await loc.count()>0) await loc.first().click({timeout:3000}); }catch(e){}
  console.log('=== Jev decides initial ===');
  let jev = callJev(
    {current_url: p.url(), goal: "Trouver permanganate de potassium et sa SCL", options: ["search_via_event","direct_api","brute_force_id"]},
    {next:{type:"choice", instructions:"Quelle stratégie pour trouver le permanganate?", criteria:{search_via_event:"Dispatcher searchStateChanged avec potassium permanganate", direct_api:"Appeler directement api-substance par ID deviné", brute_force_id:"Brute force rmlId 100.xxx.xxx"}}}
  );
  console.log(JSON.stringify(jev.answers,null,2));
  let choice = jev.answers.next.choice;
  console.log('Jev choice', choice);
  // try search via event
  console.log('\n=== Dispatch searchStateChanged ===');
  await p.evaluate(()=>{
    // try to find angular custom event dispatcher
    document.dispatchEvent(new CustomEvent('searchStateChanged', {detail:{searchText:'potassium permanganate', dispatcher:'test'}}));
    // also try das custom
    window.dispatchEvent(new CustomEvent('searchStateChanged', {detail:{searchText:'potassium permanganate'}}));
  });
  await p.waitForTimeout(4000);
  await p.waitForLoadState('networkidle',{timeout:10000}).catch(e=>{});
  console.log('after event url', p.url());
  console.log('body', (await p.evaluate(()=> document.body.innerText.slice(0,3000))).slice(0,1000));
  // try direct API brute force for permanganate after Jev suggests
  if(choice==='brute_force_id' || true){
    console.log('\n=== Brute force via Jev verification for permanganate ===');
    // Use Jev to verify each candidate
    for(const id of ['100.028.362','100.031.760','100.033.350','100.031.350','100.030.950','100.032.100','100.033.100']){
      const r = await p.evaluate(async (url)=>{
        try{ const resp=await fetch(url,{headers:{'Accept':'application/json'}}); const t=await resp.text(); return {status:resp.status, body:t.slice(0,600)} }catch(e){ return {error:e.message}}
      }, `https://chem.echa.europa.eu/api-substance/v1/substance/${id}`);
      console.log(id, r.status, r.body.slice(0,120));
    }
    // try to find via Jev choice among candidates
    const candidates = [
      {id:'100.013.805', name:'Sodium hydroxide', ec:'215-185-5'},
      {id:'100.028.362', name:'Lead sulphate', ec:'231-198-9'},
      {id:'100.030.300', name:'Potassium laurate', ec:'233-344-7'},
    ];
    // Use Jev to pick which is permanganate
    const state2 = {candidates, goal:"Trouver potassium permanganate EC 231-760-3 CAS 7722-64-7", hint:"Permanganate a K Mn O4, EC 231-760-3"};
    const q2 = {pick:{type:"choice", instructions:"Quel candidat est le permanganate de potassium?", criteria:{'100.013.805':"Sodium hydroxide", '100.028.362':"Lead sulphate", '100.030.300':"Potassium laurate"}}};
    const jev2 = callJev(state2,q2);
    console.log('Jev pick', JSON.stringify(jev2.answers,null,2));
  }
  await p.screenshot({path:'C:\\Users\\hcteu\\AppData\\Local\\Temp\\echa_jev_full.png'});
  await b.close();
})()
