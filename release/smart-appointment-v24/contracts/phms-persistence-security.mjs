// PHMS v2.4: trusted server-side appointment provider verifier and readback.
// Both use the existing provider master tables; never accept browser-supplied names as proof.
import {fetchProviderMaster} from './supabase-provider-master.mjs';
import {verifyProviderSelection} from './provider-hierarchy.mjs';
const norm=x=>typeof x==='string'?x.trim().replace(/\s+/g,' ').toLocaleLowerCase():'';
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
export function makePhmsPersistenceSecurity({supabase,centralCanAccess}={}){
 if(!supabase?.from||typeof centralCanAccess!=='function')throw new Error('persistence_security_not_configured');
 async function verifyProviderBinding(draft){
  // Free-text provider names are not verifiable master data; block until registry IDs
  // are supplied AND the current server catalog confirms the exact hierarchy.
  const selection=draft?.provider_selection;
  if(!selection?.organizationId||!uuid(selection.organizationId))return false;
  if(selection.unitId&&!uuid(selection.unitId))return false;
  if(selection.clinicianId&&!uuid(selection.clinicianId))return false;
  try{
   const master=await fetchProviderMaster(supabase);
   if(verifyProviderSelection(master,selection)!==true)return false;
   const org=master.organizations.find(x=>x.id===selection.organizationId);
   const unit=selection.unitId?master.units.find(x=>x.id===selection.unitId):null;
   const clinician=selection.clinicianId?master.clinicians.find(x=>x.id===selection.clinicianId):null;
   if(!org||!norm(draft.hospital_name)||![org.name,org.display_name].some(x=>norm(x)===norm(draft.hospital_name)))return false;
   if(unit&&norm(unit.name)!==norm(draft.department))return false;
   if(clinician&&norm(clinician.display_name)!==norm(draft.doctor_name))return false;
   if(!unit&&norm(draft.department))return false;
   // Manual doctor name is appointment-local only; never infer a clinician ID.
   if(!clinician&&draft.doctor_name!=null&&typeof draft.doctor_name!=='string')return false;
   return true;
  }catch{return false}
 }
 async function readAuthorizedAppointment(actorId,appointmentId){
  if(!uuid(actorId)||!uuid(appointmentId))return null;
  const {data,error}=await supabase.from('appointments').select('id,family_id,family_person_id,deleted_at,title,note,hospital_name,department,doctor_name,hospital_hn,hospital_vn,location_detail,contact_phone,care_topic,coverage_type,arrival_lead_minutes,visit_outcome_notes,diagnosis_summary,treatment_summary,test_results_summary,medication_plan_notes,next_steps,walk_in_reason').eq('id',appointmentId).limit(2);
  if(error||!Array.isArray(data)||data.length!==1)return null;
  const row=data[0];
  if(!row||row.deleted_at||!uuid(row.family_person_id))return null;
  if(await centralCanAccess(actorId,row.family_person_id,'appointments','view')!==true)return null;
  return row;
 }
 return {verifyProviderBinding,readAuthorizedAppointment};
}
