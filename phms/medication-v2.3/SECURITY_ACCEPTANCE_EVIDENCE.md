# PHMS v2.3 — Security and Backend verification evidence (2026-10-22)
**Scope:** Production read-only metadata queries. No test patient created, no RPC mutation, no LINE postback initiated.
**Verified:** medication_* direct policies total 42. RLS enabled and no direct policy for medication_order_versions, medication_administration_events, medication_inventory_transactions, medication_expense_links. medication_master RLS enabled and 1 direct policy.
**Interpretation:** Zero direct policies can be intentional server-RPC-only architecture; this is NOT proof of endpoint authorization. SECURITY NOT VERIFIED without role impersonation and RPC-by-identity tests.
**Known automated unit evidence:** GitHub Actions 39741353161 has 27/27 pass. No real LINE/UI/backend transaction evidence.
**UAT:** public.phms_med_ui_uat_cases 128 NOT_RUN as of last check; none auto-promoted to PASS.
**Clinical:** pharmacist/physician acceptance must be explicitly performed and signed by authorized professional; pending, not simulated.
**Production:** webhook v1287 ACTIVE at last check; active service does not imply acceptance.
## Remaining execution gates
1. Run role-scoped reads and denied writes against isolated test principals (authorized caregiver A, family B, unrelated actor) with zero PHI disclosure.
2. Use transaction-rollback fixtures for idempotency, concurrency, FEFO, negative stock, order history, audit and expense reconciliation. Rollback is not a substitute for isolated test infrastructure when side effects escape transactions.
3. Collect LINE real-device screenshots/postback context and database read-back, redacted.
4. Record per-case actual result, evidence identifier, version and authorized tester in phms_med_ui_uat_cases.
5. Obtain clinical sign-off separately and rerun production checks on deployed version.
**Release decision: NOT ACCEPTED.** No clinical approval, no authorized real-device UAT, no production mutation tests.
