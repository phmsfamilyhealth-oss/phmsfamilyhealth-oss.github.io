# PHMS — Appointment Compact v2 (Production Contract)

Status: **SPECIFICATION ONLY — not enabled in runtime until renderer/router integration and testing.**

Scope: All family-member appointment summary cards. Does not alter Medication, Health, Documents or Expenses cards.

| Component | Binding requirement |
| --- | --- |
| Next appointment / Last updated / Upper divider | **Immutable; preserve existing markup, styling and spacing** |
| Card header / appointment count / 3/6 indicator | **Preserve current implementation** |
| 📌 Appointment subject | Clamp to **2 lines maximum** |
| Space after upper divider to first appointment content | **8px** |
| Date / time / hospital / doctor | Preserve existing formats, use **4–6px** vertical row gap |
| Space below doctor line | **6px** |
| 📋 ดูอีก X รายการ | **sm** text size, **normal (400)** font weight, left aligned, borderless; positioned above action buttons, outside the footer |
| Space between 'ดูอีก X รายการ' and buttons | **7–8px** |
| View all appointments / Add appointment buttons | **Unchanged in size, color, placement and behavior** |

Implementation contracts:
1. Renderer/router must explicitly select `appointment-compact-v2` for **every family member**, not a per-member hardcode. Keep V1 available for rollback.
2. Do not touch the Next appointment / Last updated / upper divider block or shared layout tokens for other card categories.
3. Title clamp should hide overflow after two lines; retain original full text in the underlying data.
4. For zero additional appointments, preserve existing conditional visibility (do not fabricate a "ดูอีก 0 รายการ" label).
5. Preserve existing theme colors, accessible tap targets and date localization.
6. Regression checks: 0, 1, 3, 6, >6 appointments; missing doctor/hospital; Thai long title; narrow mobile; all family members; neighboring card snapshots.
7. Rollout gate: verify generated LINE Flex messages or actual renderer, automated regression tests, production router/configuration, and rollback.

**Do not call the spec-only commit a Production deploy.**
