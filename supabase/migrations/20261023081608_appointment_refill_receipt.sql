-- One atomic receipt, using the existing stock ledger, containers and expense tables.
-- Each planned item is finalized once. Further supplies require an explicit new refill item.
CREATE OR REPLACE FUNCTION public.phms_line_refill_receive(
 p_line_user_id text,p_appointment_id uuid,p_key text,p_items jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE ctx record; apt record; item record; pm record; x jsonb; old_event record;
 qty numeric; cost numeric; unit_name text; status_name text; dispense_ref uuid;
 expense_ref uuid; expense_item_ref uuid; stocked jsonb; receipt jsonb;
 results jsonb:='[]'; result jsonb; request jsonb;
BEGIN
 SELECT * INTO ctx FROM private.phms_line_crud_context(p_line_user_id,'appointment','update');
 PERFORM * FROM private.phms_line_crud_context(p_line_user_id,'medication','create');
 IF NOT public.phms_line_appointment_wizard_enabled(p_line_user_id) THEN RAISE EXCEPTION 'refill_receipt_release_disabled'; END IF;
 IF length(coalesce(p_key,'')) NOT BETWEEN 12 AND 120 OR jsonb_typeof(p_items) IS DISTINCT FROM 'array'
 OR coalesce(jsonb_array_length(p_items),0) NOT BETWEEN 1 AND 40 THEN RAISE EXCEPTION 'invalid_receipt'; END IF;
 SELECT * INTO apt FROM public.appointments WHERE id=p_appointment_id AND person_id=ctx.target_person_id
 AND family_id=ctx.active_family_id AND appointment_type='medication_refill' AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'refill_not_found_or_denied'; END IF;
 request:=jsonb_build_object('key',p_key,'items',p_items);
 SELECT * INTO old_event FROM public.audit_logs WHERE record_id=apt.id AND event_type='refill.received'
 AND new_data->'request'->>'key'=p_key ORDER BY created_at DESC LIMIT 1;
 IF FOUND THEN
  IF old_event.new_data->'request'<>request THEN RAISE EXCEPTION 'receipt_idempotency_conflict'; END IF;
  RETURN (old_event.new_data->'result')||jsonb_build_object('duplicate',true);
 END IF;
 IF apt.status IN ('cancelled','canceled') THEN RAISE EXCEPTION 'refill_cancelled'; END IF;
 IF (SELECT count(DISTINCT v->>'item_id') FROM jsonb_array_elements(p_items) v)<>jsonb_array_length(p_items)
 THEN RAISE EXCEPTION 'duplicate_receipt_item'; END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  SELECT * INTO item FROM public.medication_refill_items WHERE id=(x->>'item_id')::uuid AND appointment_id=apt.id FOR UPDATE;
  IF NOT FOUND OR item.status<>'PLANNED' THEN RAISE EXCEPTION 'refill_item_not_planned'; END IF;
  SELECT * INTO pm FROM public.person_medications WHERE id=item.person_medication_id AND person_id=apt.person_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'refill_medication_not_owned'; END IF;
  qty:=(x->>'quantity')::numeric; unit_name:=nullif(btrim(x->>'unit'),''); cost:=(x->>'cost')::numeric;
  status_name:=x->>'status';
  IF qty IS NULL OR qty<0 OR qty>1000000 OR qty::text IN ('NaN','Infinity','-Infinity')
   OR unit_name IS NULL OR length(unit_name)>30 OR status_name IS NULL OR status_name NOT IN ('RECEIVED','PARTIALLY_RECEIVED','NOT_RECEIVED')
   OR (qty=0)<>(status_name='NOT_RECEIVED') OR (cost IS NOT NULL AND (cost<0 OR cost>10000000 OR cost::text IN ('NaN','Infinity','-Infinity')))
   OR (qty=0 AND coalesce(cost,0)<>0) THEN RAISE EXCEPTION 'invalid_actual_receipt'; END IF;
  stocked:=NULL;dispense_ref:=NULL;expense_ref:=NULL;
  IF qty>0 THEN
   stocked:=public.phms_med_v23_line_inventory_intake_commit(p_line_user_id,(x->>'pool_id')::uuid,
    (x->>'location_id')::uuid,pm.medication_id,nullif(btrim(x->>'lot'),''),nullif(x->>'expiry','')::date,
    x->>'container',qty,unit_name,'รับยาจริงตามนัด '||apt.id::text,p_key||':'||item.id::text);
   INSERT INTO public.medication_dispenses(person_medication_id,dispensed_at,quantity,quantity_unit,external_reference,created_by)
    VALUES(pm.id,now(),qty,unit_name,'refill-receipt:'||p_key||':'||item.id,ctx.actor_user_id) RETURNING id INTO dispense_ref;
   UPDATE public.medication_inventory_receipt_evidence SET dispense_id=dispense_ref
    WHERE transaction_id=(stocked->>'transaction_id')::uuid;
   IF cost IS NOT NULL THEN
    PERFORM 1 FROM public.phms_resolve_line_command_context(p_line_user_id,'expenses','create',true,'any') c
     WHERE c.permission_granted AND c.context_ready AND c.target_person_id=apt.person_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'expense_permission_denied'; END IF;
    INSERT INTO public.healthcare_expenses(person_id,appointment_id,expense_date,medication_amount,total_amount,created_by,notes)
     VALUES(apt.person_id,apt.id,current_date,cost,cost,ctx.actor_user_id,'รับยาจริงตามนัด') RETURNING id INTO expense_ref;
    INSERT INTO public.healthcare_expense_items(expense_id,category,label,amount,created_by)
     VALUES(expense_ref,'medication','ค่ายาที่ได้รับตามนัด',cost,ctx.actor_user_id) RETURNING id INTO expense_item_ref;
    INSERT INTO public.medication_expense_links(dispense_id,expense_item_id,allocated_amount,allocated_quantity,recorded_by)
     VALUES(dispense_ref,expense_item_ref,cost,qty,ctx.actor_user_id);
   END IF;
  END IF;
  UPDATE public.medication_refill_items SET received_quantity=qty,received_unit=unit_name,status=status_name,
   dispense_id=dispense_ref,updated_at=now() WHERE id=item.id;
  results:=results||jsonb_build_array(jsonb_build_object('item_id',item.id,'quantity',qty,'unit',unit_name,
    'status',status_name,'dispense_id',dispense_ref,'stock',stocked,'expense_id',expense_ref));
 END LOOP;
 result:=jsonb_build_object('ok',true,'appointment_id',apt.id,'person_id',apt.person_id,'items',results,'duplicate',false);
 INSERT INTO public.audit_logs(family_id,actor_user_id,family_person_id,event_type,resource,record_id,new_data)
  VALUES(ctx.active_family_id,ctx.actor_user_id,ctx.active_family_person_id,'refill.received','medications',apt.id,
    jsonb_build_object('request',request,'result',result));
 RETURN result;
END $fn$;
REVOKE ALL ON FUNCTION public.phms_line_refill_receive(text,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.phms_line_refill_receive(text,uuid,text,jsonb) TO service_role;
