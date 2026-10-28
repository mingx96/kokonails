import { catalog } from '../public/booking.mjs';

// Durations/resources below are synthetic scheduling fixtures, not salon facts.
const locations = new Set(catalog.locations.map(({ id }) => id));
const customers = new Set(catalog.customers.map(({ id }) => id));
const durations = new Map([['demo-care', 30], ['demo-colour', 60]]);
const resources = new Map([['resource-a1', 'demo-a'], ['resource-a2', 'demo-a'], ['resource-b1', 'demo-b']]);
export const BOOKING_ERROR_CODES = Object.freeze(['UNAUTHENTICATED', 'FORBIDDEN', 'INVALID_INPUT', 'INVALID_IDEMPOTENCY_KEY',
  'IDEMPOTENCY_CONFLICT', 'UNKNOWN_LOCATION', 'UNKNOWN_SERVICE', 'UNKNOWN_CUSTOMER', 'INVALID_START_AT',
  'PAST_TIME', 'PRIVACY_REQUIRED', 'DUPLICATE_REQUEST', 'NOT_FOUND', 'INVALID_TRANSITION',
  'RECONCILIATION_REQUIRED', 'RECONCILIATION_MISMATCH', 'UNKNOWN_RESOURCE', 'INVALID_REFERENCE',
  'REFERENCE_CONFLICT', 'RESOURCE_CONFLICT', 'POLICY_UNDECIDED', 'INVALID_CONFIGURATION', 'ADAPTER_FAILURE']);
const errorCodes = new Set(BOOKING_ERROR_CODES);

function failure(code) { return Object.assign(new Error(code), { code }); }
function fail(code) { throw failure(code); }
function record(value) {
  return value !== null && typeof value === 'object' &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
function exact(value, fields) {
  if (!record(value) || Reflect.ownKeys(value).length !== fields.length ||
      !fields.every((field) => Object.hasOwn(value, field)) ||
      !Reflect.ownKeys(value).every((field) => fields.includes(field))) fail('INVALID_INPUT');
  // Accessors are not input data; rejecting them avoids invoking untrusted code.
  if (fields.some((field) => !Object.hasOwn(Object.getOwnPropertyDescriptor(value, field), 'value'))) fail('INVALID_INPUT');
}
function text(value) { return typeof value === 'string' ? value.trim() : ''; }
function iso(value) {
  if (typeof value !== 'string') fail('INVALID_START_AT');
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) fail('INVALID_START_AT');
  return value;
}
function reference(value) {
  const normalized = text(value).toUpperCase();
  if (!/^DEMO-[A-Z0-9][A-Z0-9-]{2,49}$/.test(normalized)) fail('INVALID_REFERENCE');
  return normalized;
}
function validateKey(key) {
  if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(key)) fail('INVALID_IDEMPOTENCY_KEY');
}
function scope(actor, locationId) {
  if (actor.role !== 'staff' || !actor.locationIds.includes(locationId)) fail('FORBIDDEN');
}
function ownBooking(actor, booking) {
  if (actor.role === 'staff') scope(actor, booking.locationId);
  else if (actor.customerId !== booking.customerId) fail('FORBIDDEN');
}
function requireBooking(state, id) {
  const booking = typeof id === 'string' ? state.bookings.get(id) : null;
  if (!booking) fail('NOT_FOUND');
  return booking;
}
function requireChange(state, id) {
  const change = typeof id === 'string' ? state.changes.get(id) : null;
  if (!change) fail('NOT_FOUND');
  return change;
}
function effectiveState(state, booking) {
  const applied = [...state.changes.values()].find((change) => change.bookingId === booking.id && change.status === 'APPLIED');
  return applied ? (applied.kind === 'CANCEL' ? 'CANCELLED' : 'RESCHEDULED') : booking.status;
}
function requireNoDuplicate(state, { customerId, locationId, startAt }, excludedBookingId) {
  if ([...state.bookings.values()].some((booking) => booking.id !== excludedBookingId &&
      ['PENDING', 'CONFIRMED'].includes(effectiveState(state, booking)) &&
      booking.customerId === customerId && booking.locationId === locationId && booking.startAt === startAt)) {
    fail('DUPLICATE_REQUEST');
  }
}
function snapshot(state, booking) { return { ...booking, effectiveState: effectiveState(state, booking) }; }
function nextId(state, kind) { return `demo-${kind}-${++state.sequence}`; }
function resourceFor(resourceId, locationId) {
  if (typeof resourceId !== 'string' || resources.get(resourceId) !== locationId) fail('UNKNOWN_RESOURCE');
  return resourceId;
}
function interval(startAt, serviceId) {
  const durationMinutes = durations.get(serviceId);
  const end = new Date(new Date(startAt).getTime() + durationMinutes * 60_000);
  if (!Number.isFinite(end.getTime())) fail('INVALID_START_AT');
  return { startAt, endAt: end.toISOString(), durationMinutes };
}
function requireFree(state, resourceId, startAt, endAt, excludedBookingId) {
  const conflict = [...state.allocations.values()].some((allocation) => allocation.active &&
    allocation.bookingId !== excludedBookingId && allocation.resourceId === resourceId &&
    Date.parse(startAt) < Date.parse(allocation.endAt) && Date.parse(allocation.startAt) < Date.parse(endAt));
  if (conflict) fail('RESOURCE_CONFLICT');
}
function requireFreshReferences(state, refs) {
  if (new Set(refs).size !== refs.length || refs.some((ref) => state.references.has(ref))) fail('REFERENCE_CONFLICT');
}
function addAllocation(state, booking) {
  const id = nextId(state, 'allocation');
  state.allocations.set(id, { id, bookingId: booking.id, locationId: booking.locationId,
    resourceId: booking.resourceId, startAt: booking.startAt, endAt: booking.endAt, active: true });
}

/**
 * Async domain policy behind injected adapters. No endpoint or actual auth exists.
 * repository.transaction(work) must atomically commit/rollback the entire draft.
 * identity.resolve(session) must resolve fresh actor identity on EVERY operation.
 */
export function createBookingService({ identity, repository, clock = () => new Date(), changePolicy = () => false } = {}) {
  if (typeof identity?.resolve !== 'function' || typeof repository?.transaction !== 'function' ||
      typeof clock !== 'function' || typeof changePolicy !== 'function') fail('INVALID_CONFIGURATION');

  function currentTime() {
    let value;
    try { value = clock(); } catch { fail('INVALID_CONFIGURATION'); }
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) fail('INVALID_CONFIGURATION');
    return value;
  }
  function future(startAt) { if (Date.parse(startAt) <= currentTime().getTime()) fail('PAST_TIME'); }
  function policy(operation, actor, booking, change) {
    let approved;
    try { approved = changePolicy(structuredClone({ operation, actor, booking, change })); } catch { fail('POLICY_UNDECIDED'); }
    if (approved !== true) fail('POLICY_UNDECIDED');
  }
  async function transact(session, work) {
    try {
      return await repository.transaction(async (state) => {
        const resolved = await identity.resolve(session);
        if (!record(resolved) || typeof resolved.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(resolved.id) ||
            !['customer', 'staff'].includes(resolved.role)) fail('UNAUTHENTICATED');
        const actor = structuredClone(resolved);
        if (actor.role === 'customer' && !customers.has(actor.customerId)) fail('UNAUTHENTICATED');
        if (actor.role === 'staff' && (!Array.isArray(actor.locationIds) || actor.locationIds.some((id) => !locations.has(id)))) fail('UNAUTHENTICATED');
        return await work(state, actor);
      });
    } catch (error) {
      // Only stable codes cross the service boundary; never adapter/input text.
      throw failure(errorCodes.has(error?.code) ? error.code : 'ADAPTER_FAILURE');
    }
  }
  function mutate(state, actor, operation, targetId, body, key, work) {
    validateKey(key);
    const scopedKey = JSON.stringify([actor.id, key]);
    const fingerprint = JSON.stringify({ operation, targetId, body });
    const previous = state.idempotency.get(scopedKey);
    if (previous) {
      if (previous.fingerprint !== fingerprint) fail('IDEMPOTENCY_CONFLICT');
      return structuredClone(previous.outcome);
    }
    const outcome = work();
    const event = { id: nextId(state, 'audit'), actorId: actor.id, operation,
      targetId: targetId ?? outcome.id, at: currentTime().toISOString() };
    state.audit.push(event);
    state.idempotency.set(scopedKey, { operation, targetId: targetId ?? outcome.id, fingerprint, outcome: structuredClone(outcome) });
    return outcome;
  }

  return Object.freeze({
    async request(session, input, key) {
      return transact(session, (state, actor) => {
        exact(input, ['locationId', 'serviceId', 'customerId', 'startAt', 'privacyAccepted']);
        const body = { locationId: text(input.locationId), serviceId: text(input.serviceId), customerId: text(input.customerId),
          startAt: iso(input.startAt), privacyAccepted: input.privacyAccepted };
        if (!locations.has(body.locationId)) fail('UNKNOWN_LOCATION');
        if (!durations.has(body.serviceId)) fail('UNKNOWN_SERVICE');
        if (!customers.has(body.customerId)) fail('UNKNOWN_CUSTOMER');
        if (body.privacyAccepted !== true) fail('PRIVACY_REQUIRED');
        if (actor.role === 'staff') scope(actor, body.locationId);
        else if (actor.customerId !== body.customerId) fail('FORBIDDEN');
        return mutate(state, actor, 'request', null, body, key, () => {
          future(body.startAt);
          requireNoDuplicate(state, body);
          const booking = { id: nextId(state, 'booking'), status: 'PENDING', ...body,
            createdAt: currentTime().toISOString(), treatwellReference: null, resourceId: null,
            durationMinutes: null, endAt: null, sourceBookingId: null };
          state.bookings.set(booking.id, booking);
          return snapshot(state, booking);
        });
      });
    },

    async confirm(session, bookingId, action, key) {
      return transact(session, (state, actor) => {
        if (actor.role !== 'staff') fail('FORBIDDEN');
        const booking = requireBooking(state, bookingId);
        scope(actor, booking.locationId);
        exact(action, ['resourceId', 'manuallyChecked', 'matchedLocationId', 'matchedStartAt', 'treatwellReference']);
        const body = { resourceId: resourceFor(action.resourceId, booking.locationId), manuallyChecked: action.manuallyChecked,
          matchedLocationId: text(action.matchedLocationId), matchedStartAt: iso(action.matchedStartAt),
          treatwellReference: reference(action.treatwellReference) };
        return mutate(state, actor, 'confirm', bookingId, body, key, () => {
          if (booking.status !== 'PENDING') fail('INVALID_TRANSITION');
          // Check the server clock after transaction/identity waits. Replays
          // return their stored outcome before this first-confirmation guard.
          future(booking.startAt);
          if (body.manuallyChecked !== true) fail('RECONCILIATION_REQUIRED');
          if (body.matchedLocationId !== booking.locationId || body.matchedStartAt !== booking.startAt) fail('RECONCILIATION_MISMATCH');
          requireFreshReferences(state, [body.treatwellReference]);
          const timing = interval(booking.startAt, booking.serviceId);
          requireFree(state, body.resourceId, timing.startAt, timing.endAt);
          const confirmed = { ...booking, ...timing, status: 'CONFIRMED', resourceId: body.resourceId, treatwellReference: body.treatwellReference };
          state.bookings.set(bookingId, confirmed);
          state.references.add(body.treatwellReference);
          addAllocation(state, confirmed);
          return snapshot(state, confirmed);
        });
      });
    },

    async decline(session, bookingId, action, key) {
      return transact(session, (state, actor) => {
        if (actor.role !== 'staff') fail('FORBIDDEN');
        const booking = requireBooking(state, bookingId);
        scope(actor, booking.locationId);
        exact(action, []);
        return mutate(state, actor, 'decline', bookingId, {}, key, () => {
          if (booking.status !== 'PENDING') fail('INVALID_TRANSITION');
          const declined = { ...booking, status: 'DECLINED' };
          state.bookings.set(bookingId, declined);
          return snapshot(state, declined);
        });
      });
    },

    async get(session, bookingId) {
      return transact(session, (state, actor) => {
        const booking = requireBooking(state, bookingId);
        ownBooking(actor, booking);
        return snapshot(state, booking);
      });
    },

    async list(session, filter) {
      return transact(session, (state, actor) => {
        if (actor.role !== 'staff') fail('FORBIDDEN');
        exact(filter, ['locationId']);
        const locationId = text(filter.locationId);
        if (!locations.has(locationId)) fail('UNKNOWN_LOCATION');
        scope(actor, locationId);
        return [...state.bookings.values()].filter((booking) => booking.locationId === locationId).reverse().map((booking) => snapshot(state, booking));
      });
    },

    async proposeChange(session, bookingId, action, key) {
      return transact(session, (state, actor) => {
        if (actor.role !== 'staff') fail('FORBIDDEN');
        const booking = requireBooking(state, bookingId);
        scope(actor, booking.locationId);
        policy('proposeChange', actor, booking);
        if (!record(action)) fail('INVALID_INPUT');
        const kindDescriptor = Object.getOwnPropertyDescriptor(action, 'kind');
        if (!kindDescriptor || !Object.hasOwn(kindDescriptor, 'value') ||
            !['CANCEL', 'RESCHEDULE'].includes(kindDescriptor.value)) fail('INVALID_INPUT');
        const kind = kindDescriptor.value;
        exact(action, kind === 'CANCEL' ? ['kind'] : ['kind', 'newStartAt']);
        const body = kind === 'CANCEL' ? { kind } : { kind, newStartAt: iso(action.newStartAt) };
        return mutate(state, actor, 'proposeChange', bookingId, body, key, () => {
          if (effectiveState(state, booking) !== 'CONFIRMED') fail('INVALID_TRANSITION');
          if (body.kind === 'RESCHEDULE') future(body.newStartAt);
          const change = { id: nextId(state, 'change'), bookingId, locationId: booking.locationId,
            ...body, status: 'PENDING', createdAt: currentTime().toISOString(), createdBy: actor.id,
            changeReference: null, replacementBookingId: null };
          state.changes.set(change.id, change);
          return { ...change };
        });
      });
    },

    async rejectChange(session, changeId, action, key) {
      return transact(session, (state, actor) => {
        if (actor.role !== 'staff') fail('FORBIDDEN');
        const change = requireChange(state, changeId);
        const booking = requireBooking(state, change.bookingId);
        scope(actor, booking.locationId);
        policy('rejectChange', actor, booking, change);
        exact(action, []);
        return mutate(state, actor, 'rejectChange', changeId, {}, key, () => {
          if (change.status !== 'PENDING') fail('INVALID_TRANSITION');
          const rejected = { ...change, status: 'REJECTED', rejectedAt: currentTime().toISOString() };
          state.changes.set(changeId, rejected);
          return { ...rejected };
        });
      });
    },

    async applyChange(session, changeId, action, key) {
      return transact(session, (state, actor) => {
        if (actor.role !== 'staff') fail('FORBIDDEN');
        const change = requireChange(state, changeId);
        const booking = requireBooking(state, change.bookingId);
        scope(actor, booking.locationId);
        policy('applyChange', actor, booking, change);
        const fields = ['manuallyChecked', 'matchedLocationId', 'matchedOriginalStartAt', 'originalTreatwellReference', 'changeReference'];
        if (change.kind === 'RESCHEDULE') fields.push('matchedNewStartAt', 'resourceId', 'replacementTreatwellReference');
        exact(action, fields);
        const body = { manuallyChecked: action.manuallyChecked, matchedLocationId: text(action.matchedLocationId),
          matchedOriginalStartAt: iso(action.matchedOriginalStartAt), originalTreatwellReference: reference(action.originalTreatwellReference),
          changeReference: reference(action.changeReference) };
        if (change.kind === 'RESCHEDULE') Object.assign(body, {
          matchedNewStartAt: iso(action.matchedNewStartAt), resourceId: resourceFor(action.resourceId, booking.locationId),
          replacementTreatwellReference: reference(action.replacementTreatwellReference),
        });
        return mutate(state, actor, 'applyChange', changeId, body, key, () => {
          if (change.status !== 'PENDING' || effectiveState(state, booking) !== 'CONFIRMED') fail('INVALID_TRANSITION');
          if (body.manuallyChecked !== true) fail('RECONCILIATION_REQUIRED');
          if (body.matchedLocationId !== booking.locationId || body.matchedOriginalStartAt !== booking.startAt ||
              body.originalTreatwellReference !== booking.treatwellReference) fail('RECONCILIATION_MISMATCH');
          let replacement = null;
          if (change.kind === 'RESCHEDULE') {
            if (body.matchedNewStartAt !== change.newStartAt) fail('RECONCILIATION_MISMATCH');
            future(change.newStartAt);
            requireNoDuplicate(state, { customerId: booking.customerId,
              locationId: booking.locationId, startAt: change.newStartAt }, booking.id);
            const timing = interval(change.newStartAt, booking.serviceId);
            requireFree(state, body.resourceId, timing.startAt, timing.endAt, booking.id);
            requireFreshReferences(state, [body.changeReference, body.replacementTreatwellReference]);
            replacement = { ...booking, id: nextId(state, 'booking'), ...timing,
              resourceId: body.resourceId, treatwellReference: body.replacementTreatwellReference,
              sourceBookingId: booking.id, createdAt: currentTime().toISOString() };
          } else requireFreshReferences(state, [body.changeReference]);
          const appliedAt = currentTime().toISOString();
          for (const allocation of state.allocations.values()) {
            if (allocation.bookingId === booking.id && allocation.active) Object.assign(allocation,
              { active: false, retiredAt: appliedAt, retiredByChangeId: changeId });
          }
          if (replacement) {
            state.bookings.set(replacement.id, replacement);
            addAllocation(state, replacement);
            state.references.add(body.replacementTreatwellReference);
          }
          state.references.add(body.changeReference);
          const applied = { ...change, status: 'APPLIED', appliedAt,
            changeReference: body.changeReference, replacementBookingId: replacement?.id ?? null };
          state.changes.set(changeId, applied);
          return { ...applied };
        });
      });
    },
  });
}
