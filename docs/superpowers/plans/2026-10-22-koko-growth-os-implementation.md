# Koko Nails MVP migration implementation plan

Goal: bring the tested offline ZIP from the prior conversation to this repository on a review branch, preserving its FastAPI backend, responsive site, admin and tests.

1. Copy project contents from koko-nails-growth-mvp.zip into repo root, excluding databases, credentials, local generated screenshots and caches.
2. Verify Python deps, run python -m pytest -q (last local result: 15 passed), and run node --check on app/static/app.js and admin.js.
3. Confirm booking transitions: PENDING to CONFIRMED requires manual Treatwell entry plus reference; PENDING to DECLINED allowed; no terminal retransition.
4. Exercise mobile, tablet, desktop and failed-network behavior against a locally served application.
5. Validate second location data, official owner booking links, legal/privacy, PII and secrets before launch.
6. Review PR and merge only when complete and tested.

This is a source migration plan. The app sources are not yet part of this GitHub branch.
