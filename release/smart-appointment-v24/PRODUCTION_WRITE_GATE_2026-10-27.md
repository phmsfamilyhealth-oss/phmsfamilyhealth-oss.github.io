# PHMS v2.4 — Production write-path compatibility gate (27 Oct 2026)

## Read-only verification performed against production
- main HEAD: 1d988866dfcd9a1a97196b5fa26bbc989110f3cb
- line-webhook: v1431; isolated phms-v24-appointment-confirm: v1, fail closed.
- `public.phms_v24_commit_appointment(uuid,uuid,uuid,uuid,jsonb)`: ABSENT.
- `private.phms_v24_appointment_operations`: ABSENT.
- Existing `appointments` columns match draft migration's base INSERT column names and types.
- Existing `appointment_tasks` supports task_type='other' and status='pending'.
- Existing `appointments` CHECK: date-only only valid for walk_in with planned/scheduled status; completed historical entries require known time under current rules.

## Release blockers (do not bypass)
1. Review draft SQL migration against live table defaults, triggers, central permission policy, RLS and grants. Existing CI uses ephemeral PostgreSQL fixtures, not production full schema.
2. Production migration requires explicit high-risk release approval, transaction backup and rollback evidence. Never apply it as an incidental test.
3. Existing Edge v1 always rejects writes; only deploy real handler when LINE ID token + central permission + release gate + verified provider + idempotent transaction + scoped readback are wired and tested.
4. LIFF prototype still lacks an authorized master-catalog loading endpoint and has unconfigured LIFF ID/API. Do not open write before resolving.
5. Atomic document links, storage attachments, reschedule and historical unknown-time remain unsupported. Do not represent them as working.

## Acceptance
- CI green is necessary, never sufficient; no release without targeted-user real device LINE -> LIFF -> review -> database write -> scoped readback -> LINE UAT and owner approval.
- Recovery: do not change production during design. Branch changes can be reverted in PR #12. Edge v1 stays fail-closed.

## Latest verified continuation — commit aa5da8b0 (27 Oct 2026)
- GitHub PR #12 remains draft and unmerged; PHMS Contract Regression jobs `scenario-validation` and `postgres-atomic-smoke` passed in run 40534203116; Medication release gates passed in run 40534203507.
- Read-only live Supabase verification: dedicated v2.4 appointment commit routine remains absent; release gate is closed globally with zero enabled test actors; deployed appointment confirm remains v1 fail-closed.
- Live database CHECK `aim_walk_in_date_only_allowed` permits unknown-time date-only visits only for `walk_in` with planned/scheduled status; historical completed date-only is not supported without an approved schema-compatible design.
- Unresolved actual-use dependencies: owner-approved gated database migration and recovery plan; server-only private database connectivity/credentials; configured LIFF channel/origin and trusted endpoint; restricted test actor; authenticated LINE to LIFF to persisted readback and back to LINE UAT.
- Do not present green isolated CI as real LINE release acceptance. Do not deploy a write-capable candidate without explicit production-change authorization. No patient records were modified during these inspections.
