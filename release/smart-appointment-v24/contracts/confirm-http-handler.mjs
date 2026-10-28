// PHMS v2.4: fail-closed HTTP boundary for a future LINE LIFF endpoint.
// The server MUST supply trusted adapters; browser data never supplies identity/permissions.
// This module is isolated and NOT deployed.
import {confirmAppointment} from './confirm-orchestrator.mjs';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
export async function handleAppointmentConfirm(request, adapters) {
 if(request.method!=='POST') return json({ok:false,error:'method_not_allowed'},405);
 const ct=request.headers.get('content-type')||'';
 if(ct.split(';',1)[0].trim().toLowerCase()!=='application/json') return json({ok:false,error:'unsupported_media_type'},415);
 const length=Number(request.headers.get('content-length')||0);
 if(length>32768) return json({ok:false,error:'request_too_large'},413);
 let raw;try {const text=await request.text();if(new TextEncoder().encode(text).byteLength>32768)return json({ok:false,error:'request_too_large'},413);raw=JSON.parse(text);}catch{return json({ok:false,error:'invalid_json'},400);}
 if(!raw || typeof raw!=='object' || Array.isArray(raw))return json({ok:false,error:'invalid_request'},400);
 // Only accept identity token from authorization header, not browser-provided actor or family UUID.
 const match=/^Bearer ([^\s]+)$/.exec(request.headers.get('authorization')||'');
 if(!match)return json({ok:false,error:'unauthenticated'},401);
 try {
 const result=await confirmAppointment({credential:match[1],selectedPersonCode:raw.selectedPersonCode,operationKey:raw.operationKey,draft:raw.draft},adapters);
 if(result.ok)return json(result,201);
 const statuses={unauthenticated:401,permission_denied:403,document_permission_denied:403,feature_not_released:404,person_not_found:404,provider_mismatch:422,invalid_draft:422,invalid_operation_key:400,person_required:400,commit_not_verified:503};
 return json(result,statuses[result.error]||400);
 }catch{return json({ok:false,error:'request_failed'},503);}
}
