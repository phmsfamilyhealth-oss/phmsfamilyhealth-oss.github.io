import {db} from './db.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
await db.waitReady;
for(const x of JSON.parse(fs.readFileSync('tests/appointment/fixtures/indexes.json','utf8')))try{await db.exec(x.ddl)}catch(e){if(!e.message.includes('already exists'))throw e}
for(const x of JSON.parse(fs.readFileSync('tests/appointment/fixtures/schema-catalog.json','utf8')).constraints)if(x.includes(' FOREIGN KEY '))try{await db.exec(x)}catch(e){if(!e.message.includes('already exists'))throw e}
await db.exec("insert into phms_runtime_environment(singleton,environment,allow_real_data,allow_test_data,allow_destructive_changes,line_paid_send_mode) values(true,'staging',false,true,true,'off') on conflict(singleton) do update set environment='staging',allow_real_data=false,allow_test_data=true,allow_destructive_changes=true,line_paid_send_mode='off';truncate auth.users cascade;");
await db.exec(fs.readFileSync('supabase/migrations/20261022144005_appointment_recovery_release.sql','utf8'));


const uid='10000000-0000-4000-8000-000000000001',person='20000000-0000-4000-8000-000000000001',family='30000000-0000-4000-8000-000000000001',fp='40000000-0000-4000-8000-000000000001',line='SYNTHETIC_PHMS_APPOINTMENT_TEST_ONLY';
await db.exec(`insert into auth.users(id,email) values('${uid}','phms-test@example.invalid') on conflict do nothing;
insert into public.profiles(id,display_name) values('${uid}','ผู้ดูแลทดสอบ') on conflict do nothing;
insert into public.persons(id,linked_user_id,display_name,status) values('${person}','${uid}','สมาชิกทดสอบ A','active') on conflict do nothing;
insert into public.families(id,family_name,created_by,status) values('${family}','ครอบครัวสังเคราะห์','${uid}','active') on conflict do nothing;
insert into public.family_memberships(family_id,user_id,status) select '${family}','${uid}','active' where not exists(select 1 from public.family_memberships where family_id='${family}' and user_id='${uid}');
insert into public.family_role_assignments(family_id,user_id,role,status) select '${family}','${uid}','owner','active' where not exists(select 1 from public.family_role_assignments where family_id='${family}' and user_id='${uid}');
insert into public.family_persons(id,family_id,person_id,status) values('${fp}','${family}','${person}','active') on conflict do nothing;
insert into public.user_contexts(user_id,active_scope,active_family_id,active_family_person_id) values('${uid}','family','${family}','${fp}') on conflict(user_id) do update set active_scope='family',active_family_id='${family}',active_family_person_id='${fp}';
insert into public.line_identities(user_id,line_user_id,is_active) select '${uid}','${line}',true where not exists(select 1 from public.line_identities where line_user_id='${line}');
insert into private.phms_real_data_pilot_families(family_id,status,max_people,max_canonical_records,starts_at,ends_at) values('${family}','active',10,500,now()-interval '1 day',now()+interval '1 day') on conflict(family_id) do nothing;`);
const calls=[];async function rpc(name,args){const keys=Object.keys(args);const q=`select public.${name}(${keys.map((k,i)=>k+'=> $'+(i+1)).join(',')}) result`;try{const r=(await db.query(q,Object.values(args))).rows[0].result;calls.push({name,result:r});return r}catch(e){console.error('RPC FAILED',name,e.message,e.where);throw e}}
let passed=0;async function test(name,fn){await fn();passed++;console.log('PASS',name)};
let first;
await db.exec(`insert into medication_master(id,generic_name,status) values('50000000-0000-4000-8000-000000000001','ยา A สังเคราะห์','active'),('50000000-0000-4000-8000-000000000002','ยา B สังเคราะห์','active') on conflict do nothing;insert into person_medications(id,person_id,medication_id,status,created_by) values('60000000-0000-4000-8000-000000000001','${person}','50000000-0000-4000-8000-000000000001','regular','${uid}'),('60000000-0000-4000-8000-000000000002','${person}','50000000-0000-4000-8000-000000000002','regular','${uid}') on conflict do nothing;`);
await test('real canonical intake -> confirm -> commit -> database readback',async()=>{
 const draft=await rpc('phms_start_line_structured_text_intake',{p_line_user_id:line,p_line_message_id:'synthetic-create-v1',p_resource:'appointment',p_raw_text:'นัดทดสอบระบบเท่านั้น',p_normalized_data:{title:'นัดสังเคราะห์ตรวจระบบ',appointment_at:'2026-12-20T10:00:00+07:00',appointment_type:'new_case',hospital_name:'สถานพยาบาลทดสอบ',preparation_notes:'นำใบนัดมาด้วย'}});
 assert.ok(draft.source_code);await rpc('phms_finalize_line_intake_review',{p_line_user_id:line,p_source_code:draft.source_code,p_decision:'confirm'});
 const committed=await rpc('phms_line_try_canonical_commit',{p_line_user_id:line,p_source_code:draft.source_code});
 assert.ok(committed.canonical_commit||committed.committed,JSON.stringify(committed));
 first=(await db.query(`select * from public.appointments where person_id=$1 order by created_at limit 1`,[person])).rows[0];assert.ok(first);assert.equal(first.hospital_name,'สถานพยาบาลทดสอบ');
 await rpc('phms_finalize_line_intake_review',{p_line_user_id:line,p_source_code:draft.source_code,p_decision:'confirm'});
 await rpc('phms_line_try_canonical_commit',{p_line_user_id:line,p_source_code:draft.source_code});assert.equal((await db.query('select count(*)::int n from public.appointments where person_id=$1',[person])).rows[0].n,1);
});
await test('workspace reads real saved appointment',async()=>{
 const w=await rpc('phms_line_appointment_workspace',{p_line_user_id:line,p_record_code:first.id});assert.equal(w.record_id,first.id);assert.equal(w.item.person_id,person);
});
await test('create each clinical appointment type without a physician or source',async()=>{
 for(const [i,type] of ['follow_up','referral','investigation','procedure','checkup','vaccination','other'].entries()){
  const d=await rpc('phms_start_line_structured_text_intake',{p_line_user_id:line,p_line_message_id:'synthetic-'+type,p_resource:'appointment',p_raw_text:'ข้อมูลสังเคราะห์ '+type,p_normalized_data:{title:'ทดสอบ '+type,appointment_at:'2027-01-'+String(i+1).padStart(2,'0')+'T10:00:00+07:00',appointment_type:type,hospital_name:'สถานพยาบาลทดสอบ'}});
  await rpc('phms_finalize_line_intake_review',{p_line_user_id:line,p_source_code:d.source_code,p_decision:'confirm'});
  const c=await rpc('phms_line_try_canonical_commit',{p_line_user_id:line,p_source_code:d.source_code});assert.ok(c.canonical_commit||c.committed,JSON.stringify(c));
 }
});
await test('diagnostic VF and OCT share one appointment and retry is idempotent',async()=>{
 const ap=(await db.query("select id from appointments where appointment_type='investigation' limit 1")).rows[0];
 for(const code of ['VF_24_2','OCT_RNFL'])for(let j=0;j<2;j++)await rpc('phms_diagnostic_add_procedure',{p_line_user_id:line,p_appointment_id:ap.id,p_code:code,p_name_th:code,p_name_en:code,p_category:'other',p_request_key:'synthetic-diagnostic-'+code});
 assert.equal((await db.query('select count(*)::int n from appointment_procedure_items where appointment_id=$1',[ap.id])).rows[0].n,2);
 assert.equal((await db.query('select count(*)::int n from appointment_procedure_items where clinical_instruction is not null')).rows[0].n,0);
});
await test('multi-medication refill create and retry use existing RPC',async()=>{
 const args={p_line_user_id:line,p_key:'synthetic-refill-integration',p_at:'2027-02-01T10:00:00+07:00',p_hospital:'สถานพยาบาลทดสอบ',p_location:'จุดรับยาทดสอบ',p_items:[{person_medication_id:'60000000-0000-4000-8000-000000000001',expected_quantity:30,expected_unit:'เม็ด'},{person_medication_id:'60000000-0000-4000-8000-000000000002',expected_quantity:60,expected_unit:'เม็ด'}]};
 const r=await rpc('phms_med_v23_refill_create',args);assert.equal(r.item_count,2);const again=await rpc('phms_med_v23_refill_create',args);assert.equal(again.appointment_id,r.appointment_id);assert.equal(again.duplicate,true);
 const detail=await rpc('phms_med_v23_refill_detail',{p_line_user_id:line,p_appointment_id:r.appointment_id});assert.ok(detail);
});
await test('canonical diagnostic payload commits procedures atomically',async()=>{
 const d=await rpc('phms_start_line_structured_text_intake',{p_line_user_id:line,p_line_message_id:'synthetic-diagnostic-canonical',p_resource:'appointment',p_raw_text:'นัดตรวจสังเคราะห์',p_normalized_data:{title:'ตรวจสองรายการสังเคราะห์',appointment_at:'2027-03-01T10:00:00+07:00',appointment_type:'investigation',hospital_name:'สถานพยาบาลทดสอบ',diagnostic_procedures:[{code:'VF_24_2',name:'ลานสายตา VF 24-2'},{code:'OCT_RNFL',name:'จอประสาทตา OCT RNFL'}]}});
 await rpc('phms_finalize_line_intake_review',{p_line_user_id:line,p_source_code:d.source_code,p_decision:'confirm'});await rpc('phms_line_try_canonical_commit',{p_line_user_id:line,p_source_code:d.source_code});
 assert.equal((await db.query("select count(*)::int n from appointment_procedure_items p join appointments a on a.id=p.appointment_id where a.title='ตรวจสองรายการสังเคราะห์'")).rows[0].n,2);
});
await test('edit and reschedule update one appointment with audit',async()=>{
 const n=(await db.query('select count(*)::int n from appointments')).rows[0].n;
 await rpc('phms_line_appointment_update_v3',{p_line_user_id:line,p_record_code:first.id,p_patch:{title:'ชื่อแก้ไขสังเคราะห์',appointment_at:'2026-12-21T11:30:00+07:00'},p_reason:'ทดสอบเลื่อนนัด'});
 const ap=(await db.query('select * from appointments where id=$1',[first.id])).rows[0];assert.equal(ap.title,'ชื่อแก้ไขสังเคราะห์');assert.equal(new Date(ap.appointment_at).toISOString(),'2026-12-21T04:30:00.000Z');assert.equal((await db.query('select count(*)::int n from appointments')).rows[0].n,n);
 assert.ok((await db.query('select count(*)::int n from audit_logs where record_id=$1',[first.id])).rows[0].n>0);
});
await test('preparation checklist generates real tasks',async()=>{
 assert.ok((await db.query('select count(*)::int n from appointment_tasks where appointment_id=$1',[first.id])).rows[0].n>0);
 const t=await rpc('phms_line_appointment_add_task',{p_line_user_id:line,p_record_code:first.id,p_title:'นำเอกสารสังเคราะห์',p_task_type:'document'});assert.ok(t.task_code);
});
await test('reminder settings persist and sync',async()=>{
 const r=await rpc('phms_line_appointment_set_reminders',{p_line_user_id:line,p_record_code:first.id,p_offsets_minutes:[1440,60],p_post_visit_minutes:0});assert.equal(r.ok,true);assert.deepEqual(r.reminder_offsets_minutes,[1440,60]);
});
await test('date-only Walk-in plan retries without duplicate',async()=>{
 const args={p_line_user_id:line,p_key:'synthetic-walkin-plan-retry',p_payload:{date:'2027-07-01',title:'แผนสังเคราะห์',appointment_type:'other',hospital_name:'สถานพยาบาลทดสอบ'}};
 const a=await rpc('phms_line_create_walkin_plan_v3',args),b=await rpc('phms_line_create_walkin_plan_v3',args);assert.equal(a.record_id,b.record_id);assert.equal(b.duplicate,true);const row=(await db.query('select * from appointments where id=$1',[a.record_id])).rows[0];assert.equal(row.visit_time_known,false);assert.equal(row.appointment_at,null);assert.notEqual(row.status,'confirmed');
});
await test('document link retries and wrong-person attachment is rejected',async()=>{
 const asset='70000000-0000-4000-8000-000000000001',other='20000000-0000-4000-8000-000000000002';
 await db.exec(`insert into persons(id,nickname,status) values('${other}','สมาชิกทดสอบ B','active') on conflict do nothing;insert into phms_storage_assets(id,bucket_id,object_name,asset_kind,lifecycle_state,person_id,permission_resource,created_by) values('${asset}','phms-medical-sources','persons/${person}/documents/${asset}.pdf','medical_document','confirmed','${person}','appointments','${uid}') on conflict do nothing;`);
 const args={p_line_user_id:line,p_record_code:first.id,p_storage_asset_id:asset,p_link_kind:'source'};
 const a=await rpc('phms_line_appointment_link_existing_asset',args),b=await rpc('phms_line_appointment_link_existing_asset',args);assert.equal(a.link_id,b.link_id);
 await db.query('update phms_storage_assets set person_id=$1 where id=$2',[other,asset]);
 await assert.rejects(()=>rpc('phms_line_appointment_link_existing_asset',args),/person_mismatch/);
 await db.query('update phms_storage_assets set person_id=$1 where id=$2',[person,asset]);
});
await test('durable draft survives conversation clearing and expiry is enforced',async()=>{
 const key='80000000-0000-4000-8000-000000000001',payload={guided:true,partial:{hospital_name:'สถานพยาบาลทดสอบ',appointment_type:'follow_up',date:'2027-09-01',time:'10:00'}};
 await rpc('phms_line_save_appointment_wizard_draft',{p_line_user_id:line,p_key:key,p_payload:payload});
 await rpc('phms_clear_line_conversation_state',{p_line_user_id:line});
 const r=await rpc('phms_line_get_appointment_wizard_draft',{p_line_user_id:line,p_key:key});assert.equal(r.draft.partial.date,payload.partial.date);assert.equal(r.draft.person_confirmed,false);
 await db.query("update private.phms_appointment_wizard_drafts set expires_at=now()-interval '1 minute' where id=$1",[key]);
 await assert.rejects(()=>rpc('phms_line_get_appointment_wizard_draft',{p_line_user_id:line,p_key:key}),/expired_or_not_found/);
});
await test('cancel clears pending reminder jobs',async()=>{
 const r=await rpc('phms_line_appointment_cancel',{p_line_user_id:line,p_record_code:first.id,p_reason:'ทดสอบยกเลิก'});assert.equal(r.status,'cancelled');
 assert.equal((await db.query("select count(*)::int n from appointment_reminders where appointment_id=$1 and status in ('pending','failed')",[first.id])).rows[0].n,0);
});
await test('unlinked LINE identity is denied',async()=>{
 await assert.rejects(()=>rpc('phms_start_line_structured_text_intake',{p_line_user_id:'SYNTHETIC_UNLINKED',p_line_message_id:'unauthorized-test',p_resource:'appointment',p_raw_text:'unauthorized',p_normalized_data:{appointment_at:'2027-01-01T10:00:00+07:00'}}),/line_identity/);
});
fs.writeFileSync('tests/appointment/evidence/integration-results.json',JSON.stringify({passed,engine:(await db.query('select version()')).rows,network:'disabled: no LINE credentials or dispatcher network',calls},null,2));

