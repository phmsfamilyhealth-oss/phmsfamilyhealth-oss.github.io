-- PHMS v2.4: read-only regression guard for existing unknown-time mismatch.
-- Run against Production schema only; no patient rows are selected or mutated.
WITH src AS (
 SELECT pg_get_functiondef(p.oid) AS definition
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='private' AND p.proname='phms_commit_appointment_candidate_base_20261010'
), checks AS (
 SELECT 'appointments_timestamp_nullable' AS name,
   (SELECT is_nullable='YES' FROM information_schema.columns WHERE table_schema='public' AND table_name='appointments' AND column_name='appointment_at') AS actual,
   true AS expected
 UNION ALL SELECT 'walkin_dateonly_constraint_exists',
  EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.appointments'::regclass AND conname='aim_walk_in_date_only_allowed'),true
 UNION ALL SELECT 'base_requires_appointment_at',
  EXISTS(SELECT 1 FROM src WHERE definition LIKE '%appointment_at_required%'),true
 UNION ALL SELECT 'candidate_commit_exists',
  EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname='phms_commit_appointment_candidate'),true
 UNION ALL SELECT 'intake_candidate_has_json',
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='data_intake_candidates' AND column_name='normalized_data' AND udt_name='jsonb'),true
)
SELECT name,actual,expected,actual IS NOT DISTINCT FROM expected AS pass FROM checks ORDER BY name;
