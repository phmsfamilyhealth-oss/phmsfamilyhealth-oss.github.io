// Backend-only receipt gate: verify the persisted canonical row after an atomic commit.
// The read function MUST be scoped to the authenticated actor using central appointments:view.
// This is isolated code and is not deployed.
export async function verifiedAppointmentReadback({appointmentId,actorId,subjectId,familyId,expectedRow}, adapters) {
 if(!appointmentId||!actorId||!subjectId||!familyId)return {ok:false,error:'invalid_receipt'};
 if(await adapters.centralCanAccess(actorId,subjectId,'appointments','view')!==true)return {ok:false,error:'read_permission_denied'};
 const row=await adapters.readAuthorizedAppointment(actorId,appointmentId);
 if(!row||row.deleted_at||row.family_id!==familyId||row.family_person_id!==subjectId||row.id!==appointmentId)return {ok:false,error:'readback_mismatch'};
 const keys=['title','note','hospital_name','department','doctor_name','hospital_hn','hospital_vn','location_detail','contact_phone','care_topic','coverage_type','arrival_lead_minutes','visit_outcome_notes','diagnosis_summary','treatment_summary','test_results_summary','medication_plan_notes','next_steps','walk_in_reason'];
 for(const key of keys){if(expectedRow&&Object.hasOwn(expectedRow,key)&&expectedRow[key]!=null&&String(row[key]??'').trim()!==String(expectedRow[key]).trim())return {ok:false,error:'readback_content_mismatch'};}
 return {ok:true,appointmentId:row.id,verified:true};
}
