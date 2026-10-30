// Resolve only canonical family-person UUIDs. Check existing central PHMS rights,
// and never expose a member through name/nickname matching or browser family IDs.
export function makePhmsPersonResolver({supabase,centralCanAccess}={}){
 if(!supabase?.from||typeof centralCanAccess!=='function')throw new Error('person_resolver_not_configured');
 return async function resolvePerson(actorId,selectedPersonCode){
  if(typeof actorId!=='string'||typeof selectedPersonCode!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(selectedPersonCode))return null;
  if(await centralCanAccess(actorId,selectedPersonCode,'appointments','view')!==true)return null;
  if(await centralCanAccess(actorId,selectedPersonCode,'appointments','create')!==true)return null;
  const {data,error}=await supabase.from('family_persons').select('id,family_id,person_id,status').eq('id',selectedPersonCode).limit(2);
  if(error||!Array.isArray(data)||data.length!==1)return null;
  const item=data[0];if(item.id!==selectedPersonCode||!item.family_id||!item.person_id||item.status==='inactive')return null;
  return {familyPersonId:item.id,familyId:item.family_id,personId:item.person_id};
 };
}
