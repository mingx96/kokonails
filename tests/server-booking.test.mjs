import test from 'node:test';
import assert from 'node:assert/strict';
import { createBookingService } from '../server/booking-service.mjs';
import { createFakeBookingSystem, createFakeIdentityAdapter, createFakeBookingRepository } from '../server/fake-booking-adapter.mjs';

const staff = 'fixture-staff-all';
const customer = 'fixture-customer-01';
const now = () => new Date('2027-01-01T00:00:00.000Z');
const command = (overrides = {}) => ({ locationId: 'demo-a', serviceId: 'demo-care', customerId: 'demo-01',
  startAt: '2027-02-01T10:00:00.000Z', privacyAccepted: true, ...overrides });
const system = (overrides = {}) => createFakeBookingSystem({ clock: now, ...overrides });
const rejects = (code, operation) => assert.rejects(operation, (error) => error.code === code && error.message === code);
const attest = (booking, overrides = {}) => ({ resourceId: 'resource-a1', manuallyChecked: true,
  matchedLocationId: booking.locationId, matchedStartAt: booking.startAt, treatwellReference: 'DEMO-REF001', ...overrides });
const changeAttest = (booking, overrides = {}) => ({ manuallyChecked: true, matchedLocationId: booking.locationId,
  matchedOriginalStartAt: booking.startAt, originalTreatwellReference: booking.treatwellReference,
  changeReference: 'DEMO-CHANGE001', ...overrides });
async function confirmed(fake, overrides = {}, reference = 'DEMO-REF001') {
  const requester = overrides.customerId === 'demo-02' ? 'fixture-customer-02' : customer;
  const booking = await fake.service.request(requester, command(overrides), `req-${reference}`);
  return fake.service.confirm(staff, booking.id, attest(booking, { treatwellReference: reference }), `confirm-${reference}`);
}

test('server request starts pending, holds no allocation and records one actor audit', async () => {
  const fake = system();
  const booking = await fake.service.request(customer, command(), 'request-01');
  assert.equal(booking.status, 'PENDING');
  assert.equal(booking.effectiveState, 'PENDING');
  assert.equal(booking.treatwellReference, null);
  assert.equal(fake.inspect().allocations.length, 0);
  assert.equal(fake.inspect().audit.length, 1);
  assert.equal(fake.inspect().audit[0].actorId, 'fixture-customer-01');
});

test('idempotency stores original outcomes, is scoped by actor and spans operations/targets', async () => {
  const fake = system();
  const booking = await fake.service.request(customer, command(), 'request-01');
  await fake.service.confirm(staff, booking.id, attest(booking), 'confirm-01');
  assert.deepEqual(await fake.service.request(customer, command(), 'request-01'), booking);
  await rejects('IDEMPOTENCY_CONFLICT', () => fake.service.request(customer, command({ serviceId: 'demo-colour' }), 'request-01'));
  await rejects('IDEMPOTENCY_CONFLICT', () => fake.service.decline(staff, booking.id, {}, 'confirm-01'));
  const other = await fake.service.request('fixture-customer-02', command({ customerId: 'demo-02' }), 'request-01');
  assert.notEqual(other.id, booking.id);
  assert.equal(fake.inspect().audit.length, 3);
});

for (const session of [undefined, null, {}, 123, 'unknown', { role: 'staff' }]) {
  test(`invalid identity rejects without state/existence leakage: ${JSON.stringify(session)}`, async () => {
    const fake = system();
    const before = fake.inspect();
    await rejects('UNAUTHENTICATED', () => fake.service.request(session, command(), 'request-01'));
    await rejects('UNAUTHENTICATED', () => fake.service.get(session, 'unknown'));
    await rejects('UNAUTHENTICATED', () => fake.service.confirm(session, 'unknown', {}, 'confirm-01'));
    assert.deepEqual(fake.inspect(), before);
  });
}

for (const [overrides, code] of [
  [{ role: 'staff' }, 'INVALID_INPUT'], [{ locationIds: ['demo-b'] }, 'INVALID_INPUT'],
  [{ durationMinutes: 1 }, 'INVALID_INPUT'], [{ endAt: '2027-02-01T10:01:00.000Z' }, 'INVALID_INPUT'],
  [{ status: 'CONFIRMED' }, 'INVALID_INPUT'], [{ contact: 'private-fixture' }, 'INVALID_INPUT'],
  [{ locationId: 'real-location' }, 'UNKNOWN_LOCATION'], [{ serviceId: 'real-service' }, 'UNKNOWN_SERVICE'],
  [{ customerId: 'real-customer' }, 'UNKNOWN_CUSTOMER'], [{ privacyAccepted: 'true' }, 'PRIVACY_REQUIRED'],
  [{ privacyAccepted: false }, 'PRIVACY_REQUIRED'], [{ startAt: '2027-02-30T10:00:00.000Z' }, 'INVALID_START_AT'],
  [{ startAt: '2027-02-01T11:00:00+01:00' }, 'INVALID_START_AT'], [{ startAt: '2027-02-01T10:00:00Z' }, 'INVALID_START_AT'],
  [{ startAt: '2027-01-01T00:00:00.000Z' }, 'PAST_TIME'], [{ startAt: 1800000000000 }, 'INVALID_START_AT'],
]) {
  test(`strict request validation: ${Object.keys(overrides)[0]} / ${code}`, async () => {
    const fake = system();
    const before = fake.inspect();
    await rejects(code, () => fake.service.request(customer, command(overrides), 'request-01'));
    assert.deepEqual(fake.inspect(), before);
  });
}

test('customers cannot impersonate another fixture; staff require location grants', async () => {
  const fake = system();
  await rejects('FORBIDDEN', () => fake.service.request(customer, command({ customerId: 'demo-02' }), 'request-01'));
  await rejects('FORBIDDEN', () => fake.service.request('fixture-staff-b', command(), 'request-02'));
  const booking = await fake.service.request('fixture-staff-a', command(), 'request-03');
  await rejects('FORBIDDEN', () => fake.service.get('fixture-staff-b', booking.id));
  await rejects('FORBIDDEN', () => fake.service.get('fixture-customer-02', booking.id));
  await rejects('FORBIDDEN', () => fake.service.list(customer, { locationId: 'demo-a' }));
  await rejects('FORBIDDEN', () => fake.service.list('fixture-staff-b', { locationId: 'demo-a' }));
  await rejects('FORBIDDEN', () => fake.service.confirm(customer, booking.id, attest(booking), 'confirm-01'));
  assert.equal((await fake.service.get(customer, booking.id)).id, booking.id);
});

test('permission is resolved again before identical replay and revoked access never replays data', async () => {
  const repository = createFakeBookingRepository();
  const fixtureIdentity = createFakeIdentityAdapter();
  let revoked = false;
  const identity = { resolve: async (session) => {
    const actor = await fixtureIdentity.resolve(session);
    return revoked && actor?.role === 'staff' ? { ...actor, locationIds: [] } : actor;
  } };
  const service = createBookingService({ identity, repository, clock: now });
  const booking = await service.request('fixture-staff-a', command(), 'request-01');
  revoked = true;
  const before = repository.inspect();
  await rejects('FORBIDDEN', () => service.request('fixture-staff-a', command(), 'request-01'));
  await rejects('FORBIDDEN', () => service.confirm('fixture-staff-a', booking.id, attest(booking), 'confirm-01'));
  assert.deepEqual(repository.inspect(), before);
});

test('duplicate active same-customer requests reject but same-slot other customers hold no slot', async () => {
  const fake = system();
  await fake.service.request(customer, command(), 'request-01');
  await rejects('DUPLICATE_REQUEST', () => fake.service.request(customer, command({ serviceId: 'demo-colour' }), 'request-02'));
  await fake.service.request('fixture-customer-02', command({ customerId: 'demo-02' }), 'request-03');
  assert.equal(fake.inspect().bookings.length, 2);
  assert.equal(fake.inspect().allocations.length, 0);
});

test('confirmation validates attestation, location, resource and unique synthetic reference atomically', async () => {
  const fake = system();
  const booking = await fake.service.request(customer, command(), 'request-01');
  const before = fake.inspect();
  for (const [overrides, code] of [
    [{ manuallyChecked: false }, 'RECONCILIATION_REQUIRED'],
    [{ matchedLocationId: 'demo-b' }, 'RECONCILIATION_MISMATCH'],
    [{ matchedStartAt: '2027-02-01T10:01:00.000Z' }, 'RECONCILIATION_MISMATCH'],
    [{ resourceId: 'resource-b1' }, 'UNKNOWN_RESOURCE'], [{ resourceId: 'real-resource' }, 'UNKNOWN_RESOURCE'],
    [{ treatwellReference: 'live-reference' }, 'INVALID_REFERENCE'],
    [{ durationMinutes: 1 }, 'INVALID_INPUT'],
  ]) {
    await rejects(code, () => fake.service.confirm(staff, booking.id, attest(booking, overrides), 'confirm-01'));
    assert.deepEqual(fake.inspect(), before);
  }
  const result = await fake.service.confirm(staff, booking.id, attest(booking), 'confirm-01');
  assert.equal(result.status, 'CONFIRMED');
  assert.equal(result.durationMinutes, 30);
  assert.equal(result.endAt, '2027-02-01T10:30:00.000Z');
  assert.equal(fake.inspect().allocations.filter((allocation) => allocation.active).length, 1);
  assert.deepEqual(await fake.service.confirm(staff, booking.id, attest(booking), 'confirm-01'), result);
  await rejects('INVALID_TRANSITION', () => fake.service.confirm(staff, booking.id, attest(booking), 'confirm-02'));
  await rejects('INVALID_TRANSITION', () => fake.service.decline(staff, booking.id, {}, 'decline-01'));
});

test('same resource conflicts, other resource overlaps, adjacent half-open intervals succeed', async () => {
  const fake = system();
  const first = await confirmed(fake, { serviceId: 'demo-colour' });
  const second = await fake.service.request('fixture-customer-02', command({ customerId: 'demo-02', startAt: '2027-02-01T10:30:00.000Z' }), 'request-02');
  const before = fake.inspect();
  await rejects('RESOURCE_CONFLICT', () => fake.service.confirm(staff, second.id, attest(second, { treatwellReference: 'DEMO-REF002' }), 'confirm-02'));
  assert.deepEqual(fake.inspect(), before);
  await fake.service.confirm(staff, second.id, attest(second, { resourceId: 'resource-a2', treatwellReference: 'DEMO-REF002' }), 'confirm-02');
  const adjacent = await fake.service.request(customer, command({ startAt: first.endAt }), 'request-03');
  await fake.service.confirm(staff, adjacent.id, attest(adjacent, { treatwellReference: 'DEMO-REF003' }), 'confirm-03');
  assert.equal(fake.inspect().allocations.filter((allocation) => allocation.active).length, 3);
});

test('concurrent overlapping confirmations have exactly one winner; failed reference is reusable', async () => {
  const fake = system();
  const a = await fake.service.request(customer, command(), 'request-01');
  const b = await fake.service.request('fixture-customer-02', command({ customerId: 'demo-02' }), 'request-02');
  const results = await Promise.allSettled([
    fake.service.confirm(staff, a.id, attest(a, { treatwellReference: 'DEMO-REF001' }), 'confirm-01'),
    fake.service.confirm(staff, b.id, attest(b, { treatwellReference: 'DEMO-REF002' }), 'confirm-02'),
  ]);
  assert.equal(results.filter(({ status }) => status === 'fulfilled').length, 1);
  assert.equal(results.find(({ status }) => status === 'rejected').reason.code, 'RESOURCE_CONFLICT');
  const loser = results[0].status === 'rejected' ? a : b;
  const reference = loser.id === a.id ? 'DEMO-REF001' : 'DEMO-REF002';
  await fake.service.confirm(staff, loser.id, attest(loser, { resourceId: 'resource-a2', treatwellReference: reference }), `retry-${reference}`);
  assert.equal(fake.inspect().audit.length, 4);
});

test('reference reuse rejects even on another resource', async () => {
  const fake = system();
  await confirmed(fake);
  const next = await fake.service.request('fixture-customer-02', command({ customerId: 'demo-02' }), 'request-02');
  await rejects('REFERENCE_CONFLICT', () => fake.service.confirm(staff, next.id, attest(next, { resourceId: 'resource-a2' }), 'confirm-02'));
});

test('decline is terminal, idempotent replay preserves original outcome and permits a fresh request', async () => {
  const fake = system();
  const booking = await fake.service.request(customer, command(), 'request-01');
  const declined = await fake.service.decline(staff, booking.id, {}, 'decline-01');
  assert.equal(declined.status, 'DECLINED');
  assert.deepEqual(await fake.service.decline(staff, booking.id, {}, 'decline-01'), declined);
  await rejects('INVALID_TRANSITION', () => fake.service.decline(staff, booking.id, {}, 'decline-02'));
  await fake.service.request(customer, command(), 'request-02');
});

test('default change policy denies proposal/apply/reject without mutation', async () => {
  const fake = system();
  const booking = await confirmed(fake);
  const before = fake.inspect();
  await rejects('POLICY_UNDECIDED', () => fake.service.proposeChange(staff, booking.id, { kind: 'CANCEL' }, 'change-01'));
  assert.deepEqual(fake.inspect(), before);
  const enabled = system({ changePolicy: () => true });
  const confirmedBooking = await confirmed(enabled);
  const change = await enabled.service.proposeChange(staff, confirmedBooking.id, { kind: 'CANCEL' }, 'change-01');
  const repository = createFakeBookingRepository();
  const identity = createFakeIdentityAdapter();
  let allowed = true;
  const service = createBookingService({ identity, repository, clock: now, changePolicy: () => allowed });
  const b = await service.request(customer, command(), 'request-01');
  const c = await service.confirm(staff, b.id, attest(b), 'confirm-01');
  const p = await service.proposeChange(staff, c.id, { kind: 'CANCEL' }, 'change-01');
  allowed = false;
  const snapshot = repository.inspect();
  await rejects('POLICY_UNDECIDED', () => service.rejectChange(staff, p.id, {}, 'reject-01'));
  await rejects('POLICY_UNDECIDED', () => service.applyChange(staff, p.id, changeAttest(c), 'apply-01'));
  await rejects('POLICY_UNDECIDED', () => service.proposeChange(staff, c.id, { kind: 'CANCEL' }, 'change-01'));
  assert.deepEqual(repository.inspect(), snapshot);
  assert.equal(change.status, 'PENDING');
});

test('pending proposal holds no new slot; rejecting changes no allocation or terminal booking row', async () => {
  const fake = system({ changePolicy: () => true });
  const booking = await confirmed(fake);
  const stored = fake.inspect().bookings[0];
  const change = await fake.service.proposeChange(staff, booking.id, { kind: 'RESCHEDULE', newStartAt: '2027-02-01T12:00:00.000Z' }, 'change-01');
  assert.equal(change.status, 'PENDING');
  assert.equal(fake.inspect().allocations.length, 1);
  assert.equal((await fake.service.get(customer, booking.id)).effectiveState, 'CONFIRMED');
  const rejected = await fake.service.rejectChange(staff, change.id, {}, 'reject-01');
  assert.equal(rejected.status, 'REJECTED');
  assert.deepEqual(fake.inspect().bookings[0], stored);
  assert.equal(fake.inspect().allocations[0].active, true);
  assert.deepEqual(await fake.service.rejectChange(staff, change.id, {}, 'reject-01'), rejected);
  await rejects('INVALID_TRANSITION', () => fake.service.rejectChange(staff, change.id, {}, 'reject-02'));
});

test('apply cancellation retires allocation and derives CANCELLED without rewriting confirmed row', async () => {
  const fake = system({ changePolicy: () => true });
  const booking = await confirmed(fake);
  const stored = fake.inspect().bookings[0];
  const change = await fake.service.proposeChange(staff, booking.id, { kind: 'CANCEL' }, 'change-01');
  const before = fake.inspect();
  await rejects('RECONCILIATION_REQUIRED', () => fake.service.applyChange(staff, change.id, changeAttest(booking, { manuallyChecked: false }), 'apply-01'));
  await rejects('RECONCILIATION_MISMATCH', () => fake.service.applyChange(staff, change.id, changeAttest(booking, { originalTreatwellReference: 'DEMO-WRONG' }), 'apply-01'));
  assert.deepEqual(fake.inspect(), before);
  const applied = await fake.service.applyChange(staff, change.id, changeAttest(booking), 'apply-01');
  assert.equal(applied.status, 'APPLIED');
  assert.deepEqual(fake.inspect().bookings[0], stored);
  const source = await fake.service.get(customer, booking.id);
  assert.equal(source.status, 'CONFIRMED');
  assert.equal(source.effectiveState, 'CANCELLED');
  assert.equal(fake.inspect().allocations[0].active, false);
  assert.deepEqual(await fake.service.applyChange(staff, change.id, changeAttest(booking), 'apply-01'), applied);
  await rejects('INVALID_TRANSITION', () => fake.service.applyChange(staff, change.id, changeAttest(booking), 'apply-02'));
});

test('reschedule creates linked confirmed replacement only after attestation and excludes own old allocation', async () => {
  const fake = system({ changePolicy: () => true });
  const booking = await confirmed(fake);
  const stored = fake.inspect().bookings[0];
  const newStartAt = '2027-02-01T10:15:00.000Z';
  const change = await fake.service.proposeChange(staff, booking.id, { kind: 'RESCHEDULE', newStartAt }, 'change-01');
  const action = changeAttest(booking, { matchedNewStartAt: newStartAt, resourceId: 'resource-a1', replacementTreatwellReference: 'DEMO-REPLACE001' });
  const applied = await fake.service.applyChange(staff, change.id, action, 'apply-01');
  assert.deepEqual(fake.inspect().bookings[0], stored);
  assert.equal((await fake.service.get(customer, booking.id)).effectiveState, 'RESCHEDULED');
  const replacement = await fake.service.get(customer, applied.replacementBookingId);
  assert.equal(replacement.status, 'CONFIRMED');
  assert.equal(replacement.startAt, newStartAt);
  assert.equal(replacement.sourceBookingId, booking.id);
  assert.equal(fake.inspect().allocations.filter(({ active }) => active).length, 1);
});

test('reschedule collision rolls back full state and neither consumes key nor synthetic references', async () => {
  const fake = system({ changePolicy: () => true });
  const booking = await confirmed(fake);
  await confirmed(fake, { customerId: 'demo-02', startAt: '2027-02-01T12:00:00.000Z' }, 'DEMO-REF002');
  const newStartAt = '2027-02-01T12:00:00.000Z';
  const change = await fake.service.proposeChange(staff, booking.id, { kind: 'RESCHEDULE', newStartAt }, 'change-01');
  const action = changeAttest(booking, { matchedNewStartAt: newStartAt, resourceId: 'resource-a1', replacementTreatwellReference: 'DEMO-REPLACE001' });
  const before = fake.inspect();
  await rejects('RESOURCE_CONFLICT', () => fake.service.applyChange(staff, change.id, action, 'apply-01'));
  assert.deepEqual(fake.inspect(), before);
  const result = await fake.service.applyChange(staff, change.id, { ...action, resourceId: 'resource-a2' }, 'apply-01');
  assert.equal(result.status, 'APPLIED');
});

test('competing changes for one source have one winner and leave original terminal row immutable', async () => {
  const fake = system({ changePolicy: () => true });
  const booking = await confirmed(fake);
  const stored = fake.inspect().bookings[0];
  const first = await fake.service.proposeChange(staff, booking.id, { kind: 'CANCEL' }, 'change-01');
  const second = await fake.service.proposeChange(staff, booking.id, { kind: 'CANCEL' }, 'change-02');
  const results = await Promise.allSettled([
    fake.service.applyChange(staff, first.id, changeAttest(booking), 'apply-01'),
    fake.service.applyChange(staff, second.id, changeAttest(booking, { changeReference: 'DEMO-CHANGE002' }), 'apply-02'),
  ]);
  assert.equal(results.filter(({ status }) => status === 'fulfilled').length, 1);
  assert.equal(results.find(({ status }) => status === 'rejected').reason.code, 'INVALID_TRANSITION');
  assert.deepEqual(fake.inspect().bookings[0], stored);
  assert.equal(fake.inspect().changes.filter(({ status }) => status === 'APPLIED').length, 1);
});

test('reschedule racing a new conflicting confirmation has one winner', async () => {
  const fake = system({ changePolicy: () => true });
  const booking = await confirmed(fake);
  const newStartAt = '2027-02-01T12:00:00.000Z';
  const pending = await fake.service.request('fixture-customer-02', command({ customerId: 'demo-02', startAt: newStartAt }), 'request-02');
  const change = await fake.service.proposeChange(staff, booking.id, { kind: 'RESCHEDULE', newStartAt }, 'change-01');
  const results = await Promise.allSettled([
    fake.service.applyChange(staff, change.id, changeAttest(booking, { matchedNewStartAt: newStartAt, resourceId: 'resource-a1', replacementTreatwellReference: 'DEMO-REPLACE001' }), 'apply-01'),
    fake.service.confirm(staff, pending.id, attest(pending, { treatwellReference: 'DEMO-REF002' }), 'confirm-02'),
  ]);
  assert.equal(results.filter(({ status }) => status === 'fulfilled').length, 1);
  assert.equal(results.find(({ status }) => status === 'rejected').reason.code, 'RESOURCE_CONFLICT');
});

test('all returned service and inspect snapshots are defensive', async () => {
  const fake = system();
  const booking = await fake.service.request(customer, command(), 'request-01');
  booking.customerId = 'demo-02';
  const listed = await fake.service.list(staff, { locationId: 'demo-a' });
  listed[0].status = 'CONFIRMED';
  const inspection = fake.inspect();
  inspection.bookings[0].status = 'DECLINED';
  inspection.audit[0].actorId = 'edited';
  inspection.idempotency[0].outcome.status = 'CONFIRMED';
  assert.equal((await fake.service.get(customer, booking.id)).status, 'PENDING');
  assert.equal(fake.inspect().audit[0].actorId, 'fixture-customer-01');
  assert.equal((await fake.service.request(customer, command(), 'request-01')).status, 'PENDING');
});

test('fake repository serializes transactions and rolls back every draft field on late failure', async () => {
  const repository = createFakeBookingRepository();
  const before = repository.inspect();
  await assert.rejects(repository.transaction(async (draft) => {
    draft.sequence = 99;
    draft.bookings.set('demo-booking-x', { id: 'demo-booking-x' });
    draft.changes.set('demo-change-x', { id: 'demo-change-x' });
    draft.allocations.set('demo-allocation-x', { id: 'demo-allocation-x' });
    draft.references.add('DEMO-FAIL');
    draft.idempotency.set('actor-key', { outcome: { id: 'demo-booking-x' } });
    draft.audit.push({ id: 'demo-audit-x' });
    throw new Error('late-failure');
  }));
  assert.deepEqual(repository.inspect(), before);
  const order = [];
  await Promise.all([
    repository.transaction(async () => { order.push('first-start'); await Promise.resolve(); order.push('first-end'); }),
    repository.transaction(async () => { order.push('second'); }),
  ]);
  assert.deepEqual(order, ['first-start', 'first-end', 'second']);
});

test('late audit failure rolls back booking IDs and idempotency, then the exact command can retry', async () => {
  let calls = 0;
  const fake = system({ clock: () => {
    if (++calls === 3) throw new Error('private-adapter-detail');
    return now();
  } });
  const before = fake.inspect();
  await rejects('INVALID_CONFIGURATION', () => fake.service.request(customer, command(), 'request-01'));
  assert.deepEqual(fake.inspect(), before);
  const retried = await fake.service.request(customer, command(), 'request-01');
  assert.equal(retried.id, 'demo-booking-1');
  assert.equal(fake.inspect().idempotency.length, 1);
  assert.equal(fake.inspect().audit.length, 1);
});

test('late confirmation failure rolls back allocation/reference/sequence and preserves pending source', async () => {
  let failing = false;
  const fake = system({ clock: () => {
    if (failing) throw new Error('private-adapter-detail');
    return now();
  } });
  const booking = await fake.service.request(customer, command(), 'request-01');
  const before = fake.inspect();
  failing = true;
  await rejects('INVALID_CONFIGURATION', () => fake.service.confirm(staff, booking.id, attest(booking), 'confirm-01'));
  assert.deepEqual(fake.inspect(), before);
  failing = false;
  const result = await fake.service.confirm(staff, booking.id, attest(booking), 'confirm-01');
  assert.equal(result.status, 'CONFIRMED');
  assert.equal(fake.inspect().references.length, 1);
  assert.equal(fake.inspect().allocations.length, 1);
});

test('proposeChange never executes an accessor for kind and leaves state untouched', async () => {
  const fake = system({ changePolicy: () => true });
  const booking = await confirmed(fake);
  const before = fake.inspect();
  let getterCalls = 0;
  const action = Object.defineProperty({}, 'kind', {
    enumerable: true,
    get() { getterCalls += 1; return 'CANCEL'; },
  });
  await rejects('INVALID_INPUT', () => fake.service.proposeChange(staff, booking.id, action, 'change-01'));
  assert.equal(getterCalls, 0);
  assert.deepEqual(fake.inspect(), before);
});

for (const competingStatus of ['PENDING', 'CONFIRMED']) {
  test(`reschedule replacement rejects duplicate active customer/location/start (${competingStatus}) with complete rollback`, async () => {
    const fake = system({ changePolicy: () => true });
    const source = await confirmed(fake);
    const newStartAt = '2027-02-01T12:00:00.000Z';
    let competing = await fake.service.request(customer, command({ startAt: newStartAt }), 'request-competing');
    if (competingStatus === 'CONFIRMED') {
      competing = await fake.service.confirm(staff, competing.id,
        attest(competing, { resourceId: 'resource-a2', treatwellReference: 'DEMO-COMPETING' }), 'confirm-competing');
    }
    const change = await fake.service.proposeChange(staff, source.id, { kind: 'RESCHEDULE', newStartAt }, 'change-source');
    const action = changeAttest(source, {
      matchedNewStartAt: newStartAt, resourceId: 'resource-a1', replacementTreatwellReference: 'DEMO-REPLACE001',
    });
    const before = fake.inspect();
    await rejects('DUPLICATE_REQUEST', () => fake.service.applyChange(staff, change.id, action, 'apply-source'));
    assert.deepEqual(fake.inspect(), before);
    // Free the competing customer request, then retry the exact previously
    // failed command/key/references to prove nothing was consumed by failure.
    if (competingStatus === 'PENDING') {
      await fake.service.decline(staff, competing.id, {}, 'decline-competing');
    } else {
      const cancellation = await fake.service.proposeChange(staff, competing.id, { kind: 'CANCEL' }, 'change-competing');
      await fake.service.applyChange(staff, cancellation.id,
        changeAttest(competing, { changeReference: 'DEMO-CANCELCOMPETING' }), 'apply-competing');
    }
    const applied = await fake.service.applyChange(staff, change.id, action, 'apply-source');
    assert.equal(applied.status, 'APPLIED');
    assert.equal((await fake.service.get(customer, applied.replacementBookingId)).startAt, newStartAt);
  });
}
