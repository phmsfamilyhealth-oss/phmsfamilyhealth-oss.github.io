// Deterministic contact fallback. Records supplied only after verified actor/person authorization.
const clean=x=>typeof x==='string'?x.trim():'';
export function resolveRescheduleContact(org,unit){
 if(!org?.id||unit&&unit.organization_id!==org.id)return null;
 const first=(a,b)=>clean(a)||clean(b)||null;
 return {organizationId:org.id,serviceUnitId:unit?.id||null,phone:first(unit?.reschedule_contact_phone,first(unit?.phone,org.phone)),email:first(unit?.reschedule_contact_email,first(unit?.email,org.email)),hours:clean(unit?.reschedule_hours_text)||null,instructions:clean(unit?.reschedule_instructions)||null,minNoticeMinutes:Number.isInteger(unit?.reschedule_min_notice_minutes)?unit.reschedule_min_notice_minutes:null,verified:unit?.is_verified===true||(!unit&&org.is_verified===true),source:unit?.reschedule_contact_phone||unit?.reschedule_contact_email?'service_unit_reschedule':unit?.phone||unit?.email?'service_unit':'organization'};
}
