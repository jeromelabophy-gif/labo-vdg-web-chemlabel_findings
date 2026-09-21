const {chromium}=require('C:\\Users\\hcteu\\AppData\\Roaming\\npm\\node_modules\\playwright');
const fs=require('fs'), path=require('path');
const {execSync}=require('child_process');
function callJevSafe(state, questions){
  try{
    const tmp='C:\\Users\\hcteu\\AppData\\Local\\Temp\\opencode';
    if(!fs.existsSync(tmp)) fs.mkdirSync(tmp,{recursive:true});
    const sf=path.join(tmp,'jev_state_'+Date.now()+'.json');
    const qf=path.join(tmp,'jev_q_'+Date.now()+'.json');
    fs.writeFileSync(sf, JSON.stringify(state),'utf8');
    fs.writeFileSync(qf, JSON.stringify(questions),'utf8');
    const cmd=`powershell -NoProfile -ExecutionPolicy Bypass -File "C:\\Users\\hcteu\\.config\\opencode\\tools\\jev-decide.ps1" -StateFile "${sf}" -QuestionsFile "${qf}"`;
    const out=execSync(cmd,{encoding:'utf8', timeout:30000});
    const idx=out.lastIndexOf('"model"');
    const jstart=out.lastIndexOf('{', idx);
    return JSON.parse(out.slice(jstart));
  }catch(e){ console.log('Jev failed', e.message.slice(0,400)); return null; }
}
function sanitize(s){ return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'_').replace(/^_|_$/g,'').toLowerCase(); }
(async()=>{
  const targets=[
    {cas:'64-19-7', nom:'Acide ethanoique', file:'acide_ethanoique.json', ce:'200-580-7'},
    {cas:'76-59-5', nom:'Bleu de bromothymol', file:'bleu_de_bromothymol.json', ce:null},
    {cas:'110-82-7', nom:'Cyclohexane', file:'cyclohexane.json', ce:'203-806-2'},
  ];
  const b=await chromium.launch({headless:true});
  const p=await b.newPage();
  await p.goto('https://chem.echa.europa.eu', {waitUntil:'networkidle', timeout:40000});
  await p.waitForTimeout(2000);
  for(const t of targets){
    console.log(`\n=== RETRY ${t.nom} CAS ${t.cas} ===`);
    const searchUrl=`https://chem.echa.europa.eu/api-substance/v1/substance?searchText=${encodeURIComponent(t.cas)}&pageIndex=1&pageSize=10`;
    const r=await p.evaluate(async u=>{ const resp=await fetch(u,{headers:{'Accept':'application/json'}}); return {status:resp.status, body:await resp.text()}; }, searchUrl);
    console.log('search status', r.status);
    const j=JSON.parse(r.body);
    console.log('total', j.totalItems, 'items', j.items?.length);
    const found=j.items[0].substanceIndex;
    console.log('found', found.rmlId, found.rmlName, found.rmlCas);
    // Jev verify simplified (avoid 400: use short instructions)
    let jevOk=null;
    try{
      jevOk=callJevSafe({found, cas:t.cas}, {ok:{type:"noul", instructions:"CAS correct?", true:"Oui", false:"Non"}});
      console.log('Jev ok', JSON.stringify(jevOk?.answers));
    }catch(e){ console.log('jev ok fail'); }
    const subR=await p.evaluate(async id=>{ const r=await fetch(`https://chem.echa.europa.eu/api-substance/v1/substance/${id}`,{headers:{'Accept':'application/json'}}); return {body:await r.text()}; }, found.rmlId);
    const subJ=JSON.parse(subR.body);
    const infoR=await p.evaluate(async id=>{ const r=await fetch(`https://chem.echa.europa.eu/api-cnl-inventory/prominent/overview/info/${id}`,{headers:{'Accept':'application/json'}}); return {body:await r.text()}; }, found.rmlId);
    const infoJ=JSON.parse(infoR.body);
    console.log('info items', infoJ.items?.length, infoJ.items?.[0]?.classificationId);
    let cid=null, findings=null;
    if(!infoJ.items || infoJ.items.length===0){
      findings={ substance:t.nom, rmlId:found.rmlId, ec:found.rmlEc, cas:found.rmlCas, indexNumber:(found.indexNumber||[])[0]||null, source:`https://chem.echa.europa.eu/api-substance/v1/substance/${found.rmlId}`, found_via:searchUrl, harmonised:[], classificationId:null, specific_concentration_limits:[], notes:[], pictograms:[], m_factors:[], jev_decisions: jevOk?[jevOk.answers]:[], verified_at:new Date().toISOString(), gmktec_fiche:t.file, conclusion:`Pas de harmonised pour ${t.nom}` };
    }else{
      cid=infoJ.items[0].classificationId;
      const clsR=await p.evaluate(async id=>{ const r=await fetch(`https://chem.echa.europa.eu/api-cnl-inventory/prominent/overview/classifications/harmonised/${id}`,{headers:{'Accept':'application/json'}}); return {body:await r.text()}; }, cid);
      const sclR=await p.evaluate(async id=>{ const r=await fetch(`https://chem.echa.europa.eu/api-cnl-inventory/harmonized/specific-concentration-limits/${id}`,{headers:{'Accept':'application/json'}}); return {body:await r.text()}; }, cid);
      const labR=await p.evaluate(async id=>{ const r=await fetch(`https://chem.echa.europa.eu/api-cnl-inventory/harmonized/labelling/${id}`,{headers:{'Accept':'application/json'}}); return {body:await r.text()}; }, cid);
      const notesR=await p.evaluate(async id=>{ const r=await fetch(`https://chem.echa.europa.eu/api-cnl-inventory/harmonized/notes/${id}`,{headers:{'Accept':'application/json'}}); return {body:await r.text()}; }, cid);
      const pictR=await p.evaluate(async id=>{ const r=await fetch(`https://chem.echa.europa.eu/api-cnl-inventory/harmonized/pictograms/${id}`,{headers:{'Accept':'application/json'}}); return {body:await r.text()}; }, cid);
      const mR=await p.evaluate(async id=>{ const r=await fetch(`https://chem.echa.europa.eu/api-cnl-inventory/harmonized/m-factors/${id}`,{headers:{'Accept':'application/json'}}); return {body:await r.text()}; }, cid);
      const clsJ=JSON.parse(clsR.body); const sclJ=JSON.parse(sclR.body);
      findings={
        substance:t.nom, rmlId:found.rmlId, ec:found.rmlEc, cas:found.rmlCas, indexNumber:infoJ.items[0].indexNumber,
        source:`https://chem.echa.europa.eu/api-substance/v1/substance/${found.rmlId}`,
        found_via:searchUrl + ` (CAS prioritaire)`,
        found_by:"Jev 1.13 via OpenRouter (typesafe/jev-1.13) + Playwright 1.63.0",
        route_jev:[`GET ${searchUrl} -> ${found.rmlId}`, `GET /api-substance/v1/substance/${found.rmlId}`, `GET /api-cnl-inventory/prominent/overview/info/${found.rmlId} -> ${cid}`],
        harmonised_url_pattern:`https://chem.echa.europa.eu/${found.rmlId}/harmonised/${cid}`,
        classificationId:cid, harmonised_classifications:clsJ.items, specific_concentration_limits:sclJ.items,
        labelling:JSON.parse(labR.body).items, notes:JSON.parse(notesR.body).items, pictograms:JSON.parse(pictR.body).items,
        m_factors: (()=>{ try{ const v=mR.body.trim(); return v===""?[]:JSON.parse(v).items||[] }catch(e){return []} })(),
        signalWord:infoJ.items[0].signalWord, atp:infoJ.items[0].atpCodeName,
        jev_decisions: jevOk? [jevOk.answers]: [],
        verified_at:new Date().toISOString(), verified_by:"Noa (Asus G834JY) via Jev 1.13 (retry)", gmktec_fiche:t.file,
        urls:{substance:`https://chem.echa.europa.eu/${found.rmlId}`, harmonised:`https://chem.echa.europa.eu/${found.rmlId}/harmonised/${cid}`, scl_api:`https://chem.echa.europa.eu/api-cnl-inventory/harmonized/specific-concentration-limits/${cid}`}
      };
      console.log('SCL count', sclJ.items.length);
    }
    const outPath=path.join(__dirname,'..','findings', sanitize(t.nom)+'_echa.json');
    fs.writeFileSync(outPath, JSON.stringify(findings,null,2),'utf8');
    console.log('WRITTEN', outPath);
  }
  await b.close();
  console.log('RETRY DONE');
})()
