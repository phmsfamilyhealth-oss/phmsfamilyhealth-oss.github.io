-- Emergency rollback: restore prior function definitions; retain all records.
CREATE OR REPLACE FUNCTION private.notify_linked_person_record_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_person_id uuid; v_family_id uuid; v_family_person_id uuid; v_recipient uuid; v_actor uuid;
 v_event text:=coalesce(TG_ARGV[0],'person_data_changed'); v_title text:=coalesce(TG_ARGV[1],'ข้อมูลของคุณมีการเปลี่ยนแปลง');
 v_record_id uuid; v_now timestamptz:=now(); v_msg text;
begin
 if TG_TABLE_NAME='persons' then
   v_person_id:=coalesce(NEW.id,OLD.id); v_record_id:=v_person_id;
 elsif TG_TABLE_NAME='appointments' then
   v_person_id:=coalesce(NEW.person_id,OLD.person_id); v_family_id:=coalesce(NEW.family_id,OLD.family_id); v_family_person_id:=coalesce(NEW.family_person_id,OLD.family_person_id); v_record_id:=coalesce(NEW.id,OLD.id);
 elsif TG_TABLE_NAME='health_measurements' then
   v_person_id:=coalesce(NEW.person_id,OLD.person_id); v_record_id:=coalesce(NEW.id,OLD.id);
 elsif TG_TABLE_NAME='person_medications' then
   v_person_id:=coalesce(NEW.person_id,OLD.person_id); v_record_id:=coalesce(NEW.id,OLD.id);
 else return coalesce(NEW,OLD); end if;

 select p.linked_user_id into v_recipient from public.persons p where p.id=v_person_id;
 if v_recipient is null then return coalesce(NEW,OLD); end if;
 begin v_actor:=nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; exception when others then v_actor:=null; end;
 if v_actor is not null and v_actor=v_recipient then return coalesce(NEW,OLD); end if;

 if v_family_person_id is null then
   select fp.id,fp.family_id into v_family_person_id,v_family_id
   from public.family_persons fp where fp.person_id=v_person_id and coalesce(fp.status,'active')='active'
   order by fp.created_at limit 1;
 end if;

 v_msg:=case TG_TABLE_NAME
   when 'persons' then 'รายละเอียดบุคคลของคุณมีการแก้ไข'
   when 'appointments' then 'นัดหมายหรือการตั้งค่าแจ้งเตือนนัดของคุณมีการเปลี่ยนแปลง'
   when 'health_measurements' then 'ข้อมูลสุขภาพของคุณมีการเพิ่มหรือแก้ไข'
   when 'person_medications' then 'ข้อมูลยาของคุณมีการเพิ่มหรือแก้ไข'
   else 'ข้อมูลของคุณมีการเปลี่ยนแปลง' end;

 insert into public.notifications(
  family_id,recipient_user_id,event_type,title,message,related_record_id,channel,priority,status,
  person_id,family_person_id,scheduled_for,next_attempt_at,payload,dedupe_key,created_at,updated_at)
 values(
  v_family_id,v_recipient,v_event,v_title,v_msg,v_record_id,'line','normal','pending',
  v_person_id,v_family_person_id,v_now,v_now,
  jsonb_build_object('table',TG_TABLE_NAME,'operation',TG_OP,'actor_user_id',v_actor),
  'linked-person:'||TG_TABLE_NAME||':'||TG_OP||':'||v_record_id::text||':'||extract(epoch from clock_timestamp())::bigint::text,
  v_now,v_now);
 return coalesce(NEW,OLD);
end $function$;
CREATE OR REPLACE FUNCTION private.phms_commit_appointment_candidate(p_candidate_id uuid, p_actor_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'extensions'
AS $function$
declare
  v_result jsonb;
  v_c public.data_intake_candidates%rowtype;
  v_d jsonb;
  v_id uuid;
  v_interval integer;
  v_preventive_interval integer;
  v_visit_time_known boolean;
  v_plan jsonb;
begin
  v_result:=private.phms_commit_appointment_candidate_base_20261010(
    p_candidate_id,p_actor_user_id
  );

  v_id:=private.phms_try_uuid(v_result->>'appointment_id');
  if v_id is null then
    return v_result;
  end if;

  select * into v_c
  from public.data_intake_candidates
  where id=p_candidate_id;

  if not found then
    return v_result;
  end if;

  v_d:=coalesce(v_c.normalized_data,'{}'::jsonb);

  if coalesce(v_d->>'followup_interval_months','') ~ '^[0-9]+$' then
    v_interval:=greatest(1,least((v_d->>'followup_interval_months')::int,120));
  else
    v_interval:=null;
  end if;

  if coalesce(v_d->>'preventive_interval_months','') ~ '^[0-9]+$' then
    v_preventive_interval:=greatest(1,least((v_d->>'preventive_interval_months')::int,120));
  else
    v_preventive_interval:=null;
  end if;

  if lower(coalesce(v_d->>'visit_time_known','')) in ('true','false') then
    v_visit_time_known:=(v_d->>'visit_time_known')::boolean;
  else
    v_visit_time_known:=true;
  end if;

  update public.appointments
  set visit_mode=case
        when nullif(btrim(v_d->>'visit_mode'),'') in ('booked','walk_in','unspecified')
          then nullif(btrim(v_d->>'visit_mode'),'')
        else visit_mode
      end,
      walk_in_reason=case
        when nullif(btrim(v_d->>'walk_in_reason'),'') in ('queue_full','hospital_advised','no_booking','urgent','other')
          then nullif(btrim(v_d->>'walk_in_reason'),'')
        else null
      end,
      walk_in_note=nullif(btrim(v_d->>'walk_in_note'),''),
      followup_kind=case
        when nullif(btrim(v_d->>'followup_kind'),'') in ('general','chronic_routine','post_treatment','results_review')
          then nullif(btrim(v_d->>'followup_kind'),'')
        else null
      end,
      followup_interval_months=case
        when appointment_type='follow_up' then v_interval
        else null
      end,
      preventive_interval_months=case
        when appointment_type in ('checkup','vaccination') then v_preventive_interval
        else null
      end,
      planned_visit_date=case
        when coalesce(v_d->>'planned_visit_date','') ~ '^\d{4}-\d{2}-\d{2}$'
          then (v_d->>'planned_visit_date')::date
        else planned_visit_date
      end,
      visit_time_known=v_visit_time_known,
      early_visit_of_appointment_id=private.phms_try_uuid(v_d->>'early_visit_of_appointment_id'),
      walk_in_doctor_status=case
        when nullif(btrim(v_d->>'walk_in_doctor_status'),'') in ('pending','same_confirmed','on_duty_unknown','different_unknown','other_confirmed')
          then nullif(btrim(v_d->>'walk_in_doctor_status'),'')
        else null
      end,
      updated_at=now()
  where id=v_id;

  v_plan:=private.phms_sync_recurring_care_plan_from_appointment(v_id,p_actor_user_id);

  return v_result || jsonb_build_object(
    'recurring_care_plan',v_plan
  );
end
$function$;
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
begin
  if v_decision not in ('confirm','cancel') then raise exception 'invalid_review_decision'; end if;
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

  if v_session.status='confirmed' then
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
$function$;
