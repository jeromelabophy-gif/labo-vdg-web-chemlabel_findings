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
  const apiLogs=[];
  p.on('request', r=>{
    const u=r.url();
    if(u.includes('api')||u.includes('harmonised')||u.includes('classification')){
      apiLogs.push({method:r.method(), url:u.slice(0,300)});
      console.log('REQ', r.method(), u.slice(0,300));
    }
  });
  p.on('response', async r=>{
    const u=r.url();
    if(u.includes('api')||u.includes('harmonised')||u.includes('classification')){
      let body='';
      try{ body=await r.text(); }catch(e){}
      console.log('RESP', r.status(), u.slice(0,300), body.slice(0,800).replace(/\n/g,' ').slice(0,600));
      if(body.includes('Specific')||body.includes('Concentration')||body.includes('025-002')){
        console.log('*** FOUND SCL related ***', body.slice(0,1200));
      }
    }
  });
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
  console.log('=== goto potassium substance ===');
  await p.goto('https://chem.echa.europa.eu/100.028.874', {waitUntil:'networkidle', timeout:40000});
  await p.waitForTimeout(3000);
  await acceptAll();
  await p.waitForTimeout(2000);
  console.log('url', p.url());
  let txt=await p.evaluate(()=> document.body.innerText.slice(0,4000));
  console.log('body', txt.slice(0,1500));
  // Jev decides next step
  console.log('\n=== Jev decides to go to harmonised ===');
  const jev=callJev(
    {current_url:p.url(), page_snippet: txt.slice(0,800), available_actions:["click Harmonised classifications","click Classification & labelling","stay"]},
    {next:{type:"choice", instructions:"Quelle action pour trouver Specific Concentration Limit?", criteria:{harmonised:"Cliquer Harmonised classifications", classification:"Cliquer Classification & labelling", stay:"Rester"}}}
  );
  console.log(JSON.stringify(jev.answers,null,2));
  // try to click Harmonised classifications
  const harmLink = p.getByText('Harmonised classifications', {exact:true});
  console.log('harm count', await harmLink.count());
  if(await harmLink.count()>0){
    await harmLink.first().click();
    console.log('clicked harmonised');
    await p.waitForTimeout(4000);
    await p.waitForLoadState('networkidle',{timeout:15000}).catch(e=>{});
    console.log('after click url', p.url());
    txt=await p.evaluate(()=> document.body.innerText.slice(0,8000));
    console.log('harm body', txt.slice(0,3000));
    await p.screenshot({path:'C:\\Users\\hcteu\\AppData\\Local\\Temp\\echa_harm_potass.png'});
    // also evaluate for SCL
    const scl = await p.evaluate(()=>{
      const body=document.body.innerText;
      const idx=body.indexOf('Specific');
      if(idx!==-1) return body.slice(Math.max(0,idx-500), idx+1500);
      const idx2=body.indexOf('Concentration');
      if(idx2!==-1) return body.slice(Math.max(0,idx2-500), idx2+1500);
      return body.slice(0,3000);
    });
    console.log('\n=== SCL snippet ===\n', scl.slice(0,2000));
    // also try to find via API that was logged
    console.log('\n=== apiLogs ===', apiLogs.slice(0,20));
  } else {
    // try alternative: Classification & labelling
    const cls = p.getByText('Classification & labelling', {exact:true});
    console.log('cls count', await cls.count());
    if(await cls.count()>0) await cls.first().click();
  }
  await b.close();
})()
