-- PHMS v2.4 draft migration. NOT APPLIED TO PRODUCTION.
-- Install only after review, dry-run, owner release approval and identity integration.
-- RPC callable exclusively by service_role after server verifies the LINE identity.
BEGIN;
CREATE TABLE IF NOT EXISTS private.phms_v24_appointment_operations (
  actor_user_id uuid NOT NULL,
  operation_key uuid NOT NULL,
  request_hash text NOT NULL,
  appointment_id uuid NOT NULL REFERENCES public.appointments(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(actor_user_id,operation_key)
);
REVOKE ALL ON private.phms_v24_appointment_operations FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.phms_v24_commit_appointment(
  p_actor_user_id uuid, p_operation_key uuid,
  p_expected_family_id uuid, p_expected_family_person_id uuid,
  p_appointment jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_person uuid; v_id uuid; v_existing private.phms_v24_appointment_operations%ROWTYPE;
  v_hash text; v_time timestamptz; v_date date; v_type text; v_mode text; v_status text;
BEGIN
  IF p_actor_user_id IS NULL OR p_operation_key IS NULL OR p_expected_family_id IS NULL OR p_expected_family_person_id IS NULL
    OR jsonb_typeof(p_appointment) <> 'object' THEN RAISE EXCEPTION 'invalid_request'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM private.phms_appointment_release_gate
    WHERE singleton = true AND (enabled_for_everyone = true OR p_actor_user_id = ANY(allowed_actor_ids))
  ) THEN RAISE EXCEPTION 'feature_not_released'; END IF;
  SELECT fp.person_id INTO v_person
    FROM public.family_persons fp
    WHERE fp.id = p_expected_family_person_id AND fp.family_id = p_expected_family_id
    FOR SHARE;
  IF v_person IS NULL THEN RAISE EXCEPTION 'person_not_found'; END IF;
  IF private.user_can_access_family_person(p_actor_user_id,p_expected_family_person_id,'appointments','create') IS DISTINCT FROM true
     OR private.user_can_access_family_person(p_actor_user_id,p_expected_family_person_id,'appointments','view') IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'permission_denied'; END IF;
  -- Never accept caller-supplied person/family/provider/actor IDs or arbitrary column maps.
  IF p_appointment ?| ARRAY['organization_id','service_unit_id','clinician_id','source_document_id']
  THEN RAISE EXCEPTION 'provider_binding_not_yet_implemented'; END IF;
  IF nullif(p_appointment->>'person_id','')::uuid IS DISTINCT FROM v_person
   OR nullif(p_appointment->>'family_id','')::uuid IS DISTINCT FROM p_expected_family_id
   OR nullif(p_appointment->>'family_person_id','')::uuid IS DISTINCT FROM p_expected_family_person_id
   OR nullif(p_appointment->>'created_by','')::uuid IS DISTINCT FROM p_actor_user_id
  THEN RAISE EXCEPTION 'identity_mismatch'; END IF;
  v_type := p_appointment->>'appointment_type';
  v_mode := p_appointment->>'visit_mode';
  v_status := p_appointment->>'status';
  IF v_type IS NULL OR v_mode IS NULL OR v_status IS NULL OR v_type NOT IN ('new_case','follow_up','referral','investigation','procedure','walk_in','rescheduled','other','checkup','vaccination','medication_refill')
    OR v_mode NOT IN ('booked','walk_in','unspecified')
    OR v_status NOT IN ('planned','scheduled','completed')
  THEN RAISE EXCEPTION 'invalid_appointment'; END IF;
  v_time := nullif(p_appointment->>'appointment_at','')::timestamptz;
  v_date := nullif(p_appointment->>'planned_visit_date','')::date;
  IF v_date IS NULL OR (p_appointment->>'visit_time_known') IS NULL OR (p_appointment->>'visit_time_known') NOT IN ('true','false')
  THEN RAISE EXCEPTION 'invalid_date'; END IF;
  IF (p_appointment->>'visit_time_known')='false' AND
     (v_mode <> 'walk_in' OR v_time IS NOT NULL OR v_status NOT IN ('planned','scheduled'))
  THEN RAISE EXCEPTION 'unknown_time_not_supported'; END IF;
  IF (p_appointment->>'visit_time_known')='true' AND v_time IS NULL
  THEN RAISE EXCEPTION 'time_required'; END IF;
  -- JSON null and absent values must not bypass three-valued SQL comparisons.
  IF v_type IS NULL OR v_mode IS NULL OR v_status IS NULL THEN RAISE EXCEPTION 'invalid_appointment'; END IF;
  -- Unique key serializes concurrent attempts; mismatched replay is explicitly rejected.
  v_hash := md5(p_appointment::text);
  SELECT * INTO v_existing FROM private.phms_v24_appointment_operations
    WHERE actor_user_id=p_actor_user_id AND operation_key=p_operation_key FOR UPDATE;
  IF FOUND THEN
    IF v_existing.request_hash <> v_hash THEN RAISE EXCEPTION 'operation_key_reused'; END IF;
    RETURN jsonb_build_object('ok',true,'appointment_id',v_existing.appointment_id,'idempotent_replay',true);
  END IF;
  -- Serialize same actor+key even when no row exists to prevent concurrent duplicate inserts.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor_user_id::text||':'||p_operation_key::text,0));
  SELECT * INTO v_existing FROM private.phms_v24_appointment_operations
    WHERE actor_user_id=p_actor_user_id AND operation_key=p_operation_key FOR UPDATE;
  IF FOUND THEN
    IF v_existing.request_hash <> v_hash THEN RAISE EXCEPTION 'operation_key_reused'; END IF;
    RETURN jsonb_build_object('ok',true,'appointment_id',v_existing.appointment_id,'idempotent_replay',true);
  END IF;
  INSERT INTO public.appointments(
    family_id,family_person_id,person_id,created_by,appointment_type,visit_mode,visit_time_known,
    status,planned_visit_date,appointment_at,hospital_name,department,doctor_name,note,preparation_notes
  ) VALUES (
    p_expected_family_id,p_expected_family_person_id,v_person,p_actor_user_id,v_type,v_mode,
    (p_appointment->>'visit_time_known')::boolean,v_status,v_date,v_time,
    left(p_appointment->>'hospital_name',160),left(p_appointment->>'department',160),
    left(p_appointment->>'doctor_name',160),left(p_appointment->>'note',1000),
    left(p_appointment->>'preparation_notes',4000)
  ) RETURNING id INTO v_id;
  INSERT INTO private.phms_v24_appointment_operations(actor_user_id,operation_key,request_hash,appointment_id)
  VALUES(p_actor_user_id,p_operation_key,v_hash,v_id);
  RETURN jsonb_build_object('ok',true,'appointment_id',v_id,'idempotent_replay',false);
END; $$;
REVOKE ALL ON FUNCTION public.phms_v24_commit_appointment(uuid,uuid,uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.phms_v24_commit_appointment(uuid,uuid,uuid,uuid,jsonb) TO service_role;
COMMIT;
