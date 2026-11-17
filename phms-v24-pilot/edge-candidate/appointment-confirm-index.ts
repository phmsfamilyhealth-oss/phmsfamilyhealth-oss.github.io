// PHMS v2.4 secure appointment persistence candidate.
// All authorization is server-side; the browser never supplies actor/family IDs.
import {createClient} from 'npm:@supabase/supabase-js@2';
import postgres from 'npm:postgres@3.4.7';
import {makePhmsLineIdentityAdapter} from '../contracts/phms-line-identity-adapter.mjs';
import {makePhmsPersonResolver} from '../contracts/phms-person-resolver.mjs';
import {makePhmsAuthorityAdapter} from '../contracts/phms-private-authority.mjs';

const ORIGIN='https://phmsfamilyhealth-oss.github.io';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isoDate=/^\d{4}-\d{2}-\d{2}$/;
const isoTime=/^([01]\d|2[0-3]):[0-5]\d$/;
const env=name=>(Deno.env.get(name)||'').trim();
const reply=(status,payload)=>new Response(JSON.stringify(payload),{status,headers:{
 'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'
}});
const serviceKey=()=>{if(env('SUPABASE_SERVICE_ROLE_KEY'))return env('SUPABASE_SERVICE_ROLE_KEY');
 try{return JSON.parse(env('SUPABASE_SECRET_KEYS'))?.default||''}catch{return ''}};
const digest=async text=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)));
const hex=b=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
async function deterministicId(actor,person,key){
 const bytes=(await digest('phms-v24-appointment:'+actor+':'+person+':'+key)).slice(0,16);
 bytes[6]=(bytes[6]&15)|80;bytes[8]=(bytes[8]&63)|128;
 const x=hex(bytes);return x.slice(0,8)+'-'+x.slice(8,12)+'-'+x.slice(12,16)+'-'+x.slice(16,20)+'-'+x.slice(20);
}
const str=(v,max)=>typeof v==='string'&&v.length<=max?v.trim():null;
const text=(v,max)=>v==null?'':str(v,max);
const arr=x=>Array.isArray(x)?x:null;
function normalizeDraft(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
 if(!['booked','walk_in','historical'].includes(raw.scenario))return null;
 const date=str(raw.date,10),time=raw.time_known===true?str(raw.time,5):null;
 if(!date||!isoDate.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||
   new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date||
   typeof raw.time_known!=='boolean'||(raw.time_known&&!isoTime.test(time||''))||
   (!raw.time_known&&raw.time)||raw.scenario==='booked'&&!raw.time_known)return null;
 if(raw.documents?.length||raw.document_metadata?.length)return null;
 const purpose=str(raw.purpose,160),selection=raw.provider_selection,details=raw.extended_details||{};
 if(!purpose||!selection||typeof selection!=='object'||!UUID.test(selection.organizationId||'')||
   !details||typeof details!=='object'||Array.isArray(details))return null;
 for(const k of ['unitId','clinicianId'])if(selection[k]&&!UUID.test(selection[k]))return null;
 const fields=['hospital_hn','hospital_vn','location_detail','contact_phone','care_topic',
 'coverage_type','visit_outcome_notes','diagnosis_summary','treatment_summary',
 'test_results_summary','medication_plan_notes','next_steps','walk_in_reason'];
 for(const k of fields)if(text(details[k],1500)===null)return null;
 const lead=Number(details.arrival_lead_minutes??0);
 if(!Number.isInteger(lead)||lead<0||lead>720)return null;
 if(details.walk_in_reason&&!['queue_full','hospital_advised','no_booking','urgent','other'].includes(details.walk_in_reason))return null;
 const checklist=arr(raw.preparation_items)||[];
 if(checklist.length>30||checklist.some(t=>!t||!str(t.title,160)))return null;
 const tests=arr(raw.procedure_items)||[];
 if(tests.length>30||tests.some(t=>!str(t,160)))return null;
 if(raw.journey_details?.main?.photos?.length||raw.journey_details?.steps?.some(x=>x.photos?.length))return null;
 return {date,time,purpose,selection,details,lead,checklist,tests,raw};
}
let db=null,client=null,verifyLine=null,authority=null,resolvePerson=null;
try{
 if(env('SUPABASE_URL')&&env('SUPABASE_DB_URL')&&serviceKey()){
  client=createClient(env('SUPABASE_URL'),serviceKey(),{auth:{persistSession:false,autoRefreshToken:false}});
  db=postgres(env('SUPABASE_DB_URL'),{max:3,prepare:false,connect_timeout:5,idle_timeout:10});
  const query=async(q,parameters)=>({rows:await db.unsafe(q,parameters)});
  authority=makePhmsAuthorityAdapter(query);
  verifyLine=makePhmsLineIdentityAdapter({supabase:client,channelId:'2011619364',fetchImpl:fetch,onReject:code=>console.warn('phms_appointment_auth_rejected',code)});
  resolvePerson=makePhmsPersonResolver({supabase:client,centralCanAccess:authority.centralCanAccess});
 }
}catch(e){console.error('phms_appointment_writer_configuration_failed');db=null;}
Deno.serve(async request=>{
 const origin=request.headers.get('origin');
 if(origin&&origin!==ORIGIN)return reply(403,{ok:false,error:'origin_not_allowed'});
 const cors=r=>{if(!origin)return r;const headers=new Headers(r.headers);
  headers.set('access-control-allow-origin',ORIGIN);headers.set('vary','Origin');
  return new Response(r.body,{status:r.status,headers});};
 if(request.method==='OPTIONS')return origin===ORIGIN?new Response(null,{status:204,headers:{
  'access-control-allow-origin':ORIGIN,'access-control-allow-methods':'POST, OPTIONS',
  'access-control-allow-headers':'authorization, content-type','access-control-max-age':'300','vary':'Origin'
 }}):reply(403,{ok:false,error:'origin_not_allowed'});
 if(request.method!=='POST')return cors(reply(405,{ok:false,error:'method_not_allowed'}));
 if(!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get('content-type')||''))
  return cors(reply(415,{ok:false,error:'invalid_content_type'}));
 if(!db||!verifyLine||!authority||!resolvePerson)return cors(reply(503,{ok:false,error:'service_not_configured'}));
 const bearer=/^Bearer ([^\s]+)$/.exec(request.headers.get('authorization')||'')?.[1];
 if(!bearer)return cors(reply(401,{ok:false,error:'unauthenticated'}));
 let body;
 try{const input=await request.text();if(new TextEncoder().encode(input).length>65536)
   return cors(reply(413,{ok:false,error:'payload_too_large'}));body=JSON.parse(input);
 }catch{return cors(reply(400,{ok:false,error:'invalid_json'}));}
 try{
  const actor=await verifyLine(bearer);
  if(!actor?.userId)return cors(reply(401,{ok:false,error:'unauthenticated'}));
  if(await authority.isReleaseEnabled(actor.userId)!==true)
   return cors(reply(404,{ok:false,error:'feature_not_released'}));
  if(body?.action==='capabilities')
   return cors(reply(200,{ok:true,canSave:true}));
  if(!UUID.test(body?.selectedPersonCode||'')||!UUID.test(body?.operationKey||''))
   return cors(reply(400,{ok:false,error:'invalid_request'}));
  const person=await resolvePerson(actor.userId,body.selectedPersonCode);
  if(!person)return cors(reply(403,{ok:false,error:'permission_denied'}));
  const draft=normalizeDraft(body.draft);
  if(!draft)return cors(reply(422,{ok:false,error:'invalid_appointment'}));
  const id=await deterministicId(actor.userId,person.familyPersonId,body.operationKey);
  const payloadDigest=hex(await digest(JSON.stringify(draft.raw)));
  const result=await db.begin(async tx=>{
   const existing=await tx.unsafe(
    'select a.id,p.payload_sha256 from public.appointments a left join private.phms_v24_appointment_form_payloads p on p.appointment_id=a.id where a.id=$1::uuid and a.created_by=$2::uuid and a.family_person_id=$3::uuid',
    [id,actor.userId,person.familyPersonId]);
   if(existing.length){
    if(existing[0].payload_sha256!==payloadDigest)throw Error('idempotency_conflict');
    return {appointmentId:id,replayed:true};
   }
   const organization=await tx.unsafe(
    'select id,name,display_name from public.healthcare_organizations where id=$1::uuid and deleted_at is null limit 1',
    [draft.selection.organizationId]);
   if(organization.length!==1)throw Error('invalid_provider');
   let unit=null,clinician=null;
   if(draft.selection.unitId){
    const units=await tx.unsafe('select id,organization_id,name from public.healthcare_service_units where id=$1::uuid and deleted_at is null limit 1',[draft.selection.unitId]);
    if(units.length!==1||units[0].organization_id!==organization[0].id)throw Error('invalid_provider');
    unit=units[0];
   }
   if(draft.selection.clinicianId){
    const doctors=await tx.unsafe('select id,organization_id,service_unit_id,display_name from public.healthcare_clinicians where id=$1::uuid and deleted_at is null limit 1',[draft.selection.clinicianId]);
    if(doctors.length!==1||doctors[0].organization_id!==organization[0].id||
      (doctors[0].service_unit_id&&unit&&doctors[0].service_unit_id!==unit.id))throw Error('invalid_provider');
    clinician=doctors[0];
   }
   const d=draft.details;
   const appointmentAt=draft.time?draft.date+'T'+draft.time+':00+07:00':null;
   const status=draft.raw.scenario==='historical'?'completed':'planned';
   const recordedEnd=status==='completed'?(appointmentAt||draft.date+'T12:00:00+07:00'):null;
   const values={
    id,family_id:person.familyId,family_person_id:person.familyPersonId,
    person_id:person.personId,title:draft.purpose,
    hospital_name:String(organization[0].display_name||organization[0].name),
    department:unit?.name||text(draft.raw.department,160),doctor_name:clinician?.display_name||'',
    organization_id:organization[0].id,service_unit_id:unit?.id||null,clinician_id:clinician?.id||null,
    created_by:actor.userId,appointment_type:draft.raw.scenario==='walk_in'?'walk_in':'other',
    visit_mode:draft.raw.scenario==='walk_in'?'walk_in':draft.raw.scenario==='booked'?'booked':'unspecified',
    visit_time_known:draft.raw.time_known,appointment_at:appointmentAt,
    planned_visit_date:draft.date,status,completed_at:recordedEnd,
    external_reference:'liff-v24:'+body.operationKey,
    note:text(draft.raw.additional_note,4000),preparation_notes:draft.checklist.map(x=>x.title.trim()).join('\n'),
    coverage_type:text(d.coverage_type,200),hospital_hn:text(d.hospital_hn,120),
    hospital_vn:text(d.hospital_vn,120),location_detail:text(d.location_detail,500),
    contact_phone:text(d.contact_phone,500),care_topic:text(d.care_topic,500),
    arrival_lead_minutes:draft.lead,
    visit_outcome_notes:status==='completed'?text(d.visit_outcome_notes,1500):null,
    diagnosis_summary:status==='completed'?text(d.diagnosis_summary,1500):null,
    treatment_summary:status==='completed'?text(d.treatment_summary,1500):null,
    test_results_summary:status==='completed'?text(d.test_results_summary,1500):null,
    medication_plan_notes:status==='completed'?text(d.medication_plan_notes,1500):null,
    next_steps:status==='completed'?text(d.next_steps,1500):null,
    walk_in_reason:draft.raw.scenario==='walk_in'?text(d.walk_in_reason,100)||null:null
   };
   const keys=Object.keys(values),args=keys.map(k=>values[k]);
   await tx.unsafe('insert into public.appointments ('+keys.join(',')+') values ('+keys.map((_,i)=>'$'+(i+1)).join(',')+')',args);
   for(let i=0;i<draft.tests.length;i++){
    await tx.unsafe('insert into public.appointment_procedure_items (appointment_id,procedure_code,procedure_name_th,procedure_category,sequence_no,status,created_by) values ($1::uuid,$2,$3,$4,$5,$6,$7::uuid)',[
      id,'CUSTOM',draft.tests[i].trim(),'other',i+1,status==='completed'?'NEEDS_REVIEW':'PLANNED',actor.userId]);
   }
   await tx.unsafe('insert into private.phms_v24_appointment_form_payloads(appointment_id,actor_id,payload,payload_sha256) values ($1::uuid,$2::uuid,$3::jsonb,$4)',[id,actor.userId,JSON.stringify(draft.raw),payloadDigest]);
   const persisted=await tx.unsafe('select id from public.appointments where id=$1::uuid and family_person_id=$2::uuid and deleted_at is null',[id,person.familyPersonId]);
   if(persisted.length!==1)throw Error('not_persisted');
   return {appointmentId:id,replayed:false};
  });
  return cors(reply(200,{ok:true,...result}));
 }catch(error){
  const code=String(error?.message||'');
  if(['invalid_provider','idempotency_conflict'].includes(code))
   return cors(reply(409,{ok:false,error:code}));
  console.error('phms_v24_save_failed',String(error?.code||'unknown'));
  return cors(reply(503,{ok:false,error:'save_unavailable'}));
 }
});
