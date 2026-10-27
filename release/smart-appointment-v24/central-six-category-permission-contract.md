# PHMS v2.4 — CENTRAL FAMILY/PERSON PERMISSION IS AUTHORITATIVE
Decision from system owner: Smart Appointment must follow existing central six-category family/person permission settings. Do NOT build a separate long-term per-user feature allowlist. Other households/users are configured later using central permissions.

Read-only verified 2026-10-27 against Supabase Production:
- private.user_can_access_family_person(user_id, family_person_id, resource, action) is the existing authoritative checker. For appointments it uses resource='appointments', action='view'|'create'|'update'|'delete'.
- It checks active family membership, patient association, and person_five_category_policies (base_level+overrides) when configured, with legacy person_permissions, caregiver and role paths as appropriate.
- Existing configuration tables include person_five_category_policies, person_permissions, family_permissions, family_memberships. A schema identifier containing 'five' is legacy naming; do not assume only five visible UI categories or change the owner's six-category contract.
- Existing draft RPC calls private.phms_line_crud_context(...,'appointment','create') which resolves central permission; the new LIFF backend should use that same authoritative permission chain.
- private.phms_appointment_release_gate currently enabled_for_everyone=false and allowlist empty. This is TEMPORARY deployment/rollout gating **only**, never access authorization. A rollout flag cannot grant access without central permission; when rollout is over, it should not be necessary to maintain parallel user allowlists.

## Required decision logic
For every request:
1. Verify LINE identity server-side cryptographically and resolve a real account.
2. Resolve selected family and target patient from authenticated context.
3. Verify the action's central permission for that *specific patient*. Viewing needs appointments:view, creating appointments:create, editing/rescheduling appointments:update (and create if inserting a replacement), deleting appointments:delete; relevant attached documents additionally require documents permissions.
4. Apply release flag **as an independent deployment gate** only during staged launch. A permitted rollout actor still cannot bypass central permission; a central-permitted actor cannot access an unreleased feature.
5. Return scoped data; never accept actor/family/person identifiers solely from the frontend.
6. Recheck permissions at transaction commit and signed document read.
7. On later household/user onboarding, use the existing central Settings UI; no separate appointment allowlist administration.

## Behavioral acceptance
- Cross-family denial; within-family person-specific denial; view-only can't create; create can't delete; caregiver according to central rules; revocation effective immediately; later-added family works solely via central config after feature is released; document permission denial hides attachments.
- Preserve original central six-category permissions UI, with no duplicate flags or policy migration. No privilege escalation.
- Test rollout flag OFF independently of central permissions; test both must be true during controlled UAT.

Status: design correction recorded; **NOT implemented or behaviorally tested**. Phase 1 and 2 remain BLOCKED. Production unchanged by this commit.
