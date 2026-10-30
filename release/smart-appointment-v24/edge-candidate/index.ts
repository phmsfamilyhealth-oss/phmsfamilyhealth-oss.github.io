// Supabase Edge Function deployment candidate for PHMS v2.4.
// This endpoint intentionally fails CLOSED until the trusted production adapter bundle,
// private SQL driver, verified LINE channel and release approval are provided.
// Never deploy this in place of the existing line-webhook.
const json=(error,status)=>new Response(JSON.stringify({ok:false,error}),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return json('not_enabled',403);
 if(request.method!=='POST')return json('method_not_allowed',405);
 if(request.headers.get('content-type')?.split(';')[0]?.trim()!=='application/json')return json('unsupported_media_type',415);
 if(!/^Bearer [^\s]+$/.test(request.headers.get('authorization')||''))return json('unauthenticated',401);
 // No permissive CORS and no fallback service-role write. A deployment of this
 // closed candidate cannot create, modify or expose any patient information.
 return json('feature_not_released',404);
});
