# PHMS v2.4 — Production write-path compatibility gate (27 Oct 2026)

## Read-only verification performed against production
- main HEAD: 1d988866dfcd9a1a97196b5fa26bbc989110f3cb
- line-webhook: v1431; isolated phms-v24-appointment-confirm: v1, fail closed.
- `public.phms_v24_commit_appointment(uuid,uuid,uuid,uuid,jsonb)`: ABSENT.
- `private.phms_v24_appointment_operations`: ABSENT.
- Existing `appointments` columns match draft migration's base INSERT column names and types.
- Existing `appointment_tasks` supports task_type='other' and status='pending'.
- Existing `appointments` CHECK: date-only only valid for walk_in with planned/scheduled status; completed historical entries require known time under current rules.

## Release blockers (do not bypass)
1. Review draft SQL migration against live table defaults, triggers, central permission policy, RLS and grants. Existing CI uses ephemeral PostgreSQL fixtures, not production full schema.
2. Production migration requires explicit high-risk release approval, transaction backup and rollback evidence. Never apply it as an incidental test.
3. Existing Edge v1 always rejects writes; only deploy real handler when LINE ID token + central permission + release gate + verified provider + idempotent transaction + scoped readback are wired and tested.
4. LIFF prototype still lacks an authorized master-catalog loading endpoint and has unconfigured LIFF ID/API. Do not open write before resolving.
5. Atomic document links, storage attachments, reschedule and historical unknown-time remain unsupported. Do not represent them as working.

## Acceptance
- CI green is necessary, never sufficient; no release without targeted-user real device LINE -> LIFF -> review -> database write -> scoped readback -> LINE UAT and owner approval.
- Recovery: do not change production during design. Branch changes can be reverted in PR #12. Edge v1 stays fail-closed.

## Latest verified continuation — commit aa5da8b0 (27 Oct 2026)
- GitHub PR #12 remains draft and unmerged; PHMS Contract Regression jobs `scenario-validation` and `postgres-atomic-smoke` passed in run 40534203116; Medication release gates passed in run 40534203507.
- Read-only live Supabase verification: dedicated v2.4 appointment commit routine remains absent; release gate is closed globally with zero enabled test actors; deployed appointment confirm remains v1 fail-closed.
- Live database CHECK `aim_walk_in_date_only_allowed` permits unknown-time date-only visits only for `walk_in` with planned/scheduled status; historical completed date-only is not supported without an approved schema-compatible design.
- Unresolved actual-use dependencies: owner-approved gated database migration and recovery plan; server-only private database connectivity/credentials; configured LIFF channel/origin and trusted endpoint; restricted test actor; authenticated LINE to LIFF to persisted readback and back to LINE UAT.
- Do not present green isolated CI as real LINE release acceptance. Do not deploy a write-capable candidate without explicit production-change authorization. No patient records were modified during these inspections.

## Additional release-critical blocker — provider catalog UI is not connected (27 October 2026)
- `prototype/index.html` initializes `authorizedCatalog=null` and does not call a verified catalog endpoint; hospital/unit/clinician picker stays disabled. Its review payload consequently has blank master identifiers.
- `contracts/phms-persistence-security.mjs` intentionally rejects any save lacking a valid, server-verified organization UUID, even when hospital free text is filled.
- Therefore enabling the database RPC and LIFF ID alone **cannot** make the existing form save successfully. This is a release blocker, not a cosmetic or CI issue.
- Required next implementation: expose provider catalog strictly after verified LINE ID token + resolved member + central appointments:view permission and feature gate. Populate LIFF picker from this authorized response, refresh units/clinicians when parent choice changes, and submit matching master IDs/names. Prove unauthorized/cross-family requests cannot access the catalog. Never weaken master verification or permit free text to bypass the catalog.
- Separately wire complete readback and LINE display; reject declarations of successful real-device UAT until a genuine device exercises full flow. Production changes still require owner release approval.

## Owner authorization recorded — limited pilot only (27 October 2026)
Owner expressly approved preparing a restricted owner-account pilot, subject to security checks and rollback. NOT blanket rollout approval, permission to bypass RLS, or a declaration of completed production acceptance.
Read-only verification after approval: latest PR HEAD `bd99562432b058ac365eb2180ee88f017602f280`; Contract Regression run 40539477665 PASS and Medication gates run 40539477647 PASS. Production RPC still ABSENT; release gate globally OFF and zero allowlisted actor IDs; active confirm Edge remains v1 fail-closed. Live preparation trigger `trg_phms_sync_appointment_preparation_tasks` auto-materializes `preparation_notes` into appointment_tasks; draft migration has a dual-source guard; needs full-schema dry run and final transactional review.
**Do not apply migration or replace Edge v1 until**: (1) recoverable DB snapshot and verified rollback path; (2) final SQL reviewed against real triggers/constraints and grant/RLS; (3) verified owner test actor UUID and central rights, without guessing identity; (4) configured LIFF channel/origin and server-only database secret, with no secret in git; (5) scoped catalog and RPC E2E in isolated environment; (6) smoke + negative auth tests. If any are missing, keep Production fail-closed and provide evidence rather than silently enabling writes.
Remaining full acceptance: LINE chat entrypoint, LIFF, draft/review, persisted authorized readback, LINE rendering, historical/rescheduled/attachment/storage paths, negative cases, and owner UAT.

## Live readiness cross-check — after commit 89f0e936 (27 Oct 2026)
- PR #12 HEAD `89f0e936b3102069a6d4225ea548691a23621640` was checked; Contract Regression run **40541289224 PASSED** and Medication release gates run **40541288789 PASSED**. These are test-only results, not deployment or real-device UAT.
- Live read-only SQL: commit RPC **absent**, all-family release **false**, allowlisted owner actors **0**. The current LIFF prototype checked on the same PR branch has `phms-liff-id` and `phms-confirm-api` metadata still **empty**. GitHub project code search did not find a configured production v2.4 LIFF endpoint. Do NOT claim ready or configure guessed IDs.
- Exact release prerequisites still missing: trusted owner actor verified through LINE family-membership mapping (never guess UUID), LIFF ID + HTTPS origin and API endpoint configured on a deployed form, private DATABASE URL and LINE audience available only to Edge as server secrets, recoverable database snapshot/rollback, full-schema migration verification, then scoped write/readback/chat integration UAT.
- Explicit decision: production stays unchanged. Even with owner authorization for a restricted pilot, **no safe LINE test link exists yet**. Next step is technical provisioning and an isolated dry run, not another unit-test-only acceptance claim. No patient information should be exported to Git or test fixtures.
