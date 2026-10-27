// Optional check: use an existing Playwright runtime and a fresh headless browser.
// Module failures are injected against the local demo only.
const { chromium } = require(process.env.KOKO_PLAYWRIGHT_MODULE || 'playwright');
const {execFileSync} = require('node:child_process');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const path = require('node:path');
const assert = require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const output=path.join(root,'output','playwright');
const target=new URL(process.env.KOKO_BASE_URL || 'http://127.0.0.1:4173');
assert.ok(['http:','https:'].includes(target.protocol) && ['127.0.0.1','[::1]'].includes(target.hostname) &&
  !target.username && !target.password && target.pathname==='/' && !target.search && !target.hash,
  'KOKO_BASE_URL must be a loopback IP origin, with no credentials, path, query or fragment');
const origin=target.origin;
const sourceFiles=['public/index.html','public/app.mjs','public/booking.mjs','public/styles.css','scripts/serve.mjs','scripts/build.mjs','vercel.json','tests/browser-boot.cjs','tests/browser-flow.cjs'];

(async()=>{
  const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  if(process.env.KOKO_EXPECTED_COMMIT)assert.equal(commit,process.env.KOKO_EXPECTED_COMMIT);
  await fs.mkdir(output,{recursive:true});
  const sources=Object.fromEntries(await Promise.all(sourceFiles.map(async p=>[p,crypto.createHash('sha256').update(await fs.readFile(path.join(root,p))).digest('hex')])));
  const launch={headless:true};
  if(process.env.KOKO_CHROMIUM_EXECUTABLE)launch.executablePath=process.env.KOKO_CHROMIUM_EXECUTABLE;
  const browser=await chromium.launch(launch);
  const results=[];
  try {
    for(const width of [390,768,1440]) {
      for(const scenario of ['javascript-disabled','app-module-failure','booking-module-failure','delayed-app-boot']) {
        const context=await browser.newContext({javaScriptEnabled:scenario!=='javascript-disabled',viewport:{width,height:width===390?844:1000}});
        await context.route('**/*',route=>new URL(route.request().url()).origin===origin ? route.continue() : route.abort('blockedbyclient'));
        let release;
        const gate=new Promise(resolve=>{release=resolve;});
        const localModule=(name)=>url=>url.origin===origin && url.pathname===`/${name}`;
        if(scenario==='app-module-failure')await context.route(localModule('app.mjs'),r=>r.abort('failed'));
        if(scenario==='booking-module-failure')await context.route(localModule('booking.mjs'),r=>r.abort('failed'));
        if(scenario==='delayed-app-boot')await context.route(localModule('app.mjs'),async r=>{await gate;await r.continue();});
        const page=await context.newPage();
        const requests=[];
        page.on('request',r=>requests.push({method:r.method(),url:r.url(),navigation:r.isNavigationRequest()}));
        await page.goto(origin,{waitUntil:scenario==='delayed-app-boot'?'commit':'networkidle'});
        await page.locator('#form-availability').waitFor({state:'visible'});
        const initialUrl=page.url();
        assert.equal(await page.locator('#booking-form').getAttribute('aria-describedby'),'form-availability');
        assert.equal(await page.locator('#form-availability').getAttribute('role'),'status');
        assert.match(await page.locator('#form-availability').innerText(),/gesperrt/);
        assert.match(await page.locator('#form-availability').innerText(),/JavaScript aktivieren.*neu laden/);
        const controlState=await page.locator('#booking-controls input,#booking-controls select,#booking-controls button,#team-controls select,#team-controls button').evaluateAll(nodes=>nodes.map(n=>({tag:n.tagName,id:n.id,name:n.name,type:n.type,disabled:n.matches(':disabled')})));
        assert.ok(controlState.length>=9);
        assert.ok(controlState.every(n=>n.disabled),`${scenario}: enabled control before boot`);
        assert.equal(await page.locator('#booking-submit').getAttribute('type'),'button');
        await fs.writeFile(path.join(output,`boot-${scenario}-${width}.yml`),await page.locator('body').ariaSnapshot());
        if(width===390)await page.screenshot({path:path.join(output,`boot-${scenario}-${width}.png`),fullPage:true});
        await page.locator('#booking-submit').click({force:true});
        await page.keyboard.press('Enter');
        await page.waitForTimeout(200);
        assert.equal(page.url(),initialUrl);
        assert.equal(requests.filter(r=>r.navigation).length,1,'disabled UI caused navigation');
        assert.ok(requests.every(r=>new URL(r.url).origin===origin&&r.method==='GET'&&!new URL(r.url).search),'field-bearing or outbound request before boot');
        if(scenario==='javascript-disabled')assert.equal(await page.locator('noscript p').isVisible(),true);
        let afterRelease=null;
        if(scenario==='delayed-app-boot') {
          release();
          await page.waitForLoadState('networkidle');
          assert.equal(await page.locator('#booking-submit').isEnabled(),true);
          assert.equal(await page.locator('#booking-submit').getAttribute('type'),'submit');
          assert.equal(await page.locator('#location').isEnabled(),true);
          assert.equal(await page.locator('#demo-role').isEnabled(),true);
          assert.match(await page.locator('#form-availability').innerText(),/Demo ist bereit/);
          const future=new Date(Date.now()+2*24*60*60*1000).toISOString().slice(0,10);
          await page.locator('#location').selectOption('demo-a');
          await page.locator('input[name="serviceId"][value="demo-care"]').check();
          await page.locator('#date').fill(future);
          await page.locator('#time').fill('14:30');
          await page.locator('#booking-form input[name="privacyAccepted"]').check();
          await page.locator('#booking-submit').focus();
          await page.keyboard.press('Enter');
          assert.equal(await page.locator('#receipt').isVisible(),true);
          assert.match(await page.locator('#receipt').innerText(),/PENDING/);
          assert.equal(await page.evaluate(()=>document.activeElement.id),'receipt');
          assert.equal(page.url(),initialUrl);
          assert.equal(requests.filter(r=>r.navigation).length,1);
          afterRelease={submitType:'submit',enabled:true,keyboardSubmit:'PENDING',url:page.url()};
        }
        results.push({width,scenario,result:'PASS',initialUrl,finalUrl:page.url(),controlState,afterRelease,requests});
        await context.close();
      }
    }
    for(const [file,hash]of Object.entries(sources))assert.equal(crypto.createHash('sha256').update(await fs.readFile(path.join(root,file))).digest('hex'),hash,`${file} changed during QA`);
    assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),commit,'HEAD changed during QA');
    const evidence={time:new Date().toISOString(),commit,browser:await browser.version(),origin,sources,results};
    await fs.writeFile(path.join(output,'browser-boot-results.json'),JSON.stringify(evidence,null,2));
    console.log(JSON.stringify({time:evidence.time,commit,browser:evidence.browser,results:results.map(({width,scenario,result,afterRelease})=>({width,scenario,result,afterRelease}))},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
