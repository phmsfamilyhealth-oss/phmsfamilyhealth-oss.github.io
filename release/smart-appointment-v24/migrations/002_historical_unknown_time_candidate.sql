-- CANDIDATE ONLY. DO NOT APPLY TO PRODUCTION WITHOUT DB BACKUP, TRIGGER REVIEW,
-- documented rollback, isolated PostgreSQL acceptance and explicit release gate.
-- Allows a completed retrospective visit with a KNOWN DATE but UNKNOWN TIME,
-- without inventing midnight or a fabricated completed_at timestamp.
-- planned_visit_date temporarily carries the actual visit date for this scenario;
-- this meaning must be made explicit in UI and readback.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.appointments'::regclass AND conname='aim_walk_in_date_only_allowed' AND contype='c')
 THEN RAISE EXCEPTION 'historical_migration_expected_constraint_missing'; END IF;
END $$;
ALTER TABLE public.appointments DROP CONSTRAINT aim_walk_in_date_only_allowed;
ALTER TABLE public.appointments ADD CONSTRAINT aim_walk_in_date_only_allowed
 CHECK (visit_time_known OR (
   appointment_at IS NULL AND planned_visit_date IS NOT NULL
   AND ((visit_mode='walk_in' AND status IN ('planned','scheduled'))
        OR (visit_mode IN ('booked','walk_in') AND status='completed'))
 ));
COMMIT;
-- Rollback (only after verifying no completed unknown-time rows exist):
-- BEGIN;
-- SELECT count(*) FROM public.appointments WHERE visit_time_known=false AND status='completed'; -- must be 0
-- ALTER TABLE public.appointments DROP CONSTRAINT aim_walk_in_date_only_allowed;
-- ALTER TABLE public.appointments ADD CONSTRAINT aim_walk_in_date_only_allowed CHECK (visit_time_known OR (visit_mode='walk_in' AND appointment_at IS NULL AND planned_visit_date IS NOT NULL AND status IN ('planned','scheduled')));
-- COMMIT;
