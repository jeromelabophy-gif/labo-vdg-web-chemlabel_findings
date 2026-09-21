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
  await p.goto('https://chem.echa.europa.eu', {waitUntil:'networkidle', timeout:40000});
  await p.waitForTimeout(2000);
  // Jev decides search term
  const jev1=callJev(
    {goal:"Trouver acide chlorhydrique pour findings", options:["acide chlorhydrique","hydrochloric acid","7647-01-0","231-595-7"]},
    {term:{type:"choice", instructions:"Quel terme de recherche pour acide chlorhydrique?", criteria:{fr:"acide chlorhydrique", en:"hydrochloric acid", cas:"7647-01-0", ec:"231-595-7"}}}
  );
  console.log('Jev term', JSON.stringify(jev1.answers,null,2));
  const term = jev1.answers.term.choice==='fr' ? 'acide chlorhydrique' : jev1.answers.term.choice==='en' ? 'hydrochloric acid' : jev1.answers.term.choice==='cas' ? '7647-01-0' : '231-595-7';
  // try search via API
  const queries = [
    `https://chem.echa.europa.eu/api-substance/v1/substance?searchText=${encodeURIComponent(term)}&pageIndex=1&pageSize=10`,
    `https://chem.echa.europa.eu/api-substance/v1/substance?searchText=hydrochloric%20acid&pageIndex=1&pageSize=10`,
    `https://chem.echa.europa.eu/api-substance/v1/substance?searchText=7647-01-0&pageIndex=1&pageSize=10`,
  ];
  let found=null;
  for(const u of queries){
    console.log('\n=== GET', u);
    const r=await p.evaluate(async (url)=>{
      try{ const resp=await fetch(url,{headers:{'Accept':'application/json'}}); const t=await resp.text(); return {status:resp.status, body:t} }catch(e){ return {error:e.message}}
    }, u);
    console.log('status', r.status);
    if(r.body){
      try{
        const j=JSON.parse(r.body);
        console.log('totalItems', j.totalItems, 'items', j.items?.length);
        if(j.items && j.items.length>0){
          console.log(j.items.slice(0,2).map(i=> ({id:i.substanceIndex.rmlId, name:i.substanceIndex.rmlName, ec:i.substanceIndex.rmlEc, cas:i.substanceIndex.rmlCas})));
          // look for hydrochloric acid
          const match = j.items.find(i=> i.substanceIndex.rmlName.toLowerCase().includes('hydrogen chloride') || i.substanceIndex.rmlCas==='7647-01-0' || i.substanceIndex.rmlEc==='231-595-7' || i.substanceIndex.rmlName.toLowerCase().includes('hydrochloric'));
          if(match){
            console.log('MATCH', match.substanceIndex);
            found=match.substanceIndex;
            break;
          }
          if(!found) found=j.items[0].substanceIndex;
        }
      }catch(e){ console.log('parse err', e.message, r.body.slice(0,500));}
    }
  }
  if(!found){
    console.log('not found, trying hydrogen chloride');
    const r=await p.evaluate(async ()=>{
      const resp=await fetch('https://chem.echa.europa.eu/api-substance/v1/substance?searchText=hydrogen%20chloride&pageIndex=1&pageSize=10',{headers:{'Accept':'application/json'}});
      return {status:resp.status, body:await resp.text()};
    });
    console.log(r.body.slice(0,2000));
    const j=JSON.parse(r.body);
    found=j.items[0].substanceIndex;
  }
  console.log('\n=== FOUND', found);
  // Jev verifies
  const jev2=callJev(
    {found, goal:"Vérifier que c'est bien acide chlorhydrique"},
    {ok:{type:"noul", instructions:"Est-ce bien acide chlorhydrique / hydrogen chloride CAS 7647-01-0 EC 231-595-7?", true:"Oui", false:"Non"}}
  );
  console.log('Jev verify', JSON.stringify(jev2.answers,null,2));
  // fetch substance detail
  const sub = await p.evaluate(async (id)=>{
    const r=await fetch(`https://chem.echa.europa.eu/api-substance/v1/substance/${id}`,{headers:{'Accept':'application/json'}});
    return {status:r.status, body:await r.text()};
  }, found.rmlId);
  console.log('\n=== substance detail', sub.status);
  const subJ=JSON.parse(sub.body);
  console.log('rmlName', subJ.rmlName, 'ec', subJ.rmlEc, 'cas', subJ.rmlCas, 'index', subJ.indexNumber);
  // harmonised overview
  const info = await p.evaluate(async (id)=>{
    const r=await fetch(`https://chem.echa.europa.eu/api-cnl-inventory/prominent/overview/info/${id}`,{headers:{'Accept':'application/json'}});
    return {status:r.status, body:await r.text()};
  }, found.rmlId);
  console.log('\n=== overview info', info.body.slice(0,1200));
  const infoJ=JSON.parse(info.body);
  console.log('items', infoJ.items);
  let cid=null;
  if(infoJ.items && infoJ.items.length>0){
    cid=infoJ.items[0].classificationId;
    console.log('classificationId', cid);
    // classifications
    const cls = await p.evaluate(async (id)=>{
      const r=await fetch(`https://chem.echa.europa.eu/api-cnl-inventory/prominent/overview/classifications/harmonised/${id}`,{headers:{'Accept':'application/json'}});
      return {status:r.status, body:await r.text()};
    }, cid);
    console.log('classifications', cls.body.slice(0,3000));
    // SCL
    const scl = await p.evaluate(async (id)=>{
      const r=await fetch(`https://chem.echa.europa.eu/api-cnl-inventory/harmonized/specific-concentration-limits/${id}`,{headers:{'Accept':'application/json'}});
      return {status:r.status, body:await r.text()};
    }, cid);
    console.log('SCL', scl.body.slice(0,2000));
    // harmonized classification
    const harm = await p.evaluate(async (id)=>{
      const r=await fetch(`https://chem.echa.europa.eu/api-cnl-inventory/harmonized/classification/${id}`,{headers:{'Accept':'application/json'}});
      return {status:r.status, body:await r.text()};
    }, cid);
    console.log('harmonized classification', harm.body.slice(0,3000));
  } else {
    console.log('no harmonised items');
  }
  await b.close();
})()
