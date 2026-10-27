// Compose an atomic writer with independently authorized persisted readback.
// This is an isolated backend contract, NOT a deployed persistence implementation.
import {verifiedAppointmentReadback} from './appointment-readback.mjs';
export function makeVerifiedAtomicCommit(adapters){
 return async function atomicCommit(command){
  if(!command?.actorId||!command?.subjectId||!command?.familyId||!command?.operationKey||!command?.canonicalVisit)return null;
  // Adapter MUST transact and recheck authorization and idempotency inside PostgreSQL.
  const write=await adapters.commitInSingleTransaction(command);
  if(!write?.appointmentId)return null;
  const verified=await verifiedAppointmentReadback({appointmentId:write.appointmentId,actorId:command.actorId,subjectId:command.subjectId,familyId:command.familyId},adapters);
  if(!verified.ok)return {appointmentId:write.appointmentId,authorizedReadback:false};
  return {appointmentId:write.appointmentId,authorizedReadback:true,idempotentReplay:write.idempotentReplay===true};
 };
}
