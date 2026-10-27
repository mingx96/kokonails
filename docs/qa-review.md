# Independent QA review — synthetic test slice

Status: PASS for the local synthetic slice, with the production capabilities below explicitly NOT RUN. This report is not a release approval for a live salon service.

## Scope and revision

- Checkout: `test/synthetic-booking-slice`, tested implementation commit `6ac848e8d562e8975250d2b8adf7bcf6b8eb6c50`, base `c139fbdfcd5147aab69cf023b4e3171721202bac`.
- Reviewed contract: `docs/test-slice-contract.md`.
- Implementation was clean against the tested commit after the final browser run. This report is a later documentation-only addition.
- QA owns this report only; implementation remains with its assigned owners.

## Contract review

PASS: contract keeps Treatwell authoritative, requires direct requests to start PENDING, and describes staff reconciliation as a simulation. It explicitly rejects a real authentication or database claim.

PASS: only fixed synthetic customers, services and locations are permitted. No prices, addresses, owner booking links or contact fields may be invented. Browser persistence and outbound messages are outside this slice.

PARTIAL: a client-side mock can exercise authorization policy and workflow, but cannot secure a real admin queue. Real staff identity, database isolation, atomic uniqueness, audit trail and Treatwell reconciliation require a later backend and separate test environment.

## Test environment

- MILO, Windows, Node 24.16.0.
- Cached Playwright library: 1.64.0-alpha-1790635538000. `@playwright/cli` unavailable offline (`ENOTCACHED`); no package was installed.
- Installed isolated Chromium headless shell 1248 is used through a temporary standalone Node script, not `@playwright/test`, an attached browser, or restaurant Chrome.
- The cached Playwright default expects browser 1247, so an explicit path to the already installed 1248 executable was used. Browser probe and full flows passed with Chromium 156.0.8078.4.
- Local URL: `http://127.0.0.1:4173`. Final browser run: 2026-10-27 UTC; precise timestamp and source SHA-256 hashes are in local `output/playwright/qa-results.json`.

## Acceptance execution

| Area | Result | Evidence |
| --- | --- | --- |
| Request PENDING, idempotency and duplicate guard | PASS | Browser flow on all three widths; repeated unchanged submit created one request; changed service for the same customer/location/time was rejected with focused German error |
| Staff demo confirmation checks and terminal states | PASS | Guest has no queue; blank reference, short reference, unchecked attestation, location/date/time mismatches and reused reference rejected; valid confirmation and decline succeeded; terminal action controls removed |
| 390 / 768 / 1440px layout and keyboard flow | PASS | Full-page screenshots inspected; no horizontal overflow; skip link, all principal form/team controls and feedback disclosure reached by Tab; success and custom error focus verified |
| Neutral review copy and disabled outbound | PASS | Positive/neutral/critical feedback invitation; text preview only with no send/link control or satisfaction gate |
| Browser network, storage and robots metadata | PASS | Only same-origin GETs for static assets, no console/page errors, no localStorage/sessionStorage/cookies; reset and reload clear records; loaded demo also accepts a synthetic request offline; HTML and local HTTP noindex verified |
| Node test suite | PASS | `npm.cmd test`: 37 passed, 0 failed on the tested implementation; 35 domain tests plus 2 static/server tests |
| Syntax and static build | PASS | `npm.cmd run check` and `npm.cmd run build`, exit 0; build is local only |
| Real auth/database, Treatwell, email/SMS, live SEO | NOT RUN | Explicitly outside the slice |
| Python test suite from old FastAPI blueprint | NOT RUN | ZIP/source not imported |

## Evidence

Local artifacts are ignored by Git and contain synthetic data only:

- `output/playwright/qa-smoke.cjs`: standalone browser QA driver; no dependency installation or test-runner package.
- `output/playwright/qa-results.json`: per-width network, storage, keyboard targets, browser/version and source hashes.
- `output/playwright/qa-run.log`: final run output, exit 0.
- `output/playwright/layout-390.png`, `layout-768.png`, `layout-1440.png`: final initial layouts, inspected visually.
- `output/playwright/confirmed-390.png`, `confirmed-768.png`, `confirmed-1440.png`: synthetic confirmation state.
- `output/playwright/snapshot-390.yml`, `snapshot-768.yml`, `snapshot-1440.yml`: accessibility snapshots.

Source SHA-256 at final run:

| File | SHA-256 |
| --- | --- |
| `public/index.html` | `bb5a3aeb021620507d86b67172424cb2f68e687a3ad035d838fa16ecff5d85ac` |
| `public/styles.css` | `04afa56f798c011bed2e9cf4fa5a42d9569996ba037169d1632b43900558464d` |
| `public/app.mjs` | `916955b12e298e0f362a108b96d92f67a54354436e7ac6a71b44b73b1b3ecd25` |
| `public/booking.mjs` | `7a4f10003240a13110ae0fe9cf462cfa0a1f2c5304bcb0e8f86c1cbf74992620` |
| `scripts/serve.mjs` | `8aef0f9817955b81002496e1fdee7f219229549cdb54aa5cbe39362e11990d63` |

## Bug ledger

| ID | Finding | Outcome |
| --- | --- | --- |
| QA-01 | HTML reference pattern used a literal hyphen in a character class; Chromium's `/v` pattern compilation rejected it and emitted a console error, disabling native pattern validation | FIXED in `cc37eed`; final browser run verifies short references fail native pattern validation and console remains clean |
| QA-02 | Mobile CSS hid a `<br>` without a text separator, joining “anfragen.Dann” in the booking heading | FIXED in `6ac848e`; final 390px screenshot inspected with correct sentence separation |

No unresolved findings from these checks. Coverage is limited to one installed Chromium version and the synthetic local workflow; other browsers, real staff security, persistence, delivery, legal text and real business content remain unverified.
