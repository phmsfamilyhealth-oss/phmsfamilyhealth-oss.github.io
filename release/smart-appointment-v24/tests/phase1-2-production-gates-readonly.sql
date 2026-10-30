-- PHMS v2.4 phase 1-2 repeatable PRODUCTION read-only gate prerequisites.
-- All checks read metadata or release configuration; no patient data and no writes.
WITH checks AS (
SELECT 'appointments_rls' name,(SELECT relrowsecurity FROM pg_class WHERE oid='public.appointments'::regclass) pass
UNION ALL SELECT 'tasks_rls',(SELECT relrowsecurity FROM pg_class WHERE oid='public.appointment_tasks'::regclass)
UNION ALL SELECT 'documents_rls',(SELECT relrowsecurity FROM pg_class WHERE oid='public.appointment_document_links'::regclass)
UNION ALL SELECT 'global_gate_closed',(SELECT NOT enabled_for_everyone FROM private.phms_appointment_release_gate WHERE singleton=true)
UNION ALL SELECT 'pilot_gate_empty',(SELECT cardinality(allowed_actor_ids)=0 FROM private.phms_appointment_release_gate WHERE singleton=true)
UNION ALL SELECT 'no_browser_draft_write',NOT has_function_privilege('authenticated','public.phms_line_save_appointment_wizard_draft(text,uuid,jsonb)','execute')
UNION ALL SELECT 'no_anonymous_draft_write',NOT has_function_privilege('anon','public.phms_line_save_appointment_wizard_draft(text,uuid,jsonb)','execute')
UNION ALL SELECT 'private_central_access_exists',to_regprocedure('private.user_can_access_family_person(uuid,uuid,text,text)') IS NOT NULL
UNION ALL SELECT 'private_commit_not_installed',to_regprocedure('public.phms_v24_commit_appointment(uuid,uuid,uuid,uuid,jsonb)') IS NULL
)
SELECT name,pass FROM checks ORDER BY name;
