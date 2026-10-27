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
