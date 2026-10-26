-- Production FK and RLS definitions read 2026-10-23; synthetic identity helpers live in security-harness.sql.
create table public.data_intake_candidates(id uuid primary key);
create table public.families(id uuid primary key);
create table public.family_persons(id uuid primary key,person_id uuid,status text default 'active');
insert into public.family_persons(id,person_id) values
 ('55555555-5555-4555-8555-555555555555','22222222-2222-4222-8222-222222222222'),
 ('66666666-6666-4666-8666-666666666666','33333333-3333-4333-8333-333333333333');
create table public.persons(id uuid primary key);
create table public.profiles(id uuid primary key);
create table public.encounters(id uuid primary key);
create table public.medical_record_requests(id uuid primary key);
create table public.healthcare_organizations(id uuid primary key);
create table public.treatment_episodes(id uuid primary key);
alter table public.data_intake_actions add constraint production_fk_0 FOREIGN KEY (candidate_id) REFERENCES data_intake_candidates(id) ON DELETE CASCADE;
alter table public.data_intake_actions add constraint production_fk_1 FOREIGN KEY (session_id) REFERENCES data_intake_sessions(id) ON DELETE CASCADE;
alter table public.data_intake_sessions add constraint production_fk_2 FOREIGN KEY (family_id) REFERENCES families(id);
alter table public.data_intake_sessions add constraint production_fk_3 FOREIGN KEY (family_person_id) REFERENCES family_persons(id);
alter table public.data_intake_sessions add constraint production_fk_4 FOREIGN KEY (person_id) REFERENCES persons(id);
alter table public.data_intake_sources add constraint production_fk_5 FOREIGN KEY (session_id) REFERENCES data_intake_sessions(id) ON DELETE CASCADE;
alter table public.data_intake_sources add constraint production_fk_6 FOREIGN KEY (source_document_id) REFERENCES medical_documents(id);
alter table public.data_intake_sources add constraint production_fk_7 FOREIGN KEY (storage_asset_id) REFERENCES phms_storage_assets(id) ON UPDATE CASCADE ON DELETE RESTRICT;
alter table public.health_measurements add constraint production_fk_8 FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.health_measurements add constraint production_fk_9 FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE CASCADE;
alter table public.medical_documents add constraint production_fk_10 FOREIGN KEY (encounter_id) REFERENCES encounters(id) ON DELETE SET NULL;
alter table public.medical_documents add constraint production_fk_11 FOREIGN KEY (medical_record_request_id) REFERENCES medical_record_requests(id) ON DELETE SET NULL;
alter table public.medical_documents add constraint production_fk_12 FOREIGN KEY (organization_id) REFERENCES healthcare_organizations(id) ON DELETE SET NULL;
alter table public.medical_documents add constraint production_fk_13 FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE CASCADE;
alter table public.medical_documents add constraint production_fk_14 FOREIGN KEY (storage_asset_id) REFERENCES phms_storage_assets(id) ON UPDATE CASCADE ON DELETE RESTRICT;
alter table public.medical_documents add constraint production_fk_15 FOREIGN KEY (treatment_episode_id) REFERENCES treatment_episodes(id) ON DELETE SET NULL;
alter table public.medical_documents add constraint production_fk_16 FOREIGN KEY (uploaded_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table public.phms_storage_assets add constraint production_fk_17 FOREIGN KEY (confirmed_by) REFERENCES profiles(id) ON UPDATE CASCADE ON DELETE SET NULL;
alter table public.phms_storage_assets add constraint production_fk_18 FOREIGN KEY (created_by) REFERENCES profiles(id) ON UPDATE CASCADE ON DELETE SET NULL;
alter table public.phms_storage_assets add constraint production_fk_19 FOREIGN KEY (person_id) REFERENCES persons(id) ON UPDATE CASCADE ON DELETE RESTRICT;
alter table public.data_intake_actions enable row level security;
alter table public.data_intake_sessions enable row level security;
alter table public.data_intake_sources enable row level security;
alter table public.health_measurements enable row level security;
alter table public.medical_documents enable row level security;
alter table public.phms_storage_assets enable row level security;
alter table storage.objects enable row level security;
create policy phms_private_storage_read on storage.objects as PERMISSIVE for SELECT to authenticated using (((bucket_id = ANY (ARRAY['phms-intake-temp'::text, 'phms-medical-sources'::text, 'phms-medication-media'::text, 'phms-exports'::text])) AND (EXISTS ( SELECT 1
   FROM phms_storage_assets a
  WHERE ((a.bucket_id = objects.bucket_id) AND (a.object_name = objects.name) AND private.phms_storage_asset_visible_to_actor(a.id))))));
create policy phms_delete on public.health_measurements as PERMISSIVE for DELETE to authenticated using (phms_can_access_person(person_id, 'health'::text, 'delete'::text));
create policy phms_insert on public.health_measurements as PERMISSIVE for INSERT to authenticated with check (phms_can_access_person(person_id, 'health'::text, 'create'::text));
create policy phms_select on public.health_measurements as PERMISSIVE for SELECT to authenticated using (phms_can_access_person(person_id, 'health'::text, 'view'::text));
create policy phms_update on public.health_measurements as PERMISSIVE for UPDATE to authenticated using (phms_can_access_person(person_id, 'health'::text, 'update'::text)) with check (phms_can_access_person(person_id, 'health'::text, 'update'::text));
create policy phms_service_only_deny on public.data_intake_actions as RESTRICTIVE for ALL to anon,authenticated using (false) with check (false);
create policy phms_storage_assets_read on public.phms_storage_assets as PERMISSIVE for SELECT to authenticated using (private.phms_storage_asset_visible_to_actor(id));
create policy phms_service_only_deny on public.data_intake_sessions as RESTRICTIVE for ALL to anon,authenticated using (false) with check (false);
create policy phms_service_only_deny on public.data_intake_sources as RESTRICTIVE for ALL to anon,authenticated using (false) with check (false);
create policy phms_delete on public.medical_documents as PERMISSIVE for DELETE to authenticated using (phms_can_access_person(person_id, 'documents'::text, 'delete'::text));
create policy phms_insert on public.medical_documents as PERMISSIVE for INSERT to authenticated with check (phms_can_access_person(person_id, 'documents'::text, 'create'::text));
create policy phms_select on public.medical_documents as PERMISSIVE for SELECT to authenticated using (phms_can_access_person(person_id, 'documents'::text, 'view'::text));
create policy phms_update on public.medical_documents as PERMISSIVE for UPDATE to authenticated using (phms_can_access_person(person_id, 'documents'::text, 'update'::text)) with check (phms_can_access_person(person_id, 'documents'::text, 'update'::text));
grant usage on schema public,storage,auth to anon,authenticated,service_role;
grant all on all tables in schema public,storage to service_role;
grant select,insert,update,delete on all tables in schema public,storage to authenticated;
grant select on all tables in schema public,storage to anon;
grant usage on schema private to service_role,authenticated;
grant select on private.test_context to service_role;

