# PHMS medication navigation integration (NOT DEPLOYED)
Status: code-only feature branch; NOT a live webhook integration.

Existing production service: Supabase Edge Function `line-webhook`. Do not replace that large function with this module.

Integration required:
1. Read deployed PHMS category theme, font/header, overflow, carousel and `PHMS_BACK_BUTTON_STANDARD_V3` (44px) at render time.
2. Resolve the current LINE account, family membership, target person and action permissions SERVER-SIDE on every interaction.
3. Issue opaque, short-lived action tokens via existing `phms_med_action_issue` and validate with existing resolve/claim/execute/finalize RPCs. Never include person_id, family_id, names or PHI in LINE postback data.
4. Store return route with verified authorization scope server-side; revalidate whenever used. Discard expired or cross-person/cross-family contexts.
5. Router must map only implemented handlers (not registry metadata) and deny unverified destinations. Render all six defined UI states as Flex Cards.
6. Confirmation performs an idempotent database transaction, not simply a navigation; render result only after committed RPC outcome.
7. Back button must appear once, last in the button group, except existing carousel first-card rule. Keep existing overflow rules and font sizes.
8. Test all 33 routes, multiple users/families, role changes, double click and LINE postback replay using real LINE test accounts before any production switch.
9. Run recovery/rollback dry-run and ensure current LINE and non-medication routes still work.
10. Do not deploy until UAT registry records evidence-backed PASS for relevant cases.

Known blockers: No non-billable Supabase staging branch; currently no real LINE device evidence. Production remains unchanged.
