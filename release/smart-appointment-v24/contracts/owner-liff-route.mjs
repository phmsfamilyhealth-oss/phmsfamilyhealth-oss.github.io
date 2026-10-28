// Isolated LINE route decision; never changes the legacy flow unless a verified
// owner-only launch has been authorized. No patient fields are written here.
export function makeOwnerLiffRoute({launch,legacy}={}){
 if(typeof launch!=='function'||typeof legacy!=='function')throw new Error('appointment_route_not_configured');
 return async function route(context){
  if(!context||!['เพิ่มนัด','เพิ่มนัด จากภาพรวม'].includes(context.command))return {handled:false};
  // The caller must resolve the actor from the trusted signed LINE webhook event
  // and the member from server-held active family-person context.
  let result;
  try{result=await launch({verifiedActorId:context.verifiedActorId,selectedPersonCode:context.selectedPersonCode})}
  catch{result={ok:false,error:'launch_unavailable'}}
  if(result?.ok===true&&typeof result.url==='string'){
   try{const url=new URL(result.url);if(url.protocol==='https:'&&url.username===''&&url.password===''&&url.hash===''&&url.searchParams.getAll('member').length===1&&url.searchParams.get('member')===context.selectedPersonCode)return {handled:true,mode:'liff',url:url.href};}catch{}
  }
  await legacy(context);
  return {handled:true,mode:'legacy'};
 };
}
