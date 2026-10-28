# Bounded usability evidence

These synthetic screenshots come from implementation `7a490fa27a08ba944731add35a9b3663554d8620`, fresh headless Chromium `156.0.8078.4`. The bounded usability run completed at `2026-10-28T10:52:29.305Z`; the existing 18-case booking/boot regression completed at `2026-10-28T10:53:16.735Z` on the same commit.

- [320px normal text](narrow-normal.png) and [selected staff detail](narrow-detail.png).
- [320px enlarged text](enlarged-text.png) and [enlarged staff detail](enlarged-detail.png): root/body/button fonts doubled from 16px to 32px while viewport width and DPR stayed unchanged. This models text enlargement; it is not a browser-menu zoom or real-device test.
- [Keyboard state after interrupted request/reload](keyboard-after-interruption.png): fresh empty browser state, not a durable booking acknowledgement.
- [Desktop mismatch error](desktop-error.png): focused public guidance with preserved correction fields.

At 200% text size, native selects can still clip their internal closed-control labels. Complete selected service/time/resource values now appear as wrapped visible text beneath the controls. Page width and control bounds remain within 320px, and the skip link remains fully offscreen until focused. No horizontal overflow is hidden.

The [manifest](evidence.json) binds 12 source hashes, six PNG hashes/dimensions, three bounded usability outcomes, 18 booking/boot outcomes and the earlier failing reflow measurements. [Independent QA](../lab-usability-review.md) describes keyboard-only interaction, label/announcement DOM checks, regression findings and limits. The [pilot setup checklist](../pilot-setup-checklist.md) records unresolved real business/integration facts.

All content is synthetic. No real customers, actual Treatwell operation, protected admin, database or outbound service is involved. Screen-reader speech, other browsers and real devices remain untested. A later report/image-only commit packages this exact implementation evidence; it is not a fresh browser execution claim. Earlier `docs/lab-review-images/` records the original `33bbf44` slice and remains historical evidence.
