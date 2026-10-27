# PHMS v2.4 — Phase 1/2 Gate Decision and implementation handoff
Audit timestamp: 2026-10-27 Asia/Bangkok. Owner asked to finish Phase 1/2 rather than repeat partial audit reports.

## Definitive decision
**Phase 1 audit evidence gathered, but source parity gate FAIL (not eligible to approve deployment).**
GitHub main SHA: 1d988866dfcd9a1a97196b5fa26bbc989110f3cb.
GitHub main source blob SHA for supabase/functions/line-webhook/index.ts: 0f04bd67667bf12a4d00c6b3cf2cd1d547939eca.
Production line-webhook was observed ACTIVE v1427; retrieved actual deployed index.ts. Computed its Git-compatible SHA-1 over `blob <UTF8-byte-count>\\0<UTF8 source bytes>`:
`d89d27d9304ebee793c72bb2379851a4f0a6e234` (UTF-8 bytes: 1,953,669).
These two source blobs **do not match**. This is a real deployment drift, not a visual file-reading glitch. Versions were changing during audit (v1419→v1427). Therefore **never deploy/merge old webhook main source over Production**. A fresh Production source reconciliation, integration compile/regression and parity readback are mandatory before runtime change.

**Phase 2 contract drafted but behavioral acceptance NOT achieved.** Available: scenario-field-contract.md, central-six-category-permission-contract.md, provider-binding-acceptance.md, appointment-db-constraints.md, candidate-commit-source-audit.md, tests/*.sql.
Key architectural rules: existing six-category family/person permission model authoritative; release gate only for staging. Backend verified LINE identity and user-person resolution. Canonical appointments with atomic child writes; staged private documents; provider binding validation; idempotent same-request readback; Walk-in unknown-time uses null appointment_at and planned_visit_date. Existing base candidate commit unconditionally requires appointment_at, a verified blocker that needs an isolated test fix. Historical date without time still unresolved.

## Gate acceptance matrix
| Requirement | Status | Evidence or needed completion |
|---|---|---|
| Read Production schema, permissions and functions | PASS (scope sampled) | Existing SQL audits |
| Verify GitHub main head and PR head | PASS | Main 1d988..., PR #12 |
| Confirm deployed runtime matches repository candidate | FAIL | Git blob SHA-1 mismatch above |
| Auth boundary permissions and release flag | PASS metadata | 10/10 and gate false |
| Full end-to-end LINE identity trust chain | NOT_RUN | inspect current router and signed token validation |
| Non-destructive complete field scenario mapping | DRAFT | scenario-field-contract.md; historical time unresolved |
| Transaction/idempotency acceptance | NOT_RUN | isolated concurrent tests required |
| Cross-family/doctor mismatch negative behavioral tests | NOT_RUN | run on synthetic isolated fixtures |
| Storage private upload and rollback | NOT_RUN | real provider storage acceptance |
| CI, regression and real-device UAT | NOT_RUN | do not claim coverage |

## Unblocking sequence (do not loop on documentation)
1. Capture stable deployed v1427 or later source, and reconcile live webhook into a safe isolated branch without losing production edits.
2. Create runnable isolated appointment validator and SQL integration fixture; include unknown-time, retrospective, idempotency, cross-family/provider negative cases and signed identity.
3. Turn scenario field contract into machine-checkable required/optional validation; record actual results.
4. Only after both audits/contract pass: start Phase 3 additive changes on reviewed branch; no schema or Production change before gates.
5. Retain original LINE behavior and release OFF. No user task until actual device UAT/owner approval.

Rollback of this commit: revert documentation in Draft PR #12. No Production modification occurred during this work.
