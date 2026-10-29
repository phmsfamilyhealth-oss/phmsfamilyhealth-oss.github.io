# Unified hospital / department / clinician: production release gate

Current status: NOT approved for central registry writes. Read API stays read-only; appointment-save API stays fail-closed.

Production facts: healthcare_organizations and healthcare_service_units have is_verified fields and unique indexes by active normalized SQL names, but no owner-private pending scope. healthcare_clinicians lacks an is_verified column and lacks a clinician name unique index. All three tables use RLS and service_role does not have SELECT grants.

Required additive migration (not run):
- Private owner-scoped master_proposals with UUID primary key, kind, submitting PHMS user, family ID, normalized name, optional scoped organization and unit references, created_at, updated_at, status pending_verification/verified/rejected, idempotency key, nullable canonical ID and audit reviewer.
- Unique keys on actor+idempotency and active family+kind+parent+normalized name, preventing duplicate pending proposals under concurrency.
- Central registry remains unchanged for pending candidates: verification maps to existing or newly approved central row in a privileged transaction; no automatic public publication.
- Protected POST API: verify LINE ID token audience, actor mapping, owner-only release flag, family appointment and registry creation authorization, and parent relationships; enforce all checks on server. Repeat requests return same pending candidate ID. Never accept client-provided clinician ID, license, verification status, or creator ID.
- Scoped read API returns verified existing entries plus only pending proposals visible to the authorized family. Until appointment save knows how to represent pending choices, never pass proposal ID as canonical provider ID or enable save.

Predeployment: documented recoverable backup and restoration rehearsal, production constraint/trigger/RLS and foreign-key compatibility test, race/idempotency and cross-family denial tests, then specific owner approval for migration.

Rollback: stop writes by feature flag; preserve/export pending proposals and mappings before any reversal; restore backed-up schema/data using validated recovery procedure. Do not silently drop submitted proposals.
