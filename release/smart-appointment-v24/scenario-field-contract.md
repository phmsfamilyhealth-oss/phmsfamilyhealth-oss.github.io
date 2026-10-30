# PHMS v2.4 — Scenario and Field Validation Contract (candidate v0.2)
Basis: Production schema/RPC audit through 2026-10-27, GitHub main 1d988866dfcd9a1a97196b5fa26bbc989110f3cb, webhook v1426. This document is a proposed contract, NOT deployed code.
All writes must pass backend verified LINE identity, server-resolved person/family scope, field validation and atomic commit. `service_role` must never be delivered to LIFF.

## Scenario matrix
| Scenario | Required user data | Mapping | Server condition |
|---|---|---|---|
| Confirmed hospital booking | person, booked date+time, hospital or free text, purpose | appointments.visit_mode=booked, appointment_at=timestamptz, visit_time_known=true | Require legitimate date/time; parse Asia/Bangkok once |
| Walk-in with known time | person, planned date/time, place or purpose | visit_mode=walk_in, appointment_at, planned_visit_date optional, visit_time_known=true | Status planned/scheduled per agreed state machine |
| Walk-in, unknown time | person, planned date, place or purpose | visit_mode=walk_in, planned_visit_date, appointment_at=NULL, visit_time_known=false | Enforce DB aim_walk_in_date_only_allowed; **old base commit rejects NULL appointment_at** |
| Historical visit | person, actual visit date; time optional | appointments status=completed with explicit actual date semantic TBD | DO NOT manufacture time; old base commit requires appointment_at. Block until approved schema/API decision |
| Rescheduled appointment | prior authorized appointment, replacement date/time or date-only walk-in | rescheduled_from_appointment_id + new canonical appointment | Validate same person, prevent cycles; ensure original visit state transition atomic |
| Follow-up / referral / investigation | person, purpose, reference optional when user does not know prior | followup_of_appointment_id / referral_from_appointment_id / investigation_of_appointment_id | Ensure every supplied UUID belongs to authorized patient and valid chronology |
| Multi-activity | one appointment, ordered activities | appointment_procedure_items | Existing candidate path supports diagnostic_procedures <=20 ONLY when appointment_type=investigation; broader activities need design/test |

## Main-form mapping
| UI label / system field | Target | Required | Validation and authorization |
|---|---|---|---|
| Patient | appointments.person_id + family_person_id + family_id | server-required | Resolve from verified LINE actor; enforce create permission and family link, never accept raw chosen UUID blindly |
| Scenario | visit_mode, status, appointment_type | required | Map UI enum to allowed DB CHECK values, no unknown enum |
| Subject | title | optional | Normalized visible Thai label; maximum length TBD from UI policy |
| Purpose | care_topic, note | optional | Trim text; no OCR auto-confirm |
| Date | appointment_at OR planned_visit_date | scenario required | Date picker; validate timezone/date-only separately |
| Time | appointment_at + visit_time_known | optional for walk-in | Picker only; no midnight placeholder |
| Hospital | organization_id / hospital_name | optional unless UX rule otherwise | Verify organization master or preserve user-supplied unverified name |
| Location | location_detail | optional | Plain text |
| Clinician | clinician_id / doctor_name | optional | Verify affiliation with hospital+unit; user-supplied name remains unverified |
| Appointment slip | appointment_document_links -> medical_documents/phms_storage_assets | optional | Private staged upload, MIME, size, ownership, scan, preview and signed read |
| Extra details | note | optional | Keep distinct from purpose |

## Advanced mapping
| UI | Target | Validation / ownership |
|---|---|---|
| Department and clinic | appointments.service_unit_id / department | Chosen unit.organization_id must match selected hospital |
| HN | appointments.hospital_hn | Patient+organization scoped; avoid display to other family |
| VN | appointments.hospital_vn | Hospital encounter identifier, do not treat as global unique ID |
| Coverage | appointments.coverage_type | Optional text or controlled choices per master contract |
| Doctor internals | healthcare_clinicians; proposed organization affiliation | Do not reuse license_no as hospital doctor code |
| Activities | appointment_procedure_items | Positive unique sequence; allow status only approved CHECK enum |
| Checklist | appointment_tasks | task_type in lab/imaging/urine/measurement/document/fasting/medication_instruction/other, status default pending |
| Responsible caregiver | appointment_assignees | Resolve only authorized family persons/users; notify after commit |
| Reminder preferences | appointment_notification_settings + user targets | Allow only authorized recipients and supported zone; keep scheduler unchanged until acceptance |
| Other documents | appointment_document_links | Must belong to same person and committed appointment |
| Earlier visit & follow-up | followup_of_appointment_id etc. | Backend checks ownership/chronology and no self-link/cycles |
| Results and after-visit notes | visit_outcome_notes, treatment_summary, diagnosis_summary, test_results_summary, next_steps, medication_plan_notes | Optional, person scoped; user statements not clinician verified by default |
| Audit metadata | created_by, timestamps, ids | SERVER-ONLY |

## Hard security acceptance
1. LIFF sends a short-lived verified LINE credential to a backend (not a line_user_id string trusted directly), backend validates signature/token and resolves actor + patient + create permission.
2. No direct LIFF client use of service-role, private RPC or privileged health table mutation.
3. Verify organization->service unit->clinician relationship in backend transaction; independent FK constraints are insufficient.
4. Atomic insert of canonical appointment + subrecords + linkage receipts. Reject same idempotency key with conflicting payload. Retry same payload returns same readback.
5. Readback requires authorized patient scope; no success toast until canonical appointment and linked resources verified.
6. Storage private object links are scoped and reversible; failed commit does not leak staged uploads.
7. Existing LINE text route remains untouched until behind default-off flag; full rollback disables LIFF route without modifying existing canonical rows.

## Stop conditions and gaps
- Existing private.phms_commit_appointment_candidate_base_20261010 requires appointment_at; must be fixed safely for walk-in date-only and historical time-unknown cases.
- Current procedure commit path is investigation-only; generalized activities/checklist/document atomicity not proven.
- Existing candidate provenance idempotency cannot yet be reused as web operation idempotency without verifying caller and request hash.
- No complete verified LIFF route, credential flow, runtime source parity, live storage bytes or cross-family behavioral results yet.
- Phase 1 BLOCKED; Phase 2 BLOCKED pending constraints/ownership exhaustive signoff; Phase 3 must not start Migration on Production.
