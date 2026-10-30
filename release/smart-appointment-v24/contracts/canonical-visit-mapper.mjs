// PHMS v2.4: canonical date/time mapping prior to server-verified atomic persistence.
// This module is pure and NOT deployed. It mirrors the known database CHECK for date-only walk-ins.
const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
const validTime=t=>typeof t==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(t);
export function canonicalizeVisit(draft){
 if(!draft||!validDate(draft.date))return {ok:false,error:'invalid_date'};
 const {scenario,time_known,time}=draft;
 if(time_known!==true&&time_known!==false)return {ok:false,error:'invalid_time_flag'};
 if(time_known===false){
   // Candidate schema v2.4 allows completed historical visits with date and no invented time.
   if(scenario==='historical')return {ok:true,visit:{visit_mode:'booked',visit_time_known:false,planned_visit_date:draft.date,appointment_at:null,status:'completed'}};
   if(scenario!=='walk_in')return {ok:false,error:'time_required_for_scheduled_visit'};
   return {ok:true,visit:{visit_mode:'walk_in',visit_time_known:false,planned_visit_date:draft.date,appointment_at:null,status:'planned'}};
 }
 if(!validTime(time))return {ok:false,error:'invalid_time'};
 if(scenario!=='booked'&&scenario!=='walk_in'&&scenario!=='historical')return {ok:false,error:'invalid_scenario'};
 // Local wall-clock is intentionally kept unconverted; backend must interpret with Asia/Bangkok TZ.
 return {ok:true,visit:{visit_mode:scenario==='walk_in'?'walk_in':'booked',visit_time_known:true,planned_visit_date:draft.date,local_appointment_datetime:draft.date+'T'+time,status:scenario==='historical'?'completed':'planned'}};
}
