// Trusted backend resolver for appointment persistence identity.
// Read family_persons only after the caller has passed central appointment permissions.
const isUuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
export function makePhmsWriteIdentityResolver({supabase,centralCanAccess,resolveAppointmentType}={}){
 if(!supabase?.from||typeof centralCanAccess!=='function'||typeof resolveAppointmentType!=='function')throw new Error('write_identity_not_configured');
 return async function resolveWriteIdentity(actorId,subjectId,familyId,command){
  if(!isUuid(actorId)||!isUuid(subjectId)||!isUuid(familyId))return null;
  if(await centralCanAccess(actorId,subjectId,'appointments','create')!==true||await centralCanAccess(actorId,subjectId,'appointments','view')!==true)return null;
  const {data,error}=await supabase.from('family_persons').select('id,family_id,person_id,status').eq('id',subjectId).limit(2);
  if(error||!Array.isArray(data)||data.length!==1)return null;
  const row=data[0];
  if(row.id!==subjectId||row.family_id!==familyId||!isUuid(row.person_id)||row.status!=='active')return null;
  const appointmentType=await resolveAppointmentType(command);
  if(!['new_case','follow_up','referral','investigation','procedure','walk_in','rescheduled','other','checkup','vaccination','medication_refill'].includes(appointmentType))return null;
  return {familyPersonId:subjectId,familyId,personId:row.person_id,appointmentType};
 };
}
