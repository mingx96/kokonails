# Local synthetic journey: independent design review

Scope: `test/local-booking-journey`, based on `50638a25ade62906b491ab7628650ac657eeb3d5`. The reviewed static preview and server-domain checkpoint remain separate. This review concerns a local browser workbench using public fixture identities and an in-process fake repository. It establishes no authenticated administration, real booking or production readiness.

Final visual verdict: **PASS for the inspected synthetic lab states at implementation commit `33bbf447a6b47ad30bddda4528986cc10808f0a9`**. The challenged mobile continuity, pending-change wording and boot-recovery copy are resolved. No visual blocker remains within the captured scope. Functional QA is recorded separately in [the operational QA report](lab-qa.md).

## Design plan before implementation

The audience is a tester rehearsing a small salon's request-handling workflow. The page's main job is to make an unconfirmed request, manual test reconciliation and the resulting decision distinguishable. A compact operational workbench is more useful here than another promotional landing page.

Palette: porcelain `#F7F8FC`, plum `#292035`, cobalt `#334DCE`, lilac `#DFD9EE`, rose `#B93663` and white `#FFFFFF`. Use Segoe UI for body text and controls, with Georgia reserved for the Koko name and principal page heading. Left-align content and keep instructions under 75 characters per line. Reuse the established palette without copying the public site's marketing hero.

Desktop concept:

```text
Koko / Lokaler Buchungstest     Nur erfundene Daten
Testrolle (kein Login) | Standort | Testszenario / Zurücksetzen
Anfrage -> manuell abgleichen -> Testentscheidung
-----------------------------------------------
Anfragen / status and time | Selected request details
                          | Reconciliation form
                          | Explicit decision + outcome
```

On mobile, place the request list before the selected detail, provide a direct jump back to the list, and transfer focus to the selected request heading after selection. Keep each field, action and explanation readable in one column. Selection must not require recognizing color alone.

The single visual emphasis is the three-stage workflow; those numbers encode a real sequence. Avoid dashboard metrics, decorative repeated cards and a large hero that pushes the operational task below the fold. A compact banner names the synthetic scope; the working area earns most of the screen.

## Operational challenges and recommendations

- Make the trust boundary explicit at the role selector: `Testrolle – kein Login`. Anyone can choose the public fixture handles, so visibility restrictions are demonstrative and bypassable. Do not use a lock icon or call this a protected admin.
- Keep `Nur im Browser · erfundene Daten · keine echte Buchung` visible. State reset/refresh data loss plainly. No fields should invite names, phone numbers, email addresses or real references.
- Beside date/time fields, identify the timezone and fixed test clock. Prefer explicit `UTC (Test)` over silently treating the computer's timezone as salon time. This fixture does not establish the real salon timezone, hours or availability.
- Pair status codes with meanings: `Anfrage offen (PENDING) – kein Platz reserviert`; `Nur im Test bestätigt (CONFIRMED)`; `Anfrage abgelehnt (DECLINED)`. Avoid the isolated word `Bestätigt`, which can resemble a real appointment confirmation.
- Show requested location/date/time in the summary, separately from manual reconciliation inputs. Leave attestation unchecked. Do not automatically fill a matching reference or describe a match as verified by Treatwell.
- Name decisions distinctly: `Im Test bestätigen` and `Anfrage ablehnen`. A pending request has no allocated slot; do not present pending requests as available or reserved appointments.
- Default changes must be visibly denied: `Änderungen gesperrt – Betriebsregel noch offen`. The opt-in fixture should say `Änderungen testen (erfundene Freigabe)` and clearly reset all current records, rather than quietly enabling policy on existing records.
- A proposed change must say that the current appointment remains in place and no new time is reserved. Distinguish rejection of a change proposal from decline of an original request. After an applied reschedule, show the old effective state and linked replacement rather than depicting the historic row as edited.
- Preserve form entries after a rejected operation, focus a concise alert and give a neutral recovery direction. Public error messages must not reveal whether an inaccessible record exists. Do not claim a failed operation means a slot is now free.
- Pending async work needs an announced working state and disabled repeat actions. Role, location and reset must not switch beneath an unresolved command. A stale selected row after changing role/location must clear before another action can be attempted.
- Keep controls at least 44 CSS pixels high with visible keyboard focus. Collapse date/time and action pairs at narrow widths. Inline labels, headings and live status are required; placeholder-only labels and color-only states are insufficient.
- Empty customer state should invite the first synthetic request. Empty staff state should direct the tester to create one in the customer role, while a location-scope denial must not masquerade as an empty successful queue.

## Issues challenged during implementation

| Observation | Resolution and evidence |
| --- | --- |
| The scenario disclosure initially used a 30-pixel target. | Increased to a 44-pixel minimum; source inspected. |
| A CONFIRMED booking with a pending change was described as historical. | Separate pending-change copy now says the original test appointment remains and no new slot is reserved; source inspected. |
| Switching to the staff role left the workbench below a large inactive request form. | Role switching now moves focus/scroll to the relevant section. A further pixel review found roughly 500 pixels of inactive customer controls on mobile; the inactive form is now hidden while clock, context and role instructions remain. Viewed regenerated `refined-pending-390.png` and `refined-pending-1440.png` at original resolution: the stale checkbox/disabled CTA is gone and the staff workbench is shorter. Closed. |
| Disabling controls during async work could disrupt keyboard continuity after a scope change or refresh. | Coordinator added explicit success focus restoration. Functional verification belongs to the independent QA driver. |

The invalid-role null guard was already fixed in the live source before the designer's stale-read report reached the coordinator. It is not an outstanding design defect; independent QA exercises the actual recovery path.

## Evidence status

Viewed actual local screenshots, not mockups: `output/playwright/lab/coordinator-initial-390.png`, `coordinator-initial-1440.png`, `coordinator-pending-390.png`, `coordinator-pending-1440.png`, `confirmed-390.png` and `confirmed-1440.png`. The 390-pixel pending and confirmed images were also viewed at original resolution. These images were captured from the uncommitted implementation based on `50638a2`; they are interim evidence, not final-commit evidence.

The inspected images show legible synthetic scope, UTC labels, status meanings, a clear selected row, separately unselected reconciliation values, unchecked manual attestation, distinct confirm/decline actions and a visible default policy explanation on the confirmed booking. There is no visible clipping in these captures. The inactive customer form above the staff workbench was the material mobile friction identified in pixel review.

Source snapshot at that interim review:

| File | SHA-256 |
| --- | --- |
| `lab/index.html` | `8e94dce6dd79e503c5418ccc511cf9abde776b84c436222458c57caa4ba36e9b` |
| `lab/styles.css` | `f472a891226f93c6cc6bebcce2154234f05f696ebfe59e7bf908b1818ea94726` |
| `lab/app.mjs` | `5a2253d79d1c69e8a8d0026d8fecfb1b308b5ce9970f9593514879a5aff6a518` |
| `lab/controller.mjs` | `ab4eeb27786831815cdfc644ea6d78287cf03c75fbfbd6cfda8b86677b889dae` |

After the inactive-form refinement, viewed `output/playwright/lab/refined-pending-390.png` and `refined-pending-1440.png` at original resolution. Re-read the live source: `lab/app.mjs` SHA-256 is now `2fde966f2d3bfb55828cb8f3964d146fc82e8607c0acb44799ac4e7fb31efb2a`; the other three source hashes above are unchanged. This closes the material mobile pixel finding. No remaining visual blocker was observed in the inspected initial, pending and confirmed states.

Also viewed current QA captures `change-pending-390.png`, `rescheduled-390.png`, `cancelled-1440.png` and `boot-app-failure-390.png`, all at original resolution, with the same source hashes as the refinement. The pending proposal clearly preserves the original test appointment. Rescheduling shows the historic effective state, immutable first decision and a linked replacement. Cancellation is labelled as a test outcome. The manual change attestation remains unchecked, and applying a proposal and rejecting it are distinct actions. No visible overlap or clipped control was observed in these captures.

The boot-failure image visibly retains disabled inputs. The coordinator accepted the minor recovery-copy recommendation: the static fallback now tells the tester to reload/check JavaScript if controls stay disabled, without claiming that a failure detector exists. Both source and final regenerated failure pixels were inspected. Closed. This was a usability recommendation, not an input-exposure finding.

Two additional source-only clarifications were inspected before the final run: historic records/customer receipts now label the original time and original reference explicitly, and a permission failure is described as an unavailable team view rather than a successful empty queue. These preserve the distinction between the first decision, its effective state and a linked replacement.

Current source after those refinements: `lab/index.html` SHA-256 `402893659c87caf61400395bf27fc7e1abcbad86c42c3f15818a62f4280d1470`; `lab/app.mjs` SHA-256 `4f14a548b797831518eaadcd415c13e8f1dd2efa8ee6148d4c4020adb37a1ff7`. CSS and controller hashes remain as above.

## Final version and pixel evidence

The independent QA run records implementation commit `33bbf447a6b47ad30bddda4528986cc10808f0a9`, captured at `2026-10-28T10:23:40.060Z` using fresh headless Chromium `156.0.8078.4` at loopback origin `http://127.0.0.1:4183`. The designer read its raw result manifest and independently compared the current four source hashes with the manifest. The recorded run has 18 PASS cases; executing those browser flows belongs to QA, not the designer.

After regeneration at that exact commit, the designer viewed the pending, mismatch-error, historical-receipt, change-pending, rescheduled and app-module-failure captures at **both 390 and 1440 pixels**, at original image resolution. The following curated files were then checked byte-for-byte against those already viewed final captures; all seven SHA-256 comparisons matched. Their complete hashes and source attribution are in [the evidence manifest](lab-review-images/evidence.json).

| Shareable image | Observation |
| --- | --- |
| [Desktop pending request](lab-review-images/desktop-pending.png) | Selected request and separate, blank manual reconciliation evidence remain clear. |
| [Mobile pending request](lab-review-images/mobile-pending.png) | Inactive customer inputs are hidden in staff mode; clock/context and the return-to-list action remain. |
| [Mobile mismatch error](lab-review-images/mobile-mismatch.png) | Alert gives recovery direction; entered test evidence is retained and status remains PENDING. |
| [Desktop reschedule history](lab-review-images/desktop-rescheduled.png) | Original time/reference and unchanged first decision are distinct from effective RESCHEDULED state and the linked replacement. |
| [Mobile historical receipt](lab-review-images/mobile-historical-receipt.png) | Receipt is explicitly historical and directs the tester to the replacement in the test-team view. |
| [Mobile module failure](lab-review-images/mobile-module-failure.png) | Inputs visibly stay disabled, with reload/JavaScript recovery guidance and no readiness claim. |
| [Mobile change proposal](lab-review-images/mobile-change-proposal.png) | Original appointment remains in force; manual evidence is unselected and apply/reject are distinct. |

Final source hashes:

| File | SHA-256 |
| --- | --- |
| `lab/index.html` | `402893659c87caf61400395bf27fc7e1abcbad86c42c3f15818a62f4280d1470` |
| `lab/styles.css` | `f472a891226f93c6cc6bebcce2154234f05f696ebfe59e7bf908b1818ea94726` |
| `lab/app.mjs` | `4f14a548b797831518eaadcd415c13e8f1dd2efa8ee6148d4c4020adb37a1ff7` |
| `lab/controller.mjs` | `ab4eeb27786831815cdfc644ea6d78287cf03c75fbfbd6cfda8b86677b889dae` |

No visible clipping, overlapping controls or misleading real-booking confirmation was observed in the inspected final captures. The error, history and boot-copy refinements remain legible at both widths. Error-focus and in-progress interaction behavior are covered by functional QA, not established by still images. A later report/image-only commit is evidence packaging; this review does not claim the browser suite was rerun on that later commit. Real authentication, database operations, calendar integration and hosted deployment remain outside this local visual review.
