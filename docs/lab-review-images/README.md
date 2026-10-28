# Synthetic local lab screenshots

These full-page PNGs come from the exact implementation commit `33bbf447a6b47ad30bddda4528986cc10808f0a9`, captured by the independent `tests/lab-browser.cjs` run at `2026-10-28T10:23:40.060Z` in fresh headless Chromium `156.0.8078.4`. Viewports are 390 or 1440 pixels wide. All customer/studio/service/resource identities and DEMO references are invented fixtures. No real data, external imagery or browser chrome is captured.

- [Desktop pending request](desktop-pending.png) and [mobile pending request](mobile-pending.png): separate manual evidence and unchecked attestation.
- [Mobile mismatch error](mobile-mismatch.png): preserved correction fields and focused public error guidance.
- [Mobile pending change](mobile-change-proposal.png): explicit invented-policy scenario and unchanged original appointment.
- [Desktop reschedule history](desktop-rescheduled.png) and [mobile historical receipt](mobile-historical-receipt.png): effective state, preserved original details and replacement relationship.
- [Mobile failed module](mobile-module-failure.png): disabled source controls and recovery guidance. This expected failed-load case does not establish a general runtime crash detector.

[Evidence manifest](evidence.json) records raw source and PNG SHA-256 hashes, dimensions and all 18 browser case outcomes. The run also passed at 768 pixels. The complete local JSON, request observations and additional captures stay in ignored `output/playwright/lab/`. Old debug/failure artifacts in that directory are not this successful run's evidence.

These are local browser simulations, not a hosted booking service or protected admin. The loopback server only serves allowlisted source assets. The lab is excluded from the unchanged six-file public preview build. See [independent QA](../lab-qa.md) and [design review](../lab-design-review.md) for reviewed scope and limitations. A later evidence-only commit carries these exact implementation assets; it is not a claim that browser testing ran again on documentation changes.
