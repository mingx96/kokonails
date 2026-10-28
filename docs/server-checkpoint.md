# Backend checkpoint: pause after the synthetic contract delta

The local experiment now includes a strictly-future first-confirmation guard and a data-only external error descriptor. It adds no HTTP adapter, real identity provider, database, background job, migration, credentials, Treatwell operation, outbound service or deployment. The static preview candidate remains `be50423` and is not wired to this module.

Implementation and tests stop at this checkpoint. Future work depends on these compact decision groups:

1. Verified salon catalog: locations/timezones, services/durations, staff/resources/capacity and opening hours.
2. Operating policy: customer/staff change rights, pending withdrawal/expiry, notice windows, fees/no-shows, repeated or cross-location/service changes. The future-start guard does not invent these policies.
3. Calendar evidence: approved manual Treatwell reference/cancellation/rebooking reconciliation, including uncertain outcomes and the effective-state/history presentation.
4. Real adapters: owner-approved identity/session/MFA and database choices, separate test environment/data/secrets, durable transactions, audit/retention/recovery and cross-process tests. The fake adapter establishes none of these guarantees.
5. Hosting: selected-team plan and existing no-cost scope must be verified before any preview deployment. Existing credentials/permissions are not expanded here.

Detailed future constraints are in [the integration notes](server-integration-plan.md); exact executed tests and findings are in [the independent review](server-review.md). No repeated customer-policy prompts or additional backend expansion are needed until those decisions are available.
