# Medication v2.3 — Backend API contract (draft, unverified signatures)
Live Supabase has 73 RPCs with name prefix phms_med_ (inventory on 2026-10-22).
Known read contract candidates: phms_med_v23_line_dashboard, phms_med_v23_line_read_page, phms_med_v23_line_today, phms_med_v23_line_inventory_summary, phms_med_v23_line_preparation_list.
Known authenticated context RPCs: phms_med_action_issue, phms_med_action_resolve, phms_med_action_claim, phms_med_action_execute, phms_med_action_finalize.
Known writer candidates: phms_med_v23_line_record, phms_med_v23_line_container_event, phms_med_intake_wizard_save.
Never call a candidate solely by name: verify SQL signature, grants, RLS, person/family authorization, idempotency, clinical gates and actual output before production routing.
Errors must fail closed and render a Flex ERROR/PERMISSION_DENIED/PENDING_VERIFICATION state as appropriate.
Required workflow: read -> scoped action token -> server authorization -> transactional write -> persisted read-back -> audit evidence -> Flex result.
No verified API/handler for detail and revision registry slots in the last audited registry.
