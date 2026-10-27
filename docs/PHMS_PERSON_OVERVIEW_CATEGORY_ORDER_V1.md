# PHMS Person Overview — Central Category Card Order V1

Status: APPROVED, 2026-10-27 (Asia/Bangkok)

## Scope
Applies to every member in every household wherever the personal overview carousel is rendered by the shared `line-webhook` code. This is distinct from the family directory card and other submenus.

## Mandatory display order
0. 👤 ภาพรวมบุคคล (always first)
1. 📅 นัดหมาย
2. 💊 ยา
3. 🩺 สุขภาพ
4. 💰 ค่าใช้จ่าย
5. 📄 เอกสาร

Category cards are displayed only when view permissions permit, while the relative order of visible cards stays fixed. Recalculate carousel page indicators after sorting. Do not change data, permissions, theme colors, fonts, padding, card heights, summaries, buttons, or navigation actions.

## Single source of truth
Shared `person overview` carousel assembly in `supabase/functions/line-webhook/index.ts`, immediately before `PHMS_PERSON_DASHBOARD_CAROUSEL_COUNTER_V1`, marked `PHMS_PERSON_OVERVIEW_CATEGORY_ORDER_CENTRAL_V1`. Sort after construction and before page numbers are assigned. Do not duplicate order rules per family or per user.

## Verification
Check 5-category permission, partial-access permission, zero-data and populated cards, page numbering, action destinations, LINE rendering. Production source deployment reported as line-webhook v1417 ACTIVE; real-device visual UAT is not yet confirmed.
