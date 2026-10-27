// Backend-only receipt gate: verify the persisted canonical row after an atomic commit.
// The read function MUST be scoped to the authenticated actor using central appointments:view.
// This is isolated code and is not deployed.
export async function verifiedAppointmentReadback({appointmentId,actorId,subjectId,familyId}, adapters) {
 if(!appointmentId||!actorId||!subjectId||!familyId)return {ok:false,error:'invalid_receipt'};
 if(await adapters.centralCanAccess(actorId,subjectId,'appointments','view')!==true)return {ok:false,error:'read_permission_denied'};
 const row=await adapters.readAuthorizedAppointment(actorId,appointmentId);
 if(!row||row.deleted_at||row.family_id!==familyId||row.family_person_id!==subjectId||row.id!==appointmentId)return {ok:false,error:'readback_mismatch'};
 return {ok:true,appointmentId:row.id,verified:true};
}
