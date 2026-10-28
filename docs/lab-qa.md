# Independent QA — local synthetic booking journey

Status: PASS at implementation `33bbf447a6b47ad30bddda4528986cc10808f0a9`. This is a loopback-only synthetic browser experiment, not a public booking service.

## Scope

- Branch: `test/local-booking-journey`.
- Base: `50638a25ade62906b491ab7628650ac657eeb3d5`.
- QA owns only `tests/lab-browser.cjs`, `tests/lab-independent.test.mjs` and this report. No runtime, package, server, public asset or deployment edits; no commits.
- Tested target: `http://127.0.0.1:4183`, serving lab assets and exact existing domain modules. No HTTP API or real service.
- Fixture clock: `2027-01-01`; requested start values are explicitly UTC. Session handles are public synthetic fixtures, not authentication.

## Execution

| Area | Result | Evidence |
| --- | --- | --- |
| Full Node suite | PASS | `npm.cmd test`: 163 passed, 0 failed, including 10 independent lab tests |
| Syntax and static build | PASS | `npm.cmd run check` and `npm.cmd run build`, exit 0 |
| Browser journeys | PASS | `tests/lab-browser.cjs`: full journey at 390, 768 and 1440px in fresh headless Chromium 156.0.8078.4 |
| Boot failure/delay | PASS | 15 cases: each width with JavaScript disabled, app/controller/domain module failure and delayed app initialization; 18 total browser cases including journeys |
| Privacy/network | PASS | Each normal journey observed only 16 allowlisted local static GETs, no query/form-body/outbound request, zero page/console errors; localStorage/sessionStorage/cookies/IndexedDB empty |
| Server boundary | PASS | GET/HEAD source allowlist, exact domain bytes, no-store/noindex; write methods 405; non-loopback Host 403; query/unlisted/API/config/docs paths 404 |
| Protected preview/artifact | PASS | Seven raw protected hashes match reviewed `be50423` evidence; domain modules and protected Git paths unchanged from base; dist remains six byte-matching public assets, with no lab/server directory |
| Real auth/database/Treatwell/outbound/deployment | NOT RUN | Outside the local experiment |

Browser run completed at `2026-10-28T10:23:40.060Z` with `KOKO_EXPECTED_COMMIT=33bbf447a6b47ad30bddda4528986cc10808f0a9`. Both source hashes and HEAD were checked for drift throughout. No runtime/package/public/server edits or commits were made by QA.

Executed journeys cover request PENDING/no reservation, stable repeated submit, staff review, explicit manual reconciliation, mismatch rejection with preserved inputs/focused public error, confirmation and decline. Default changes deny; selecting another scenario alone grants nothing. Acknowledged reset erases records and explicitly enables the invented-policy fixture. Repeated CANCEL/RESCHEDULE rejection permits a fresh proposal while pending replay stays stable. Applying reschedule retains the historical original and links a replacement; applying cancellation to the replacement produces a terminal historical outcome.

Role/location/invalid-session changes clear stale queue/detail/receipt data. Denied scope shows unavailable guidance instead of a create-request empty cue. Returning the customer after reschedule shows original UTC/reference labels and the unchanged first decision. Busy scope/reset/command attempts and immutable input capture are independently tested in Node. Browser checks cover loading indication, disabled controls, skip link, Enter submission after delayed boot, receipt/detail/error/scope/refresh focus, reset acknowledgement, offline in-memory operation and refresh data loss.

All five boot states preserve disabled source controls before initialization; forced click/Enter causes no additional navigation or data request. Failed-load views retain explicit reload/JavaScript recovery guidance. Intentional module aborts are fault injection, not a claim that failed-load consoles have no network diagnostics or that a general crash detector exists.

## Bug ledger

| ID | Finding/evidence | Resolution |
| --- | --- | --- |
| LAB-QA-01 | Chromium `/v` rejected the original reference character class. With `DEMO-X`, native `patternMismatch` was false and the console reported an invalid regular expression | Escaped hyphen; final browser checks short-reference native rejection and zero normal console errors |
| LAB-QA-02 | Controller probe after CANCEL rejection returned the original proposal ID/PENDING outcome instead of a fresh user proposal; active command keys outlived the intended operation | Cache lifecycle now renews inactive request/rejected-proposal commands. Independent sequential tests and the full UI journey pass; open/pending replay remains stable |
| LAB-QA-03 | Source review found an unguarded `.startsWith` path for null invalid-fixture actors | Guard/fallback landed before the first behavioral run. Final invalid-session clearing and recovery pass; no pre-fix browser failure is claimed |

The inactive customer form in staff mode was hidden after design review. Historical receipt labels, denied-scope empty text and boot recovery copy were clarified before the final candidate; final assertions and screenshots cover them. Initial driver corrections for boolean `details.open`, click latency and legitimate error-focus behavior were test-harness issues, not product findings. The server Host test uses raw local `http.request` because Node fetch normalizes Host.

## Evidence and portable checks

The [curated screenshots](lab-review-images/README.md) and [raw-hash manifest](lab-review-images/evidence.json) bind 11 source hashes, seven synthetic PNGs and all 18 case outcomes to the exact implementation/run. They include pending manual controls, mismatch error, pending change, reschedule history, historical customer receipt and failed-module state. QA visually inspected the final mobile/desktop mismatch, historical receipt and module-failure images; the [independent design review](lab-design-review.md) records additional pixel inspection separately.

Complete local requests, storage observations, screenshots and accessibility snapshots are in ignored `output/playwright/lab/`, especially `lab-browser-results.json` and `lab-browser-run.log`. Old debug/failure artifacts there are not the successful run's evidence. Later evidence-only commits do not mean browser tests ran again on changed documentation.

`tests/lab-browser.cjs` accepts an existing `KOKO_PLAYWRIGHT_MODULE` and optional `KOKO_CHROMIUM_EXECUTABLE`; it installs nothing and always launches a fresh headless browser. `KOKO_LAB_ORIGIN` defaults to `http://127.0.0.1:4183` and permits only an HTTP127.0.0.1 origin. External requests are blocked. Start the lab server separately, then run `node tests/lab-browser.cjs`; the independent Node tests run with `node --test tests/lab-independent.test.mjs`.

## Limits

No unresolved finding remains in this local slice. The browser runs an in-process fake with public fixture sessions. These results do not establish authentication, database durability/isolation, real scheduling capacity, hosted access protection, Treatwell reconciliation, notification delivery or an approved cancellation/reschedule policy. Only one installed Chromium version and DOM/keyboard checks were exercised; real devices, other browsers, screen-reader output, live services and deployment remain NOT RUN. No real customer data, paid service, credentials or permissions were created or used.
