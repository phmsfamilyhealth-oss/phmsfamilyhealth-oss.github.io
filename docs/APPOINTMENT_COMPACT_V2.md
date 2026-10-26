# PHMS — Appointment Compact v2 (Production Contract)

Status: **SPECIFICATION ONLY — not enabled in runtime until renderer/router integration and testing.**

Scope: **Mandatory on the Personal Overview page (หน้าภาพรวมบุคคล) for EVERY member of EVERY family** and on any appointment summary card it renders. Does not alter Medication, Health, Documents or Expenses cards.

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

## Mandatory Personal Overview routing — all families and members

- Entry points: family overview → select any member → **หน้าภาพรวมบุคคล** → appointment card. This route **MUST** render `appointment-compact-v2` unconditionally for the appointment-card category.
- Apply to **every** `family_id` and `member_id`, including newly created families and newly added members. Never condition on member names, specific IDs, roles, demo data, household type or client device.
- Centralize the appointment-card renderer selection in the shared Personal Overview card dispatcher: `category === 'appointment'` → `appointment-compact-v2`. All other categories must continue using their original renderer. Do not create member-specific copies.
- The V1 appointment card may remain in source for emergency rollback, **but must not be routed to** by the Personal Overview production path once V2 is activated.
- If the dashboard contains both next-appointment summary and an appointment list, preserve the **Next Appointment/Last Updated/Upper Divider** block exactly; modify only the compact appointment card content governed by the table above.
- Acceptance criteria: for any pair `(family_id, member_id)` with permission to view the Personal Overview, the rendered appointment-card `layoutVersion` must equal `appointment-compact-v2`. Verify at least two separate families, multiple members per family and a newly added member, plus 0/1/3/6/>6 appointments. Cross-category snapshots must be unchanged.
- Production enablement is **blocked until the actual router/renderer change is merged, tests pass and deployed output confirms V2**. A documentation change alone cannot enforce runtime routing.

Implementation contracts:
1. Renderer/router must explicitly select `appointment-compact-v2` for **every family member**, not a per-member hardcode. Keep V1 available for rollback.
2. Do not touch the Next appointment / Last updated / upper divider block or shared layout tokens for other card categories.
3. Title clamp should hide overflow after two lines; retain original full text in the underlying data.
4. For zero additional appointments, preserve existing conditional visibility (do not fabricate a "ดูอีก 0 รายการ" label).
5. Preserve existing theme colors, accessible tap targets and date localization.
6. Regression checks: 0, 1, 3, 6, >6 appointments; missing doctor/hospital; Thai long title; narrow mobile; all family members; neighboring card snapshots.
7. Rollout gate: verify generated LINE Flex messages or actual renderer, automated regression tests, production router/configuration, and rollback.

**Do not call the spec-only commit a Production deploy.**
