const {chromium}=require('C:\\Users\\hcteu\\AppData\\Roaming\\npm\\node_modules\\playwright');
(async()=>{
  const b=await chromium.launch({headless:true});
  const p=await b.newPage();
  const reqs=[];
  p.on('request', req=>{
    const url=req.url();
    if(url.includes('api') || url.includes('search')){
      reqs.push({method:req.method(), url:url.slice(0,180), headers: req.headers()});
      console.log('REQ', req.method(), url.slice(0,180));
    }
  });
  p.on('response', async resp=>{
    const url=resp.url();
    if(url.includes('api') || url.includes('search')){
      const body=await resp.text().catch(e=>'');
      console.log('RESP', resp.status(), url.slice(0,180), body.slice(0,800).replace(/\n/g,' ').slice(0,600));
    }
  });
  console.log('goto with searchText');
  await p.goto('https://chem.echa.europa.eu/?searchText=potassium%20permanganate', {waitUntil:'networkidle', timeout:40000});
  await p.waitForTimeout(5000);
  console.log('url now', p.url());
  console.log('title', await p.title());
  const txt = await p.evaluate(()=> document.body.innerText.slice(0,4000));
  console.log('body', txt.slice(0,1500));
  await p.screenshot({path:'C:\\Users\\hcteu\\AppData\\Local\\Temp\\echa_via_url.png'});
  console.log('reqs', reqs.slice(0,20));
  await b.close();
})()
