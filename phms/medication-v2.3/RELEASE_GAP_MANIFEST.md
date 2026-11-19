# PHMS Medication v2.3 — verified release gate (2026-10-22)
Production evidence: Supabase line-webhook v1283 (ACTIVE); NOT redeployed by this branch.
Source: public.phms_med_ui_screen_registry, 16 rows.
This is a gap manifest, NOT a claim that all UI and actions work.

| Screen | Current entry route | Current implementation |
|---|---|---|
| overview | phms_med_hub | implemented |
| list | phms_med_read list | implemented |
| detail | med.detail | gap; backend_rpc not_verified |
| schedule | phms_med_read schedule | implemented_partial_weekly |
| round | phms_emar_today | implemented_partial |
| emar | phms_emar_detail | implemented_partial_history |
| intake | phms_med_intake_wizard | implemented_partial_back_step |
| revision | med.regimen.revise | gap; backend_rpc not_verified |
| inventory | phms_inventory_summary | implemented_partial_lot |
| container | med.container.lifecycle | gap_route |
| preparation | phms_preparation_list | implemented_partial |
| pricing | phms_med_read expense | implemented_partial_return |
| safety | phms_med_read allergies | implemented_partial |
| prn | phms_med_read prn | implemented_partial_conditional |
| report_daily | phms_med_read history | implemented_partial_report |
| emergency | phms_med_read emergency | implemented |

## Shipping conditions
1. Implement each missing verified backend API and handler; route registry metadata alone does not create runtime handlers.
2. Authorize actual LINE user, family, person and action on each postback; use opaque existing token RPC.
3. Render every state as Flex and verify 44px rendered back-button box, no duplicates, last action; preserve carousel exception.
4. Exercise all screens, states, pagination, back and cancel, multi-family/role, duplicate taps and persistence.
5. Require actual LINE app interactions, recovery validation and regression verification before production deployment.
6. Do not merge this branch or deploy v1283 replacement without passing every gate above.

Known CI: https://github.com/phmsfamilyhealth-oss/phmsfamilyhealth-oss.github.io/actions/runs/39741353161 confirms 27 navigation contract tests only.
