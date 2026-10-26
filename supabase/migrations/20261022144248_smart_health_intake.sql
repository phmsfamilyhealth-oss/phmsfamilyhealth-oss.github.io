-- Candidate only. Apply first to an isolated copy of the PHMS schema.
-- Reuse the canonical measurement register, intake sessions/actions and document store.
-- Fail-closed pilot controls live in the existing runtime configuration.
-- The new invoker RPC must explicitly be allowed to call the established
-- private authorization resolver. Client roles remain unable to execute it.
grant execute on function private.phms_line_crud_context(text,text,text) to service_role;
-- Explicit grants for the trusted backend, since BYPASSRLS does not itself
-- grant table privileges. Do not grant these operations to client roles.
grant select,insert,update on public.data_intake_sessions,public.data_intake_sources,public.medical_documents to service_role;
grant insert on public.data_intake_actions to service_role;
grant select,insert on public.health_measurements,public.phms_storage_assets to service_role;
grant select on public.phms_runtime_environment,storage.objects,storage.buckets to service_role;
alter table public.phms_runtime_environment
 add column if not exists health_smart_intake_release_state text not null default 'off'
  check (health_smart_intake_release_state in ('off','pilot','general')),
 add column if not exists health_smart_intake_test_actor_ids uuid[] not null default '{}';
create or replace function public.phms_smart_health_access(p_line_user_id text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare mode text; actors uuid[]; actor uuid;
begin
 select e.health_smart_intake_release_state,e.health_smart_intake_test_actor_ids into mode,actors
 from public.phms_runtime_environment e where e.singleton=true;
 if coalesce(mode,'off')='off' then return jsonb_build_object('allowed',false,'mode','off');end if;
 select r.user_id into strict actor from private.resolve_line_user_for_service(p_line_user_id) r;
 return jsonb_build_object('allowed',actor is not null and (mode='general' or actor=any(actors)),'mode',mode);
exception when no_data_found then return jsonb_build_object('allowed',false,'mode','off');
end $$;
revoke all on function public.phms_smart_health_access(text) from public,anon,authenticated;
grant execute on function public.phms_smart_health_access(text) to service_role;

alter table public.health_measurements
 add column if not exists intake_session_id uuid references public.data_intake_sessions(id),
 add column if not exists reading_key uuid,
 add column if not exists measurement_context jsonb,
 add column if not exists source_device text,
 add column if not exists measurement_round integer,
 add column if not exists original_value numeric,
 add column if not exists original_unit text,
 add column if not exists supersedes_id uuid references public.health_measurements(id);
create unique index if not exists health_measurement_session_reading on public.health_measurements(intake_session_id,reading_key) where intake_session_id is not null;
create index if not exists health_measurement_person_trend on public.health_measurements(person_id,measurement_type,measured_at desc) where deleted_at is null;

create or replace function private.phms_health_check_readings(p_readings jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare r jsonb; v numeric; lo numeric; hi numeric; u text; k text; val text; warn boolean; seen text[]:='{}'; sig text;
begin
 if jsonb_typeof(p_readings) is distinct from 'array' or jsonb_array_length(p_readings) not between 1 and 30 then raise exception 'readings_required';end if;
 for r in select value from jsonb_array_elements(p_readings) loop
  if r->>'id' is null then raise exception 'reading_id_required';end if;perform (r->>'id')::uuid;
  if (r->>'round')::integer not between 1 and 3 or r->>'round' is null then raise exception 'invalid_round';end if;
  if (r->>'measured_at')::timestamptz is null or (r->>'measured_at')::timestamptz>now()+interval '5 minutes' then raise exception 'invalid_measurement_time';end if;
  if r->>'device' is null or r->>'device' not in ('manual','bp_monitor','oximeter','glucose_meter','thermometer','scale','tape') then raise exception 'invalid_source';end if;
  select x.unit,x.lo,x.hi into u,lo,hi from (values
   ('BP','mmHg',1::numeric,400::numeric),('HR','/min',1,400),('SpO2','%',1,100),('DTX','mg/dL',1,2000),
   ('Temp','°C',10,60),('Weight','kg',.1,700),('Height','cm',10,300),('RR','/min',1,200)) x(t,unit,lo,hi) where x.t=r->>'type';
  if u is null or (r->>'unit') is distinct from u then raise exception 'invalid_metric_unit';end if;
  if (r->>'type'='BP' and r->>'value' is not null) or (r->>'type'<>'BP' and (r->>'systolic' is not null or r->>'diastolic' is not null)) then raise exception 'mixed_numeric_fields';end if;
  if r->>'original_value' is not null then
   v:=case when r->>'original_unit'=u then (r->>'original_value')::numeric
    when r->>'type'='DTX' and r->>'original_unit'='mmol/L' then (r->>'original_value')::numeric*18.0182
    when r->>'type'='Temp' and r->>'original_unit'='°F' then ((r->>'original_value')::numeric-32)*5/9
    when r->>'type'='Weight' and r->>'original_unit'='lb' then (r->>'original_value')::numeric*0.45359237
    when r->>'type'='Height' and r->>'original_unit'='in' then (r->>'original_value')::numeric*2.54 else null end;
   if v is null or v='NaN'::numeric or abs(v-(r->>'value')::numeric)>0.000001 then raise exception 'unit_conversion_mismatch';end if;
  end if;
  if jsonb_typeof(r->'context') is distinct from 'object' then raise exception 'invalid_context';end if;
  for k,val in select * from jsonb_each_text(r->'context') loop
   if k='symptoms' and length(val)<=500 then continue;end if;
   if k='activity' and r->>'type' in ('BP','HR','RR','SpO2') and val in ('พัก','หลังออกแรง') then continue;end if;
   if k='posture' and r->>'type'='BP' and val in ('นั่ง','นอน','ยืน') then continue;end if;
   if k='arm' and r->>'type'='BP' and val in ('ซ้าย','ขวา') then continue;end if;
   if k='meal' and r->>'type'='DTX' and val in ('ก่อนอาหาร','หลังอาหาร 1 ชั่วโมง','หลังอาหาร 2 ชั่วโมง','ก่อนนอน','สุ่ม') then continue;end if;
   if k='site' and r->>'type'='Temp' and val in ('รักแร้','ปาก','หู','หน้าผาก','ทวารหนัก') then continue;end if;
   raise exception 'context_not_applicable';
  end loop;
  for v in select value::text::numeric from jsonb_array_elements(case when r->>'type'='BP' then jsonb_build_array(r->'systolic',r->'diastolic') else jsonb_build_array(r->'value') end) loop
   if v is null or v='NaN'::numeric or v<lo or v>hi then raise exception 'invalid_numeric_range';end if;
   if r->>'type' in ('BP','HR','SpO2','RR') and v<>trunc(v) then raise exception 'integer_required';end if;
  end loop;
  sig:=concat_ws('|',r->>'type',r->>'device',r->>'round',((r->>'measured_at')::timestamptz)::text);
  if sig=any(seen) then raise exception 'duplicate_reading';end if;seen:=array_append(seen,sig);
  warn:=case r->>'type'
   when 'BP' then (r->>'systolic')::numeric<50 or (r->>'systolic')::numeric>300 or (r->>'diastolic')::numeric<20 or (r->>'diastolic')::numeric>200 or (r->>'systolic')::numeric<=(r->>'diastolic')::numeric
   when 'HR' then (r->>'value')::numeric not between 30 and 220 when 'RR' then (r->>'value')::numeric not between 5 and 80
   when 'SpO2' then (r->>'value')::numeric<50 when 'DTX' then (r->>'value')::numeric not between 10 and 1000
   when 'Temp' then (r->>'value')::numeric not between 30 and 45 when 'Weight' then (r->>'value')::numeric not between 1 and 350
   when 'Height' then (r->>'value')::numeric not between 30 and 250 else false end;
  if warn and coalesce((r->>'unusual_confirmed')::boolean,false) is not true then raise exception 'unusual_value_confirmation_required';end if;
 end loop;
 if (select count(*)<>count(distinct value->>'id') from jsonb_array_elements(p_readings)) then raise exception 'duplicate_reading_id';end if;
end $$;

-- LINE IDs are not credentials. This RPC is service_role only and is called after webhook signature verification.
create or replace function public.phms_smart_health(p_line_user_id text,p_action text,p_session_id uuid default null,p_payload jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare ctx record; doc_ctx record; s public.data_intake_sessions%rowtype; r jsonb; sid uuid; result jsonb; rev integer; aid uuid; did uuid; old_id uuid; points jsonb; action_permission text;
begin
 if coalesce((public.phms_smart_health_access(p_line_user_id)->>'allowed')::boolean,false) is not true then raise exception 'smart_health_release_not_authorized';end if;
 action_permission:=case when p_action in ('history','evidence_read','evidence_list','read') then 'view' else 'create' end;
 select * into strict ctx from private.phms_line_crud_context(p_line_user_id,'health',action_permission);
 if p_action in ('evidence','evidence_read','evidence_list') then
  select * into strict doc_ctx from private.phms_line_crud_context(p_line_user_id,'document',case when p_action='evidence' then 'create' else 'view' end);
  if doc_ctx.target_person_id is distinct from ctx.target_person_id or doc_ctx.actor_user_id is distinct from ctx.actor_user_id then raise exception 'evidence_document_context_mismatch';end if;
  -- Match the underlying document/Storage policy as well as LINE context:
  -- personal context alone must not mint a URL around document permissions.
  if not exists(select 1 from public.family_persons fp where fp.person_id=ctx.target_person_id and coalesce(fp.status,'active')='active'
    and private.user_can_access_family_person(ctx.actor_user_id,fp.id,'documents',case when p_action='evidence' then 'create' else 'view' end)) then
   raise exception 'evidence_document_permission_denied';
  end if;
 end if;
 if p_action='history' then
  if coalesce((p_payload->>'days')::integer,7) not in (1,7,30,90) then raise exception 'invalid_history_window';end if;
  select coalesce(jsonb_agg(to_jsonb(m) order by m.measured_at,m.id),'[]') into points from public.health_measurements m
   where m.person_id=ctx.target_person_id and m.deleted_at is null and m.measured_at>=now()-make_interval(days=>coalesce((p_payload->>'days')::integer,7))
   and not exists(select 1 from public.health_measurements n where n.supersedes_id=m.id and n.deleted_at is null);
  return jsonb_build_object('person_id',ctx.target_person_id,'person_name',ctx.target_person_name,'points',points);
 end if;
 if p_action='begin' then
  -- The caller supplies a stable UUID, so retries cannot create a second session.
  if p_session_id is null then raise exception 'session_key_required';end if;
  insert into public.data_intake_sessions(id,submitted_by,person_id,family_id,family_person_id,channel,status,context_snapshot,expires_at)
   values(p_session_id,ctx.actor_user_id,ctx.target_person_id,ctx.active_family_id,ctx.active_family_person_id,'line','collecting',jsonb_build_object('smart_health',true,'revision',0,'person_label',ctx.target_person_name,'draft','[]'::jsonb,'back',coalesce(p_payload->>'back','สุขภาพ')),now()+interval '24 hours') on conflict(id) do nothing;
 end if;
 select * into s from public.data_intake_sessions where id=p_session_id for update;
 if not found or (s.submitted_by is distinct from ctx.actor_user_id and not(s.status='committed' and p_action in ('read','evidence_list','evidence_read'))) or s.person_id is distinct from ctx.target_person_id or coalesce((s.context_snapshot->>'smart_health')::boolean,false) is not true then raise exception 'session_not_authorized';end if;
 if s.expires_at<now() and s.status<>'committed' then raise exception 'session_expired';end if;
 if p_action in ('begin','read') then return jsonb_build_object('session',to_jsonb(s));end if;
 if p_action='commit' and s.status='committed' then return jsonb_build_object('committed',true,'idempotent_replay',true,'session_id',s.id);end if;
 if p_action='evidence_list' then
  select coalesce(jsonb_agg(jsonb_build_object('asset_id',src.storage_asset_id,'reading_ids',src.source_metadata->'reading_ids')),'[]') into result from public.data_intake_sources src join public.phms_storage_assets a on a.id=src.storage_asset_id where src.session_id=s.id and a.person_id=s.person_id and a.deleted_at is null;
  return jsonb_build_object('items',result);
 end if;
 if p_action='evidence_read' then
  select jsonb_build_object('bucket',a.bucket_id,'path',a.object_name) into result from public.data_intake_sources src join public.phms_storage_assets a on a.id=src.storage_asset_id
   where src.session_id=s.id and src.storage_asset_id=(p_payload->>'asset_id')::uuid and a.person_id=s.person_id and a.deleted_at is null;
  if result is null then raise exception 'evidence_not_authorized';end if;return result;
 end if;
 if s.status not in ('collecting','review') then raise exception 'session_locked';end if;
 rev:=coalesce((s.context_snapshot->>'revision')::integer,0);
 if p_action='wizard' and p_payload->>'event_id' is not null and (s.context_snapshot->>'last_event_id'=p_payload->>'event_id' or coalesce(s.context_snapshot->'processed_event_ids','[]'::jsonb)?(p_payload->>'event_id')) then return jsonb_build_object('session',to_jsonb(s),'duplicate',true);end if;
 if p_action in ('wizard','save','review','commit','evidence') and (p_payload->>'revision')::integer is distinct from rev then raise exception 'stale_revision';end if;
 if p_action='cancel' then
  update public.data_intake_sessions set status='cancelled',updated_at=now() where id=s.id;
 elsif p_action='wizard' then
  if jsonb_typeof(p_payload->'wizard') is distinct from 'object' or length((p_payload->'wizard')::text)>262144 then raise exception 'invalid_wizard';end if;
  update public.data_intake_sessions set status='collecting',context_snapshot=context_snapshot||jsonb_build_object('wizard',p_payload->'wizard','revision',rev+1,'review_revision',null,'last_event_id',p_payload->>'event_id'),updated_at=now() where id=s.id;
  if p_payload->>'event_id' is not null then
   update public.data_intake_sessions set context_snapshot=context_snapshot||jsonb_build_object('processed_event_ids',
    (select coalesce(jsonb_agg(x.value order by x.ordinality),'[]'::jsonb) from jsonb_array_elements(coalesce(context_snapshot->'processed_event_ids','[]'::jsonb)||jsonb_build_array(p_payload->>'event_id')) with ordinality x where x.ordinality>greatest(0,jsonb_array_length(coalesce(context_snapshot->'processed_event_ids','[]'::jsonb))+1-512))) where id=s.id;
  end if;
 elsif p_action='save' then
  perform private.phms_health_check_readings(p_payload->'readings');
  update public.data_intake_sessions set status='collecting',context_snapshot=context_snapshot||jsonb_build_object('draft',p_payload->'readings','revision',rev+1,'review_revision',null),updated_at=now() where id=s.id;
 elsif p_action='review' then
  perform private.phms_health_check_readings(s.context_snapshot->'draft');
  update public.data_intake_sessions set status='review',context_snapshot=context_snapshot||jsonb_build_object('review_revision',rev),updated_at=now() where id=s.id;
 elsif p_action='evidence' then
  -- Bytes must already exist in the existing private medical document bucket.
  -- All evidence stays bound to this owner. Matching bytes owned by another person are rejected.
  if p_payload->>'sha256' !~ '^[a-f0-9]{64}$' or p_payload->>'sha256' is null then raise exception 'invalid_checksum';end if;
  if (p_payload->>'bytes')::bigint not between 1 and 10485760 then raise exception 'invalid_size';end if;
  if p_payload->>'mime' not in ('image/jpeg','image/png','image/webp') then raise exception 'invalid_mime';end if;
  if exists(select 1 from public.phms_storage_assets a where a.checksum_sha256=p_payload->>'sha256' and a.person_id<>s.person_id and a.deleted_at is null) then raise exception 'evidence_person_mismatch';end if;
  if exists(select 1 from public.data_intake_sources src where src.session_id=s.id and src.line_message_id=p_payload->>'message_id') then return jsonb_build_object('duplicate',true);end if;
  if (select count(*) from public.data_intake_sources where session_id=s.id)>=10 then raise exception 'evidence_limit_reached';end if;
  if p_payload->>'path' !~ ('^persons/'||s.person_id::text||'/documents/[a-f0-9-]{36}\.(jpg|jpeg|png|webp)$') then raise exception 'invalid_path';end if;
  if not exists(select 1 from storage.objects where bucket_id='phms-medical-sources' and name=p_payload->>'path') then raise exception 'object_missing';end if;
  if not exists(select 1 from storage.buckets where id='phms-medical-sources' and public=false) then raise exception 'private_bucket_required';end if;
  select a.id into aid from public.phms_storage_assets a join public.data_intake_sources src on src.storage_asset_id=a.id where src.session_id=s.id and a.checksum_sha256=p_payload->>'sha256' and a.deleted_at is null limit 1;
  if aid is not null then return jsonb_build_object('duplicate',true,'asset_id',aid);end if;
  insert into public.phms_storage_assets(bucket_id,object_name,asset_kind,lifecycle_state,person_id,permission_resource,mime_type,byte_size,checksum_sha256,created_by,confirmed_by,confirmed_at,metadata)
   values('phms-medical-sources',p_payload->>'path','medical_document','confirmed',s.person_id,'health',p_payload->>'mime',(p_payload->>'bytes')::bigint,p_payload->>'sha256',ctx.actor_user_id,ctx.actor_user_id,now(),jsonb_build_object('measurement_session_id',s.id,'ocr_used',false)) returning id into aid;
  insert into public.medical_documents(person_id,document_type,title,storage_bucket,storage_path,source_channel,mime_type,checksum_sha256,uploaded_by,storage_asset_id,metadata)
   values(s.person_id,'other','รูปเครื่องวัด','phms-medical-sources',p_payload->>'path','line',p_payload->>'mime',p_payload->>'sha256',ctx.actor_user_id,aid,jsonb_build_object('measurement_session_id',s.id,'readings',coalesce(p_payload->'reading_ids','[]'))) returning id into did;
  insert into public.data_intake_sources(session_id,submitted_by,source_kind,document_type,source_document_id,storage_asset_id,line_message_id,source_metadata)
   values(s.id,ctx.actor_user_id,'image','medical_document',did,aid,p_payload->>'message_id',jsonb_build_object('evidence_only',true,'ocr_used',false,'reading_ids',coalesce(p_payload->'reading_ids','[]')));
  update public.data_intake_sessions set status='collecting',context_snapshot=context_snapshot||jsonb_build_object('revision',rev+1,'review_revision',null),updated_at=now() where id=s.id;
 elsif p_action='commit' then
  if s.status<>'review' or (s.context_snapshot->>'review_revision')::integer is distinct from rev then raise exception 'review_required';end if;
  perform private.phms_health_check_readings(s.context_snapshot->'draft');
  for r in select value from jsonb_array_elements(s.context_snapshot->'draft') loop
   old_id:=nullif(r->>'supersedes_id','')::uuid;
   if old_id is not null then
    perform * from private.phms_line_crud_context(p_line_user_id,'health','update');
    if not exists(select 1 from public.health_measurements where id=old_id and person_id=s.person_id and deleted_at is null) then raise exception 'revision_person_mismatch';end if;
   end if;
   insert into public.health_measurements(person_id,measurement_type,measured_at,value_numeric,unit,systolic,diastolic,context,source_type,created_by,intake_session_id,reading_key,measurement_context,source_device,measurement_round,original_value,original_unit,supersedes_id)
    values(s.person_id,r->>'type',(r->>'measured_at')::timestamptz,(r->>'value')::numeric,r->>'unit',(r->>'systolic')::numeric,(r->>'diastolic')::numeric,(r->'context')::text,'line_manual',ctx.actor_user_id,s.id,(r->>'id')::uuid,r->'context',r->>'device',(r->>'round')::integer,(r->>'original_value')::numeric,r->>'original_unit',old_id);
  end loop;
  -- Evidence attached before numeric entry belongs to the reviewed session as a whole.
  -- Resolve its reading keys only at commit, after the user confirms the complete set.
  update public.data_intake_sources src
   set source_metadata=src.source_metadata||jsonb_build_object('reading_ids',(select jsonb_agg(x->>'id') from jsonb_array_elements(s.context_snapshot->'draft') x),'link_scope','session')
   where src.session_id=s.id and coalesce(src.source_metadata->'reading_ids','[]'::jsonb)='[]'::jsonb;
  update public.medical_documents d
   set metadata=coalesce(d.metadata,'{}'::jsonb)||jsonb_build_object('readings',src.source_metadata->'reading_ids','link_scope','session')
   from public.data_intake_sources src where src.session_id=s.id and src.source_document_id=d.id and src.source_metadata->>'link_scope'='session';
  update public.data_intake_sessions set status='committed',context_snapshot=context_snapshot||jsonb_build_object('committed_at',now()),updated_at=now() where id=s.id;
 else raise exception 'unknown_action';end if;
 insert into public.data_intake_actions(session_id,actor_user_id,action,before_data,after_data)
  values(s.id,ctx.actor_user_id,case p_action when 'wizard' then 'edit' when 'save' then 'edit' when 'review' then 'validate' when 'evidence' then 'edit' when 'cancel' then 'cancel' else 'commit' end,s.context_snapshot,jsonb_build_object('action',p_action,'revision',rev,'payload',p_payload));
 select to_jsonb(ds) into result from public.data_intake_sessions ds where id=s.id;
 return jsonb_build_object('session',result,'asset_id',aid,'committed',p_action='commit');
end $$;
revoke all on function public.phms_smart_health(text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.phms_smart_health(text,text,uuid,jsonb) to service_role;
revoke all on function private.phms_health_check_readings(jsonb) from public,anon,authenticated;
grant execute on function private.phms_health_check_readings(jsonb) to service_role;

-- Existing edit/delete routes must retain a before/after trail for smart measurements too.
create or replace function private.phms_health_revision_audit() returns trigger
-- An UPDATE has already passed health_measurements RLS. The trigger can only
-- append the actual OLD/NEW row to the service-only audit register; it cannot
-- be invoked as an ordinary function or change the measurement identity.
language plpgsql security definer set search_path='' as $$
begin
 if old.intake_session_id is not null then
  if tg_op='DELETE' then raise exception 'measurement_delete_requires_soft_delete';end if;
  if new.person_id is distinct from old.person_id or new.intake_session_id is distinct from old.intake_session_id or new.reading_key is distinct from old.reading_key then raise exception 'measurement_owner_immutable';end if;
  insert into public.data_intake_actions(session_id,actor_user_id,action,before_data,after_data,reason)
   values(old.intake_session_id,auth.uid(),'edit',to_jsonb(old),to_jsonb(new),'existing_route_measurement_revision; db_role='||current_setting('role',true));
 end if;
 if tg_op='DELETE' then return old;end if;
 return new;
end $$;
drop trigger if exists phms_health_revision_audit on public.health_measurements;
create trigger phms_health_revision_audit before update or delete on public.health_measurements for each row execute function private.phms_health_revision_audit();
revoke all on function private.phms_health_revision_audit() from public,anon,authenticated;
grant execute on function private.phms_health_revision_audit() to service_role;
