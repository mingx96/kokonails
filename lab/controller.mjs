import { createFakeBookingSystem } from '../server/fake-booking-adapter.mjs';
import { toExternalBookingError } from '../server/booking-errors.mjs';

// These public fixture handles select a simulation role. They are not sessions
// or credentials, and this browser controller supplies no real security.
const fixtureSessions = new Set(['fixture-customer-01', 'fixture-customer-02',
  'fixture-staff-a', 'fixture-staff-b', 'fixture-staff-all']);
const staffSessions = new Set(['fixture-staff-a', 'fixture-staff-b', 'fixture-staff-all']);
const locationIds = new Set(['demo-a', 'demo-b']);
const scenarios = new Set(['locked', 'changes']);
const fixedNow = () => new Date('2027-01-01T00:00:00.000Z');
const fail = (code) => { throw Object.assign(new Error(code), { code }); };

function freeze(value) {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function snapshot(value) { return freeze(structuredClone(value)); }
function publicFailure(error) { return snapshot({ ok: false, error: toExternalBookingError(error) }); }
function copyPayload(payload) {
  if (payload === null || typeof payload !== 'object' ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(payload))) fail('INVALID_INPUT');
  const copy = Object.create(null);
  for (const key of Reflect.ownKeys(payload)) {
    const descriptor = Object.getOwnPropertyDescriptor(payload, key);
    if (typeof key !== 'string' || !Object.hasOwn(descriptor, 'value') ||
        (descriptor.value !== null && typeof descriptor.value === 'object') ||
        ['function', 'symbol', 'bigint'].includes(typeof descriptor.value)) fail('INVALID_INPUT');
    copy[key] = descriptor.value;
  }
  return copy;
}
function normalizedBody(body) {
  return Object.fromEntries(Object.keys(body).sort().map((key) => {
    let value = body[key];
    if (typeof value === 'string' && ['locationId', 'serviceId', 'customerId', 'matchedLocationId'].includes(key)) value = value.trim();
    if (typeof value === 'string' && ['treatwellReference', 'originalTreatwellReference',
      'changeReference', 'replacementTreatwellReference'].includes(key)) value = value.trim().toUpperCase();
    return [key, value];
  }));
}

/**
 * In-process synthetic browser lab. No HTTP, persistence, actual authentication,
 * Treatwell verification or outbound transport exists. Refreshing the browser
 * loses the whole fake system; reset also erases every private controller map.
 */
export function createLabController({ scenario = 'locked', delay = () => Promise.resolve() } = {}) {
  let state;
  let service;
  let keySequence = 0;
  const listeners = new Set();
  const knownReceiptIds = new Map();
  const knownChanges = new Map();
  const commandKeys = new Map();
  const receiptKey = (actor, locationId) => JSON.stringify([actor, locationId]);

  function getState() { return snapshot(state); }
  function emit() {
    for (const listener of [...listeners]) {
      try { listener(getState()); } catch { /* An observer cannot break the lab operation. */ }
    }
  }
  function clearVisibleScope() {
    state.bookings = [];
    state.changes = [];
    state.receipt = null;
  }
  function initialize(nextScenario) {
    service = createFakeBookingSystem({ clock: fixedNow,
      changePolicy: nextScenario === 'changes' ? () => true : undefined }).service;
    knownReceiptIds.clear();
    knownChanges.clear();
    commandKeys.clear();
    keySequence = 0;
    state = { busy: false, actorSession: 'fixture-customer-01', locationId: 'demo-a',
      bookings: [], changes: [], receipt: null, error: null, scenario: nextScenario };
  }
  initialize(scenarios.has(scenario) ? scenario : 'locked');
  if (!scenarios.has(scenario)) state.error = toExternalBookingError({ code: 'INVALID_INPUT' });

  async function refreshVisible(actor, locationId) {
    if (!fixtureSessions.has(actor)) fail('UNAUTHENTICATED');
    let bookings = [];
    let changes = [];
    let receipt = null;
    if (staffSessions.has(actor)) {
      // List and per-source reads are authoritative. The fake inspect helper is
      // intentionally never used to populate a staff or customer view.
      bookings = await service.list(actor, { locationId });
      const visibleIds = new Set(bookings.map(({ id }) => id));
      for (const change of knownChanges.values()) {
        if (change.locationId !== locationId || !visibleIds.has(change.bookingId)) continue;
        const source = await service.get(actor, change.bookingId);
        if (source.locationId === locationId) changes.push(structuredClone(change));
      }
    }
    const knownId = knownReceiptIds.get(receiptKey(actor, locationId));
    if (knownId) {
      const current = await service.get(actor, knownId);
      if (current.locationId === locationId) receipt = current;
    }
    state.bookings = bookings;
    state.changes = changes;
    state.receipt = receipt;
  }

  async function run(work, { changeScope, prepare = () => undefined } = {}) {
    if (state.busy) return publicFailure({ code: 'INVALID_TRANSITION' });
    state.busy = true;
    state.error = null;
    try {
      if (changeScope) changeScope();
      // Capture role/scope and input before the injected asynchronous delay.
      const actor = state.actorSession;
      const locationId = state.locationId;
      if (!fixtureSessions.has(actor)) fail('UNAUTHENTICATED');
      const payload = prepare();
      emit();
      if (typeof delay !== 'function') fail('INVALID_CONFIGURATION');
      await delay();
      const value = await work(actor, locationId, payload);
      await refreshVisible(actor, locationId);
      return snapshot({ ok: true, value });
    } catch (error) {
      const result = publicFailure(error);
      state.error = result.error;
      return result;
    } finally {
      state.busy = false;
      emit();
    }
  }
  async function command(actor, operation, targetId, payload) {
    const fingerprint = JSON.stringify([actor, operation, targetId, normalizedBody(payload)]);
    const previous = commandKeys.get(fingerprint);
    let freshIntent = false;
    if (previous && operation === 'request') {
      // An original outcome is an acknowledgement, not the booking's current
      // state. Reauthorize and read it before deciding whether a new intent is
      // possible. Read/authorization failure must never silently mint a key.
      const current = await service.get(actor, previous.outcomeId);
      freshIntent = ['DECLINED', 'CANCELLED', 'RESCHEDULED'].includes(current.effectiveState);
    }
    if (previous && operation === 'proposeChange') {
      // The caller has already authorized the source/current scope. A rejected
      // proposal allows a fresh intent; open/APPLIED acknowledgements replay.
      freshIntent = knownChanges.get(previous.outcomeId)?.status === 'REJECTED';
    }
    const key = previous && !freshIntent ? previous.key : `lab-command-${++keySequence}`;
    const outcome = operation === 'request'
      ? await service.request(actor, payload, key)
      : await service[operation](actor, targetId, payload, key);
    commandKeys.set(fingerprint, { key, outcomeId: outcome.id });
    return outcome;
  }
  function rememberChange(outcome) {
    const known = knownChanges.get(outcome.id);
    // Domain idempotency returns original outcomes. A replay of the proposal
    // must not replace a later APPLIED/REJECTED outcome in the controller view.
    if (!known || known.status === 'PENDING') knownChanges.set(outcome.id, structuredClone(outcome));
  }
  function bookingAction(operation, id, payload) {
    return run(async (actor, locationId, body) => {
      const source = await service.get(actor, id);
      if (source.locationId !== locationId) fail('FORBIDDEN');
      return command(actor, operation, id, body);
    }, { prepare: () => copyPayload(payload) });
  }
  function changeAction(operation, id, payload) {
    return run(async (actor, locationId, body) => {
      // Known outcomes are only a locator. A current authorized source read is
      // still required, and service mutations enforce the actual permissions.
      const known = knownChanges.get(id);
      if (known) {
        const source = await service.get(actor, known.bookingId);
        if (source.locationId !== locationId) fail('FORBIDDEN');
      }
      const outcome = await command(actor, operation, id, body);
      rememberChange(outcome);
      return outcome;
    }, { prepare: () => copyPayload(payload) });
  }

  return Object.freeze({
    getState,
    subscribe(listener) {
      if (typeof listener !== 'function') return () => undefined;
      listeners.add(listener);
      try { listener(getState()); } catch { /* Observer errors remain private. */ }
      return () => { listeners.delete(listener); };
    },
    setActor(session) {
      return run(async () => undefined, { changeScope: () => {
        state.actorSession = fixtureSessions.has(session) ? session : null;
        clearVisibleScope();
      } });
    },
    setLocation(id) {
      return run(async () => undefined, { changeScope: () => {
        if (!locationIds.has(id)) fail('UNKNOWN_LOCATION');
        state.locationId = id;
        clearVisibleScope();
      } });
    },
    refresh() { return run(async () => undefined); },
    request(payload) {
      return run(async (actor, locationId, body) => {
        if (typeof body.locationId !== 'string' || body.locationId.trim() !== locationId) fail('FORBIDDEN');
        const outcome = await command(actor, 'request', null, body);
        knownReceiptIds.set(receiptKey(actor, outcome.locationId), outcome.id);
        return outcome;
      }, { prepare: () => copyPayload(payload) });
    },
    confirm(id, payload) { return bookingAction('confirm', id, payload); },
    decline(id) { return bookingAction('decline', id, {}); },
    proposeChange(id, payload) {
      return run(async (actor, locationId, body) => {
        const source = await service.get(actor, id);
        if (source.locationId !== locationId) fail('FORBIDDEN');
        const outcome = await command(actor, 'proposeChange', id, body);
        rememberChange(outcome);
        return outcome;
      }, { prepare: () => copyPayload(payload) });
    },
    rejectChange(id) { return changeAction('rejectChange', id, {}); },
    applyChange(id, payload) { return changeAction('applyChange', id, payload); },
    reset(nextScenario = state.scenario) {
      if (state.busy) return publicFailure({ code: 'INVALID_TRANSITION' });
      if (!scenarios.has(nextScenario)) {
        const result = publicFailure({ code: 'INVALID_INPUT' });
        state.error = result.error;
        emit();
        return result;
      }
      initialize(nextScenario);
      emit();
      return snapshot({ ok: true, value: getState() });
    },
  });
}
