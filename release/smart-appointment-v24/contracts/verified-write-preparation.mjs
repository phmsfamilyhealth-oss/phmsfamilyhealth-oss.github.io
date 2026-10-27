// Fail-closed server-side preparation for the PostgreSQL transaction adapter.
// Never trust family/person/type identifiers supplied by the LIFF browser.
import {mapAppointmentInsert} from './supabase-appointment-row.mjs';
export async function prepareVerifiedAppointmentWrite(command,adapters){
 if(!command?.actorId||!command?.subjectId||!command?.familyId||!adapters?.resolveWriteIdentity)
  return {ok:false,error:'missing_verified_context'};
 // The initial RPC cannot atomically persist document links or structured checklist items.
 if((command.draft?.document_metadata?.length||0)>0) return {ok:false,error:'related_records_not_supported'};
 const identity=await adapters.resolveWriteIdentity(command.actorId,command.subjectId,command.familyId,command);
 if(!identity?.personId||!identity?.appointmentType)return {ok:false,error:'write_identity_unresolved'};
 // The resolver must verify identity and appointment category against server-owned tables.
 if(identity.familyPersonId!==command.subjectId||identity.familyId!==command.familyId)
  return {ok:false,error:'write_identity_mismatch'};
 const result=mapAppointmentInsert({...command,personId:identity.personId,appointmentType:identity.appointmentType});
 if(!result.ok)return result;
 return {ok:true,row:result.row,operationKey:command.operationKey};
}
