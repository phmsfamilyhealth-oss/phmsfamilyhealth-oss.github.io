# PHMS Family Overview — Locked Central UI Baseline V1

Status: **APPROVED / DESIGN FREEZE — Amendment A: Category Tile Separator Removal** (2026-10-26, Asia/Bangkok).
Scope: Family member directory cards and family navigation card. Applies uniformly to all members and households.

## Frozen visual contract
- Keep the current card width, overall height, visual hierarchy, header colors, profile image, person's name, relationship, ordinal position, age and date of birth.
- Preserve the three equal-width horizontal category tiles with their existing theme backgrounds, colors, corner radii and spacing.
- Tile labels are **💊 ยา**, **📅 นัด**, **🩺 สุขภาพ**. The short word **นัด** applies **only** to this tile: do not rename appointment screens, commands or the heading **📅 นัดถัดไป**.
- Each tile presents a category label on the first row (size `sm`, bold), a count on the second (size `xl`, bold), and **รายการ** on the third (size `xs`, normal). Vertical tile padding: 3px. Numeric values come from person-specific data. All tile text must remain legible with no ellipsis or clipping.
- Preserve the current birthday/age text, other structural separators and spacing, and empty-state message. **Exception (Amendment A): remove the separator directly above the three category-count tiles and the separator directly below them.** The three colored tile backgrounds already provide their own visual grouping. Do not remove separators between distinct information sections (for example between latest appointment and latest health). Keep the tiles, count typography, colors, labels and outer card/button styling unchanged. Use 8px separation after the tile row before the next content section, without adding a replacement line.
- Latest appointment: heading one line, appointment title one line, date and time one line. Preserve action routing to the correct person's record.
- Latest health: heading one line, summary one line (truncation in preview is allowed); the full detail must remain accessible through existing action.
- Preserve bottom **🔎 ดูข้อมูล** button's size, color theme, placement and operation; do not change authorization or visibility logic.
- Preserve family navigation's list, member order, controls, buttons and color styling.
- Keep current carousel alignment and the compact visual balance shown in the approved reference screenshot (2026-10-26 21:19 Asia/Bangkok).
- Target total card height no greater than **593 px** at the established reference viewport. Actual LINE rendering and older/smaller phone behavior must be separately verified; this document does not claim UAT.

## Amendment A implementation acceptance
- Scope is `personDirectoryBubble()` for every member card in all families, not the family navigation card or other category screens.
- Remove only the two `separator` elements immediately adjacent to the `categoryCounts.map(...)` horizontal category-tile row. No other separators may be changed by this amendment.
- Verify visually for an empty profile and a dense profile; counts 0 and 2+; long Thai text; different theme colors; small screen. Existing routing, permissions, typography and footer alignment must remain intact.
- **Governance update alone does not change the live LINE Flex layout.** Mark production implementation complete only after the source function has been updated, compiled, regression-tested and deployed.

## Amendment B — Empty-state spacing (2026-10-26)
- For **every family and every person**, when medication, appointment and health counts are all zero and no previews exist, display `ยังไม่มีข้อมูลที่บันทึก` at **8px top margin** following the colored category count tiles.
- Implement in the shared `personDirectoryBubble()` empty-state text element: change `margin:'xs'` to `margin:'8px'` only. Retain existing background, tile height, text color, footer, preview dividers, and permissions.
- Do not add separators or create duplicate margin on the parent container. Verify rendered LINE Flex layout for both empty and populated family members.
- Governance does not establish Production deployment; verify the active Supabase `line-webhook` code separately.

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
