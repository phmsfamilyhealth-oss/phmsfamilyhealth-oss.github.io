# Existing appointment candidate commit — source audit
Observed on 2026-10-27 against Supabase Production. No execution or changes.

Functions inspected: private.phms_commit_appointment_candidate and private.phms_commit_appointment_candidate_base_20261010.

## Supported and limited
- Base locks data_intake_candidates with FOR UPDATE, checks candidate_type appointment, review_status accepted/committed, person/session equality, and searches provenance for prior committed appointment; returns idempotent_replay:true if found.
- Base currently requires normalized_data.appointment_at to parse to a non-null timestamptz; raises appointment_at_required otherwise.
- Base validates prior follow-up/referral/investigation record references for same person and earlier appointment time.
- Base inserts canonical appointments and writes provenance, synchronizes HN/VN and reminders.
- Outer function calls base then updates appointment visit fields and can insert up to 20 diagnostic_procedures, but only for appointment_type investigation; request_key is constructed from intake candidate and code, with ON CONFLICT DO NOTHING.
- **Blocking conflict**: base's unconditional appointment_at_required prevents the contract's walk-in date-only unknown-time scenario, even though appointments DB constraint explicitly permits it with planned_visit_date and visit_time_known=false. Must fix in isolated tested candidate design; no Production patch until Phase 1–2 acceptance.
- **Additional limitation**: arbitrary multi-activity appointments are not proved by this implementation because diagnostics array is restricted to appointment_type investigation. Advanced tasks, documents and assignees not shown as part of the same atomic commit in the examined bodies.
- Idempotency is candidate/provenance-based for existing intake flow, not yet a general LIFF Web Form idempotency guarantee. Do not assume the current RPC covers double-submit from browser.
- Permission at entry/caller boundary remains to audit. SECURITY DEFINER function accepts actor UUID; caller verification cannot be assumed from parameter value alone.

## Required isolated regression matrix
1. Confirmed timed hospital appointment
2. Walk-in date only and unknown time (currently structurally blocked at base)
3. Retrospective visit with date without exact time
4. Same candidate replay and concurrent duplicate submissions
5. Cross-family/person rejection
6. Hospital/unit/doctor relation mismatch
7. Multi-activity procedure + checklist + documents atomicity
8. Failure halfway through asset linkage and transaction rollback
9. Readback authorization after successful commit
10. Unrelated LINE CRUD unchanged.

Gate: Phase 1 BLOCKED / Phase 2 BLOCKED. No patient records accessed, no production mutations. Rollback of this document commit is revert-only.

## Follow-up regression evidence (2026-10-27)
- Production line-webhook observed v1424 ACTIVE, main SHA unchanged; release gate disabled and allowlist empty.
- Added tests/unknown_time_contract_readonly.sql and executed against live schema: **5/5 PASS**, zero data mutations.
- These tests confirm the **presence of the mismatch**, not successful date-only visit support. Isolated code change and integration tests remain pending.
