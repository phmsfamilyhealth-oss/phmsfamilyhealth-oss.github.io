import {resolveBangkokAppointmentTime} from './bangkok-time.mjs';
// Production schema-aligned appointment row mapping. Server-only, never direct client INSERT.
// Actor/person/family must originate from verified identity + central permission resolver.
export function mapAppointmentInsert(command){
 const v=command?.canonicalVisit,d=command?.draft;
 if(!v||!d||!command.actorId||!command.subjectId||!command.personId||!command.familyId)return {ok:false,error:'missing_verified_context'};
 if(v.visit_time_known!==true&&v.visit_time_known!==false)return {ok:false,error:'invalid_time'};
 if(v.visit_time_known===false&&(v.visit_mode!=='walk_in'||v.appointment_at!==null||!v.planned_visit_date))return {ok:false,error:'invalid_date_only'};
 let appointmentAt=null;
 if(v.visit_time_known===true){
  if(v.appointment_at){ if(typeof v.appointment_at!=='string'||!/^\\d{4}-\\d{2}-\\d{2}T/.test(v.appointment_at)||!Number.isFinite(Date.parse(v.appointment_at)))return {ok:false,error:'invalid_timestamp'}; appointmentAt=v.appointment_at; }
  else { const resolved=resolveBangkokAppointmentTime(v.local_appointment_datetime);if(!resolved.ok)return {ok:false,error:'timestamp_not_resolved'};appointmentAt=resolved.appointment_at; }
 }
 const row={family_id:command.familyId,family_person_id:command.subjectId,person_id:command.personId,created_by:command.actorId,
  hospital_name:d.hospital_name||null,department:d.department||null,doctor_name:d.doctor_name||null,
  note:d.note||null,preparation_notes:(d.preparation_tasks||[]).map(x=>x.title).join('\n')||null,
  appointment_at:appointmentAt,planned_visit_date:v.planned_visit_date,
  visit_time_known:v.visit_time_known,visit_mode:v.visit_mode,status:v.status,appointment_type:command.appointmentType};
 if(!row.appointment_type)return {ok:false,error:'appointment_type_required'};
 return {ok:true,row};
}
