// Server-only persistence boundary. Requires a NEW gated PostgreSQL transaction RPC.
// Never fall back to client-side INSERT or the legacy intake-candidate function.
// Intentionally returns failure until the reviewed RPC is installed and authorized.
export function makeSupabaseAppointmentTransaction(supabase){
 return async function commitInSingleTransaction(command){
  if(!supabase?.rpc||!command?.preparedRow||!command.operationKey||!command.actorId) return null;
  const {data,error}=await supabase.rpc('phms_v24_commit_appointment', {
   p_actor_user_id:command.actorId,p_operation_key:command.operationKey,
   p_expected_family_id:command.familyId,p_expected_family_person_id:command.subjectId,
   p_appointment:command.preparedRow
  });
  if(error||data?.ok!==true||typeof data.appointment_id!=='string')return null;
  return {appointmentId:data.appointment_id,idempotentReplay:data.idempotent_replay===true};
 };
}
