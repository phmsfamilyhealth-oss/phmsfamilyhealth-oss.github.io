import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {medicationTemplate,medicationFieldsFromText,medicationFreeTextValues,normalizeMedication,validateMedication,MED_FIELDS,medicationScheduleLabel} from '../supabase/functions/line-webhook/smart-medication.ts';
import {handleSmartMedication} from '../supabase/functions/line-webhook/smart-medication-runtime.ts';
const complete={generic_name:'Gabapentin',brand_name:'ไม่ทราบ',strength_value:'100',strength_unit:'mg',dosage_form:'แคปซูล',dose_value:'1',dose_unit:'แคปซูล',frequency:'วันละ 1 ครั้ง',weekdays:'ไม่เกี่ยวข้อง',time:'ก่อนนอน',instructions:'รับประทานตามฉลาก',meal_relation:'ไม่สัมพันธ์กับอาหาร',warnings:'อาจง่วง',start_date:'2026-10-22',notes:'ไม่มี'};
const raw=v=>MED_FIELDS.map(([k,label])=>label+': '+(v[k]||'')).join('\n');
function harness(initial=null){
 let st=initial, payloads=[],calls=[];let authorized=true,person='test-person',commit=true,stored;
 const ctx={e:{type:'message',source:{type:'user'},message:{id:'test-message'},webhookEventId:'event-1',replyToken:'test-reply'},u:'test-url',k:'test-key',id:'test-user',t:'test-token',theme:{color:'#651126',background:'#FFF0F1'},one:x=>Array.isArray(x)?x[0]:x,name:async()=> 'Test',
 state:async(_u,_k,_id,state_key,state_data)=>{st={state_key,state_data}},clear:async()=>{st=null},replyMessages:async(_rt,_t,m)=>payloads.push(structuredClone(m)),
 rpc:async(_u,_k,n,b)=>{calls.push({n,b});if(n==='phms_resolve_line_command_context')return {context_ready:true,permission_granted:authorized,target_person_id:person,target_person_name:'Test'};
 if(n==='phms_start_line_structured_text_intake'){stored=b.p_normalized_data;return {source_code:'12345678-abcd'}}
 if(n==='phms_record_line_manual_structured_extraction'){stored=b.p_normalized_data;return {ok:true}}
 if(n==='phms_finalize_line_intake_review'&&b.p_decision==='commit')return {canonical_commit:commit,error_code:commit?null:'commit_blocked'};return {ok:true}},
 loadMedicationDraftByCode:async()=>({partial:stored})};
 return {ctx,send:async(c,type='postback')=>{ctx.c=c;ctx.st=st;ctx.e.type=type;ctx.e.webhookEventId+='x';return handleSmartMedication(ctx)},get st(){return st},get payloads(){return payloads},get calls(){return calls},deny:()=>authorized=false,changePerson:()=>person='different-person',blockCommit:()=>commit=false};
}
function validateLinePayload(messages){
 assert.ok(messages.length<=5);
 const visit=node=>{if(!node||typeof node!=='object')return;
  if(node.type==='bubble')assert.ok(Buffer.byteLength(JSON.stringify(node))<=30000,'Flex bubble exceeds 30 KB');
  if(node.type==='postback'){assert.ok(node.data.length<=300);assert.ok(Array.from(node.label).length<=20)}
  if(node.quickReply)assert.ok(node.quickReply.items.length<=13);
  for(const value of Object.values(node))if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);
 };messages.forEach(visit);
}
const buttons=messages=>JSON.stringify(messages).match(/sm23:confirm/g)||[];
test('copyable template has all fields and remains an uncommittable example',()=>{
 const v=medicationFieldsFromText(medicationTemplate());assert.equal(v.generic_name,'Gabapentin');assert.equal(Object.keys(v).length,15);assert.ok(validateMedication(normalizeMedication(v)).some(x=>x.includes('ตัวอย่าง')));
});
test('both input modes produce the same normalized draft',()=>assert.deepEqual(normalizeMedication(medicationFieldsFromText(raw(complete))),normalizeMedication(complete)));
test('Gabapentin complete fixture validates, with explicit bedtime and food relation',()=>{const d=normalizeMedication(complete);assert.deepEqual(validateMedication(d),[]);assert.deepEqual(d.time_of_day,['bedtime']);assert.ok(d.instructions.includes('อาจง่วง'))});
test('requested natural Gabapentin text creates partial values without inventing frequency',()=>{const d=normalizeMedication(medicationFreeTextValues('Gabapentin 100 mg แคปซูล 1 แคปซูลก่อนนอน'));assert.equal(d.generic_name,'Gabapentin');assert.equal(d.dose_value,1);assert.ok(validateMedication(d).includes('ความถี่'));assert.equal(d.frequency_type,undefined)});
test('Vitamin D2 weekly keeps IU, weekday and exact time',()=>{const d=normalizeMedication({...complete,generic_name:'Vitamin D2',strength_value:'20000',strength_unit:'IU',frequency:'สัปดาห์ละ 1 ครั้ง',weekdays:'จันทร์',time:'08:00',meal_relation:'หลังอาหาร'});assert.deepEqual(validateMedication(d),[]);assert.deepEqual(d.weekdays,[1]);assert.equal(d.frequency_unit,'week')});
test('weekly without weekday is blocked',()=>assert.ok(validateMedication(normalizeMedication({...complete,frequency:'สัปดาห์ละ 1 ครั้ง',weekdays:''})).some(x=>x.includes('วันในสัปดาห์'))));
test('eye drops require side, drops and food not applicable',()=>{const d=normalizeMedication({...complete,generic_name:'Timolol',strength_value:'0.5',strength_unit:'%',dosage_form:'ยาหยอดตา',dose_unit:'หยด',frequency:'วันละ 2 ครั้ง',time:'08:00,20:00',meal_relation:'ไม่เกี่ยวข้อง',administration_site:'ตาทั้งสองข้าง',instructions:'หยอดตา'});assert.deepEqual(validateMedication(d),[]);assert.equal(d.route,'ophthalmic');assert.ok(validateMedication({...d,administration_site:''}).some(x=>x.includes('ข้างตา')))});
test('incomplete/ambiguous input stays invalid',()=>{const d=normalizeMedication({generic_name:'Gabapentin'});assert.ok(validateMedication(d).length>=8);const v=medicationFieldsFromText(raw(complete)+'\nจำนวนต่อครั้ง: 2');assert.ok(validateMedication(normalizeMedication(v)).some(x=>x.includes('ขัดกัน')))});
test('invalid number, units, dates, time and frequency mismatch are rejected',()=>{for(const patch of [{strength_value:'-1'},{strength_unit:'bogus'},{dose_value:'abc'},{dose_unit:'หยด'},{start_date:'2026-02-30'},{time:'25:99'},{frequency:'วันละ 3 ครั้ง'}])assert.ok(validateMedication(normalizeMedication({...complete,...patch})).length,JSON.stringify(patch))});
test('template sends separate Flex and Text, never creates intake',async()=>{const h=harness();await h.send('เทมเพลตเพิ่มยา');const ms=h.payloads.at(-1);assert.deepEqual(ms.map(m=>m.type),['flex','text']);assert.equal(ms[1].text,medicationTemplate());assert.equal(h.calls.filter(x=>x.n==='phms_start_line_structured_text_intake').length,0)});
test('template returned unchanged creates review with no save action',async()=>{const h=harness();await h.send('เทมเพลตเพิ่มยา');await h.send(medicationTemplate(),'message');assert.equal(h.st.state_key,'smart_medication');assert.equal(buttons(h.payloads.at(-1)).length,0);assert.equal(h.calls.filter(x=>x.n.includes('commit')).length,0)});
test('text → normalized draft → review → explicit confirm → authorized intake/commit',async()=>{const h=harness();await h.send(raw(complete),'message');assert.deepEqual(h.st.state_data.normalized_draft,normalizeMedication(complete));assert.equal(buttons(h.payloads.at(-1)).length,1);assert.equal(h.calls.filter(x=>x.n.includes('commit')).length,0);await h.send('sm23:confirm '+(h.st?.state_data?.revision||''));assert.equal(h.calls.filter(x=>x.n==='phms_finalize_line_intake_review'&&x.b.p_decision==='commit').length,1);assert.equal(h.st,null)});
test('single field choice uses same normalized draft and review',async()=>{const h=harness();await h.send('เริ่มเลือกช่องยา');for(const [key,value] of Object.entries(complete)){await h.send('sm23:edit '+key);await h.send(value,'message')}assert.deepEqual(h.st.state_data.normalized_draft,normalizeMedication(complete))});
test('missing fields cannot confirm or create active medication',async()=>{const h=harness();await h.send('ชื่อสามัญ: Gabapentin','message');await h.send('sm23:confirm '+(h.st?.state_data?.revision||''));assert.equal(h.calls.filter(x=>x.n==='phms_finalize_line_intake_review'&&x.b.p_decision==='commit').length,0);assert.ok(h.st.state_data.validation_issues.length)});
test('authorization denied and person changed fail closed',async()=>{const h=harness();h.deny();await h.send(raw(complete),'message');assert.equal(h.st,null);assert.equal(h.calls.filter(x=>x.n.includes('commit')).length,0);const j=harness();await j.send(raw(complete),'message');j.changePerson();await j.send('sm23:confirm '+(j.st?.state_data?.revision||''));assert.equal(j.calls.filter(x=>x.n.includes('commit')).length,0)});
test('database gate blocks commit without claiming success or clearing draft',async()=>{const h=harness();h.blockCommit();await h.send(raw(complete),'message');await h.send('sm23:confirm '+(h.st?.state_data?.revision||''));assert.ok(h.st);assert.match(JSON.stringify(h.payloads.at(-1)),/ยังไม่อนุญาตบันทึก/)});
test('weekly uses the same atomic commit pipeline as daily',async()=>{const h=harness();await h.send(raw({...complete,frequency:'สัปดาห์ละ 1 ครั้ง',weekdays:'จันทร์'}),'message');await h.send('sm23:confirm '+(h.st?.state_data?.revision||''));assert.equal(h.st,null);assert.equal(h.calls.filter(x=>x.n==='phms_finalize_line_intake_review'&&x.b.p_decision==='commit').length,1)});
test('expired postback cannot save and non-medication navigation is untouched',async()=>{const h=harness();await h.send('sm23:confirm '+(h.st?.state_data?.revision||''));assert.equal(h.st,null);assert.equal(await h.send('นัดหมาย'),false)});
// Exercise PHMS's actual 1.46 MB presentation pipeline, not only the new builder.
test('full runtime syntax and final outbound template survive global Flex conversion',async()=>{
 let sent;const base=new URL('../supabase/functions/line-webhook/',import.meta.url);
 let source=fs.readFileSync(new URL('index.ts',base),'utf8').replace(/^import .*;\s*$/gm,'');
 source=stripTypeScriptTypes(source,{mode:'transform'});
 const context=vm.createContext({console,TextEncoder,TextDecoder,URL,URLSearchParams,Request,Response,Headers,crypto,Intl,atob,btoa,setTimeout,clearTimeout,medicationTemplate,medicationScheduleLabel,handleSmartMedication,
 Deno:{env:{get:()=>''},serve:()=>{}},fetch:async(url,init)=>{if(String(url).includes('api.line.me'))sent=JSON.parse(init.body);return new Response('[]',{status:200})}});
 vm.runInContext(source,context,{timeout:10000});
 const h=harness();await h.send('เทมเพลตเพิ่มยา');context.testMessages=h.payloads.at(-1);
 await vm.runInContext("replyMessages('token','access',testMessages)",context,{timeout:10000});
 assert.ok(sent);validateLinePayload(sent.messages);assert.equal(sent.messages.length,2);assert.equal(sent.messages[1].type,'text');assert.equal(sent.messages[1].text,medicationTemplate());
 assert.ok(JSON.stringify(sent).length<30000);
 assert.ok(JSON.stringify(sent.messages[0]).includes('เพิ่มยา'));
 assert.ok(JSON.stringify(sent.messages[0]).includes('postback'));
 for(const [label,input,type,expected] of [
 ['menu','เริ่มเลือกช่องยา','postback','sm23:edit'],
 ['review',raw(complete),'message','sm23:confirm'],
 ['incomplete','ชื่อสามัญ: Gabapentin','message','sm23:menu']
 ]){
  const session=harness();await session.send(input,type);context.testMessages=session.payloads.at(-1);
  await vm.runInContext("replyMessages('token','access',testMessages)",context,{timeout:10000});
  validateLinePayload(sent.messages);assert.ok(sent.messages.length<=5,label);assert.ok(JSON.stringify(sent).includes(expected),label+' actions survive presentation');
 }
 
});
