# PHMS Thai constrained calendar — appointment v2.4.90.76

Use the medication v2.4.38 end-date calendar visual pattern in appointment, with category brown. Full Thai weekday/month/Buddhist year, gray disabled dates, explicit close/cancel, clear and today, month/year navigation. Booked and walk-in permit Bangkok today or future; historical permits today or past, following existing checkDateRule. Calendar year range 1900–2200 matches the existing Thai formatter. Preserve ISO input, existing input/change events, draft, linked appointments, validation and authorization. Existing appointment history/reschedule count unchanged; same scenario date rule applies to rescheduled appointment dates. Time picker unchanged. No database or access changes. Browser visual testing pending.

# Medication v2.4.36 — compact selection and computed period summary

Keep three patient-adaptive initial dosage form options and a dashed additional-options button. After choosing a form, show only the selected item and the additional-options button in two columns. Expansion reveals the other master choices, never duplicates the primary items. A confirmed choice collapses the alternatives; cancellation preserves the old choice and existing units. Custom form remains editable and visible. Computed treatment duration summary is read-only, centered, category-tinted, with dominant total days, full Thai Buddhist start/end dates, divider and automatic-calculation label. Display only for valid period. No medical calculation, authentication, or appointment changes.

# PHMS Unified Rounded Header & Radius Standard — medication v2.4.34 / appointment v2.4.90.75

Use identical header hierarchy across categories: left identity column with page title and selected person directly below, right 82px column with 23px version pill and 27px visual font pill (44px touch target), mode switch full width below both columns. Short appointment heading: เพิ่มนัดหมาย. Radius tokens: main form 24px; top accent stripe 6px following clipped outer radius; mode 16px; section heading 12px; choice 14px; input 12px; disclosure 14px; version and font pills 999px. Same layout and geometry, category-specific colors. Elder-first large default and shared browser-local preference remain. Apply to remaining categories when migrated; not a claim they are already changed. Changes limited to presentation; keep patient identity, permissions, validation and medication logic intact.

## Prior guidance (superseded for header geometry)
# Elder-first typography preference — medication v2.4.33 / appointment v2.4.90.74

Supersedes mode-specific typography defaults. Both modes default large, independently of data-entry mode. A single explicit browser-local font preference is shared across both forms and modes, retained on reload. New key phms.ui.typography.v2 intentionally starts large once; previous per-mode v1 values are not migrated because they conflict with the new unified preference. Version badge and font control aligned in a fixed 88px right-hand column, equal-width visual pills with 8px radius and 4px visual gap; font control 28px visual height, 44px touch height. Large selected uses category dark fill and white text; normal uses pale fill, category text and border. No data, auth or clinical calculation changes.

## Earlier standards (historical where superseded)
# Compact typography control — medication v2.4.32 / appointment v2.4.90.73

Place the compact font toggle directly below the version badge in a fixed right-hand header column. Small visual pill (26px), actual touch target at least 44px high and wide. Large profile selected = category dark fill, white text; normal = pale fill, category text and light border. Reflect selection using aria-pressed; retain current-size label and existing preference rules. No changes to data or authentication. Other categories should adopt the same placement.

# PHMS Adaptive Typography Standard — medication v2.4.31 / appointment v2.4.90.72

Independent data-entry mode and visual font profile. Simple defaults large; detailed defaults normal. Header toggle has current-size label, 44px minimum target, accessible action label. Explicit preference stored per entry mode using shared origin-local key phms.ui.typography.v1, shared between medication and appointment; not tied to patient or stored in health data. Local browser only, no cross-device/account identity or sync. Changing size does not rerender or reset values. CSS tokens (large/normal): page title 26/22; section 24/18; label 20/16; controls 19/16; date 20/16; result 30/24; help 16/14; control height 56/48; date 64/52. Narrow screens may wrap or use 18px large controls. Preserve user zoom, category colors, semantic emoji, auth and existing functionality. Implemented in both pilot forms; other modules use as design standard, migration pending. Browser/iPhone visual validation pending.

## Prior standard
# PHMS Guided Form Standard — typography and semantic icon update v2.4.30

Applies as the shared design standard to all six PHMS categories. Implemented in medication pilot; other modules require separate migration and mobile verification. Use CSS px, allow user zoom/text scaling. Section headings 24–26px (750), field labels and subsection headings 20–22px (650–700), buttons and control values 19–20px, date values 20–22px, explanatory text at least 16px; primary computed number 28–32px and secondary date 20–22px. Narrow-screen layout may use 18px for paired labels or controls to avoid overflow, with wrapping rather than clipping. Minimum action target 44px. Maintain neutral readable text and category color C. Use a distinct semantic emoji for each distinct heading or field within one parent section, including the parent icon; repeat only in repeated rows of the same field, or across different parent sections. Option icons may repeat when representing the same semantic category; avoid decorative duplicates. Do not repeat optional labels; use red * for required fields. Computed duration summary only when valid, explicit total days and localized end date; separate from supply estimate, never imply automatic stop. No change to medical calculations or authentication in this typography release.

## Previous guidance (historical; superseded on typography, optional labels, and capacity labels)
# PHMS Guided Form Standard

Reference: Appointment v2.4.90.68+; Choice State C.

- Preserve category colors; apply consistent information hierarchy and wording.
- Use semantic emoji on main headings, labels and appropriate options; keep clinical units unchanged.
- Align paired controls in height, use 16px input font and prevent mobile overflow.
- Show up to four common options first when a longer list is appropriate; reveal all on demand and always retain a selected extra option.
- Optional labels use small muted (ถ้ามี). Do not invent or preselect medical units or medication frequency.
- Use native date/time input with empty-state prompt. Keep selection keyboard accessible.
- Accordion uses left disclosure arrow, icon/title, right-side มีข้อมูล only when content is present; review shows populated groups only.
- Photo upload uses dashed border and explicit capacity. Source references optional, multi-select, detail mode only.
- Keep authorization, medication data, existing draft workflow and clinical validation intact. No automatic treatment inference.

Implemented for medication v2.4.16. Future category forms should adopt this standard; not a claim of deployment or clinical usability validation.
