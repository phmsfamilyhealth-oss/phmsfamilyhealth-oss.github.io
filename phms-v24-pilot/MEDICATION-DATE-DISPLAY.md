# v2.4.35 — full-width treatment dates and read-only computed summary

Treatment start/end date controls and review values use full Thai weekday, month and four-digit Buddhist year (e.g. จันทร์ 23 พฤศจิกายน 2569). Compact date fields elsewhere retain abbreviated months and two-digit year to avoid overflow. Allow wrapping rather than shrinking; keep native date picker and ISO values. Valid calculated treatment duration summary is centered, tinted with category color, and explicitly labeled automatic calculation. It remains non-editable and separate from days-supply estimate. No changes to clinical calculations or access controls.

# PHMS Medication date and optional label display v2.4.25

Use red asterisks for mandatory fields, without repeated optional labels. Render date-only fields using Thai weekday, day, abbreviated month and two-digit Buddhist year (e.g. พุธ 16 ธ.ค. 69). Use exact calendar weekday. Keep Gregorian ISO YYYY-MM-DD in form state, native date picker and data payload; localize review date fields too. No automatic conversion of stored values. Period fields use short labels and equal-sized native date controls. Show reversed date range inline; final validation remains. No production or authentication changes.
