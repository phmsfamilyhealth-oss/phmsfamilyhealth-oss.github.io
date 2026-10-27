# PHMS v2.4 — Phase 1–2 acceptance recheck (28 October 2026, Asia/Bangkok)

## Source of truth and scope
- PR #12 HEAD before this evidence commit: `6a91afb95cbca9514d726073bb4f2a887de5b89c` (draft); current GitHub main HEAD `1d988866dfcd9a1a97196b5fa26bbc989110f3cb`.
- Reviewed: `phase-1-2-baseline.md`, `phase-1-2-design-handoff.md`, `phase-1-2-development-gate.md`, `phase1-2-gate-decision.md`, and `PRODUCTION_WRITE_GATE_2026-10-27.md`.
- A separate file explicitly titled Master Implementation Directive was **not identified** in the repository tree; original full acceptance cannot be claimed independently of the recorded criteria.

## Fresh read-only production verification
Executed exact committed SQL files against project `buxvdlfrikpwdscdlcfd`; observed:
1. `tests/baseline_readonly.sql` — **14/14 PASS**, including canonical relation existence, RLS-on flags, release disabled, empty allowlist and browser-denied draft execute privileges.
2. `tests/auth_boundary_readonly.sql` — **10/10 PASS**, including caller grant boundaries, release disabled and no allowlisted actors.
3. `tests/provider_relations_readonly.sql` — **8/8 PASS**, including organization/unit/clinician and appointment foreign keys and soft delete columns.
**Total 32/32 structural/privilege assertions PASS.** These are structural checks, *not* cross-family behavioral tests.
- Dedicated v2.4 commit routine still absent; global release false; 0 permitted pilot actors.
- `line-webhook` active Production version **1431**; isolated `phms-v24-appointment-confirm` remains v1 fail-closed. Previous review proved main/live index source mismatch. No fresh source equivalence proof, so source-parity release gate remains FAIL.
- Last preceding PR HEAD CI: Contract Regression SUCCESS run 40545204521 and Medication release gates SUCCESS run 40545204499.

## Phase decision: distinct acceptance scopes
| Gate | Verdict | Reason |
|---|---|---|
| Phase 1 inventory + database/RLS baseline | **PASS** | Live read-only assertions and documented schema/function inventory |
| Phase 1 development handoff | **PASS** | Previously approved design handoff; isolated implementation safely underway |
| Phase 1 full Production source parity / release acceptance | **BLOCKED** | Deployed LINE runtime differs from repository base; current source parity and route behavioral proof not established |
| Phase 2 architecture/scenario/permission design baseline for isolated work | **PASS** | Existing reviewed scenario, six-category permission, provider and constraint contracts; green PR CI |
| Phase 2 full behavior acceptance | **BLOCKED** | Signed LINE identity -> scoped person negative cases, historic date-only, provider multi-affiliation, private upload, atomic readback and full feature handling not all proven |

**Therefore Phase 1–2 design/development acceptance has passed, but Phase 1–2 FULL acceptance has NOT passed. Do not mark both phases unconditionally complete or use this report to authorize production rollout.**

## Exact remaining acceptance tasks
1. Fetch live `line-webhook` v1431 and repository main index; compare full blob SHA and route paths, preserve Production changes; establish non-destructive integration parity before future merge/deploy.
2. Execute scoped identity and central permission behavior tests with synthetic independent family subjects: valid owner, wrong family, revoked permission, missing identity, cross-family document access.
3. Demonstrate scenario/date-only and clinician-organization contract behavior for all mandatory flows; do not pretend unsupported historical/reschedule/upload flows are accepted.
4. Verify complete canonical atomic persistence plus transaction failure rollback and replay against a fixture matching live constraints; then LINE real-device UAT/owner acceptance before COMPLETE.

## Production change/rollback
Read-only SQL only. **No Production writes, migrations, RLS edits, settings or deployments.** Roll back evidence-only GitHub change by reverting this commit. Branch remains PR #12 draft.
