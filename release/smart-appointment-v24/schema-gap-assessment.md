# PHMS v2.4 Phase 2 — Confirmed schema-gap assessment
Date: 2026-10-27 (Asia/Bangkok). Based on Production line-webhook v1422 and GitHub main 1d988866dfcd9a1a97196b5fa26bbc989110f3cb.
**Scope:** read-only schema metadata queries; NOT approval to migrate.

## Verified targeted checks
| Check | Result | Consequence |
|---|---|---|
| Named hospital-specific clinician code in healthcare_clinicians | absent | Model organization-specific identifier separately from license_no |
| Clinician affiliation table matching %clinician%affiliation% | absent | Assess broader relational design before multi-hospital support |
| appointments.idempotency_key or request_key | absent | Cannot rely on single-row idempotency; inspect existing transactional RPCs and logs |
| Non-PK unique index on appointments | absent | Deduplication cannot be assumed from an appointment unique constraint |
| appointments.visit_time_known | present | Preserve unknown-time semantics, do not manufacture 00:00 |
| appointments.actual_visit_date or visit_date | absent | Clarify retrospective actual visit date semantics against arrived_at/completed_at |

These are narrow naming/schema checks, NOT proof that all possible alternative tables or implementations are absent. Full migration inventory and SQL function/source review required.

## Proposed design decisions (not yet applied)
1. Prefer existing appointments as sole canonical record; avoid parallel appointment table.
2. Create a transaction boundary in privileged backend that validates signed identity, person authorization, hospital/unit/clinician linkage, activity arrays, attachment ownership, and idempotent commit/readback.
3. Place organization-specific doctor code on verified organization affiliation; retain license_no for professional registration only.
4. For historical walk-in vs confirmed appointments, define explicit semantic matrix: confirmed appointment timestamp, planned date, actual visit date, unknown time, and current status.
5. Introduce an idempotency receipt keyed to actor+operation+client key, with request-body digest and readback; design rollback as additive, no destructive migration.
6. Link private staged files only after canonical commit; expiration and cleanup/retry must be tested.
7. Do not enable LINE LIFF for any account yet; release gate remains off.

## Acceptance status
PHASE 1 BLOCKED: deployed source comparison, logs, route/security review outstanding.
PHASE 2 BLOCKED: exhaustive mappings, columns/constraints, requiredness and authorization matrix outstanding.
No migration, data write, deploy, rollout, CI or UAT completed.
Rollback: revert this document-only commit; Production untouched.
