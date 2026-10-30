-- PHMS v2.4 AUTH BOUNDARY read-only acceptance prerequisites
-- Returns diagnostic pass flags only; does not access patient records.
WITH checks AS (
 SELECT 'candidate_commit_not_browser_callable' name,
 NOT has_function_privilege('authenticated','private.phms_commit_appointment_candidate(uuid,uuid)','EXECUTE') AS pass
 UNION ALL SELECT 'candidate_base_not_browser_callable',
 NOT has_function_privilege('authenticated','private.phms_commit_appointment_candidate_base_20261010(uuid,uuid)','EXECUTE')
 UNION ALL SELECT 'wizard_draft_get_not_browser_callable',
 NOT has_function_privilege('authenticated','public.phms_line_get_appointment_wizard_draft(text,uuid)','EXECUTE')
 UNION ALL SELECT 'line_context_not_browser_callable',
 NOT has_function_privilege('authenticated','public.phms_resolve_line_command_context(text,text,text,boolean,text)','EXECUTE')
 UNION ALL SELECT 'wizard_save_not_anon_callable',
 NOT has_function_privilege('anon','public.phms_line_save_appointment_wizard_draft(text,uuid,jsonb)','EXECUTE')
 UNION ALL SELECT 'wizard_get_not_anon_callable',
 NOT has_function_privilege('anon','public.phms_line_get_appointment_wizard_draft(text,uuid)','EXECUTE')
 UNION ALL SELECT 'line_context_not_anon_callable',
 NOT has_function_privilege('anon','public.phms_resolve_line_command_context(text,text,text,boolean,text)','EXECUTE')
 UNION ALL SELECT 'wizard_save_backend_callable',
 has_function_privilege('service_role','public.phms_line_save_appointment_wizard_draft(text,uuid,jsonb)','EXECUTE')
 UNION ALL SELECT 'release_gate_disabled',
 (SELECT NOT enabled_for_everyone FROM private.phms_appointment_release_gate WHERE singleton=true)
 UNION ALL SELECT 'release_allowlist_empty',
 (SELECT COALESCE(array_length(allowed_actor_ids,1),0)=0 FROM private.phms_appointment_release_gate WHERE singleton=true)
) SELECT name, pass FROM checks ORDER BY name;
