// PHMS v2.4 trusted Edge composition. This is a DEPLOYMENT CANDIDATE only.
// Fail closed before any patient access or write unless all required server secrets
// and the gated PostgreSQL RPC have been approved and installed.
// No changes to the existing LINE webhook.
import { createClient } from 'npm:@supabase/supabase-js@2';
import postgres from 'npm:postgres@3.4.7';
import { makePhmsAppointmentHttpHandler } from '../contracts/phms-appointment-http-composition.mjs';
const json=(error,status)=>new Response(JSON.stringify({ok:false,error}),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const env=name=>(Deno.env.get(name)||'').trim();
const required=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','PHMS_V24_PRIVATE_DATABASE_URL','PHMS_V24_LINE_CHANNEL_ID','PHMS_V24_LIFF_ORIGIN'];
const ready=required.every(name=>env(name));
let handler=null;
let isSchemaReady=null;

if(ready){
 try{
  const supabase=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
  const sql=postgres(env('PHMS_V24_PRIVATE_DATABASE_URL'),{max:2,prepare:false,connect_timeout:5,idle_timeout:10});
  // The private driver must run only on the server. The browser NEVER supplies SQL,
  // actor identity, family identity or database credentials.
  const privateQuery=async(query,args)=>({rows:await sql.unsafe(query,args)});
  isSchemaReady=async()=>{
   try{
    const result=await sql`select to_regprocedure('public.phms_v24_commit_appointment(uuid,uuid,uuid,uuid,jsonb)') is not null as installed, to_regclass('private.phms_v24_appointment_operations') is not null as operations_ready`;
    return result.length===1&&result[0].installed===true&&result[0].operations_ready===true;
   }catch{return false;}
  };
  const resolveAppointmentType=async command=>{
   const scenario=command?.draft?.scenario;
   if(scenario==='walk_in')return 'walk_in';
   if(scenario==='booked')return 'follow_up';
   // Historical and rescheduled flows stay closed pending their own acceptance.
   return null;
  };
  handler=makePhmsAppointmentHttpHandler({
   supabase,privateQuery,channelId:env('PHMS_V24_LINE_CHANNEL_ID'),fetchImpl:fetch,
   security:{resolveAppointmentType}
  });
 }catch{handler=null;}
}
// Browser access is restricted to one owner-configured HTTPS LIFF form origin.
// Never enable wildcard CORS for a bearer-token patient-data API.
const trustedOrigin=env('PHMS_V24_LIFF_ORIGIN');
const originAllowed=origin=>/^https:\/\/[^/]+$/.test(trustedOrigin)&&origin===trustedOrigin;
Deno.serve(async request=>{
 const origin=request.headers.get('origin');
 if(origin&&!originAllowed(origin))return json('origin_not_allowed',403);
 if(request.method==='OPTIONS'){
  if(!origin||!originAllowed(origin))return json('origin_not_allowed',403);
  return new Response(null,{status:204,headers:{
   'access-control-allow-origin':origin,
   'access-control-allow-methods':'POST, OPTIONS',
   'access-control-allow-headers':'authorization, content-type',
   'access-control-max-age':'300',
   'vary':'Origin'
  }});
 }
 const withCors=response=>{if(!origin)return response;const headers=new Headers(response.headers);headers.set('access-control-allow-origin',origin);headers.set('vary','Origin');return new Response(response.body,{status:response.status,headers});};
 if(!handler||!isSchemaReady||await isSchemaReady()!==true)return withCors(json('feature_not_released',404));
 try{
  const response=await handler(request);
  return withCors(response);
 }catch{return withCors(json('request_failed',503));}
});
