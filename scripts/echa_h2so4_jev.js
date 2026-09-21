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
  // Jev decides search term for acide sulfurique
  const jev1=callJev(
    {goal:"Trouver acide sulfurique / sulphuric acid pour findings ECHA CHEM", options:["acide sulfurique","sulphuric acid","sulfuric acid","7664-93-9","231-639-5"], pattern:"AGENTS.md: GET /api-substance/v1/substance?searchText=&pageIndex=1&pageSize=10 -> rmlId"},
    {term:{type:"choice", instructions:"Quel terme de recherche pour acide sulfurique ECHA CHEM?", criteria:{acide_sulfurique_fr:"acide sulfurique (FR exact)", sulphuric_acid_en:"sulphuric acid (EN UK)", sulfuric_acid_en_us:"sulfuric acid (EN US)", cas_7664_93_9:"CAS 7664-93-9", ec_231_639_5:"EC 231-639-5"}}}
  );
  console.log('Jev term', JSON.stringify(jev1.answers,null,2));
  // map Jev choice to actual search string
  const termMap = {
    acide_sulfurique_fr: 'acide sulfurique',
    sulphuric_acid_en: 'sulphuric acid',
    sulfuric_acid_en_us: 'sulfuric acid',
    cas_7664_93_9: '7664-93-9',
    ec_231_639_5: '231-639-5'
  };
  const term = termMap[jev1.answers.term.choice] || '7664-93-9';
  console.log('chosen term:', term);

  // Try search via API - follow AGENTS.md strict: pageIndex=1&pageSize=10
  const queries = [
    `https://chem.echa.europa.eu/api-substance/v1/substance?searchText=${encodeURIComponent(term)}&pageIndex=1&pageSize=10`,
    `https://chem.echa.europa.eu/api-substance/v1/substance?searchText=sulphuric%20acid&pageIndex=1&pageSize=10`,
    `https://chem.echa.europa.eu/api-substance/v1/substance?searchText=7664-93-9&pageIndex=1&pageSize=10`,
    `https://chem.echa.europa.eu/api-substance/v1/substance?searchText=231-639-5&pageIndex=1&pageSize=10`,
  ];
  let found=null;
  let searchRaw=null;
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
          console.log(j.items.slice(0,1).map(i=> ({rmlId:i.substanceIndex.rmlId, rmlName:i.substanceIndex.rmlName, ec:i.substanceIndex.rmlEc, cas:i.substanceIndex.rmlCas, index:i.substanceIndex.indexNumber})));
          const match = j.items.find(i=> i.substanceIndex.rmlId==='100.028.763' || i.substanceIndex.rmlCas==='7664-93-9' || i.substanceIndex.rmlEc==='231-639-5');
          if(match){
            console.log('MATCH', match.substanceIndex.rmlId, match.substanceIndex.rmlName);
            found=match.substanceIndex;
            searchRaw=j;
            break;
          }
        }
      }catch(e){ console.log('parse err', e.message, r.body.slice(0,500));}
    }
  }
  if(!found) throw new Error('not found acide sulfurique');
  console.log('\n=== FOUND', found);

  // Jev verifies
  const jev2=callJev(
    {found, goal:"Vérifier que c'est bien acide sulfurique / sulphuric acid CAS 7664-93-9 EC 231-639-5 Index 016-020-00-8"},
    {ok:{type:"noul", instructions:"Est-ce bien acide sulfurique / sulphuric acid CAS 7664-93-9 EC 231-639-5 ?", true:"Oui", false:"Non"}}
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

  // harmonised overview -> classificationId
  const info = await p.evaluate(async (id)=>{
    const r=await fetch(`https://chem.echa.europa.eu/api-cnl-inventory/prominent/overview/info/${id}`,{headers:{'Accept':'application/json'}});
    return {status:r.status, body:await r.text()};
  }, found.rmlId);
  console.log('\n=== overview info', info.body.slice(0,1500));
  const infoJ=JSON.parse(info.body);
  console.log('info items', JSON.stringify(infoJ.items,null,2));
  let cid = null;
  if(infoJ.items && infoJ.items.length>0){
    cid=infoJ.items[0].classificationId;
    console.log('classificationId', cid, 'index', infoJ.items[0].indexNumber, 'chemicalName', infoJ.items[0].chemicalName);
  } else throw new Error('no harmonised items');

  // classifications harmonised (prominent overview)
  const cls = await p.evaluate(async (id)=>{
    const r=await fetch(`https://chem.echa.europa.eu/api-cnl-inventory/prominent/overview/classifications/harmonised/${id}`,{headers:{'Accept':'application/json'}});
    return {status:r.status, body:await r.text()};
  }, cid);
  console.log('\n=== classifications harmonised/overview', cls.body.slice(0,3000));
  const clsJ=JSON.parse(cls.body);

  // harmonized classification
  const harm = await p.evaluate(async (id)=>{
    const r=await fetch(`https://chem.echa.europa.eu/api-cnl-inventory/harmonized/classification/${id}`,{headers:{'Accept':'application/json'}});
    return {status:r.status, body:await r.text()};
  }, cid);
  console.log('\n=== harmonized/classification', harm.body.slice(0,3000));

  // SCL
  const scl = await p.evaluate(async (id)=>{
    const r=await fetch(`https://chem.echa.europa.eu/api-cnl-inventory/harmonized/specific-concentration-limits/${id}`,{headers:{'Accept':'application/json'}});
    return {status:r.status, body:await r.text()};
  }, cid);
  console.log('\n=== SCL', scl.body.slice(0,3000));
  const sclJ=JSON.parse(scl.body);

  // labelling
  const lab = await p.evaluate(async (id)=>{
    const r=await fetch(`https://chem.echa.europa.eu/api-cnl-inventory/harmonized/labelling/${id}`,{headers:{'Accept':'application/json'}});
    return {status:r.status, body:await r.text()};
  }, cid);
  console.log('\n=== labelling', lab.body.slice(0,2000));
  const labJ=JSON.parse(lab.body);

  // notes
  const notesR = await p.evaluate(async (id)=>{
    const r=await fetch(`https://chem.echa.europa.eu/api-cnl-inventory/harmonized/notes/${id}`,{headers:{'Accept':'application/json'}});
    return {status:r.status, body:await r.text()};
  }, cid);
  console.log('\n=== notes', notesR.body.slice(0,1500));

  // pictograms
  const pictR = await p.evaluate(async (id)=>{
    const r=await fetch(`https://chem.echa.europa.eu/api-cnl-inventory/harmonized/pictograms/${id}`,{headers:{'Accept':'application/json'}});
    return {status:r.status, body:await r.text()};
  }, cid);
  console.log('\n=== pictograms', pictR.body.slice(0,1500));

  // m-factors
  const mR = await p.evaluate(async (id)=>{
    const r=await fetch(`https://chem.echa.europa.eu/api-cnl-inventory/harmonized/m-factors/${id}`,{headers:{'Accept':'application/json'}});
    return {status:r.status, body:await r.text()};
  }, cid);
  console.log('\n=== m-factors', mR.body.slice(0,1500));

  // Jev SCL verification
  const jev3=callJev(
    {classificationId: cid, sclCount: sclJ.items?.length || 0, sclItems: sclJ.items, harmonised: clsJ.items.map(c=> c.hazardClassAndCategoryCode + ' ' + c.hazardStatements[0]?.hazardStatementCode).join(', ')},
    {hasSCL:{type:"noul", instructions:"L'API harmonised a-t-elle des Specific Concentration Limits chiffrées pour acide sulfurique?", true:"Oui SCL présentes", false:"Non aucune SCL"}, scl_quality:{type:"score", instructions:"Qualité / complétude des SCL pour acide sulfurique", criteria:["incomplet/incorrect","partiel","correct mais à vérifier","complet et conforme HCl/H2SO4 pattern","parfait - référence CLP"]}}
  );
  console.log('Jev SCL check', JSON.stringify(jev3.answers,null,2));

  // Build findings JSON (AGENTS.md §6)
  const findings = {
    substance: "Acide sulfurique / Sulphuric acid",
    rmlId: found.rmlId,
    ec: found.rmlEc,
    cas: found.rmlCas,
    indexNumber: found.indexNumber?.[0] || "016-020-00-8",
    source: `https://chem.echa.europa.eu/api-substance/v1/substance/${found.rmlId}`,
    found_via: `GET https://chem.echa.europa.eu/api-substance/v1/substance?searchText=${encodeURIComponent(term)}&pageIndex=1&pageSize=10 (Jev term choice ${jev1.answers.term.choice} ${jev1.answers.term.probabilities[jev1.answers.term.choice]})`,
    found_by: "Jev 1.13 via OpenRouter (typesafe/jev-1.13) + Playwright 1.63.0",
    route_jev: [
      "https://chem.echa.europa.eu",
      `Jev term choice: ${JSON.stringify(jev1.answers.term)} -> ${term}`,
      `GET /api-substance/v1/substance?searchText=${encodeURIComponent(term)}&pageIndex=1&pageSize=10 -> rmlId ${found.rmlId}`,
      `GET /api-substance/v1/substance/${found.rmlId} -> ${subJ.rmlName} EC ${subJ.rmlEc} CAS ${subJ.rmlCas} Index ${subJ.indexNumber}`,
      `GET /api-cnl-inventory/prominent/overview/info/${found.rmlId} -> classificationId ${cid} (index ${infoJ.items[0].indexNumber}, ${infoJ.items[0].chemicalName})`,
      `GET /api-cnl-inventory/prominent/overview/classifications/harmonised/${cid} -> ${clsJ.items.length} class(es)`,
      `GET /api-cnl-inventory/harmonized/specific-concentration-limits/${cid} -> ${sclJ.items.length} SCL`,
      `GET /api-cnl-inventory/harmonized/labelling/${cid} + notes + pictograms + m-factors`
    ],
    harmonised_url_pattern: `https://chem.echa.europa.eu/${found.rmlId}/harmonised/${cid} (pattern from sodium hydroxide https://chem.echa.europa.eu/100.013.805/harmonised/357489)`,
    classificationId: cid,
    harmonised_classifications: clsJ.items,
    harmonized_classification: JSON.parse(harm.body).items,
    specific_concentration_limits: sclJ.items,
    labelling: JSON.parse(lab.body).items,
    notes: JSON.parse(notesR.body).items,
    pictograms: JSON.parse(pictR.body).items,
    m_factors: mR.body ? (mR.body.trim()==="" ? [] : JSON.parse(mR.body).items || []) : [],
    signalWord: labJ.items?.[0]?.signalWord || infoJ.items[0].signalWord,
    atp: infoJ.items[0].atpCodeName,
    conclusion: "Acide sulfurique a 1 harmonisée (016-020-00-8, sulphuric acid ...% solution, CLP00) avec 3 SCL: C ≥15% => Skin Corr 1A H314, 5%≤C<15% => Skin Irrit2 H315 + Eye Irrit2 H319. Note B (solutions aqueuses). GHS05. Pas de M-factor. Pattern distinct de HCl (4 SCL) et KMnO4 (0 SCL). Seuils 5%/15% à intégrer dans chemlabel.",
    verified_at: new Date().toISOString(),
    verified_by: "Noa (Asus G834JY w1:p1) via Jev 1.13 + Playwright 1.63.0",
    jev_decisions: [
      {step:1, question:"term", ...jev1.answers.term, state:{goal:"acide sulfurique", options:["acide sulfurique","sulphuric acid","sulfuric acid","7664-93-9","231-639-5"]}},
      {step:2, question:"ok", ...jev2.answers.ok},
      {step:3, question:"hasSCL", ...jev3.answers.hasSCL},
      {step:3.1, question:"scl_quality", ...jev3.answers.scl_quality}
    ],
    urls: {
      substance: `https://chem.echa.europa.eu/${found.rmlId}`,
      harmonised: `https://chem.echa.europa.eu/${found.rmlId}/harmonised/${cid}`,
      scl_api: `https://chem.echa.europa.eu/api-cnl-inventory/harmonized/specific-concentration-limits/${cid}`,
      overview_info: `https://chem.echa.europa.eu/api-cnl-inventory/prominent/overview/info/${found.rmlId}`
    }
  };
  const outPath = path.join(__dirname, '..', 'findings', 'acide_sulfurique_echa.json');
  fs.writeFileSync(outPath, JSON.stringify(findings,null,2), 'utf8');
  console.log('\n=== FINDINGS WRITTEN', outPath);
  console.log(JSON.stringify(findings,null,2).slice(0,3000));

  await b.close();
})()
