import {makeAuthorizedAppointmentSources} from './authorized-appointment-sources.mjs';
// Wire existing PHMS member and LINE identity adapters into the protected backend.
// Security and provider/readback/identity-write policies remain required trusted adapters.
import {makeAppointmentBackend} from './appointment-backend.mjs';
import {makePhmsLineIdentityAdapter} from './phms-line-identity-adapter.mjs';
import {makePhmsPersonResolver} from './phms-person-resolver.mjs';
import {makePhmsAuthorityAdapter} from './phms-private-authority.mjs';
import {makePhmsWriteIdentityResolver} from './phms-write-identity-resolver.mjs';
import {makePhmsPersistenceSecurity} from './phms-persistence-security.mjs';
import {makeAuthorizedProviderCatalogHandler} from './authorized-provider-catalog.mjs';
import {makeAuthorizedPersonPicker} from './authorized-person-picker.mjs';
export function makePhmsAppointmentHttpHandler({supabase,channelId,fetchImpl,privateQuery,security}={}){
 if(!supabase?.from||!supabase?.rpc||typeof privateQuery!=='function'||typeof security?.resolveAppointmentType!=='function')
  throw new Error('phms_http_backend_not_configured');
 const authority=makePhmsAuthorityAdapter(privateQuery);
 const persistence=makePhmsPersistenceSecurity({supabase,centralCanAccess:authority.centralCanAccess});
 const mergedSecurity={...security,...authority,...persistence};
 const resolveWriteIdentity=makePhmsWriteIdentityResolver({supabase,centralCanAccess:authority.centralCanAccess,resolveAppointmentType:security.resolveAppointmentType});
 const verifyLineIdentity=makePhmsLineIdentityAdapter({supabase,channelId,fetchImpl});
 const resolvePerson=makePhmsPersonResolver({supabase,centralCanAccess:authority.centralCanAccess});
 const appointment=makeAppointmentBackend({supabase,security:{...mergedSecurity,verifyLineIdentity,resolvePerson,resolveWriteIdentity}});
 const catalog=makeAuthorizedProviderCatalogHandler({supabase,verifyLineIdentity,resolvePerson,isReleaseEnabled:authority.isReleaseEnabled,centralCanAccess:authority.centralCanAccess});
 const sources=makeAuthorizedAppointmentSources({supabase,verifyLineIdentity,resolvePerson,isReleaseEnabled:authority.isReleaseEnabled,centralCanAccess:authority.centralCanAccess});
 const personPicker=makeAuthorizedPersonPicker({supabase,verifyLineIdentity,isReleaseEnabled:authority.isReleaseEnabled,centralCanAccess:authority.centralCanAccess});
 return async request=>{
  if(request.method==='POST'&&request.headers.get('content-type')?.split(';',1)[0].trim().toLowerCase()==='application/json'){
   try{
    const rawText=await request.clone().text();
    if(new TextEncoder().encode(rawText).byteLength<=32768){const raw=JSON.parse(rawText);if(raw?.action==='provider_catalog')return catalog(request,raw);if(raw?.action==='person_options')return personPicker(request,raw);if(raw?.action==='appointment_sources')return sources(request,raw);}
   }catch{/* existing appointment handler supplies uniform invalid-request errors */}
  }
  return appointment(request);
 };
}
