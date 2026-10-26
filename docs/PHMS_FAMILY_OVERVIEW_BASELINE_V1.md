# PHMS Family Overview — Locked Central UI Baseline V1

Status: **APPROVED / DESIGN FREEZE** (2026-10-26, Asia/Bangkok).
Scope: Family member directory cards and family navigation card. Applies uniformly to all members and households.

## Frozen visual contract
- Keep the current card width, overall height, visual hierarchy, header colors, profile image, person's name, relationship, ordinal position, age and date of birth.
- Preserve the three equal-width horizontal category tiles with their existing theme backgrounds, colors, corner radii and spacing.
- Tile labels are **💊 ยา**, **📅 นัด**, **🩺 สุขภาพ**. The short word **นัด** applies **only** to this tile: do not rename appointment screens, commands or the heading **📅 นัดถัดไป**.
- Each tile presents a category label on the first row (size `sm`, bold), a count on the second (size `xl`, bold), and **รายการ** on the third (size `xs`, normal). Vertical tile padding: 3px. Numeric values come from person-specific data. All tile text must remain legible with no ellipsis or clipping.
- Preserve the current birthday/age text, separators and spacing, and empty-state message.
- Latest appointment: heading one line, appointment title one line, date and time one line. Preserve action routing to the correct person's record.
- Latest health: heading one line, summary one line (truncation in preview is allowed); the full detail must remain accessible through existing action.
- Preserve bottom **🔎 ดูข้อมูล** button's size, color theme, placement and operation; do not change authorization or visibility logic.
- Preserve family navigation's list, member order, controls, buttons and color styling.
- Keep current carousel alignment and the compact visual balance shown in the approved reference screenshot (2026-10-26 21:19 Asia/Bangkok).
- Target total card height no greater than **593 px** at the established reference viewport. Actual LINE rendering and older/smaller phone behavior must be separately verified; this document does not claim UAT.

## Change control (mandatory)
1. Treat the approved visual baseline as frozen. No incidental global text-size, layout, button, padding or color changes to this screen.
2. Any future edit affecting this screen requires explicit owner approval, a before/after rendered screenshot, and regression review of dense and empty profiles.
3. Regression scenarios: no records; medication/appointment/health counts including 0, 1, and multi-digit; both appointment and health summaries present; long Thai names and long appointment descriptions; narrow mobile viewport; different member themes; permission-restricted person.
4. Verify labels never truncate, footer remains aligned, health and appointment actions resolve the selected person, no data leaks across member permissions, and preview text stays within the limit.
5. Failing any condition blocks a future *layout-changing* rollout; unrelated business logic and safety fixes may proceed provided this visual contract remains intact.

## Implementation mapping
- Primary source function: `personDirectoryBubble()` in `supabase/functions/line-webhook/index.ts`.
- Production reference at freeze: `line-webhook` v1384 (reported ACTIVE), where the tile label was confirmed as **📅 นัด**. Version may advance independently.
- This file records the approved central governance rule; it does not programmatically prevent future commits or substitute for automated visual regression tests.
