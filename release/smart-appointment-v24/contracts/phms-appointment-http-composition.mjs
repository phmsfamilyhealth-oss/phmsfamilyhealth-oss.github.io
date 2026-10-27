// Wire existing PHMS member and LINE identity adapters into the protected backend.
// Security and provider/readback/identity-write policies remain required trusted adapters.
import {makeAppointmentBackend} from './appointment-backend.mjs';
import {makePhmsLineIdentityAdapter} from './phms-line-identity-adapter.mjs';
import {makePhmsPersonResolver} from './phms-person-resolver.mjs';
export function makePhmsAppointmentHttpHandler({supabase,channelId,fetchImpl,security}={}){
 if(!supabase?.from||!supabase?.rpc||typeof security?.centralCanAccess!=='function')
  throw new Error('phms_http_backend_not_configured');
 const verifyLineIdentity=makePhmsLineIdentityAdapter({supabase,channelId,fetchImpl});
 const resolvePerson=makePhmsPersonResolver({supabase,centralCanAccess:security.centralCanAccess});
 return makeAppointmentBackend({supabase,security:{...security,verifyLineIdentity,resolvePerson}});
}
