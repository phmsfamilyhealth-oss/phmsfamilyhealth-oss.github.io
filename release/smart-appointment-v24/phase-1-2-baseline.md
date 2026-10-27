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

## Follow-up evidence — 2026-10-27
- Rechecked main SHA 1d988866dfcd9a1a97196b5fa26bbc989110f3cb; Draft PR #12 open and GitHub mergeable=true (not release approval).
- Retrieved actual production line-webhook v1420 function bundle (ACTIVE); entrypoint index.ts and supplementary files present. Reported runtime content checksum a5e0815ac877990f22e69d40cf23509c8e0de955b64bd0b144d522becaa5133c. Full source parity and route trace not yet verified.
- Queried private.phms_appointment_release_gate: enabled_for_everyone=false, allowlist_count=0. This is a read-only observation; do not change without approval.
- Verified public.phms_line_appointment_wizard_enabled SQL: gate checks enabled_for_everyone OR actor ID in allowlist, requiring an active row in line_identities; default false.
- Verified public.phms_line_save_appointment_wizard_draft SQL: uses private.phms_line_crud_context(p_line_user_id,'appointment','create'); validates nonnull draft key, object JSON and <=65536-byte payload; performs owner/person-matched upsert in private.phms_appointment_wizard_drafts, 30-day expiry on update, and writes audit log. This is a draft RPC, NOT proof of atomic canonical appointment commit, and LINE-user-ID substitution risk at the trusted caller boundary remains subject to verification.
- Verified phms_can_access_person is a public SQL wrapper around private.phms_can_access_person_impl; must inspect underlying implementation and privileged callers before accepting authorization.
- Draft PR #12 must remain non-merged until review. Phase 1 and 2 STILL BLOCKED; no tests run and no rollout.

## Authorization source follow-up (read-only)
- private.phms_can_access_person_impl: rejects missing auth.uid(), null person, invalid action; requires active family_person relation and private.user_can_access_family_person(...) for requested action. This establishes source-level guards, not yet behavioral IDOR acceptance.
- private.phms_line_crud_context: rejects unknown resources/actions; calls phms_resolve_line_command_context(..., require_context=true), checks context_ready, permission_granted and target_person_id nonnull. Trusted caller must bind LINE identity to cryptographically verified LINE token; the RPC itself accepts p_line_user_id text.
- public.phms_line_get_appointment_wizard_draft: same create-permission context; restricts draft to actor_user_id, target_person_id and unexpired drafts; returns last five drafts if no key. Needs behavioral cross-person tests.
- No user identity, patient records or documents were fetched in this review.

## Repeatable baseline verification — 2026-10-27 (follow-up)
- Rechecked GitHub main HEAD 1d988866dfcd9a1a97196b5fa26bbc989110f3cb, PR #12 OPEN/DRAFT, and production line-webhook ACTIVE **v1421**; Production changed independently from previously observed v1420. Never deploy earlier source without fresh comparison.
- Executed read-only PostgreSQL assertions, **14 passed / 0 failed**; saved exact repeatable SQL at `release/smart-appointment-v24/tests/baseline_readonly.sql`.
- Coverage: appointments/procedures/tasks/document links, three healthcare master tables, RLS flags on three canonical tables, gate disabled, allowlist empty, and browser authenticated role lacking EXECUTE on both wizard draft save and gate RPCs.
- These are *metadata/configuration assertions only*, not full behavioral cross-family access tests, LINE token verification, transaction tests, automated CI or UAT. Phase 1 and 2 remain BLOCKED.
- No production data, policy, storage object, Edge Function, or flag was changed by the audit. Rollback of this documentation/test-only commit: revert PR commits without database rollback.

## 2026-10-27 follow-up: privileged function boundary assertions
- GitHub main unchanged 1d988866dfcd9a1a97196b5fa26bbc989110f3cb; Production line-webhook ACTIVE v1426; gate disabled; allowlist empty.
- Added `release/smart-appointment-v24/tests/auth_boundary_readonly.sql` and executed exact committed SQL against Production read-only: 10/10 PASS, no failed assertions.
- Checked authenticated/anon cannot invoke sensitive candidate commit, LINE context, wizard save/get RPCs, while service_role can invoke wizard save. This does not demonstrate safe token binding or end-to-end authorized behavior.
- Phase 1–2 still BLOCKED for full source parity, actual behavioral security tests, field acceptance and integration. No production mutation or deploy performed. Rollback: revert documentation/test-only PR commits.
