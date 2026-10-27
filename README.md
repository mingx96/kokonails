# Koko Nails: synthetic booking test

A runnable German website and booking-policy simulation. **Local test only; no real appointment, protected admin, database or customer messaging.** Treatwell remains the calendar of record. Direct requests start `PENDING`; confirmation is permitted only after a simulated manual match and a synthetic reference.

## Run locally

Requires Node.js 24 or later. There are no runtime or development dependencies to install.

```sh
npm start
```

Open `http://127.0.0.1:4173`. The server binds to loopback only. Choose a demo studio, service, future date/time and synthetic customer. Submit, then select the **Team** demo role below to exercise manual matching, confirmation or rejection. Refresh or **Testdaten zurücksetzen** clears the in-memory data.

```sh
npm test
npm run check
npm run build
node scripts/serve.mjs --built
```

Stop the original server before serving `dist/` on the same port. `PORT` may select a different local port. The build copies only six static assets to `dist/`; it does not deploy anything.

## What this slice demonstrates

- German mobile layout, clear `PENDING` receipt and no reserved-slot promise.
- Fixed synthetic choices; no real names, contact fields, addresses, prices or business links.
- Idempotent replay, conflicting-key rejection, duplicate active-request checks, valid future times in demo timezone `Europe/Berlin`, including DST gaps and overlaps.
- Mock policy denies guest queue access; terminal requests cannot change. Confirmation requires exact location/date/time, explicit manual attestation and a unique `DEMO-…` reference.
- Neutral review-invitation text preview, with no satisfaction filtering, incentives or sending.
- No submission network client, cookies, local/session storage, analytics, external fonts or images. Memory is isolated per tab and disappears on reload.
- `noindex,nofollow,noarchive` metadata, robots disallow and local response headers. These are indexing instructions, not access control.

**The public team simulation is not authentication.** Its browser role selector is intentionally inspectable and bypassable. There is no writable backend or real admin endpoint. Client tests prove simulation behavior only; never connect this version to customer data.

## Source provenance and stack decision

The base branch at `c139fbdf` contained only five documentation/ignore files. The reference `koko-nails-growth-mvp.zip` was not found in the inspected accessible locations; it has **not** been imported, executed or verified. The earlier FastAPI migration plan and its historical test count remain in `docs/superpowers` as historical documents.

This is a new dependency-free JavaScript test scaffold, not a recovered FastAPI application. Static ES modules plus Node's built-in test runner make the first slice runnable without provisioning accounts, credentials or a database. `dist/` is a candidate artifact for a future separate Vercel test project after review; no project, deployment or Vercel configuration was created. Python/backend tests do not apply to this scaffold and have not been run.

See [test contract](docs/test-slice-contract.md), [source audit and release boundaries](docs/source-audit.md) and [independent QA](docs/qa-review.md).

## Before any live pilot

Keep the business rules in [AGENTS.md](AGENTS.md) and the [existing specification](docs/superpowers/specs/2026-10-22-koko-growth-os-design.md). Obtain owner-verified details for each salon, services/prices, official Treatwell links and reviewed legal/privacy copy. Do not repurpose existing marketplace bookings to avoid fees.

A branch alone does not isolate data. A separate test deployment, environment, database and approved secrets are required before integration. Implement server-side identity/MFA, authorization, atomic idempotency and transition checks, reconciliation audit, retention, backup and failure recovery. Review the complete workflow before customer use. Keep outbound messages disabled until separately approved and tested. No scraping or automatic Treatwell writes/confirmation.

This repository is public. Never commit real booking records, contact information, financial documents, credentials, database files or unlicensed assets. Merge and deployment require the parent checkpoint.
