# Medication v2.3 — Navigation and context
Reference module: navigation-registry.mjs (33 logical routes) and flex-navigation-audit.mjs.
Default: medication overview -> person overview; list -> medication overview; detail -> list or verified return; round -> daily schedule; intake review -> wizard step; expense from medication -> source medication detail; emergency -> person overview.
Always use server-side opaque action context bound to LINE user/person/family and permission, with expiry/replay protection. Never trust IDs passed in LINE postback.
Existing PHMS Back standard: PHMS_BACK_BUTTON_STANDARD_V3, height 44px; theme, type sizes and carousel/overflow inherited, not recreated.
Back last, unique, with prior approved carousel-first-card exception. A registry entry is NOT a verified runtime handler. Missing med.detail, med.regimen.revise, med.container.lifecycle in last audited webhook source must be implemented and tested before exposing buttons.
