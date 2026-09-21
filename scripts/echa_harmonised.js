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
  await p.goto('https://chem.echa.europa.eu', {waitUntil:'networkidle', timeout:30000});
  await p.waitForTimeout(2000);
  // fetch substance detail for potassium permanganate
  const subUrl='https://chem.echa.europa.eu/api-substance/v1/substance/100.028.874';
  console.log('=== GET substance detail', subUrl);
  let r=await p.evaluate(async (url)=>{
    const resp=await fetch(url,{headers:{'Accept':'application/json'}});
    const t=await resp.text();
    return {status:resp.status, body:t};
  }, subUrl);
  console.log('status', r.status);
  const sub = JSON.parse(r.body);
  console.log('rmlName', sub.rmlName, 'ec', sub.rmlEc, 'cas', sub.rmlCas);
  // try harmonised endpoints
  const harms = [
    'https://chem.echa.europa.eu/api-substance/v1/substance/100.028.874/harmonised',
    'https://chem.echa.europa.eu/api-substance/v1/substance/100.028.874/classification',
    'https://chem.echa.europa.eu/api-substance/v1/substance/100.028.874/harmonised-classification',
    'https://chem.echa.europa.eu/api-substance/v1/harmonised/100.028.874',
    'https://chem.echa.europa.eu/api-substance/v1/harmonised?rmlId=100.028.874',
    'https://chem.echa.europa.eu/api-clp/v1/harmonised?rmlId=100.028.874',
  ];
  for(const u of harms){
    console.log('\n=== GET', u);
    const res=await p.evaluate(async (url)=>{
      try{ const resp=await fetch(url,{headers:{'Accept':'application/json'}}); const t=await resp.text(); return {status:resp.status, body:t.slice(0,4000)} }catch(e){ return {error:e.message}}
    }, u);
    console.log(JSON.stringify(res,null,2).slice(0,1500));
  }
  // try to get dossier list which may contain harmonised
  const dossierUrl='https://chem.echa.europa.eu/api-substance/v1/substance/100.028.874/dossier-list';
  console.log('\n=== dossier list ===');
  let dr=await p.evaluate(async (url)=>{
    try{ const resp=await fetch(url); const t=await resp.text(); return {status:resp.status, body:t.slice(0,4000)} }catch(e){ return {error:e.message}}
  }, dossierUrl);
  console.log(JSON.stringify(dr,null,2).slice(0,1500));
  // try via page navigation to harmonised as Jev would
  console.log('\n=== Jev decides harmonised navigation ===');
  // we know sodium hydroxide harmonised URL pattern, ask Jev to map to permanganate
  const state={current_url:'https://chem.echa.europa.eu/100.028.874', substance:sub, goal:'Trouver Specific Concentration Limit pour permanganate de potassium', known_pattern:'https://chem.echa.europa.eu/100.013.805/harmonised/357489?searchText=sodium+hydroxyde'};
  const q={next:{type:"choice", instructions:"Quelle URL pour harmonised permanganate?", criteria:{direct_pattern:"Construire https://chem.echa.europa.eu/100.028.874/harmonised/<id>?searchText=potassium+permanganate", api_harmonised:"Appeler api-substance harmonised endpoint", dossier_api:"Lister dossiers puis filtrer harmonised"}}};
  const jev=callJev(state,q);
  console.log(JSON.stringify(jev.answers,null,2));
  // try direct pattern with searchText
  const testUrls=[
    'https://chem.echa.europa.eu/100.028.874/harmonised?searchText=potassium%20permanganate',
    'https://chem.echa.europa.eu/100.028.874/harmonised/357489?searchText=potassium%20permanganate',
    'https://chem.echa.europa.eu/100.028.874',
  ];
  for(const u of testUrls){
    console.log('\n=== try page', u);
    await p.goto(u, {waitUntil:'networkidle', timeout:30000}).catch(e=>{});
    await p.waitForTimeout(3000);
    console.log('url now', p.url());
    const txt=await p.evaluate(()=> document.body.innerText.slice(0,3000));
    console.log(txt.slice(0,800));
  }
  await b.close();
})()
