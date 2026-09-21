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
  const b=await chromium.launch({headless:false});
  const p=await b.newPage();
  // helper to accept legal and cookies
  async function acceptAll(){
    try{
      const cookie = p.locator('text=Accept all cookies');
      if(await cookie.count()>0){ await cookie.first().click({timeout:2000}); console.log('accepted cookies'); }
    }catch(e){}
    try{
      const legal = p.getByRole('button', {name:/I Accept the terms/i});
      if(await legal.count()>0){ await legal.first().click({timeout:3000}); console.log('accepted legal'); await p.waitForTimeout(1500); }
      // also try generic
      const alt = p.locator('text=I Accept the terms');
      if(await alt.count()>0){ await alt.first().click({timeout:2000}); console.log('alt accepted legal'); }
    }catch(e){ console.log('legal err', e.message.slice(0,120));}
  }
  console.log('=== goto base ===');
  await p.goto('https://chem.echa.europa.eu', {waitUntil:'networkidle', timeout:40000});
  await p.waitForTimeout(3000);
  await acceptAll();
  console.log('after base accept url', p.url());
  // fetch full substance detail for potassium permanganate
  const sub = await p.evaluate(async ()=>{
    const r=await fetch('https://chem.echa.europa.eu/api-substance/v1/substance/100.028.874', {headers:{'Accept':'application/json'}});
    const t=await r.text();
    return {status:r.status, body:t};
  });
  console.log('sub status', sub.status);
  const j=JSON.parse(sub.body);
  console.log('keys', Object.keys(j).slice(0,20));
  console.log(JSON.stringify(j,null,2).slice(0,3000));
  // try to find harmonised via api that contains classifications
  // look for any url in j that hints
  console.log('rmlId', j.rmlId, 'indexNumber', j.indexNumber);
  // try dossier/harmonised via p.evaluate fetch with Jev decision
  const state={substance: j.rmlName, rmlId:j.rmlId, indexNumber:j.indexNumber, goal:"Trouver SCL pour potassium permanganate", known_pattern:"/100.013.805/harmonised/357489"};
  const q={action:{type:"choice", instructions:"Comment obtenir SCL?", criteria:{api_clp:"Chercher via api-clp harmonised", api_dossier:"Lister dossiers", page_scrape:"Scraper page harmonised après accept legal"}}};
  const jev=callJev(state,q);
  console.log('Jev', JSON.stringify(jev.answers,null,2));
  // try to navigate to substance page and extract
  console.log('\n=== goto substance page ===');
  await p.goto('https://chem.echa.europa.eu/100.028.874', {waitUntil:'networkidle', timeout:30000});
  await p.waitForTimeout(4000);
  await acceptAll();
  console.log('substance page url', p.url());
  let txt = await p.evaluate(()=> document.body.innerText.slice(0,6000));
  console.log('substance body', txt.slice(0,2000));
  await p.screenshot({path:'C:\\Users\\hcteu\\AppData\\Local\\Temp\\echa_sub_100028874.png'});
  // try harmonised page pattern from sodium hydroxide
  console.log('\n=== goto harmonised direct (sodium pattern) ===');
  await p.goto('https://chem.echa.europa.eu/100.013.805/harmonised/357489?searchText=sodium+hydroxyde', {waitUntil:'networkidle', timeout:30000});
  await p.waitForTimeout(4000);
  await acceptAll();
  console.log('sodium harmonised url', p.url());
  txt = await p.evaluate(()=> document.body.innerText.slice(0,6000));
  console.log('sodium harm body', txt.slice(0,2000));
  await p.screenshot({path:'C:\\Users\\hcteu\\AppData\\Local\\Temp\\echa_harm_sodium.png'});
  // try to extract harmonised for potassium via similar pattern but unknown id
  // let's try to find harmonised id via api that lists classifications for substance
  const harmCandidates = [
    'https://chem.echa.europa.eu/api-substance/v1/substance/100.028.874/harmonised-classification',
    'https://chem.echa.europa.eu/api-clp/v1/substance/100.028.874/harmonised',
    'https://chem.echa.europa.eu/api-clp/v1/harmonised?rmlId=100.028.874',
    'https://chem.echa.europa.eu/api-clp/v1/classification?rmlId=100.028.874',
  ];
  for(const u of harmCandidates){
    const r2=await p.evaluate(async (url)=>{
      try{ const resp=await fetch(url,{headers:{'Accept':'application/json'}}); const t=await resp.text(); return {status:resp.status, body:t.slice(0,3000)} }catch(e){ return {error:e.message}}
    }, u);
    console.log('\nGET', u, JSON.stringify(r2,null,2).slice(0,1200));
  }
  await b.close();
})()
