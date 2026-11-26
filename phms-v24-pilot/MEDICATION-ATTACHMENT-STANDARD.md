# v2.4.28 — stable two-column editor (supersedes v2.4.26 layout)

Keep all six categories in fixed master order in a two-column grid, whether empty or populated. Cards do not stretch to row height. Compact contain-fit thumbnails, no crop; tap any thumbnail to open a viewport-sized modal viewer with prominent close button, including review and saved demo. Closing returns to the form; no deletion action inside viewer. Keep existing category limits, per-image delete and add controls, review document layout, data schema, and privacy boundaries. Browser viewport excludes native OS/LINE chrome. No production changes.

# v2.4.26 presentation update

Display populated photo categories in full-width blocks, in master-category order; unpopulated categories follow in a compact two-column grid. Show each attached image separately with intrinsic aspect ratio (no crop), maximum preview height 380px, tap to enlarge, compact 44px delete action directly below. Show add action in the category header only while capacity remains; hide it at capacity rather than show a disabled full-count tile. No repeated count or optional hints. Review previews also single-column. Existing limits, category metadata, data and access boundaries unchanged.

# PHMS Medication Attachment Standard v2.4.23

Six optional categories in a 2-column / 3-row grid: appearance, packaging (primary: strip/bottle/tube), secondary_packaging (manufacturer carton), label, prescription, other. Existing packaging key remains backward compatible; old images are not inferred or automatically reclassified. New carton has 2/4 simple/detail limit. Total new attachments 12/26; existing images retained when switching modes. Hide persistent maximum counts and helper text; title/icon and ＋ เพิ่มรูป only on empty tiles. On reaching limit the button indicates full; upload errors still report remaining capacity. Preserve category-specific previews, delete, enlarged viewer, review grouping, compression and access boundaries.

## Previous version (historical)
# PHMS Medication Attachment Standard v2.4.22

Based on restored medication v2.4.20. Five categories: appearance (2/4), packaging (2/4), dispensing label (2/4), prescription (2/5), other (2/5), simple/detail mode limits. All optional. Two-column editor, other full width, typed previews and individual deletion. Review groups by category, label/prescription single column. Switching to simple never deletes attachments already added in detail. Large still images may be resized to 2600 px and JPEG quality .92 when smaller; originals otherwise retained in browser memory. Check legibility before saving. Legacy uncategorized attachments remain in other. JSON includes category and scopeHint; scopeHint is not an authorization or database relationship. Actual secure storage, per-person authorization, product/lot/dispense/document link tables and reuse of a prescription across medications remain pending. Do not expose patient labels or prescriptions as shared product images. No image-only medication identification. Demo only; no new production database writes.
