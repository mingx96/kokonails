import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assessPilotIntake } from '../scripts/check-pilot-template.mjs';
import { createLabServer } from '../scripts/serve-lab.mjs';

const fields=['salonIdentity','locations','servicesAndDurations','resourcesAndCapacity','hoursAndClosures','schedulingBuffers','treatwellBookingLinks','manualReconciliationProcedure'];
const empty=()=>Object.fromEntries(fields.map(field=>[field,null]));
const complete=()=>Object.fromEntries(fields.map(field=>[field,{synthetic:'SYNTHETIC_VALUE_MUST_NOT_BE_ECHOED'}]));
function blocked(result,status,invalidStructure){
  assert.equal(result.ready,false);
  assert.equal(result.status,status);
  assert.equal(result.invalidStructure,invalidStructure);
  assert.deepEqual(Object.keys(result).sort(),['invalidStructure','missingFields','ready','status']);
  assert.ok(Array.isArray(result.missingFields));
  assert.ok(result.missingFields.every(field=>fields.includes(field)));
  assert.ok(!JSON.stringify(result).includes('SYNTHETIC_VALUE_MUST_NOT_BE_ECHOED'));
}

test('pilot template is one JSON intake with exactly eight unset business fields',async()=>{
  const directory=new URL('../config/',import.meta.url);
  assert.deepEqual((await readdir(directory)).filter(name=>name.endsWith('.json')),['pilot.template.json']);
  const template=JSON.parse(await readFile(new URL('pilot.template.json',directory),'utf8'));
  assert.deepEqual(template,empty());
  assert.equal(Object.keys(template).length,8);
});

test('pilot omitted and null business facts report known missing fields and never readiness',()=>{
  for(const input of [{},empty()]){
    const result=assessPilotIntake(input);
    blocked(result,'BLOCKED_MISSING_BUSINESS_FACTS',false);
    assert.deepEqual(result.missingFields,fields);
  }
});

test('pilot partial and empty facts remain blocked without returning their values',()=>{
  for(const value of [null,'',' \n ',[],{}]){
    const input=Object.fromEntries(fields.map(field=>[field,value]));
    const result=assessPilotIntake(input);
    blocked(result,'BLOCKED_MISSING_BUSINESS_FACTS',false);
    assert.deepEqual(result.missingFields,fields);
  }
  const partial={...empty(),salonIdentity:{synthetic:'SYNTHETIC_VALUE_MUST_NOT_BE_ECHOED'}};
  const result=assessPilotIntake(partial);
  blocked(result,'BLOCKED_MISSING_BUSINESS_FACTS',false);
  assert.deepEqual(result.missingFields,fields.filter(field=>field!=='salonIdentity'));
});

test('pilot malformed structures, unknown authority flags and accessors are rejected without execution or echo',()=>{
  let invoked=false;
  const accessor=empty();
  Object.defineProperty(accessor,'salonIdentity',{enumerable:true,get(){invoked=true;return 'SYNTHETIC_VALUE_MUST_NOT_BE_ECHOED';}});
  for(const input of [null,[],false,42,'SYNTHETIC_VALUE_MUST_NOT_BE_ECHOED',new Date(),{...complete(),enabled:true},{...complete(),outboundEnabled:true},{...complete(),[Symbol('authority')]:true},{...empty(),salonIdentity:false},{...empty(),salonIdentity:0},{...empty(),salonIdentity:()=>true},{...empty(),salonIdentity:Symbol('fixture')},accessor]){
    const result=assessPilotIntake(input);
    blocked(result,'BLOCKED_INVALID_CONFIGURATION',true);
    assert.ok(!JSON.stringify(result).includes('outboundEnabled'));
    assert.ok(!JSON.stringify(result).includes('authority'));
  }
  assert.equal(invoked,false);
});

test('pilot nonempty intake is still unverified and cannot approve or activate anything',()=>{
  const input=complete();
  const before=structuredClone(input);
  const result=assessPilotIntake(input);
  blocked(result,'BLOCKED_UNVERIFIED_BUSINESS_FACTS',false);
  assert.deepEqual(result.missingFields,[]);
  assert.deepEqual(input,before);
});

test('pilot CLI diagnoses only the default unset template and exits one as expected BLOCKED',async()=>{
  const script=fileURLToPath(new URL('../scripts/check-pilot-template.mjs',import.meta.url));
  const root=fileURLToPath(new URL('../',import.meta.url));
  const cli=spawnSync(process.execPath,[script],{cwd:root,encoding:'utf8',timeout:5000});
  assert.equal(cli.error,undefined);
  assert.equal(cli.signal,null);
  assert.equal(cli.status,1,'BLOCKED is the intended CLI exit, not activation');
  assert.equal(cli.stderr,'');
  const result=JSON.parse(cli.stdout);
  blocked(result,'BLOCKED_MISSING_BUSINESS_FACTS',false);
  assert.deepEqual(result.missingFields,fields);
  assert.deepEqual(result,assessPilotIntake(JSON.parse(await readFile(new URL('../config/pilot.template.json',import.meta.url),'utf8'))));
  const extra=spawnSync(process.execPath,[script,'--file','synthetic-other.json'],{cwd:root,encoding:'utf8',timeout:5000});
  assert.equal(extra.status,1);assert.equal(extra.stderr,'');
  blocked(JSON.parse(extra.stdout),'BLOCKED_INVALID_CONFIGURATION',true);
  assert.ok(!extra.stdout.includes('synthetic-other.json'));
});

test('pilot intake configuration and diagnostic script are not exposed by the lab source server',async(t)=>{
  const server=createLabServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin=`http://127.0.0.1:${server.address().port}`;
  for(const route of ['/config/pilot.template.json','/scripts/check-pilot-template.mjs','/api/pilot']){
    const response=await fetch(origin+route);
    assert.equal(response.status,404);
    assert.equal(await response.text(),'');
  }
});
