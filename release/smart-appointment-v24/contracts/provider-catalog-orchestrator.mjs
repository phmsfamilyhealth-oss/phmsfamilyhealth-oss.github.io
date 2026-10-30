// PHMS v2.4: verified backend master-data adapter contract.
// Never exposes unscoped hospital data or uses client-supplied patient/actor UUIDs.
import {providerPickerState} from './provider-picker-state.mjs';
export async function loadAuthorizedProviderPicker({credential,personCode,organizationId='',unitId='',clinicianId=''},adapters){
 if(typeof credential!=='string'||credential.length<8)return {ok:false,error:'unauthenticated'};
 if(typeof personCode!=='string'||!personCode)return {ok:false,error:'person_required'};
 const actor=await adapters.verifyLineIdentity(credential);
 if(!actor?.userId)return {ok:false,error:'unauthenticated'};
 const person=await adapters.resolvePerson(actor.userId,personCode);
 if(!person?.familyPersonId)return {ok:false,error:'person_not_found'};
 if(await adapters.isReleaseEnabled(actor.userId)!==true)return {ok:false,error:'feature_not_released'};
 if(await adapters.centralCanAccess(actor.userId,person.familyPersonId,'appointments','view')!==true)return {ok:false,error:'permission_denied'};
 const master=await adapters.getAuthorizedProviderMaster(actor.userId,person.familyPersonId);
 if(!master||!Array.isArray(master.organizations)||!Array.isArray(master.units)||!Array.isArray(master.clinicians))return {ok:false,error:'provider_catalog_unavailable'};
 return {ok:true,...providerPickerState(master,organizationId,unitId,clinicianId)};
}
