-- PHMS v2.4 read-only baseline assertions
-- Never mutates production data. Expected: 14 rows, all pass=true.
with checks as (
select 'canonical_appointments' name, to_regclass('public.appointments') is not null pass
union all select 'procedures',to_regclass('public.appointment_procedure_items') is not null
union all select 'tasks',to_regclass('public.appointment_tasks') is not null
union all select 'document_links',to_regclass('public.appointment_document_links') is not null
union all select 'master_org',to_regclass('public.healthcare_organizations') is not null
union all select 'master_units',to_regclass('public.healthcare_service_units') is not null
union all select 'master_clinicians',to_regclass('public.healthcare_clinicians') is not null
union all select 'appointments_rls',(select relrowsecurity from pg_class where oid='public.appointments'::regclass)
union all select 'tasks_rls',(select relrowsecurity from pg_class where oid='public.appointment_tasks'::regclass)
union all select 'documents_rls',(select relrowsecurity from pg_class where oid='public.appointment_document_links'::regclass)
union all select 'release_disabled',(select not enabled_for_everyone from private.phms_appointment_release_gate where singleton=true)
union all select 'allowlist_empty',(select coalesce(array_length(allowed_actor_ids,1),0)=0 from private.phms_appointment_release_gate where singleton=true)
union all select 'wizard_no_browser_execute',not has_function_privilege('authenticated','public.phms_line_save_appointment_wizard_draft(text,uuid,jsonb)','EXECUTE')
union all select 'wizard_gate_no_browser_execute',not has_function_privilege('authenticated','public.phms_line_appointment_wizard_enabled(text)','EXECUTE')
) select name,pass from checks order by name;
