# Source audit and first-slice decision

Audit date: 2026-10-27 UTC. This report intentionally omits machine-specific paths and private business material.

## Verified source

- Repository: `https://github.com/mingx96/kokonails`, PUBLIC.
- `main`: `3dc8c6b71b7a06134fe46a11b70300e44556a6a0`, README only.
- Existing branch: `feat/dual-booking-mvp`, `c139fbdfcd5147aab69cf023b4e3171721202bac`.
- Existing draft PR #1 remains open and unchanged.
- Fresh isolated checkout started clean at that head. Tracked files: `.gitignore`, `AGENTS.md`, `README.md`, one specification and one migration plan. No runnable app, dependency manifest, tests or deployment configuration existed there.
- New branch: `test/synthetic-booking-slice`, descending from the documented branch; previous branch/history preserved.

The ZIP named in the README was not found in accessible searches of Downloads, local GitHub folders, task folders or runtime attachments. There was no Koko checkout listed among the registered projects or managed worktrees inspected by name. Some parent-profile locations were not accessible under the sandbox, so this is a bounded search, not proof that no archive exists anywhere. Session transcripts, private financial files, credentials and restaurant sources were not read. No restaurant checkout, browser, data or configuration was changed.

## Decision

Proceed with a new, explicitly synthetic local slice while preserving the prior FastAPI specification/migration documents. Do not claim the prior app or historical 15 Python tests were recovered. If the original ZIP becomes available later, inspect it before selecting or migrating backend code.

The first slice uses static HTML/CSS/ES modules, a pure in-memory booking policy module, Node 24 `node:test`, and a loopback static server. It adds no dependencies and provisions no services. This is intentionally smaller than the old FastAPI blueprint: it demonstrates policy/UX, not a durable booking service. The static build can be assessed for a future Vercel test project. Production stack/auth/database remain a separate design and approval decision.

## Content and integration boundaries

No addresses, prices, opening hours, official booking links or second-salon facts have been verified. The UI therefore labels both locations and all services/customers as synthetic. There is no business structured data, canonical URL, review score, testimonial or ranking promise.

No real contact entry, outbound messaging, telemetry, persistent browser storage, Treatwell request or writable API is implemented. The publicly visible team screen is explicitly a role simulation. A caller can choose the mock staff role; this is not a security boundary and must never protect real records.

Read-only Vercel checks found no projects linked to GitHub repository ID `1429826379` in the connected personal scope or the connected team scope. The baseline GitHub commit had no check runs. These observations do not grant permission to deploy or rule out integrations outside the inspected account. No Vercel project/settings, GitHub permissions or service credentials were created or changed. No deploy workflow is added.

The follow-up source review requested a local platform configuration candidate. `vercel.json` now restricts output to `dist/`, declares all-path noindex/no-store headers and disables automatic Git deployments. This versioned configuration does not provision or change a live project. Its local tests do not replace hosted HTTP/CDN verification after a separately approved deployment.

## Release boundary

This draft branch is suitable for reviewing a local synthetic prototype. It is not approved for merge, deployment, indexing or customer use. Before integration, review a separate deployment/database/environment/secrets plan, server authentication and authorization, transactional policy enforcement, audit/retention/backups, verified salon content and manual Treatwell reconciliation. Outbound remains off.
