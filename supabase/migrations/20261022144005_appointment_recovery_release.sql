do $guard$ begin
 if (select md5(pg_get_functiondef(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='notify_linked_person_record_change' limit 1)<>'b476021e0cb0bd1f999ffb1be6b94244' then raise exception 'production_function_changed:private.notify_linked_person_record_change';end if;
 if (select md5(pg_get_functiondef(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='phms_commit_appointment_candidate' limit 1)<>'349f7c8f435c3089bfed3cf0349e024a' then raise exception 'production_function_changed:private.phms_commit_appointment_candidate';end if;
 if (select md5(pg_get_functiondef(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='phms_finalize_line_intake_review' limit 1)<>'fe69b3c4cf1a77deae9f03d32afdfa06' then raise exception 'production_function_changed:public.phms_finalize_line_intake_review';end if;
end $guard$;
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
  v_now,v_now)
 on conflict(dedupe_key) where dedupe_key is not null
 do update set message=excluded.message,payload=excluded.payload,updated_at=excluded.updated_at;
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
  v_procedure jsonb;
  v_sequence integer:=0;
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

  if v_d ? 'diagnostic_procedures' then
    if jsonb_typeof(v_d->'diagnostic_procedures')<>'array' or jsonb_array_length(v_d->'diagnostic_procedures')>20 then raise exception 'invalid_diagnostic_procedures';end if;
    if jsonb_array_length(v_d->'diagnostic_procedures')>0 and (select appointment_type from public.appointments where id=v_id)<>'investigation' then raise exception 'diagnostic_appointment_required';end if;
    for v_procedure in select value from jsonb_array_elements(v_d->'diagnostic_procedures') loop
      if length(btrim(coalesce(v_procedure->>'code',''))) not between 2 and 70 or length(btrim(coalesce(v_procedure->>'name',''))) not between 2 and 160 then raise exception 'invalid_procedure_input';end if;
      v_sequence:=v_sequence+1;
      insert into public.appointment_procedure_items(appointment_id,procedure_code,procedure_name_th,procedure_category,sequence_no,created_by,request_key)
      values(v_id,btrim(v_procedure->>'code'),btrim(v_procedure->>'name'),'other',v_sequence,p_actor_user_id,'intake:'||p_candidate_id::text||':'||btrim(v_procedure->>'code'))
      on conflict do nothing;
    end loop;
  end if;
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
$function$;


-- Disabled until an authorized real-device LINE acceptance test has passed.
create table if not exists private.phms_appointment_release_gate (
 singleton boolean primary key default true check(singleton),
 enabled_for_everyone boolean not null default false,
 allowed_actor_ids uuid[] not null default '{}'::uuid[],
 updated_at timestamptz not null default now()
);
alter table private.phms_appointment_release_gate enable row level security;
revoke all on private.phms_appointment_release_gate from public,anon,authenticated;
insert into private.phms_appointment_release_gate(singleton) values(true) on conflict do nothing;
create or replace function public.phms_line_appointment_wizard_enabled(p_line_user_id text)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select g.enabled_for_everyone or i.user_id=any(g.allowed_actor_ids)
 from private.phms_appointment_release_gate g
 join public.line_identities i on i.line_user_id=p_line_user_id and i.is_active=true
 where g.singleton=true limit 1),false)
$$;
revoke all on function public.phms_line_appointment_wizard_enabled(text) from public,anon,authenticated;
grant execute on function public.phms_line_appointment_wizard_enabled(text) to service_role;

create or replace function public.phms_line_create_walkin_plan_v3(p_line_user_id text,p_key text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='public','private','pg_catalog' as $$
declare ctx record; existing public.appointments%rowtype; result jsonb; v_date date; v_title text;
begin
 select * into ctx from private.phms_line_crud_context(p_line_user_id,'appointment','create') limit 1;
 if length(coalesce(p_key,'')) not between 12 and 120 or jsonb_typeof(p_payload)<>'object' then raise exception 'invalid_walkin_request';end if;
 v_date:=(p_payload->>'date')::date;
 v_title:=coalesce(nullif(btrim(p_payload->>'title'),''),nullif(btrim(p_payload->>'care_topic'),''),'วางแผนไปโรงพยาบาล');
 perform pg_advisory_xact_lock(hashtextextended('walkin:'||ctx.target_person_id::text||':'||p_key,0));
 select * into existing from public.appointments where person_id=ctx.target_person_id and external_reference='phms-walkin:'||p_key and deleted_at is null for update;
 if found then
  if existing.planned_visit_date is distinct from v_date or existing.title is distinct from v_title or existing.hospital_name is distinct from nullif(btrim(p_payload->>'hospital_name'),'') or existing.department is distinct from nullif(btrim(p_payload->>'department'),'') then raise exception 'idempotency_conflict';end if;
  return jsonb_build_object('ok',true,'duplicate',true,'record_id',existing.id,'record_code',substr(existing.id::text,1,12),'planned_visit_date',existing.planned_visit_date,'visit_time_known',false);
 end if;
 result:=public.phms_line_create_walkin_plan(p_line_user_id,v_date,p_payload->>'appointment_type',v_title,p_payload->>'hospital_name',p_payload->>'care_topic',p_payload->>'walk_in_reason',p_payload->>'followup_kind',nullif(p_payload->>'followup_interval_months','')::int,p_payload->>'department',p_payload->>'doctor_name');
 update public.appointments set external_reference='phms-walkin:'||p_key where id=(result->>'record_id')::uuid;
 insert into public.audit_logs(family_id,actor_user_id,family_person_id,event_type,resource,record_id,new_data,description)
 values(ctx.active_family_id,ctx.actor_user_id,ctx.active_family_person_id,'appointment_created','appointment',(result->>'record_id')::uuid,p_payload,'สร้างแผนไปโรงพยาบาลที่ยังไม่ทราบเวลา');
 return result||jsonb_build_object('duplicate',false);
end $$;
revoke all on function public.phms_line_create_walkin_plan_v3(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.phms_line_create_walkin_plan_v3(text,text,jsonb) to service_role;

create table if not exists private.phms_appointment_wizard_drafts(
 id uuid primary key,actor_user_id uuid not null references auth.users(id),person_id uuid not null references public.persons(id),
 payload jsonb not null check(jsonb_typeof(payload)='object'),
 updated_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '30 days'
);
alter table private.phms_appointment_wizard_drafts enable row level security;
revoke all on private.phms_appointment_wizard_drafts from public,anon,authenticated;
create or replace function public.phms_line_save_appointment_wizard_draft(p_line_user_id text,p_key uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='public','private','pg_catalog' as $$
declare ctx record; saved uuid;
begin
 select * into ctx from private.phms_line_crud_context(p_line_user_id,'appointment','create') limit 1;
 if p_key is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>65536 then raise exception 'invalid_appointment_draft';end if;
 insert into private.phms_appointment_wizard_drafts(id,actor_user_id,person_id,payload)
 values(p_key,ctx.actor_user_id,ctx.target_person_id,p_payload)
 on conflict(id) do update set payload=excluded.payload,updated_at=now(),expires_at=now()+interval '30 days'
 where phms_appointment_wizard_drafts.actor_user_id=ctx.actor_user_id and phms_appointment_wizard_drafts.person_id=ctx.target_person_id
 returning id into saved;
 if saved is null then raise exception 'appointment_draft_owner_mismatch';end if;
 insert into public.audit_logs(family_id,actor_user_id,family_person_id,event_type,resource,record_id,description)
 values(ctx.active_family_id,ctx.actor_user_id,ctx.active_family_person_id,'appointment_draft_saved','appointment',saved,'เก็บร่างนัด ยังไม่สร้างนัดจริง');
 return jsonb_build_object('ok',true,'draft_key',saved);
end $$;
create or replace function public.phms_line_get_appointment_wizard_draft(p_line_user_id text,p_key uuid default null)
returns jsonb language plpgsql stable security definer set search_path='public','private','pg_catalog' as $$
declare ctx record; result jsonb;
begin
 select * into ctx from private.phms_line_crud_context(p_line_user_id,'appointment','create') limit 1;
 if p_key is not null then
  select payload||jsonb_build_object('draft_key',id,'draft_person_id',person_id,'person_confirmed',false)
  into result from private.phms_appointment_wizard_drafts
  where id=p_key and actor_user_id=ctx.actor_user_id and person_id=ctx.target_person_id and expires_at>now();
  if result is null then raise exception 'appointment_draft_expired_or_not_found';end if;
  return jsonb_build_object('ok',true,'draft',result);
 end if;
 select coalesce(jsonb_agg(x),'[]'::jsonb) into result from (
 select id,updated_at,coalesce(nullif(payload#>>'{partial,title}',''),nullif(payload#>>'{partial,hospital_name}',''),'ร่างนัด') as label
 from private.phms_appointment_wizard_drafts where actor_user_id=ctx.actor_user_id and person_id=ctx.target_person_id and expires_at>now()
 order by updated_at desc limit 5) x;
 return jsonb_build_object('ok',true,'items',result);
end $$;
revoke all on function public.phms_line_save_appointment_wizard_draft(text,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.phms_line_get_appointment_wizard_draft(text,uuid) from public,anon,authenticated;
grant execute on function public.phms_line_save_appointment_wizard_draft(text,uuid,jsonb) to service_role;
grant execute on function public.phms_line_get_appointment_wizard_draft(text,uuid) to service_role;
