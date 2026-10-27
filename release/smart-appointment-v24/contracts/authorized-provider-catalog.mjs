// Trusted read-only route. No catalog before LINE verification, family-person
// resolution, central view permission and the owner-controlled release gate.
import {fetchProviderMaster} from './supabase-provider-master.mjs';
const response=(data,status)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
export function makeAuthorizedProviderCatalogHandler({supabase,verifyLineIdentity,resolvePerson,isReleaseEnabled,centralCanAccess}={}){
 if(!supabase?.from||[verifyLineIdentity,resolvePerson,isReleaseEnabled,centralCanAccess].some(f=>typeof f!=='function'))throw new Error('catalog_security_not_configured');
 return async(request,raw)=>{
  if(request.method!=='POST'||!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get('content-type')||''))return response({ok:false,error:'invalid_request'},400);
  if(!raw||raw.action!=='provider_catalog'||typeof raw.selectedPersonCode!=='string'||!(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw.selectedPersonCode)))return response({ok:false,error:'invalid_request'},400);
  const token=/^Bearer ([^\s]+)$/.exec(request.headers.get('authorization')||'')?.[1];
  if(!token)return response({ok:false,error:'unauthenticated'},401);
  try{
   const actor=await verifyLineIdentity(token);
   if(!actor?.userId)return response({ok:false,error:'unauthenticated'},401);
   if(await isReleaseEnabled(actor.userId)!==true)return response({ok:false,error:'feature_not_released'},404);
   const person=await resolvePerson(actor.userId,raw?.selectedPersonCode);
   if(!person?.familyPersonId)return response({ok:false,error:'person_not_found'},404);
   if(await centralCanAccess(actor.userId,person.familyPersonId,'appointments','view')!==true)return response({ok:false,error:'permission_denied'},403);
   const catalog=await fetchProviderMaster(supabase);
   return response({ok:true,catalog},200);
  }catch{return response({ok:false,error:'catalog_unavailable'},503);}
 };
}
