# Bounded keyboard and text-enlargement review

Status: PASS at `7a490fa27a08ba944731add35a9b3663554d8620`. Base review: `7175ee3af499c2e24c37845c7d7f6f0e94858b2e`. This is a local synthetic lab, not an authenticated or deployed booking service.

QA owned only `tests/lab-usability.cjs` and this report. Runtime fixes were made by the coordinator. QA made no runtime edits, commits, deployments or GitHub approvals.

## Final executed checks

| Check | Result | Evidence |
| --- | --- | --- |
| Keyboard journey and interruption | PASS | Genuine Tab/Shift+Tab, native select Space/Home/End/Arrow/Enter and typed DEMO text; no locator click/fill/selectOption or programmatic focus for UI operation |
| 320px normal text | PASS | Initial page and selected staff reconciliation detail; scroll width 320, no outside or overlapping controls |
| 320px with 200% root font | PASS | Same two views; full choice readouts visibly wrap, scroll width 320, no outside or overlapping controls, unfocused skip link remains offscreen |
| Existing booking regression | PASS | 18/18 cases at the same exact commit; existing matrix reused, not expanded |
| Node, syntax, build | PASS | `npm.cmd test`: 163/163; `npm.cmd run check` and `npm.cmd run build`, exit 0 |
| Protected preview/domain | PASS | No protected public/config/static build/server/domain changes versus the base; seven raw preview hashes still match prior reviewed evidence; dist contains only six byte-matching public assets |

Usability run completed at `2026-10-28T10:52:29.305Z`; existing browser regression at `2026-10-28T10:53:16.735Z`, in fresh headless Chromium `156.0.8078.4`. Both drivers enforced exact expected commit and source/HEAD drift checks.

Keyboard checks exercised invalid-submit focus to the consent checkbox, repeated Enter producing one request, Tab-selected queue/detail, required resource focus, manually entered reconciliation, domain-error alert focus, correction/confirmation, role-change heading focus, reset acknowledgement and final actor focus. Initial and pending-detail audits found names/label associations for all 12 and 17 visible controls respectively, valid described-by targets, status/alert roles and polite activity live-region markup.

Busy controls and reset were disabled. For deterministic interruption, a test-only submit observer recorded `{busy:true, resetDisabled:true}` after a real keyboard Enter submission, then deliberately reloaded before the delayed command settled. The new page contained no old receipt or queue record. This is not a claim that a browser-chrome reload shortcut was tested.

## Enlargement method and findings

The driver changed only the CSS root font size from 16px to 32px. Measured body/button fonts changed 16→32px and h1 32→64px; viewport stayed 320 CSS pixels and devicePixelRatio stayed 1. This is a documented CSS text-enlargement exercise, not a browser-zoom or devicePixelRatio simulation claim.

| Finding | Reproduction and resolution |
| --- | --- |
| USABILITY-01: narrow enlarged layout overflow and exposed unfocused skip link | Baseline `7175ee3` measured scroll width 423 at 320px/200%, with header/refresh/detail extending outside the viewport and the unfocused link partly visible. Coordinator fixed wrapping, shrinkable layout children, control bounds and true offscreen link positioning. Final initial/detail widths are 320 with no outside/overlapping controls; skip-link bottom is -20 before focus |
| USABILITY-02: critical native selected values visually clipped | Geometry checks at intermediate `119de9f` passed, but designer pixel inspection found clipped UTC/service/resource choices. Coordinator retained native selectors and added complete wrapped selection readouts. Final checks assert full service/duration, UTC and resource suffix text, visible in-bounds paragraphs with scrollWidth equal to clientWidth |

At 200%, complete UTC/resource readouts use 28.8px text and two visible lines (89.25px height, 44.64px line height); the service readout wraps across four lines. Native closed selects may still abbreviate their display, but their full selected value is now visibly available beside them. Keyboard selection and focus behavior remain unchanged. No further local usability defect was observed.

## Evidence and attribution

- [Curated screenshots](lab-usability-images/README.md): initial/detail 320px normal/enlarged, fresh keyboard state after interruption and normal-viewport focused domain error.
- [Evidence manifest](lab-usability-images/evidence.json): exact source hashes, three usability outcomes, 18 booking outcomes, baseline failure and PNG hashes/dimensions.
- Local raw evidence: ignored `output/playwright/lab-usability/lab-usability-results.json`, `final-run.log` and screenshots. `baseline-results.json`/`baseline-layout-320-2x.png` preserve the first RED; `119-*.json`, logs and images preserve the intermediate result before readout fixes.

Final key SHA-256 values: CSS `9ba472faf46f404ae79819e1e6199d5b23e0e7c86adc02f4a5ede1e039aedccb`; app `fab1d659d073f8d07e922bc29e153e3df64d6580f321185e442b2cb2aea014bb`; usability driver `d3af50e20a663a6067293d4de3c3f44db68e42613cec29f0bb0c120447c390c3`.

An initial interrupt assertion read busy state after an awaited key/protocol round-trip and sometimes observed completion. The event-time observer corrected that test timing; it was not a product defect. Later evidence-only commits do not imply browser tests ran again on changed documentation. The earlier [lab QA report](lab-qa.md) retains its historical `33bbf44` attribution.

## Limits

These checks establish DOM labels/ARIA declarations and observed keyboard/focus behavior, not screen-reader output or formal accessibility certification. Other browsers, operating-system native pickers, real devices, browser-native zoom, real authentication/database, Treatwell, notifications and hosted/deployment behavior remain NOT RUN. Public fixture identities, fixed clock and invented change-policy opt-in remain simulations. No new business policy or architecture was added. No unresolved blocker remains in this bounded local pass.
