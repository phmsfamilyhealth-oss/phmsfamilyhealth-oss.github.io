// Wire existing PHMS member and LINE identity adapters into the protected backend.
// Security and provider/readback/identity-write policies remain required trusted adapters.
import {makeAppointmentBackend} from './appointment-backend.mjs';
import {makePhmsLineIdentityAdapter} from './phms-line-identity-adapter.mjs';
import {makePhmsPersonResolver} from './phms-person-resolver.mjs';
import {makePhmsAuthorityAdapter} from './phms-private-authority.mjs';
import {makePhmsWriteIdentityResolver} from './phms-write-identity-resolver.mjs';
import {makePhmsPersistenceSecurity} from './phms-persistence-security.mjs';
export function makePhmsAppointmentHttpHandler({supabase,channelId,fetchImpl,privateQuery,security}={}){
 if(!supabase?.from||!supabase?.rpc||typeof privateQuery!=='function'||typeof security?.resolveAppointmentType!=='function')
  throw new Error('phms_http_backend_not_configured');
 const authority=makePhmsAuthorityAdapter(privateQuery);
 const persistence=makePhmsPersistenceSecurity({supabase,centralCanAccess:authority.centralCanAccess});
 const mergedSecurity={...security,...authority,...persistence};
 const resolveWriteIdentity=makePhmsWriteIdentityResolver({supabase,centralCanAccess:authority.centralCanAccess,resolveAppointmentType:security.resolveAppointmentType});
 const verifyLineIdentity=makePhmsLineIdentityAdapter({supabase,channelId,fetchImpl});
 const resolvePerson=makePhmsPersonResolver({supabase,centralCanAccess:authority.centralCanAccess});
 return makeAppointmentBackend({supabase,security:{...mergedSecurity,verifyLineIdentity,resolvePerson,resolveWriteIdentity}});
}
