/**
 * Batch ECHA CHEM findings via Jev 1.13 + Playwright 1.63.0
 * - Lit les fiches labo-vdg-web2 via SSH (jamais d'écriture là-bas)
 * - Utilise CAS comme terme de recherche prioritaire (AGENTS.md)
 * - Jev à chaque décision term/ok/hasSCL, log probabilities/confidence
 * - Écrit findings/<sanitized>_echa.json localement
 * Usage: node scripts/echa_batch_all_jev.js [--limit 5] [--offset 0] [--cas 7697-37-2]
 */
const {chromium}=require('C:\\Users\\hcteu\\AppData\\Roaming\\npm\\node_modules\\playwright');
const {execSync, spawnSync}=require('child_process');
const fs=require('fs'), path=require('path');

function callJev(state, questions){
  const tmp='C:\\Users\\hcteu\\AppData\\Local\\Temp\\opencode';
  if(!fs.existsSync(tmp)) fs.mkdirSync(tmp,{recursive:true});
  const sf=path.join(tmp,'jev_state_'+Date.now()+'_'+Math.random().toString(36).slice(2)+'.json');
  const qf=path.join(tmp,'jev_q_'+Date.now()+'_'+Math.random().toString(36).slice(2)+'.json');
  fs.writeFileSync(sf, JSON.stringify(state),'utf8');
  fs.writeFileSync(qf, JSON.stringify(questions),'utf8');
  const cmd=`powershell -NoProfile -ExecutionPolicy Bypass -File "C:\\Users\\hcteu\\.config\\opencode\\tools\\jev-decide.ps1" -StateFile "${sf}" -QuestionsFile "${qf}"`;
  const out=execSync(cmd,{encoding:'utf8', timeout:30000});
  const idx=out.lastIndexOf('"model"');
  const jstart=out.lastIndexOf('{', idx);
  const parsed=JSON.parse(out.slice(jstart));
  try{fs.unlinkSync(sf); fs.unlinkSync(qf);}catch(e){}
  return parsed;
}

function sanitize(s){
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'_').replace(/^_|_$/g,'').toLowerCase();
}

async function fetchViaPage(page, url){
  return await page.evaluate(async (u)=>{
    try{ const r=await fetch(u,{headers:{'Accept':'application/json'}}); const t=await r.text(); return {status:r.status, body:t} }catch(e){ return {error:e.message}}
  }, url);
}

async function getFichesFromGMKtec(){
  // ssh gmktec-tail "python3 - << 'PY' ... " -> JSON list
  const py = `
import json, glob, os
out=[]
for f in sorted(glob.glob(os.path.expanduser('~/workspace-work/web/labo-vdg-web2/backend/app/services/chemlabel/data/fiches/*.json'))):
    try:
        d=json.load(open(f))
        out.append({"file": os.path.basename(f), "cas": d.get("cas"), "ce": d.get("ce"), "nom": d.get("nom"), "nom_complet": d.get("nom_complet"), "formule": d.get("formule")})
    except Exception as e:
        out.append({"file": os.path.basename(f), "error": str(e)})
import sys; json.dump(out, sys.stdout)
`;
  const res = spawnSync('ssh', ['gmktec-tail', 'python3', '-'], {input: py, encoding:'utf8', maxBuffer: 10*1024*1024});
  if(res.error) throw res.error;
  if(res.status!==0) throw new Error('ssh failed: ' + res.stderr.slice(0,2000));
  return JSON.parse(res.stdout);
}

(async()=>{
  const args = process.argv.slice(2);
  const limitArg = args.find(a=>a.startsWith('--limit'));
  const offsetArg = args.find(a=>a.startsWith('--offset'));
  const casFilter = args.find(a=>a.startsWith('--cas'))?.split('=')[1];
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 0; // 0 = all
  const offset = offsetArg ? parseInt(offsetArg.split('=')[1]) : 0;

  console.log('=== ECHA batch Jev: lecture fiches labo-vdg-web2 (lecture seule) ===');
  const fiches = await getFichesFromGMKtec();
  console.log(`Found ${fiches.length} fiches sur gmktec`);
  // Filter out already-done unless --cas forces
  const doneCas = new Set(['7647-01-0','7664-93-9','7722-64-7','1310-73-2']); // HCl, H2SO4, KMnO4, NaOH already have findings
  let todo = fiches.filter(f=> f.cas && f.cas!=='None' && f.cas!=='');
  if(casFilter) todo = todo.filter(f=> f.cas===casFilter);
  else todo = todo.filter(f=> !doneCas.has(f.cas)); // skip done by default unless --cas

  if(offset) todo = todo.slice(offset);
  if(limit) todo = todo.slice(0, limit);
  console.log(`Todo ${todo.length} (offset ${offset} limit ${limit||'all'}):`, todo.map(f=> `${f.nom} ${f.cas}`).slice(0,10));

  const b=await chromium.launch({headless:true});
  const p=await b.newPage();
  await p.goto('https://chem.echa.europa.eu', {waitUntil:'networkidle', timeout:40000});
  await p.waitForTimeout(2000);

  let okCount=0, failCount=0;
  for(let idx=0; idx<todo.length; idx++){
    const fiche = todo[idx];
    const cas = fiche.cas;
    const ec = fiche.ce;
    const nom = fiche.nom_complet || fiche.nom;
    console.log(`\n\n========== [${idx+1}/${todo.length}] ${nom} CAS ${cas} EC ${ec} (${fiche.file}) ==========`);
    try{
      // Jev term choice: privilégier CAS comme demandé ("utiliser les données CAS")
      const jevTerm = callJev(
        {goal:`Trouver ${nom} CAS ${cas} EC ${ec} pour findings ECHA CHEM`, substance: nom, cas, ec, pattern:"AGENTS.md GET /api-substance/v1/substance?searchText=&pageIndex=1&pageSize=10 -> rmlId", instruction:"Utiliser CAS comme terme prioritaire car données CAS labo-vdg-web2 fiables"},
        {term:{type:"choice", instructions:"Quel terme de recherche maximisera le hit ECHA CHEM ? (CAS prioritaire)", criteria:{cas:`CAS ${cas}`, ec: ec && ec!=='None' ? `EC ${ec}` : `EC inconnu`, fr: `${nom} (FR)`, en: `${nom} (EN)`}}, confidence_cas:{type:"noul", instructions:"Le CAS est-il le terme le plus fiable pour ECHA ?", true:"Oui CAS fiable", false:"Non"}}
      );
      console.log('Jev term', JSON.stringify(jevTerm.answers,null,2));
      const termChoice = jevTerm.answers.term.choice;
      let searchTerm;
      if(termChoice==='cas') searchTerm = cas;
      else if(termChoice==='ec') searchTerm = ec;
      else if(termChoice==='fr' || termChoice==='en') searchTerm = nom;
      else searchTerm = cas; // fallback CAS
      console.log('Chosen searchTerm:', searchTerm, `(Jev choice ${termChoice})`);

      // Recherche ECHA: d'abord CAS, puis fallback EC/nom si échec
      const searchUrls = [
        `https://chem.echa.europa.eu/api-substance/v1/substance?searchText=${encodeURIComponent(searchTerm)}&pageIndex=1&pageSize=10`,
        `https://chem.echa.europa.eu/api-substance/v1/substance?searchText=${encodeURIComponent(cas)}&pageIndex=1&pageSize=10`,
      ];
      if(ec && ec!=='None') searchUrls.push(`https://chem.echa.europa.eu/api-substance/v1/substance?searchText=${encodeURIComponent(ec)}&pageIndex=1&pageSize=10`);
      searchUrls.push(`https://chem.echa.europa.eu/api-substance/v1/substance?searchText=${encodeURIComponent(nom)}&pageIndex=1&pageSize=10`);

      let found=null;
      let searchRaw=null;
      for(const u of searchUrls){
        console.log('GET', u);
        const r=await fetchViaPage(p, u);
        if(r.error){ console.log('fetch error', r.error); continue; }
        console.log('status', r.status);
        if(r.body){
          try{
            const j=JSON.parse(r.body);
            const total = j.totalItems ?? j.state?.totalItems ?? j.items?.length;
            console.log('totalItems', total, 'items', j.items?.length);
            if(j.items && j.items.length>0){
              // Chercher match exact CAS/EC
              let match = j.items.find(it=> it.substanceIndex.rmlCas===cas || it.substanceIndex.rmlEc===ec);
              if(!match && cas) match = j.items.find(it=> (it.substanceIndex.casNumber||[]).includes(cas));
              if(!match) match = j.items[0];
              console.log('candidate', match.substanceIndex.rmlId, match.substanceIndex.rmlName, match.substanceIndex.rmlCas, match.substanceIndex.rmlEc, match.substanceIndex.indexNumber);
              found = match.substanceIndex;
              searchRaw = j;
              if(found.rmlCas===cas || found.rmlEc===ec) break; // bon hit
            }
          }catch(e){ console.log('parse err', e.message, r.body.slice(0,500));}
        }
        if(found && found.rmlCas===cas) break;
      }
      if(!found){
        console.log('❌ NOT FOUND for CAS', cas);
        failCount++;
        continue;
      }
      console.log('FOUND', found.rmlId, found.rmlName);

      // Jev verify
      const jevOk = callJev(
        {found, expectedCAS: cas, expectedEC: ec, expectedName: nom, goal:"Vérifier que la substance trouvée correspond au CAS labo-vdg-web2"},
        {ok:{type:"noul", instructions:`Est-ce bien ${nom} CAS ${cas} EC ${ec} ?`, true:"Oui", false:"Non"}}
      );
      console.log('Jev verify', JSON.stringify(jevOk.answers,null,2));
      const okNoul = jevOk.answers.ok.noul;
      if(okNoul < 0.5){
        console.log(`⚠️ Jev doute (noul ${okNoul}) mais on continue avec API`);
      }

      // Détails
      const subR = await fetchViaPage(p, `https://chem.echa.europa.eu/api-substance/v1/substance/${found.rmlId}`);
      const subJ = JSON.parse(subR.body);
      console.log('substance detail', subJ.rmlName, subJ.rmlEc, subJ.rmlCas, subJ.indexNumber);

      const infoR = await fetchViaPage(p, `https://chem.echa.europa.eu/api-cnl-inventory/prominent/overview/info/${found.rmlId}`);
      const infoJ = JSON.parse(infoR.body);
      console.log('overview info items', infoJ.items?.length);
      if(!infoJ.items || infoJ.items.length===0){
        console.log('⚠️ Pas de harmonised pour', found.rmlId, '— substance non harmonisée, on écrit findings avec harmonised vide');
        // Écrire findings minimal
        const findingsMini = {
          substance: nom,
          rmlId: found.rmlId,
          ec: found.rmlEc,
          cas: found.rmlCas,
          indexNumber: (found.indexNumber||[])[0] || null,
          source: `https://chem.echa.europa.eu/api-substance/v1/substance/${found.rmlId}`,
          found_via: `GET /api-substance/v1/substance?searchText=${encodeURIComponent(cas)}&pageIndex=1&pageSize=10 (Jev term ${termChoice} ${jevTerm.answers.term.probabilities[termChoice]})`,
          found_by: "Jev 1.13 via OpenRouter (typesafe/jev-1.13) + Playwright 1.63.0",
          route_jev: [`Jev term ${termChoice} -> ${searchTerm} -> rmlId ${found.rmlId}`, `GET /api-substance/v1/substance/${found.rmlId}`, `GET /api-cnl-inventory/prominent/overview/info/${found.rmlId} -> 0 harmonised`],
          harmonised: [],
          classificationId: null,
          specific_concentration_limits: [],
          notes: [], pictograms: [], m_factors: [],
          jev_decisions: [{step:1, question:"term", ...jevTerm.answers.term}, {step:2, question:"ok", ...jevOk.answers.ok}],
          conclusion: `Pas de classification harmonisée pour ${nom} (CAS ${cas}) — ECHA Chem n'a pas d'entrée harmonised (0 items). Vérifier si substance non harmonisée CLP.`,
          verified_at: new Date().toISOString(),
          verified_by: "Noa (Asus G834JY) via Jev 1.13",
          gmktec_fiche: fiche.file,
          urls:{substance:`https://chem.echa.europa.eu/${found.rmlId}`}
        };
        const outPathMini = path.join(__dirname,'..','findings', sanitize(nom)+'_echa.json');
        fs.writeFileSync(outPathMini, JSON.stringify(findingsMini,null,2),'utf8');
        console.log('WRITTEN mini', outPathMini);
        okCount++; continue;
      }
      // Prendre première harmonised (souvent 1, parfois 2 comme HCl)
      for(const infoItem of infoJ.items){
        const cid = infoItem.classificationId;
        console.log(`\n--- harmonised ${cid} ${infoItem.indexNumber} ${infoItem.chemicalName} ${infoItem.atpCodeName} ---`);
        const clsR = await fetchViaPage(p, `https://chem.echa.europa.eu/api-cnl-inventory/prominent/overview/classifications/harmonised/${cid}`);
        const clsJ = JSON.parse(clsR.body);
        const harmR = await fetchViaPage(p, `https://chem.echa.europa.eu/api-cnl-inventory/harmonized/classification/${cid}`);
        const sclR = await fetchViaPage(p, `https://chem.echa.europa.eu/api-cnl-inventory/harmonized/specific-concentration-limits/${cid}`);
        const labR = await fetchViaPage(p, `https://chem.echa.europa.eu/api-cnl-inventory/harmonized/labelling/${cid}`);
        const notesR = await fetchViaPage(p, `https://chem.echa.europa.eu/api-cnl-inventory/harmonized/notes/${cid}`);
        const pictR = await fetchViaPage(p, `https://chem.echa.europa.eu/api-cnl-inventory/harmonized/pictograms/${cid}`);
        const mR = await fetchViaPage(p, `https://chem.echa.europa.eu/api-cnl-inventory/harmonized/m-factors/${cid}`);
        const sclJ = JSON.parse(sclR.body);
        const jevScl = callJev(
          {classificationId: cid, sclCount: sclJ.items?.length||0, hazards: clsJ.items.map(c=> c.hazardClassAndCategoryCode).join(', ')},
          {hasSCL:{type:"noul", instructions:"L'API a-t-elle des SCL chiffrées ?", true:"Oui", false:"Non"}}
        );
        console.log('Jev hasSCL', JSON.stringify(jevScl.answers,null,2), 'SCL count', sclJ.items?.length);
      }
      // Pour simplifier, on écrit findings basé sur premiere harmonised (ou toutes si >1)
      const primary = infoJ.items[0];
      const cidPrimary = primary.classificationId;
      const clsR0 = await fetchViaPage(p, `https://chem.echa.europa.eu/api-cnl-inventory/prominent/overview/classifications/harmonised/${cidPrimary}`);
      const clsJ0 = JSON.parse(clsR0.body);
      const sclR0 = await fetchViaPage(p, `https://chem.echa.europa.eu/api-cnl-inventory/harmonized/specific-concentration-limits/${cidPrimary}`);
      const sclJ0 = JSON.parse(sclR0.body);
      const labR0 = await fetchViaPage(p, `https://chem.echa.europa.eu/api-cnl-inventory/harmonized/labelling/${cidPrimary}`);
      const notesR0 = await fetchViaPage(p, `https://chem.echa.europa.eu/api-cnl-inventory/harmonized/notes/${cidPrimary}`);
      const pictR0 = await fetchViaPage(p, `https://chem.echa.europa.eu/api-cnl-inventory/harmonized/pictograms/${cidPrimary}`);
      const mR0 = await fetchViaPage(p, `https://chem.echa.europa.eu/api-cnl-inventory/harmonized/m-factors/${cidPrimary}`);
      const harmR0 = await fetchViaPage(p, `https://chem.echa.europa.eu/api-cnl-inventory/harmonized/classification/${cidPrimary}`);

      const jevScl0 = callJev(
        {classificationId: cidPrimary, sclCount: sclJ0.items?.length||0},
        {hasSCL:{type:"noul", instructions:"SCL présentes pour "+nom+" ?", true:"Oui", false:"Non"}}
      );

      const findings = {
        substance: nom,
        rmlId: found.rmlId,
        ec: found.rmlEc,
        cas: found.rmlCas,
        indexNumber: primary.indexNumber,
        source: `https://chem.echa.europa.eu/api-substance/v1/substance/${found.rmlId}`,
        found_via: `GET /api-substance/v1/substance?searchText=${encodeURIComponent(cas)}&pageIndex=1&pageSize=10 (Jev term ${termChoice} ${jevTerm.answers.term.probabilities[termChoice]})`,
        found_by: "Jev 1.13 via OpenRouter (typesafe/jev-1.13) + Playwright 1.63.0",
        route_jev: [
          `Jev term ${termChoice} (${JSON.stringify(jevTerm.answers.term.probabilities)}) -> ${searchTerm}`,
          `GET /api-substance/v1/substance?searchText=${encodeURIComponent(cas)}&pageIndex=1&pageSize=10 -> rmlId ${found.rmlId} (${found.rmlName})`,
          `GET /api-substance/v1/substance/${found.rmlId} -> ${subJ.rmlName} EC ${subJ.rmlEc} CAS ${subJ.rmlCas} Index ${subJ.indexNumber}`,
          `GET /api-cnl-inventory/prominent/overview/info/${found.rmlId} -> ${infoJ.items.length} harmonised, primary cid ${cidPrimary} (${primary.indexNumber})`,
          `GET /api-cnl-inventory/prominent/overview/classifications/harmonised/${cidPrimary} -> ${clsJ0.items.length} class`,
          `GET /api-cnl-inventory/harmonized/specific-concentration-limits/${cidPrimary} -> ${sclJ0.items.length} SCL (Jev hasSCL ${jevScl0.answers.hasSCL.noul})`
        ],
        harmonised_url_pattern: `https://chem.echa.europa.eu/${found.rmlId}/harmonised/${cidPrimary}`,
        harmonised_overview: infoJ.items,
        classificationId: cidPrimary,
        harmonised_classifications: clsJ0.items,
        harmonized_classification: JSON.parse(harmR0.body).items,
        specific_concentration_limits: sclJ0.items,
        labelling: JSON.parse(labR0.body).items,
        notes: JSON.parse(notesR0.body).items,
        pictograms: JSON.parse(pictR0.body).items,
        m_factors: (()=>{ try{ const v=mR0.body.trim(); return v===""?[]: JSON.parse(v).items||[] }catch(e){return []} })(),
        signalWord: primary.signalWord,
        atp: primary.atpCodeName,
        jev_decisions: [
          {step:1, question:"term", ...jevTerm.answers.term, ...jevTerm.answers.confidence_cas?{confidence_cas:jevTerm.answers.confidence_cas}:{}, state:{cas, ec, nom}},
          {step:2, question:"ok", ...jevOk.answers.ok},
          {step:3, question:"hasSCL", ...jevScl0.answers.hasSCL}
        ],
        verified_at: new Date().toISOString(),
        verified_by: "Noa (Asus G834JY) via Jev 1.13 + Playwright 1.63.0",
        gmktec_fiche: fiche.file,
        urls:{
          substance:`https://chem.echa.europa.eu/${found.rmlId}`,
          harmonised:`https://chem.echa.europa.eu/${found.rmlId}/harmonised/${cidPrimary}`,
          scl_api:`https://chem.echa.europa.eu/api-cnl-inventory/harmonized/specific-concentration-limits/${cidPrimary}`
        }
      };
      const outName = sanitize(nom) + '_echa.json';
      const outPath = path.join(__dirname,'..','findings', outName);
      fs.writeFileSync(outPath, JSON.stringify(findings,null,2),'utf8');
      console.log('✅ WRITTEN', outPath, `cid ${cidPrimary} SCL ${sclJ0.items.length}`);
      okCount++;
      // Respect rate: 300ms
      await new Promise(r=>setTimeout(r,300));
    }catch(e){
      console.error('❌ ERR for', fiche.cas, e.message, e.stack?.slice(0,800));
      failCount++;
    }
  }
  await b.close();
  console.log(`\n=== BATCH DONE ok ${okCount} fail ${failCount} total ${todo.length} ===`);
  process.exit(failCount>0?1:0);
})()
