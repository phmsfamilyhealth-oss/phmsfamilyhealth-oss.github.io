# PHMS v2.4 — Decision: finish analysis, begin isolated implementation
Date: 2026-10-27. Owner instruction: retire OLD appointment wizard implementation plan, use the reviewed contract for NEW Smart Appointment. Preserve all canonical appointments and existing LINE functionality.

## Decision
Phase 1 discovery/audit deliverables: **CLOSED for design handoff**, *not Production parity/release acceptance*. Source parity remains a separate deployment gate.
Phase 2 field/scenario specification: **BASELINED for implementation** based on scenario-field-contract.md, central-six-category-permission-contract.md, provider-binding-acceptance.md and validated isolated scenario tests (14/14). Remaining behavioral tests become implementation acceptance, NOT reasons to postpone starting isolated UI/backend work.
This is a controlled adjustment to project sequencing; no earlier hard safety gate is waived for deployment, database mutation, merging or public enablement.

## Architecture
- Implement replacement Smart Appointment in isolated modules/branch behind existing OFF rollout gate, do not change production webhook or legacy LINE routing during development.
- Keep current live LINE appointment functions until replacement passes end-to-end tests, controlled rollout and owner signoff; retire only the superseded DRAFT wizard approach, not live features or patient data.
- Use central six-category permission model for family/person access; rollout allowlist only deployment gating.
- Canonical appointments, authorized patient scope, atomic save + readback, unknown-time walk-in, retrospective visits, reschedule, files, provider relationships, checklist all mandatory.
- Reconcile current deployed webhook source before ANY integration merge or deployment; preserve unrelated production changes.
- Real-device LINE UAT and owner acceptance mandatory before COMPLETE.

## Evidence baseline
GitHub main 1d988866dfcd9a1a97196b5fa26bbc989110f3cb, PR #12 head a317409be23f8ff2bf2c9cb0a3a6d3613a357abc; Supabase line-webhook ACTIVE v1431.
Prior source comparison showed mismatch; it does not prevent isolated frontend development.
Automated SQL schema/grant checks 37/37, central permission logic 8/8, isolated scenario validator 14/14 (not live UAT). Feature gate remains OFF.

## New execution rule
No further repetitive audit-only commits unless a concrete blocker is discovered. Next commit must add actual form implementation, isolated integration or executable test; keep PR draft until safe.
Production was not changed by this decision.
