// PHMS v2.4: security-first orchestration contract, not an HTTP endpoint.
// Adapters MUST use verified LINE ID token and existing central permissions.
// Keep this module isolated from Production until backend integration acceptance.
import {validateAppointmentDraft} from './scenario-validator.mjs';
import {prepareDraftForReview} from './draft-packager.mjs';
import {canonicalizeVisit} from './canonical-visit-mapper.mjs';
import {verifyCanonicalVisitAgainstDatabase} from './db-constraint-gate.mjs';

const failure=(code)=>({ok:false,error:code});
export async function confirmAppointment(request, adapters){
  if(!request || typeof request!=='object' || !adapters) return failure('invalid_request');
  const {credential,draft,operationKey,selectedPersonCode}=request;
  if(typeof credential!=='string' || credential.length<8) return failure('unauthenticated');
  if(typeof selectedPersonCode!=='string' || !selectedPersonCode.trim()) return failure('person_required');
  if(typeof operationKey!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operationKey)) return failure('invalid_operation_key');

  // No actor IDs, family IDs, or permissions supplied from the browser are trusted.
  const actor=await adapters.verifyLineIdentity(credential);
  if(!actor?.userId) return failure('unauthenticated');
  const subject=await adapters.resolvePerson(actor.userId,selectedPersonCode);
  if(!subject?.familyPersonId || !subject?.familyId) return failure('person_not_found');
  if(await adapters.isReleaseEnabled(actor.userId)!==true) return failure('feature_not_released');
  if(await adapters.centralCanAccess(actor.userId,subject.familyPersonId,'appointments','create')!==true)
    return failure('permission_denied');

  // A successful create must be readable by the same actor; do not write and then discover the actor cannot view it.
  if(await adapters.centralCanAccess(actor.userId,subject.familyPersonId,'appointments','view')!==true)
    return failure('read_permission_denied');

  const validation=validateAppointmentDraft(draft);
  if(!validation.ok) return failure('invalid_draft');
  const visit=canonicalizeVisit(draft);
  if(!visit.ok) return failure('invalid_draft');
  if(!verifyCanonicalVisitAgainstDatabase(visit.visit).ok) return failure('invalid_draft');
  const prepared=prepareDraftForReview(draft);
  if(!prepared.ok) return failure('invalid_draft');
  // This must resolve from server masters; NEVER trust draft provider objects.
  if(await adapters.verifyProviderBinding(prepared.draft,subject)!==true)
    return failure('provider_mismatch');
  if(prepared.draft.document_metadata.length &&
    await adapters.centralCanAccess(actor.userId,subject.familyPersonId,'documents','create')!==true)
    return failure('document_permission_denied');

  // Adapter is responsible for one atomic transaction, idempotent operation key,
  // authorization recheck inside transaction, attachment ownership and readback.
  const receipt=await adapters.atomicCommit({
    actorId:actor.userId,subjectId:subject.familyPersonId,familyId:subject.familyId,
    operationKey,draft:prepared.draft,canonicalVisit:visit.visit
  });
  if(!receipt?.appointmentId || receipt?.authorizedReadback!==true)
    return failure('commit_not_verified');
  return {ok:true,appointmentId:receipt.appointmentId,idempotentReplay:receipt.idempotentReplay===true};
}
