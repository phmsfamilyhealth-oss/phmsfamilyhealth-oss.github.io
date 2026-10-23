SET lock_timeout='5s';
SET statement_timeout='90s';
DO $guard$ BEGIN
 IF EXISTS(SELECT 1 FROM (VALUES ('public','phms_line_crud_list_v2','12b23da107a530eae8d384d726cdd757'),
('public','phms_get_line_conversation_state','ea7ff03311e66b71b8333ff0d1a7ee2c'),
('public','phms_finalize_line_intake_review','7c7eb829a9f232099dcfb09046130e10'),
('private','phms_commit_medication_candidate','725c4c2f5758b0e12714cc71ebe440d6'),
('public','phms_line_crud_list','5d90e85811d97cdc59c678576ddb3365'),
('public','phms_line_crud_detail','1a4cc1884a7cd97e5c9f96379e5a198d'),
('private','phms_generate_medication_notifications','a40f5eb7ef5514f7ee868b617b7a27c7'),
('public','phms_record_line_manual_structured_extraction','9cccd4baeae6bef1372fafab38d8db3f'),
('public','phms_med_v23_generate_day','6063cc5967bebe022814df5d82a46971'),
('public','phms_med_v23_generate_all_today','5cf582ba0380f33f4d0abc95aa6fab8d')) baseline(ns,name,hash) WHERE NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=baseline.ns AND p.proname=baseline.name AND md5(pg_get_functiondef(p.oid))=baseline.hash)) THEN RAISE EXCEPTION 'production_function_changed_rebase_required';END IF;
END $guard$;
CREATE OR REPLACE FUNCTION private.phms_validate_smart_medication(d jsonb)
RETURNS void LANGUAGE plpgsql SET search_path=public,private,pg_temp AS $$
DECLARE n numeric; quantity numeric; count_times integer; kind text:=d->>'schedule_kind'; iv integer; anchor date;
BEGIN
 IF d->>'schema_version' IS DISTINCT FROM 'phms.medication.draft.v1' OR jsonb_typeof(d->'input_values') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid_medication_schema';END IF;
 IF length(btrim(coalesce(d->>'generic_name',''))) NOT BETWEEN 2 AND 200 OR (d->>'input_values')~'ตัวอย่างเท่านั้น|ระบุ YYYY|ตรวจสอบจากฉลากยาจริง' THEN RAISE EXCEPTION 'medication_name_or_example_invalid';END IF;
 n:=private.phms_try_numeric(d->>'strength_value');quantity:=private.phms_try_numeric(d->>'dose_value');
 IF n IS NULL OR n<=0 OR n::text IN ('NaN','Infinity','-Infinity') OR quantity IS NULL OR quantity<=0 OR quantity::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'strength_or_dose_invalid';END IF;
 IF (d->>'strength_unit') IS NULL OR NOT ((d->>'strength_unit')=ANY(ARRAY['mg','mcg','g','IU','%','mg/mL','mcg/mL','IU/mL','mg/5mL','mg/5 mL'])) THEN RAISE EXCEPTION 'strength_unit_invalid';END IF;
 IF NOT coalesce((d->>'dose_unit')=ANY(ARRAY['เม็ด','แคปซูล','mL','หยด','ครั้งพ่น','ยูนิต','g']),false) THEN RAISE EXCEPTION 'dose_unit_invalid';END IF;
 IF nullif(d->>'dosage_form','') IS NULL OR nullif(d->>'instructions','') IS NULL THEN RAISE EXCEPTION 'form_and_instructions_required';END IF;
 IF d->>'dosage_form'='capsule' AND d->>'dose_unit'<>'แคปซูล' OR d->>'dosage_form'='tablet' AND d->>'dose_unit'<>'เม็ด' OR d->>'dosage_form'='eye drops' AND d->>'dose_unit'<>'หยด' THEN RAISE EXCEPTION 'dose_form_unit_invalid';END IF;
 IF NOT coalesce((d->>'route')=ANY(ARRAY['oral','ophthalmic','otic','topical','nasal','inhalation','subcutaneous','intramuscular','intravenous','sublingual']),false) THEN RAISE EXCEPTION 'route_required';END IF;
 IF d->>'route'='oral' AND NOT coalesce((d->>'meal_relation')=ANY(ARRAY['before_meal','after_meal','with_meal','empty_stomach','independent']),false) THEN RAISE EXCEPTION 'meal_relation_required';END IF;
 IF d->>'route'<>'oral' AND d->>'meal_relation' IS DISTINCT FROM 'not_applicable' THEN RAISE EXCEPTION 'meal_relation_invalid';END IF;
 IF d->>'route'='ophthalmic' AND NOT coalesce((d->>'administration_site')=ANY(ARRAY['ตาซ้าย','ตาขวา','ตาทั้งสองข้าง']),false) THEN RAISE EXCEPTION 'eye_side_required';END IF;
 anchor:=private.phms_try_date(d->>'start_date');
 IF anchor IS NULL OR (d->>'start_date')!~'^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'start_date_required';END IF;
 IF (d->>'schedule_interval')!~'^\d+$' THEN RAISE EXCEPTION 'schedule_interval_invalid';END IF;
 iv:=(d->>'schedule_interval')::integer;
 IF kind IS NULL OR kind NOT IN ('daily','weekday','interval_day','interval_week','interval_hour','prn') OR iv IS NULL OR iv NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'schedule_invalid';END IF;
 IF jsonb_typeof(d->'weekdays') IS DISTINCT FROM 'array' OR jsonb_typeof(d->'exact_times') IS DISTINCT FROM 'array' OR jsonb_typeof(d->'time_of_day') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'schedule_arrays_required';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(d->'weekdays') x WHERE x !~'^[0-6]$') OR
 (kind IN ('weekday','interval_week') AND jsonb_array_length(d->'weekdays')=0) THEN RAISE EXCEPTION 'weekdays_required';END IF;
 IF kind NOT IN ('weekday','interval_week') AND jsonb_array_length(d->'weekdays')>0 THEN RAISE EXCEPTION 'unexpected_weekdays';END IF;
 IF (d#>>'{input_values,frequency}')~'^ทุกวัน' AND (d#>>'{input_values,frequency}')<>'ทุกวัน' AND (SELECT coalesce(jsonb_agg(ord-1 ORDER BY ord),'[]'::jsonb) FROM unnest(ARRAY['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์']) WITH ORDINALITY x(name,ord) WHERE position(name IN (d#>>'{input_values,frequency}'))>0) IS DISTINCT FROM d->'weekdays' THEN RAISE EXCEPTION 'ambiguous_weekdays';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(d->'exact_times') x WHERE x!~'^([01][0-9]|2[0-3]):[0-5][0-9]$') OR
 EXISTS(SELECT 1 FROM jsonb_array_elements_text(d->'time_of_day') x WHERE x NOT IN ('morning','noon','evening','bedtime')) THEN RAISE EXCEPTION 'time_invalid';END IF;
 IF jsonb_array_length(d->'exact_times')>0 AND jsonb_array_length(d->'time_of_day')>0 THEN RAISE EXCEPTION 'ambiguous_time';END IF;
 IF (SELECT count(distinct x) FROM jsonb_array_elements_text(d->'exact_times') x)<>jsonb_array_length(d->'exact_times') THEN RAISE EXCEPTION 'duplicate_time';END IF;
 count_times:=greatest(jsonb_array_length(d->'exact_times'),jsonb_array_length(d->'time_of_day'));
 IF kind<>'prn' AND count_times NOT BETWEEN 1 AND 24 THEN RAISE EXCEPTION 'time_required';END IF;
 IF kind='interval_hour' AND (jsonb_array_length(d->'exact_times')<>1 OR iv>168) THEN RAISE EXCEPTION 'interval_hour_anchor_required';END IF;
 IF d->>'frequency_type'='times_per_day' AND private.phms_try_numeric(d->>'frequency_value') IS DISTINCT FROM count_times::numeric THEN RAISE EXCEPTION 'frequency_time_mismatch';END IF;
 IF d->>'frequency_type'='times_per_week' AND private.phms_try_numeric(d->>'frequency_value') IS DISTINCT FROM (count_times*jsonb_array_length(d->'weekdays'))::numeric THEN RAISE EXCEPTION 'frequency_weekday_time_mismatch';END IF;
 IF kind='prn' AND (d->>'status' IS DISTINCT FROM 'prn' OR nullif(d->>'prn_condition','') IS NULL) THEN RAISE EXCEPTION 'prn_condition_required';END IF;
 IF nullif(d#>>'{input_values,_ambiguities}','') IS NOT NULL OR nullif(d#>>'{input_values,_unknown_fields}','') IS NOT NULL THEN RAISE EXCEPTION 'ambiguous_medication_input';END IF;
END $$;
REVOKE ALL ON FUNCTION private.phms_validate_smart_medication(jsonb) FROM PUBLIC;
ALTER TABLE public.phms_runtime_environment
 ADD COLUMN medication_smart_intake_release_state text NOT NULL DEFAULT 'test_only' CHECK(medication_smart_intake_release_state IN ('off','test_only','general')),
 ADD COLUMN medication_smart_intake_test_actor_ids uuid[] NOT NULL DEFAULT '{}';
CREATE OR REPLACE FUNCTION private.phms_smart_medication_actor_enabled(p_actor uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
 SELECT coalesce((select medication_smart_intake_release_state='general' OR (medication_smart_intake_release_state='test_only' AND p_actor=ANY(medication_smart_intake_test_actor_ids)) from public.phms_runtime_environment where singleton=true),false)
$$;
REVOKE ALL ON FUNCTION private.phms_smart_medication_actor_enabled(uuid) FROM PUBLIC;
-- Extend the existing regimen contract; legacy schedules remain unchanged.
ALTER TABLE public.medication_regimens
 ADD COLUMN schedule_kind text NOT NULL DEFAULT 'legacy',
 ADD COLUMN schedule_interval integer,
 ADD COLUMN schedule_weekdays integer[] NOT NULL DEFAULT '{}',
 ADD COLUMN schedule_anchor_date date,
 ADD COLUMN schedule_timezone text NOT NULL DEFAULT 'Asia/Bangkok',
 ADD CONSTRAINT medication_schedule_kind_check CHECK(schedule_kind IN ('legacy','daily','weekday','interval_day','interval_week','interval_hour','prn')),
 ADD CONSTRAINT medication_schedule_interval_check CHECK(schedule_kind='legacy' OR (schedule_interval BETWEEN 1 AND 10000 AND schedule_anchor_date IS NOT NULL AND schedule_timezone='Asia/Bangkok')),
 ADD CONSTRAINT medication_schedule_weekdays_check CHECK(schedule_weekdays <@ ARRAY[0,1,2,3,4,5,6] AND (schedule_kind NOT IN ('weekday','interval_week') OR cardinality(schedule_weekdays)>0));

;
CREATE OR REPLACE FUNCTION private.phms_medication_due_on_date(p_kind text,p_interval integer,p_weekdays integer[],p_anchor date,p_day date)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT CASE WHEN p_anchor IS NULL OR p_day<p_anchor OR p_interval<1 THEN false
 WHEN p_kind='daily' THEN true
 WHEN p_kind='weekday' THEN extract(dow from p_day)::integer=ANY(p_weekdays)
 WHEN p_kind='interval_day' THEN (p_day-p_anchor)%p_interval=0
 WHEN p_kind='interval_week' THEN extract(dow from p_day)::integer=ANY(p_weekdays)
  AND ((date_trunc('week',p_day::timestamp)::date-date_trunc('week',p_anchor::timestamp)::date)/7)%p_interval=0
 WHEN p_kind='interval_hour' THEN true ELSE false END
$$;
REVOKE ALL ON FUNCTION private.phms_medication_due_on_date(text,integer,integer[],date,date) FROM PUBLIC;
CREATE OR REPLACE FUNCTION private.phms_medication_occurrences(p_kind text,p_interval integer,p_weekdays integer[],p_anchor date,p_day date,p_time time)
RETURNS TABLE(local_stamp timestamp,occurrence integer) LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE base timestamp; first_n integer;
BEGIN
 IF NOT private.phms_medication_due_on_date(p_kind,p_interval,p_weekdays,p_anchor,p_day) THEN RETURN;END IF;
 IF p_kind='interval_hour' THEN
  IF p_time IS NULL THEN RETURN;END IF;
  base:=p_anchor+p_time;
  first_n:=greatest(0,ceil(extract(epoch from (p_day::timestamp-base))/(3600*p_interval))::integer);
  RETURN QUERY SELECT base+make_interval(hours=>(first_n+g)*p_interval),g+1
   FROM generate_series(0,24) g WHERE base+make_interval(hours=>(first_n+g)*p_interval)<(p_day+1)::timestamp;
 ELSE RETURN QUERY SELECT p_day+p_time,1;END IF;
END $$;
REVOKE ALL ON FUNCTION private.phms_medication_occurrences(text,integer,integer[],date,date,time) FROM PUBLIC;

;
CREATE OR REPLACE FUNCTION private.phms_commit_medication_candidate(p_candidate_id uuid, p_actor_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'extensions'
AS $function$
declare
  v_c public.data_intake_candidates%rowtype;
  v_d jsonb;
  v_existing uuid;
  v_medication_id uuid;
  v_person_medication_id uuid;
  v_regimen_id uuid;
  v_generic text;
  v_brand text;
  v_key text;
  v_status text;
  v_strength numeric;
  v_start date;
  v_end date;
  v_has_regimen boolean;
  v_effective_from timestamptz;
  v_effective_to timestamptz;
  v_order uuid; v_instruction uuid; v_slot text; v_slot_no integer:=0; v_time time; v_kind text;
begin
  select * into v_c
  from public.data_intake_candidates
  where id=p_candidate_id
  for update;

  if not found then raise exception 'candidate_not_found'; end if;
  if v_c.candidate_type<>'medication' then raise exception 'candidate_type_not_medication'; end if;
  if v_c.review_status not in ('accepted','committed') then raise exception 'candidate_not_accepted'; end if;
  if v_c.person_id is null then raise exception 'person_required'; end if;

  v_existing := private.phms_existing_candidate_record(v_c.id,'person_medications');
  if v_existing is not null then
    select rp.record_id into v_regimen_id
    from public.record_provenance rp
    where rp.source_type='intake_candidate'
      and rp.source_record_id=v_c.id
      and rp.resource_type='medication_regimens'
    limit 1;

    select rp.record_id into v_medication_id
    from public.record_provenance rp
    where rp.source_type='intake_candidate'
      and rp.source_record_id=v_c.id
      and rp.resource_type='medication_master'
    limit 1;

    return jsonb_strip_nulls(jsonb_build_object(
      'ok',true,'idempotent_replay',true,
      'resource_type','medication',
      'medication_master_id',v_medication_id,
      'person_medication_id',v_existing,
      'medication_regimen_id',v_regimen_id
    ));
  end if;

  v_d := coalesce(v_c.normalized_data,'{}'::jsonb);
  IF v_d->>'schema_version'='phms.medication.draft.v1' THEN
    IF NOT private.phms_smart_medication_actor_enabled(p_actor_user_id) THEN RAISE EXCEPTION 'smart_medication_permission_denied';END IF;
    PERFORM private.phms_validate_smart_medication(v_d);
  END IF;
  v_medication_id := private.phms_try_uuid(v_d->>'medication_id');

  if v_medication_id is not null then
    if not exists(
      select 1 from public.medication_master
      where id=v_medication_id and deleted_at is null
    ) then
      raise exception 'medication_id_not_found';
    end if;
  else
    v_generic := nullif(btrim(coalesce(
      v_d->>'generic_name',
      v_d->>'medication_name',
      v_d->>'name',
      v_d->>'brand_name'
    )),'');
    v_brand := nullif(btrim(v_d->>'brand_name'),'');
    v_strength := private.phms_try_numeric(v_d->>'strength_value');

    if v_generic is null then
      raise exception 'medication_name_required';
    end if;

    v_key := nullif(private.phms_normalize_dedupe_text(v_d->>'normalized_key'),'');
    if v_key is null then
      v_key := private.phms_normalize_dedupe_text(
        concat_ws('|',
          v_generic,
          coalesce(v_brand,''),
          coalesce(v_d->>'strength_value',''),
          coalesce(v_d->>'strength_unit',''),
          coalesce(v_d->>'dosage_form','')
        )
      );
    end if;

    select mm.id into v_medication_id
    from public.medication_master mm
    where mm.normalized_key=v_key
      and mm.deleted_at is null
    limit 1;

    if v_medication_id is null then
      insert into public.medication_master(
        generic_name,brand_name,strength_value,strength_unit,
        concentration_text,dosage_form,default_route,standard_unit,
        active_ingredient_text,normalized_key,status
      )
      values(
        v_generic,
        v_brand,
        v_strength,
        nullif(btrim(v_d->>'strength_unit'),''),
        nullif(btrim(v_d->>'concentration_text'),''),
        nullif(btrim(v_d->>'dosage_form'),''),
        nullif(btrim(coalesce(v_d->>'default_route',v_d->>'route')),''),
        nullif(btrim(v_d->>'standard_unit'),''),
        nullif(btrim(v_d->>'active_ingredient_text'),''),
        v_key,
        'active'
      )
      on conflict do nothing
      returning id into v_medication_id;

      if v_medication_id is null then
        select mm.id into v_medication_id
        from public.medication_master mm
        where mm.normalized_key=v_key
          and mm.deleted_at is null
        limit 1;
      end if;
    end if;
  end if;

  if v_medication_id is null then raise exception 'medication_master_resolution_failed'; end if;

  v_status := lower(coalesce(nullif(btrim(v_d->>'status'),''),'regular'));
  if v_status not in ('regular','prn','paused','discontinued','completed') then
    v_status := 'regular';
  end if;

  v_start := private.phms_try_date(v_d->>'start_date');
  v_end := private.phms_try_date(v_d->>'end_date');

  insert into public.person_medications(
    person_id,medication_id,indication,related_condition_id,status,
    prescriber_id,organization_id,service_unit_id,
    start_date,end_date,notes,created_by
  )
  values(
    v_c.person_id,
    v_medication_id,
    nullif(btrim(v_d->>'indication'),''),
    private.phms_try_uuid(v_d->>'related_condition_id'),
    v_status,
    private.phms_try_uuid(v_d->>'prescriber_id'),
    private.phms_try_uuid(v_d->>'organization_id'),
    private.phms_try_uuid(v_d->>'service_unit_id'),
    v_start,
    v_end,
    nullif(btrim(coalesce(v_d->>'notes',v_d->>'note')),''),
    p_actor_user_id
  )
  returning id into v_person_medication_id;

  perform private.phms_write_intake_provenance(
    v_c.id,'medication_master',v_medication_id,p_actor_user_id
  );
  perform private.phms_write_intake_provenance(
    v_c.id,'person_medications',v_person_medication_id,p_actor_user_id
  );

  v_has_regimen :=
    nullif(btrim(v_d->>'dose_value'),'') is not null
    or nullif(btrim(v_d->>'dose_unit'),'') is not null
    or nullif(btrim(v_d->>'dose_text'),'') is not null
    or nullif(btrim(v_d->>'frequency_type'),'') is not null
    or nullif(btrim(v_d->>'frequency_value'),'') is not null
    or nullif(btrim(v_d->>'frequency_unit'),'') is not null
    or nullif(btrim(v_d->>'route'),'') is not null
    or nullif(btrim(v_d->>'meal_relation'),'') is not null
    or nullif(btrim(v_d->>'instructions'),'') is not null
    or jsonb_typeof(v_d->'time_of_day')='array'
    or jsonb_typeof(v_d->'exact_times')='array';

  if v_has_regimen then
    v_effective_from := coalesce(
      private.phms_try_timestamptz(v_d->>'effective_from'),
      case when v_start is not null then v_start::timestamp AT TIME ZONE 'Asia/Bangkok' else now() end
    );
    v_effective_to := private.phms_try_timestamptz(v_d->>'effective_to');

    insert into public.medication_regimens(
      person_medication_id,
      dose_value,dose_unit,dose_text,
      frequency_type,frequency_value,frequency_unit,
      route,administration_site,meal_relation,
      time_of_day,exact_times,
      max_daily_dose,max_daily_dose_unit,
      instructions,effective_from,effective_to,is_current,created_by
    )
    values(
      v_person_medication_id,
      private.phms_try_numeric(v_d->>'dose_value'),
      nullif(btrim(v_d->>'dose_unit'),''),
      nullif(btrim(v_d->>'dose_text'),''),
      nullif(btrim(v_d->>'frequency_type'),''),
      private.phms_try_numeric(v_d->>'frequency_value'),
      nullif(btrim(v_d->>'frequency_unit'),''),
      nullif(btrim(v_d->>'route'),''),
      nullif(btrim(v_d->>'administration_site'),''),
      nullif(btrim(v_d->>'meal_relation'),''),
      private.phms_jsonb_text_array(v_d->'time_of_day'),
      private.phms_jsonb_time_array(v_d->'exact_times'),
      private.phms_try_numeric(v_d->>'max_daily_dose'),
      nullif(btrim(v_d->>'max_daily_dose_unit'),''),
      nullif(btrim(v_d->>'instructions'),''),
      v_effective_from,
      v_effective_to,
      v_effective_to is null or v_effective_to>now(),
      p_actor_user_id
    )
    returning id into v_regimen_id;

    perform private.phms_write_intake_provenance(
      v_c.id,'medication_regimens',v_regimen_id,p_actor_user_id
    );
    IF v_d->>'schema_version'='phms.medication.draft.v1' THEN
      UPDATE public.medication_regimens SET schedule_kind=v_d->>'schedule_kind',schedule_interval=(v_d->>'schedule_interval')::integer,
       schedule_weekdays=ARRAY(SELECT value::integer FROM jsonb_array_elements_text(v_d->'weekdays')),
       schedule_anchor_date=(v_d->>'start_date')::date,schedule_timezone='Asia/Bangkok'
       WHERE id=v_regimen_id;
      INSERT INTO public.medication_instruction_sources(person_medication_id,source_kind,source_text,recorded_by,received_by,verification_status,verified_by,verified_at)
       VALUES(v_person_medication_id,'label',coalesce(v_d->>'source_text',v_d->>'instructions'),p_actor_user_id,p_actor_user_id,'verified',p_actor_user_id,now()) RETURNING id INTO v_instruction;
      PERFORM private.phms_write_intake_provenance(v_c.id,'medication_instruction_sources',v_instruction,p_actor_user_id);
      INSERT INTO public.medication_order_versions(person_medication_id,regimen_id,source_id,version_no,status,effective_from,effective_to,order_snapshot,recorded_by)
       VALUES(v_person_medication_id,v_regimen_id,v_instruction,1,'historical_unverified',v_effective_from,v_effective_to,
        v_d||jsonb_build_object('confirmation_basis','user_confirmed_label','source_candidate_id',v_c.id),p_actor_user_id) RETURNING id INTO v_order;
      IF v_d->>'schedule_kind'<>'prn' THEN
       FOR v_slot IN SELECT value FROM jsonb_array_elements_text(CASE WHEN jsonb_array_length(v_d->'exact_times')>0 THEN v_d->'exact_times' ELSE v_d->'time_of_day' END) LOOP
        v_slot_no:=v_slot_no+1;v_time:=CASE WHEN v_slot~'^[0-2][0-9]:[0-5][0-9]$' THEN v_slot::time ELSE NULL END;
        INSERT INTO public.medication_regimen_doses(order_version_id,slot_key,sequence_no,dose_quantity,dose_unit,local_time,timezone,route,administration_site,meal_relation,instructions,effective_from,effective_to)
         VALUES(v_order,v_slot,v_slot_no,(v_d->>'dose_value')::numeric,v_d->>'dose_unit',v_time,'Asia/Bangkok',v_d->>'route',v_d->>'administration_site',v_d->>'meal_relation',v_d->>'instructions',v_effective_from,v_effective_to);
       END LOOP;
      END IF;
      -- Verification records explicit user confirmation; no clinical instruction or time is inferred.
      UPDATE public.medication_order_versions SET status='verified',verified_at=now(),verified_by=p_actor_user_id WHERE id=v_order;
      PERFORM private.phms_write_intake_provenance(v_c.id,'medication_order_versions',v_order,p_actor_user_id);
      PERFORM public.phms_med_v23_generate_day(v_c.person_id,g::date,'Asia/Bangkok') FROM generate_series(
       greatest(v_start,(now() at time zone 'Asia/Bangkok')::date)::timestamp,
       (greatest(v_start,(now() at time zone 'Asia/Bangkok')::date)+31)::timestamp,interval '1 day') g;
    END IF;
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'ok',true,'idempotent_replay',false,
    'resource_type','medication',
    'medication_master_id',v_medication_id,
    'person_medication_id',v_person_medication_id,
    'medication_regimen_id',v_regimen_id
  ));
end
$function$

;
CREATE OR REPLACE FUNCTION public.phms_med_v23_generate_day(p_person_id uuid, p_day date, p_timezone text DEFAULT 'Asia/Bangkok'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE d record; num_created integer:=0; num_skipped integer:=0; planned timestamptz; rid uuid; local_stamp timestamp; inserted_count int;
BEGIN
 IF p_day IS NULL OR p_day<date '2000-01-01' OR p_day>(now() AT TIME ZONE 'Asia/Bangkok')::date+365 THEN RAISE EXCEPTION 'invalid_day';END IF;
 IF p_timezone<>'Asia/Bangkok' THEN RAISE EXCEPTION 'unsupported_timezone';END IF;
 FOR d IN
 SELECT v.*,pm.person_id,pm.medication_id,md.id AS rule_id,CASE WHEN r.schedule_kind='interval_hour' THEN to_char(occ.local_stamp,'HH24:MI') ELSE md.slot_key END AS slot_key,md.local_time,md.dose_quantity,md.dose_unit,
 md.route,md.administration_site,md.sequence_no,occ.local_stamp AS planned_local,occ.occurrence AS slot_occurrence,md.effective_from AS rule_from,md.effective_to AS rule_to
 FROM public.medication_order_versions v
 JOIN public.person_medications pm ON pm.id=v.person_medication_id
 JOIN public.medication_regimens r ON r.id=v.regimen_id AND r.person_medication_id=pm.id
 JOIN public.medication_regimen_doses md ON md.order_version_id=v.id
 CROSS JOIN LATERAL private.phms_medication_occurrences(
  CASE WHEN r.schedule_kind='legacy' THEN 'daily' ELSE r.schedule_kind END,
  coalesce(r.schedule_interval,1),r.schedule_weekdays,coalesce(r.schedule_anchor_date,pm.start_date,p_day),p_day,md.local_time) occ
 WHERE pm.person_id=p_person_id AND pm.deleted_at IS NULL AND pm.status='regular'
 AND (pm.start_date IS NULL OR pm.start_date<=p_day) AND (pm.end_date IS NULL OR pm.end_date>=p_day)
 AND v.status='verified' AND v.verified_at IS NOT NULL
 AND ((r.schedule_kind='legacy' AND r.frequency_type='times_per_day' AND r.frequency_unit='day') OR r.schedule_kind IN ('daily','weekday','interval_day','interval_week','interval_hour'))
 AND (md.local_time IS NOT NULL OR (r.schedule_kind<>'legacy' AND md.slot_key IN ('morning','noon','evening','bedtime'))) AND md.dose_quantity IS NOT NULL AND md.dose_quantity>0
 AND nullif(btrim(coalesce(md.dose_unit,'')),'') IS NOT NULL
 AND md.timezone=p_timezone
 AND NOT EXISTS (
  SELECT 1 FROM public.medication_conditional_rules c
  WHERE c.person_medication_id=pm.id AND (c.regimen_id IS NULL OR c.regimen_id=r.id)
    AND c.active=true AND c.deleted_at IS NULL
    AND (c.effective_from IS NULL OR c.effective_from<=((p_day+time '23:59:59') AT TIME ZONE p_timezone))
    AND (c.effective_to IS NULL OR c.effective_to>=(p_day::timestamp AT TIME ZONE p_timezone))
 )
 AND NOT EXISTS (
  SELECT 1 FROM public.medication_timing_policies tp
  JOIN public.medication_schedule_overrides o ON o.timing_policy_id=tp.id
  WHERE tp.regimen_id=r.id AND tp.active=true AND tp.deleted_at IS NULL AND o.schedule_date=p_day
 )
 ORDER BY md.slot_key,md.sequence_no
 LOOP
   local_stamp:=d.planned_local;
   planned:=local_stamp AT TIME ZONE p_timezone;
   IF d.effective_from IS NOT NULL AND coalesce(planned,((p_day+1)::timestamp AT TIME ZONE p_timezone)-interval '1 microsecond')<d.effective_from THEN CONTINUE; END IF;
   IF d.effective_to IS NOT NULL AND coalesce(planned,p_day::timestamp AT TIME ZONE p_timezone)>=d.effective_to THEN CONTINUE; END IF;
   IF d.rule_from IS NOT NULL AND coalesce(planned,((p_day+1)::timestamp AT TIME ZONE p_timezone)-interval '1 microsecond')<d.rule_from THEN CONTINUE; END IF;
   IF d.rule_to IS NOT NULL AND coalesce(planned,p_day::timestamp AT TIME ZONE p_timezone)>=d.rule_to THEN CONTINUE; END IF;
   INSERT INTO public.medication_round_instances(person_id,round_date,slot_key,timezone)
   VALUES(p_person_id,p_day,d.slot_key,p_timezone)
   ON CONFLICT(person_id,round_date,slot_key) DO NOTHING;
   SELECT id INTO rid FROM public.medication_round_instances WHERE person_id=p_person_id AND round_date=p_day AND slot_key=d.slot_key;
   INSERT INTO public.medication_scheduled_doses(person_id,person_medication_id,regimen_id,order_version_id,round_id,slot_key,scheduled_at,planned_date,timezone,planned_dose,planned_unit,order_snapshot,occurrence_no)
   VALUES(p_person_id,d.person_medication_id,d.regimen_id,d.id,rid,d.slot_key,planned,p_day,p_timezone,d.dose_quantity,d.dose_unit,
   jsonb_build_object('version',d.order_snapshot,'rule_id',d.rule_id,'slot',d.slot_key,'route',d.route,'site',d.administration_site,'dose',d.dose_quantity,'unit',d.dose_unit),(d.sequence_no-1)*100+d.slot_occurrence)
   ON CONFLICT DO NOTHING;
   GET DIAGNOSTICS inserted_count=ROW_COUNT;
   IF inserted_count=1 THEN num_created:=num_created+1; ELSE num_skipped:=num_skipped+1;END IF;
 END LOOP;
 RETURN jsonb_build_object('created',num_created,'already_present',num_skipped);
END $function$

;
CREATE OR REPLACE FUNCTION public.phms_finalize_line_intake_review(p_line_user_id text, p_source_code text, p_decision text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'extensions'
AS $function$
declare
  v_line public.line_identities%rowtype;
  v_source public.data_intake_sources%rowtype;
  v_session public.data_intake_sessions%rowtype;
  v_code text := lower(btrim(coalesce(p_source_code,'')));
  v_decision text := lower(btrim(coalesce(p_decision,'')));
  v_match_count integer;
  v_candidates integer;
  v_validation_blocking integer;
  v_conflict_blocking integer;
  v_person_name text;
  v_cid uuid;
  v_result jsonb; v_ctx record; v_error text;
begin
  if v_decision not in ('confirm','cancel','commit','reopen') then raise exception 'invalid_review_decision'; end if;
  if length(v_code)<8 then raise exception 'source_code_too_short'; end if;

  select * into v_line from public.line_identities
  where line_user_id=p_line_user_id and coalesce(is_active,false)=true
  limit 1;
  if not found or v_line.user_id is null then raise exception 'line_identity_not_linked'; end if;

  select count(*) into v_match_count
  from public.data_intake_sources s
  where s.submitted_by=v_line.user_id
    and lower(s.id::text) like v_code||'%';
  if v_match_count=0 then raise exception 'intake_source_not_found'; end if;
  if v_match_count>1 then raise exception 'intake_source_code_ambiguous'; end if;

  select * into v_source
  from public.data_intake_sources s
  where s.submitted_by=v_line.user_id
    and lower(s.id::text) like v_code||'%'
  limit 1;

  select * into v_session
  from public.data_intake_sessions
  where id=v_source.session_id
  for update;

  IF v_decision IN ('commit','reopen') THEN
   SELECT * INTO v_ctx FROM private.phms_line_crud_context(p_line_user_id,'medication','create');
   IF v_ctx.actor_user_id IS DISTINCT FROM v_session.submitted_by OR v_ctx.target_person_id IS DISTINCT FROM v_session.person_id
    OR v_ctx.active_family_id IS DISTINCT FROM v_session.family_id THEN RAISE EXCEPTION 'intake_context_changed';END IF;
   IF EXISTS(SELECT 1 FROM public.data_intake_candidates WHERE source_id=v_source.id AND candidate_type<>'medication') THEN RAISE EXCEPTION 'smart_medication_source_required'; END IF;
   IF v_session.status='committed' THEN
    SELECT result INTO v_result FROM public.data_intake_commit_batches WHERE session_id=v_session.id AND status='committed';
    RETURN coalesce(v_result,'{}'::jsonb)||jsonb_build_object('idempotent_replay',true,'already_committed',true);
   END IF;
   IF v_decision='reopen' THEN
    IF v_session.status IN ('cancelled','rejected') THEN RAISE EXCEPTION 'intake_session_not_editable';END IF;
    IF EXISTS(SELECT 1 FROM public.record_provenance rp JOIN public.data_intake_candidates c ON rp.source_record_id=c.id AND rp.source_type='intake_candidate' WHERE c.session_id=v_session.id)
     THEN RAISE EXCEPTION 'canonical_record_already_exists';END IF;
    UPDATE public.data_intake_sessions SET status='review',updated_at=now() WHERE id=v_session.id;
    UPDATE public.data_intake_candidates SET review_status='needs_review',updated_at=now() WHERE source_id=v_source.id AND review_status='accepted';
    UPDATE public.data_intake_sources SET source_metadata=source_metadata||jsonb_build_object('review_decision','pending','canonical_commit',false) WHERE id=v_source.id;
    RETURN jsonb_build_object('ok',true,'source_code',substr(v_source.id::text,1,12),'session_status','review','canonical_commit',false);
   END IF;
   BEGIN
    PERFORM public.phms_finalize_line_intake_review(p_line_user_id,p_source_code,'confirm');
    v_result:=public.phms_line_try_canonical_commit(p_line_user_id,p_source_code);
    IF NOT coalesce((v_result->>'canonical_commit')::boolean,false) THEN
     RAISE EXCEPTION '%',coalesce(v_result->>'error',v_result->>'reason',v_result#>>'{guard,reason}','commit_blocked');
    END IF;
    RETURN v_result;
   EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error=MESSAGE_TEXT;
    RETURN jsonb_build_object('ok',false,'canonical_commit',false,'source_code',substr(v_source.id::text,1,12),'draft_preserved',true,'error_code',
     CASE WHEN v_error ILIKE '%permission%' OR v_error ILIKE '%denied%' THEN 'permission_denied'
     WHEN v_error ILIKE '%conflict%' OR v_error ILIKE '%duplicate%' THEN 'conflict'
     WHEN v_error ILIKE '%validation%' OR v_error ILIKE '%required%' OR v_error ILIKE '%invalid%' THEN 'validation_failed'
     WHEN v_error ILIKE '%timeout%' OR v_error ILIKE '%cancel%' THEN 'timeout' ELSE 'commit_blocked' END);
   END;
  END IF;

  if v_decision='cancel' then
    if v_session.status='cancelled' then
      return jsonb_build_object(
        'ok',true,'idempotent_replay',true,'decision','cancel',
        'source_id',v_source.id,'source_code',substr(v_source.id::text,1,12),
        'session_status','cancelled','canonical_commit',false
      );
    end if;
    if v_session.status in ('confirmed','committed') then
      raise exception 'confirmed_intake_cannot_be_cancelled_here';
    end if;

    update public.data_intake_candidates
    set review_status='rejected',updated_at=now()
    where source_id=v_source.id
      and review_status not in ('committed');

    update public.data_intake_sessions
    set status='cancelled',updated_at=now()
    where id=v_session.id;

    update public.data_intake_sources
    set source_metadata=
      coalesce(source_metadata,'{}'::jsonb)
      || jsonb_build_object(
           'review_decision','cancelled',
           'reviewed_at',now(),
           'canonical_commit',false
         )
    where id=v_source.id;

    insert into public.data_intake_actions(
      session_id,actor_user_id,action,after_data
    )
    values(
      v_session.id,v_line.user_id,'cancel',
      jsonb_build_object('source_id',v_source.id,'canonical_commit',false)
    );

    return jsonb_build_object(
      'ok',true,'idempotent_replay',false,'decision','cancel',
      'source_id',v_source.id,'source_code',substr(v_source.id::text,1,12),
      'session_status','cancelled','canonical_commit',false
    );
  end if;

  if v_session.status in ('confirmed','committed') then
    return jsonb_build_object(
      'ok',true,'idempotent_replay',true,'decision','confirm',
      'source_id',v_source.id,'source_code',substr(v_source.id::text,1,12),
      'session_status','confirmed','canonical_commit',false
    );
  end if;
  if v_session.status in ('cancelled','rejected','committed') then
    raise exception 'intake_session_not_confirmable';
  end if;
  if coalesce(v_source.source_metadata->>'extraction_status','') <> 'completed' then
    raise exception 'extraction_not_completed';
  end if;
  if v_session.person_id is null then
    raise exception 'person_required';
  end if;

  -- Reconcile against the latest state immediately before confirmation.
  for v_cid in
    select c.id
    from public.data_intake_candidates c
    where c.source_id=v_source.id
      and c.review_status not in ('rejected','committed')
  loop
    perform private.phms_reconcile_intake_candidate_core(v_cid);
  end loop;

  select
    count(*),
    count(*) filter (
      where jsonb_array_length(coalesce(c.validation_data->'blocking_errors','[]'::jsonb))>0
    ),
    count(*) filter (
      where jsonb_array_length(coalesce(c.conflict_data->'blocking_conflicts','[]'::jsonb))>0
    )
  into v_candidates,v_validation_blocking,v_conflict_blocking
  from public.data_intake_candidates c
  where c.source_id=v_source.id
    and c.review_status not in ('rejected');

  if v_candidates=0 then raise exception 'candidate_required'; end if;
  if v_validation_blocking>0 then raise exception 'candidate_validation_failed'; end if;
  if v_conflict_blocking>0 then raise exception 'candidate_conflict_blocked'; end if;

  update public.data_intake_candidates
  set review_status='accepted',updated_at=now()
  where source_id=v_source.id
    and review_status in ('pending','needs_review','edited');

  update public.data_intake_sessions
  set status='confirmed',updated_at=now()
  where id=v_session.id;

  update public.data_intake_sources
  set source_metadata=
    coalesce(source_metadata,'{}'::jsonb)
    || jsonb_build_object(
         'review_decision','confirmed',
         'reviewed_at',now(),
         'duplicate_conflict_check','passed',
         'canonical_commit',false,
         'commit_stage','12J_not_started'
       )
  where id=v_source.id;

  insert into public.data_intake_actions(
    session_id,actor_user_id,action,after_data
  )
  values(
    v_session.id,v_line.user_id,'confirm',
    jsonb_build_object(
      'source_id',v_source.id,
      'candidate_count',v_candidates,
      'person_id',v_session.person_id,
      'duplicate_conflict_check','passed',
      'canonical_commit',false,
      'next_stage','12J'
    )
  );

  select coalesce(nullif(btrim(p.display_name),''),
                  nullif(btrim(concat_ws(' ',p.first_name,p.last_name)),''),
                  'ไม่ระบุชื่อ')
  into v_person_name
  from public.persons p where p.id=v_session.person_id;

  return jsonb_build_object(
    'ok',true,'idempotent_replay',false,'decision','confirm',
    'source_id',v_source.id,'source_code',substr(v_source.id::text,1,12),
    'session_status','confirmed',
    'person_id',v_session.person_id,
    'person_name',v_person_name,
    'document_type',v_source.document_type,
    'candidate_count',v_candidates,
    'duplicate_conflict_check','passed',
    'canonical_commit',false,
    'next_stage','12J'
  );
end
$function$

;
CREATE OR REPLACE FUNCTION public.phms_record_line_manual_structured_extraction(p_line_user_id text, p_source_code text, p_document_type text, p_manual_text text, p_normalized_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions'
AS $function$
declare
  v_line public.line_identities%rowtype;
  v_source public.data_intake_sources%rowtype;
  v_session public.data_intake_sessions%rowtype;
  v_code text := lower(btrim(coalesce(p_source_code,'')));
  v_doc text := lower(btrim(coalesce(p_document_type,'')));
  v_text text := left(btrim(coalesce(p_manual_text,'')),8000);
  v_match_count integer;
  v_candidate_type text;
  v_norm jsonb := coalesce(p_normalized_data,'{}'::jsonb);
begin
  if length(v_code)<8 then raise exception 'source_code_too_short'; end if;
  if length(v_text)<2 then raise exception 'manual_text_required'; end if;
  if jsonb_typeof(v_norm)<>'object' then raise exception 'normalized_data_object_required'; end if;
  if v_doc not in ('appointment','medication_label','medical_document','free_text') then
    raise exception 'invalid_manual_document_type';
  end if;

  select * into v_line
  from public.line_identities
  where line_user_id=p_line_user_id and coalesce(is_active,false)=true
  limit 1;
  if not found or v_line.user_id is null then raise exception 'line_identity_not_linked'; end if;

  select count(*) into v_match_count
  from public.data_intake_sources s
  where s.submitted_by=v_line.user_id
    and lower(s.id::text) like v_code||'%';
  if v_match_count=0 then raise exception 'intake_source_not_found'; end if;
  if v_match_count>1 then raise exception 'intake_source_code_ambiguous'; end if;

  select * into v_source
  from public.data_intake_sources s
  where s.submitted_by=v_line.user_id
    and lower(s.id::text) like v_code||'%'
  limit 1;

  select * into v_session
  from public.data_intake_sessions
  where id=v_source.session_id FOR UPDATE;
  if not found then raise exception 'intake_session_not_found'; end if;
  if v_session.status in ('confirmed','committed','cancelled','rejected') then
    raise exception 'intake_session_already_final';
  end if;

  v_candidate_type := case
    when v_doc='appointment' then 'appointment'
    when v_doc='medication_label' then 'medication'
    else 'medical_document'
  end;

  if v_doc='appointment'
     and private.phms_try_timestamptz(v_norm->>'appointment_at') is null then
    raise exception 'appointment_at_required';
  end if;

  v_norm := v_norm || jsonb_build_object(
    'source_text',v_text,
    'document_type',v_doc,
    'extraction_mode','human_manual'
  );

  perform public.phms_record_line_intake_extraction(
    v_source.id,
    v_doc,
    v_text,
    jsonb_build_array(jsonb_build_object(
      'candidate_type',v_candidate_type,
      'raw_line',left(v_text,1500),
      'normalized_data',v_norm,
      'confidence_data',jsonb_build_object(
        'human_entered',true,
        'ocr_location','human_manual',
        'provider','human_manual',
        'quality_score',1.0
      )
    )),
    'human_manual',
    '[]'::jsonb
  );

  update public.data_intake_sources
  set source_metadata=
    coalesce(source_metadata,'{}'::jsonb)
    || jsonb_build_object(
         'manual_fallback',true,
         'manual_completed_at',now(),
         'extraction_provider','human_manual',
         'ocr_location','human_manual',
         'auto_commit',false,
         'canonical_commit',false
       )
  where id=v_source.id;

  return public.phms_get_line_intake_review_source(
    p_line_user_id,
    v_source.id
  );
end
$function$

;
CREATE OR REPLACE FUNCTION public.phms_line_crud_list_v2(p_line_user_id text, p_resource text, p_offset integer DEFAULT 0, p_page_size integer DEFAULT 8)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'extensions'
AS $function$
declare
  v_key text:=private.phms_crud_resource_key(p_resource);
  v_ctx record;
  v_items jsonb:='[]'::jsonb;
  v_total integer:=0;
  v_offset integer:=greatest(coalesce(p_offset,0),0);
  v_size integer:=least(greatest(coalesce(p_page_size,8),1),50);
begin
  if v_key is null then raise exception 'invalid_crud_resource'; end if;
  select * into v_ctx from private.phms_line_crud_context(p_line_user_id,v_key,'view') limit 1;

  if v_key='medication' then
    select count(*)::int into v_total from public.person_medications pm
    where pm.person_id=v_ctx.target_person_id and pm.deleted_at is null;

    select coalesce(jsonb_agg(x.item order by x.sort_at desc),'[]'::jsonb) into v_items
    from (
      select coalesce(pm.updated_at,pm.created_at) sort_at,
        jsonb_strip_nulls(jsonb_build_object(
          'id',pm.id,'code',substr(pm.id::text,1,12),'resource','medication',
          'name',coalesce(mm.brand_name,mm.generic_name),'generic_name',mm.generic_name,'brand_name',mm.brand_name,
          'strength_value',mm.strength_value,'strength_unit',mm.strength_unit,'status',pm.status,
          'indication',pm.indication,'notes',pm.notes,'dose_text',mr.dose_text,
          'schedule_kind',mr.schedule_kind,'schedule_interval',mr.schedule_interval,'weekdays',mr.schedule_weekdays,'schedule_anchor_date',mr.schedule_anchor_date,'schedule_timezone',mr.schedule_timezone,'frequency_type',mr.frequency_type,'frequency_value',mr.frequency_value,'frequency_unit',mr.frequency_unit,
          'route',mr.route,'meal_relation',mr.meal_relation,'instructions',mr.instructions,
          'created_at',pm.created_at,'updated_at',pm.updated_at
        )) item
      from public.person_medications pm
      join public.medication_master mm on mm.id=pm.medication_id
      left join lateral (
        select r.* from public.medication_regimens r
        where r.person_medication_id=pm.id and r.deleted_at is null and r.is_current=true
        order by r.effective_from desc,r.created_at desc limit 1
      ) mr on true
      where pm.person_id=v_ctx.target_person_id and pm.deleted_at is null
      order by coalesce(pm.updated_at,pm.created_at) desc,pm.id
      offset v_offset limit v_size
    ) x;

  elsif v_key='appointment' then
    select count(*)::int into v_total from public.appointments a
    where a.person_id=v_ctx.target_person_id and a.deleted_at is null;

    select coalesce(jsonb_agg(x.item order by x.sort_at desc),'[]'::jsonb) into v_items
    from (
      select coalesce(a.appointment_at,a.created_at) sort_at,
        jsonb_strip_nulls(jsonb_build_object(
          'id',a.id,'code',substr(a.id::text,1,12),'resource','appointment',
          'title',a.title,'hospital_name',a.hospital_name,'department',a.department,'doctor_name',a.doctor_name,
          'appointment_at',a.appointment_at,'note',a.note,'status',a.status,'appointment_type',a.appointment_type,
          'created_at',a.created_at,'updated_at',a.updated_at
        )) item
      from public.appointments a
      where a.person_id=v_ctx.target_person_id and a.deleted_at is null
      order by coalesce(a.appointment_at,a.created_at) desc,a.id
      offset v_offset limit v_size
    ) x;

  elsif v_key='health' then
    select count(*)::int into v_total from public.health_measurements h
    where h.person_id=v_ctx.target_person_id and h.deleted_at is null;

    select coalesce(jsonb_agg(x.item order by x.sort_at desc),'[]'::jsonb) into v_items
    from (
      select h.measured_at sort_at,
        jsonb_strip_nulls(jsonb_build_object(
          'id',h.id,'code',substr(h.id::text,1,12),'resource','health',
          'measurement_type',h.measurement_type,'measured_at',h.measured_at,
          'value_numeric',h.value_numeric,'value_text',h.value_text,'unit',h.unit,
          'systolic',h.systolic,'diastolic',h.diastolic,'context',h.context,'notes',h.notes,
          'source_type',h.source_type,'created_at',h.created_at
        )) item
      from public.health_measurements h
      where h.person_id=v_ctx.target_person_id and h.deleted_at is null
      order by h.measured_at desc,h.created_at desc,h.id
      offset v_offset limit v_size
    ) x;

  else
    select count(*)::int into v_total from public.medical_documents d
    where d.person_id=v_ctx.target_person_id and d.deleted_at is null;

    select coalesce(jsonb_agg(x.item order by x.sort_at desc),'[]'::jsonb) into v_items
    from (
      select coalesce(d.document_date::timestamptz,d.created_at) sort_at,
        jsonb_strip_nulls(jsonb_build_object(
          'id',d.id,'code',substr(d.id::text,1,12),'resource','document',
          'document_type',d.document_type,'document_date',d.document_date,'title',d.title,
          'original_filename',d.original_filename,'mime_type',d.mime_type,
          'extraction_status',d.extraction_status,'storage_asset_id',d.storage_asset_id,
          'created_at',d.created_at,'updated_at',d.updated_at
        )) item
      from public.medical_documents d
      where d.person_id=v_ctx.target_person_id and d.deleted_at is null
      order by d.document_date desc nulls last,d.created_at desc,d.id
      offset v_offset limit v_size
    ) x;
  end if;

  return jsonb_build_object(
    'ok',true,'resource',v_key,'person_id',v_ctx.target_person_id,'person_name',v_ctx.target_person_name,
    'total_count',v_total,'offset',v_offset,'page_size',v_size,'items',v_items
  );
end
$function$

;
CREATE OR REPLACE FUNCTION public.phms_line_crud_list(p_line_user_id text, p_resource text, p_limit integer DEFAULT 8)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'extensions'
AS $function$
declare
  v_key text:=private.phms_crud_resource_key(p_resource);
  v_ctx record;
  v_items jsonb:='[]'::jsonb;
  v_limit integer:=greatest(1,least(coalesce(p_limit,8),20));
begin
  if v_key is null then raise exception 'invalid_crud_resource'; end if;

  select * into v_ctx
  from private.phms_line_crud_context(p_line_user_id,v_key,'view')
  limit 1;

  if v_key='medication' then
    select coalesce(jsonb_agg(x.item order by x.sort_at desc),'[]'::jsonb)
    into v_items
    from (
      select pm.created_at sort_at,
        jsonb_strip_nulls(jsonb_build_object(
          'id',pm.id,'code',substr(pm.id::text,1,12),
          'resource','medication',
          'name',coalesce(mm.brand_name,mm.generic_name),
          'generic_name',mm.generic_name,
          'brand_name',mm.brand_name,
          'strength_value',mm.strength_value,
          'strength_unit',mm.strength_unit,
          'status',pm.status,
          'indication',pm.indication,
          'notes',pm.notes,
          'dose_text',mr.dose_text,
          'schedule_kind',mr.schedule_kind,'schedule_interval',mr.schedule_interval,'weekdays',mr.schedule_weekdays,'schedule_anchor_date',mr.schedule_anchor_date,'schedule_timezone',mr.schedule_timezone,'frequency_type',mr.frequency_type,
          'frequency_value',mr.frequency_value,
          'frequency_unit',mr.frequency_unit,
          'route',mr.route,
          'meal_relation',mr.meal_relation,
          'instructions',mr.instructions,
          'created_at',pm.created_at,
          'updated_at',pm.updated_at
        )) item
      from public.person_medications pm
      join public.medication_master mm on mm.id=pm.medication_id
      left join lateral (
        select r.*
        from public.medication_regimens r
        where r.person_medication_id=pm.id
          and r.deleted_at is null
          and r.is_current=true
        order by r.effective_from desc,r.created_at desc
        limit 1
      ) mr on true
      where pm.person_id=v_ctx.target_person_id
        and pm.deleted_at is null
      order by pm.updated_at desc nulls last,pm.created_at desc
      limit v_limit
    ) x;

  elsif v_key='appointment' then
    select coalesce(jsonb_agg(x.item order by x.sort_at desc),'[]'::jsonb)
    into v_items
    from (
      select coalesce(a.appointment_at,a.created_at) sort_at,
        jsonb_strip_nulls(jsonb_build_object(
          'id',a.id,'code',substr(a.id::text,1,12),
          'resource','appointment',
          'title',a.title,'hospital_name',a.hospital_name,
          'department',a.department,'doctor_name',a.doctor_name,
          'appointment_at',a.appointment_at,'note',a.note,
          'status',a.status,'appointment_type',a.appointment_type,
          'created_at',a.created_at,'updated_at',a.updated_at
        )) item
      from public.appointments a
      where a.person_id=v_ctx.target_person_id
        and a.deleted_at is null
      order by a.appointment_at desc nulls last,a.created_at desc
      limit v_limit
    ) x;

  elsif v_key='health' then
    select coalesce(jsonb_agg(x.item order by x.sort_at desc),'[]'::jsonb)
    into v_items
    from (
      select h.measured_at sort_at,
        jsonb_strip_nulls(jsonb_build_object(
          'id',h.id,'code',substr(h.id::text,1,12),
          'resource','health',
          'measurement_type',h.measurement_type,
          'measured_at',h.measured_at,
          'value_numeric',h.value_numeric,'value_text',h.value_text,
          'unit',h.unit,'systolic',h.systolic,'diastolic',h.diastolic,
          'context',h.context,'notes',h.notes,'source_type',h.source_type,
          'created_at',h.created_at
        )) item
      from public.health_measurements h
      where h.person_id=v_ctx.target_person_id
        and h.deleted_at is null
      order by h.measured_at desc,h.created_at desc
      limit v_limit
    ) x;

  else
    select coalesce(jsonb_agg(x.item order by x.sort_at desc),'[]'::jsonb)
    into v_items
    from (
      select coalesce(d.document_date::timestamptz,d.created_at) sort_at,
        jsonb_strip_nulls(jsonb_build_object(
          'id',d.id,'code',substr(d.id::text,1,12),
          'resource','document',
          'document_type',d.document_type,
          'document_date',d.document_date,
          'title',d.title,
          'original_filename',d.original_filename,
          'mime_type',d.mime_type,
          'extraction_status',d.extraction_status,
          'storage_asset_id',d.storage_asset_id,
          'created_at',d.created_at,'updated_at',d.updated_at
        )) item
      from public.medical_documents d
      where d.person_id=v_ctx.target_person_id
        and d.deleted_at is null
      order by d.document_date desc nulls last,d.created_at desc
      limit v_limit
    ) x;
  end if;

  return jsonb_build_object(
    'ok',true,
    'resource',v_key,
    'person_id',v_ctx.target_person_id,
    'person_name',v_ctx.target_person_name,
    'count',jsonb_array_length(v_items),
    'items',v_items
  );
end
$function$

;
CREATE OR REPLACE FUNCTION public.phms_line_crud_detail(p_line_user_id text, p_resource text, p_record_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'extensions'
AS $function$
declare
  v_key text:=private.phms_crud_resource_key(p_resource);
  v_ref record;
  v_item jsonb;
  v_created_by uuid;
  v_created_by_name text;
begin
  if v_key='appointment' then
    select * into v_ref
    from private.phms_line_appointment_access(
      p_line_user_id,p_record_code
    )
    limit 1;

    if coalesce(v_ref.full_access,false) then
      select
        jsonb_strip_nulls(
          (to_jsonb(a)-'contact_phone'-'contact_email')||jsonb_build_object(
            'code',substr(a.id::text,1,12),
            'resource','appointment'
          )
        ),
        a.created_by
      into v_item,v_created_by
      from public.appointments a
      where a.id=v_ref.record_id;
    else
      select
        jsonb_strip_nulls(jsonb_build_object(
          'id',a.id,
          'code',substr(a.id::text,1,12),
          'resource','appointment',
          'title',a.title,
          'appointment_at',a.appointment_at,
          'hospital_name',a.hospital_name,
          'care_topic',a.care_topic,
          'department',a.department,
          'doctor_name',a.doctor_name,
          'location_detail',a.location_detail,
          'arrival_lead_minutes',a.arrival_lead_minutes,
          'status',a.status,
          'note',a.note,
          'preparation_notes',a.preparation_notes,
          'visit_outcome_notes',a.visit_outcome_notes,
          'diagnosis_summary',a.diagnosis_summary,
          'treatment_summary',a.treatment_summary,
          'next_steps',a.next_steps,
          'medication_plan_notes',a.medication_plan_notes,
          'test_results_summary',a.test_results_summary,
          'followup_required',a.followup_required,
          'followup_recorded_at',a.followup_recorded_at
        )),
        null::uuid
      into v_item,v_created_by
      from public.appointments a
      where a.id=v_ref.record_id;
    end if;

    return jsonb_build_object(
      'ok',true,
      'resource','appointment',
      'person_id',v_ref.target_person_id,
      'person_name',v_ref.target_person_name,
      'access',jsonb_build_object(
        'has_person_view',coalesce(v_ref.has_person_view,false),
        'can_update',coalesce(v_ref.can_update,false),
        'is_assignee',coalesce(v_ref.is_assignee,false),
        'full_access',coalesce(v_ref.full_access,false),
        'detail_access',case when coalesce(v_ref.full_access,false) then 'full' else 'limited' end
      ),
      'item',v_item
    );
  end if;

  select * into v_ref
  from private.phms_find_crud_record(
    p_line_user_id,p_resource,p_record_code,'view'
  )
  limit 1;

  if v_ref.resource_key='medication' then
    select
      jsonb_strip_nulls(jsonb_build_object(
        'id',pm.id,'code',substr(pm.id::text,1,12),'resource','medication',
        'person_id',pm.person_id,
        'name',coalesce(mm.brand_name,mm.generic_name),
        'generic_name',mm.generic_name,'brand_name',mm.brand_name,
        'strength_value',mm.strength_value,'strength_unit',mm.strength_unit,
        'dosage_form',mm.dosage_form,
        'status',pm.status,'indication',pm.indication,
        'start_date',pm.start_date,'end_date',pm.end_date,'notes',pm.notes,
        'regimen_id',mr.id,'dose_value',mr.dose_value,'dose_unit',mr.dose_unit,
        'dose_text',mr.dose_text,'schedule_kind',mr.schedule_kind,'schedule_interval',mr.schedule_interval,'weekdays',mr.schedule_weekdays,'schedule_anchor_date',mr.schedule_anchor_date,'schedule_timezone',mr.schedule_timezone,'frequency_type',mr.frequency_type,
        'frequency_value',mr.frequency_value,'frequency_unit',mr.frequency_unit,
        'route',mr.route,'meal_relation',mr.meal_relation,
        'time_of_day',mr.time_of_day,'exact_times',mr.exact_times,
        'instructions',mr.instructions,
        'created_at',pm.created_at,'updated_at',pm.updated_at
      )),
      pm.created_by
    into v_item,v_created_by
    from public.person_medications pm
    join public.medication_master mm on mm.id=pm.medication_id
    left join lateral (
      select r.* from public.medication_regimens r
      where r.person_medication_id=pm.id
        and r.deleted_at is null and r.is_current=true
      order by r.effective_from desc,r.created_at desc limit 1
    ) mr on true
    where pm.id=v_ref.record_id;

  elsif v_ref.resource_key='health' then
    select
      jsonb_strip_nulls(to_jsonb(h)||jsonb_build_object(
        'code',substr(h.id::text,1,12),'resource','health'
      )),
      h.created_by
    into v_item,v_created_by
    from public.health_measurements h
    where h.id=v_ref.record_id;

  else
    select
      jsonb_strip_nulls(to_jsonb(d)||jsonb_build_object(
        'code',substr(d.id::text,1,12),'resource','document'
      )),
      d.created_by
    into v_item,v_created_by
    from public.medical_documents d
    where d.id=v_ref.record_id;
  end if;

  if v_created_by is not null and v_ref.active_family_id is not null then
    v_created_by_name:=private.family_user_label_for_viewer(
      v_ref.actor_user_id,v_ref.active_family_id,v_created_by
    );
  elsif v_created_by is not null then
    select coalesce(
      nullif(btrim(p.display_name),''),
      nullif(btrim(li.display_name),''),
      'สมาชิก'
    )
    into v_created_by_name
    from public.profiles p
    left join lateral (
      select x.display_name
      from public.line_identities x
      where x.user_id=v_created_by and x.is_active=true
      order by x.updated_at desc nulls last
      limit 1
    ) li on true
    where p.id=v_created_by;
  end if;

  if v_created_by_name is not null then
    v_item:=v_item||jsonb_build_object(
      'created_by_name',v_created_by_name
    );
  end if;

  return jsonb_build_object(
    'ok',true,
    'resource',v_ref.resource_key,
    'person_id',v_ref.target_person_id,
    'person_name',v_ref.target_person_name,
    'item',v_item
  );
end
$function$

;
CREATE OR REPLACE FUNCTION private.phms_generate_medication_notifications(p_now timestamp with time zone DEFAULT now())
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'extensions'
AS $function$
declare
  v_count integer:=0;
begin
  with local_dates as (
    select ((p_now at time zone 'Asia/Bangkok')::date + g)::date as dose_date
    from generate_series(-1,1) g
  ),
  policy_times as (
    select
      pm.id person_medication_id,
      pm.person_id,
      r.id regimen_id,
      tp.id timing_policy_id,
      concat('policy:',tp.id::text) source_key,
      (
        (d.dose_date + tp.household_time)
        at time zone 'Asia/Bangkok'
      ) dose_at,
      (
        (
          (d.dose_date + tp.household_time)
          at time zone 'Asia/Bangkok'
        )
        - make_interval(mins=>tp.reminder_offset_minutes)
      ) scheduled_for,
      p.display_name,
      p.first_name,
      p.last_name,
      mm.generic_name,
      mm.brand_name,
      mm.strength_value,
      mm.strength_unit,
      r.dose_text,
      r.instructions
    from public.person_medications pm
    join public.medication_master mm on mm.id=pm.medication_id
    join public.medication_regimens r
      on r.person_medication_id=pm.id
     and r.deleted_at is null
     and r.is_current=true
    join public.medication_timing_policies tp
      on tp.person_medication_id=pm.id
     and tp.deleted_at is null
     and tp.active=true
     and tp.household_time is not null
     and (tp.regimen_id is null or tp.regimen_id=r.id)
    join public.persons p on p.id=pm.person_id
    cross join local_dates d
    where r.schedule_kind='legacy' AND pm.deleted_at is null
      and pm.status='regular'
      and mm.deleted_at is null
      and mm.status='active'
      and (pm.start_date is null or d.dose_date>=pm.start_date)
      and (pm.end_date is null or d.dose_date<=pm.end_date)
      and r.effective_from<=(
        (d.dose_date + tp.household_time) at time zone 'Asia/Bangkok'
      )
      and (
        r.effective_to is null
        or r.effective_to>(
          (d.dose_date + tp.household_time) at time zone 'Asia/Bangkok'
        )
      )
      and tp.effective_from<=(
        (d.dose_date + tp.household_time) at time zone 'Asia/Bangkok'
      )
      and (
        tp.effective_to is null
        or tp.effective_to>(
          (d.dose_date + tp.household_time) at time zone 'Asia/Bangkok'
        )
      )
  ),
  exact_times as (
    select
      pm.id person_medication_id,
      pm.person_id,
      r.id regimen_id,
      null::uuid timing_policy_id,
      concat('exact:',to_char(t.x,'HH24:MI:SS')) source_key,
      (
        (d.dose_date + t.x)
        at time zone 'Asia/Bangkok'
      ) dose_at,
      (
        (d.dose_date + t.x)
        at time zone 'Asia/Bangkok'
      ) scheduled_for,
      p.display_name,
      p.first_name,
      p.last_name,
      mm.generic_name,
      mm.brand_name,
      mm.strength_value,
      mm.strength_unit,
      r.dose_text,
      r.instructions
    from public.person_medications pm
    join public.medication_master mm on mm.id=pm.medication_id
    join public.medication_regimens r
      on r.person_medication_id=pm.id
     and r.deleted_at is null
     and r.is_current=true
    join public.persons p on p.id=pm.person_id
    cross join local_dates d
    cross join lateral unnest(coalesce(r.exact_times,array[]::time[])) t(x)
    where r.schedule_kind='legacy' AND pm.deleted_at is null
      and pm.status='regular'
      and mm.deleted_at is null
      and mm.status='active'
      and (pm.start_date is null or d.dose_date>=pm.start_date)
      and (pm.end_date is null or d.dose_date<=pm.end_date)
      and r.effective_from<=(
        (d.dose_date + t.x) at time zone 'Asia/Bangkok'
      )
      and (
        r.effective_to is null
        or r.effective_to>(
          (d.dose_date + t.x) at time zone 'Asia/Bangkok'
        )
      )
      and not exists(
        select 1
        from public.medication_timing_policies tp
        where tp.person_medication_id=pm.id
          and tp.deleted_at is null
          and tp.active=true
          and tp.household_time is not null
          and (tp.regimen_id is null or tp.regimen_id=r.id)
          and tp.effective_from<=(
            (d.dose_date + t.x) at time zone 'Asia/Bangkok'
          )
          and (
            tp.effective_to is null
            or tp.effective_to>(
              (d.dose_date + t.x) at time zone 'Asia/Bangkok'
            )
          )
      )
  ),
  canonical_times as (
    SELECT pm.id person_medication_id,pm.person_id,r.id regimen_id,null::uuid timing_policy_id,
     concat('canonical:',sd.id::text) source_key,sd.scheduled_at dose_at,sd.scheduled_at scheduled_for,
     p.display_name,p.first_name,p.last_name,mm.generic_name,mm.brand_name,mm.strength_value,mm.strength_unit,r.dose_text,r.instructions
    FROM public.medication_scheduled_doses sd JOIN public.person_medications pm ON pm.id=sd.person_medication_id
    JOIN public.medication_regimens r ON r.id=sd.regimen_id
    JOIN public.medication_order_versions ov ON ov.id=sd.order_version_id AND ov.status='verified'
    JOIN public.medication_master mm ON mm.id=pm.medication_id JOIN public.persons p ON p.id=pm.person_id
    WHERE r.schedule_kind<>'legacy' AND pm.status='regular' AND pm.deleted_at IS NULL AND r.deleted_at IS NULL AND r.is_current
     AND sd.state='planned' AND sd.scheduled_at IS NOT NULL
  ),
  schedules as (
    select * from policy_times
    union all
    select * from exact_times
    union all select * from canonical_times
  ),
  due as (
    select s.*,rec.recipient_user_id,rec.family_id
    from schedules s
    cross join lateral private.phms_notification_recipients(
      s.person_id,'medications'
    ) rec
    where s.scheduled_for>=p_now-interval '60 minutes'
      and s.scheduled_for<=p_now+interval '5 minutes'
  )
  insert into public.notifications(
    family_id,recipient_user_id,person_id,
    event_type,title,message,related_record_id,
    channel,priority,status,scheduled_for,next_attempt_at,
    payload,dedupe_key,updated_at
  )
  select
    d.family_id,
    d.recipient_user_id,
    d.person_id,
    'medication_reminder',
    '💊 เตือนยา',
    concat(
      '👤 ',coalesce(nullif(btrim(d.display_name),''),
        nullif(btrim(concat_ws(' ',d.first_name,d.last_name)),''),
        'ผู้ใช้'),
      E'\nยา: ',coalesce(nullif(btrim(d.brand_name),''),d.generic_name),
      case
        when d.strength_value is not null
          then ' '||trim(to_char(d.strength_value,'FM999999990.######'))
               ||coalesce(' '||nullif(btrim(d.strength_unit),''),'')
        else ''
      end,
      E'\nตารางเวลา: ',to_char(d.dose_at at time zone 'Asia/Bangkok','DD/MM/YYYY HH24:MI'),
      case when nullif(btrim(d.dose_text),'') is not null
        then E'\nขนาด: '||d.dose_text else '' end,
      case when nullif(btrim(d.instructions),'') is not null
        then E'\nวิธีใช้: '||d.instructions else '' end
    ),
    d.person_medication_id,
    'line',
    'normal',
    'pending',
    d.scheduled_for,
    d.scheduled_for,
    jsonb_strip_nulls(jsonb_build_object(
      'person_medication_id',d.person_medication_id,
      'regimen_id',d.regimen_id,
      'timing_policy_id',d.timing_policy_id,
      'source_key',d.source_key,
      'dose_at',d.dose_at,
      'person_id',d.person_id
    )),
    concat(
      'medication:',d.person_medication_id::text,':',
      d.regimen_id::text,':',d.source_key,':',
      d.recipient_user_id::text,':',
      extract(epoch from d.dose_at)::bigint::text
    ),
    now()
  from due d
  on conflict (dedupe_key)
    where dedupe_key is not null
  do nothing;

  get diagnostics v_count=row_count;
  return v_count;
end
$function$

;
CREATE OR REPLACE FUNCTION public.phms_get_line_conversation_state(p_line_user_id text)
 RETURNS TABLE(state_key text, state_data jsonb)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 select s.state_key,s.state_data || case when s.expires_at<=now() then jsonb_build_object('session_expired',true) else '{}'::jsonb end from line_conversation_states s where s.line_user_id=p_line_user_id and (s.expires_at is null or s.expires_at>now() or s.state_key in ('smart_medication','smart_medication_field')) limit 1
$function$

;
CREATE OR REPLACE FUNCTION public.phms_med_v23_generate_all_today()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE person_row record; date_bkk date:=(now() AT TIME ZONE 'Asia/Bangkok')::date; count_persons int:=0; created_total int:=0; skipped_total int:=0; outcome jsonb;
BEGIN
 FOR person_row IN
 SELECT DISTINCT pm.person_id
 FROM public.medication_order_versions v
 JOIN public.person_medications pm ON pm.id=v.person_medication_id
 JOIN public.medication_regimen_doses rule ON rule.order_version_id=v.id
 JOIN public.medication_regimens r ON r.id=v.regimen_id
 WHERE v.status='verified' AND v.verified_at IS NOT NULL
 AND pm.deleted_at IS NULL AND pm.status='regular'
 AND (rule.local_time IS NOT NULL OR (r.schedule_kind<>'legacy' AND rule.slot_key IN ('morning','noon','evening','bedtime')))
 LOOP
  outcome:=public.phms_med_v23_generate_day(person_row.person_id,date_bkk,'Asia/Bangkok');
  count_persons:=count_persons+1;
  created_total:=created_total+coalesce((outcome->>'created')::int,0);
  skipped_total:=skipped_total+coalesce((outcome->>'already_present')::int,0);
 END LOOP;
 RETURN jsonb_build_object('date',date_bkk,'persons_checked',count_persons,'created',created_total,'already_present',skipped_total);
END $function$
;
-- Bind the confirmed review to the same draft under the session lock. Legacy three-argument callers keep their contract.
CREATE OR REPLACE FUNCTION public.phms_finalize_line_intake_review(p_line_user_id text,p_source_code text,p_decision text,p_expected_input_values jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private,auth,extensions AS $$
DECLARE sid uuid; actual jsonb; amount integer;
BEGIN
 IF p_decision IS DISTINCT FROM 'commit' OR jsonb_typeof(p_expected_input_values) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid_smart_review';END IF;
 SELECT s.session_id INTO sid FROM public.data_intake_sources s JOIN public.line_identities li ON li.user_id=s.submitted_by AND li.is_active
 WHERE li.line_user_id=p_line_user_id AND length(p_source_code)>=8 AND lower(s.id::text) LIKE lower(p_source_code)||'%';
 IF NOT FOUND THEN RAISE EXCEPTION 'intake_source_not_found';END IF;
 PERFORM 1 FROM public.data_intake_sessions WHERE id=sid FOR UPDATE;
 SELECT count(*),jsonb_agg(c.normalized_data->'input_values')->0 INTO amount,actual FROM public.data_intake_candidates c
 JOIN public.data_intake_sources s ON s.id=c.source_id WHERE c.session_id=sid AND lower(s.id::text) LIKE lower(p_source_code)||'%' AND c.candidate_type='medication';
 IF amount<>1 OR actual IS DISTINCT FROM p_expected_input_values THEN
  RETURN jsonb_build_object('ok',false,'canonical_commit',false,'draft_preserved',true,'error_code','validation_failed');
 END IF;
 RETURN public.phms_finalize_line_intake_review(p_line_user_id,p_source_code,p_decision);
END $$;
REVOKE ALL ON FUNCTION public.phms_finalize_line_intake_review(text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.phms_finalize_line_intake_review(text,text,text,jsonb) TO service_role;
