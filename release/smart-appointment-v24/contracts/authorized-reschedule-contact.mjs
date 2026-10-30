// Read-only contact details for one verified institution/unit after LINE, owner and person authorization.
// No actor or family IDs accepted from the browser, and unverified contact rows are not published.
import {resolveRescheduleContact} from './reschedule-contact-fallback.mjs';
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const respond=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
export function makeAuthorizedRescheduleContact({supabase,verifyLineIdentity,resolvePerson,isReleaseEnabled,centralCanAccess}={}){
 if(!supabase?.from||[verifyLineIdentity,resolvePerson,isReleaseEnabled,centralCanAccess].some(x=>typeof x!=='function'))throw Error('contact_security_not_configured');
 return async(request,raw)=>{
  if(request.method!=='POST'||raw?.action!=='reschedule_contact'||!uuid(raw.selectedPersonCode)||!uuid(raw.organizationId)||(raw.unitId&&!uuid(raw.unitId)))return respond(400,{ok:false,error:'invalid_request'});
  const token=/^Bearer ([^\s]+)$/.exec(request.headers.get('authorization')||'')?.[1];if(!token)return respond(401,{ok:false,error:'unauthenticated'});
  try{
   const actor=await verifyLineIdentity(token);if(!actor?.userId)return respond(401,{ok:false,error:'unauthenticated'});
   if(await isReleaseEnabled(actor.userId)!==true)return respond(404,{ok:false,error:'feature_not_released'});
   const person=await resolvePerson(actor.userId,raw.selectedPersonCode);if(!person?.familyPersonId)return respond(404,{ok:false,error:'person_not_found'});
   if(await centralCanAccess(actor.userId,person.familyPersonId,'appointments','view')!==true)return respond(403,{ok:false,error:'permission_denied'});
   const q=await supabase.from('healthcare_organizations').select('id,phone,email,is_verified,deleted_at').eq('id',raw.organizationId).is('deleted_at',null).limit(2);
   if(q.error||q.data?.length!==1||q.data[0].is_verified!==true)return respond(404,{ok:false,error:'contact_unavailable'});
   const org=q.data[0];let unit=null;
   if(raw.unitId){
    const u=await supabase.from('healthcare_service_units').select('id,organization_id,phone,email,reschedule_contact_phone,reschedule_contact_email,reschedule_hours_text,reschedule_instructions,reschedule_min_notice_minutes,is_verified,deleted_at').eq('id',raw.unitId).eq('organization_id',org.id).is('deleted_at',null).limit(2);
    if(u.error||u.data?.length!==1)return respond(404,{ok:false,error:'contact_unavailable'});
    if(u.data[0].is_verified===true)unit=u.data[0]; // never expose unverified unit contact as authoritative
   }
   return respond(200,{ok:true,contact:resolveRescheduleContact(org,unit)});
  }catch{return respond(503,{ok:false,error:'contact_unavailable'});}
 };
}
