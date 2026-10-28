# Phase 1 — 28 October 2026 live v1431 four-file parity decision

Scope: PHMS v2.4 Phase 1, PR #12. Production inspected read-only; no deploy or patient mutation.

## Direct comparison with active Supabase function
Project `buxvdlfrikpwdscdlcfd`, `line-webhook` v1431, four deployed files.

| Runtime module | GitHub main contents | Decision |
|---|---|---|
| `person-overview-px-layout.ts` | Exact UTF-8 source equality, length 3854 | PASS |
| `smart-medication.ts` | Exact UTF-8 source equality, length 13390 | PASS |
| `smart-medication-runtime.ts` | Exact UTF-8 source equality, length 12468 | PASS |
| `index.ts` | Production blob `1ff78d322d26861d8bede715f1169e278290b6b8` vs main blob `0f04bd67667bf12a4d00c6b3cf2cd1d547939eca` (previous direct verified v1431 measurement) | BLOCKED / DIFFERENT |

This narrows the source divergence to the main LINE router, without attributing an unproven cause or overwriting the deployed runtime.

## New automated barrier
`scripts/verify-live-webhook-bundle.mjs` checks the exported runtime index AND all three companion modules against an independently captured SHA-256 manifest, exact single legacy add-appointment route, and an explicit permit before recognizing a new v2.4 route. Any missing/stale module fails closed. Tests: `tests/verify-live-webhook-bundle.test.mjs`.

## Phase 1 acceptance verdict
- Inventory, baseline RLS/grants/DB structure, and **3/4 current module parity: verified**.
- **Full Phase 1 release parity: NOT PASSED**. `index.ts` mismatch remains; the v2.4 LIFF route has not been safely inserted or integration-tested on the live-source snapshot.
- The full original Master Implementation Directive was not found as a separately named file; project recorded acceptance used here.
- Before any write: take immutable private v1431 source snapshot (never commit possible private runtime secrets to public repo), reconcile only `index.ts`, run build/regression against full exported bundle, verify readback and rollback, and preserve disabled owner-only flag.
- No Phase 1 claims that LINE→LIFF works in Production.

**Production changed: NO.**
