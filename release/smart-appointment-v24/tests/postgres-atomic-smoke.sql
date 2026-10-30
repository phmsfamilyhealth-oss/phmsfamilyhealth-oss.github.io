\set ON_ERROR_STOP on
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA private;
CREATE TABLE public.appointments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),family_id uuid,family_person_id uuid,person_id uuid NOT NULL,created_by uuid,
 appointment_type text NOT NULL,visit_mode text,visit_time_known boolean NOT NULL DEFAULT true,status text,planned_visit_date date,
 appointment_at timestamptz,hospital_name text,department text,doctor_name text,title text,note text,preparation_notes text
);
CREATE TABLE public.family_persons(id uuid PRIMARY KEY,family_id uuid NOT NULL,person_id uuid NOT NULL);
CREATE TABLE public.appointment_tasks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),appointment_id uuid REFERENCES public.appointments(id),task_type text NOT NULL,title text NOT NULL,instruction text,status text NOT NULL,created_by uuid);
CREATE TABLE private.phms_appointment_release_gate(singleton boolean PRIMARY KEY,enabled_for_everyone boolean NOT NULL,allowed_actor_ids uuid[] NOT NULL DEFAULT '{}');
INSERT INTO private.phms_appointment_release_gate VALUES(true,true,'{}');
CREATE FUNCTION private.user_can_access_family_person(uuid,uuid,text,text) RETURNS boolean LANGUAGE sql AS $$ SELECT $1='11111111-1111-4111-8111-111111111111'::uuid AND $2='33333333-3333-4333-8333-333333333333'::uuid $$;
INSERT INTO public.family_persons VALUES('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222','44444444-4444-4444-8444-444444444444');
-- Emulate existing Production automatic checklist projection trigger in synthetic PostgreSQL.
-- This catches duplicate items from both trigger and explicit migration insert.
CREATE FUNCTION public.phms_test_preparation_projection() RETURNS trigger LANGUAGE plpgsql AS $phms_projection$
BEGIN
 IF nullif(btrim(coalesce(NEW.preparation_notes,'')),'') IS NOT NULL THEN
  INSERT INTO public.appointment_tasks(appointment_id,task_type,title,status,created_by)
  SELECT NEW.id,'other',btrim(line),'pending',NEW.created_by
  FROM regexp_split_to_table(NEW.preparation_notes,E'\\n+') AS line
  WHERE nullif(btrim(line),'') IS NOT NULL;
 END IF;
 RETURN NEW;
END $phms_projection$;
CREATE TRIGGER trg_phms_sync_appointment_preparation_tasks
AFTER INSERT ON public.appointments FOR EACH ROW
EXECUTE FUNCTION public.phms_test_preparation_projection();
\ir ../migrations/001_gated_atomic_appointment_draft.sql
DO $$
DECLARE a jsonb; b jsonb; c integer; d integer;
BEGIN
 SELECT public.phms_v24_commit_appointment(
 '11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555',
 '22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',
 '{"family_id":"22222222-2222-4222-8222-222222222222","family_person_id":"33333333-3333-4333-8333-333333333333","person_id":"44444444-4444-4444-8444-444444444444","created_by":"11111111-1111-4111-8111-111111111111","appointment_type":"walk_in","visit_mode":"walk_in","visit_time_known":false,"status":"planned","planned_visit_date":"2026-11-03","appointment_at":null,"preparation_tasks":[{"title":"Bring referral"}]}'
 ) INTO a;
 IF a->>'ok' IS DISTINCT FROM 'true' OR a->>'idempotent_replay' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'first insert failed %',a; END IF;
 SELECT public.phms_v24_commit_appointment(
 '11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555',
 '22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',
 '{"family_id":"22222222-2222-4222-8222-222222222222","family_person_id":"33333333-3333-4333-8333-333333333333","person_id":"44444444-4444-4444-8444-444444444444","created_by":"11111111-1111-4111-8111-111111111111","appointment_type":"walk_in","visit_mode":"walk_in","visit_time_known":false,"status":"planned","planned_visit_date":"2026-11-03","appointment_at":null,"preparation_tasks":[{"title":"Bring referral"}]}'
 ) INTO b;
 IF b->>'idempotent_replay' IS DISTINCT FROM 'true' OR b->>'appointment_id' IS DISTINCT FROM a->>'appointment_id' THEN RAISE EXCEPTION 'idempotency failed'; END IF;
 SELECT count(*) INTO c FROM public.appointments;
 SELECT count(*) INTO d FROM public.appointment_tasks;
 IF c<>1 OR d<>1 THEN RAISE EXCEPTION 'unexpected counts %, %',c,d; END IF;
END $$;

-- Negative controls: security gate and mismatched replay must be rejected.
DO $$
DECLARE rejected boolean:=false;
BEGIN
 BEGIN
  PERFORM public.phms_v24_commit_appointment(
  '99999999-9999-4999-8999-999999999999','66666666-6666-4666-8666-666666666666',
  '22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','{}'::jsonb);
 EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'unauthorized actor was accepted'; END IF;
 UPDATE private.phms_appointment_release_gate SET enabled_for_everyone=false;
 rejected:=false;
 BEGIN
  PERFORM public.phms_v24_commit_appointment(
  '11111111-1111-4111-8111-111111111111','77777777-7777-4777-8777-777777777777',
  '22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','{}'::jsonb);
 EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'release gate not enforced'; END IF;
END $$;

-- Restore gate for replay-tampering checks in isolated database.
UPDATE private.phms_appointment_release_gate SET enabled_for_everyone=true;
DO $$
DECLARE rejected boolean:=false; before_count integer; after_count integer;
BEGIN
 SELECT count(*) INTO before_count FROM public.appointments;
 BEGIN
  PERFORM public.phms_v24_commit_appointment(
   '11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555',
   '22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',
   '{"family_id":"22222222-2222-4222-8222-222222222222","family_person_id":"33333333-3333-4333-8333-333333333333","person_id":"44444444-4444-4444-8444-444444444444","created_by":"11111111-1111-4111-8111-111111111111","appointment_type":"walk_in","visit_mode":"walk_in","visit_time_known":false,"status":"planned","planned_visit_date":"2026-11-03","appointment_at":null,"preparation_tasks":[{"title":"Changed"}]}'::jsonb);
 EXCEPTION WHEN SQLSTATE 'P0001' THEN rejected:=true; END;
 SELECT count(*) INTO after_count FROM public.appointments;
 IF NOT rejected OR before_count<>after_count THEN RAISE EXCEPTION 'changed replay was accepted'; END IF;
END $$;
DO $$
DECLARE rejected boolean:=false;
BEGIN
 BEGIN
  PERFORM public.phms_v24_commit_appointment(
   '11111111-1111-4111-8111-111111111111','88888888-8888-4888-8888-888888888888',
   '22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',
   '{"family_id":"22222222-2222-4222-8222-222222222222","family_person_id":"33333333-3333-4333-8333-333333333333","person_id":"44444444-4444-4444-8444-444444444444","created_by":"11111111-1111-4111-8111-111111111111","appointment_type":"walk_in","visit_mode":"walk_in","visit_time_known":false,"status":"planned","planned_visit_date":"2026-11-03","appointment_at":null,"document_metadata":[{"name":"not-yet-linked.pdf"}]}'::jsonb);
 EXCEPTION WHEN SQLSTATE 'P0001' THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'unsupported document was accepted'; END IF;
END $$;

-- Verify browser roles have no EXECUTE grant on the privileged function.
DO $$
DECLARE anon_allowed boolean; auth_allowed boolean;
BEGIN
 SELECT has_function_privilege('anon','public.phms_v24_commit_appointment(uuid,uuid,uuid,uuid,jsonb)','EXECUTE') INTO anon_allowed;
 SELECT has_function_privilege('authenticated','public.phms_v24_commit_appointment(uuid,uuid,uuid,uuid,jsonb)','EXECUTE') INTO auth_allowed;
 IF anon_allowed OR auth_allowed THEN RAISE EXCEPTION 'privileged RPC exposed to browser roles'; END IF;
END $$;
-- Verify invalid checklist rolls back both appointment and task writes.
DO $$
DECLARE before_appointments bigint; before_tasks bigint; rejected boolean:=false;
BEGIN
 SELECT count(*) INTO before_appointments FROM public.appointments;
 SELECT count(*) INTO before_tasks FROM public.appointment_tasks;
 BEGIN
 PERFORM public.phms_v24_commit_appointment(
 '11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 '22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',
 '{"family_id":"22222222-2222-4222-8222-222222222222","family_person_id":"33333333-3333-4333-8333-333333333333","person_id":"44444444-4444-4444-8444-444444444444","created_by":"11111111-1111-4111-8111-111111111111","appointment_type":"walk_in","visit_mode":"walk_in","visit_time_known":false,"status":"planned","planned_visit_date":"2026-11-03","appointment_at":null,"preparation_tasks":[{"title":""}]}'::jsonb);
 EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'invalid checklist accepted'; END IF;
 IF (SELECT count(*) FROM public.appointments)<>before_appointments OR (SELECT count(*) FROM public.appointment_tasks)<>before_tasks THEN RAISE EXCEPTION 'partial write after rejected checklist'; END IF;
END $$;

-- Candidate historical unknown-time DB acceptance, synthetic records only.
-- Separate from Production; schema is modified only in the GitHub CI PostgreSQL service.
ALTER TABLE public.appointments ADD CONSTRAINT aim_walk_in_date_only_allowed
 CHECK (visit_time_known OR (visit_mode='walk_in' AND appointment_at IS NULL AND planned_visit_date IS NOT NULL AND status IN ('planned','scheduled')));
\ir ../migrations/002_historical_unknown_time_candidate.sql
DO $$ DECLARE historical_id uuid; BEGIN
 INSERT INTO public.appointments (person_id,appointment_type,visit_mode,visit_time_known,status,planned_visit_date,appointment_at)
 VALUES ('44444444-4444-4444-8444-444444444444','follow_up','booked',false,'completed','2026-10-20',NULL)
 RETURNING id INTO historical_id;
 IF NOT EXISTS (SELECT 1 FROM public.appointments WHERE id=historical_id AND appointment_at IS NULL AND planned_visit_date='2026-10-20' AND status='completed')
 THEN RAISE EXCEPTION 'historical_unknown_time_date_not_preserved'; END IF;
END $$;

-- Two synthetic families: the real atomic writer must deny cross-family writes
-- even if an attacker supplies a valid foreign family-person UUID.
INSERT INTO public.family_persons VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc','dddddddd-dddd-4ddd-8ddd-dddddddddddd');
DO $$ DECLARE rejected boolean:=false; n_before bigint; BEGIN
 SELECT count(*) INTO n_before FROM public.appointments;
 BEGIN
 PERFORM public.phms_v24_commit_appointment(
 '11111111-1111-4111-8111-111111111111','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 '{"family_id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","family_person_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","person_id":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","created_by":"11111111-1111-4111-8111-111111111111","appointment_type":"walk_in","visit_mode":"walk_in","visit_time_known":false,"status":"planned","planned_visit_date":"2026-11-05","appointment_at":null}'::jsonb);
 EXCEPTION WHEN OTHERS THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'cross_family_write_was_accepted'; END IF;
 IF (SELECT count(*) FROM public.appointments)<>n_before THEN RAISE EXCEPTION 'cross_family_write_modified_database'; END IF;
END $$;

-- Negative historical acceptance: no fabricated timestamp and no invalid date-only scheduled visit.
DO $$ DECLARE rejected boolean:=false; before_count bigint; BEGIN
 SELECT count(*) INTO before_count FROM public.appointments;
 BEGIN
  INSERT INTO public.appointments(person_id,appointment_type,visit_mode,visit_time_known,status,planned_visit_date,appointment_at)
  VALUES ('44444444-4444-4444-8444-444444444444','follow_up','booked',false,'planned','2026-11-05',NULL);
 EXCEPTION WHEN check_violation THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'unknown_time_booked_future_was_accepted'; END IF;
 rejected:=false;
 BEGIN
  INSERT INTO public.appointments(person_id,appointment_type,visit_mode,visit_time_known,status,planned_visit_date,appointment_at)
  VALUES ('44444444-4444-4444-8444-444444444444','follow_up','booked',false,'completed',NULL,NULL);
 EXCEPTION WHEN check_violation THEN rejected:=true; END;
 IF NOT rejected THEN RAISE EXCEPTION 'historical_unknown_date_was_accepted'; END IF;
 IF (SELECT count(*) FROM public.appointments)<>before_count THEN RAISE EXCEPTION 'rejected_historical_case_wrote_rows'; END IF;
END $$;

-- Full atomic RPC historical date-only acceptance, following migration 002.
DO $$ DECLARE receipt jsonb; stored record; BEGIN
 SELECT public.phms_v24_commit_appointment(
 '11111111-1111-4111-8111-111111111111'::uuid,
 'f1111111-1111-4111-8111-111111111111'::uuid,
 '22222222-2222-4222-8222-222222222222'::uuid,
 '33333333-3333-4333-8333-333333333333'::uuid,
 '{"family_id":"22222222-2222-4222-8222-222222222222","family_person_id":"33333333-3333-4333-8333-333333333333","person_id":"44444444-4444-4444-8444-444444444444","created_by":"11111111-1111-4111-8111-111111111111","appointment_type":"follow_up","visit_mode":"booked","visit_time_known":false,"status":"completed","planned_visit_date":"2026-10-20","appointment_at":null}'::jsonb
 ) INTO receipt;
 IF receipt->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'atomic historical insert failed %',receipt; END IF;
 SELECT * INTO stored FROM public.appointments WHERE id=(receipt->>'appointment_id')::uuid;
 IF stored.appointment_at IS NOT NULL OR stored.visit_time_known IS DISTINCT FROM false OR stored.status IS DISTINCT FROM 'completed' OR stored.planned_visit_date IS DISTINCT FROM '2026-10-20'::date THEN
 RAISE EXCEPTION 'historical date-only fields not preserved'; END IF;
END $$;

-- Completed historical operation replay: same key must not duplicate a past visit.
DO $$ DECLARE first_result jsonb; replay_result jsonb; n_before bigint; n_after bigint;
 payload jsonb:='{"family_id":"22222222-2222-4222-8222-222222222222","family_person_id":"33333333-3333-4333-8333-333333333333","person_id":"44444444-4444-4444-8444-444444444444","created_by":"11111111-1111-4111-8111-111111111111","appointment_type":"follow_up","visit_mode":"booked","visit_time_known":false,"status":"completed","planned_visit_date":"2026-10-19","appointment_at":null}'::jsonb;
BEGIN
 SELECT count(*) INTO n_before FROM public.appointments;
 SELECT public.phms_v24_commit_appointment('11111111-1111-4111-8111-111111111111','f2222222-2222-4222-8222-222222222222','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',payload) INTO first_result;
 SELECT public.phms_v24_commit_appointment('11111111-1111-4111-8111-111111111111','f2222222-2222-4222-8222-222222222222','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333',payload) INTO replay_result;
 SELECT count(*) INTO n_after FROM public.appointments;
 IF first_result->>'ok' IS DISTINCT FROM 'true' OR replay_result->>'idempotent_replay' IS DISTINCT FROM 'true' OR first_result->>'appointment_id' IS DISTINCT FROM replay_result->>'appointment_id' OR n_after<>n_before+1 THEN RAISE EXCEPTION 'historical_replay_not_idempotent'; END IF;
END $$;
