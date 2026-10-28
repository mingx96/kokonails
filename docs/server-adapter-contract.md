# Isolated synthetic server booking experiment

Base: reviewed static candidate `be50423e2cda0c76a2ad3c617b843f7ad44a9513`. Branch `test/server-booking-adapter` must leave `public/`, `vercel.json`, and the static build/server unchanged. No HTTP endpoint, deployment, database, migration, credentials, actual authentication, customer data, Treatwell connection or outbound service is added.

This is an asynchronous domain module behind injected identity/repository interfaces, exercised with synthetic adapters. A serialized in-memory transaction proves only the fake adapter's single-process behavior. It proves neither real database transactions nor real session authentication.

## Owners

- Coordinator: this contract, server README, future database/auth integration notes, syntax-check list and final evidence.
- Booking worker: `server/booking-service.mjs`, `server/fake-booking-adapter.mjs`, `tests/server-booking.test.mjs`. Tests first; no commit.
- Independent QA: `tests/server-authorization.test.mjs`, `docs/server-review.md`; no runtime implementation edits.

## Synthetic public API

`server/fake-booking-adapter.mjs` exports `createFakeBookingSystem({clock, changePolicy} = {})`, returning `{service, inspect}`. `inspect()` exposes defensive repository snapshots only for tests. The default clock is real time; tests inject a fixed clock. Session handles below are public fixture identifiers, not credentials. No token is created, stored, requested or logged.

Fixture sessions:

- `fixture-customer-01`: customer `demo-01`.
- `fixture-customer-02`: customer `demo-02`.
- `fixture-staff-a`: staff allowed `demo-a` only.
- `fixture-staff-b`: staff allowed `demo-b` only.
- `fixture-staff-all`: staff allowed both demo locations.
- unknown/non-string handles: unauthenticated.

The existing fixed demo location/service/customer IDs may be imported without changing the browser module. Synthetic resources are `resource-a1`, `resource-a2` in `demo-a` and `resource-b1` in `demo-b`. The fake catalog assigns `demo-care` 30 minutes and `demo-colour` 60 minutes **only for test scheduling**; these are not salon durations or capacity claims. Client duration/end time, role, location grants, price, contact and status fields are never accepted.

Service methods are async:

- `request(session, input, key)`: input exactly `{locationId, serviceId, customerId, startAt, privacyAccepted}`. Customer may request only their own fixture identity; staff may request within their location grant. `startAt` is a canonical UTC ISO string (`new Date(startAt).toISOString() === startAt`), strictly future. No dates parsed from local wall time here; a future UI adapter must use the verified salon timezone. Unknown fields/fixture IDs/types, malformed dates, wrong customer, and non-true privacy acceptance reject. Returns a server-generated synthetic booking ID and `status: PENDING`; no resource or slot is held. Same-slot requests from different customers are allowed. Duplicate active requests for same customer/location/start reject even with another key.
- `confirm(session, bookingId, action, key)`: staff only, matching grant. Action exactly `{resourceId, manuallyChecked, matchedLocationId, matchedStartAt, treatwellReference}`. All fields must match the request, `manuallyChecked === true`, resource belongs to the location, reference matches `DEMO-` plus 3–50 alphanumeric/hyphen suffix characters and is unique. No network verification is claimed. Atomically permits only `PENDING -> CONFIRMED`, assigns the server-catalog duration and a resource allocation. Intervals are half-open: adjacent appointments do not overlap. Another effective CONFIRMED allocation on the same resource conflicts; a different resource may overlap.
- `decline(session, bookingId, action, key)`: staff in granted location; action exactly `{}`. Only `PENDING -> DECLINED`.
- `get(session, bookingId)`: staff only in granted location, or the owning fixture customer. Defensive snapshot with derived `effectiveState`.
- `list(session, {locationId})`: staff only; exactly one known granted location; no cross-location leakage.

All mutations require an 8–100 character URL-safe idempotency key. Keys are scoped by authenticated actor, across operations/targets. Same normalized command replays the stored original outcome without a second mutation/event; another target/action/body with that key conflicts. Current identity and location permission must be checked on every call, before replay. Missing/invalid identity fails before revealing record existence. Errors have stable `.code` and no input/PII in messages.

## Proposed change-request state machine, default disabled

The existing booking statuses and terminal rule remain intact: `PENDING -> CONFIRMED|DECLINED`; a CONFIRMED/DECLINED booking row cannot be reconfirmed, declined again or overwritten. Cancellation/rescheduling is modelled as a **separate proposed change-request aggregate**, not a new transition silently added to the browser contract.

`changePolicy` is a synchronous predicate injected at composition time. When omitted it denies every change operation on an existing authorized target with `POLICY_UNDECIDED`, without mutation. Identity/source authorization precedes policy evaluation; a missing target still returns `NOT_FOUND`. Tests may explicitly inject `() => true` to exercise the proposal. This does not establish any real cancellation/reschedule policy.

- `proposeChange(session, bookingId, action, key)`: staff in granted location only, existing effective CONFIRMED booking only. `{kind:'CANCEL'}` or `{kind:'RESCHEDULE', newStartAt}` (canonical future UTC) only. Creates a change record in `PENDING`. The current allocation remains active; a proposal holds no new slot and changes no booking.
- `rejectChange(session, changeId, action, key)`: staff in source location; action `{}` only. Change `PENDING -> REJECTED`; booking/allocation remain unchanged. Repeated terminal transitions reject except an identical idempotent replay.
- `applyChange(session, changeId, action, key)`: staff in source location, explicit policy approval, change PENDING and source still effective CONFIRMED. Cancellation action exactly `{manuallyChecked, matchedLocationId, matchedOriginalStartAt, originalTreatwellReference, changeReference}`. Source reference/location/start must match; changeReference is a unique synthetic reference. Reschedule adds exactly `{matchedNewStartAt, resourceId, replacementTreatwellReference}` with the proposed new time, a resource in the same location and another unique synthetic reference. Changes are only applied after simulated manual Treatwell attestation. No auto-write or real reference verification occurs.
- Apply cancellation atomically appends an audit/change outcome `APPLIED`, releases the old allocation and derives source `effectiveState: CANCELLED` while leaving its stored terminal `status: CONFIRMED` untouched.
- Apply reschedule atomically checks overlap (excluding the source allocation) and the same active customer/location/start deduplication invariant used by requests (excluding the source booking), appends change outcome APPLIED, retires the old allocation, derives source `effectiveState: RESCHEDULED` and creates a linked replacement CONFIRMED booking/allocation only after the manual new-reference attestation. Original booking history is retained. A pending proposal alone never confirms the replacement.
- Two concurrent overlapping confirmations, competing apply operations for the same source, or a reschedule colliding with another confirmation must have at most one winner under the fake transaction. Failure leaves all state, references, IDs, allocations and audit/idempotency outcomes unchanged.

Each successful non-replayed mutation writes an actor-attributed synthetic audit event. Defensive snapshots must prevent callers from editing stored state. Default change-policy denial and all authorization/validation failures must be side-effect free.

## Acceptance and limits

Use Node's existing built-in test runner; no new framework or dependencies. Test request replay/conflict, no slot hold, UTC validation, fixture allowlists, unauthorized/missing identity, forged body roles, location denial on reads/writes/replays, same/different resource overlap, concurrent commands, half-open boundaries, reference reuse, stale states, rollback, and opt-in change-request transitions. Preserve existing 42 tests and the exact static asset hashes.

Business decisions remain unresolved: real salon resources/capacity/durations/timezones; customer versus staff change permissions; notice windows, fees and no-show rules; pending-request withdrawal; handling declined/expired proposals; cross-location/service changes; repeated changes; authority for real Treatwell cancellation/rebooking evidence. No fixture policy answers these questions. The change-request proposal requires explicit owner review before adoption.
