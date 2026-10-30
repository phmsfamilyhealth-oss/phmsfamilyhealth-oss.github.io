// PHMS v2.4: explicit server-only composition root.
// Identity, central permissions, person/provider resolution and authorized readback
// MUST be independently implemented by the trusted LINE backend, not by the browser.
import {handleAppointmentConfirm} from './confirm-http-handler.mjs';
import {makeVerifiedAtomicCommit} from './verified-atomic-commit.mjs';
import {makeSupabaseAppointmentTransaction} from './supabase-transaction-adapter.mjs';
const required=['verifyLineIdentity','resolvePerson','isReleaseEnabled','centralCanAccess','verifyProviderBinding','resolveWriteIdentity','readAuthorizedAppointment'];
export function makeAppointmentBackend({supabase,security}={}){
 if(!supabase?.rpc||!security||required.some(k=>typeof security[k]!=='function'))throw new Error('backend_not_configured');
 const adapters={...Object.fromEntries(required.map(k=>[k,(...args)=>security[k](...args)])),
   commitInSingleTransaction:makeSupabaseAppointmentTransaction(supabase)};
 adapters.atomicCommit=makeVerifiedAtomicCommit(adapters);
 return request=>handleAppointmentConfirm(request,adapters);
}
