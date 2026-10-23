# PHMS v2.3 smart medication intake — automated verification

Candidate verification on 2026-10-23; production baseline remains line-webhook v1335 until release gates pass.

- Shared normalized schema, validators, picker/review and atomic canonical commit for both input modes. Copyable example is a separate LINE Text Message; unchanged example cannot commit.
- Structured daily, weekdays, rolling days/weeks, hourly, bedtime and PRN schedules persist in regimens, verified order versions, dose rules and scheduled doses. Weekday and rolling-day semantics are distinct. Existing legacy regimens retain legacy scheduling.
- Failed commit retains source/person/draft; edit and retry are supported. Database confirmation and commit roll back together. Stable source identity prevents duplicate writes; atomic input comparison rejects stale confirmation.
- New release gate defaults to test_only with no allowlisted actors. No production test patient data or paid messages were created. General availability requires authorized real-device LINE UAT.

## Automated evidence

- Deno 2.9.6 strict type check: entire runtime and both local imports pass.
- Deno actual handler execution: GET 405, unsigned POST 401, correctly signed empty-event POST 200. No outbound API calls in these smoke tests.
- Node parser/validator/routing/presentation regressions: 25 passed. Actual PHMS presentation pipeline preserves Text template and review actions; structural LINE payload budgets checked. LINE API server validation/delivery still requires live authorized credentials.
- Database integration: 29 passed on PostgreSQL 17.5 through PGlite. Restores schema-only metadata: 212 tables, 714 functions, 188 triggers, 1,218 constraints, 175 RLS policies, 340 indexes and 13 views; restore exceptions: none. No patient rows copied. Synthetic actors/persons are local only.
- Actual database RPC paths tested for both input modes, JSONB draft readback, Vitamin D2 Friday versus rolling 7 days, multiple weekdays/times, every 2 weeks, every 2 days, every 8 hours, Gabapentin bedtime, eye-drop ratios, PRN, incomplete data, failed commit/edit/retry, response lost after commit, stale review, expired state, service RPC ACLs, RLS, legacy daily scheduling, daily cron, deduplicated weekly notification queue and Refill create/detail/idempotency/foreign-owner denial.
- PGlite supplies real PostgreSQL semantics; local crypto wrappers use PostgreSQL SHA-256 and random UUID bytes. Native Supabase extensions and live PostgREST/LINE delivery are not represented as passed end-to-end tests.
- Standalone deno compile completed type-check/transpilation but executable packaging was blocked by Connection refused downloading dl.deno.land denort. CI runs strict check, all tests and standalone compile on Ubuntu. A missing successful CI result remains a release gate.

## Release safeguards

Migration checks hashes of every replaced production function and aborts on source drift; lock timeout 5 seconds. No existing medication instructions are backfilled or changed. Release test-only gate is independent of existing real/test-data and paid-send gates.

Production deployment/readback and authorized LINE real-device UAT must be recorded before claiming COMPLETE. This file records pre-release automated evidence only.
