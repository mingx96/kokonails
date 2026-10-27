/**
 * Synthetic, in-memory booking policy demo. This module is shipped to browsers.
 * Its injectable staff context is NOT authentication. No customer use is safe
 * until a backend enforces identity, atomic persistence and audit separately.
 */

export const catalog = Object.freeze({
  locations: Object.freeze([
    Object.freeze({ id: 'demo-a', label: 'Teststudio A (Demo)' }),
    Object.freeze({ id: 'demo-b', label: 'Teststudio B (Demo)' }),
  ]),
  services: Object.freeze([
    Object.freeze({ id: 'demo-care', label: 'Nagelpflege (Demo)' }),
    Object.freeze({ id: 'demo-colour', label: 'Farblook (Demo)' }),
  ]),
  customers: Object.freeze([
    Object.freeze({ id: 'demo-01', label: 'Testkundin 01 (Demo)' }),
    Object.freeze({ id: 'demo-02', label: 'Testkundin 02 (Demo)' }),
  ]),
});

const requestFields = ['locationId', 'serviceId', 'customerId', 'date', 'time', 'privacyAccepted'];
const confirmFields = ['status', 'treatwellReference', 'manuallyChecked', 'matchedLocationId', 'matchedDate', 'matchedTime'];
const berlinClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function isRecord(value) {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyFields(value, fields) {
  return isRecord(value) && Reflect.ownKeys(value).every((key) => fields.includes(key));
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function wallParts(timestamp) {
  return Object.fromEntries(berlinClock.formatToParts(timestamp)
    .filter(({ type }) => type !== 'literal')
    .map(({ type, value }) => [type, Number(value)]));
}

function wallTimestamp(parts) {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

/** Return the single corresponding instant; reject DST gaps and repeated hours. */
function requestedInstant(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail('INVALID_DATE');
  const [year, month, day] = date.split('-').map(Number);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() + 1 !== month || calendar.getUTCDate() !== day) {
    fail('INVALID_DATE');
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) fail('INVALID_TIME');
  const [hour, minute] = time.split(':').map(Number);
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  const offsets = new Set();
  // Collect offsets around the target date rather than assuming Berlin's UTC
  // offset. Intl supplies the runtime timezone database, independent of host TZ.
  for (let delta = -36; delta <= 36; delta += 6) {
    const sample = naive + delta * 60 * 60 * 1000;
    offsets.add(wallTimestamp(wallParts(sample)) - sample);
  }
  const candidates = [...offsets].map((offset) => naive - offset).filter((instant) => {
    const parts = wallParts(instant);
    return parts.year === year && parts.month === month && parts.day === day &&
      parts.hour === hour && parts.minute === minute && parts.second === 0;
  });
  if (candidates.length !== 1) fail('INVALID_TIME');
  return candidates[0];
}

function normalizeRequest(input) {
  if (!hasOnlyFields(input, requestFields)) fail('INVALID_INPUT');
  const normalized = {
    locationId: text(input.locationId), serviceId: text(input.serviceId), customerId: text(input.customerId),
    date: text(input.date), time: text(input.time), privacyAccepted: input.privacyAccepted,
  };
  if (!catalog.locations.some(({ id }) => id === normalized.locationId)) fail('UNKNOWN_LOCATION');
  if (!catalog.services.some(({ id }) => id === normalized.serviceId)) fail('UNKNOWN_SERVICE');
  if (!catalog.customers.some(({ id }) => id === normalized.customerId)) fail('UNKNOWN_CUSTOMER');
  if (normalized.privacyAccepted !== true) fail('PRIVACY_REQUIRED');
  return { normalized, instant: requestedInstant(normalized.date, normalized.time) };
}

function requireStaff(context) {
  if (!isRecord(context) || !Object.hasOwn(context, 'role') || context.role !== 'staff-demo') fail('FORBIDDEN');
}

export function createDemoStore({ clock = () => new Date(), idFactory } = {}) {
  if (typeof clock !== 'function' || (idFactory !== undefined && typeof idFactory !== 'function')) {
    fail('INVALID_CONFIGURATION');
  }
  let sequence = 0;
  const makeId = idFactory ?? (() => `demo-request-${++sequence}`);
  const bookings = new Map();
  const idempotency = new Map();
  const references = new Set();

  return Object.freeze({
    request(input, idempotencyKey) {
      if (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(idempotencyKey)) {
        fail('INVALID_IDEMPOTENCY_KEY');
      }
      const { normalized, instant } = normalizeRequest(input);
      const fingerprint = JSON.stringify(normalized);
      const previous = idempotency.get(idempotencyKey);
      if (previous) {
        if (previous.fingerprint !== fingerprint) fail('IDEMPOTENCY_CONFLICT');
        return { ...bookings.get(previous.id) };
      }
      let now;
      try { now = clock(); } catch { fail('INVALID_CONFIGURATION'); }
      if (!(now instanceof Date) || !Number.isFinite(now.getTime())) fail('INVALID_CONFIGURATION');
      if (instant <= now.getTime()) fail('PAST_TIME');
      const duplicate = [...bookings.values()].some((booking) => booking.status !== 'DECLINED' &&
        booking.customerId === normalized.customerId && booking.locationId === normalized.locationId &&
        booking.date === normalized.date && booking.time === normalized.time);
      if (duplicate) fail('DUPLICATE_REQUEST');
      let id;
      try { id = makeId(); } catch { fail('INVALID_CONFIGURATION'); }
      if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(id) || bookings.has(id)) {
        fail('INVALID_CONFIGURATION');
      }
      const booking = {
        id, status: 'PENDING', ...normalized, createdAt: now.toISOString(), treatwellReference: null,
      };
      bookings.set(id, booking);
      idempotency.set(idempotencyKey, { id, fingerprint });
      return { ...booking };
    },

    list(context) {
      requireStaff(context);
      // Map insertion order resolves equal clock timestamps: latest request first.
      return [...bookings.values()].reverse()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((booking) => ({ ...booking }));
    },

    transition(id, action, context) {
      requireStaff(context);
      const booking = bookings.get(id);
      if (!booking) fail('NOT_FOUND');
      if (booking.status !== 'PENDING' || !isRecord(action) || !['CONFIRMED', 'DECLINED'].includes(action.status)) {
        fail('INVALID_TRANSITION');
      }
      if (action.status === 'DECLINED') {
        if (!hasOnlyFields(action, ['status'])) fail('INVALID_TRANSITION');
        const declined = { ...booking, status: 'DECLINED' };
        bookings.set(id, declined);
        return { ...declined };
      }
      if (!hasOnlyFields(action, confirmFields)) fail('INVALID_TRANSITION');
      if (action.manuallyChecked !== true) fail('RECONCILIATION_REQUIRED');
      const reference = text(action.treatwellReference).toUpperCase();
      if (!/^DEMO-[A-Z0-9][A-Z0-9-]{2,49}$/.test(reference)) fail('INVALID_REFERENCE');
      if (text(action.matchedLocationId) !== booking.locationId || text(action.matchedDate) !== booking.date ||
          text(action.matchedTime) !== booking.time) {
        fail('RECONCILIATION_MISMATCH');
      }
      if (references.has(reference)) fail('REFERENCE_CONFLICT');
      const confirmed = { ...booking, status: 'CONFIRMED', treatwellReference: reference };
      bookings.set(id, confirmed);
      references.add(reference);
      return { ...confirmed };
    },
  });
}
