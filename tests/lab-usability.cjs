// Optional, loopback-only check using an existing Playwright installation.
const {chromium}=require(process.env.KOKO_PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),output=path.join(root,'output','playwright','lab-usability');
const target=new URL(process.env.KOKO_LAB_ORIGIN || 'http://127.0.0.1:4183');
assert.ok(target.protocol==='http:'&&target.hostname==='127.0.0.1'&&target.pathname==='/'&&!target.search&&!target.hash&&!target.username&&!target.password);
const sources=['lab/index.html','lab/styles.css','lab/app.mjs','lab/controller.mjs','scripts/serve-lab.mjs','tests/lab-usability.cjs'];
const results=[];
const keys=[];
async function press(page,key){keys.push(key);await page.keyboard.press(key);}
async function idle(page){await page.waitForFunction(()=>!document.getElementById('lab-controls').disabled);}
async function tabTo(page,selector,reverse=false){
  assert.equal(await page.locator(selector).isVisible(),true,selector+' must be visible');
  for(let i=0;i<70;i++){
    if(await page.evaluate(s=>document.activeElement.matches(s),selector))return;
    await press(page,reverse?'Shift+Tab':'Tab');
  }
  assert.fail('Keyboard could not reach '+selector);
}
async function choose(page,id,value){
  await tabTo(page,'#'+id);
  const options=await page.locator('#'+id+' option').evaluateAll(nodes=>nodes.map(n=>n.value));
  const index=options.indexOf(value);assert.ok(index>=0);
  await press(page,'Space');
  if(index===options.length-1)await press(page,'End');
  else{await press(page,'Home');for(let i=0;i<index;i++)await press(page,'ArrowDown');}
  await press(page,'Enter');await idle(page);
  assert.equal(await page.locator('#'+id).inputValue(),value);
}
async function labelsAndSemantics(page){
  const audit=await page.evaluate(()=>{
    const visible=n=>n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden';
    const named=n=>n.getAttribute('aria-label')||[...(n.labels||[])].map(l=>l.textContent.trim()).join(' ')||
      (n.getAttribute('aria-labelledby')||'').split(/\s+/).map(id=>document.getElementById(id)?.textContent||'').join(' ').trim()||
      (['BUTTON','SUMMARY','A'].includes(n.tagName)?n.textContent.trim():'');
    const controls=[...document.querySelectorAll('input,select,button,summary,a')].filter(visible).map(n=>({id:n.id,tag:n.tagName,name:named(n)}));
    return{controls,unnamed:controls.filter(n=>!n.name),described:[...document.querySelectorAll('[aria-describedby]')].filter(visible).map(n=>({id:n.id,valid:n.getAttribute('aria-describedby').split(/\s+/).every(id=>Boolean(document.getElementById(id)?.textContent.trim()))}))};
  });
  assert.deepEqual(audit.unnamed,[]);assert.ok(audit.described.every(n=>n.valid));
  assert.equal(await page.locator('#boot-message').getAttribute('role'),'status');
  assert.equal(await page.locator('#activity').getAttribute('role'),'status');
  assert.equal(await page.locator('#activity').getAttribute('aria-live'),'polite');
  assert.equal(await page.locator('#global-error').getAttribute('role'),'alert');
  assert.equal(await page.locator('#detail').getAttribute('aria-labelledby'),'detail-title');
  return audit;
}
async function seedPendingByKeyboard(page){
  await tabTo(page,'#request-privacy');if(!(await page.locator('#request-privacy').isChecked()))await press(page,'Space');
  await tabTo(page,'#request-send');await press(page,'Enter');await idle(page);
  await choose(page,'actor','fixture-staff-a');
  const id=await page.locator('[data-booking-id]').first().getAttribute('id');
  await tabTo(page,'#'+id);await press(page,'Enter');
}
async function geometry(page){return page.evaluate(()=>{
  const visible=n=>n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden';
  const rect=n=>{const r=n.getBoundingClientRect();return{id:n.id,tag:n.tagName,text:n.textContent.trim().slice(0,70),left:r.left,right:r.right,top:r.top,bottom:r.bottom};};
  const controls=[...document.querySelectorAll('button,input,select,summary,a')].filter(visible).filter(n=>!n.classList.contains('skip-link')).map(rect);
  const overlaps=[];for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++){const a=controls[i],b=controls[j];if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)overlaps.push([a.id||a.tag,b.id||b.tag]);}
  return{scrollWidth:document.documentElement.scrollWidth,width:innerWidth,outside:controls.filter(n=>n.left<-.5||n.right>innerWidth+.5),overlaps};
});}
async function fullReadout(page,id,expected,scale){
  const node=page.locator('#'+id+'-selection');assert.equal(await node.isVisible(),true);
  assert.equal(await node.innerText(),'Auswahl: '+expected);
  const measured=await node.evaluate(n=>{const r=n.getBoundingClientRect(),css=getComputedStyle(n);return{text:n.innerText,left:r.left,right:r.right,width:r.width,height:r.height,lineHeight:parseFloat(css.lineHeight),fontSize:parseFloat(css.fontSize),client:n.clientWidth,scroll:n.scrollWidth,viewport:innerWidth};});
  assert.ok(measured.left>=0&&measured.right<=measured.viewport+.5);assert.ok(measured.scroll<=measured.client+1,'full selection must wrap instead of clipping');
  if(scale===2)assert.ok(measured.height>=measured.lineHeight*1.8,'enlarged full selection should visibly wrap');
  return measured;
}
(async()=>{
  await fs.mkdir(output,{recursive:true});
  const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  if(process.env.KOKO_EXPECTED_COMMIT)assert.equal(commit,process.env.KOKO_EXPECTED_COMMIT);
  const sourceHashes=Object.fromEntries(await Promise.all(sources.map(async f=>[f,crypto.createHash('sha256').update(await fs.readFile(path.join(root,f))).digest('hex')])));
  const launch={headless:true};if(process.env.KOKO_CHROMIUM_EXECUTABLE)launch.executablePath=process.env.KOKO_CHROMIUM_EXECUTABLE;
  const browser=await chromium.launch(launch);
  try{
    {
      const page=await browser.newPage({viewport:{width:1280,height:1000}});
      const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
      await page.goto(target.origin,{waitUntil:'networkidle'});
      const initialAudit=await labelsAndSemantics(page);
      await tabTo(page,'#request-send');await press(page,'Enter');assert.equal(await page.evaluate(()=>document.activeElement.id),'request-privacy');
      await press(page,'Space');await press(page,'Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'request-send');
      await press(page,'Enter');
      const busy=await page.evaluate(()=>({busy:document.getElementById('lab-controls').disabled,reset:document.getElementById('reset').matches(':disabled'),actor:document.getElementById('actor').matches(':disabled'),activity:document.getElementById('activity').textContent}));
      assert.equal(busy.busy,true);assert.equal(busy.reset,true);assert.equal(busy.actor,true);assert.match(busy.activity,/warten/);
      await press(page,'Enter');await press(page,'Tab');await press(page,'Shift+Tab');await press(page,'Space');await idle(page);
      assert.equal(await page.evaluate(()=>document.activeElement.id),'receipt');
      assert.match(await page.locator('#receipt').innerText(),/PENDING/);
      await choose(page,'actor','fixture-staff-a');assert.equal(await page.evaluate(()=>document.activeElement.id),'staff-title');
      assert.equal(await page.locator('[data-booking-id]').count(),1,'repeated Enter must not duplicate a request');
      const row=await page.locator('[data-booking-id]').first().getAttribute('id');await tabTo(page,'#'+row);await press(page,'Enter');
      assert.equal(await page.evaluate(()=>document.activeElement.id),'detail');
      const detailAudit=await labelsAndSemantics(page);
      await tabTo(page,'#confirm');await press(page,'Enter');assert.equal(await page.evaluate(()=>document.activeElement.id),'resource');
      await choose(page,'resource','resource-a1');await choose(page,'matched-location','demo-b');await choose(page,'matched-start','2027-02-18T13:30:00.000Z');
      await tabTo(page,'#reference');await page.keyboard.type('DEMO-KEYBOARD-ONLY');keys.push('typed DEMO fixture reference');
      await tabTo(page,'#attestation');await press(page,'Space');await tabTo(page,'#confirm');await press(page,'Enter');await idle(page);
      assert.equal(await page.evaluate(()=>document.activeElement.id),'global-error');assert.equal(await page.locator('#global-error').isVisible(),true);
      await choose(page,'matched-location','demo-a');await tabTo(page,'#confirm');await press(page,'Enter');await idle(page);assert.match(await page.locator('#detail').innerText(),/CONFIRMED/);
      await tabTo(page,'details.scenario summary',true);await press(page,'Space');await choose(page,'scenario','changes');
      await tabTo(page,'#reset');await press(page,'Enter');assert.equal(await page.evaluate(()=>document.activeElement.id),'reset-ack');
      await press(page,'Space');await press(page,'Tab');await press(page,'Enter');await idle(page);assert.equal(await page.evaluate(()=>document.activeElement.id),'actor');assert.equal(await page.locator('#receipt').isVisible(),false);
      await tabTo(page,'#request-privacy');if(!(await page.locator('#request-privacy').isChecked()))await press(page,'Space');await tabTo(page,'#request-send');
      const interruption=[];await page.exposeFunction('recordUsabilityInterruption',value=>interruption.push(value));
      // Observe in the actual submit event, after the application's listener,
      // then deliberately reload before its delayed command settles. This avoids
      // mistaking a protocol round-trip after completion for a missing busy state.
      await page.evaluate(()=>document.getElementById('request-form').addEventListener('submit',()=>{
        const value={busy:document.getElementById('lab-controls').disabled,resetDisabled:document.getElementById('reset').matches(':disabled')};
        window.recordUsabilityInterruption(value).then(()=>location.reload());
      },{once:true}));
      const navigation=page.waitForNavigation({waitUntil:'networkidle'});await press(page,'Enter');await navigation;
      assert.deepEqual(interruption,[{busy:true,resetDisabled:true}]);
      assert.equal(await page.locator('#receipt').isVisible(),false);await choose(page,'actor','fixture-staff-a');assert.equal(await page.locator('[data-booking-id]').count(),0);
      assert.deepEqual(pageErrors,[]);await page.screenshot({path:path.join(output,'keyboard-fresh-after-interruption.png'),fullPage:true});
      results.push({kind:'keyboard',result:'PASS',initialAudit,detailAudit,busy,keys:keys.slice(),interruption,interruptedRequestDiscarded:true});await page.close();
    }
    for(const scale of [1,2]){
      const page=await browser.newPage({viewport:{width:320,height:1000},deviceScaleFactor:1});
      await page.goto(target.origin,{waitUntil:'networkidle'});
      const before=await page.evaluate(()=>({root:parseFloat(getComputedStyle(document.documentElement).fontSize),body:parseFloat(getComputedStyle(document.body).fontSize),button:parseFloat(getComputedStyle(document.getElementById('request-send')).fontSize),h1:parseFloat(getComputedStyle(document.querySelector('h1')).fontSize),width:innerWidth,dpr:devicePixelRatio}));
      if(scale===2)await page.evaluate(()=>{document.documentElement.style.fontSize=(parseFloat(getComputedStyle(document.documentElement).fontSize)*2)+'px';});
      const after=await page.evaluate(()=>({root:parseFloat(getComputedStyle(document.documentElement).fontSize),body:parseFloat(getComputedStyle(document.body).fontSize),button:parseFloat(getComputedStyle(document.getElementById('request-send')).fontSize),h1:parseFloat(getComputedStyle(document.querySelector('h1')).fontSize),width:innerWidth,dpr:devicePixelRatio,scrollWidth:document.documentElement.scrollWidth,skipBottom:document.querySelector('.skip-link').getBoundingClientRect().bottom,outside:[...document.querySelectorAll('button,input,select,summary,.wordmark,.local-tag,h1,.queue-panel,.detail')].filter(n=>n.getClientRects().length).map(n=>({id:n.id,tag:n.tagName,text:n.textContent.trim().slice(0,70),left:n.getBoundingClientRect().left,right:n.getBoundingClientRect().right})).filter(n=>n.left<0||n.right>innerWidth)}));
      await page.screenshot({path:path.join(output,`layout-320-${scale}x.png`),fullPage:true});
      const record={kind:'layout',scale,before,after};
      try{assert.equal(after.width,before.width);assert.equal(after.dpr,before.dpr);assert.equal(after.root,before.root*scale);assert.equal(after.body,before.body*scale);assert.equal(after.button,before.button*scale);assert.ok(after.scrollWidth<=320,`320px at ${scale*100}% text scrolls to ${after.scrollWidth}px`);assert.deepEqual(after.outside,[]);assert.ok(after.skipBottom<=0,'unfocused skip link paints inside viewport');
        record.requestReadouts=[await fullReadout(page,'request-service','Nagelpflege (Demo, 30 Testminuten)',scale),await fullReadout(page,'request-start','2027-02-18 13:30 UTC',scale)];
        await seedPendingByKeyboard(page);await choose(page,'resource','resource-a1');await choose(page,'matched-start','2027-02-18T13:30:00.000Z');record.detailReadouts=[await fullReadout(page,'resource','Testressource A1',scale),await fullReadout(page,'matched-start','2027-02-18 13:30 UTC',scale)];const detail=await geometry(page);assert.equal(detail.scrollWidth,320);assert.deepEqual(detail.outside,[]);assert.deepEqual(detail.overlaps,[]);record.detail=detail;record.labelAudit=await labelsAndSemantics(page);await page.screenshot({path:path.join(output,`detail-320-${scale}x.png`),fullPage:true});record.result='PASS';}catch(e){record.result='FAIL';record.reason=e.message;process.exitCode=1;}
      results.push(record);await page.close();
    }
    for(const [f,h]of Object.entries(sourceHashes))assert.equal(crypto.createHash('sha256').update(await fs.readFile(path.join(root,f))).digest('hex'),h,`${f} changed during check`);
    assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),commit);
    const evidence={time:new Date().toISOString(),commit,browser:await browser.version(),sourceHashes,results};
    await fs.writeFile(path.join(output,'lab-usability-results.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
