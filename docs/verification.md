# Verification checkpoint

Date: 2026-10-27 UTC. Environment: Windows, Node v24.16.0, npm 11.13.0. This evidence applies to a local synthetic prototype, not a live booking service.

## Tested implementation

- Base: `c139fbdfcd5147aab69cf023b4e3171721202bac`.
- Implementation candidate: `6ac848e8d562e8975250d2b8adf7bcf6b8eb6c50`.
- Domain TDD: initial `node --test tests/booking.test.mjs` failed with `ERR_MODULE_NOT_FOUND` before implementation; worker then reported 35 domain tests passing. Additional runs with `America/Los_Angeles` and `Asia/Tokyo` host timezones also passed.
- The coordinator reran the full suite after both browser fixes. No earlier archive's historical results are reused as current evidence.

| Check | Result | Evidence and limit |
| --- | --- | --- |
| `npm test` | PASS | 37/37 tests, 0 failures/skips; 35 domain + 2 static-boundary tests |
| `npm run check` | PASS | Syntax for app, booking policy and Node scripts |
| `npm run build` | PASS | Six static files copied to ignored `dist/`; no deployment |
| SHA-256 comparison of `public/` and `dist/` | PASS | All six assets byte-identical after final code changes |
| `git diff --check c139fbdf HEAD` | PASS | No whitespace errors |
| Browser workflow / layout / network | See independent QA | [QA report](qa-review.md) identifies the tested revision and resolved findings |
| Real authentication and durable database | NOT RUN | Neither is implemented; browser role is a public simulation |
| Python/FastAPI tests | NOT RUN | Referenced ZIP/backend source is unavailable, not imported |
| Real Treatwell, customer messaging and customer data | NOT RUN | No connection or outbound client implemented |
| Vercel deployment, merge, public indexing, live SEO | NOT RUN | Outside this checkpoint; no deployment or merge performed |

## Practical limits

The policy module is synchronous in-memory code. Passing these tests does not prove server authorization, multi-process concurrency, durable idempotency, retention, backup, or real Treatwell matching. All of those need a separately approved backend and isolated test environment before real customer use.

No actual service menu, prices, branch address or official Treatwell link was verified. The site intentionally exposes synthetic placeholders and suppresses indexing rather than publishing invented salon details.

This prototype and its evidence can be reviewed in a draft PR. The original docs PR remains open. Merge and deployment stay pending the parent checkpoint.
