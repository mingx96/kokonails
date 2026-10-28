# Future database and identity integration points

Design notes for the isolated synthetic server experiment, 2026-10-28 UTC. This is not a migration, database schema installation, provider selection, authentication configuration or deployment approval. The reviewed static candidate remains `be50423`; its public mock is not connected to this module.

## Interfaces and trust boundary

The service receives an identity adapter and repository adapter at server composition time. A caller supplies a fixture session handle to the fake system; the service resolves the current actor through `identity.resolve()` on every command/read/replay. Roles, customer identity and location grants are never trusted from a request body. `createFakeIdentityAdapter` is only a test resolver; its public fixture handles are not real authentication credentials.

The fake repository executes an async transaction against a private cloned draft, with a single-process queue. A successful callback commits the draft; a rejection discards it. IDs, reference reservations, audit and idempotency entries belong to that same draft. This lets tests exercise rollback and concurrent command ordering locally. It does not prove distributed locking, crash durability, real database isolation or authentication.

A production repository needs equivalent transaction semantics with durable records. Do not implement the interface as independent queries outside one database transaction. Do not call external providers while holding database locks; record a reconciliation intent/outcome and handle uncertain external outcomes separately. No such external operation exists here.

## Database constraints to design and verify

| Invariant | Future authoritative enforcement |
| --- | --- |
| Unique request/booking/change IDs | Database primary keys and server-generated identifiers |
| Idempotency belongs to an authenticated actor | Unique `(actor_id, idempotency_key)` command record containing normalized operation/target/payload fingerprint and original result version; insert/check atomically with the mutation |
| Same key cannot change operation, target or payload | Compare canonical fingerprint inside the transaction; conflicting replay fails without mutation; reauthorize before returning cached data |
| Requests do not reserve availability | PENDING requests have no active allocation; multiple customers may request overlapping times |
| Duplicate active customer request | Transactional uniqueness/locking over the decided customer/location/start definition; this is request deduplication, not a salon capacity rule |
| Location/service/resource validity | Foreign keys to an approved catalog; resource location must equal booking location; duration comes from the server catalog |
| Resource allocation interval | Valid UTC start/end, strictly positive duration, and no overlap for active allocations on the same resource; half-open intervals allow adjacency |
| Concurrent confirmations cannot both reserve one resource | Database-enforced non-overlap where supported, or a transaction strategy that serializes the resource and prevents phantom overlap checks; choose and test on the actual provider |
| State transitions and competing changes | Lock/check source booking and pending change/version inside the transaction; compare expected state/version before writing the outcome |
| Reschedule is all-or-nothing | Lock source and destination resources in a stable order; retire old allocation, reserve replacement, persist links/references, audit and command outcome atomically |
| External reference uniqueness | Unique provider/account/reference identity at a scope verified against real Treatwell references; fixture global DEMO uniqueness is not evidence of the real scope |
| Historical terminal booking rows remain immutable | Preserve original confirmation/decline outcome; model subsequent change outcomes as linked append-only records and derive an effective projection |
| Audit integrity | Actor-attributed events stored with the command transaction; no client-chosen actor and no raw session tokens or customer contact details in event/log bodies |

If the database reports a serialization/deadlock/uniqueness conflict, retry only the bounded transaction with the same idempotency identity, then re-read the authoritative result. Test multiple processes/connections, rollback and crash recovery against the real database. The in-memory tests do not cover those failure modes.

## Real authentication integration

An approved identity provider must validate the session on the server, including validity/expiry and the provider's intended issuer/audience. Resolve the internal actor and current location permissions from an authoritative source. Staff mutations require the staff role plus the target location grant; customer reads/requests require the matching internal customer identity. Revalidate permissions before idempotent replay, so revocation cannot expose cached results.

Before connecting real staff: test MFA/session lifecycle, revoked/expired sessions, privilege changes, cross-location access, CSRF/origin protection for cookie sessions, secure session-cookie behavior, and redacted error/audit logging. These are future integration gates, not protections provided by the fake resolver. Never expose the fake adapter or the browser's demo role as an authenticated admin backend.

No provider, credentials, grants, secrets or session settings are created by this branch. Keep actual credentials server-side in a separately approved environment; never commit them or copy production configuration into a test project.

## Data and environment isolation

The first real adapter should still use synthetic fixtures in a separate test database and namespace, with no access to production customer records or Treatwell writes. A Git branch is not data isolation. Verify the test deployment/project ID, database identity, environment bindings and log destinations independently before running integration tests.

Real contact details require a separately reviewed collection/privacy/retention and staff-access design. Keep them out of public code, fixtures, screenshots, audit payloads and test output. Add backup/recovery and deletion/retention verification before a real pilot. Outbound email, SMS and review invitations remain hard off until a separately reviewed messaging workflow exists.

## Business decisions requiring owner review

- Actual salon locations, services, durations, opening hours, capacity/resources and timezone per location.
- Who may propose/carry out a change: customer, staff, supervisor; pending-request withdrawal and expiry/late-confirmation policy.
- Cancellation/reschedule notice windows, fees, no-shows, repeated changes and cross-location/service changes.
- How staff prove a manual Treatwell cancellation/rebooking, which references uniquely identify it and how uncertain outcomes are reconciled.
- Which effective-state projection should appear in customer/staff history and how declined/expired change proposals are presented.

The experiment's separate change-request workflow is a proposal. Default `changePolicy` denies it. Tests that inject `() => true` exercise mechanics only and must not be interpreted as business approval. Treatwell remains the authoritative calendar, no slot is promised for a direct request, and no existing marketplace booking is shifted to avoid fees.

## Next integration slice after approval

Choose the smallest compatible repository/identity adapters after the environment and business decisions above are settled; reuse the existing JavaScript domain and tests where appropriate. Keep the historical FastAPI source audit open if its ZIP becomes available. Add a thin HTTP boundary only then, with server validation and fail-closed UI errors. Verify the full browser → API → identity → transaction → receipt flow using synthetic data before any real customer use.
