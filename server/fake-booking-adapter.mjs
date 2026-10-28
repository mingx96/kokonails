import { createBookingService } from './booking-service.mjs';

/** Public fixture handles only. This resolver is not session authentication. */
export function createFakeIdentityAdapter() {
  const identities = new Map([
    ['fixture-customer-01', { id: 'fixture-customer-01', role: 'customer', customerId: 'demo-01' }],
    ['fixture-customer-02', { id: 'fixture-customer-02', role: 'customer', customerId: 'demo-02' }],
    ['fixture-staff-a', { id: 'fixture-staff-a', role: 'staff', locationIds: ['demo-a'] }],
    ['fixture-staff-b', { id: 'fixture-staff-b', role: 'staff', locationIds: ['demo-b'] }],
    ['fixture-staff-all', { id: 'fixture-staff-all', role: 'staff', locationIds: ['demo-a', 'demo-b'] }],
  ]);
  return Object.freeze({
    async resolve(session) {
      return typeof session === 'string' && identities.has(session) ? structuredClone(identities.get(session)) : null;
    },
  });
}

/** Single-process serialized copy-on-write fake. This proves no real DB behavior. */
export function createFakeBookingRepository() {
  let state = {
    bookings: new Map(), changes: new Map(), allocations: new Map(),
    references: new Set(), idempotency: new Map(), audit: [], sequence: 0,
  };
  let tail = Promise.resolve();
  function inspect() {
    return structuredClone({
      bookings: [...state.bookings.values()], changes: [...state.changes.values()],
      allocations: [...state.allocations.values()], references: [...state.references],
      idempotency: [...state.idempotency].map(([key, value]) => ({ key, ...value })),
      audit: state.audit, sequence: state.sequence,
    });
  }
  return Object.freeze({
    inspect,
    transaction(work) {
      const result = tail.then(async () => {
        const draft = structuredClone(state);
        const value = await work(draft);
        // Clone before commit so cloning failure also rolls back. No draft or
        // result reference retained by a caller can mutate committed state.
        const outcome = structuredClone(value);
        const committed = structuredClone(draft);
        state = committed;
        return outcome;
      });
      tail = result.then(() => undefined, () => undefined);
      return result;
    },
  });
}

export function createFakeBookingSystem({ clock = () => new Date(), changePolicy } = {}) {
  const repository = createFakeBookingRepository();
  const identity = createFakeIdentityAdapter();
  return Object.freeze({
    service: createBookingService({ identity, repository, clock, changePolicy }),
    inspect: repository.inspect,
  });
}
