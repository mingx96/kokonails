# Koko Nails dual-booking specification

Treatwell is authoritative. A KoKo Direct request is never an instant-confirmed booking. Website serves German-speaking customers on desktop, tablet and mobile for two branches.

## Two booking choices
- Treatwell booking uses an owner-verified official link per location.
- KoKo Direct collects preferred branch, service, date/time, contact and privacy acceptance. Its status starts PENDING. No time slot is reserved.
- Salon staff must first check and create a real booking in Treatwell. They then enter the Treatwell reference to confirm in the KoKo administration.
- Existing Treatwell bookings must not be shifted to avoid marketplace fees.

## Required safety
Reject unknown locations, invalid dates, repeated conflicting idempotency keys, unauthorized admin requests, confirmation without Treatwell reference, and repeat changes of terminal status. Never fabricate salon 2 details or claim real-time availability.

## Release gates
Run backend unit tests, JS syntax and responsive browser QA. Before live use: get owner links, lawful business/privacy texts, secure database, MFA, audit trail, back-up, notifications, GDPR retention and a tested reconciliation workflow.
