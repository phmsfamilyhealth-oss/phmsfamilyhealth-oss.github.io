# Smart Health PR #4 — Production approval review

This is a review package, not evidence that Production has been deployed.

## Decline evidence and classification

The recorded call was `apply_migration`, project `buxvdlfrikpwdscdlcfd`, migration
`smart_health_intake_v23_pilot`. The entire surfaced result was:

```json
{"content":[{"type":"text","text":"Migration was declined."}],"structuredContent":{"status":"declined"},"isError":false}
```

No approver identity, reviewer rationale, SQLSTATE, schema-conflict detail or
permission error was supplied. Therefore the cause is **APPROVAL_DECLINED,
ORIGIN_UNDETERMINED**. Human rejection, automated policy rejection, failed
approval transport and a security-review decision cannot be distinguished from
this response. Do not claim a particular cause without the missing audit record.

Production inspection confirms both new RPCs are absent. Isolated execution
passes, which does not establish why the approval layer declined. No alternative
SQL/CLI/UI path has been used to install it, and no new request is authorized
merely because the SQL passes tests. The approval owner must supply the reason
or explicitly reopen review of the exact current diff before another attempt.

## Exact SQL diff and risk

The executable SQL diff is
`supabase/migrations/20261022144248_smart_health_intake.sql` relative to the
Production baseline with no Smart Health migration installed.

- No new measurement registry, patient migration, synthetic Production rows,
  bucket, public bucket setting or Storage policy is introduced.
- Existing health rows receive nullable session/context/source/revision columns;
  foreign keys target existing intake sessions and measurements. Two indexes
  support session idempotency and person/type/time history.
- Existing runtime configuration receives an `off` default and an empty actor
  list. The deployment does not set `general` or add a tester.
- New public RPCs are `SECURITY INVOKER`, with execution revoked from PUBLIC,
  anon and authenticated. Only service_role may invoke them.
- Missing service-role grants are explicit: resolver EXECUTE; intake/session/
  document operations used by the transaction; health/asset SELECT+INSERT;
  audit INSERT; config/storage metadata SELECT. Client grants and existing RLS
  policies are not widened.
- Existing authorization resolves the actual registered LINE actor and current
  person. Photo operations additionally require the document policy predicate.
- The private audit trigger is SECURITY DEFINER only to append actual OLD/NEW
  rows into the service-only audit register after measurement RLS. It has an
  empty search_path, cannot be invoked as a normal function, forbids ownership
  changes and hard deletion of Smart Health records, and is not client-executable.
- Risks: index/constraint locks during DDL; broader direct table capability for
  the already trusted backend role; compatibility with concurrent schema/source
  edits; private image provider behavior not certified by local HTTP tests.
  No general rollout is authorized by this package.

## Rollback and dependencies

`release/smart-health/rollback.sql` closes the gate, removes backend access to
the new commit RPC and restores only the newly introduced grants recorded in
the baseline. It preserves measurements, photos, sessions, columns and audit
history. Do not drop clinical data or cascade-delete evidence as a rollback.
Recheck grants and downstream consumers immediately before any rollback;
concurrent applications may have acquired dependencies on a shared grant.
The original webhook source must be retained and compared before a source
rollback. Migration reapplication and non-destructive rollback are tested in
the isolated restored schema.

Required existing dependencies: runtime configuration, canonical health/intake/
document/asset tables; LINE actor/context resolvers; family document permissions;
private medical bucket; existing audit/notification triggers. The database
snapshot restore includes 714 original functions and their grants/policies.

## Automated acceptance and honest limits

Run `npm test`, `npm run test:integration`, `npm run check` and CI's
`npm run compile`. All identities, families, people and health values in tests
are synthetic and confined to the isolated databases.

The HTTP object service uses actual filesystem bytes and authenticated HTTP,
HMAC-signed object URLs, tamper rejection, expiry and private-read rejection.
It exercises the signed webhook's upload/sign/read contracts, not just an
in-memory fake. **It is not the Supabase Storage service** and does not certify
upstream provider behavior. Docker is unavailable in this executor, so a local
Supabase Storage stack cannot be started here. Live private upload/signing and
LINE API validation still require an approved environment/authorized service
path. No LINE account, user ID or screenshot is requested from the owner.

## Release decision

- DEPLOYED: no, pending Migration approval and safe closed-gate deployment.
- AUTOMATED VERIFIED: report the exact passing suites and transport scope.
- REAL-DEVICE UAT: NOT_RUN; never relabel event simulation as phone testing.
- PUBLIC ENABLED: no. Preserve the existing real-device rollout criterion
  unless the release authority explicitly changes it in a recorded decision.

Approval needed: review the exact SQL diff, trusted-role privilege changes and
non-destructive rollback; resolve or reopen the recorded decline; then authorize
Migration plus closed-gate deployment only. Before executing, re-read Production
source/schema and rebase/test against any newer changes. Do not retry a declined
request through another interface or infer approval from silence.
