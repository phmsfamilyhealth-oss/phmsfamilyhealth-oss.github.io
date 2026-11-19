# Medication v2.3 — Screen registry
Live public.phms_med_ui_screen_registry contains 16 keys:
overview (implemented), list (implemented), detail (gap), schedule (implemented_partial_weekly), round (implemented_partial), emar (implemented_partial_history), intake (implemented_partial_back_step), revision (gap), inventory (implemented_partial_lot), container (gap_route), preparation (implemented_partial), pricing (implemented_partial_return), safety (implemented_partial), prn (implemented_partial_conditional), report_daily (implemented_partial_report), emergency (implemented).
Each screen must implement HAS_DATA/EMPTY/PROCESSING/ERROR/PENDING_VERIFICATION/PERMISSION_DENIED as applicable, using Flex Cards.
Use real backend responses, scoped family/person authorization, category theme, 44px back/overflow, carousel rules and pagination without clinical truncation.
Not all 16 implementations have passed live UAT. Supabase phms_med_ui_uat_cases: 128 NOT_RUN as of 2026-10-22.
