# Independent review — synthetic server adapter

Status: PASS for the isolated synthetic adapter at `a0d8704`. Both coordinator findings were independently reproduced, fixed and retested. This is an asynchronous domain experiment, not a booking backend or release.

## Scope and baseline

- Branch: `test/server-booking-adapter`.
- Base: `be50423e2cda0c76a2ad3c617b843f7ad44a9513`.
- Final tested implementation: `a0d87048c503acd26f294d79450d41ed0173410c`, 2026-10-28 UTC.
- Contract: `docs/server-adapter-contract.md`.
- QA owns `tests/server-authorization.test.mjs` and this report only; no runtime implementation edits or commits.
- `public/`, `vercel.json`, static build/server and existing browser preview must remain unchanged. No browser rerun is required unless that boundary changes.

## Test design

Independent checks cover identity denial before validation/existence, customer impersonation, strict input/fixture allowlists, staff location grants on reads/writes/replays, actor-scoped idempotency across commands/targets, fresh identity resolution after permission revocation, defensive outcomes/read/list/repository snapshots, default policy denial, change-aggregate history preservation, and concurrent confirmation/change operations.

Custom identity tests use a mutable synthetic principal through the injected adapter; they exercise server-side policy boundaries but provide no evidence of real session authentication.

Cancellation and reschedule are fixture-only opt-in tests. Original CONFIRMED rows must remain unchanged; only separate change outcomes derive CANCELLED/RESCHEDULED effective state. Proposals alone must not change allocations. No real business policy is established.

## Execution

| Check | Status | Evidence |
| --- | --- | --- |
| Independent authorization/domain tests | PASS | `node --test tests/server-authorization.test.mjs`: 18 passed, 0 failed on fixed content; all 18 also passed in final exact-commit full suite |
| Full Node suite | PASS | `npm.cmd test`: 106 passed, 0 failed at final tested commit; 42 existing + 46 worker server tests + 18 independent QA tests |
| Syntax and clean static build | PASS | `npm.cmd run check` and `npm.cmd run build`, exit 0 at final tested commit |
| Protected static paths versus base | PASS | Final Git diff/status for `public/`, `vercel.json`, `scripts/build.mjs`, `scripts/serve.mjs` empty; seven raw-file hashes match prior exact-base browser evidence |
| Artifact exposure | PASS | Dist contains exactly six approved files, each byte-equal to its public source; no server module/directory is copied into the static artifact |
| Browser regression | NOT RUN in this slice | Preview bytes are unchanged from the reviewed base; earlier browser evidence is retained, not presented as a new browser run |
| Real auth/database/HTTP/Treatwell/outbound/deployment | NOT RUN | Explicitly outside this experiment |

## Bug ledger

Tests were written before reviewing the implementation. The first run used importable modules and produced behavioral results, not a missing-module setup failure. Initial 14-test run: 13 passed and one policy-error-precedence interpretation failed. After coordinator clarification and stronger existing-change coverage, the expanded 18-test red run had 15 passes and 3 failures for the two defects below. The final fixed run passed all 18.

Initial implementation content revision:

- `server/booking-service.mjs` SHA-256: `3da007551bed7faf8df73bb5339509f35f1144f558c231b5ca2d12ba6d600618`.
- `server/fake-booking-adapter.mjs` SHA-256: `a4fe9b9e17bde87a8aba5fe0b8ae176ee3b9d9600c0b0af9605c496b8a2e1b68`.
- Command: `node --test tests/server-authorization.test.mjs`.

| ID | Finding | Outcome |
| --- | --- | --- |
| SERVER-QA-01 | `proposeChange` reads an accessor-backed `kind` before exact data validation; the getter executes even though the command is later rejected | RESOLVED in `a0d8704`: coordinator found; independent accessor regression reproduced on initial content revision and now verifies the getter never executes and the full repository snapshot is unchanged |
| SERVER-QA-02 | Reschedule apply permits a duplicate active customer/location/start when a separate PENDING request or different-resource CONFIRMED booking already exists there | RESOLVED in `a0d8704`: both independent variants now reject with `DUPLICATE_REQUEST`, preserve the entire snapshot, and allow retry with the same failed key/references after the competing request is declined or cancelled |

Policy clarification: identity, target existence and source authorization precede change-policy evaluation. Nonexistent changes remain `NOT_FOUND`; an existing authorized change is denied with `POLICY_UNDECIDED` by the default policy. Independent tests compose opt-in/default-deny services over one fake repository, and separately revoke an injected policy before identical replay. These checks pass without mutation. This resolves an initial test interpretation, not a runtime defect.

## Final revision and evidence

All behavior and full-suite results above are anchored to `a0d87048c503acd26f294d79450d41ed0173410c`. The only concurrent later change was a documentation import-path correction in `server/README.md`; runtime/test/config files remained unchanged. QA did not edit runtime or commit.

| File | Final SHA-256 |
| --- | --- |
| `server/booking-service.mjs` | `2ecb0a5211dd1376a23b486f6d83e6e0b230163be33d0e7a1544997dd10bb7c5` |
| `server/fake-booking-adapter.mjs` | `a4fe9b9e17bde87a8aba5fe0b8ae176ee3b9d9600c0b0af9605c496b8a2e1b68` |
| `tests/server-authorization.test.mjs` | `f565ba5e324bd95af91af90901217d7b727cfe04f0ade178f9568b39afd908d5` |

Final artifact/hash comparison completed at `2026-10-28T00:07:43.655Z`. It compared current SHA-256 values for `public/index.html`, `public/styles.css`, `public/app.mjs`, `public/booking.mjs`, `scripts/serve.mjs`, `scripts/build.mjs` and `vercel.json` against `output/playwright/browser-flow-results.json`, whose recorded commit is the exact base `be50423e2cda0c76a2ad3c617b843f7ad44a9513`. Every raw-file hash matched.

Git comparison also reported no protected-path changes. A direct comparison to Git object bytes initially flagged the existing mixed-line-ending representation of `public/styles.css` (one extra CR byte in the working file). Its normalized content and `git hash-object` match the base blob, and its raw SHA-256 `27bbd646dc1f6569ca4e09d352f2b1bf726fbcc54da1053315ff831896605b98` matches the prior reviewed browser artifact. This was a verification-method adjustment, not a preview edit; no file was rewritten.

The clean `dist/` manifest is `app.mjs`, `booking.mjs`, `favicon.svg`, `index.html`, `robots.txt`, `styles.css`. Each output file matched its current public source byte-for-byte. The server experiment is not imported by the unchanged browser app or copied into the output. The existing static tests also retain denial of API/admin paths; no server-domain HTTP route was added.

## Acceptance interpretation

PASS covers only the exercised fixtures: denial before unauthenticated existence/validation checks; customer ownership; staff location grants on reads and writes; reauthorization before replay after grant/role revocation; actor-scoped idempotency; defensive snapshots; full-state rollback for tested failures; no PENDING allocation; opt-in cancellation/reschedule with exact simulated attestation; immutable stored terminal booking rows; and one successful mutation in each tested competing confirmation/change race. Identical valid replay returns the stored original result without another event.

Cancellation/rescheduling remains a separate proposed aggregate. A proposal changes no allocation or booking status. Applying a fixture-approved change derives effective CANCELLED/RESCHEDULED state and, for reschedule, creates a linked replacement after simulated attestation. This does not establish owner-approved notice periods, fees, permissions, resources, durations or a real Treatwell workflow.

## Limits

The fake adapter's serialized single-process transaction can demonstrate its own mutation/rollback behavior and queue ordering only; these are not exhaustive interleaving tests. It cannot establish database transaction isolation, multi-process concurrency, crash durability, real authentication, authorization configuration, operating policy, Treatwell reconciliation or delivery guarantees.

NOT RUN: real identity/session/MFA/revocation integrations, database/HTTP adapters, cross-process tests, migrations, real customer data, live Treatwell operations, notifications, deployment and hosted verification. No credentials, services, network integration or real staff/customer access were created by QA. There are no unresolved findings in the tested local scope; the real integration and business-policy decisions remain explicit future gates.
