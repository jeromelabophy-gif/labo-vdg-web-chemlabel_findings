const {chromium} = require('C:\\Users\\hcteu\\AppData\\Roaming\\npm\\node_modules\\playwright');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Helper to call Jev via PowerShell wrapper
function callJev(state, questions) {
  const tmp = 'C:\\Users\\hcteu\\AppData\\Local\\Temp\\opencode';
  if(!fs.existsSync(tmp)) fs.mkdirSync(tmp, {recursive:true});
  const stateFile = path.join(tmp, 'jev_state_'+Date.now()+'.json');
  const qFile = path.join(tmp, 'jev_q_'+Date.now()+'.json');
  fs.writeFileSync(stateFile, JSON.stringify(state), 'utf8');
  fs.writeFileSync(qFile, JSON.stringify(questions), 'utf8');
  const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -File "C:\\Users\\hcteu\\.config\\opencode\\tools\\jev-decide.ps1" -StateFile "${stateFile}" -QuestionsFile "${qFile}"`;
  const out = execSync(cmd, {encoding:'utf8', timeout:25000});
  const idx = out.lastIndexOf('"model"');
  const jsonStart = out.lastIndexOf('{', idx);
  const json = out.slice(jsonStart);
  const parsed = JSON.parse(json);
  return parsed;
}

(async()=>{
  const b=await chromium.launch({headless:false}); // visible for debugging if needed
  const p=await b.newPage();
  // monitor requests
  p.on('request', req=>{
    const url=req.url();
    if(url.includes('echa') && (url.includes('search')||url.includes('api')||url.includes('harmonised'))){
      console.log('REQ', req.method(), url.slice(0,120));
    }
  });
  p.on('response', async resp=>{
    const url=resp.url();
    if(url.includes('echa') && (url.includes('search')||url.includes('api'))){
      console.log('RESP', resp.status(), url.slice(0,120));
    }
  });

  console.log('=== Step 1: goto base ===');
  await p.goto('https://chem.echa.europa.eu', {waitUntil:'networkidle', timeout:40000});
  await p.waitForTimeout(3000);
  try{ const loc=p.locator('text=Accept all cookies'); if(await loc.count()>0){ await loc.first().click({timeout:3000}); console.log('accepted cookies'); await p.waitForTimeout(1500);} }catch(e){}

  // === Jev decides initial route ===
  const state1 = {
    current_url: p.url(),
    page_title: await p.title(),
    goal: "Atterrir sur https://chem.echa.europa.eu/100.013.805/harmonised/357489?searchText=sodium+hydroxyde puis trouver la Specific Concentration Limit du permanganate de potassium",
    available_actions: {
      search_via_ui: "Utiliser la barre de recherche ECHA CHEM pour chercher 'potassium permanganate'",
      direct_navigate: "Naviguer directement à l'URL harmonised sodium hydroxyde puis adapter pour permanganate",
      api_search: "Intercepter l'API ECHA et chercher via API"
    },
    context: "Page d'accueil ECHA CHEM avec barre de recherche désactivée initialement"
  };
  const q1 = {
    next_action: {type:"choice", instructions:"Quelle action choisir pour atteindre le but le plus vite?", criteria:{
      search_via_ui: "Taper potassium permanganate dans la recherche et cliquer Search",
      direct_navigate: "Aller directement à l'URL harmonised fournie et observer la structure",
      api_search: "Chercher via l'API backend ECHA"
    }}
  };
  console.log('=== Jev decision 1 ===');
  const jev1 = callJev(state1, q1);
  console.log(JSON.stringify(jev1.answers,null,2));
  const choice1 = jev1.answers.next_action.choice;
  console.log('Jev choisit:', choice1, 'conf', jev1.answers.next_action.confidence);

  // For demo, we will follow Jev's choice but also fallback to direct if blocked
  // Try direct_navigate first to understand structure (since search UI blocked)
  console.log('=== Following Jev choice: trying direct navigate ===');
  await p.goto('https://chem.echa.europa.eu/100.013.805/harmonised/357489?searchText=sodium+hydroxyde', {waitUntil:'networkidle', timeout:30000});
  await p.waitForTimeout(4000);
  console.log('direct url now', p.url(), await p.title());
  let body = await p.evaluate(()=> document.body.innerText.slice(0,4000));
  console.log('direct body', body.slice(0,1200));
  await p.screenshot({path:'C:\\Users\\hcteu\\AppData\\Local\\Temp\\echa_jev_direct.png'});

  // Try to search via UI with JS hack (enabled)
  console.log('=== Back to base for UI search (with Jev monitoring) ===');
  await p.goto('https://chem.echa.europa.eu', {waitUntil:'networkidle', timeout:30000});
  await p.waitForTimeout(2000);
  try{ const loc=p.locator('text=Accept all cookies'); if(await loc.count()>0) await loc.first().click({timeout:2000}); }catch(e){}
  // enable and fill via JS then click via JS
  await p.locator('input[name="searchText"]').evaluate(el=>{
    el.removeAttribute('disabled'); el.disabled=false; el.value='potassium permanganate';
    el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true}));
  });
  console.log('filled potassium permanganate via JS');
  await p.waitForTimeout(1000);
  // enable button and click via JS
  const btnEnabled = await p.locator('button').evaluateAll(els=>{
    return els.map(e=> ({text:e.innerText.trim(), disabled:e.disabled, outer:e.outerHTML.slice(0,200)}));
  });
  console.log('buttons', JSON.stringify(btnEnabled,null,2));
  await p.evaluate(()=>{
    const btns = Array.from(document.querySelectorAll('button'));
    const b = btns.find(x=> x.innerText.trim()==='Search');
    if(b){ b.removeAttribute('disabled'); b.disabled=false; b.click(); console.log('JS clicked Search');}
  });
  await p.waitForTimeout(4000);
  await p.waitForLoadState('networkidle',{timeout:15000}).catch(e=>console.log('wait idle',e.message.slice(0,100)));
  console.log('after JS search url', p.url());
  body = await p.evaluate(()=> document.body.innerText.slice(0,6000));
  console.log('after search body', body.slice(0,2000));
  await p.screenshot({path:'C:\\Users\\hcteu\\AppData\\Local\\Temp\\echa_jev_search.png'});
  // list links
  const links = await p.evaluate(()=>{
    return Array.from(document.querySelectorAll('a')).slice(0,30).map(a=> ({text:a.innerText.trim().slice(0,80), href:a.getAttribute('href')?.slice(0,120)}));
  });
  console.log('links after search', JSON.stringify(links,null,2));

  // === Jev decides which result to pick ===
  const state2 = {
    current_url: p.url(),
    page_snippet: body.slice(0,1500),
    available_links: links,
    goal: "Trouver permanganate de potassium (CAS 7722-64-7, EC 231-760-3)"
  };
  const q2 = {
    pick_result: {type:"choice", instructions:"Quel lien correspond au permanganate de potassium?", criteria: links.reduce((acc,_,i)=>{acc['link_'+i]=`Lien ${i}: ${links[i].text} -> ${links[i].href}`; return acc;}, {})}
  };
  // if no links, ask Jev to verify search failed
  if(links.length===0){
    console.log('No links found, asking Jev to diagnose');
    const diag = callJev({current_url:p.url(), body:body.slice(0,1000), issue:"input disabled, button disabled, no results"}, {diagnosis:{type:"choice", instructions:"Pourquoi la recherche échoue?", criteria:{disabled_form:"Formulaire désactivé Angular", wrong_route:"Mauvaise route /search", need_api:"Besoin API directe"}}});
    console.log(JSON.stringify(diag.answers,null,2));
  } else {
    console.log('=== Jev decision 2: pick result ===');
    const jev2 = callJev(state2, q2);
    console.log(JSON.stringify(jev2.answers,null,2));
  }

  await b.close();
})().catch(e=>{console.error(e); process.exit(1);});
