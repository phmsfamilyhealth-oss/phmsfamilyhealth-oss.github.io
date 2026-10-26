import {db} from './db.mjs';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {createHmac} from 'node:crypto';
import assert from 'node:assert/strict';
await db.waitReady;
for(const role of ['anon','authenticated','service_role'])try{await db.exec(`create role ${role} ${role==='service_role'?'bypassrls':''}`)}catch(e){if(!e.message.includes('already exists'))throw e}

await db.exec("update private.phms_appointment_release_gate set allowed_actor_ids=array['10000000-0000-4000-8000-000000000001'::uuid]");
await db.exec("update line_identities set onboarding_status='ready' where line_user_id='SYNTHETIC_PHMS_APPOINTMENT_TEST_ONLY'");
const replies=[],errors=[],requests=[];
const proc=new Map((await db.query(`select proname,proretset,t.typname from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_type t on t.oid=p.prorettype where n.nspname='public'`)).rows.map(x=>[x.proname,x]));
const fetchLocal=async(input,init={})=>{
 const url=new URL(String(input)),body=init.body?JSON.parse(init.body):{};
 if(url.origin==='https://api.line.me'&&url.pathname==='/v2/bot/message/reply'){replies.push(body);return Response.json({sentMessages:[{id:'synthetic-reply'}]})}
 if(url.origin!=='https://test.invalid')throw Error('External network blocked in integration: '+url.origin+url.pathname);
 if(url.pathname==='/functions/v1/line-webhook')return handler(new Request(url,{method:'POST',headers:init.headers,body:init.body}));
 if(url.pathname.startsWith('/rest/v1/rpc/')){
  const name=url.pathname.split('/').at(-1);if(!proc.has(name))throw Error('Unknown test RPC '+name);
  const keys=Object.keys(body);if(keys.some(k=>!/^p_[a-z_]+$/.test(k)))throw Error('Unsafe RPC argument');
  try{const rows=(await db.query(`select * from public.${name}(${keys.map((k,i)=>k+'=> $'+(i+1)).join(',')})`,Object.values(body))).rows;requests.push(name);const m=proc.get(name);return Response.json(m.proretset||m.typname==='record'?rows:(rows[0]?.[name]??null))}catch(e){errors.push({rpc:name,error:e.message});return Response.json({message:e.message},{status:400})}
 }
 const table=url.pathname.split('/').at(-1);if(!/^[a-z_]+$/.test(table))throw Error('Unsafe test table');
 if(table==='phms_card_overflow_menu'&&init.method==='POST'){await db.query('insert into phms_card_overflow_menu(menu_id,line_user_id,payload) values($1,$2,$3)',[body.menu_id,body.line_user_id,body.payload]);return new Response(null,{status:201});}
 if((init.method||'GET')!=='GET')throw Error('Unimplemented direct mutation '+table);
 const args=[],where=[];for(const [k,v]of url.searchParams){if(['select','limit','order','offset'].includes(k))continue;if(!/^[a-z_]+$/.test(k))throw Error('Unsafe field');const m=v.match(/^(eq|gte|like)\.(.*)$/s);if(m){args.push(m[2]==='true'?true:m[2]==='false'?false:m[2]);where.push(`${k} ${m[1]==='eq'?'=':m[1]==='gte'?'>=':'like'} $${args.length}`)}}
 return Response.json((await db.query(`select * from public.${table}${where.length?' where '+where.join(' and '):''} limit 50`,args)).rows)
};
let handler;
const env={LINE_CHANNEL_SECRET:'synthetic-secret',LINE_CHANNEL_ACCESS_TOKEN:'synthetic-token',SUPABASE_URL:'https://test.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service-role'};
const ctx=vm.createContext({console:{...console,error:(...v)=>errors.push({runtime:v.map(String).join(' ')})},TextEncoder,TextDecoder,URL,URLSearchParams,Response,Request,Headers,crypto,btoa,atob,fetch:fetchLocal,setTimeout,clearTimeout,Deno:{env:{get:k=>env[k]},serve:f=>handler=f}});
for(const moduleName of ['smart-medication.ts','smart-medication-runtime.ts','refill-receipt.ts','person-overview-px-layout.ts']){
 const moduleSource=fs.readFileSync('supabase/functions/line-webhook/'+moduleName,'utf8').replace(/^import .*;\n/gm,'').replace(/\bexport /g,'');
 vm.runInContext(stripTypeScriptTypes(moduleSource,{mode:'strip'}),ctx);
}
const source=fs.readFileSync('supabase/functions/line-webhook/index.ts','utf8').replace(/^import .*;\n/gm,'');
vm.runInContext(stripTypeScriptTypes(source,{mode:'strip'}),ctx);
let routerHandler;
const routerContext=vm.createContext({console:{...console,error:(...v)=>errors.push({router:v.map(String).join(' ')})},TextEncoder,TextDecoder,URL,URLSearchParams,Response,Request,Headers,crypto,btoa,atob,fetch:fetchLocal,setTimeout,clearTimeout,Deno:{env:{get:k=>env[k]},serve:f=>routerHandler=f}});
vm.runInContext(stripTypeScriptTypes(fs.readFileSync('supabase/functions/line-webhook-router/index.ts','utf8').replace(/^import .*;\n/gm,''),{mode:'strip'}),routerContext);
let n=0;
async function send(command,params,text=false){
 const e={type:'postback',replyToken:'synthetic-reply-'+(++n),webhookEventId:'synthetic-webhook-'+Date.now()+'-'+n,source:{type:'user',userId:'SYNTHETIC_PHMS_APPOINTMENT_TEST_ONLY'},timestamp:Date.now(),postback:{data:command,params}};
 if(text){e.type='message';e.message={type:'text',id:'synthetic-message-'+n,text:command};delete e.postback;}
 const raw=JSON.stringify({events:[e]});const sig=createHmac('sha256',env.LINE_CHANNEL_SECRET).update(raw).digest('base64');const before=replies.length;
 const response=await routerHandler(new Request('https://test.invalid/functions/v1/line-webhook-router',{method:'POST',headers:{'x-line-signature':sig},body:raw}));assert.equal(response.status,200);
 assert.ok(replies.length>before,`No reply for ${command}; ${JSON.stringify(errors.slice(-3))}`);return replies.at(-1);
}
await send('เพิ่มนัด');
assert.match(JSON.stringify(replies.at(-1)),/ยืนยันเจ้าของเริ่มนัด/);
await send('ยืนยันเจ้าของเริ่มนัด');
await send('เลือกประเภทนัด new_case');
await send('ตั้งค่านัดใหม่ hospital_name '+encodeURIComponent('สถานพยาบาลทดสอบ'));
await send('ข้ามช่องนัดใหม่ department');
await send('ข้ามช่องนัดใหม่ doctor_name');
await send('ตั้งวันเวลานัดใหม่',{datetime:'2027-04-01T10:00'});
await send('ตั้งค่านัดใหม่ arrival_lead_minutes 30');
await send('ข้ามเตรียมก่อนสร้างนัด');
await send('เก็บร่างนัด');
const savedDraft=(await db.query("select * from public.phms_get_line_conversation_state($1)",['SYNTHETIC_PHMS_APPOINTMENT_TEST_ONLY'])).rows[0];
assert.ok(savedDraft.state_data.draft_key);
await db.query("select public.phms_clear_line_conversation_state($1)",['SYNTHETIC_PHMS_APPOINTMENT_TEST_ONLY']);
await send('เปิดร่างนัด '+savedDraft.state_data.draft_key);
await send('ยืนยันเจ้าของเริ่มนัด');
await send('ตรวจทานนัดใหม่');
const countBefore=(await db.query('select count(*)::int n from appointments')).rows[0].n;
const draftState=(await db.query("select * from public.phms_get_line_conversation_state($1)",['SYNTHETIC_PHMS_APPOINTMENT_TEST_ONLY'])).rows[0];
const code=draftState.state_data.source_code;assert.ok(code);
await send('ยืนยันรับเข้า '+code);
assert.equal((await db.query('select count(*)::int n from appointments')).rows[0].n,countBefore+1);
await send('ยืนยันรับเข้า '+code);
assert.equal((await db.query('select count(*)::int n from appointments')).rows[0].n,countBefore+1);
const ap=(await db.query('select id from appointments order by created_at desc limit 1')).rows[0];
await send('ดูนัด '+ap.id);
assert.ok(!JSON.stringify(replies.at(-1)).includes('ยังเปิดรายละเอียดไม่ได้'));
await send('phms_refill_begin');
await send('phms_refill_med 60000000-0000-4000-8000-000000000001');
await send('30 tablet',undefined,true);
await send('phms_refill_med_done');
assert.match(JSON.stringify(replies.at(-1)),/datetimepicker/);
await send('phms_refill_date',{datetime:'2027-05-01T09:00'});
await send('โรงพยาบาลสังเคราะห์',undefined,true);
await send('ห้องยา',undefined,true);
await send('phms_refill_confirm');
const refill=(await db.query("select id from appointments where external_reference like 'phms-refill:%' order by created_at desc limit 1")).rows[0];
const refillItem=(await db.query('select * from medication_refill_items where appointment_id=$1',[refill.id])).rows[0];assert.equal(Number(refillItem.expected_quantity),30);
await send('phms_refill_detail '+refill.id);
assert.match(JSON.stringify(replies.at(-1)),/refill_receive/);
await send('refill_receive '+refill.id);
await send('refill_receive item '+refillItem.id);
await send('30',undefined,true);
await send('refill_receive status RECEIVED');
await send('refill_receive unit tablet');
await send('refill_receive pool 70000000-0000-4000-8000-000000000001');
await send('refill_receive location 71000000-0000-4000-8000-000000000001');
await send('SYNTHETIC-RUNTIME-LOT',undefined,true);
await send('2028-06-30',undefined,true);
await send('SYNTHETIC-RUNTIME-CONTAINER',undefined,true);
await send('60',undefined,true);
await send('refill_receive confirm');
assert.match(JSON.stringify(replies.at(-1)),/บันทึกการรับยาจริงแล้ว/);
const receiptAfter=(await db.query('select * from medication_refill_items where id=$1',[refillItem.id])).rows[0];assert.equal(Number(receiptAfter.received_quantity),30);assert.ok(receiptAfter.dispense_id);
const state=(await db.query(`select * from public.phms_get_line_conversation_state($1)`,['SYNTHETIC_PHMS_APPOINTMENT_TEST_ONLY'])).rows[0];
for(const payload of replies){
 assert.ok(payload.messages.length>0&&payload.messages.length<=5);
 const walk=(node)=>{if(!node||typeof node!=='object')return;if(Array.isArray(node)){for(const child of node)walk(child);return}
 if(node.type==='box')assert.ok(node.contents?.length>0,'Flex box requires contents');
 if(node.action?.type==='postback')assert.ok(node.action.data.length<=300);
 if(node.action&&/^(?:↩️|ย้อนกลับ)/u.test(node.action.label||'')&&['box','button'].includes(node.type))assert.equal(node.height,'44px','Back action must use central 44px rule: '+JSON.stringify({type:node.type,label:node.action.label,height:node.height}));
 for(const value of Object.values(node))walk(value)};
 walk(payload);
}
assert.equal(errors.length,0,JSON.stringify(errors));
fs.writeFileSync('tests/appointment/evidence/runtime-flex-payloads.json',JSON.stringify(replies,null,2));
fs.writeFileSync('tests/appointment/evidence/runtime-integration-results.json',JSON.stringify({events:n,replies:replies.length,errors,requests,state},null,2));
console.log(JSON.stringify({events:n,replies:replies.length,errors,state}));

