# PHMS v2.4 Detailed Form — production mapping and release status

Read-only schema inspection 2026-10-30. No production schema or patient data changed.

| UI group | Existing destination | Safe write/readback status |
|---|---|---|
| Basic title, note, date, provider, doctor | appointments.title/note/planned_visit_date/organization_id/service_unit_id/clinician_id and text fallback | Draft contract exists, Production v2.4 atomic RPC NOT installed; still disabled |
| Hospital HN / VN | appointments.hospital_hn, hospital_vn | Columns exist; v2.4 draft and protected row mapper implemented, production save/readback not deployed |
| Hospital location, telephone | appointments.location_detail, contact_phone | Same |
| Care follow-up topic | appointments.care_topic | Self-reported, never medical verification |
| Coverage and arrival lead | appointments.coverage_type, arrival_lead_minutes | Existing columns; lead must be 0–1440 integer |
| Historical outcome, diagnosis, treatment, results, medications, next steps | appointments.visit_outcome_notes, diagnosis_summary, treatment_summary, test_results_summary, medication_plan_notes, next_steps | Existing columns; user-provided content must not be labeled clinician-verified |
| Walk-in reason | appointments.walk_in_reason | Existing; only shown for walk-in |
| Preparation item title/status | appointment_tasks.title/status (+ appointment_id) | Existing; creation/readback/update API not complete. Prevent duplicate task creation via legacy trigger; do not enable |
| Procedures and medical instructions | appointment_procedure_items | Separate rows; no verified procedure-creation/selection API in v2.4, no input shown |
| Related appointments, rescheduling, referrals | appointments.followup_of_appointment_id, rescheduled_from_appointment_id, referral_from_appointment_id, investigation_of_appointment_id | Cannot safely accept unverified IDs; no authorized person-scoped selector/write/readback deployed; do not expose input |
| Existing docs, scans and appointment links | appointment_document_links, medical_documents, phms_storage_assets | Existing document module; no v2.4 authorized selector/link API or upload; do not create another upload pipeline |
| Responsibility, reminders | appointments.reminder_offsets_minutes and related task permissions | Mapping/notification delivery not integrated, do not promise or expose new writable controls |
| Expenses | existing PHMS expense module | Do not duplicate amount fields |
| Creator IDs, verified clinician flags, foreign keys, timestamps, source keys, completion actor | protected server-generated fields | Never request from user |

## Release gates

Before enabling save: revise gated atomic migration **candidate only** with verified columns, test against all real CHECK/FK/triggers, prove recoverable backup/restore and rollback, maintain RLS, owner-only allowlist and audited actor, implement same-transaction idempotency and authorized readback for every enabled group; independently test all visit modes and real LINE cards. No clinical note becomes a doctor-verified diagnosis automatically.

**Current state:** Preview fields only. All appointment writes disabled in LIFF/Confirm API; no field in detailed mode is represented as saved to Production.
