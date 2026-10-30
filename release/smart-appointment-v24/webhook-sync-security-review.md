# PHMS v2.4 — Webhook reconciliation and security release hold
Audit date: 2026-10-27. GitHub main HEAD 1d988866dfcd9a1a97196b5fa26bbc989110f3cb. Draft PR #12 kept separate. Production Edge function line-webhook observed ACTIVE v1429, 4 files with index.ts length 1,503,333 characters; GitHub main source blob 0f04bd67667bf12a4d00c6b3cf2cd1d547939eca. Earlier v1427 index source Git blob digest d89d27d9304ebee793c72bb2379851a4f0a6e234 differs from GitHub main. Production version continued changing in this audit.

## Safety critical finding
Automated inspection of current Production v1429 index source found **5 candidate matches to JWT/API-token-looking patterns**. This is a heuristic indicator only: no evidence these are genuine live secrets, and they must NOT be printed or published before private review. Supabase access tokens and environment-key *names* alone are not proof of hard-coded secrets. Do not blindly copy >1.5MB production source into a public GitHub PR. That would risk public credential exposure and overwrite unrelated active features.

## What was changed
Committed `scripts/check-webhook-sync.mjs` to PR #12: privately compares deployed and GitHub source with SHA-256 and Git blob SHA-1 and fails closed on suspicious token-looking content or mismatched sources. This script does not download secrets, change production, or run automatically; the source bytes must be supplied securely.
No production function, database, flag, users or patients were altered.

## Reconciliation sequence (blocker; must be performed without leakage)
1. Freeze/check stable source version; if constantly changing, coordinate integration branch, never rollback independent bugfixes.
2. Privately review all token-looking literal contexts (no values in GitHub logs); distinguish examples from real credentials. Rotate any actually exposed secrets via approved security procedure.
3. Restore latest reviewed Production source into *private isolated working tree*, compare all 4 files, and run Deno check + webhook routing/medication/expenses regression.
4. Commit only safe source to reviewed GitHub branch when size/connector allows and it passes security checks; don't merge unrelated runtime into an incomplete Smart Appointment PR without review.
5. Re-read deployed active function and verify content hash/parity with reviewed code. Deployment remains controlled and feature release gate off.
6. Complete Phase 1 acceptance, run Phase 2 validator/transaction integration tests and advance to Phase 3 only with recorded acceptance.

## Acceptance
Phase 1: NOT PASSED (source reconciliation/credential review/route tests outstanding).
Phase 2: NOT PASSED (contract exists, but provider permissions/transaction and real LIFF tests not executed).
Production unchanged by this attempt; no real device UAT or owner action at this point.
Rollback: revert only this private-safe script/document commit.
