// PHMS v2.4 trusted Edge composition. This is a DEPLOYMENT CANDIDATE only.
// Fail closed before any patient access or write unless all required server secrets
// and the gated PostgreSQL RPC have been approved and installed.
// No changes to the existing LINE webhook.
import { createClient } from 'npm:@supabase/supabase-js@2';
import postgres from 'npm:postgres@3.4.7';
import { makePhmsAppointmentHttpHandler } from '../contracts/phms-appointment-http-composition.mjs';
const json=(error,status)=>new Response(JSON.stringify({ok:false,error}),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const env=name=>(Deno.env.get(name)||'').trim();
const required=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','PHMS_V24_PRIVATE_DATABASE_URL','PHMS_V24_LINE_CHANNEL_ID'];
const ready=required.every(name=>env(name));
let handler=null;
if(ready){
 try{
  const supabase=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
  const sql=postgres(env('PHMS_V24_PRIVATE_DATABASE_URL'),{max:2,prepare:false,connect_timeout:5,idle_timeout:10});
  // The private driver must run only on the server. The browser NEVER supplies SQL,
  // actor identity, family identity or database credentials.
  const privateQuery=async(query,args)=>({rows:await sql.unsafe(query,args)});
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
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return json('not_enabled',403);
 if(!handler)return json('feature_not_released',404);
 // Private release gate is checked by the handler; requests are never
 // allowed to bypass central PHMS permissions.
 try{return await handler(request);}catch{return json('request_failed',503);}
});
