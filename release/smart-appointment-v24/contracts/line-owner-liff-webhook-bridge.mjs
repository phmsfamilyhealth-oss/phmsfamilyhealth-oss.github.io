// Isolated trusted LINE webhook bridge: input is only a signature-verified event.
// The active family-person code MUST come from server-side LINE context, not postback.
// Legacy remains the default on any missing identity, permission or backend failure.
import {makePhmsLineSubjectResolver} from './phms-line-subject-resolver.mjs';
import {makePhmsOwnerLiffEntrypoint} from './phms-owner-liff-entrypoint.mjs';
export function makeLineOwnerLiffWebhookBridge({supabase,privateQuery,launchUrl,verifyEvent,resolveActiveMember,sendLiff,legacy}={}){
 if([verifyEvent,resolveActiveMember,sendLiff,legacy].some(x=>typeof x!=='function'))throw Error('trusted_line_bridge_not_configured');
 const resolveSubject=makePhmsLineSubjectResolver(supabase);
 const launch=makePhmsOwnerLiffEntrypoint({supabase,privateQuery,launchUrl,legacy});
 return async function handle(event){
  const command=event?.postback?.data;
  if(!['เพิ่มนัด','เพิ่มนัด จากภาพรวม'].includes(command))return {handled:false};
  // Do not let a forged postback or a user-controlled UUID reach the launch authorizer.
  let verified=false;try{verified=await verifyEvent(event)===true}catch{}
  // Invalid signatures are consumed without a reply, to prevent legacy fallback.
  if(!verified)return {handled:true,mode:'rejected'};
  try{
   const subject=await resolveSubject(event?.source?.userId);
   const member=subject?.userId?await resolveActiveMember({userId:subject.userId,lineUserId:event.source.userId}):null;
   if(!subject?.userId||!member){await legacy({command,event});return {handled:true,mode:'legacy'};}
   const result=await launch({command,verifiedActorId:subject.userId,selectedPersonCode:member,event});
   if(result.mode==='liff'){
    // Reply delivery may have succeeded even if transport later throws.
    // Never attempt a second legacy reply using the same LINE reply token.
    try{await sendLiff(event,result.url);return {handled:true,mode:'liff'};}
    catch{return {handled:true,mode:'delivery_uncertain'};}
   }
   return result;
  }catch{
   await legacy({command,event});
   return {handled:true,mode:'legacy'};
  }
 };
}
