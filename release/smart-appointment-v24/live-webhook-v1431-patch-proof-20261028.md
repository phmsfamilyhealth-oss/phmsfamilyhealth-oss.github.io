# PHMS v2.4 — Live webhook v1431 narrow integration proof (2026-10-28)

## Checked current sources
- Supabase project: `buxvdlfrikpwdscdlcfd`, Edge function: `line-webhook`, deployed version: **1431**.
- Actual live `index.ts`: **1,503,411 JavaScript string code units**, not a GitHub checkout. Related live modules: `person-overview-px-layout.ts`, `smart-medication.ts`, `smart-medication-runtime.ts`.
- Live exact route `if(c==='เพิ่มนัด'||c==='เพิ่มนัด จากภาพรวม')` occurs **once**, character offset **1,497,351**. It directly enters the legacy `crud_add_appointment` state and `replyAppointmentTypePicker`.
- GitHub main source blob previously observed: `0f04bd67667bf12a4d00c6b3cf2cd1d547939eca`. The tool reports no content for this large GitHub source; matching source equality has NOT been demonstrated.

## Verified against full live source in memory
- Inserted a harmless 53-character candidate hook marker immediately before the exact live add-appointment handler, **not deployed**.
- Removing only that marker yielded the precise original live source string: **byte-for-byte restoration in memory PASS**.
- Unique route anchor: **1 occurrence**. No other route, medication handler, table or patient data was altered during this inspection.
- This proves the narrow anchor can be located on v1431; it **does not** prove any LIFF integration is compiled, wired, safe or deployed.

## Mandatory remaining release gate
1. Capture immutable full v1431 live-source backup and SHA-256 outside the repository, then validate a real minimally scoped candidate via `scripts/prepare-live-webhook-patch.mjs`. Never substitute stale GitHub main.
2. Supply a reviewed implementation for a verified LINE user, server-held active family person, owner allowlist, central create/view rights, and exact LIFF URL; retain the unchanged legacy branch on any denied/failed launch.
3. Confirm all four live modules are included and source-verified; compile and regress entire webhook against live backup before controlled deployment and rollback.
4. Dedicated v2.4 commit RPC and historical unknown-time migration remain absent in Production. Do not activate owner pilot until they are approved, tested against live-compatible schema, backed up, and the disabled release gate is explicitly restricted to authorized actor IDs.
5. After isolated acceptance, perform owner-device LINE → LIFF → review → Supabase atomic insert/readback → LINE testing and owner signoff.

**Verdict:** narrow source anchor inspection PASS; Phase 1 full source-parity/deploy gate remains **BLOCKED**. Production unchanged.
