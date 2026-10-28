import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { createLabServer } from '../scripts/serve-lab.mjs';
import { createLabController } from '../lab/controller.mjs';

const fixtureInput=(patch={})=>({locationId:'demo-a',serviceId:'demo-care',customerId:'demo-01',startAt:'2027-02-18T13:30:00.000Z',privacyAccepted:true,...patch});
const confirmBody=(booking,patch={})=>({resourceId:'resource-a1',manuallyChecked:true,matchedLocationId:booking.locationId,matchedStartAt:booking.startAt,treatwellReference:'DEMO-LAB-INDEPENDENT',...patch});
async function ok(operation) {const result=await operation;assert.equal(result.ok,true,JSON.stringify(result));return result.value;}
async function confirmed(controller) {
  const pending=await ok(controller.request(fixtureInput()));
  await ok(controller.setActor('fixture-staff-a'));
  return ok(controller.confirm(pending.id,confirmBody(pending)));
}

async function labServer(t) {
  const server=createLabServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('lab independent server serves only fixed source assets, with no API or request-body route',async(t)=>{
  const origin=await labServer(t);
  for(const route of ['/','/lab/styles.css','/public/booking.mjs','/server/booking-service.mjs','/server/fake-booking-adapter.mjs','/server/booking-errors.mjs','/robots.txt','/favicon.svg']) {
    for(const method of ['GET','HEAD']) {
      const response=await fetch(origin+route,{method});
      assert.equal(response.status,200,`${method} ${route}`);
      assert.match(response.headers.get('x-robots-tag'),/noindex/);
      assert.equal(response.headers.get('cache-control'),'no-store');
      assert.equal(response.headers.get('referrer-policy'),'no-referrer');
      if(method==='HEAD')assert.equal(await response.text(),'');
    }
  }
  for(const method of ['POST','PUT','PATCH','DELETE','OPTIONS']) {
    const response=await fetch(origin+'/',{method,body:'synthetic-test-body'});
    assert.equal(response.status,405,method);
    assert.equal(response.headers.get('allow'),'GET, HEAD');
    assert.equal(await response.text(),'');
  }
});

test('lab independent server refuses non-loopback Host, query variants and unlisted paths',async(t)=>{
  const origin=await labServer(t);
  // Node fetch normalizes Host; raw http.request is required to exercise the
  // server's Host boundary while the network destination stays loopback.
  const wrongHost=await new Promise((resolve,reject)=>{
    const request=httpRequest(origin,{headers:{Host:'synthetic.invalid'}},response=>{
      const chunks=[];
      response.on('data',chunk=>chunks.push(chunk));
      response.on('end',()=>resolve({status:response.statusCode,body:Buffer.concat(chunks).toString('utf8')}));
    });
    request.on('error',reject);
    request.end();
  });
  assert.equal(wrongHost.status,403);
  assert.equal(wrongHost.body,'');
  for(const route of ['/?reference=DEMO-SYNTHETIC','/lab/styles.css?x=1','/api/bookings','/api/admin','/public/index.html','/lab/index.html','/server/README.md','/docs/server-review.md','/.git/config','/../AGENTS.md','/%2e%2e%2fAGENTS.md']) {
    const response=await fetch(origin+route);
    assert.equal(response.status,404,route);
    assert.equal(await response.text(),'');
    assert.equal(response.headers.get('cache-control'),'no-store');
  }
});

test('lab independent server returns exact existing domain modules instead of transformed copies',async(t)=>{
  const origin=await labServer(t);
  for(const file of ['server/booking-service.mjs','server/fake-booking-adapter.mjs','server/booking-errors.mjs','public/booking.mjs']) {
    const response=await fetch(`${origin}/${file}`);
    assert.equal(response.status,200);
    assert.equal(await response.text(),await readFile(new URL(`../${file}`,import.meta.url),'utf8'));
  }
});

test('lab independent controller clears receipts and queues on fixture role/location changes and invalid session',async()=>{
  const controller=createLabController();
  const initial=controller.getState();
  assert.equal(initial.scenario,'locked');
  assert.equal(initial.actorSession,'fixture-customer-01');
  assert.equal(Object.isFrozen(initial),true);
  assert.equal(Object.isFrozen(initial.bookings),true);
  const pending=await ok(controller.request(fixtureInput()));
  assert.equal(pending.status,'PENDING');
  assert.equal(controller.getState().receipt.id,pending.id);
  assert.deepEqual(controller.getState().bookings,[]);
  await ok(controller.setActor('fixture-customer-02'));
  assert.equal(controller.getState().receipt,null);
  await ok(controller.setActor('fixture-staff-a'));
  assert.deepEqual(controller.getState().bookings.map(x=>x.id),[pending.id]);
  const forbidden=await controller.setLocation('demo-b');
  assert.equal(forbidden.error.code,'RESOURCE_UNAVAILABLE');
  assert.deepEqual(controller.getState().bookings,[]);
  assert.deepEqual(controller.getState().changes,[]);
  await ok(controller.setActor('fixture-staff-all'));
  assert.deepEqual(controller.getState().bookings,[]);
  await ok(controller.setLocation('demo-a'));
  assert.deepEqual(controller.getState().bookings.map(x=>x.id),[pending.id]);
  const invalid=await controller.setActor('invalid-fixture');
  assert.equal(invalid.error.code,'AUTHENTICATION_REQUIRED');
  assert.equal(controller.getState().actorSession,null);
  assert.deepEqual(controller.getState().bookings,[]);
  assert.equal(controller.getState().receipt,null);
});

test('lab independent busy guard refuses simultaneous scope/reset/commands and captures immutable request input',async()=>{
  let release;
  let held=true;
  const gate=new Promise(resolve=>{release=resolve;});
  const controller=createLabController({delay:()=>held?gate:Promise.resolve()});
  const payload=fixtureInput();
  const request=controller.request(payload);
  assert.equal(controller.getState().busy,true);
  payload.customerId='demo-02';payload.locationId='demo-b';
  for(const result of [await controller.setActor('fixture-staff-b'),await controller.setLocation('demo-b'),controller.reset('changes'),await controller.request(fixtureInput())]) {
    assert.equal(result.ok,false);
    assert.equal(result.error.code,'REQUEST_CONFLICT');
  }
  const busy=controller.getState();
  assert.equal(busy.actorSession,'fixture-customer-01');
  assert.equal(busy.locationId,'demo-a');
  assert.equal(busy.scenario,'locked');
  held=false;release();
  const outcome=await ok(request);
  assert.equal(outcome.customerId,'demo-01');
  assert.equal(outcome.locationId,'demo-a');
  assert.equal(controller.getState().busy,false);
  await ok(controller.setActor('fixture-staff-a'));
  assert.equal(controller.getState().bookings.length,1);
  assert.equal(controller.reset('changes').ok,true);
  assert.equal(controller.getState().scenario,'changes');
  assert.equal(controller.getState().receipt,null);
  assert.deepEqual(controller.getState().bookings,[]);
  await ok(controller.setActor('fixture-staff-a'));
  assert.deepEqual(controller.getState().bookings,[]);
  assert.equal((await controller.confirm(outcome.id,confirmBody(outcome))).error.code,'RESOURCE_UNAVAILABLE');
});

test('lab independent default changes deny; explicit reset fixture erases prior state and permits a new proposal',async()=>{
  const controller=createLabController();
  const booking=await confirmed(controller);
  const denied=await controller.proposeChange(booking.id,{kind:'CANCEL'});
  assert.equal(denied.error.code,'REQUEST_NOT_ALLOWED');
  assert.deepEqual(controller.getState().changes,[]);
  assert.equal(controller.getState().bookings[0].status,'CONFIRMED');
  assert.equal(controller.reset('changes').ok,true);
  const fresh=await confirmed(controller);
  assert.equal((await ok(controller.proposeChange(fresh.id,{kind:'CANCEL'}))).status,'PENDING');
});

test('lab independent missing and inaccessible source IDs have equal non-enumerating errors',async()=>{
  const controller=createLabController();
  await ok(controller.setLocation('demo-b'));
  const hidden=await ok(controller.request(fixtureInput({locationId:'demo-b'})));
  assert.equal((await controller.setActor('fixture-staff-a')).error.code,'RESOURCE_UNAVAILABLE');
  await ok(controller.setLocation('demo-a'));
  const missing=await controller.confirm('demo-booking-nonexistent',confirmBody(hidden));
  const inaccessible=await controller.confirm(hidden.id,confirmBody(hidden));
  assert.deepEqual(missing,inaccessible);
  assert.deepEqual(Object.keys(missing.error).sort(),['code','message','status']);
  assert.equal(missing.error.code,'RESOURCE_UNAVAILABLE');
  assert.equal(missing.error.status,404);
  assert.equal(Object.isFrozen(missing.error),true);
  assert.ok(!JSON.stringify(missing).includes(hidden.id));
});

test('lab independent request replay stays stable while active and new user request after decline has a fresh ID',async()=>{
  const controller=createLabController();
  const first=await ok(controller.request(fixtureInput()));
  assert.equal((await ok(controller.request(fixtureInput()))).id,first.id);
  await ok(controller.setActor('fixture-staff-a'));
  await ok(controller.decline(first.id));
  await ok(controller.setActor('fixture-customer-01'));
  const next=await ok(controller.request(fixtureInput()));
  assert.notEqual(next.id,first.id);
  await ok(controller.setActor('fixture-staff-a'));
  assert.deepEqual(controller.getState().bookings.map(x=>x.status).sort(),['DECLINED','PENDING']);
});

for(const action of [{kind:'CANCEL'},{kind:'RESCHEDULE',newStartAt:'2027-02-19T13:30:00.000Z'}]) {
  test(`lab independent sequential ${action.kind} rejection permits a fresh proposal while pending replay remains stable`,async()=>{
    const controller=createLabController({scenario:'changes'});
    const booking=await confirmed(controller);
    const first=await ok(controller.proposeChange(booking.id,action));
    assert.equal((await ok(controller.proposeChange(booking.id,action))).id,first.id);
    await ok(controller.rejectChange(first.id));
    const second=await ok(controller.proposeChange(booking.id,action));
    assert.notEqual(second.id,first.id);
    assert.equal((await ok(controller.proposeChange(booking.id,action))).id,second.id);
    assert.deepEqual(controller.getState().changes.map(x=>[x.id,x.status]),[[first.id,'REJECTED'],[second.id,'PENDING']]);
    assert.equal((await controller.setLocation('demo-b')).error.code,'RESOURCE_UNAVAILABLE');
    assert.deepEqual(controller.getState().changes,[]);
    await ok(controller.setLocation('demo-a'));
    assert.deepEqual(controller.getState().changes.map(x=>[x.id,x.status]),[[first.id,'REJECTED'],[second.id,'PENDING']]);
  });
}
