// Isolated, undeployed GET endpoint contract for a verified LIFF provider catalog.
// No public Supabase credentials, no client-provided actor/family IDs, no caching.
import {loadSupabaseProviderPicker} from './supabase-provider-picker.mjs';
const respond=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
export async function handleProviderCatalog(request,identityAdapters,supabase){
 if(request.method!=='GET')return respond(405,{ok:false,error:'method_not_allowed'});
 const token=/^Bearer ([^\s]+)$/.exec(request.headers.get('authorization')||'')?.[1];
 if(!token)return respond(401,{ok:false,error:'unauthenticated'});
 let url;try{url=new URL(request.url);}catch{return respond(400,{ok:false,error:'invalid_request'});}
 const permitted=['personCode','organizationId','unitId','clinicianId'];
 if([...url.searchParams.keys()].some(k=>!permitted.includes(k)))return respond(400,{ok:false,error:'invalid_parameter'});
 const query=Object.fromEntries(permitted.map(k=>[k,url.searchParams.get(k)||'']));
 if(permitted.some(k=>query[k].length>128))return respond(400,{ok:false,error:'invalid_parameter'});
 try{
  const result=await loadSupabaseProviderPicker({credential:token,...query},identityAdapters,supabase);
  if(result.ok)return respond(200,result);
  const statuses={unauthenticated:401,person_required:400,person_not_found:404,feature_not_released:404,permission_denied:403,provider_catalog_unavailable:503};
  return respond(statuses[result.error]||400,{ok:false,error:result.error||'invalid_request'});
 }catch{return respond(503,{ok:false,error:'request_failed'});}
}
