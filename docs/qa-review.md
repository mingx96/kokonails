# Independent QA review — synthetic test slice

Status: PASS for the local synthetic slice at `46d8073`, including the follow-up QA-03 failure paths. The initial JS-enabled PASS missed native submission when JavaScript was unavailable; that finding was reproduced, fixed and independently retested below. This report is not a release approval for a live salon service.

## Scope and revision

- Checkout: `test/synthetic-booking-slice`, final tested implementation commit `46d80739572028a8007e9665799bcd7fe2a82db3`, base `c139fbdfcd5147aab69cf023b4e3171721202bac`.
- Initial JS-enabled review tested `6ac848e8d562e8975250d2b8adf7bcf6b8eb6c50`; its evidence is preserved. QA-03 reproduction used `645db9bb58d37139268f705625f656a36fef18f8`.
- Reviewed contract: `docs/test-slice-contract.md`.
- Implementation/configuration files matched the tested commit after the final browser run; concurrent changes were documentation only.
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
- Local URL: `http://127.0.0.1:4173`. Final boot/failure run: `2026-10-27T23:41:57.453Z`; final full-flow run: `2026-10-27T23:42:14.171Z`. Precise source hashes and outcomes are in `output/playwright/boot-fixed-evidence.json` and `qa-results-followup.json`.

## Acceptance execution

| Area | Result | Evidence |
| --- | --- | --- |
| Request PENDING, idempotency and duplicate guard | PASS | Browser flow on all three widths; repeated unchanged submit created one request; changed service for the same customer/location/time was rejected with focused German error |
| Staff demo confirmation checks and terminal states | PASS | Guest has no queue; blank reference, short reference, unchecked attestation, location/date/time mismatches and reused reference rejected; valid confirmation and decline succeeded; terminal action controls removed |
| 390 / 768 / 1440px layout and keyboard flow | PASS | Full-page screenshots inspected; no horizontal overflow; skip link, all principal form/team controls and feedback disclosure reached by Tab; success and custom error focus verified |
| Neutral review copy and disabled outbound | PASS | Positive/neutral/critical feedback invitation; text preview only with no send/link control or satisfaction gate |
| Browser network, storage and robots metadata | PASS | Normal flows observed only same-origin static GETs and no localStorage/sessionStorage/cookies; reset/reload clear records. QA-03 failure/delay matrix now prevents UI submission/navigation and field-bearing requests |
| No-JS, module failure and delayed boot | PASS | All 12 combinations of three widths and four boot states; every booking/team control disabled before boot, visible status and described-by guidance; delayed release safely enables the app and Enter creates PENDING without navigation |
| Node test suite | PASS | `npm.cmd test`: 42 passed, 0 failed on final implementation |
| Syntax and static build | PASS | `npm.cmd run check` and `npm.cmd run build`, exit 0; build is local only |
| Local preview configuration and built assets | PASS | `vercel.json` shape tests; clean build, stale-output removal, output-junction refusal, exact six-asset manifest, local GET/HEAD headers and denial of docs/config/API/private fixture paths |
| Hosted Vercel headers, deployment and indexing | NOT RUN | No deployment was made. Local config/server tests do not prove hosted headers or search-engine behavior |
| Real auth/database, Treatwell, email/SMS, live SEO | NOT RUN | Explicitly outside the slice |
| Python test suite from old FastAPI blueprint | NOT RUN | ZIP/source not imported |

## Evidence

Local artifacts are ignored by Git and contain synthetic data only:

- `output/playwright/qa-smoke.cjs`: standalone normal-flow driver for final candidate; no dependency installation or test-runner package.
- `output/playwright/qa-results.json` and `qa-results-initial.json`: preserved initial JS-enabled evidence at `6ac848e`.
- `output/playwright/qa-results-followup.json`: final candidate per-width network, storage, keyboard targets, browser/version and source hashes.
- `output/playwright/qa-followup-run.log`: final normal-flow run output, exit 0.
- `output/playwright/layout-390.png`, `layout-768.png`, `layout-1440.png`: final initial layouts, inspected visually.
- `output/playwright/confirmed-390.png`, `confirmed-768.png`, `confirmed-1440.png`: synthetic confirmation state.
- `output/playwright/snapshot-390.yml`, `snapshot-768.yml`, `snapshot-1440.yml`: accessibility snapshots.

Source SHA-256 at the initial `6ac848e` run (historical evidence):

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
| QA-03 | Booking form remained enabled before app boot and had the native GET default. With JS disabled, `app.mjs` blocked, or `booking.mjs` blocked, synthetic fields entered the navigation URL/request logs | FIXED in `46d8073`; baseline reproduced at `645db9b`, then all 12 failure/delay combinations passed at the fixed commit |

## Follow-up: boot failure and native submission

The initial PASS did not cover no-JavaScript, failed module loading or delayed module boot. Parent identified this gap and requested independent reproduction.

Baseline reproduction at `2026-10-27T23:38:26.321Z` used exact Git objects from `645db9bb58d37139268f705625f656a36fef18f8` served by a separate temporary loopback HTTP server, so concurrent worktree fixes could not change the result. All three cases had an enabled submit button and navigated by GET to:

```text
http://127.0.0.1:49672/?locationId=demo-a&serviceId=demo-care&date=2027-02-18&time=14%3A30&customerId=demo-01&privacyAccepted=on
```

| Case | Result on baseline |
| --- | --- |
| JavaScript disabled | FAIL: native GET included all named synthetic fields; no-JS notice visible but controls still enabled |
| `app.mjs` request aborted | FAIL: same native GET; no visible no-JS/failure notice |
| `booking.mjs` request aborted | FAIL: same native GET; no visible no-JS/failure notice |

Reproduction artifacts: `output/playwright/boot-baseline-repro.cjs`, `boot-baseline-evidence.json`, `boot-baseline-run.log`, and `baseline-javascript-disabled.png`, `baseline-app-module-failure.png`, `baseline-booking-module-failure.png`. Only synthetic values were submitted to this temporary local server; no third-party requests or real customer data were used. The temporary browser and server were closed.

Retest at `46d80739572028a8007e9665799bcd7fe2a82db3` passed all 12 combinations of 390 / 768 / 1440px and JavaScript-disabled / aborted app module / aborted booking module / delayed app module. Before successful initialization every booking and team control matched `:disabled`, the booking button had `type="button"`, and visible `role="status"` guidance was linked through the form's `aria-describedby`. Force-clicking the disabled button and pressing Enter caused no additional navigation, query-bearing request or outbound request. JavaScript-disabled mode also showed its no-script notice. The no-JS and failed-module screenshots were inspected visually.

In each delayed-module case, releasing the module enabled the controls only after initialization, changed the button to submit, announced readiness, and allowed a keyboard Enter submission to produce a focused PENDING receipt without navigating or sending form data. The complete original booking/staff/keyboard/reset/offline/privacy regression then passed again at all three widths with zero normal-flow console/page errors. Intentional module-request failures are fault injection, not a claim that those pages have no network failure diagnostics.

Final boot artifacts: `output/playwright/boot-fixed-qa.cjs`, `boot-fixed-evidence.json`, `boot-fixed-run.log`, twelve `boot-<scenario>-<width>.yml` accessibility snapshots and four 390px failure/delay screenshots. The independent Node, syntax and build commands were rerun at the fixed commit: 42/42 tests and both commands passed.

Final source SHA-256:

| File | SHA-256 |
| --- | --- |
| `public/index.html` | `488f8f60114e6361c840bde8f91f0007502390aa845043efdd86219f192cc82f` |
| `public/styles.css` | `27bbd646dc1f6569ca4e09d352f2b1bf726fbcc54da1053315ff831896605b98` |
| `public/app.mjs` | `3338a1b2122190fe18393e684b9bde2e6c916fce81683ada1a967fb4326bcfae` |
| `public/booking.mjs` | `7a4f10003240a13110ae0fe9cf462cfa0a1f2c5304bcb0e8f86c1cbf74992620` |
| `scripts/serve.mjs` | `e8e0e1c6342d680abb0fb14ce73b452d3f8b8f9edae18894d00067c7955454c2` |
| `scripts/build.mjs` | `af1c9d24c0e75eb7f9c1a995c7e2ca02ebdba1811d81c7bfa912d21ebcc44f8e` |
| `vercel.json` | `a7391fcff8a3ca967db5b2a009207ea5d8d61f3fc7e19b17b25f2b63d0bc0cd2` |

Hosted Vercel behavior is NOT RUN. Configuration tests and locally served headers validate this repository's preview intent only; they do not demonstrate that a hosted response has these headers, that access is protected, or that a search engine has honored noindex. No deployment was made by QA.

## Portable browser regression

The working standalone checks are now preserved as `tests/browser-boot.cjs` and `tests/browser-flow.cjs`. They are optional browser checks and are separate from the 42 Node tests. Start the local server, then run each driver with an existing Playwright runtime:

```text
node tests/browser-boot.cjs
node tests/browser-flow.cjs
```

`KOKO_PLAYWRIGHT_MODULE` can point to an already installed Playwright package (default: `playwright`). `KOKO_CHROMIUM_EXECUTABLE` optionally selects an installed Chromium executable. No runtime, browser or dependency is installed by the drivers. Both always launch a new headless browser and close it afterward; neither attaches to existing Chrome.

The optional `KOKO_BASE_URL` must be an HTTP(S) loopback IP origin (`127.0.0.1` or `[::1]`); the default is `http://127.0.0.1:4173`. Requests to other origins are blocked. All artifacts go to ignored `output/playwright/`. Optional `KOKO_EXPECTED_COMMIT` checks the intended HEAD; each driver records the actual HEAD and source hashes and rejects source/HEAD changes during the run. Final committed-driver results can be recorded in `browser-boot-results.json` and `browser-flow-results.json` without rewriting the earlier implementation evidence above.

No unresolved findings remain in the exercised local slice. Coverage is limited to one installed Chromium version, DOM accessibility/keyboard checks and the synthetic workflow; other browsers, screen-reader output, real staff security, persistence, delivery, legal text and real business content remain unverified.
