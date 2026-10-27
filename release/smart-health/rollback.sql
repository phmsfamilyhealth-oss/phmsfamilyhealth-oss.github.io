-- Operational rollback, not destructive schema removal.
-- Run only after approval and a fresh dependency/privilege review.
-- Retain measurement columns, photos, sessions and every audit record.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
update public.phms_runtime_environment
 set health_smart_intake_release_state='off',health_smart_intake_test_actor_ids='{}';
revoke execute on function public.phms_smart_health(text,text,uuid,jsonb) from public,anon,authenticated,service_role;
-- Restore grants introduced by this release against the recorded baseline.
-- Do not revoke any pre-existing Storage/asset/config privileges.
revoke select,insert,update on public.data_intake_sessions,public.data_intake_sources,public.medical_documents from service_role;
revoke insert on public.data_intake_actions from service_role;
revoke select,insert on public.health_measurements from service_role;
revoke execute on function private.phms_line_crud_context(text,text,text) from service_role;
commit;
