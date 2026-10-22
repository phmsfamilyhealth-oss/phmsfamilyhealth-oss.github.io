# PHMS Diagnostic Appointment — Delivery Manifest

Production DB inspected 2026-10-22. No existing procedure/investigation tables or RPC were found before this change. Uses existing `appointments.appointment_type=investigation`, `appointment_tasks`, `appointment_reminders` and `appointment_document_links`. Never create clinical instructions by inference.

## Verified infrastructure
- Applied: `phms_diagnostic_appointment_procedure_items_20261022` (additive table; RLS enabled and no direct client grants)
- Applied: `phms_diagnostic_appointment_authorized_detail_20261022` (authorized server-side read-only RPC; not connected to LINE yet)
- LINE UAT and clinical validation: NOT VERIFIED

| Requirement | Component | DB/RPC | LINE screen | Postback | Navigation | Test | Deploy | Evidence | Status |
|---|---|---|---|---|---|---|---|---|---|
| DIA-01 | investigation | appointment_procedure_items / appointments | menu | Not connected | Return Context pending | DIA-01 E2E NOT RUN | line-webhook | Pending production handler | TODO |
| DIA-02 | investigation | appointment_procedure_items / appointments | person | Not connected | Return Context pending | DIA-02 E2E NOT RUN | line-webhook | Pending production handler | TODO |
| DIA-03 | investigation | appointment_procedure_items / appointments | category | Not connected | Return Context pending | DIA-03 E2E NOT RUN | line-webhook | Pending production handler | TODO |
| DIA-04 | investigation | appointment_procedure_items / appointments | multi_select | Not connected | Return Context pending | DIA-04 E2E NOT RUN | line-webhook | Pending production handler | TODO |
| DIA-05 | investigation | appointment_procedure_items / appointments | selected | Not connected | Return Context pending | DIA-05 E2E NOT RUN | line-webhook | Pending production handler | TODO |
| DIA-06 | investigation | appointment_procedure_items / appointments | edit_list | Not connected | Return Context pending | DIA-06 E2E NOT RUN | line-webhook | Pending production handler | TODO |
| DIA-07 | investigation | appointment_procedure_items / appointments | hospital | Not connected | Return Context pending | DIA-07 E2E NOT RUN | line-webhook | Pending production handler | TODO |
| DIA-08 | investigation | appointment_procedure_items / appointments | service_unit | Not connected | Return Context pending | DIA-08 E2E NOT RUN | line-webhook | Pending production handler | TODO |
| DIA-09 | investigation | appointment_procedure_items / appointments | datetime | Not connected | Return Context pending | DIA-09 E2E NOT RUN | line-webhook | Pending production handler | TODO |
| DIA-10 | investigation | appointment_procedure_items / appointments | arrival | Not connected | Return Context pending | DIA-10 E2E NOT RUN | line-webhook | Pending production handler | TODO |
| DIA-11 | investigation | appointment_procedure_items / appointments | preparation | Not connected | Return Context pending | DIA-11 E2E NOT RUN | line-webhook | Pending production handler | TODO |
| DIA-12 | investigation | appointment_procedure_items / appointments | document | Not connected | Return Context pending | DIA-12 E2E NOT RUN | line-webhook | Pending production handler | TODO |
| DIA-13 | investigation | appointment_procedure_items / appointments | review | Not connected | Return Context pending | DIA-13 E2E NOT RUN | line-webhook | Pending production handler | TODO |
| DIA-14 | investigation | appointment_procedure_items / appointments | saved | Not connected | Return Context pending | DIA-14 E2E NOT RUN | line-webhook | Pending production handler | TODO |
| DIA-15 | investigation | appointment_procedure_items / appointments | detail | Not connected | Return Context pending | DIA-15 E2E NOT RUN | line-webhook | Pending production handler | TODO |
| DIA-16 | investigation | appointment_procedure_items / appointments | all_procedures | Not connected | Return Context pending | DIA-16 E2E NOT RUN | line-webhook | Pending production handler | TODO |
| DIA-17 | investigation | appointment_procedure_items / appointments | reminder | Not connected | Return Context pending | DIA-17 E2E NOT RUN | line-webhook | Pending production handler | TODO |
| DIA-18 | investigation | appointment_procedure_items / appointments | preparation_check | Not connected | Return Context pending | DIA-18 E2E NOT RUN | line-webhook | Pending production handler | TODO |
| DIA-19 | investigation | appointment_procedure_items / appointments | completed | Not connected | Return Context pending | DIA-19 E2E NOT RUN | line-webhook | Pending production handler | TODO |
| DIA-20 | investigation | appointment_procedure_items / appointments | result | Not connected | Return Context pending | DIA-20 E2E NOT RUN | line-webhook | Pending production handler | TODO |
| DIA-21 | investigation | appointment_procedure_items / appointments | result_document | Not connected | Return Context pending | DIA-21 E2E NOT RUN | line-webhook | Pending production handler | TODO |
| DIA-22 | investigation | appointment_procedure_items / appointments | history | Not connected | Return Context pending | DIA-22 E2E NOT RUN | line-webhook | Pending production handler | TODO |
| DIA-23 | investigation | appointment_procedure_items / appointments | edit | Not connected | Return Context pending | DIA-23 E2E NOT RUN | line-webhook | Pending production handler | TODO |
| DIA-24 | investigation | appointment_procedure_items / appointments | reschedule | Not connected | Return Context pending | DIA-24 E2E NOT RUN | line-webhook | Pending production handler | TODO |
| DIA-25 | investigation | appointment_procedure_items / appointments | cancel | Not connected | Return Context pending | DIA-25 E2E NOT RUN | line-webhook | Pending production handler | TODO |
| DIA-26 | investigation | appointment_procedure_items / appointments | empty | Not connected | Return Context pending | DIA-26 E2E NOT RUN | line-webhook | Pending production handler | TODO |
| DIA-27 | investigation | appointment_procedure_items / appointments | pending | Not connected | Return Context pending | DIA-27 E2E NOT RUN | line-webhook | Pending production handler | TODO |
| DIA-28 | investigation | appointment_procedure_items / appointments | denied | Not connected | Return Context pending | DIA-28 E2E NOT RUN | line-webhook | Pending production handler | TODO |
| DIA-29 | investigation | appointment_procedure_items / appointments | error | Not connected | Return Context pending | DIA-29 E2E NOT RUN | line-webhook | Pending production handler | TODO |
| DIA-30 | investigation | appointment_procedure_items / appointments | expired | Not connected | Return Context pending | DIA-30 E2E NOT RUN | line-webhook | Pending production handler | TODO |

## Release gates
1. Build authenticated idempotent appointment create/edit/reschedule and procedure status actions.
2. Link reminder and verified preparation sources only.
3. Attach existing medical document records to verified investigation procedure item.
4. Implement all 30 LINE routes and back-navigation and validate real-device actions.
5. E2E + RLS + concurrency + clinical review prior to feature enablement.
