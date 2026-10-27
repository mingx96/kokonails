# Verification checkpoint

Date: 2026-10-27 UTC. Environment: Windows, Node v24.16.0, npm 11.13.0. This evidence applies to a local synthetic prototype, not a live booking service.

## Tested implementation

- Base: `c139fbdfcd5147aab69cf023b4e3171721202bac`.
- Original implementation: `6ac848e8d562e8975250d2b8adf7bcf6b8eb6c50`; follow-up implementation candidate: `46d80739572028a8007e9665799bcd7fe2a82db3`.
- Domain TDD: initial `node --test tests/booking.test.mjs` failed with `ERR_MODULE_NOT_FOUND` before implementation; worker then reported 35 domain tests passing. Additional runs with `America/Los_Angeles` and `Asia/Tokyo` host timezones also passed.
- Follow-up TDD: `node --test tests/build.test.mjs tests/preview.test.mjs` failed first because the clean-build export, Vercel config and disabled static controls were absent. Those checks pass after implementation.
- Source review reproduced native GET submission on baseline `645db9b` with JavaScript disabled and either module aborted. That path was missing from the original browser coverage. See the QA bug ledger for the new regression evidence; no earlier archive's historical results are reused as current evidence.

| Check | Result | Evidence and limit |
| --- | --- | --- |
| `npm test` | PASS | 42/42 tests, 0 failures/skips; 35 domain + 2 static-boundary + 3 build/artifact + 2 preview/readiness checks |
| `npm run check` | PASS | Syntax for app, booking policy and Node scripts |
| `npm run build` | PASS | Clean resolved output; six approved files only; no deployment |
| Stale output and deletion boundary | PASS | Nested stale sentinel removed; source/unapproved/outside sentinel preserved; output junction refused |
| Candidate Vercel config and built asset HTTP checks | PASS locally | Output `dist/`, all-path noindex/no-store; GET/HEAD for six assets and rejected out-of-output paths; not hosted platform verification |
| SHA-256 comparison of `public/` and `dist/` | PASS | All six assets byte-identical after final code changes |
| `git diff --check c139fbdf HEAD` | PASS | No whitespace errors |
| Browser workflow / layout / network | See independent QA | [QA report](qa-review.md) identifies the tested revision and resolved findings |
| No-JS / app failure / dependency failure / delayed boot | PASS | 12/12 combinations across 390/768/1440px at `46d8073`; no field-bearing/native navigation; released delay restores keyboard PENDING flow |
| Shareable pixels | PASS locally | QA and coordinator inspected [tracked synthetic screenshots](review-images/README.md); available for parent review, not a claim the parent has viewed them |
| Real authentication and durable database | NOT RUN | Neither is implemented; browser role is a public simulation |
| Python/FastAPI tests | NOT RUN | Referenced ZIP/backend source is unavailable, not imported |
| Real Treatwell, customer messaging and customer data | NOT RUN | No connection or outbound client implemented |
| Vercel deployment, merge, public indexing, live SEO | NOT RUN | Outside this checkpoint; no deployment or merge performed |
| Hosted Vercel HTTP/CDN header behavior | NOT RUN | Versioned candidate config is tested locally only; hosted verification remains a gate |

## Practical limits

The policy module is synchronous in-memory code. Passing these tests does not prove server authorization, multi-process concurrency, durable idempotency, retention, backup, or real Treatwell matching. All of those need a separately approved backend and isolated test environment before real customer use.

No actual service menu, prices, branch address or official Treatwell link was verified. The site intentionally exposes synthetic placeholders and suppresses indexing rather than publishing invented salon details.

This prototype and its evidence can be reviewed in a draft PR. The original docs PR remains open. Merge and deployment stay pending the parent checkpoint.
