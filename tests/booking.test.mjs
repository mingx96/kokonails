import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog, createDemoStore } from '../public/booking.mjs';

const staff = { role: 'staff-demo' };
const fixedNow = new Date('2027-01-15T09:00:00Z');
const input = (overrides = {}) => ({
  locationId: 'demo-a', serviceId: 'demo-care', customerId: 'demo-01',
  date: '2027-02-18', time: '14:30', privacyAccepted: true, ...overrides,
});
const store = (options = {}) => createDemoStore({ clock: () => fixedNow, ...options });
const expectCode = (code, fn) => assert.throws(fn, (error) => error.code === code);
const confirmation = (booking, overrides = {}) => ({
  status: 'CONFIRMED', treatwellReference: 'DEMO-ABC123', manuallyChecked: true,
  matchedLocationId: booking.locationId, matchedDate: booking.date, matchedTime: booking.time,
  ...overrides,
});

test('catalog contains only the fixed synthetic fixtures and is immutable', () => {
  assert.deepEqual(catalog.locations.map(({ id }) => id), ['demo-a', 'demo-b']);
  assert.deepEqual(catalog.services.map(({ id }) => id), ['demo-care', 'demo-colour']);
  assert.deepEqual(catalog.customers.map(({ id }) => id), ['demo-01', 'demo-02']);
  assert.ok(Object.values(catalog).flat().every(({ label }) => /demo|test/i.test(label)));
  assert.throws(() => { catalog.locations[0].id = 'real'; }, TypeError);
});

test('request is PENDING, holds no reference, and returns a defensive snapshot', () => {
  const demo = store();
  const booking = demo.request(input(), 'request-01');
  assert.equal(booking.status, 'PENDING');
  assert.equal(booking.treatwellReference, null);
  assert.equal(booking.createdAt, fixedNow.toISOString());
  booking.status = 'CONFIRMED';
  assert.equal(demo.list(staff)[0].status, 'PENDING');
});

test('normalized replay is idempotent even after the requested time passes', () => {
  let now = fixedNow;
  const demo = store({ clock: () => now });
  const first = demo.request(input(), 'request-01');
  now = new Date('2028-01-01T00:00:00Z');
  const replay = demo.request(input({ locationId: ' demo-a ', time: ' 14:30 ' }), 'request-01');
  assert.deepEqual(replay, first);
  assert.notEqual(replay, first);
  assert.equal(demo.list(staff).length, 1);
});

test('same idempotency key with changed payload rejects without mutation', () => {
  const demo = store();
  demo.request(input(), 'request-01');
  expectCode('IDEMPOTENCY_CONFLICT', () => demo.request(input({ serviceId: 'demo-colour' }), 'request-01'));
  assert.equal(demo.list(staff).length, 1);
});

for (const key of ['', 'short', 'contains spaces', 'x'.repeat(101), '../bad/key', null, 123]) {
  test(`rejects invalid idempotency key ${JSON.stringify(key)}`, () => {
    expectCode('INVALID_IDEMPOTENCY_KEY', () => store().request(input(), key));
  });
}

for (const [field, value, code] of [
  ['locationId', 'unverified', 'UNKNOWN_LOCATION'],
  ['serviceId', 'unverified', 'UNKNOWN_SERVICE'],
  ['customerId', 'real@example.invalid', 'UNKNOWN_CUSTOMER'],
  ['privacyAccepted', false, 'PRIVACY_REQUIRED'],
  ['privacyAccepted', 'true', 'PRIVACY_REQUIRED'],
  ['date', '2027-02-29', 'INVALID_DATE'],
  ['date', '2028-02-30', 'INVALID_DATE'],
  ['date', '2027-13-01', 'INVALID_DATE'],
  ['date', '2027-2-18', 'INVALID_DATE'],
  ['time', '24:00', 'INVALID_TIME'],
  ['time', '14:60', 'INVALID_TIME'],
  ['time', '2:30', 'INVALID_TIME'],
]) {
  test(`rejects invalid ${field}: ${JSON.stringify(value)}`, () => {
    expectCode(code, () => store().request(input({ [field]: value }), 'request-01'));
  });
}

test('rejects unknown fields and non-object payloads without leaking values', () => {
  const demo = store();
  for (const payload of [null, [], 'text', input({ email: 'private-value' }), input({ status: 'CONFIRMED' })]) {
    assert.throws(() => demo.request(payload, 'request-01'), (error) =>
      error.code === 'INVALID_INPUT' && !error.message.includes('private-value'));
  }
  assert.equal(demo.list(staff).length, 0);
});

test('compares requested time in demo Europe/Berlin, not machine timezone', () => {
  const demo = store();
  expectCode('PAST_TIME', () => demo.request(input({ date: '2027-01-15', time: '09:59' }), 'request-01'));
  expectCode('PAST_TIME', () => demo.request(input({ date: '2027-01-15', time: '10:00' }), 'request-02'));
  assert.equal(demo.request(input({ date: '2027-01-15', time: '10:01' }), 'request-03').status, 'PENDING');
});

test('accepts real leap day and summer time', () => {
  assert.equal(store().request(input({ date: '2028-02-29', time: '10:30' }), 'request-01').date, '2028-02-29');
  const demo = store({ clock: () => new Date('2027-07-01T12:00:00Z') });
  expectCode('PAST_TIME', () => demo.request(input({ date: '2027-07-01', time: '14:00' }), 'request-02'));
  assert.equal(demo.request(input({ date: '2027-07-01', time: '14:01' }), 'request-03').status, 'PENDING');
});

test('rejects nonexistent and ambiguous DST wall times', () => {
  expectCode('INVALID_TIME', () => store().request(input({ date: '2027-03-28', time: '02:30' }), 'request-01'));
  expectCode('INVALID_TIME', () => store().request(input({ date: '2027-10-31', time: '02:30' }), 'request-02'));
  assert.equal(store().request(input({ date: '2027-03-28', time: '03:30' }), 'request-03').status, 'PENDING');
});

test('duplicate active request with new key rejects; other customers may request the same time', () => {
  const demo = store();
  demo.request(input(), 'request-01');
  expectCode('DUPLICATE_REQUEST', () => demo.request(input({ serviceId: 'demo-colour' }), 'request-02'));
  assert.equal(demo.request(input({ customerId: 'demo-02' }), 'request-03').status, 'PENDING');
  assert.equal(demo.request(input({ locationId: 'demo-b' }), 'request-04').status, 'PENDING');
  assert.equal(demo.list(staff).length, 3);
});

test('rejects anonymous/customer list and transitions before revealing existence', () => {
  const demo = store();
  for (const context of [undefined, null, {}, { role: 'customer' }, { role: 'staff' }]) {
    expectCode('FORBIDDEN', () => demo.list(context));
    expectCode('FORBIDDEN', () => demo.transition('unknown', { status: 'DECLINED' }, context));
  }
});

test('list returns newest first and defensive copies', () => {
  let now = fixedNow;
  const demo = store({ clock: () => now });
  const first = demo.request(input(), 'request-01');
  now = new Date('2027-01-15T09:01:00Z');
  const second = demo.request(input({ customerId: 'demo-02' }), 'request-02');
  const listed = demo.list(staff);
  assert.deepEqual(listed.map(({ id }) => id), [second.id, first.id]);
  listed[0].locationId = 'evil';
  listed.pop();
  assert.equal(demo.list(staff).length, 2);
  assert.equal(demo.list(staff)[0].locationId, 'demo-a');
});

test('confirmation requires manual attestation, synthetic reference and exact location/date/time', () => {
  const demo = store();
  const booking = demo.request(input(), 'request-01');
  expectCode('RECONCILIATION_REQUIRED', () => demo.transition(booking.id, { status: 'CONFIRMED' }, staff));
  expectCode('RECONCILIATION_REQUIRED', () => demo.transition(booking.id, confirmation(booking, { manuallyChecked: false }), staff));
  expectCode('INVALID_REFERENCE', () => demo.transition(booking.id, confirmation(booking, { treatwellReference: 'live-123' }), staff));
  expectCode('INVALID_REFERENCE', () => demo.transition(booking.id, confirmation(booking, { treatwellReference: 'DEMO-' }), staff));
  for (const [field, value] of [['matchedLocationId', 'demo-b'], ['matchedDate', '2027-02-19'], ['matchedTime', '14:31']]) {
    expectCode('RECONCILIATION_MISMATCH', () => demo.transition(booking.id, confirmation(booking, { [field]: value }), staff));
  }
  assert.equal(demo.list(staff)[0].status, 'PENDING');
  const confirmed = demo.transition(booking.id, confirmation(booking), staff);
  assert.equal(confirmed.status, 'CONFIRMED');
  assert.equal(confirmed.treatwellReference, 'DEMO-ABC123');
  confirmed.status = 'PENDING';
  assert.equal(demo.list(staff)[0].status, 'CONFIRMED');
});

test('synthetic Treatwell reference must be unique and terminal states cannot change', () => {
  const demo = store();
  const first = demo.request(input(), 'request-01');
  const second = demo.request(input({ customerId: 'demo-02' }), 'request-02');
  demo.transition(first.id, confirmation(first), staff);
  expectCode('REFERENCE_CONFLICT', () => demo.transition(second.id, confirmation(second), staff));
  for (const status of ['CONFIRMED', 'DECLINED', 'PENDING']) {
    expectCode('INVALID_TRANSITION', () => demo.transition(first.id, confirmation(first, { status }), staff));
  }
  demo.transition(second.id, { status: 'DECLINED' }, staff);
  expectCode('INVALID_TRANSITION', () => demo.transition(second.id, { status: 'DECLINED' }, staff));
  expectCode('INVALID_TRANSITION', () => demo.transition(second.id, confirmation(second, { treatwellReference: 'DEMO-NEW123' }), staff));
});

test('decline permits a new request; confirmed request still prevents duplicates', () => {
  const demo = store();
  const first = demo.request(input(), 'request-01');
  demo.transition(first.id, { status: 'DECLINED' }, staff);
  const second = demo.request(input(), 'request-02');
  demo.transition(second.id, confirmation(second), staff);
  expectCode('DUPLICATE_REQUEST', () => demo.request(input(), 'request-03'));
});

test('transition rejects unknown request, status, fields and malformed action', () => {
  const demo = store();
  expectCode('NOT_FOUND', () => demo.transition('missing', { status: 'DECLINED' }, staff));
  const booking = demo.request(input(), 'request-01');
  for (const action of [null, [], { status: 'PENDING' }, { status: 'DELETED' }, { status: 'DECLINED', extra: true }]) {
    expectCode('INVALID_TRANSITION', () => demo.transition(booking.id, action, staff));
  }
});

test('store instances are isolated and invalid generated IDs cannot overwrite a booking', () => {
  const first = store({ idFactory: () => 'same-id' });
  first.request(input(), 'request-01');
  expectCode('INVALID_CONFIGURATION', () => first.request(input({ customerId: 'demo-02' }), 'request-02'));
  assert.equal(first.list(staff).length, 1);
  assert.equal(store().list(staff).length, 0);
});
