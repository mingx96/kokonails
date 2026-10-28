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

Stop the original server before serving `dist/` on the same port. `PORT` may select a different local port. The build checks and cleans only its resolved `dist/` output, refuses an output symlink/junction, and writes exactly six approved static assets. Existing files outside that output remain untouched. Building does not deploy anything.

## What this slice demonstrates

- German mobile layout, clear `PENDING` receipt and no reserved-slot promise.
- Fixed synthetic choices; no real names, contact fields, addresses, prices or business links.
- Idempotent replay, conflicting-key rejection, duplicate active-request checks, valid future times in demo timezone `Europe/Berlin`, including DST gaps and overlaps.
- Mock policy denies guest queue access; terminal requests cannot change. Confirmation requires exact location/date/time, explicit manual attestation and a unique `DEMO-…` reference.
- Neutral review-invitation text preview, with no satisfaction filtering, incentives or sending.
- No submission network client, cookies, local/session storage, analytics, external fonts or images. Memory is isolated per tab and disappears on reload.
- Booking and team controls are disabled in source HTML. They open only after initialization and submit listeners are ready; disabled JavaScript or a failed/delayed module keeps the form inert with visible guidance.
- `noindex,nofollow,noarchive` metadata, robots disallow and versioned test response headers. These are indexing instructions, not access control.

**The public team simulation is not authentication.** Its browser role selector is intentionally inspectable and bypassable. There is no writable backend or real admin endpoint. Client tests prove simulation behavior only; never connect this version to customer data.

## Source provenance and stack decision

The base branch at `c139fbdf` contained only five documentation/ignore files. The reference `koko-nails-growth-mvp.zip` was not found in the inspected accessible locations; it has **not** been imported, executed or verified. The earlier FastAPI migration plan and its historical test count remain in `docs/superpowers` as historical documents.

This is a new dependency-free JavaScript test scaffold, not a recovered FastAPI application. Static ES modules plus Node's built-in test runner make the first slice runnable without provisioning accounts, credentials or a database. `dist/` is a candidate artifact for a future separate Vercel test project after review; no project or deployment was created. A reviewed local `vercel.json` candidate now specifies this output and all-path test headers; automatic Git deployments are disabled. Python/backend tests do not apply to this scaffold and have not been run.

See [test contract](docs/test-slice-contract.md), [source audit and release boundaries](docs/source-audit.md) and [independent QA](docs/qa-review.md).

## Candidate Vercel test configuration

`vercel.json` sets `framework: null`, `buildCommand: npm run build`, no install command, and `outputDirectory: dist`. Every path has `X-Robots-Tag: noindex, nofollow, noarchive` plus browser/CDN `no-store` headers. The loopback server reads the same header values for local tests. No CSP or authentication mechanism is used to hide form submission failures.

These are configuration and local artifact checks, not proof of hosted behavior. After an independently approved test deployment, check actual GET/HEAD responses for `/`, all six assets and 404 paths, browser `Cache-Control`, `CDN-Cache-Control`, `X-Robots-Tag` and asset exposure. Vercel consumes its `Vercel-CDN-Cache-Control` header, so do not require that internal header to appear in the browser. Recheck failure cases and ensure docs, screenshots, sources outside the six output assets and writable/admin endpoints are not served. No deployment is authorized by this file.

Configuration follows Vercel's [static headers/output settings](https://vercel.com/docs/project-configuration/vercel-json), [cache-control behavior](https://vercel.com/docs/caching/cache-control-headers) and [disabled automatic Git deployments](https://vercel.com/docs/project-configuration/git-configuration#turning-off-all-automatic-deployments). Hosted header/CDN behavior remains **NOT RUN**.

## Optional browser regression

The portable `tests/browser-boot.cjs` and `tests/browser-flow.cjs` checks use an already installed Playwright runtime and always launch a fresh headless browser. They never install packages or attach to a browser. With the local server running:

```sh
node tests/browser-boot.cjs
node tests/browser-flow.cjs
```

If Playwright is outside normal module lookup, set `KOKO_PLAYWRIGHT_MODULE` to its installed module path. `KOKO_CHROMIUM_EXECUTABLE` can select an existing Chromium executable; `KOKO_BASE_URL` may select another loopback IP origin, and `KOKO_EXPECTED_COMMIT` can enforce the exact Git revision. Results, screenshots and source hashes go to ignored `output/playwright/`. These browser checks are optional because the default Node suite has no installed dependencies.

The [tracked synthetic screenshots](docs/review-images/README.md) are available for independent pixel review without access to this machine.

## Separate local operational lab

```sh
npm run lab
```

Open `http://127.0.0.1:4183`. This separate German lab runs the existing server-domain contract through its fake adapter **inside browser memory**. Its loopback server only serves a fixed source-asset allowlist; there is no booking API. No build or deployment includes the lab. The existing static preview and six-file `dist/` remain unchanged.

As Testkundin 01, submit a request for a fixed synthetic UTC time. Choose Testteam A, open the request, enter distinct simulated studio/time/reference evidence and explicitly attest the mock reconciliation before confirming. An initial request can also be declined. Changes are denied by default; the separate “Änderungen testen” scenario requires acknowledging deletion of all local state before restart. It permits test-only cancellation/reschedule proposals, rejection and manually attested application. These are invented mechanics, not salon policy. The clock is fixed at `2027-01-01T00:00:00.000Z`; test services/resources/durations/times are not business facts or available slots.

Every fixture role is public and bypassable: this is **not a protected admin**. Changing roles/studios re-reads through the fake contract; in-flight actions lock switching/reset. Reload loses all data. Error text uses the contract's public descriptors. No customer contact fields, real Treatwell access, outbound messages, durable storage, real authentication or database exist.

Read [lab contract and runbook](docs/lab-contract.md), [design challenge](docs/lab-design-review.md) and [independent operational QA](docs/lab-qa.md). Optional browser regression uses the same existing Playwright environment variables as above, with `KOKO_LAB_ORIGIN` for another loopback origin:

```sh
node tests/lab-browser.cjs
```

The additional bounded keyboard/narrow-layout check is `node tests/lab-usability.cjs`, using the same existing runtime and loopback origin. It tests keyboard navigation and 320px reflow with text enlarged to 200%; this is not a real-device or screen-reader certification. See [usability evidence](docs/lab-usability-review.md) and the consolidated [salon pilot setup checklist](docs/pilot-setup-checklist.md).

## Before any live pilot

Keep the business rules in [AGENTS.md](AGENTS.md) and the [existing specification](docs/superpowers/specs/2026-10-22-koko-growth-os-design.md). Obtain owner-verified details for each salon, services/prices, official Treatwell links and reviewed legal/privacy copy. Do not repurpose existing marketplace bookings to avoid fees.

A branch alone does not isolate data. A separate test deployment, environment, database and approved secrets are required before integration. Implement server-side identity/MFA, authorization, atomic idempotency and transition checks, reconciliation audit, retention, backup and failure recovery. Review the complete workflow before customer use. Keep outbound messages disabled until separately approved and tested. No scraping or automatic Treatwell writes/confirmation.

This repository is public. Never commit real booking records, contact information, financial documents, credentials, database files or unlicensed assets. Merge and deployment require the parent checkpoint.
