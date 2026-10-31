# Medication v2.3 — Test and acceptance gate
Machine-readable current evidence: ACCEPTANCE_MATRIX_2026-10-22.csv (36 rows).
Database UAT register phms_med_ui_uat_cases: 128 NOT_RUN, 0 PASS (2026-10-22).
Navigation unit CI: 27/27 PASS at https://github.com/phmsfamilyhealth-oss/phmsfamilyhealth-oss.github.io/actions/runs/39741353161 ; this does NOT verify production LINE or clinical workflows.
Required scenarios: shared medications/different persons, shared inventory/independent order, AM/PM variable doses, eye drops multiple bottles, mid-preparation order changes, concurrent caregiver double records, PRN, conditional confirmed assessment, pending/unverified orders, allergy, FEFO/open expiry, expense cost allocation, daily/emergency reports, historical corrections.
Require negative/cross-family/security, direct RPC bypass, idempotent replay, financial and inventory reconciliation, actual LINE button taps and post-write Supabase proof.
Only PASS with reproducible actual result, timestamp, test identity, non-sensitive evidence and code/migration/deploy version. Otherwise NOT_RUN/NOT_VERIFIED/FAIL/BLOCKED.
