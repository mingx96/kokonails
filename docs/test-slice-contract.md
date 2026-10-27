# Synthetic booking slice contract

Status: local test scaffold; no deployment, real authentication, database, customer data or outbound messages. The previous FastAPI migration remains documented in `docs/superpowers`; its ZIP has not been located or imported.

## Ownership

- Coordinator: public/index.html, public/styles.css, public/app.mjs, scripts/, package.json, vercel.json, build/preview tests, README and evidence images.
- Booking worker: public/booking.mjs and tests/booking.test.mjs only. Tests first.
- QA worker: independent review; docs/qa-review.md and optional tests/browser-boot.cjs/tests/browser-flow.cjs regression drivers. No edits to runtime implementation.

## Runtime and domain API

Static browser ES modules, Node 24 built-in tests; no external runtime packages. The app runs only on synthetic catalog/customer choices. Memory resets on refresh; no localStorage/cookies/network submissions. The team screen is a public, explicitly labelled simulation, not an authenticated admin.

`public/booking.mjs` exports:

- `catalog`: `{ locations: [{id,label}], services: [{id,label}], customers: [{id,label}] }`, all unmistakably demo fixtures. Location IDs `demo-a`, `demo-b`; service IDs `demo-care`, `demo-colour`; customer IDs `demo-01`, `demo-02`. No addresses, prices, owner links or real salon claims.
- `createDemoStore({ clock = () => new Date(), idFactory } = {})`
- store `.request(input, idempotencyKey)`: `{ id, status:'PENDING', locationId, serviceId, customerId, date, time, privacyAccepted:true, createdAt, treatwellReference:null }`. Identical normalized replay returns same request; same key/different data rejects. Reject unknown fields, location/service/customer, missing privacy, invalid calendar dates/times, past times. Interpret requested times using explicitly labelled demo timezone Europe/Berlin; reject nonexistent/ambiguous DST times. Key must be 8–100 URL-safe characters. Duplicate active request for same customer/location/date/time is rejected even under a different key. No availability/slot claim; different customers may request same time.
- store `.list(context)`: defensive copies, newest first; context `{role:'staff-demo'}` required, otherwise throws `FORBIDDEN`.
- store `.transition(id, action, context)`: only `PENDING -> CONFIRMED|DECLINED`. CONFIRMED requires `{status:'CONFIRMED', treatwellReference:'DEMO-…', manuallyChecked:true, matchedLocationId, matchedDate, matchedTime}` matching request exactly. This is a simulated manual attestation, never a real Treatwell verification. DECLINED requires only `{status:'DECLINED'}`. No terminal status may transition again, even to itself. References synthetic and unique. Defensive copies throughout.
- failures throw Error with `.code` string and no PII. UI maps codes to German text.

Authorization is an injectable mock context solely to exercise policy; it is not secure authentication. A future backend must reimplement enforcement with server identity, atomic persistence/uniqueness and audit logs before any customer use.

## Acceptance

1. German mobile layout with labelled fields and unmistakable test notice; keyboard-accessible errors and success state.
2. No real contact entry; fixed synthetic customers, clearly named demo services/locations; Treatwell link unavailable until verified.
3. Request starts PENDING; text says no reservation. Repeated submit/idempotency cannot create a second request.
4. Demo team queue cannot confirm without a synthetic reference, explicit manual matching and matching location/date/time; terminal requests cannot change.
5. No outgoing requests or persistent browser storage. Neutral review invitation preview, no send controls or satisfaction gate.
6. `noindex,nofollow`, robots disallow; no location/service schema or business metadata built from unverified data.
7. Node tests and syntax/build checks; independent desktop/mobile browser QA in isolated headless Chromium only. Never attach to the restaurant Chrome.
8. Static controls stay disabled until app initialization and listeners complete. JavaScript-disabled, failed dependency and delayed boot must not cause native navigation or field-bearing requests; visible status guidance remains available.
9. Build cleans only its resolved `dist/` output, rejects symlink/junction output and publishes exactly the six approved assets; stale sentinel disappears and an outside-output sentinel survives.
10. Candidate Vercel config restricts output to `dist/`, applies all-path noindex/no-store and disables automatic Git deployments. Local header/artifact checks must be distinguished from hosted HTTP/CDN behavior, which stays NOT RUN until separate approval and deployment.

## Design direction

Cool porcelain #F7F8FC, ink plum #292035, cobalt #334DCE, lilac #DFD9EE, rose lacquer #B93663. Georgia display type and Segoe UI body, locally available without font requests. Left-aligned editorial headline and a single original CSS lacquer/nail shape; compact booking panel to the right on desktop, below on mobile. Service and location sections disclose missing verification instead of inventing business facts. Avoid repeated decorative cards.

## Deployment boundary

No merge, deployment, paid service, credentials/permissions/security changes, Treatwell integration or customer-data connection before parent checkpoint. A branch does not isolate data. A future Vercel test project and separate database/env must be reviewed first.
