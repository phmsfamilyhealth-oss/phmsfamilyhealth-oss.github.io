# PHMS — Choice State C

Applies to all six categories: medication, appointments, health, family, emergency, help. Preserve each category's established accent color, not a single red across all categories.

- Selected: dark category accent fill and border; white title and secondary text. Maintain aria-pressed=true (or appropriate native selection semantics).
- Unselected: near-white surface, dark text, 2px solid category border.
- Disabled: neutral gray surface, border and text; actual disabled semantics.
- Section heading: pale category surface, no choice border. Not a button.
- Add/search/new: dashed border; not a selected state.
- Segmented simple/detail: preserve original borderless continuous control with dark/light states.
- Keep focus indicator visible, preserve keyboard navigation, and don't alter workflow/auth/data permissions. Validate contrast and test on mobile before release. Do not recolor destructive or emergency actions as normal choice controls.

Implemented in active medication and appointment HTML forms. Other categories and LINE Flex message UI require separate implementation when their selection surfaces are available; no production webhook change is implied.
