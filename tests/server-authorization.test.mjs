import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakeBookingSystem, createFakeBookingRepository, createFakeIdentityAdapter } from '../server/fake-booking-adapter.mjs';
import { createBookingService } from '../server/booking-service.mjs';

const session = { customer1:'fixture-customer-01', customer2:'fixture-customer-02', staffA:'fixture-staff-a', staffB:'fixture-staff-b', all:'fixture-staff-all' };
const clock = () => new Date('2027-01-15T09:00:00.000Z');
const start = '2027-02-18T13:30:00.000Z';
const later = '2027-02-18T15:30:00.000Z';
const input = (patch = {}) => ({locationId:'demo-a',serviceId:'demo-care',customerId:'demo-01',startAt:start,privacyAccepted:true,...patch});
const setup = (options = {}) => createFakeBookingSystem({clock,...options});
const confirmation = (booking, patch = {}) => ({resourceId:booking.locationId==='demo-a'?'resource-a1':'resource-b1',manuallyChecked:true,matchedLocationId:booking.locationId,matchedStartAt:booking.startAt,treatwellReference:'DEMO-QA-SOURCE',...patch});
const cancelAction = (booking, patch = {}) => ({manuallyChecked:true,matchedLocationId:booking.locationId,matchedOriginalStartAt:booking.startAt,originalTreatwellReference:booking.treatwellReference,changeReference:'DEMO-QA-CHANGE',...patch});
const rescheduleAction = (booking, patch = {}) => ({...cancelAction(booking),matchedNewStartAt:later,resourceId:'resource-a1',replacementTreatwellReference:'DEMO-QA-REPLACEMENT',...patch});

async function denied(system, expectedCode, operation) {
  const before = system.inspect();
  await assert.rejects(operation, error => error.code === expectedCode && typeof error.message === 'string');
  assert.deepEqual(system.inspect(),before,`${expectedCode} changed repository state`);
}

async function confirmed(system, patch = {}, suffix = 'one') {
  const requested=await system.service.request(session.customer1,input(patch),`qa-request-${suffix}`);
  return system.service.confirm(session.all,requested.id,confirmation(requested,{treatwellReference:`DEMO-SOURCE-${suffix.toUpperCase()}`}),`qa-confirm-${suffix}`);
}

function poison(snapshot) {
  for(const key of Object.keys(snapshot)) {
    if(snapshot[key] && typeof snapshot[key] === 'object') poison(snapshot[key]);
    else snapshot[key]='synthetic-mutated-snapshot';
  }
}

test('QA identity denial precedes validation, existence and undecided change policy for every service method', async () => {
  const system=setup();
  const existing=await system.service.request(session.customer1,input(),'qa-existing-request');
  for(const invalid of [undefined,null,{},123,'fixture-unknown',{role:'staff',locationIds:['demo-a']}]) {
    for(const operation of [
      ()=>system.service.request(invalid,null,'short'),
      ()=>system.service.get(invalid,existing.id),
      ()=>system.service.get(invalid,'missing-booking'),
      ()=>system.service.list(invalid,{locationId:'demo-a'}),
      ()=>system.service.confirm(invalid,existing.id,{},'qa-denied-confirm'),
      ()=>system.service.confirm(invalid,'missing-booking',{},'qa-denied-confirm'),
      ()=>system.service.decline(invalid,existing.id,{},'qa-denied-decline'),
      ()=>system.service.proposeChange(invalid,existing.id,{kind:'CANCEL'},'qa-denied-proposal'),
      ()=>system.service.rejectChange(invalid,'missing-change',{},'qa-denied-reject'),
      ()=>system.service.applyChange(invalid,'missing-change',{},'qa-denied-apply'),
    ]) await denied(system,'UNAUTHENTICATED',operation);
  }
});

test('QA customers cannot impersonate another fixture identity or perform staff reads/writes', async () => {
  const system=setup({changePolicy:()=>true});
  const own=await system.service.request(session.customer1,input(),'qa-customer-owned');
  const other=await system.service.request(session.customer2,input({customerId:'demo-02',locationId:'demo-b'}),'qa-other-owned');
  assert.equal((await system.service.get(session.customer1,own.id)).id,own.id);
  for(const operation of [
    ()=>system.service.request(session.customer1,input({customerId:'demo-02'}),'qa-impersonation'),
    ()=>system.service.get(session.customer1,other.id),
    ()=>system.service.list(session.customer1,{locationId:'demo-a'}),
    ()=>system.service.confirm(session.customer1,own.id,confirmation(own),'qa-customer-confirm'),
    ()=>system.service.decline(session.customer1,own.id,{},'qa-customer-decline'),
    ()=>system.service.proposeChange(session.customer1,own.id,{kind:'CANCEL'},'qa-customer-change'),
  ]) await denied(system,'FORBIDDEN',operation);
});

test('QA strict request allowlist rejects client authority, contact, price and duration fields without echoing values', async () => {
  const system=setup();
  for(const extra of [
    {role:'staff'},{locationIds:['demo-a','demo-b']},{status:'CONFIRMED'},
    {durationMinutes:1},{endAt:later},{price:0},{resourceId:'resource-a1'},
    {contact:'synthetic-private-marker@example.invalid'},
  ]) {
    const before=system.inspect();
    await assert.rejects(()=>system.service.request(session.customer1,input(extra),'qa-injected-body'),error=>
      error.code==='INVALID_INPUT' && !error.message.includes('synthetic-private-marker'));
    assert.deepEqual(system.inspect(),before);
  }
  for(const bad of [null,[],false,'synthetic']) await denied(system,'INVALID_INPUT',()=>system.service.request(session.customer1,bad,'qa-invalid-body'));
  let accessorInvoked=false;
  const accessorInput=input();
  Object.defineProperty(accessorInput,'customerId',{get(){accessorInvoked=true;return 'demo-01';},enumerable:true});
  await denied(system,'INVALID_INPUT',()=>system.service.request(session.customer1,accessorInput,'qa-input-accessor'));
  assert.equal(accessorInvoked,false,'input accessors must not execute as data');
  await denied(system,'INVALID_INPUT',()=>system.service.request(session.customer1,{...input(),[Symbol('role')]:'staff'},'qa-symbol-field'));
  for(const [patch,code] of [
    [{locationId:'not-a-fixture'},'UNKNOWN_LOCATION'],
    [{serviceId:'not-a-fixture'},'UNKNOWN_SERVICE'],
    [{customerId:'not-a-fixture'},'UNKNOWN_CUSTOMER'],
    [{privacyAccepted:'true'},'PRIVACY_REQUIRED'],
    [{privacyAccepted:false},'PRIVACY_REQUIRED'],
    [{startAt:'2027-02-18T13:30:00Z'},'INVALID_START_AT'],
    [{startAt:'2027-02-18T13:30:00.000+00:00'},'INVALID_START_AT'],
    [{startAt:'2027-02-30T13:30:00.000Z'},'INVALID_START_AT'],
    [{startAt:' 2027-02-18T13:30:00.000Z '},'INVALID_START_AT'],
    [{startAt:new Date(start)},'INVALID_START_AT'],
    [{startAt:'2027-01-15T09:00:00.000Z'},'PAST_TIME'],
  ]) await denied(system,code,()=>system.service.request(session.all,input(patch),'qa-invalid-fields'));
});

test('QA staff location grants constrain request, get, list, confirmation and decline', async () => {
  const system=setup();
  const a=await system.service.request(session.staffA,input(),'qa-staff-a-create');
  const b=await system.service.request(session.staffB,input({customerId:'demo-02',locationId:'demo-b'}),'qa-staff-b-create');
  assert.deepEqual((await system.service.list(session.staffA,{locationId:'demo-a'})).map(x=>x.id),[a.id]);
  assert.deepEqual((await system.service.list(session.staffB,{locationId:'demo-b'})).map(x=>x.id),[b.id]);
  for(const operation of [
    ()=>system.service.request(session.staffA,input({locationId:'demo-b',startAt:later}),'qa-cross-create'),
    ()=>system.service.get(session.staffA,b.id),
    ()=>system.service.list(session.staffA,{locationId:'demo-b'}),
    ()=>system.service.confirm(session.staffA,b.id,confirmation(b),'qa-cross-confirm'),
    ()=>system.service.decline(session.staffA,b.id,{},'qa-cross-decline'),
  ]) await denied(system,'FORBIDDEN',operation);
  await denied(system,'INVALID_INPUT',()=>system.service.list(session.all,{locationId:'demo-a',role:'staff'}));
  await denied(system,'UNKNOWN_LOCATION',()=>system.service.list(session.all,{locationId:'not-a-fixture'}));
});

test('QA idempotency belongs to the authenticated actor and spans operations and targets', async () => {
  const system=setup();
  const a=await system.service.request(session.staffA,input(),'qa-shared-actor-key');
  const b=await system.service.request(session.staffB,input({locationId:'demo-b',customerId:'demo-02'}),'qa-shared-actor-key');
  assert.notEqual(a.id,b.id);
  const before=system.inspect();
  const replay=await system.service.request(session.staffA,{...input()},'qa-shared-actor-key');
  assert.deepEqual(replay,a);
  assert.deepEqual(system.inspect(),before);
  await denied(system,'IDEMPOTENCY_CONFLICT',()=>system.service.decline(session.staffA,a.id,{},'qa-shared-actor-key'));
  await denied(system,'IDEMPOTENCY_CONFLICT',()=>system.service.request(session.staffA,input({startAt:later}),'qa-shared-actor-key'));
  await denied(system,'FORBIDDEN',()=>system.service.request(session.staffA,input({locationId:'demo-b'}),'qa-shared-actor-key'));
});

test('QA revocation and role changes are re-resolved before an identical idempotency replay', async () => {
  const repository=createFakeBookingRepository();
  let actor={id:'qa-mutable-staff',role:'staff',locationIds:['demo-a']};
  const service=createBookingService({repository,clock,identity:{resolve:async()=>actor && structuredClone(actor)}});
  const system={service,inspect:()=>repository.inspect()};
  const pending=await service.request('synthetic-session',input(),'qa-before-revocation');
  const action=confirmation(pending);
  const outcome=await service.confirm('synthetic-session',pending.id,action,'qa-revoked-replay');
  actor.locationIds=['demo-b'];
  for(const operation of [
    ()=>service.get('synthetic-session',pending.id),
    ()=>service.list('synthetic-session',{locationId:'demo-a'}),
    ()=>service.confirm('synthetic-session',pending.id,action,'qa-revoked-replay'),
    ()=>service.request('synthetic-session',input(),'qa-before-revocation'),
  ]) await denied(system,'FORBIDDEN',operation);
  actor={id:'qa-mutable-staff',role:'customer',customerId:'demo-01'};
  await denied(system,'FORBIDDEN',()=>service.confirm('synthetic-session',pending.id,action,'qa-revoked-replay'));
  actor=null;
  await denied(system,'UNAUTHENTICATED',()=>service.confirm('synthetic-session',pending.id,action,'qa-revoked-replay'));
  actor={id:'qa-mutable-staff',role:'staff',locationIds:['demo-a']};
  const before=system.inspect();
  assert.deepEqual(await service.confirm('synthetic-session',pending.id,action,'qa-revoked-replay'),outcome);
  assert.deepEqual(system.inspect(),before);
});

test('QA service outcomes, reads, lists, replay results and inspect cannot edit stored state', async () => {
  const system=setup();
  const first=await system.service.request(session.customer1,input(),'qa-defensive-outcome');
  const original=structuredClone(first);
  const baseline=system.inspect();
  poison(first);
  assert.deepEqual(system.inspect(),baseline);
  const replay=await system.service.request(session.customer1,input(),'qa-defensive-outcome');
  assert.deepEqual(replay,original);
  poison(replay);
  poison(await system.service.get(session.customer1,original.id));
  poison(await system.service.list(session.staffA,{locationId:'demo-a'}));
  poison(system.inspect());
  assert.deepEqual(system.inspect(),baseline);
  const returned=await system.service.get(session.customer1,original.id);
  for(const internal of ['audit','idempotency','references','sequence','session','locationIds']) assert.equal(Object.hasOwn(returned,internal),false);
});

test('QA default policy denies authorized proposals while nonexistent changes remain NOT_FOUND', async () => {
  const system=setup();
  const booking=await confirmed(system);
  for(const operation of [
    ()=>system.service.proposeChange(session.staffA,booking.id,{kind:'CANCEL'},'qa-policy-propose'),
    ()=>system.service.proposeChange(session.staffA,booking.id,{kind:'RESCHEDULE',newStartAt:later},'qa-policy-reschedule'),
  ]) await denied(system,'POLICY_UNDECIDED',operation);
  await denied(system,'NOT_FOUND',()=>system.service.rejectChange(session.staffA,'missing-change',{},'qa-policy-reject'));
  await denied(system,'NOT_FOUND',()=>system.service.applyChange(session.staffA,'missing-change',{},'qa-policy-apply'));
});

test('QA default policy and policy revocation deny real existing changes and replay without mutating state', async () => {
  const repository=createFakeBookingRepository();
  const identity=createFakeIdentityAdapter();
  let allowed=true;
  const optIn=createBookingService({repository,identity,clock,changePolicy:()=>allowed});
  const defaultDeny=createBookingService({repository,identity,clock});
  const system={service:optIn,inspect:()=>repository.inspect()};
  const source=await confirmed(system);
  const change=await optIn.proposeChange(session.staffA,source.id,{kind:'CANCEL'},'qa-existing-policy-change');
  for(const operation of [
    ()=>defaultDeny.proposeChange(session.staffA,source.id,{kind:'CANCEL'},'qa-default-existing-proposal'),
    ()=>defaultDeny.rejectChange(session.staffA,change.id,{},'qa-default-existing-reject'),
    ()=>defaultDeny.applyChange(session.staffA,change.id,cancelAction(source),'qa-default-existing-apply'),
  ]) await denied(system,'POLICY_UNDECIDED',operation);
  const applied=await optIn.applyChange(session.staffA,change.id,cancelAction(source),'qa-policy-replay-applied');
  assert.equal(applied.status,'APPLIED');
  allowed=false;
  await denied(system,'POLICY_UNDECIDED',()=>optIn.applyChange(session.staffA,change.id,cancelAction(source),'qa-policy-replay-applied'));
  await denied(system,'POLICY_UNDECIDED',()=>optIn.proposeChange(session.staffA,source.id,{kind:'CANCEL'},'qa-existing-policy-change'));
  allowed=true;
  const before=system.inspect();
  assert.deepEqual(await optIn.applyChange(session.staffA,change.id,cancelAction(source),'qa-policy-replay-applied'),applied);
  assert.deepEqual(system.inspect(),before);
});

test('QA change kind accessor is rejected as data without executing user code', async () => {
  const system=setup({changePolicy:()=>true});
  const source=await confirmed(system);
  let invoked=false;
  const action={};
  Object.defineProperty(action,'kind',{enumerable:true,get(){invoked=true;return 'CANCEL';}});
  await denied(system,'INVALID_INPUT',()=>system.service.proposeChange(session.staffA,source.id,action,'qa-accessor-change-kind'));
  assert.equal(invoked,false,'proposeChange must not evaluate an accessor before exact input validation');
});

for(const competingStatus of ['PENDING','CONFIRMED']) {
  test(`QA reschedule rejects active same-customer/location/start ${competingStatus} even on a different resource`, async () => {
    const system=setup({changePolicy:()=>true});
    const source=await confirmed(system);
    const duplicate=await system.service.request(session.customer1,input({startAt:later}),'qa-active-customer-duplicate');
    let competitor=duplicate;
    if(competingStatus==='CONFIRMED') competitor=await system.service.confirm(session.staffA,duplicate.id,confirmation(duplicate,{resourceId:'resource-a2',treatwellReference:'DEMO-ACTIVE-DUPLICATE'}),'qa-confirm-active-duplicate');
    const change=await system.service.proposeChange(session.staffA,source.id,{kind:'RESCHEDULE',newStartAt:later},'qa-propose-customer-collision');
    await denied(system,'DUPLICATE_REQUEST',()=>system.service.applyChange(session.staffA,change.id,rescheduleAction(source),'qa-retry-customer-collision'));
    if(competingStatus==='PENDING') await system.service.decline(session.staffA,competitor.id,{},'qa-decline-customer-duplicate');
    else {
      const removal=await system.service.proposeChange(session.staffA,competitor.id,{kind:'CANCEL'},'qa-cancel-customer-duplicate');
      await system.service.applyChange(session.staffA,removal.id,cancelAction(competitor,{changeReference:'DEMO-REMOVE-DUPLICATE'}),'qa-apply-customer-duplicate-cancel');
    }
    assert.equal((await system.service.applyChange(session.staffA,change.id,rescheduleAction(source),'qa-retry-customer-collision')).status,'APPLIED');
    assert.equal((await system.service.get(session.customer1,source.id)).effectiveState,'RESCHEDULED');
  });
}

test('QA change proposals and rejection retain original terminal booking and allocation snapshots', async () => {
  const system=setup({changePolicy:()=>true});
  const booking=await confirmed(system);
  const before=system.inspect();
  const change=await system.service.proposeChange(session.staffA,booking.id,{kind:'RESCHEDULE',newStartAt:later},'qa-propose-only');
  assert.equal(change.status,'PENDING');
  assert.deepEqual(system.inspect().bookings,before.bookings);
  assert.deepEqual(system.inspect().allocations,before.allocations);
  assert.deepEqual(system.inspect().references,before.references);
  assert.equal((await system.service.get(session.customer1,booking.id)).effectiveState,'CONFIRMED');
  for(const operation of [
    ()=>system.service.proposeChange(session.staffB,booking.id,{kind:'CANCEL'},'qa-cross-proposal'),
    ()=>system.service.rejectChange(session.staffB,change.id,{},'qa-cross-reject'),
    ()=>system.service.applyChange(session.staffB,change.id,rescheduleAction(booking),'qa-cross-apply'),
    ()=>system.service.rejectChange(session.customer1,change.id,{},'qa-customer-reject'),
    ()=>system.service.applyChange(session.customer1,change.id,rescheduleAction(booking),'qa-customer-apply'),
  ]) await denied(system,'FORBIDDEN',operation);
  assert.equal((await system.service.rejectChange(session.staffA,change.id,{},'qa-reject-proposal')).status,'REJECTED');
  assert.deepEqual(system.inspect().bookings,before.bookings);
  assert.deepEqual(system.inspect().allocations,before.allocations);
  await denied(system,'INVALID_TRANSITION',()=>system.service.applyChange(session.staffA,change.id,rescheduleAction(booking),'qa-rejected-apply'));
});

test('QA cancellation derives effective state, preserves immutable CONFIRMED row and frees its allocation', async () => {
  const system=setup({changePolicy:()=>true});
  const source=await confirmed(system);
  const stored=structuredClone(system.inspect().bookings.find(x=>x.id===source.id));
  const competitor=await system.service.request(session.customer2,input({customerId:'demo-02'}),'qa-cancel-competitor');
  const competitorAction=confirmation(competitor,{treatwellReference:'DEMO-COMPETITOR'});
  await denied(system,'RESOURCE_CONFLICT',()=>system.service.confirm(session.staffA,competitor.id,competitorAction,'qa-retry-after-cancel'));
  const change=await system.service.proposeChange(session.staffA,source.id,{kind:'CANCEL'},'qa-cancel-proposal');
  assert.equal((await system.service.applyChange(session.staffA,change.id,cancelAction(source),'qa-cancel-apply')).status,'APPLIED');
  assert.deepEqual(system.inspect().bookings.find(x=>x.id===source.id),stored);
  const effective=await system.service.get(session.customer1,source.id);
  assert.equal(effective.status,'CONFIRMED');
  assert.equal(effective.effectiveState,'CANCELLED');
  assert.equal((await system.service.confirm(session.staffA,competitor.id,competitorAction,'qa-retry-after-cancel')).status,'CONFIRMED');
  await denied(system,'INVALID_TRANSITION',()=>system.service.decline(session.staffA,source.id,{},'qa-decline-cancelled'));
  await denied(system,'INVALID_TRANSITION',()=>system.service.proposeChange(session.staffA,source.id,{kind:'CANCEL'},'qa-repeat-cancel'));
});

test('QA opt-in reschedule requires exact attestation and creates a replacement without rewriting source', async () => {
  const system=setup({changePolicy:()=>true});
  const source=await confirmed(system);
  const stored=structuredClone(system.inspect().bookings.find(x=>x.id===source.id));
  const change=await system.service.proposeChange(session.staffA,source.id,{kind:'RESCHEDULE',newStartAt:later},'qa-reschedule-proposal');
  for(const [patch,code] of [
    [{manuallyChecked:false},'RECONCILIATION_REQUIRED'],
    [{matchedLocationId:'demo-b'},'RECONCILIATION_MISMATCH'],
    [{matchedOriginalStartAt:later},'RECONCILIATION_MISMATCH'],
    [{matchedNewStartAt:start},'RECONCILIATION_MISMATCH'],
    [{originalTreatwellReference:'DEMO-WRONG'},'RECONCILIATION_MISMATCH'],
    [{resourceId:'resource-b1'},'UNKNOWN_RESOURCE'],
    [{changeReference:'real-reference'},'INVALID_REFERENCE'],
    [{replacementTreatwellReference:source.treatwellReference},'REFERENCE_CONFLICT'],
  ]) await denied(system,code,()=>system.service.applyChange(session.staffA,change.id,rescheduleAction(source,patch),'qa-invalid-change-action'));
  assert.equal((await system.service.applyChange(session.staffA,change.id,rescheduleAction(source),'qa-reschedule-apply')).status,'APPLIED');
  assert.deepEqual(system.inspect().bookings.find(x=>x.id===source.id),stored);
  assert.equal((await system.service.get(session.customer1,source.id)).effectiveState,'RESCHEDULED');
  const replacements=system.inspect().bookings.filter(x=>x.id!==source.id);
  assert.equal(replacements.length,1);
  const replacement=await system.service.get(session.customer1,replacements[0].id);
  assert.equal(replacement.status,'CONFIRMED');
  assert.equal(replacement.effectiveState,'CONFIRMED');
  assert.equal(replacement.startAt,later);
  assert.equal(replacement.locationId,source.locationId);
  assert.equal(replacement.customerId,source.customerId);
});

test('QA concurrent overlapping confirmation has one winner and failed command consumes no outcome or reference', async () => {
  const system=setup();
  const one=await system.service.request(session.customer1,input(),'qa-concurrent-one');
  const two=await system.service.request(session.customer2,input({customerId:'demo-02'}),'qa-concurrent-two');
  assert.equal(system.inspect().allocations.length,0,'PENDING requests must not hold slots');
  const before=system.inspect();
  const commands=[
    {booking:one,action:confirmation(one,{treatwellReference:'DEMO-RACE-ONE'}),key:'qa-race-confirm-one'},
    {booking:two,action:confirmation(two,{treatwellReference:'DEMO-RACE-TWO'}),key:'qa-race-confirm-two'},
  ];
  const outcomes=await Promise.allSettled(commands.map(c=>system.service.confirm(session.staffA,c.booking.id,c.action,c.key)));
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(outcomes.find(x=>x.status==='rejected').reason.code,'RESOURCE_CONFLICT');
  const state=system.inspect();
  assert.equal(state.audit.length,before.audit.length+1);
  assert.equal(state.idempotency.length,before.idempotency.length+1);
  assert.equal(state.references.length,before.references.length+1);
  const loser=commands[outcomes.findIndex(x=>x.status==='rejected')];
  assert.equal((await system.service.get(session.customer2, two.id)).status,outcomes[1].status==='fulfilled'?'CONFIRMED':'PENDING');
  assert.equal((await system.service.confirm(session.staffA,loser.booking.id,{...loser.action,resourceId:'resource-a2'},loser.key)).status,'CONFIRMED');
});

test('QA competing apply commands keep a single effective source outcome and immutable booking history', async () => {
  const system=setup({changePolicy:()=>true});
  const source=await confirmed(system);
  const sourceRow=structuredClone(system.inspect().bookings.find(x=>x.id===source.id));
  const cancel=await system.service.proposeChange(session.staffA,source.id,{kind:'CANCEL'},'qa-compete-cancel');
  const reschedule=await system.service.proposeChange(session.staffA,source.id,{kind:'RESCHEDULE',newStartAt:later},'qa-compete-reschedule');
  const before=system.inspect();
  const outcomes=await Promise.allSettled([
    system.service.applyChange(session.staffA,cancel.id,cancelAction(source,{changeReference:'DEMO-COMPETE-CANCEL'}),'qa-compete-apply-cancel'),
    system.service.applyChange(session.staffA,reschedule.id,rescheduleAction(source,{changeReference:'DEMO-COMPETE-RESCHEDULE'}),'qa-compete-apply-reschedule'),
  ]);
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(outcomes.find(x=>x.status==='rejected').reason.code,'INVALID_TRANSITION');
  const after=system.inspect();
  assert.deepEqual(after.bookings.find(x=>x.id===source.id),sourceRow);
  assert.equal(after.changes.filter(x=>x.status==='APPLIED').length,1);
  assert.equal(after.changes.filter(x=>x.status==='PENDING').length,1);
  assert.equal(after.audit.length,before.audit.length+1);
  assert.equal(after.idempotency.length,before.idempotency.length+1);
  assert.equal((await system.service.get(session.customer1,source.id)).effectiveState,outcomes[0].status==='fulfilled'?'CANCELLED':'RESCHEDULED');
});

test('QA concurrent reschedule and another confirmation cannot both acquire the same replacement interval', async () => {
  const system=setup({changePolicy:()=>true});
  const source=await confirmed(system);
  const sourceRow=structuredClone(system.inspect().bookings.find(x=>x.id===source.id));
  const change=await system.service.proposeChange(session.staffA,source.id,{kind:'RESCHEDULE',newStartAt:later},'qa-race-reschedule');
  const competitor=await system.service.request(session.customer2,input({customerId:'demo-02',startAt:later}),'qa-race-new-request');
  const before=system.inspect();
  const outcomes=await Promise.allSettled([
    system.service.applyChange(session.staffA,change.id,rescheduleAction(source),'qa-race-apply-change'),
    system.service.confirm(session.staffA,competitor.id,confirmation(competitor,{treatwellReference:'DEMO-RACE-COMPETITOR'}),'qa-race-new-confirm'),
  ]);
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(outcomes.find(x=>x.status==='rejected').reason.code,'RESOURCE_CONFLICT');
  const after=system.inspect();
  assert.deepEqual(after.bookings.find(x=>x.id===source.id),sourceRow);
  assert.equal(after.audit.length,before.audit.length+1);
  assert.equal(after.idempotency.length,before.idempotency.length+1);
  assert.equal((await system.service.get(session.customer1,source.id)).effectiveState,outcomes[0].status==='fulfilled'?'RESCHEDULED':'CONFIRMED');
  assert.equal((await system.service.get(session.customer2,competitor.id)).status,outcomes[1].status==='fulfilled'?'CONFIRMED':'PENDING');
});
