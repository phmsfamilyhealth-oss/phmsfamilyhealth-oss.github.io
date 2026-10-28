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

## Phase 1 engineering reconciliation and guarded LIFF route — 2026-10-28
- **SOURCE RECONCILIATION RESOLVED ON PR BRANCH:** GitHub commit `cc0ed7ca81493b73cfc281138a3493728bf5d7d9` replaced only the PR branch's `supabase/functions/line-webhook/index.ts` with exact deployed v1431 source. GitHub returned blob SHA `1ff78d322d26861d8bede715f1169e278290b6b8`, matching the previously measured Production v1431 blob. Three companion modules were independently confirmed byte-identical. **Production was not deployed/modified.**
- **OWNER-ONLY HANDOFF CANDIDATE:** Commit `4b9760ce56b06e546f86ca195b619388e6587bb7` inserts guarded LIFF route at exact existing `เพิ่มนัด` handler. Existing LINE webhook signature, `phms_line_appointment_wizard_enabled`, and `phms_resolve_line_command_context(appointments,create)` with verified user/family-person/member gate are required. Fixed HTTPS `liff.line.me` URL must be set by server-only `PHMS_V24_OWNER_LIFF_URL`. Any missing configuration, identity or authorization returns original LINE picker; denied users cannot access LIFF. No new unrestricted endpoint or flag.
- **REAL LINE ROUTER CI:** Commit `3ba8c7a05d8b0128cf95378d07315abc5c48c2ab` adds Deno typecheck of actual reconciled webhook to CI and triggers on future router changes. GitHub Actions run `40655037969` PHMS Contract Regression **SUCCESS**, both `scenario-validation` (including Deno typecheck) and `postgres-atomic-smoke` **SUCCESS**; Medication release gates run `40655037955` **SUCCESS**.
- **RELEASE ACCEPTANCE STILL OPEN:** The candidate route is in Draft PR #12, NOT live; `PHMS_V24_OWNER_LIFF_URL` is not evidenced configured, dedicated appointment commit RPC is absent, owner allowlist has 0 entries, no real-device UAT. Never represent these isolated green checks as LINE→LIFF successful in Production. Verify feature-specific release gates and signed actor ownership prior to any pilot; storage/reschedule/backend checks belong to later phases. Re-compare current Production version before any controlled rollout and preserve rollback to v1431.
- **Phase 1 decision:** codebase parity/reconciliation and compile **PASS on isolated branch**. Deployment integration acceptance **NOT PASSED** until approved owner-only controlled release and actual LINE routing verified. This distinguishes resolved code drift from remaining release gating.
