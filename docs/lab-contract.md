# Local synthetic product slice

Base: `50638a25ade62906b491ab7628650ac657eeb3d5`. Branch: `test/local-booking-journey`. This slice connects the already reviewed domain experiment to a separate German operational UI. It does not extend domain policy or introduce an HTTP booking adapter. Reviewed public preview `be50423e2cda0c76a2ad3c617b843f7ad44a9513` stays untouched.

## Architecture and boundary

`npm run lab` starts `scripts/serve-lab.mjs` on `127.0.0.1:4183`. It serves exact allowlisted GET/HEAD assets with noindex/no-store/nosniff and rejects unlisted paths, query variants, non-loopback Host headers and writable methods. No request body is processed. The lab HTML imports `lab/app.mjs` and its controller, which imports the existing fake adapter and domain modules. All booking commands execute in the browser process; no command goes to the local server. There is no HTTP API, real authentication, database or calendar integration.

`lab/controller.mjs` keeps public fixture identity, visible scope, pending activity, public errors and authorized view snapshots. Every command uses the existing service. Staff lists call `service.list`, customer receipts call `service.get`; fake repository inspection is never a UI data source. Private receipt/change locators are retained across role/studio changes but visible records clear immediately and are reauthorized before reappearing. This demonstrates contract ordering in one fake process, not real authorization security.

The controller serializes UI commands with a busy lock and captures inputs/identity before an injected asynchronous delay. Scope/reset attempts during activity are rejected. Repeated normalized commands reuse their actor-scoped key while active. A new request after an authorized read of an inactive effective booking, or a new proposal after a rejected proposal, receives a fresh key. Visible snapshots are defensive and immutable. Successful idempotent replay acknowledgements must not move a displayed terminal change back to PENDING.

No lab files or server modules enter the existing six-file `dist/` allowlist. `public/`, `scripts/serve.mjs`, `scripts/build.mjs`, `vercel.json` and all server-domain implementation files remain unchanged. No framework or package is added. Python tests do not apply to these Node modules.

## Product acceptance

1. Source HTML is inert until module initialization and event listeners complete. Missing/disabled/delayed JavaScript leaves clear guidance, disabled controls and no native form submission/query disclosure.
2. Only fixed test customers, studios, services/resources and UTC time fixtures are presented. Clock `2027-01-01T00:00:00.000Z` is explicit; test durations/times are not verified salon facts, opening hours or live availability.
3. A customer request is PENDING with no reserved resource. A testteam role opens the scoped queue and manually chooses matching studio/time, a unique DEMO reference, a synthetic resource and an unchecked attestation. Mismatch/conflict never confirms. Decline is a separate initial-request decision.
4. Confirmation is visibly a simulation. Default change policy stays denied. Switching to invented change mechanics requires explicit reset acknowledgement and erases all old state. No real customer policy is inferred.
5. In the change scenario, a cancellation/reschedule proposal leaves the existing confirmed test appointment and allocations in place. Rejection closes only the proposal. Applying requires matching original evidence and distinct synthetic change/replacement references. Reschedule retains the source and links its replacement; cancellation/reschedule effective history is explicit.
6. Errors preserve correction fields and focus an alert. Empty views direct the operator to a customer request and proper role/studio. Busy state is announced and controls lock. Keyboard focus follows the receipt, selected detail and major role change. Mobile has a return-to-list control; desktop has queue/detail columns.
7. No real contact entry, storage, analytics, outbound calls, Treatwell access, credentials or deployment. Public test roles are described as bypassable, never a protected admin.

## Local runbook

Run `npm test`, `npm run check`, `npm run build`, then `npm run lab`. Browser regression uses an already installed Playwright runtime and isolated headless browser; it never attaches to Chrome. Set `KOKO_PLAYWRIGHT_MODULE`, `KOKO_CHROMIUM_EXECUTABLE` and optionally exact `KOKO_EXPECTED_COMMIT`; see the independent QA report for executed paths, source hashes, results and screenshot provenance.

Standard flow: submit as Testkundin 01 in Teststudio A at `2027-02-18 13:30 UTC`; choose Testteam A, select the entry and simulate matching evidence with `DEMO-TEST001` and Testressource A1. Confirm only after the explicit attestation. A second customer can request the same time but resource overlap is denied on confirmation. Return to a customer role to re-read its own status.

For change mechanics open “Testszenario und Neustart”, choose “Änderungen testen (erfundene Freigabe)”, acknowledge erasing all local data and restart. Create and confirm a new test appointment. Propose a reschedule to another fixture time; the original remains active until an explicit matching application. Use distinct DEMO references and inspect the linked replacement. A proposed change can instead be rejected without altering the source.

## Remaining boundaries

Designer and independent QA challenge usability and operational semantics; their evidence is linked in README. Browser-domain behavior proves no actual staff security, database transactions, cross-process races, production audit or real Treatwell reconciliation. The backend integration decisions listed in [the existing checkpoint](server-checkpoint.md) remain open. Hosting is still blocked pending selected-team Vercel plan and no-cost scope verification. No merge or deployment occurs in this slice.
