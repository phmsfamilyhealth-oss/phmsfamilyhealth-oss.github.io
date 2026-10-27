// Compose an atomic writer with independently authorized persisted readback.
// This is an isolated backend contract, NOT a deployed persistence implementation.
import {verifiedAppointmentReadback} from './appointment-readback.mjs';
import {prepareVerifiedAppointmentWrite} from './verified-write-preparation.mjs';
export function makeVerifiedAtomicCommit(adapters){
 return async function atomicCommit(command){
  if(!command?.actorId||!command?.subjectId||!command?.familyId||!command?.operationKey||!command?.canonicalVisit)return null;
  const prepared=await prepareVerifiedAppointmentWrite(command,adapters);
  if(!prepared.ok)return null;
  // PostgreSQL adapter MUST recheck rights, bind operationKey atomically and write prepared.row.
  const write=await adapters.commitInSingleTransaction({...command,preparedRow:prepared.row});
  if(!write?.appointmentId)return null;
  const verified=await verifiedAppointmentReadback({appointmentId:write.appointmentId,actorId:command.actorId,subjectId:command.subjectId,familyId:command.familyId},adapters);
  if(!verified.ok)return {appointmentId:write.appointmentId,authorizedReadback:false};
  return {appointmentId:write.appointmentId,authorizedReadback:true,idempotentReplay:write.idempotentReplay===true};
 };
}
