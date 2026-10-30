// Server-only LINE -> LIFF entrypoint policy. No change to the live webhook until
// its v1431 source is reconciled and the owner-only gate passes live acceptance.
// The member must be server-resolved from the current LINE context, not user text.
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
export function makeOwnerLiffLaunch({isReleaseEnabled,centralCanAccess,resolvePerson,launchUrl}={}){
 if([isReleaseEnabled,centralCanAccess,resolvePerson].some(f=>typeof f!=='function'))throw new Error('launch_authority_unconfigured');
 return async function ownerLiffLaunch({verifiedActorId,selectedPersonCode}={}){
  if(!uuid(verifiedActorId)||!uuid(selectedPersonCode))return {ok:false,error:'invalid_subject'};
  // Never create a clickable patient URL for actors not in the owner-controlled gate.
  if(await isReleaseEnabled(verifiedActorId)!==true)return {ok:false,error:'feature_not_released'};
  if(await centralCanAccess(verifiedActorId,selectedPersonCode,'appointments','create')!==true||await centralCanAccess(verifiedActorId,selectedPersonCode,'appointments','view')!==true)return {ok:false,error:'permission_denied'};
  const subject=await resolvePerson(verifiedActorId,selectedPersonCode);
  if(subject?.familyPersonId!==selectedPersonCode)return {ok:false,error:'person_not_found'};
  try{
   const url=new URL(launchUrl);
   if(url.protocol!=='https:'||url.username||url.password||url.hash||!url.hostname||url.search||!url.pathname.endsWith('/'))return {ok:false,error:'launch_url_unconfigured'};
   url.searchParams.set('member',selectedPersonCode);
   return {ok:true,url:url.href};
  }catch{return {ok:false,error:'launch_url_unconfigured'};}
 };
}
