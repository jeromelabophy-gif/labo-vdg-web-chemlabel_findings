const {chromium} = require('C:\\Users\\hcteu\\AppData\\Roaming\\npm\\node_modules\\playwright');
(async()=>{
  const b=await chromium.launch({headless:true});
  const p=await b.newPage();
  await p.goto('https://chem.echa.europa.eu', {waitUntil:'networkidle', timeout:40000});
  await p.waitForTimeout(3000);
  try{
    const loc = p.locator('text=Accept all cookies');
    if(await loc.count()>0){ await loc.first().click({timeout:3000}); console.log('clicked text Accept'); await p.waitForTimeout(2000);}
  }catch(e){ console.log('no text click', e.message.slice(0,100));}
  const input = p.locator('input[type="text"]');
  console.log('found input count', await input.count());
  // force enable disabled input via JS - use locator evaluate
  const dbg = await p.evaluate(()=>{
    const inputs = Array.from(document.querySelectorAll('input'));
    return inputs.map(el=> ({outer: el.outerHTML.slice(0,300), name: el.getAttribute('name'), id: el.id, disabled: el.disabled, type: el.type}));
  });
  console.log('all inputs', JSON.stringify(dbg, null, 2));
  // try via locator evaluate
  const inputHandle = p.locator('input[name="searchText"]');
  console.log('locator count', await inputHandle.count());
  try{
    await inputHandle.evaluate((el)=>{
      el.removeAttribute('disabled');
      el.disabled=false;
      el.value='potassium permanganate';
      el.dispatchEvent(new Event('input', {bubbles:true}));
      el.dispatchEvent(new Event('change', {bubbles:true}));
    });
    console.log('locator evaluate filled');
  }catch(e){ console.log('locator evaluate error', e.message.slice(0,300));}
  await p.waitForTimeout(1000);
  console.log('input value after js', await inputHandle.evaluate(el=> el.value).catch(e=> 'err '+e.message));
  console.log('filled');
  await p.waitForTimeout(1000);
  const searchBtn = p.getByRole('button', {name: /^Search$/});
  console.log('search btn count', await searchBtn.count());
  if(await searchBtn.count()>0){
    await searchBtn.first().click();
    console.log('clicked search');
  } else {
    await input.first().press('Enter');
    console.log('pressed enter');
  }
  await p.waitForTimeout(5000);
  await p.waitForLoadState('networkidle', {timeout:15000}).catch(e=>console.log('networkidle timeout'));
  console.log('after search url', p.url());
  console.log('title', await p.title());
  const text = await p.evaluate(()=> document.body.innerText.slice(0,6000));
  console.log('body innerText', text);
  await p.screenshot({path:'C:\\Users\\hcteu\\AppData\\Local\\Temp\\echa_search_potperm.png'});
  console.log('screenshot');
  const links = await p.locator('a').all();
  console.log('links', links.length);
  for(let i=0;i<Math.min(links.length,30);i++){
    const href=await links[i].getAttribute('href').catch(e=>null);
    const txt=await links[i].innerText().catch(e=>'');
    if(txt && txt.trim().length>0) console.log('a',i, txt.slice(0,100).replace(/\n/g,' '), href?.slice(0,120));
  }
  await b.close();
})()
