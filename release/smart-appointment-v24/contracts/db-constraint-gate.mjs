// PHMS v2.4 pre-deployment, read-only canonical appointment database gate.
// Mirrors Production check constraints inspected 2026-10-27; not a substitute for DB CHECK.
export function verifyCanonicalVisitAgainstDatabase(visit){
 if(!visit||typeof visit!=='object')return {ok:false,error:'invalid_visit'};
 const {visit_mode,visit_time_known,planned_visit_date,status,appointment_at}=visit;
 if(status==='planned'&&!planned_visit_date&&!appointment_at)return {ok:false,error:'planned_date_required'};
 if(visit_time_known===false){
  if(appointment_at!==null||!planned_visit_date||!((visit_mode==='walk_in'&&['planned','scheduled'].includes(status))||(['walk_in','booked'].includes(visit_mode)&&status==='completed')))
   return {ok:false,error:'unknown_time_constraint'};
 }
 if(visit_time_known!==true&&visit_time_known!==false)return {ok:false,error:'time_flag_required'};
 return {ok:true};
}
