// PHMS v2.4 trusted Edge composition. This is a DEPLOYMENT CANDIDATE only.
// Fail closed before any patient access or write unless all required server secrets
// and the gated PostgreSQL RPC have been approved and installed.
// No changes to the existing LINE webhook.
import { createClient } from 'npm:@supabase/supabase-js@2';
import postgres from 'npm:postgres@3.4.7';
import { makePhmsAppointmentHttpHandler } from '../contracts/phms-appointment-http-composition.mjs';
import { canReleaseAppointmentSchema } from '../contracts/schema-release-guard.mjs';
const json=(error,status)=>new Response(JSON.stringify({ok:false,error}),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const env=name=>(Deno.env.get(name)||'').trim();
// Supabase automatically injects SUPABASE_DB_URL. No owner-managed database password is needed.
const required=['SUPABASE_URL','SUPABASE_DB_URL','PHMS_V24_LINE_CHANNEL_ID','PHMS_V24_LIFF_ORIGIN'];
const serviceKey=()=>{if(env('SUPABASE_SERVICE_ROLE_KEY'))return env('SUPABASE_SERVICE_ROLE_KEY');try{return JSON.parse(env('SUPABASE_SECRET_KEYS'))?.default||'';}catch{return '';}};
const ready=required.every(name=>env(name))&&!!serviceKey();
let handler=null;
let isSchemaReady=null;

if(ready){
 try{
  const supabase=createClient(env('SUPABASE_URL'),serviceKey(),{auth:{persistSession:false,autoRefreshToken:false}});
  const sql=postgres(env('SUPABASE_DB_URL'),{max:2,prepare:false,connect_timeout:5,idle_timeout:10});
  // The private driver must run only on the server. The browser NEVER supplies SQL,
  // actor identity, family identity or database credentials.
  const privateQuery=async(query,args)=>({rows:await sql.unsafe(query,args)});
  isSchemaReady=async()=>{
   try{
    const result=await sql`select to_regprocedure('public.phms_v24_commit_appointment(uuid,uuid,uuid,uuid,jsonb)') is not null as installed, to_regclass('private.phms_v24_appointment_operations') is not null as operations_ready, exists(select 1 from pg_constraint where conrelid='public.appointments'::regclass and conname='aim_walk_in_date_only_allowed' and position('completed' in pg_get_constraintdef(oid))>0 and position('booked' in pg_get_constraintdef(oid))>0) as historical_check_ready`;
    return result.length===1&&canReleaseAppointmentSchema(result[0]);
   }catch{return false;}
  };
  const resolveAppointmentType=async command=>{
   const scenario=command?.draft?.scenario;
   if(scenario==='walk_in')return 'walk_in';
   if(scenario==='booked'||scenario==='historical')return 'follow_up';
   // Historical release still requires database schema readiness; reschedule stays closed.
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
const originAllowed=origin=>{try{const url=new URL(trustedOrigin);return url.protocol==='https:'&&url.origin===trustedOrigin&&url.username===''&&url.password===''&&url.pathname==='/'&&url.search===''&&url.hash===''&&origin===trustedOrigin;}catch{return false;}};
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
 if(!handler||!isSchemaReady)return withCors(json('feature_not_released',404));
 // Read-only member and provider discovery do not depend on the write migration.
 // Both routes still require verified LINE identity, owner release gate and family rights.
 let readOnly=false;
 if(request.method==='POST'&&request.headers.get('content-type')?.split(';',1)[0].trim().toLowerCase()==='application/json'){
  try{const body=await request.clone().text();if(new TextEncoder().encode(body).byteLength<=32768){const action=JSON.parse(body)?.action;readOnly=action==='person_options'||action==='provider_catalog';}}catch{/* use strict appointment handler */}
 }
 if(!readOnly&&await isSchemaReady()!==true)return withCors(json('feature_not_released',404));
 try{
  const response=await handler(request);
  return withCors(response);
 }catch{return withCors(json('request_failed',503));}
});
