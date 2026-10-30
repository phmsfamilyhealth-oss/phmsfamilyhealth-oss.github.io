import {resolveBangkokAppointmentTime} from './bangkok-time.mjs';
// Production schema-aligned appointment row mapping. Server-only, never direct client INSERT.
// Actor/person/family must originate from verified identity + central permission resolver.
const allowedTypes=new Set(['new_case','follow_up','referral','investigation','procedure','walk_in','rescheduled','other','checkup','vaccination','medication_refill']);
const allowedModes=new Set(['booked','walk_in','unspecified']);
export function mapAppointmentInsert(command){
 const v=command?.canonicalVisit,d=command?.draft;
 if(!v||!d||!command.actorId||!command.subjectId||!command.personId||!command.familyId)return {ok:false,error:'missing_verified_context'};
 if(!allowedModes.has(v.visit_mode))return {ok:false,error:'invalid_visit_mode'};
 if(!allowedTypes.has(command.appointmentType))return {ok:false,error:'invalid_appointment_type'};
 if(v.visit_time_known!==true&&v.visit_time_known!==false)return {ok:false,error:'invalid_time'};
 if(v.visit_time_known===false&&(v.appointment_at!==null||!v.planned_visit_date||!((v.visit_mode==='walk_in'&&['planned','scheduled'].includes(v.status))||(['booked','walk_in'].includes(v.visit_mode)&&v.status==='completed'))))return {ok:false,error:'invalid_date_only'};
 let appointmentAt=null;
 if(v.visit_time_known===true){
  if(v.appointment_at){ return {ok:false,error:'untrusted_precomputed_timestamp'}; }
  else { const resolved=resolveBangkokAppointmentTime(v.local_appointment_datetime);if(!resolved.ok)return {ok:false,error:'timestamp_not_resolved'};appointmentAt=resolved.appointment_at; }
 }
 if(d.preparation_tasks!==undefined&&(!Array.isArray(d.preparation_tasks)||d.preparation_tasks.length>20||d.preparation_tasks.some(t=>!t||typeof t.title!=='string'||!t.title.trim()||t.title.length>160)))return {ok:false,error:'invalid_checklist'};
 if(d.preparation_notes!=null&&typeof d.preparation_notes!=='string')return {ok:false,error:'invalid_preparation_notes'};
 if(typeof d.preparation_notes==='string'&&d.preparation_notes.length>4000)return {ok:false,error:'appointment_text_too_long'};
 if((d.preparation_tasks||[]).length>0&&d.preparation_notes?.trim())return {ok:false,error:'checklist_dual_source_not_supported'};
 const extras=d.extended_details??{};if(typeof extras!=='object'||extras===null||Array.isArray(extras)||Object.keys(extras).some(k=>!Object.hasOwn({"hospital_hn":80,"hospital_vn":80,"location_detail":240,"contact_phone":40,"care_topic":500,"coverage_type":100,"arrival_lead_minutes":4,"visit_outcome_notes":1000,"diagnosis_summary":1000,"treatment_summary":1000,"test_results_summary":1000,"medication_plan_notes":1000,"next_steps":1000,"walk_in_reason":500},k)))return {ok:false,error:'invalid_extended_details'};
 if(extras.arrival_lead_minutes!==undefined&&(!/^\\d+$/.test(String(extras.arrival_lead_minutes))||Number(extras.arrival_lead_minutes)>1440))return {ok:false,error:'invalid_arrival_lead'};
 const limits=[['hospital_name',160],['department',160],['doctor_name',160],['title',80],['note',1000]];
 if(limits.some(([key,max])=>typeof d[key]==='string'&&d[key].length>max))return {ok:false,error:'appointment_text_too_long'};
 if((d.preparation_tasks||[]).some(t=>typeof t.instruction==='string'&&t.instruction.length>1000))return {ok:false,error:'checklist_instruction_too_long'};
 const row={family_id:command.familyId,family_person_id:command.subjectId,person_id:command.personId,created_by:command.actorId,
  preparation_tasks:(d.preparation_tasks||[]).map(t=>({title:t.title.trim(),instruction:typeof t.instruction==='string'?t.instruction:null})),
  hospital_name:d.hospital_name||null,department:d.department||null,doctor_name:d.doctor_name||null,
  ...Object.fromEntries(Object.entries(extras).map(([k,v])=>[k,k==='arrival_lead_minutes'?Number(v):(typeof v==='string'?v.trim():v)])),
  title:d.title||null,note:d.note||null,preparation_notes:d.preparation_notes?.trim()||null,
  appointment_at:appointmentAt,planned_visit_date:v.planned_visit_date,
  visit_time_known:v.visit_time_known,visit_mode:v.visit_mode,status:v.status,appointment_type:command.appointmentType};
 if(!row.appointment_type)return {ok:false,error:'appointment_type_required'};
 return {ok:true,row};
}
