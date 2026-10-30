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

## Direct live webhook source parity measurement (28 October 2026)
- Retrieved ACTIVE Supabase `line-webhook` **v1431** `index.ts` (1,503,411 UTF-16 code units; 1,953,083 UTF-8 bytes).
- Computed Git blob SHA-1 from live file bytes using `sha1('blob '+utf8_byte_length+'\\0'+utf8_content)` (the `\\0` in this text describes the single zero byte used as separator): **`1ff78d322d26861d8bede715f1169e278290b6b8`**.
- GitHub `main` `supabase/functions/line-webhook/index.ts` blob SHA from Contents API: **`0f04bd67667bf12a4d00c6b3cf2cd1d547939eca`**.
- **Result: FAIL (different source blobs)**. This is fresh direct v1431 evidence, not merely a stale v1427 comparison. Does not imply runtime behavior is unsafe; means `main` must not replace deployed production index without route-level reconciliation and preserving newer changes.
- Independently executed additional nine read-only safety assertions: **9/9 PASS**; committed as `tests/phase1-2-production-gates-readonly.sql`. 32 prior structural/permission/FK checks also passed (14+10+8), no Production mutation.
- The LINE/LIFF → backend behavior has not been run in real devices; Phase 1 source parity and Phase 2 full behavioral acceptance remain BLOCKED. This document does not waive either gate.

## Production LINE router functional trace — v1431
- Inspected live deployed `line-webhook` v1431 index.ts (1,503,411 JS string code units) read-only, no patient data loaded.
- Exact string counts in entrypoint: `phms-v24` **0**, `LIFF` **0**, lowercase `liff` **0**, `appointment_wizard` **4**, `＋ เพิ่มนัด` **1**. Exact-string absence does **not** prove no indirect downstream LIFF routing, but no direct v2.4 integration is evidenced in this file.
- A `＋ เพิ่มนัด` postback with `data:'เพิ่มนัด'` remains in the live person overview; the live webhook also calls `phms_line_save_appointment_wizard_draft` and replies `เก็บร่างนัดไว้แล้ว` (draft only, not canonical appointment persisted).
- Phase 1 integration-blocker classification: **specific route-level LINE → new LIFF v2.4 handoff not established**; cannot pass end-to-end acceptance until a verified conditional branch routes the owner-only test account, preserves old routing for all others and produces scoped persisted readback. Do not replace the 1431 webhook with stale main code.
- Follow-up acceptance: inspect concrete handlers for the `เพิ่มนัด` postback and draft RPC (not just grep); implement route in isolated branch; regression test both allowed owner and all other families; reconcile deployed v1431 source before controlled rollout.

## Exact LINE `เพิ่มนัด` runtime route confirmed (v1431)
Read the actual v1431 `line-webhook` index.ts rather than relying on a substring count:
- Person overview mutates postback `data:'เพิ่มนัด'` to `data:'เพิ่มนัด จากภาพรวม'` for navigation origin tracking.
- The production command handler contains an exact branch: `if(c==='เพิ่มนัด'||c==='เพิ่มนัด จากภาพรวม')` which writes LINE conversation state `crud_add_appointment` with `person_confirmed:true` and `origin` then calls `replyAppointmentTypePicker(...)` and `continue`.
- This existing route therefore **starts the legacy LINE appointment-type picker**, not the new v2.4 LIFF form. A separate draft-save route calls `phms_line_save_appointment_wizard_draft` and explicitly replies that no actual appointment has been created.
- Precise Phase 1 gap is missing controlled owner-only handoff from this command to v2.4 LIFF, not merely generic source file drift. Do not replace the deployed webhook with an old `main` copy; reconcile v1431 and add conditional routing with negative tests for all other users.
- Read-only inspection only, no new release flag or production writes.
