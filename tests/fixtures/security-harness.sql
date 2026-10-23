-- Isolated integration harness. This is not a copy of Production authorization policies.
create schema private;
create schema storage;
create role anon;
create role authenticated;
create role service_role bypassrls;
create table storage.buckets(id text primary key,public boolean);
create table storage.objects(bucket_id text,name text);
insert into storage.buckets values('phms-medical-sources',false);
create table private.test_context(line_user_id text,actor_user_id uuid,target_person_id uuid,target_person_name text,active_family_id uuid,active_family_person_id uuid,can_view boolean default true,can_create boolean default true,can_update boolean default true);
create function private.phms_line_crud_context(p_line_user_id text,p_resource text,p_action text)
returns table(actor_user_id uuid,target_person_id uuid,target_person_name text,active_family_id uuid,active_family_person_id uuid)
language plpgsql security invoker as $$
begin
 return query select c.actor_user_id,c.target_person_id,c.target_person_name,c.active_family_id,c.active_family_person_id
 from private.test_context c where c.line_user_id=p_line_user_id and p_resource='health'
 and case p_action when 'view' then c.can_view when 'create' then c.can_create when 'update' then c.can_update else false end;
end $$;
