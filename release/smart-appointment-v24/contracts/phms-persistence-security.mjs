// PHMS v2.4: trusted server-side appointment provider verifier and readback.
// Both use the existing provider master tables; never accept browser-supplied names as proof.
import {fetchProviderMaster} from './supabase-provider-master.mjs';
import {verifyProviderSelection} from './provider-hierarchy.mjs';
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
  try{return verifyProviderSelection(await fetchProviderMaster(supabase),selection)===true}catch{return false}
 }
 async function readAuthorizedAppointment(actorId,appointmentId){
  if(!uuid(actorId)||!uuid(appointmentId))return null;
  const {data,error}=await supabase.from('appointments').select('id,family_id,family_person_id,deleted_at').eq('id',appointmentId).limit(2);
  if(error||!Array.isArray(data)||data.length!==1)return null;
  const row=data[0];
  if(!row||row.deleted_at||!uuid(row.family_person_id))return null;
  if(await centralCanAccess(actorId,row.family_person_id,'appointments','view')!==true)return null;
  return row;
 }
 return {verifyProviderBinding,readAuthorizedAppointment};
}
