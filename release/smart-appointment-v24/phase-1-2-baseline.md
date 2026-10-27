# PHMS v2.4 — Read-only Production Baseline and Data Contract (Draft)
Date: 2026-10-27 (Asia/Bangkok)
Gate: PHASE 1 BLOCKED / PHASE 2 BLOCKED. No migrations, Production modifications, rollouts, or UAT performed.

## Observed baseline
- GitHub main: 1d988866dfcd9a1a97196b5fa26bbc989110f3cb. Branch created from exactly this SHA.
- Supabase project buxvdlfrikpwdscdlcfd, PostgreSQL 17.6; live line-webhook ACTIVE v1420 (newer than previous audit v1419). Deployment/source equivalence **not yet established**.
- Open draft PRs include #3 (appointment recovery), #4 (health), #5 (overview), #6 (expenses). Avoid accidental shared webhook replacement.
- Main branch protection required checks: off as observed from GitHub Branch API.
- Existing appointments canonical table and appointment_tasks, appointment_procedure_items, appointment_assignees, appointment_document_links, appointment_reminders, appointment_notification_settings, appointment_notification_user_targets.
- healthcare_organizations, healthcare_service_units and healthcare_clinicians exist. healthcare_clinicians has organization_id, service_unit_id, license_no; no observed hospital-specific doctor code or multi-hospital affiliation table.
- Relevant existing private buckets: phms-medical-sources (25MiB JPEG/PNG/WebP/PDF), phms-intake-temp (10MiB JPEG/PNG/WebP/PDF).
- Relevant draft RPCs phms_line_save_appointment_wizard_draft and phms_line_appointment_wizard_enabled are SECURITY DEFINER with EXECUTE granted to postgres/service_role, not browser roles. Browser must never use service_role.
- Appointment RLS policies rely on phms_can_access_person(person_id,'appointments','create/view/update/delete'). Appointment tasks use same permission for view/update. Document links check 'documents' permissions. Policy definitions observed; actor tests not yet performed.

## Mapping (observed field targets, not yet approved write contract)
| UX | Production target | Requirements |
|---|---|---|
| Person | appointments.family_id, person_id, family_person_id | Server-side family membership and create right; no editable UUID |
| Scenario | appointments.visit_mode, appointment_type, status | Enumerations/semantics must be inspected before acceptance |
| Subject | appointments.title, care_topic, note | Default only if explicitly approved by UX |
| Confirmed date/time | appointments.appointment_at | Thai timezone; unknown time must not silently become midnight |
| Planned walk-in date | appointments.planned_visit_date, visit_time_known | Confirm requiredness by scenario |
| Hospital | organization_id, hospital_name, location_detail | Keep free-entry unverified pending rather than inventing canonical verified master |
| Unit | service_unit_id, department | Parent organization ID must match |
| Clinician | clinician_id, doctor_name | Clinician affiliation must match hospital/unit; multi-hospital design gap |
| HN/VN and coverage | hospital_hn, hospital_vn, coverage_type | Person-scoped; do not leak identifiers |
| Follow-up/reschedule/referral/investigation | followup_of_appointment_id, rescheduled_from_appointment_id, referral_from_appointment_id, investigation_of_appointment_id | Same authorized person and no invalid cycles |
| Procedures | appointment_procedure_items | Ordered sequence; atomic with parent commit |
| Preparation checklist | appointment_tasks | Server-owned status defaults, authorization |
| Assignees | appointment_assignees | Validate recipient membership and role |
| Notifications | appointment_notification_settings and appointment_notification_user_targets | Validate timezone, day offsets, recipients |
| Documents | appointment_document_links -> medical_documents/phms_storage_assets | Staged private upload, MIME/size/signature checks, cleanup, retry/readback |
| Visit outcome | visit_outcome_notes, treatment_summary, next_steps, completed_at | Past visit semantics distinct from scheduled time |
| Audit | created_by, created_at, updated_at and FK/UUID | Server generated; do not expose input |
| Draft | existing appointment wizard draft RPCs | Identity and restoration semantics require function-body review |

## Open gaps / release blockers
1. Compare complete deployed Edge Function v1420 to current GitHub main, check LINE routing and LIFF configuration.
2. Inspect SQL definitions for existing appointment transaction RPCs, all related policies and phms_can_access_person, plus EXECUTE grants.
3. Verify valid CHECKs, FK constraints, unique indexes, status enums and existing idempotency mechanics; no assumption that arbitrary UI payloads are accepted.
4. Decide explicit date/time semantics for historic visits and unknown appointment times.
5. Design hospital-specific clinician codes and multi-hospital relations non-destructively after exhaustive schema search.
6. Verify upload bytes/private signed read, document ownership and staged asset cleanup.
7. Implement cross-family / missing-permission / replay / double-submit tests in isolated environment, and real LIFF UAT later.
8. Protect GitHub main with required checks if organizational settings permit, after reviewing impact.
9. Define feature flag and staged allowlist default-off, with audited override/rollback.
10. Record exact source SHA, tests, CI, rollback evidence and owner acceptance before rollout.

## Next actions
Read current Edge source and related SQL bodies; write full field-by-field mapping with required/optional, validation, authorizer and ownership; create tests in an isolated branch. Do not create migrations or deploy until Phase 1 and 2 pass. Phase 3 onward remains unstarted.

## Safety and rollback
This commit only adds a documentation file on a feature branch. Rollback: revert this commit or delete the branch after preserving audit history. No patient rows, Production RPCs, Storage objects or runtime flags are modified.
