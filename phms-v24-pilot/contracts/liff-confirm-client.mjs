// LIFF browser-side confirmation transport. The server owns all authorization.
// No service-role secret, actor ID, person ID, or family ID is accepted here.
export function makeLiffConfirmClient({liff,endpoint,fetchImpl=fetch,uuid=()=>crypto.randomUUID()}={}){
 if(!liff?.getIDToken||typeof fetchImpl!=='function'||typeof endpoint!=='string')throw new Error('liff_confirm_unconfigured');
 const url=new URL(endpoint);
 if(url.protocol!=='https:'||!(url.pathname.endsWith('/phms-v24-appointment-confirm')))throw new Error('unsafe_confirm_endpoint');
 let pendingKey=null,pendingPayload=null;
 return async function confirm({selectedPersonCode,draft}){
  const idToken=liff.getIDToken();
  if(typeof idToken!=='string'||!idToken)return {ok:false,error:'unauthenticated'};
  if(typeof selectedPersonCode!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(selectedPersonCode))return {ok:false,error:'person_required'};
  if(!draft||typeof draft!=='object'||(draft.documents?.length||0)>0)return {ok:false,error:'documents_not_supported'};
  const payload=JSON.stringify({selectedPersonCode,draft});
  if(!pendingKey||pendingPayload!==payload){pendingKey=uuid();pendingPayload=payload;}
  let response;
  try{response=await fetchImpl(url.href,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+idToken},body:JSON.stringify({selectedPersonCode,operationKey:pendingKey,draft})});}catch{return {ok:false,error:'network_error'};}
  let body;try{body=await response.json();}catch{return {ok:false,error:'invalid_response'};}
  if(!response.ok||body?.ok!==true||!body.appointmentId)return {ok:false,error:body?.error||'save_failed'};
  pendingKey=null;pendingPayload=null;
  return {ok:true,appointmentId:body.appointmentId};
 };
}
