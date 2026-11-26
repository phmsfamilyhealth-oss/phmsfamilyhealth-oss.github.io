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
