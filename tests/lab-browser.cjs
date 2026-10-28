// Optional local regression using an existing runtime; never installs packages
// or attaches to a user's browser. Start scripts/serve-lab.mjs separately.
const {chromium}=require(process.env.KOKO_PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const output=path.join(root,'output','playwright','lab');
const target=new URL(process.env.KOKO_LAB_ORIGIN || 'http://127.0.0.1:4183');
assert.ok(target.protocol==='http:' && target.hostname==='127.0.0.1' && target.pathname==='/' && !target.search && !target.hash && !target.username && !target.password,'Only an HTTP127.0.0.1 loopback origin is allowed');
const origin=target.origin;
const start='2027-02-18T13:30:00.000Z', next='2027-02-19T13:30:00.000Z', other='2027-02-20T15:30:00.000Z';
const sourceFiles=['lab/index.html','lab/styles.css','lab/app.mjs','lab/controller.mjs','scripts/serve-lab.mjs','server/booking-service.mjs','server/fake-booking-adapter.mjs','server/booking-errors.mjs','public/booking.mjs','tests/lab-browser.cjs','tests/lab-independent.test.mjs'];
const allowed=new Set(['/','/lab/styles.css','/lab/app.mjs','/lab/controller.mjs','/server/booking-service.mjs','/server/fake-booking-adapter.mjs','/server/booking-errors.mjs','/public/booking.mjs','/favicon.svg']);
const results=[];
let lastPage;
async function idle(page){await page.waitForFunction(()=>!document.getElementById('lab-controls').disabled);}
async function role(page,value){await page.locator('#actor').selectOption(value);await idle(page);}
async function scope(page,value){await page.locator('#scope-location').focus();await page.locator('#scope-location').selectOption(value);await idle(page);assert.equal(await page.evaluate(()=>document.activeElement.id),await page.locator('#global-error').isVisible()?'global-error':'scope-location');}
async function request(page,time=start){await page.locator('#request-start').selectOption(time);await page.locator('#request-privacy').check();const loading=await page.evaluate(()=>{document.getElementById('request-send').click();return{busy:document.getElementById('lab-controls').disabled,activity:document.getElementById('activity').textContent};});assert.equal(loading.busy,true);assert.match(loading.activity,/warten/);await idle(page);assert.equal(await page.evaluate(()=>document.activeElement.id),'receipt');return page.locator('#receipt dd').first().innerText();}
async function open(page,id){await page.locator(`[data-booking-id="${id}"]`).click();assert.equal(await page.evaluate(()=>document.activeElement.id),'detail');}
async function confirm(page,reference){await page.locator('#resource').selectOption('resource-a1');await page.locator('#matched-location').selectOption('demo-a');await page.locator('#matched-start').selectOption(start);await page.locator('#reference').fill(reference);await page.locator('#attestation').check();await page.locator('#confirm').click();await idle(page);assert.match(await page.locator('#detail').innerText(),/CONFIRMED/);}
async function scenario(page,value){if(!(await page.locator('details.scenario').evaluate(node=>node.open)))await page.locator('details.scenario summary').click();await page.locator('#scenario').selectOption(value);await page.locator('#reset-ack').check();await page.locator('#reset').click();await idle(page);assert.equal(await page.locator('#actor').inputValue(),'fixture-customer-01');assert.equal(await page.locator('#receipt').isVisible(),false);}
async function propose(page,kind,time=next){await page.locator('#change-kind').selectOption(kind);if(kind==='RESCHEDULE')await page.locator('#new-start').selectOption(time);await page.locator('#propose').click();await idle(page);}
async function originalFields(page,reference,time=start){await page.locator('#original-location').selectOption('demo-a');await page.locator('#original-start').selectOption(time);await page.locator('#original-reference').fill(reference);}
async function screenshot(page,name){await page.screenshot({path:path.join(output,name+'.png'),fullPage:true});}
function observe(page){const events={requests:[],errors:[],consoleErrors:[]};page.on('request',r=>events.requests.push({url:r.url(),method:r.method(),navigation:r.isNavigationRequest()}));page.on('pageerror',e=>events.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')events.consoleErrors.push(m.text());});return events;}
function localOnly(events){assert.ok(events.requests.every(r=>{const url=new URL(r.url);return url.origin===origin&&r.method==='GET'&&!url.search&&allowed.has(url.pathname);}),JSON.stringify(events.requests));}

(async()=>{
  await fs.mkdir(output,{recursive:true});
  const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  if(process.env.KOKO_EXPECTED_COMMIT)assert.equal(commit,process.env.KOKO_EXPECTED_COMMIT);
  const sources=Object.fromEntries(await Promise.all(sourceFiles.map(async file=>[file,crypto.createHash('sha256').update(await fs.readFile(path.join(root,file))).digest('hex')])));
  const launch={headless:true};if(process.env.KOKO_CHROMIUM_EXECUTABLE)launch.executablePath=process.env.KOKO_CHROMIUM_EXECUTABLE;
  const browser=await chromium.launch(launch);
  try {
    for(const width of [390,768,1440]) {
      const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
      await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort('blockedbyclient'));
      const page=await context.newPage();lastPage=page;const events=observe(page);
      const response=await page.goto(origin,{waitUntil:'networkidle'});assert.equal(response.status(),200);assert.match(response.headers()['x-robots-tag'],/noindex/);
      assert.match(await page.locator('#boot-message').innerText(),/bereit/);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      assert.ok(!(await page.locator('body').innerText()).includes('\uFFFD'));
      assert.match(await page.locator('body').innerText(),/01.01.2027.*UTC/);
      assert.equal(await page.locator('input[type="email"],input[type="tel"],textarea').count(),0);
      await fs.writeFile(path.join(output,`snapshot-${width}.yml`),await page.locator('body').ariaSnapshot());
      await screenshot(page,`initial-${width}`);
      await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('href')),'#main');
      await page.locator('#request-send').click();assert.equal(await page.evaluate(()=>document.activeElement.id),'request-privacy');
      const first=await request(page);assert.match(await page.locator('#receipt').innerText(),/PENDING/);assert.match(await page.locator('#receipt').innerText(),/Kein Termin reserviert/);
      await page.locator('#request-send').click();await idle(page);assert.equal(await page.locator('#receipt dd').first().innerText(),first);
      await role(page,'fixture-staff-a');assert.equal(await page.locator('[data-booking-id]').count(),1);assert.equal(await page.locator('#request-form').isVisible(),false);
      await open(page,first);await screenshot(page,`pending-${width}`);
      await page.locator('#confirm').click();assert.equal(await page.evaluate(()=>document.activeElement.id),'resource');
      await page.locator('#resource').selectOption('resource-a1');await page.locator('#matched-location').selectOption('demo-b');await page.locator('#matched-start').selectOption(start);
      await page.locator('#reference').fill('DEMO-X');assert.equal(await page.locator('#reference').evaluate(e=>e.validity.patternMismatch),true);
      await page.locator('#reference').fill('DEMO-LAB-PRIMARY');await page.locator('#attestation').check();await page.locator('#confirm').click();await idle(page);
      assert.equal(await page.locator('#global-error').isVisible(),true);assert.equal(await page.evaluate(()=>document.activeElement.id),'global-error');assert.equal(await page.locator('#matched-location').inputValue(),'demo-b');assert.match(await page.locator('#detail').innerText(),/PENDING/);await screenshot(page,`mismatch-error-${width}`);
      await page.locator('#matched-location').selectOption('demo-a');await page.locator('#confirm').click();await idle(page);assert.match(await page.locator('#detail').innerText(),/CONFIRMED/);assert.equal(await page.locator('#confirm').count(),0);
      await screenshot(page,`confirmed-${width}`);
      await propose(page,'CANCEL');assert.equal(await page.locator('[data-change-id]').count(),0);assert.match(await page.locator('#global-error').innerText(),/nicht erlaubt/);
      await role(page,'invalid-fixture');assert.equal(await page.locator('#actor').inputValue(),'invalid-fixture');assert.equal(await page.locator('[data-booking-id]').count(),0);assert.equal(await page.locator('#confirm').count(),0);assert.match(await page.locator('#global-error').innerText(),/ungültig/);
      await role(page,'fixture-staff-b');assert.equal(await page.locator('[data-booking-id]').count(),0);const deniedText=await page.locator('#global-error').innerText();assert.ok(!/FORBIDDEN|NOT_FOUND|demo-booking/.test(deniedText));assert.match(await page.locator('#queue').innerText(),/nicht verfügbar/);assert.doesNotMatch(await page.locator('#queue').innerText(),/Stelle eine Anfrage/);
      await scope(page,'demo-b');assert.equal(await page.locator('#global-error').isVisible(),false);assert.equal(await page.locator('[data-booking-id]').count(),0);
      await role(page,'fixture-staff-a');assert.equal(await page.locator('#global-error').innerText(),deniedText);await scope(page,'demo-a');await open(page,first);
      await page.locator('#refresh').click();await idle(page);assert.equal(await page.evaluate(()=>document.activeElement.id),'refresh');
      if(!(await page.locator('details.scenario').evaluate(node=>node.open)))await page.locator('details.scenario summary').click();
      await page.locator('#scenario').selectOption('changes');assert.match(await page.locator('#scenario-state').innerText(),/gesperrt/);
      await page.locator('#reset').click();assert.equal(await page.evaluate(()=>document.activeElement.id),'reset-ack');assert.equal(await page.locator('[data-booking-id]').count(),1);
      await scenario(page,'changes');assert.match(await page.locator('#scenario-state').innerText(),/Erfundene Freigabe/);
      const source=await request(page);await role(page,'fixture-staff-a');await open(page,source);await confirm(page,'DEMO-LAB-CHANGE');
      await propose(page,'CANCEL');assert.equal(await page.locator('[data-change-id]').count(),1);assert.match(await page.locator('#detail').innerText(),/bisherige Testtermin bleibt/);await screenshot(page,`change-pending-${width}`);
      const rejected=await page.locator('[data-change-id]').getAttribute('data-change-id');await page.locator('#reject-change').click();await idle(page);assert.match(await page.locator(`[data-change-id="${rejected}"]`).innerText(),/REJECTED/);
      await propose(page,'CANCEL');assert.equal(await page.locator('[data-change-id]').count(),2);assert.equal(await page.locator('#apply-form').count(),1);await page.locator('#reject-change').click();await idle(page);
      await propose(page,'RESCHEDULE');assert.equal(await page.locator('[data-change-id]').count(),3);assert.equal(await page.locator('#apply-form').count(),1);
      await scope(page,'demo-b');assert.equal(await page.locator('[data-change-id]').count(),0);assert.equal(await page.locator('[data-booking-id]').count(),0);await scope(page,'demo-a');await open(page,source);assert.equal(await page.locator('[data-change-id]').count(),3);
      await originalFields(page,'DEMO-LAB-CHANGE');await page.locator('#change-reference').fill('DEMO-LAB-RESCHEDULE');await page.locator('#replacement-start').selectOption(other);await page.locator('#replacement-resource').selectOption('resource-a1');await page.locator('#replacement-reference').fill('DEMO-LAB-REPLACEMENT');await page.locator('#change-attestation').check();await page.locator('#apply-change').click();await idle(page);assert.equal(await page.locator('#global-error').isVisible(),true);assert.equal(await page.evaluate(()=>document.activeElement.id),'global-error');assert.equal(await page.locator('#replacement-start').inputValue(),other);
      await page.locator('#replacement-start').selectOption(next);await page.locator('#apply-change').click();await idle(page);assert.match(await page.locator('#detail').innerText(),/RESCHEDULED/);assert.equal(await page.locator('[data-booking-id]').count(),2);await screenshot(page,`rescheduled-${width}`);
      await role(page,'fixture-customer-01');assert.match(await page.locator('#receipt').innerText(),/RESCHEDULED/);assert.match(await page.locator('#receipt').innerText(),/Ursprünglicher Testzeitpunkt/);assert.match(await page.locator('#receipt').innerText(),/Ursprüngliche Testreferenz/);assert.match(await page.locator('#receipt').innerText(),/ursprünglichen Testtermin/);assert.match(await page.locator('#receipt').innerText(),/CONFIRMED \(unverändert\)/);await screenshot(page,`historical-receipt-${width}`);await role(page,'fixture-staff-a');await open(page,source);
      await page.locator('#detail button[id^="replacement-"]').click();assert.match(await page.locator('#detail').innerText(),/CONFIRMED/);assert.match(await page.locator('#detail').innerText(),/Ersatz für den historischen/);
      await propose(page,'CANCEL');await originalFields(page,'DEMO-LAB-REPLACEMENT',next);await page.locator('#change-reference').fill('DEMO-LAB-CANCEL-REPLACEMENT');await page.locator('#change-attestation').check();await page.locator('#apply-change').click();await idle(page);assert.match(await page.locator('#detail').innerText(),/CANCELLED/);assert.equal(await page.locator('#proposal-form,#confirm-form,#apply-form').count(),0);await screenshot(page,`cancelled-${width}`);
      await role(page,'fixture-customer-02');const declined=await request(page,other);await role(page,'fixture-staff-a');await open(page,declined);await page.locator('#decline').click();await idle(page);assert.match(await page.locator('#detail').innerText(),/DECLINED/);
      await role(page,'fixture-customer-02');const renewed=await request(page,other);assert.notEqual(renewed,declined,'declined request needs a fresh user action ID');
      const storage=await page.evaluate(async()=>({local:localStorage.length,session:sessionStorage.length,cookies:document.cookie,databases:(await indexedDB.databases()).length}));assert.deepEqual(storage,{local:0,session:0,cookies:'',databases:0});
      await context.setOffline(true);await scenario(page,'locked');await request(page);assert.match(await page.locator('#receipt').innerText(),/PENDING/);await context.setOffline(false);
      await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('#receipt').isVisible(),false);await role(page,'fixture-staff-a');assert.equal(await page.locator('[data-booking-id]').count(),0);
      assert.equal(page.url(),origin+'/');assert.equal(events.errors.length,0,JSON.stringify(events.errors));assert.equal(events.consoleErrors.length,0,JSON.stringify(events.consoleErrors));localOnly(events);
      results.push({kind:'journey',width,result:'PASS',storage,...events});await context.close();
    }
    for(const width of [390,768,1440])for(const mode of ['javascript-disabled','app-failure','controller-failure','domain-failure','delayed-app']) {
      const context=await browser.newContext({viewport:{width,height:1000},javaScriptEnabled:mode!=='javascript-disabled'});
      await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort('blockedbyclient'));
      let release;const gate=new Promise(resolve=>{release=resolve;});
      const routePath={'app-failure':'/lab/app.mjs','controller-failure':'/lab/controller.mjs','domain-failure':'/server/fake-booking-adapter.mjs','delayed-app':'/lab/app.mjs'}[mode];
      if(routePath)await context.route(url=>url.origin===origin&&url.pathname===routePath,async r=>{if(mode==='delayed-app'){await gate;await r.continue();}else await r.abort('failed');});
      const page=await context.newPage();lastPage=page;const events=observe(page);
      await page.goto(origin,{waitUntil:mode==='delayed-app'?'commit':'networkidle'});await page.locator('#boot-message').waitFor({state:'visible'});
      assert.equal(await page.locator('#boot-message').getAttribute('role'),'status');assert.match(await page.locator('#boot-message').innerText(),/gesperrt/);assert.match(await page.locator('#boot-message').innerText(),/neu.*JavaScript/);
      const locked=await page.locator('#lab-controls input,#lab-controls select,#lab-controls button').evaluateAll(nodes=>nodes.map(n=>({id:n.id,disabled:n.matches(':disabled')})));assert.ok(locked.length>5&&locked.every(n=>n.disabled));
      await page.locator('#request-send').click({force:true});await page.keyboard.press('Enter');await page.waitForTimeout(100);assert.equal(page.url(),origin+'/');assert.equal(events.requests.filter(r=>r.navigation).length,1);localOnly(events);
      if(mode==='javascript-disabled')assert.equal(await page.locator('noscript p').isVisible(),true);
      await screenshot(page,`boot-${mode}-${width}`);await fs.writeFile(path.join(output,`boot-${mode}-${width}.yml`),await page.locator('body').ariaSnapshot());
      if(mode==='delayed-app'){release();await page.waitForLoadState('networkidle');await idle(page);await page.locator('#request-privacy').check();await page.locator('#request-send').focus();await page.keyboard.press('Enter');await idle(page);assert.match(await page.locator('#receipt').innerText(),/PENDING/);assert.equal(await page.evaluate(()=>document.activeElement.id),'receipt');assert.equal(page.url(),origin+'/');localOnly(events);}
      results.push({kind:'boot',width,mode,result:'PASS',locked,requests:events.requests});await context.close();
    }
    for(const [file,hash]of Object.entries(sources))assert.equal(crypto.createHash('sha256').update(await fs.readFile(path.join(root,file))).digest('hex'),hash,`${file} changed during browser QA`);
    assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),commit,'HEAD changed during browser QA');
    const evidence={time:new Date().toISOString(),commit,browser:await browser.version(),origin,sources,results};await fs.writeFile(path.join(output,'lab-browser-results.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({time:evidence.time,commit,browser:evidence.browser,results:results.map(({kind,width,mode,result})=>({kind,width,mode,result}))},null,2));
  }catch(error){if(lastPage&&!lastPage.isClosed())await screenshot(lastPage,'failure').catch(()=>{});await fs.writeFile(path.join(output,'lab-browser-failure.json'),JSON.stringify({time:new Date().toISOString(),commit,sources,completed:results,message:error.message},null,2));throw error;}
  finally{await browser.close();}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
