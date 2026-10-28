import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakeBookingSystem, createFakeBookingRepository, createFakeIdentityAdapter } from '../server/fake-booking-adapter.mjs';
import { createBookingService } from '../server/booking-service.mjs';

const startAt='2027-02-18T13:30:00.000Z';
const startMs=Date.parse(startAt);
const requestInput={locationId:'demo-a',serviceId:'demo-care',customerId:'demo-01',startAt,privacyAccepted:true};
const customer='fixture-customer-01';
const staff='fixture-staff-a';
const confirmation=(booking)=>({resourceId:'resource-a1',manuallyChecked:true,matchedLocationId:booking.locationId,matchedStartAt:booking.startAt,treatwellReference:'DEMO-DELTA-CLOCK'});
const codeError=(code)=>Object.assign(new Error('synthetic-private-message-marker'),{code,details:{input:'synthetic-private-input-marker'}});

async function denial(system,code,operation) {
  const before=system.inspect();
  await assert.rejects(operation,error=>error.code===code);
  assert.deepEqual(system.inspect(),before,`${code} must preserve all state`);
}

test('delta clock: first confirmation at start minus one millisecond succeeds',async()=>{
  let now=startMs-60_000;
  const system=createFakeBookingSystem({clock:()=>new Date(now)});
  const pending=await system.service.request(customer,requestInput,'delta-future-request');
  now=startMs-1;
  const confirmed=await system.service.confirm(staff,pending.id,confirmation(pending),'delta-future-confirm');
  assert.equal(confirmed.status,'CONFIRMED');
  assert.equal(confirmed.startAt,startAt);
});

for(const offset of [0,1,86_400_000]) {
  test(`delta clock: first confirmation at start plus ${offset}ms denies without any effect`,async()=>{
    let now=startMs-60_000;
    const system=createFakeBookingSystem({clock:()=>new Date(now)});
    const pending=await system.service.request(customer,requestInput,'delta-boundary-request');
    now=startMs+offset;
    await denial(system,'PAST_TIME',()=>system.service.confirm(staff,pending.id,confirmation(pending),'delta-boundary-confirm'));
    const existing=await system.service.get(customer,pending.id);
    assert.equal(existing.status,'PENDING','clock denial must not invent an expiry transition');
    assert.equal(existing.effectiveState,'PENDING');
    // A test-only clock rewind demonstrates the failed command consumed neither
    // key, reference, sequence nor allocation. It is not an operational retry rule.
    now=startMs-1;
    assert.equal((await system.service.confirm(staff,pending.id,confirmation(pending),'delta-boundary-confirm')).status,'CONFIRMED');
  });
}

test('delta clock: queued confirmation rechecks time after asynchronous identity resolution', {timeout:3000}, async()=>{
  let now=startMs-1000;
  const repository=createFakeBookingRepository();
  const fakeIdentity=createFakeIdentityAdapter();
  let enteredResolve;
  let releaseResolve;
  const entered=new Promise(resolve=>{enteredResolve=resolve;});
  const release=new Promise(resolve=>{releaseResolve=resolve;});
  const identity={resolve:async(session)=>{
    const actor=await fakeIdentity.resolve(session);
    if(session===staff){enteredResolve();await release;}
    return actor;
  }};
  const service=createBookingService({repository,identity,clock:()=>new Date(now)});
  const system={service,inspect:()=>repository.inspect()};
  const pending=await service.request(customer,requestInput,'delta-queued-request');
  const before=system.inspect();
  const result=service.confirm(staff,pending.id,confirmation(pending),'delta-queued-confirm');
  const rejection=assert.rejects(result,error=>error.code==='PAST_TIME');
  await entered;
  now=startMs;
  releaseResolve();
  await rejection;
  assert.deepEqual(system.inspect(),before);
});

test('delta clock: successful identical replay later returns original outcome and still reauthorizes first',async()=>{
  let now=startMs-60_000;
  let granted=true;
  const repository=createFakeBookingRepository();
  const fakeIdentity=createFakeIdentityAdapter();
  const identity={resolve:async(session)=>{
    const actor=await fakeIdentity.resolve(session);
    if(actor?.role==='staff'&&!granted)actor.locationIds=[];
    return actor;
  }};
  const service=createBookingService({repository,identity,clock:()=>new Date(now)});
  const system={service,inspect:()=>repository.inspect()};
  const pending=await service.request(customer,requestInput,'delta-replay-request');
  now=startMs-1;
  const action=confirmation(pending);
  const original=await service.confirm(staff,pending.id,action,'delta-replay-confirm');
  const before=system.inspect();
  now=startMs+86_400_000;
  assert.deepEqual(await service.confirm(staff,pending.id,action,'delta-replay-confirm'),original);
  assert.deepEqual(system.inspect(),before);
  granted=false;
  await denial(system,'FORBIDDEN',()=>service.confirm(staff,pending.id,action,'delta-replay-confirm'));
  await denial(system,'UNAUTHENTICATED',()=>service.confirm('fixture-unknown',pending.id,action,'delta-replay-confirm'));
  granted=true;
  assert.deepEqual(await service.confirm(staff,pending.id,action,'delta-replay-confirm'),original);
  assert.deepEqual(system.inspect(),before);
  await denial(system,'INVALID_TRANSITION',()=>service.confirm(staff,pending.id,action,'delta-new-terminal-key'));
});

const groups=[
  {status:401,code:'AUTHENTICATION_REQUIRED',reasons:['UNAUTHENTICATED']},
  {status:404,code:'RESOURCE_UNAVAILABLE',reasons:['FORBIDDEN','NOT_FOUND','UNKNOWN_LOCATION','UNKNOWN_SERVICE','UNKNOWN_CUSTOMER','UNKNOWN_RESOURCE']},
  {status:400,code:'INVALID_REQUEST',reasons:['INVALID_INPUT','INVALID_IDEMPOTENCY_KEY','INVALID_START_AT','PRIVACY_REQUIRED','INVALID_REFERENCE']},
  {status:409,code:'REQUEST_CONFLICT',reasons:['IDEMPOTENCY_CONFLICT','DUPLICATE_REQUEST','INVALID_TRANSITION','REFERENCE_CONFLICT','RESOURCE_CONFLICT','RECONCILIATION_MISMATCH']},
  {status:409,code:'REQUEST_NOT_ALLOWED',reasons:['PAST_TIME','RECONCILIATION_REQUIRED','POLICY_UNDECIDED']},
  {status:500,code:'INTERNAL_ERROR',reasons:['INVALID_CONFIGURATION','ADAPTER_FAILURE']},
];

for(const group of groups) {
  test(`delta mapper: ${group.code} is a frozen fixed descriptor and retains trusted internal reasons`,async()=>{
    const {toExternalBookingError,getInternalBookingReason}=await import('../server/booking-errors.mjs');
    let first;
    for(const reason of group.reasons) {
      const original=codeError(reason);
      const descriptor=toExternalBookingError(original);
      assert.equal(Object.getPrototypeOf(descriptor),Object.prototype);
      assert.equal(Object.isFrozen(descriptor),true);
      assert.deepEqual(Object.keys(descriptor).sort(),['code','message','status']);
      assert.equal(descriptor.status,group.status);
      assert.equal(descriptor.code,group.code);
      assert.equal(typeof descriptor.message,'string');
      assert.ok(descriptor.message.length>0);
      assert.ok(!JSON.stringify(descriptor).includes('synthetic-private'));
      if(first)assert.deepEqual(descriptor,first,'equivalent resource/internal reasons must not change external output');
      first=descriptor;
      assert.equal(getInternalBookingReason(original),reason);
      assert.equal(original.code,reason);
      assert.equal(original.message,'synthetic-private-message-marker');
    }
  });
}

test('delta mapper: unknown or malformed errors are generic without executing diagnostic accessors',async()=>{
  const {toExternalBookingError,getInternalBookingReason}=await import('../server/booking-errors.mjs');
  const generic=toExternalBookingError(codeError('ADAPTER_FAILURE'));
  let diagnosticRead=false;
  const withDiagnostics={code:'FORBIDDEN'};
  Object.defineProperties(withDiagnostics,{
    message:{get(){diagnosticRead=true;throw new Error('synthetic-private-getter');}},
    stack:{get(){diagnosticRead=true;throw new Error('synthetic-private-stack');}},
  });
  assert.equal(toExternalBookingError(withDiagnostics).code,'RESOURCE_UNAVAILABLE');
  assert.equal(getInternalBookingReason(withDiagnostics),'FORBIDDEN');
  assert.equal(diagnosticRead,false);
  let codeRead=false;
  const codeAccessor={};
  Object.defineProperty(codeAccessor,'code',{get(){codeRead=true;return 'FORBIDDEN';}});
  assert.deepEqual(toExternalBookingError(codeAccessor),generic);
  assert.equal(getInternalBookingReason(codeAccessor),'ADAPTER_FAILURE');
  assert.equal(codeRead,false,'error-code accessors are not stable diagnostic data');
  for(const value of [undefined,null,false,42,'synthetic-private-string',[],{},codeError('synthetic-private-unknown-code'),{code:{toString(){throw new Error('must not coerce');}}}]) {
    assert.deepEqual(toExternalBookingError(value),generic);
    assert.equal(getInternalBookingReason(value),'ADAPTER_FAILURE');
  }
});

test('delta mapper: missing and inaccessible real fixture records look identical externally while a fake sink retains distinct stable reasons',async()=>{
  const {toExternalBookingError,getInternalBookingReason}=await import('../server/booking-errors.mjs');
  const system=createFakeBookingSystem({clock:()=>new Date(startMs-60_000)});
  const b=await system.service.request('fixture-customer-02',{...requestInput,locationId:'demo-b',customerId:'demo-02'},'delta-mapper-hidden');
  const before=system.inspect();
  const diagnostics=[];
  const external=[];
  for(const id of ['demo-booking-missing',b.id]) {
    try {await system.service.get(staff,id);assert.fail('expected denial');}
    catch(error) {
      diagnostics.push({reason:getInternalBookingReason(error)});
      external.push(toExternalBookingError(error));
      assert.equal(error.code,diagnostics.at(-1).reason,'mapper must not overwrite internal reason');
    }
  }
  assert.deepEqual(external[0],external[1]);
  assert.equal(external[0].code,'RESOURCE_UNAVAILABLE');
  assert.equal(external[0].status,404);
  assert.deepEqual(diagnostics,[{reason:'NOT_FOUND'},{reason:'FORBIDDEN'}]);
  assert.deepEqual(system.inspect(),before,'mapping/logging test must not mutate domain repository');
});
