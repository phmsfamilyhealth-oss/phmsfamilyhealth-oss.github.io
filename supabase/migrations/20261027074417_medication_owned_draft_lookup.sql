-- Resolve a LINE intake source by code without exposing the source table through PostgREST.
CREATE FUNCTION public.phms_get_line_intake_review_by_code(p_line_user_id text, p_source_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private,pg_temp AS $$
DECLARE v_user uuid; v_id uuid; v_count integer; v_code text:=lower(btrim(coalesce(p_source_code,'')));
BEGIN
 IF length(v_code)<8 OR length(v_code)>36 OR v_code !~ '^[0-9a-f-]+$' THEN RAISE EXCEPTION 'invalid_source_code'; END IF;
 SELECT li.user_id INTO v_user FROM public.line_identities li WHERE li.line_user_id=p_line_user_id AND li.is_active=true AND li.user_id IS NOT NULL LIMIT 1;
 IF v_user IS NULL THEN RAISE EXCEPTION 'line_identity_not_linked'; END IF;
 SELECT count(*), min(s.id::text)::uuid INTO v_count,v_id FROM public.data_intake_sources s WHERE s.submitted_by=v_user AND lower(s.id::text) LIKE v_code||'%';
 IF v_count=0 THEN RAISE EXCEPTION 'intake_source_not_found'; END IF;
 IF v_count>1 THEN RAISE EXCEPTION 'intake_source_code_ambiguous'; END IF;
 RETURN public.phms_get_line_intake_review_source(p_line_user_id,v_id);
END $$;
REVOKE ALL ON FUNCTION public.phms_get_line_intake_review_by_code(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.phms_get_line_intake_review_by_code(text,text) TO service_role;
