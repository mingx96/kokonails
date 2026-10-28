# Synthetic server-domain experiment

This directory is a local Node module experiment, not an HTTP server, authenticated admin, database adapter or deployment. It is not wired to the reviewed static preview. No framework or additional dependency is needed.

From the repository root, run `npm test` and `npm run check`. The server test files cover policy and fake-adapter behavior; existing browser/booking/static tests remain in the same Node suite.

Example using a fixed test clock and public fixture session identifier:

```js
import { createFakeBookingSystem } from './fake-booking-adapter.mjs';

const { service, inspect } = createFakeBookingSystem({
  clock: () => new Date('2027-01-01T00:00:00.000Z'),
});

const request = await service.request('fixture-customer-01', {
  locationId: 'demo-a',
  serviceId: 'demo-care',
  customerId: 'demo-01',
  startAt: '2027-02-18T13:30:00.000Z',
  privacyAccepted: true,
}, 'example-request-001');

// request.status is PENDING; inspect().allocations is empty.
// This creates no appointment and holds no real or synthetic resource.
```

The service resolves actor roles/location grants through the injected identity adapter on every call. Callers cannot supply a trusted role in a body. The fixture resolver has no actual session security; its identifiers are intentionally public test data.

The repository serializes cloned in-memory drafts and rolls back rejected callbacks. This proves local fake-adapter ordering only. It does not prove real authentication, database transactions, multi-process behavior, crash durability, backups or retention.

Cancellation/rescheduling uses a separate proposed change-request aggregate. It is denied by default. Explicit `changePolicy: () => true` exists only as an opt-in test fixture, not a salon policy. Original confirmed/declined booking rows remain historical terminal records; applied change records derive an effective state and preserve links/audit history. No Treatwell call or real reference verification occurs.

Read the [contract](../docs/server-adapter-contract.md) and [future database/auth integration notes](../docs/server-integration-plan.md) before extending this experiment. Real durations/resources, change permissions, notice windows/fees and reconciliation evidence still require owner decisions.
