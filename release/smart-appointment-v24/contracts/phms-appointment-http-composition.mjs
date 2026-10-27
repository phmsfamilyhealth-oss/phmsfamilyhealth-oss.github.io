// Wire existing PHMS member and LINE identity adapters into the protected backend.
// Security and provider/readback/identity-write policies remain required trusted adapters.
import {makeAppointmentBackend} from './appointment-backend.mjs';
import {makePhmsLineIdentityAdapter} from './phms-line-identity-adapter.mjs';
import {makePhmsPersonResolver} from './phms-person-resolver.mjs';
import {makePhmsAuthorityAdapter} from './phms-private-authority.mjs';
export function makePhmsAppointmentHttpHandler({supabase,channelId,fetchImpl,privateQuery,security}={}){
 if(!supabase?.from||!supabase?.rpc||typeof privateQuery!=='function'||!security)
  throw new Error('phms_http_backend_not_configured');
 const authority=makePhmsAuthorityAdapter(privateQuery);
 const mergedSecurity={...security,...authority};
 const verifyLineIdentity=makePhmsLineIdentityAdapter({supabase,channelId,fetchImpl});
 const resolvePerson=makePhmsPersonResolver({supabase,centralCanAccess:authority.centralCanAccess});
 return makeAppointmentBackend({supabase,security:{...mergedSecurity,verifyLineIdentity,resolvePerson}});
}
