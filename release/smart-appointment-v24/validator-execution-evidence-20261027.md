# PHMS v2.4 — Validator execution evidence, 2026-10-27

Confirmed current Draft PR #12 head before execution: 5aa339999010be4cdeb71f9db0a91f425f2ca92b.
Production line-webhook v1429 ACTIVE at observation; no deployment or DB mutation by this test.

## Executed
Retrieved both `contracts/scenario-validator.mjs` and `tests/scenario-validator.test.mjs` from the existing PR branch. Reproduced their full source in an isolated local Node.js v22.16.0 test directory and executed:

`node --test scenario-validator.test.mjs`

Result: **14 tests, 14 passed, 0 failed, 0 skipped** (76.8 ms total in this run).

## Scope
Checks draft-level bookings, Walk-in without time, retrospective draft, invalid day/time, clinician and unit organization mismatches, inactive clinician, and invalid statuses. No LINE, LIFF, token auth, document upload, storage, role impersonation, Postgres commit or cross-family UAT tested.

## Gate
Phase 1 NOT PASSED: full Production/GitHub source safe reconciliation and source-security review pending.
Phase 2 NOT PASSED: server-authoritative field validation, historic date-only canonical DB semantics, transaction and negative behavioral tests pending.
Do NOT treat 14/14 as end-to-end readiness. Keep Release Gate off. Next: create isolated backend validation and commit integration tests; read/validate current Production source using private safe method before sync. Rollback: revert this docs-only commit.
