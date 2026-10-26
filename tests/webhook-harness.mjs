import fs from 'node:fs/promises';
import {createHmac} from 'node:crypto';
import assert from 'node:assert/strict';

function validateTransport(messages){
 assert.ok(messages.length>=1&&messages.length<=5);
 const visit=node=>{
  if(!node||typeof node!=='object')return;
  if(node.type==='bubble')assert.ok(Buffer.byteLength(JSON.stringify(node))<=30000,'Flex bubble exceeds 30 KB');
  if(node.type==='carousel')assert.ok(node.contents.length>=1&&node.contents.length<=12);
  if(node.type==='postback'){assert.ok(Array.from(node.label||'').length<=20,'Action label exceeds 20 characters');assert.ok(node.data.length<=300);}
  for(const value of Object.values(node))if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);
 };messages.forEach(visit);
}

// Run the real signed webhook and all outbound Flex transforms. Only external
// transports and the conversation-store RPC are replaced by isolated adapters.
export async function webhookHarness(db){
 const env={LINE_CHANNEL_SECRET:'synthetic-secret',LINE_CHANNEL_ACCESS_TOKEN:'synthetic-token',SUPABASE_URL:'https://synthetic-db.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service',PHMS_SMART_HEALTH_ALLOWED_LINE_IDS:'synthetic-a'};
 let handler,state=null,sent=[],calls=[];
 const originalDeno=globalThis.Deno;
 const deno={env:{get:k=>env[k]},serve:fn=>{handler=fn;}};
 const path=new URL('../supabase/functions/line-webhook/.webhook-test-'+crypto.randomUUID()+'.ts',import.meta.url);
 try{
  globalThis.Deno=deno;
  const source=(await fs.readFile(new URL('../supabase/functions/line-webhook/index.ts',import.meta.url),'utf8')).replace('import "jsr:@supabase/functions-js/edge-runtime.d.ts";','');
  await fs.writeFile(path,source);await import(path.href);
 }finally{globalThis.Deno=originalDeno;await fs.unlink(path).catch(()=>{});}
 const mockFetch=async(input,init={})=>{
  const url=String(input);calls.push(url);
  if(url.includes('/rest/v1/rpc/')){
   const name=url.split('/').at(-1),p=JSON.parse(init.body);
   if(name==='phms_rate_limit_check')return Response.json({allowed:true});
   if(name==='phms_get_line_conversation_state')return Response.json(state);
   if(name==='phms_set_line_conversation_state'){state={state_key:p.p_state_key,state_data:p.p_state_data};return Response.json({});}
   if(name==='phms_clear_line_conversation_state'){state=null;return Response.json({});}
   if(name==='phms_list_line_accessible_people_for_resource_action')return Response.json([]);
   if(name==='phms_set_line_personal_context')return Response.json({});
   if(name==='phms_smart_health_access')return Response.json((await db.query('select public.phms_smart_health_access($1) result',[p.p_line_user_id])).rows[0].result);
   if(name==='phms_smart_health'){
    try{return Response.json((await db.query('select public.phms_smart_health($1,$2,$3,$4::jsonb) result',[p.p_line_user_id,p.p_action,p.p_session_id,JSON.stringify(p.p_payload)])).rows[0].result);}
    catch(err){return Response.json({message:String(err)},{status:400});}
   }
   throw Error('Unexpected real-webhook RPC: '+name);
  }
  if(url.includes('/rest/v1/phms_category_design_tokens'))return Response.json([]);
  if(url==='https://api.line.me/v2/bot/message/reply'){sent=JSON.parse(init.body).messages;validateTransport(sent);return Response.json({});}
  if(url.startsWith('https://api-data.line.me/'))return new Response(new Uint8Array([255,216,255,0,23]),{headers:{'content-type':'image/jpeg'}});
  if(url.includes('/storage/v1/object/sign/'))return Response.json({signedURL:'/object/sign/synthetic-image?token=synthetic'});
  if(url.includes('/storage/v1/object/phms-medical-sources/')&&init.method==='POST'){
   const name=decodeURIComponent(url.split('/object/phms-medical-sources/')[1]);await db.query('insert into storage.objects values($1,$2)',['phms-medical-sources',name]);return Response.json({Key:name});
  }
  if(url.endsWith('/storage/v1/object/phms-medical-sources')&&init.method==='DELETE'){
   for(const name of JSON.parse(init.body).prefixes)await db.query('delete from storage.objects where name=$1',[name]);return Response.json([]);
  }
  throw Error('External network forbidden in webhook test: '+url);
 };
 const request=async(event,{signature=true}={})=>{
  sent=[];calls=[];const oldFetch=globalThis.fetch,oldDeno=globalThis.Deno;
  globalThis.fetch=mockFetch;globalThis.Deno=deno;
  const raw=JSON.stringify({events:event?[event]:[]});
  try{return await handler(new Request('https://synthetic-webhook.invalid',{method:'POST',body:raw,headers:{'x-line-signature':signature?createHmac('sha256',env.LINE_CHANNEL_SECRET).update(raw).digest('base64'):'invalid'}}));}
  finally{globalThis.fetch=oldFetch;globalThis.Deno=oldDeno;}
 };
 const event=(command,type='postback',id=crypto.randomUUID())=>({source:{type:'user',userId:'synthetic-a'},type:type==='postback'?'postback':'message',webhookEventId:id,replyToken:'synthetic-reply',...(type==='postback'?{postback:{data:command}}:{message:{type:type==='image'?'image':'text',text:command,id}})});
 return {request,event,get sent(){return sent;},get state(){return state;},get calls(){return calls;},run:async(command,type='postback')=>request(event(command,type)),snapshot:async()=>state?.state_data?.sid?(await db.query('select context_snapshot,status,id from data_intake_sessions where id=$1',[state.state_data.sid])).rows[0]:null,
 click:async function(action){const s=await this.snapshot();return this.run('phms_health '+s.id+' '+s.context_snapshot.revision+' '+action);}};
}
