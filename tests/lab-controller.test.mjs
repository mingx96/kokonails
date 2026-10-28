import test from 'node:test';
import assert from 'node:assert/strict';
import { createLabController } from '../lab/controller.mjs';

const customer = 'fixture-customer-01';
const staff = 'fixture-staff-a';
const request = (overrides = {}) => ({ locationId: 'demo-a', serviceId: 'demo-care', customerId: 'demo-01',
  startAt: '2027-02-01T10:00:00.000Z', privacyAccepted: true, ...overrides });
const attest = (booking, overrides = {}) => ({ resourceId: 'resource-a1', manuallyChecked: true,
  matchedLocationId: booking.locationId, matchedStartAt: booking.startAt, treatwellReference: 'DEMO-LAB001', ...overrides });
const applyAttest = (booking, overrides = {}) => ({ manuallyChecked: true, matchedLocationId: booking.locationId,
  matchedOriginalStartAt: booking.startAt, originalTreatwellReference: booking.treatwellReference,
  changeReference: 'DEMO-CHANGE001', ...overrides });
async function confirmed(controller) {
  const { value: booking } = await controller.request(request());
  await controller.setActor(staff);
  const { value } = await controller.confirm(booking.id, attest(booking));
  return value;
}

test('controller starts as a locked synthetic customer with defensive immutable snapshots', () => {
  const controller = createLabController();
  const state = controller.getState();
  assert.deepEqual(state, { busy: false, actorSession: customer, locationId: 'demo-a',
    bookings: [], changes: [], receipt: null, error: null, scenario: 'locked' });
  assert.ok(Object.isFrozen(state));
  assert.ok(Object.isFrozen(state.bookings));
  assert.throws(() => { state.bookings.push({ id: 'forged' }); }, TypeError);
  assert.throws(() => { state.scenario = 'changes'; }, TypeError);
  assert.equal(controller.getState().scenario, 'locked');
});

test('subscribe emits initial/busy/final snapshots, isolates bad listeners and can unsubscribe', async () => {
  const controller = createLabController();
  const snapshots = [];
  const unsubscribe = controller.subscribe((state) => snapshots.push(state));
  controller.subscribe(() => { throw new Error('private-observer-detail'); });
  assert.equal(snapshots.length, 1);
  await controller.request(request());
  assert.ok(snapshots.some(({ busy }) => busy));
  assert.equal(snapshots.at(-1).busy, false);
  assert.equal(snapshots.at(-1).receipt.status, 'PENDING');
  const count = snapshots.length;
  unsubscribe();
  await controller.refresh();
  assert.equal(snapshots.length, count);
});

test('customer requests replay by normalized payload and latest receipt is reread after staff confirmation', async () => {
  const controller = createLabController();
  const first = await controller.request(request());
  const replay = await controller.request({ ...request(), locationId: ' demo-a ', customerId: ' demo-01 ' });
  assert.equal(first.ok, true);
  assert.deepEqual(replay.value, first.value);
  assert.deepEqual(controller.getState().bookings, []);
  await controller.setActor(staff);
  assert.equal(controller.getState().bookings.length, 1);
  await controller.confirm(first.value.id, attest(first.value));
  await controller.setActor(customer);
  assert.equal(controller.getState().receipt.status, 'CONFIRMED');
  assert.deepEqual(controller.getState().bookings, []);
  const repeatedAfterConfirmation = await controller.request(request());
  assert.equal(repeatedAfterConfirmation.value.status, 'PENDING');
  assert.equal(controller.getState().receipt.status, 'CONFIRMED');
});

test('customer views expose only their known receipt; fixture switching never falls back to a list', async () => {
  const controller = createLabController();
  const first = await controller.request(request());
  await controller.setActor('fixture-customer-02');
  assert.equal(controller.getState().receipt, null);
  assert.deepEqual(controller.getState().bookings, []);
  const denied = await controller.confirm(first.value.id, attest(first.value));
  assert.equal(denied.error.code, 'RESOURCE_UNAVAILABLE');
  assert.equal(controller.getState().receipt, null);
  await controller.setActor(customer);
  assert.equal(controller.getState().receipt.id, first.value.id);
  await controller.setLocation('demo-b');
  assert.equal(controller.getState().receipt, null);
  await controller.setLocation('demo-a');
  assert.equal(controller.getState().receipt.id, first.value.id);
});

test('staff location scope is authoritative and missing/inaccessible targets have equal public errors', async () => {
  const controller = createLabController();
  const { value: booking } = await controller.request(request());
  await controller.setActor('fixture-staff-b');
  assert.deepEqual(controller.getState().bookings, []);
  assert.equal(controller.getState().error.code, 'RESOURCE_UNAVAILABLE');
  await controller.setLocation('demo-b');
  assert.deepEqual(controller.getState().bookings, []);
  const foreign = await controller.confirm(booking.id, attest(booking));
  const missing = await controller.confirm('demo-booking-missing', attest(booking));
  assert.deepEqual(foreign.error, missing.error);
  assert.deepEqual(Object.keys(foreign.error).sort(), ['code', 'message', 'status']);
  assert.equal(JSON.stringify(controller.getState()).includes('FORBIDDEN'), false);
  assert.equal(JSON.stringify(controller.getState()).includes('NOT_FOUND'), false);
});

test('global busy lock prevents duplicate actions and denies actor/location/reset switching while pending', async () => {
  const gate = Promise.withResolvers();
  const controller = createLabController({ delay: () => gate.promise });
  const pending = controller.request(request());
  assert.equal(controller.getState().busy, true);
  assert.equal((await controller.request(request())).ok, false);
  assert.equal((await controller.setActor(staff)).ok, false);
  assert.equal((await controller.setLocation('demo-b')).ok, false);
  assert.equal(controller.reset('changes').ok, false);
  assert.equal(controller.getState().actorSession, customer);
  assert.equal(controller.getState().locationId, 'demo-a');
  assert.equal(controller.getState().scenario, 'locked');
  gate.resolve();
  assert.equal((await pending).ok, true);
  await controller.setActor(staff);
  assert.equal(controller.getState().bookings.length, 1);
});

test('switch clears visible old scope immediately, including during delayed refresh', async () => {
  let hold = false;
  const gate = Promise.withResolvers();
  const controller = createLabController({ scenario: 'changes', delay: () => hold ? gate.promise : Promise.resolve() });
  const booking = await confirmed(controller);
  await controller.proposeChange(booking.id, { kind: 'CANCEL' });
  assert.equal(controller.getState().changes.length, 1);
  hold = true;
  const switching = controller.setActor('fixture-staff-b');
  const immediate = controller.getState();
  assert.equal(immediate.busy, true);
  assert.deepEqual(immediate.bookings, []);
  assert.deepEqual(immediate.changes, []);
  assert.equal(immediate.receipt, null);
  gate.resolve();
  await switching;
  assert.deepEqual(controller.getState().changes, []);
});

test('changes are default denied and enabling the synthetic scenario erases the old system', async () => {
  const controller = createLabController();
  const booking = await confirmed(controller);
  const result = await controller.proposeChange(booking.id, { kind: 'CANCEL' });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'REQUEST_NOT_ALLOWED');
  assert.deepEqual(controller.getState().changes, []);
  assert.equal(controller.getState().bookings[0].status, 'CONFIRMED');
  assert.equal(controller.reset('changes').ok, true);
  assert.equal(controller.getState().scenario, 'changes');
  assert.equal(controller.getState().actorSession, customer);
  assert.equal(controller.getState().receipt, null);
  await controller.setActor(staff);
  assert.deepEqual(controller.getState().bookings, []);
  assert.deepEqual(controller.getState().changes, []);
  assert.equal((await controller.confirm(booking.id, attest(booking))).error.code, 'RESOURCE_UNAVAILABLE');
});

test('private change outcomes survive switches but only authorized staff/current location can reconstruct them', async () => {
  const controller = createLabController({ scenario: 'changes' });
  const booking = await confirmed(controller);
  const { value: change } = await controller.proposeChange(booking.id, { kind: 'CANCEL' });
  await controller.setActor(customer);
  assert.deepEqual(controller.getState().changes, []);
  await controller.setActor('fixture-staff-b');
  await controller.setLocation('demo-b');
  assert.deepEqual(controller.getState().changes, []);
  await controller.setActor('fixture-staff-all');
  assert.deepEqual(controller.getState().changes, []);
  await controller.setLocation('demo-a');
  assert.equal(controller.getState().changes[0].id, change.id);
  const applied = await controller.applyChange(change.id, applyAttest(booking));
  assert.equal(applied.ok, true);
  assert.equal(controller.getState().changes[0].status, 'APPLIED');
  assert.equal(controller.getState().bookings[0].effectiveState, 'CANCELLED');
  await controller.setActor(customer);
  assert.equal(controller.getState().receipt.effectiveState, 'CANCELLED');
  assert.deepEqual(controller.getState().changes, []);
});

test('decline and reject methods use domain outcomes and stable replays', async () => {
  const controller = createLabController({ scenario: 'changes' });
  const { value: booking } = await controller.request(request());
  await controller.setActor(staff);
  const declined = await controller.decline(booking.id);
  assert.equal(declined.value.status, 'DECLINED');
  assert.deepEqual(await controller.decline(booking.id), declined);
  const { value: next } = await controller.request(request({ startAt: '2027-02-01T11:00:00.000Z' }));
  const { value: confirmedBooking } = await controller.confirm(next.id, attest(next));
  const { value: change } = await controller.proposeChange(confirmedBooking.id, { kind: 'CANCEL' });
  const rejected = await controller.rejectChange(change.id);
  assert.equal(rejected.value.status, 'REJECTED');
  assert.deepEqual(await controller.rejectChange(change.id), rejected);
});

test('reschedule lab flow retains original terminal status and displays the linked replacement', async () => {
  const controller = createLabController({ scenario: 'changes' });
  const booking = await confirmed(controller);
  const newStartAt = '2027-02-01T12:00:00.000Z';
  const { value: change } = await controller.proposeChange(booking.id, { kind: 'RESCHEDULE', newStartAt });
  assert.equal(controller.getState().bookings.length, 1);
  const result = await controller.applyChange(change.id, applyAttest(booking, {
    matchedNewStartAt: newStartAt, resourceId: 'resource-a1', replacementTreatwellReference: 'DEMO-REPLACE001',
  }));
  assert.equal(result.ok, true);
  const original = controller.getState().bookings.find(({ id }) => id === booking.id);
  const replacement = controller.getState().bookings.find(({ id }) => id === result.value.replacementBookingId);
  assert.equal(original.status, 'CONFIRMED');
  assert.equal(original.effectiveState, 'RESCHEDULED');
  assert.equal(replacement.startAt, newStartAt);
});

test('unknown actor is discarded and errors never expose raw adapter/input details', async () => {
  let rejectDelay = false;
  const controller = createLabController({ delay: () => rejectDelay ? Promise.reject(new Error('private-detail')) : Promise.resolve() });
  await controller.setActor('untrusted-secret-text');
  assert.equal(controller.getState().actorSession, null);
  assert.equal(controller.getState().error.code, 'AUTHENTICATION_REQUIRED');
  assert.equal(JSON.stringify(controller.getState()).includes('untrusted-secret-text'), false);
  await controller.setActor(customer);
  rejectDelay = true;
  const failure = await controller.request(request());
  assert.equal(failure.error.code, 'INTERNAL_ERROR');
  assert.equal(JSON.stringify(failure).includes('private-detail'), false);
  assert.equal(controller.getState().busy, false);
});

test('invalid scenario cannot silently enable changes or erase existing data', async () => {
  const controller = createLabController();
  const { value: booking } = await controller.request(request());
  assert.equal(controller.reset('unexpected').ok, false);
  assert.equal(controller.getState().scenario, 'locked');
  assert.equal(controller.getState().receipt.id, booking.id);
});

test('replaying an original proposal cannot regress the displayed APPLIED change outcome', async () => {
  const controller = createLabController({ scenario: 'changes' });
  const booking = await confirmed(controller);
  const proposal = await controller.proposeChange(booking.id, { kind: 'CANCEL' });
  await controller.applyChange(proposal.value.id, applyAttest(booking));
  const replay = await controller.proposeChange(booking.id, { kind: 'CANCEL' });
  assert.deepEqual(replay, proposal);
  assert.equal(controller.getState().changes[0].status, 'APPLIED');
  assert.equal(controller.getState().bookings[0].effectiveState, 'CANCELLED');
  assert.ok(Object.isFrozen(controller.getState().changes[0]));
});

test('a rejected proposal permits fresh same-kind/time intent, then the new pending proposal replays stably', async () => {
  const controller = createLabController({ scenario: 'changes' });
  const booking = await confirmed(controller);
  const action = { kind: 'RESCHEDULE', newStartAt: '2027-02-01T12:00:00.000Z' };
  const first = await controller.proposeChange(booking.id, action);
  await controller.rejectChange(first.value.id);
  const fresh = await controller.proposeChange(booking.id, action);
  assert.equal(fresh.ok, true);
  assert.notEqual(fresh.value.id, first.value.id);
  assert.equal(fresh.value.status, 'PENDING');
  assert.equal(controller.getState().changes.find(({ id }) => id === first.value.id).status, 'REJECTED');
  assert.equal(controller.getState().changes.find(({ id }) => id === fresh.value.id).status, 'PENDING');
  assert.deepEqual(await controller.proposeChange(booking.id, action), fresh);
  assert.equal(controller.getState().changes.length, 2);
});

test('a declined request permits fresh identical intent, then the active request replays stably', async () => {
  const controller = createLabController();
  const original = await controller.request(request());
  await controller.setActor(staff);
  await controller.decline(original.value.id);
  await controller.setActor(customer);
  const fresh = await controller.request(request());
  assert.equal(fresh.ok, true);
  assert.notEqual(fresh.value.id, original.value.id);
  assert.equal(fresh.value.status, 'PENDING');
  assert.equal(controller.getState().receipt.id, fresh.value.id);
  assert.deepEqual(await controller.request(request()), fresh);
  await controller.setActor(staff);
  assert.equal(controller.getState().bookings.length, 2);
  assert.equal(controller.getState().bookings.find(({ id }) => id === original.value.id).status, 'DECLINED');
});

for (const kind of ['CANCEL', 'RESCHEDULE']) {
  test(`an inactive ${kind} source permits a fresh original-time request without losing prior history`, async () => {
    const controller = createLabController({ scenario: 'changes' });
    const booking = await confirmed(controller);
    const newStartAt = '2027-02-01T12:00:00.000Z';
    const proposal = await controller.proposeChange(booking.id,
      kind === 'CANCEL' ? { kind } : { kind, newStartAt });
    const attestation = kind === 'CANCEL' ? applyAttest(booking) : applyAttest(booking, {
      matchedNewStartAt: newStartAt, resourceId: 'resource-a1', replacementTreatwellReference: 'DEMO-REPLACE001',
    });
    await controller.applyChange(proposal.value.id, attestation);
    await controller.setActor(customer);
    const fresh = await controller.request(request());
    assert.equal(fresh.ok, true);
    assert.notEqual(fresh.value.id, booking.id);
    assert.equal(fresh.value.status, 'PENDING');
    assert.deepEqual(await controller.request(request()), fresh);
    await controller.setActor(staff);
    const original = controller.getState().bookings.find(({ id }) => id === booking.id);
    assert.equal(original.status, 'CONFIRMED');
    assert.equal(original.effectiveState, kind === 'CANCEL' ? 'CANCELLED' : 'RESCHEDULED');
  });
}

test('an action captures payload and fixture session before the asynchronous delay', async () => {
  const gate = Promise.withResolvers();
  const controller = createLabController({ delay: () => gate.promise });
  const payload = request();
  const pending = controller.request(payload);
  payload.customerId = 'demo-02';
  payload.startAt = 'invalid-after-invocation';
  gate.resolve();
  const result = await pending;
  assert.equal(result.ok, true);
  assert.equal(result.value.customerId, 'demo-01');
  assert.equal(result.value.startAt, '2027-02-01T10:00:00.000Z');
});

test('accessor input is not executed and produces only the external invalid request descriptor', async () => {
  const controller = createLabController();
  let calls = 0;
  const payload = request();
  Object.defineProperty(payload, 'serviceId', { enumerable: true, get() { calls += 1; return 'demo-care'; } });
  const result = await controller.request(payload);
  assert.equal(calls, 0);
  assert.equal(result.error.code, 'INVALID_REQUEST');
  assert.equal(controller.getState().receipt, null);
});
