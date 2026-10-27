import fs from 'node:fs';
import assert from 'node:assert/strict';
import {restore} from './restore.mjs';
import {newReading} from '../../supabase/functions/line-webhook/smart-health.ts';
import {webhookHarness} from '../webhook-harness.mjs';
import {startObjectStorage} from '../http-object-storage.mjs';

// Empty schema snapshot only: real context resolution, policies, FKs and audit
// triggers, with synthetic accounts. No production patient rows are copied.
const {db}=await restore();let passed=0,failed=0;
const actors=[1,2].map(n=>({actor:`10000000-0000-4000-8000-${String(100+n).padStart(12,'0')}`,person:`20000000-0000-4000-8000-${String(100+n).padStart(12,'0')}`,line:'LOCAL_HEALTH_'+n}));
const check=async(label,fn)=>{try{await fn();passed++;console.log('PASS',label);}catch(e){failed++;console.error('FAIL',label,e.message,e.where||'');}};
async function rpc(action,sid=null,payload={},who=0){
 await db.exec('set role service_role');try{return (await db.query('select public.phms_smart_health($1,$2,$3,$4::jsonb) result',[actors[who].line,action,sid,JSON.stringify(payload)])).rows[0].result;}finally{await db.exec('reset role');}
}
const reading=(type,value,extra={})=>({...newReading(type,new Date().toISOString()),value,...extra});
async function commit(readings){const id=crypto.randomUUID();await rpc('begin',id);await rpc('save',id,{revision:0,readings});await rpc('review',id,{revision:1});await rpc('commit',id,{revision:1});return id;}
try{
 await check('migration applies to restored production schema with real authorization and audit triggers',async()=>{
  await db.exec("create table storage.buckets(id text primary key,public boolean);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to service_role,authenticated,anon;grant all on storage.objects,storage.buckets to service_role;grant select on storage.objects to authenticated;insert into storage.buckets values('phms-medical-sources',false)");
  await db.exec(fs.readFileSync(new URL('../../supabase/migrations/20261022144248_smart_health_intake.sql',import.meta.url),'utf8'));
  await db.exec("create policy phms_private_storage_read on storage.objects for select to authenticated using ((bucket_id = ANY (ARRAY['phms-intake-temp','phms-medical-sources','phms-medication-media','phms-exports'])) AND EXISTS(select 1 from public.phms_storage_assets a where a.bucket_id=objects.bucket_id and a.object_name=objects.name and private.phms_storage_asset_visible_to_actor(a.id)))");
  for(const a of actors)await db.exec(`set session_replication_role=replica;insert into auth.users(id) values('${a.actor}');insert into public.profiles(id,display_name) values('${a.actor}','Synthetic Health');insert into public.accounts(id,primary_auth_user_id) values('${a.actor}','${a.actor}');insert into public.persons(id,linked_user_id,linked_account_id,display_name,status) values('${a.person}','${a.actor}','${a.actor}','Synthetic Health','active');insert into public.line_identities(line_user_id,user_id,account_id,is_active) values('${a.line}','${a.actor}','${a.actor}',true);set session_replication_role=origin;`);
  await db.exec(`set session_replication_role=replica;
   insert into families(id,family_name,created_by,status) values('30000000-0000-4000-8000-000000000101','Synthetic Health Family','${actors[0].actor}','active');
   insert into family_persons(id,family_id,person_id,status) values('40000000-0000-4000-8000-000000000101','30000000-0000-4000-8000-000000000101','${actors[0].person}','active');
   insert into family_memberships(family_id,user_id,status) values('30000000-0000-4000-8000-000000000101','${actors[0].actor}','active');
   insert into family_role_assignments(family_id,user_id,role,status,granted_by) values('30000000-0000-4000-8000-000000000101','${actors[0].actor}','owner','active','${actors[0].actor}');
   insert into person_permissions(family_id,family_person_id,user_id,resource,can_view,can_create,can_update,can_delete,status)
    values('30000000-0000-4000-8000-000000000101','40000000-0000-4000-8000-000000000101','${actors[0].actor}','documents',true,true,true,false,'active');
   set session_replication_role=origin;`);
  await db.exec("insert into phms_runtime_environment(environment,allow_real_data,allow_test_data,health_smart_intake_release_state) values('production',true,true,'pilot')");
  await db.query('update phms_runtime_environment set health_smart_intake_test_actor_ids=$1',[actors.map(a=>a.actor)]);
  for(const a of actors){await db.exec('set role service_role');try{await db.query('select public.phms_set_line_personal_context($1)',[a.line]);}finally{await db.exec('reset role');}}
 });
 let session;
 await check('BP HR SpO2 DTX Temp Weight Height RR commit and read back through actual context authorization',async()=>{
  session=await commit([reading('BP',undefined,{systolic:120,diastolic:80,device:'bp_monitor'}),reading('HR',72,{device:'bp_monitor'}),reading('SpO2',98),reading('DTX',110,{context:{meal:'ก่อนอาหาร'}}),reading('Temp',36.8,{context:{site:'รักแร้'}}),reading('Weight',61),reading('Height',154),reading('RR',18)]);
  const rows=(await db.query('select * from health_measurements where intake_session_id=$1',[session])).rows;assert.equal(rows.length,8);assert.ok(rows.every(x=>x.person_id===actors[0].person&&x.created_by===actors[0].actor));assert.ok((await rpc('history',null,{days:90})).points.length>=8);
  assert.ok((await db.query("select id from audit_logs where resource='health_measurements'")).rows.length>=8);
 });
 await check('different actual actor cannot read session, modify draft or impersonate owner',async()=>{
  for(const action of ['read','wizard','evidence_list'])await assert.rejects(rpc(action,session,{revision:0,wizard:{}},1),action==='evidence_list'?/evidence_document_permission_denied|crud_permission_denied/:/session_not_authorized/);
 });
 await check('three BP rounds and two HR device sources stay distinct without duplicates',async()=>{
  const time=new Date().toISOString();const id=await commit([...Array.from({length:3},(_,i)=>reading('BP',undefined,{systolic:120-i,diastolic:80,round:i+1})),reading('HR',72,{device:'bp_monitor',measured_at:time}),reading('HR',73,{device:'oximeter',measured_at:time})]);assert.equal((await db.query('select id from health_measurements where intake_session_id=$1',[id])).rows.length,5);
 });
 await check('committed session retry is idempotent and stale draft cannot bypass review',async()=>{
  assert.equal((await rpc('commit',session,{revision:1})).idempotent_replay,true);assert.equal((await db.query('select id from health_measurements where intake_session_id=$1',[session])).rows.length,8);
  const id=crypto.randomUUID();await rpc('begin',id);await rpc('save',id,{revision:0,readings:[reading('HR',72)]});await assert.rejects(rpc('commit',id,{revision:1}),/review_required/);
 });
 await check('evidence links to canonical owner and reviewed readings with actual asset/document constraints',async()=>{
  const id=crypto.randomUUID();await rpc('begin',id);const path='persons/'+actors[0].person+'/documents/'+crypto.randomUUID()+'.jpg';await db.query("insert into storage.objects(bucket_id,name) values('phms-medical-sources',$1)",[path]);
  const evidence=await rpc('evidence',id,{revision:0,path,mime:'image/jpeg',bytes:123,sha256:'b'.repeat(64),message_id:'synthetic-photo'});assert.ok(evidence.asset_id);
  const readings=[reading('HR',72)];await rpc('save',id,{revision:1,readings});await rpc('review',id,{revision:2});await rpc('commit',id,{revision:2});const items=(await rpc('evidence_list',id)).items;assert.deepEqual(items[0].reading_ids,[readings[0].id]);assert.equal((await rpc('evidence_read',id,{asset_id:evidence.asset_id})).path,path);
  await db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[actors[1].actor]);assert.equal((await tx.query('select * from storage.objects')).rows.length,0);});
  await db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[actors[0].actor]);assert.equal((await tx.query('select * from storage.objects')).rows.length,1);});

 });
 await check('personal health context cannot bypass missing document permission to obtain image access',async()=>{
  const id=crypto.randomUUID();await rpc('begin',id,{},1);
  await assert.rejects(rpc('evidence_list',id,{},1),/evidence_document_permission_denied|crud_permission_denied/);
 });
 await check('anon and authenticated cannot execute service health RPC even with a valid owner LINE ID',async()=>{
  for(const role of ['anon','authenticated'])await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role '+role);await tx.query("select public.phms_smart_health($1,'history',null,'{}')",[actors[0].line]);}),/permission denied/);
 });
 await check('real owner and foreign-account RLS isolation is enforced for measurement readback',async()=>{
  await db.transaction(async tx=>{await tx.exec('grant select on health_measurements to authenticated;set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[actors[1].actor]);assert.equal((await tx.query('select * from health_measurements')).rows.length,0);});
  await db.transaction(async tx=>{await tx.exec('grant select on health_measurements to authenticated;set local role authenticated');await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[actors[0].actor]);assert.ok((await tx.query('select * from health_measurements')).rows.length>=8);});
 });
 await check('signed LINE event to actual context/wizard/draft/HTTP image/review/commit/readback/history uses restored backend RPCs',async()=>{
  const storage=await startObjectStorage();
  const databaseRPC=async(name,params)=>{
   const keys=Object.keys(params),args=keys.map((key,i)=>key+'=> $'+(i+1)).join(',');
   const kind=(await db.query("select prorettype::regtype::text type from pg_proc where proname=$1 and pronamespace='public'::regnamespace",[name])).rows[0]?.type;
   if(!kind)throw Error('Missing real RPC '+name);
   await db.exec('set role service_role');
   try{const rows=(await db.query(kind==='jsonb'?'select public.'+name+'('+args+') result':'select * from public.'+name+'('+args+')',keys.map(key=>params[key]!==null&&typeof params[key]==='object'?JSON.stringify(params[key]):params[key]))).rows;return kind==='jsonb'?rows[0].result:rows;}
   finally{await db.exec('reset role');}
  };
  try{
   const h=await webhookHarness(db,{storage,databaseRPC,lineUserId:actors[0].line});await h.run('เพิ่มสุขภาพ','text');assert.ok(JSON.stringify(h.sent).includes('phms_health_owner self'));
   await h.run('phms_health_owner self');await h.run('','image');await h.click('preset daily');await h.run('122','text');await h.run('81','text');for(let i=0;i<3;i++)await h.click('ctx skip');await h.click('hr_source bp_monitor');await h.run('76','text');await h.click('ctx skip');await h.run('','image');
   assert.equal(storage.count,1);await h.click('photo_done');await h.click('time_now');await h.click('review');await h.click('commit');const saved=await h.snapshot();assert.equal(saved.status,'committed');assert.equal((await db.query('select id from health_measurements where intake_session_id=$1',[saved.id])).rows.length,2);
   await h.click('history 30');assert.ok(JSON.stringify(h.sent).includes('graph 30 BP'));await h.click('graph 30 BP');assert.ok(JSON.stringify(h.sent).includes('ค่าเฉลี่ยรายวัน'));
   const evidence=(await rpc('evidence_list',saved.id)).items[0];await h.click('evidence '+evidence.asset_id);const url=new URL(h.sent[0].originalContentUrl);const response=await fetch(storage.origin+url.pathname+url.search);assert.equal(response.status,200);assert.deepEqual(new Uint8Array(await response.arrayBuffer()),new Uint8Array([255,216,255,0,23]));
  }finally{await storage.close();}
 });
 await check('disabled release gate rejects authorized service RPC without creating health records',async()=>{
  await db.exec("update phms_runtime_environment set health_smart_intake_release_state='off'");await assert.rejects(rpc('begin',crypto.randomUUID()),/smart_health_release_not_authorized/);
 });
 await check('reapplying migration preserves canonical rows, constraints and closed gate',async()=>{
  const before=(await db.query('select count(*) n from health_measurements')).rows[0].n;
  await db.exec(fs.readFileSync(new URL('../../supabase/migrations/20261022144248_smart_health_intake.sql',import.meta.url),'utf8'));
  assert.equal((await db.query('select count(*) n from health_measurements')).rows[0].n,before);
  assert.equal((await db.query('select health_smart_intake_release_state state from phms_runtime_environment')).rows[0].state,'off');
 });
 await check('operational rollback disables commits and restores introduced grants without deleting evidence',async()=>{
  const before=(await db.query('select count(*) n from health_measurements')).rows[0].n;
  await db.exec(fs.readFileSync(new URL('../../release/smart-health/rollback.sql',import.meta.url),'utf8'));
  assert.equal((await db.query('select count(*) n from health_measurements')).rows[0].n,before);
  assert.equal((await db.query("select has_function_privilege('service_role','public.phms_smart_health(text,text,uuid,jsonb)','execute') ok")).rows[0].ok,false);
  assert.equal((await db.query("select has_function_privilege('service_role','private.phms_line_crud_context(text,text,text)','execute') ok")).rows[0].ok,false);
 });
}finally{console.log(JSON.stringify({passed,failed,productionPatientRowsCopied:0,storageTransport:'isolated; production predicates and asset authorization restored'}));await db.close();}
if(failed)process.exitCode=1;
