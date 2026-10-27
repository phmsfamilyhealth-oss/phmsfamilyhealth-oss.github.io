\set ON_ERROR_STOP on
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA private;
CREATE TABLE public.appointments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),family_id uuid,family_person_id uuid,person_id uuid NOT NULL,created_by uuid,
 appointment_type text NOT NULL,visit_mode text,visit_time_known boolean NOT NULL DEFAULT true,status text,planned_visit_date date,
 appointment_at timestamptz,hospital_name text,department text,doctor_name text,note text,preparation_notes text
);
CREATE TABLE public.family_persons(id uuid PRIMARY KEY,family_id uuid NOT NULL,person_id uuid NOT NULL);
CREATE TABLE public.appointment_tasks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),appointment_id uuid REFERENCES public.appointments(id),task_type text NOT NULL,title text NOT NULL,instruction text,status text NOT NULL,created_by uuid);
CREATE TABLE private.phms_appointment_release_gate(singleton boolean PRIMARY KEY,enabled_for_everyone boolean NOT NULL,allowed_actor_ids uuid[] NOT NULL DEFAULT '{}');
INSERT INTO private.phms_appointment_release_gate VALUES(true,true,'{}');
CREATE FUNCTION private.user_can_access_family_person(uuid,uuid,text,text) RETURNS boolean LANGUAGE sql AS $$ SELECT $1='11111111-1111-4111-8111-111111111111'::uuid AND $2='33333333-3333-4333-8333-333333333333'::uuid $$;
INSERT INTO public.family_persons VALUES('33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222','44444444-4444-4444-8444-444444444444');
-- Emulate existing Production automatic checklist projection trigger in synthetic PostgreSQL.
-- This catches duplicate items from both trigger and explicit migration insert.
CREATE FUNCTION public.phms_test_preparation_projection() RETURNS trigger LANGUAGE plpgsql AS $
BEGIN
 IF nullif(btrim(coalesce(NEW.preparation_notes,'')),'') IS NOT NULL THEN
  INSERT INTO public.appointment_tasks(appointment_id,task_type,title,status,created_by)
  SELECT NEW.id,'other',btrim(line),'pending',NEW.created_by
  FROM regexp_split_to_table(NEW.preparation_notes,E'\\n+') AS line
  WHERE nullif(btrim(line),'') IS NOT NULL;
 END IF;
 RETURN NEW;
END $;
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
