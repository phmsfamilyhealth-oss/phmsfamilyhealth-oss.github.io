-- Isolated integration harness. This is not a copy of Production authorization policies.
create schema private;
create schema storage;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.actor_id',true),'')::uuid $$;
create role anon;
create role authenticated;
create role service_role bypassrls;
create table storage.buckets(id text primary key,public boolean);
create table storage.objects(bucket_id text,name text);
insert into storage.buckets values('phms-medical-sources',false);
create table private.test_context(line_user_id text,actor_user_id uuid,target_person_id uuid,target_person_name text,active_family_id uuid,active_family_person_id uuid,can_view boolean default true,can_create boolean default true,can_update boolean default true);
create table public.phms_runtime_environment(singleton boolean primary key);
insert into public.phms_runtime_environment values(true);
create function private.resolve_line_user_for_service(p_line_user_id text) returns table(user_id uuid)
language sql security invoker as $$ select actor_user_id from private.test_context where line_user_id=p_line_user_id $$;
create function private.phms_line_crud_context(p_line_user_id text,p_resource text,p_action text)
returns table(actor_user_id uuid,target_person_id uuid,target_person_name text,active_family_id uuid,active_family_person_id uuid)
language plpgsql security invoker as $$
begin
 return query select c.actor_user_id,c.target_person_id,c.target_person_name,c.active_family_id,c.active_family_person_id
 from private.test_context c where c.line_user_id=p_line_user_id and p_resource='health'
 and case p_action when 'view' then c.can_view when 'create' then c.can_create when 'update' then c.can_update else false end;
end $$;
-- The policy predicates are imported verbatim; identity/permission resolution is
-- synthetic so these tests never need patient accounts or production data.
create function public.phms_can_access_person(p_person uuid,p_resource text,p_action text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.test_context c where c.actor_user_id=auth.uid() and c.target_person_id=p_person
 and case p_action when 'view' then c.can_view when 'create' then c.can_create when 'update' then c.can_update when 'delete' then c.can_update else false end)
$$;
create function private.phms_storage_asset_visible_to_actor(p_asset uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
begin
 return exists(select 1 from public.phms_storage_assets a where a.id=p_asset and a.deleted_at is null
 and public.phms_can_access_person(a.person_id,'health','view'));
end $$;
