// Trusted PHMS authority adapter: SQL function is in private schema and is not exposed
// to browser/PostgREST. This must run from an authenticated, server-only database driver.
export function makePhmsAuthorityAdapter(query){
 if(typeof query!=='function')throw new Error('private_authority_not_configured');
 const centralCanAccess=async(actorId,personId,resource,action)=>{
  if(!actorId||!personId||!['appointments','documents'].includes(resource)||!['view','create','update','delete'].includes(action))return false;
  try{
   const result=await query('select private.user_can_access_family_person($1::uuid,$2::uuid,$3::text,$4::text) as allowed',[actorId,personId,resource,action]);
   return result?.rows?.length===1&&result.rows[0]?.allowed===true;
  }catch{return false;}
 };
 const isReleaseEnabled=async(actorId)=>{
  if(typeof actorId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actorId))return false;
  try{
   const result=await query('select (enabled_for_everyone = true or $1::uuid = any(allowed_actor_ids)) as allowed from private.phms_appointment_release_gate where singleton = true',[actorId]);
   return result?.rows?.length===1&&result.rows[0]?.allowed===true;
  }catch{return false;}
 };
 return {centralCanAccess,isReleaseEnabled};
}
