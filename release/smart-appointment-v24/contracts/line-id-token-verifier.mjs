// Server-side LINE ID token verification, never accept profile/user IDs from LIFF.
// Channel ID is the LIFF channel audience. Caller must map 'sub' using existing PHMS identity.
export function makeLineIdTokenVerifier({channelId,resolveLineSubject,fetchImpl=fetch,onReject=()=>{}}={}){
 if(!/^\d{5,}$/.test(String(channelId||''))||typeof resolveLineSubject!=='function'||typeof fetchImpl!=='function') throw new Error('line_identity_not_configured');
 return async function verifyLineIdentity(idToken){
  if(typeof idToken!=='string'||idToken.length<20||idToken.length>8192){onReject('missing_or_malformed_token');return null;}
  let response;
  try {response=await fetchImpl('https://api.line.me/oauth2/v2.1/verify',{
    method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({id_token:idToken,client_id:String(channelId)}),
    signal:AbortSignal.timeout(6000)
  });}catch{onReject('line_verify_network_failed');return null;}
  if(!response?.ok){onReject('line_verify_rejected');return null;}
  let data;try{data=await response.json();}catch{onReject('line_verify_response_invalid');return null;}
  if(data?.aud!==String(channelId)||typeof data.sub!=='string'||!/^U[0-9a-f]{32}$/i.test(data.sub)){onReject('audience_or_subject_invalid');return null;}
  if(typeof data.exp!=='number'||data.exp*1000<=Date.now()){onReject('token_expired');return null;}
  const actor=await resolveLineSubject(data.sub);
  if(!actor?.userId||typeof actor.userId!=='string'){onReject('line_identity_mapping_missing');return null;}
  return {userId:actor.userId};
 };
}
