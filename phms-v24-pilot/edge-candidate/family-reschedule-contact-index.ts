// PHMS v2.4 family-scoped contact directory. Separate from the fail-closed appointment confirm.
// Only LINE-verified owners/admins can publish edits for their own family. No global verified master writes.
import {createClient} from 'npm:@supabase/supabase-js@2';
import postgres from 'npm:postgres@3.4.7';
import {makePhmsLineIdentityAdapter} from '../contracts/phms-line-identity-adapter.mjs';
import {makePhmsAuthorityAdapter} from '../contracts/phms-private-authority.mjs';
import {makePhmsPersonResolver} from '../contracts/phms-person-resolver.mjs';
import {validateFamilyRescheduleContact} from '../contracts/family-reschedule-contact-schema.mjs';

const origin='https://phmsfamilyhealth-oss.github.io';
const env=name=>(Deno.env.get(name)||'').trim();
const serviceKey=()=>{if(env('SUPABASE_SERVICE_ROLE_KEY'))return env('SUPABASE_SERVICE_ROLE_KEY');try{return JSON.parse(env('SUPABASE_SECRET_KEYS'))?.default||''}catch{return ''}};
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const reply=(error,status)=>new Response(JSON.stringify({ok:false,error}),{status,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}});
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}});
const format=row=>row?{
 daysMode:row.days_mode,weekdays:row.weekdays||[],hoursMode:row.hours_mode||'',
 startTime:row.start_time||'',endTime:row.end_time||'',phones:row.phones||[],
 noticeDays:row.notice_days,noticeUnit:row.notice_unit||'calendar',instructions:row.instructions||'',
 updatedAt:row.updated_at
}:null;
let verifyLineIdentity=null,resolvePerson=null,centralCanAccess=null,isReleaseEnabled=null,sql=null;
if(env('SUPABASE_URL')&&env('SUPABASE_DB_URL')&&serviceKey()){
 const supabase=createClient(env('SUPABASE_URL'),serviceKey(),{auth:{persistSession:false,autoRefreshToken:false}});
 sql=postgres(env('SUPABASE_DB_URL'),{max:2,prepare:false,connect_timeout:5,idle_timeout:10});
 const query=async(q,args)=>({rows:await sql.unsafe(q,args)});
 const authority=makePhmsAuthorityAdapter(query);
 centralCanAccess=authority.centralCanAccess;isReleaseEnabled=authority.isReleaseEnabled;
 verifyLineIdentity=makePhmsLineIdentityAdapter({supabase,channelId:'2011619364',fetchImpl:fetch});
 resolvePerson=makePhmsPersonResolver({supabase,centralCanAccess});
}
Deno.serve(async req=>{
 const requestedOrigin=req.headers.get('origin');
 if(requestedOrigin&&requestedOrigin!==origin)return reply('origin_not_allowed',403);
 const cors=res=>{
  if(!requestedOrigin)return res;
  const headers=new Headers(res.headers);headers.set('access-control-allow-origin',origin);headers.set('vary','Origin');
  return new Response(res.body,{status:res.status,headers});
 };
 if(req.method==='OPTIONS')return requestedOrigin===origin
  ?new Response(null,{status:204,headers:{'access-control-allow-origin':origin,'access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'authorization, content-type','access-control-max-age':'300','vary':'Origin'}})
  :reply('origin_not_allowed',403);
 if(req.method!=='POST')return cors(reply('method_not_allowed',405));
 if(!/^application\/json(?:\s*;|\s*$)/i.test(req.headers.get('content-type')||''))return cors(reply('invalid_request',400));
 if(!sql||!verifyLineIdentity||!resolvePerson)return cors(reply('feature_not_released',404));
 const token=/^Bearer ([^\s]+)$/.exec(req.headers.get('authorization')||'')?.[1];
 if(!token)return cors(reply('unauthenticated',401));
 try{
  const body=await req.text();
  if(new TextEncoder().encode(body).length>12000)return cors(reply('invalid_request',400));
  const raw=JSON.parse(body);
  if(!['get','put'].includes(raw?.action)||!uuid(raw.selectedPersonCode)||!uuid(raw.organizationId)||(raw.unitId&&!uuid(raw.unitId)))
   return cors(reply('invalid_request',400));
  const actor=await verifyLineIdentity(token);
  if(!actor?.userId)return cors(reply('unauthenticated',401));
  if(await isReleaseEnabled(actor.userId)!==true)return cors(reply('feature_not_released',404));
  const person=await resolvePerson(actor.userId,raw.selectedPersonCode);
  if(!person?.familyPersonId||!person?.familyId)return cors(reply('person_not_found',404));
  if(await centralCanAccess(actor.userId,person.familyPersonId,'appointments','view')!==true)return cors(reply('permission_denied',403));
  const o=await sql.unsafe('select id from public.healthcare_organizations where id=$1::uuid and is_verified=true and deleted_at is null limit 1',[raw.organizationId]);
  if(o.length!==1)return cors(reply('provider_not_verified',404));
  if(raw.unitId){
   const u=await sql.unsafe('select id from public.healthcare_service_units where id=$1::uuid and organization_id=$2::uuid and is_verified=true and deleted_at is null limit 1',[raw.unitId,raw.organizationId]);
   if(u.length!==1)return cors(reply('provider_not_verified',404));
  }
  const role=await sql.unsafe("select 1 from public.family_role_assignments where family_id=$1::uuid and user_id=$2::uuid and role in ('owner','admin') and status='active' limit 1",[person.familyId,actor.userId]);
  const canWrite=role.length===1;
  const args=[person.familyId,raw.organizationId,raw.unitId||null];
  if(raw.action==='get'){
   const rows=await sql.unsafe('select days_mode,weekdays,hours_mode,start_time,end_time,phones,notice_days,notice_unit,instructions,updated_at from private.phms_family_reschedule_contacts where family_id=$1::uuid and organization_id=$2::uuid and service_unit_id is not distinct from $3::uuid limit 1',args);
   return cors(json({ok:true,contact:format(rows[0]),canWrite}));
  }
  if(!canWrite)return cors(reply('permission_denied',403));
  const validated=validateFamilyRescheduleContact(raw.contact);
  if(!validated.ok)return cors(reply(validated.error,400));
  const d=validated.value;
  const saved=await sql.begin(async tx=>{
   const before=await tx.unsafe('select row_to_json(x) as snap from private.phms_family_reschedule_contacts x where family_id=$1::uuid and organization_id=$2::uuid and service_unit_id is not distinct from $3::uuid for update',args);
   const params=[...args,d.daysMode,JSON.stringify(d.weekdays),d.hoursMode,d.startTime,d.endTime,JSON.stringify(d.phones),d.noticeDays,d.noticeUnit,d.instructions,actor.userId];
   const result=await tx.unsafe(`insert into private.phms_family_reschedule_contacts
    (family_id,organization_id,service_unit_id,days_mode,weekdays,hours_mode,start_time,end_time,phones,notice_days,notice_unit,instructions,created_by,updated_by)
    values ($1::uuid,$2::uuid,$3::uuid,$4::text,array(select jsonb_array_elements_text($5::jsonb)),$6::text,$7::text,$8::text,
    array(select jsonb_array_elements_text($9::jsonb)),$10::int,$11::text,$12::text,$13::uuid,$13::uuid)
    on conflict(family_id,organization_id,service_unit_id) do update set
    days_mode=excluded.days_mode,weekdays=excluded.weekdays,hours_mode=excluded.hours_mode,
    start_time=excluded.start_time,end_time=excluded.end_time,phones=excluded.phones,
    notice_days=excluded.notice_days,notice_unit=excluded.notice_unit,instructions=excluded.instructions,
    updated_by=excluded.updated_by,updated_at=now()
    returning id,days_mode,weekdays,hours_mode,start_time,end_time,phones,notice_days,notice_unit,instructions,updated_at`,params);
   const record=result[0];
   if(!record)throw Error('save_failed');
   await tx.unsafe('insert into private.phms_family_reschedule_contact_audit(contact_id,family_id,actor_user_id,prior_record,current_record) values($1::uuid,$2::uuid,$3::uuid,$4::jsonb,$5::jsonb)',[record.id,person.familyId,actor.userId,before[0]?.snap?JSON.stringify(before[0].snap):null,JSON.stringify(record)]);
   return record;
  });
  return cors(json({ok:true,contact:format(saved),canWrite:true,scope:'family_only'}));
 }catch{return cors(reply('contact_unavailable',503));}
});
