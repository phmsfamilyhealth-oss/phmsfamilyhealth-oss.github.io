# PHMS v2.4 — Existing Transaction and Database Constraint Evidence
Audit date: 2026-10-27. GitHub main baseline: 1d988866dfcd9a1a97196b5fa26bbc989110f3cb. Supabase line-webhook observed ACTIVE v1423.
**Read-only audit. Not an approved implementation contract.**

## Existing transactional entry points discovered
- private.phms_commit_appointment_candidate(p_candidate_id uuid, p_actor_user_id uuid)
- private.phms_commit_appointment_candidate_base_20261010(p_candidate_id uuid, p_actor_user_id uuid)
These functions require body-level inspection and isolated behavior tests **before any new transactional appointment API is designed**. Their presence does NOT prove that they handle the full web form, array writes or idempotency.

## Observed DB constraints — must be reflected in UI and API validators
- appointments.visit_mode permits booked, walk_in, unspecified or NULL.
- appointments.appointment_type accepts new_case, follow_up, referral, investigation, procedure, walk_in, rescheduled, other, checkup, vaccination, medication_refill.
- When visit_time_known=false, existing aim_walk_in_date_only_allowed check requires visit_mode=walk_in, appointment_at IS NULL, planned_visit_date IS NOT NULL, status in (planned,scheduled). Do not fake a time of midnight.
- Planned appointments require appointment_at or planned_visit_date.
- Followup kind must use follow_up appointment type and one of general, chronic_routine, post_treatment, results_review.
- appointment_procedure_items.sequence_no > 0, UNIQUE(appointment_id,sequence_no); status PLANNED/COMPLETED/NOT_DONE/CANCELLED/RESCHEDULED/NEEDS_REVIEW; COMPLETED requires completed_at.
- appointment_tasks.status permits pending/completed/skipped/cancelled; task_type permits lab/imaging/urine/measurement/document/fasting/medication_instruction/other.
- appointment_procedure_items appointment FK is ON DELETE RESTRICT; appointment_tasks appointment FK is ON DELETE CASCADE. Never change canonical delete behavior in this phase.

## Technical risks
- Existing FK on organization_id, service_unit_id and clinician_id validates independent existence but does NOT by itself establish their cross-entity affiliation matches. Implement an explicit server-side join/validation.
- A historical visit whose exact time is unknown is NOT representable by the existing walk-in date-only CHECK without checking whether past status/visit semantics need a safe additive extension.
- A no-extra-unique-index check on appointments is not proof that the existing private candidate commit lacks idempotency. Must inspect it.
- Do not call Source or schema reviews user-facing UAT.

## Next verification tasks
1. Read definitions of both private appointment candidate commit functions, document actor resolution, transactional boundaries, idempotency and readback.
2. Inspect source candidate/intake data model, indexes and triggers involved in creation.
3. Complete field-wise contract with scenario requiredness/validation.
4. Run isolated tests for cross-family denial, duplicate submissions, clinician mismatch, unknown-time walk-in, multi-procedure and staged document rollback.
5. Keep Draft PR #12 and feature gate closed. No Production deploy, schema mutation or patient data changes.

Rollback for this commit: revert documentation only.
