// PHMS appointments are entered as Asia/Bangkok local civil time (UTC+07, no DST).
// Return a UTC ISO timestamp only after validating exact calendar day and clock.
export function resolveBangkokAppointmentTime(local){
 if(typeof local!=='string'||!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(local))return {ok:false,error:'invalid_local_datetime'};
 const d=new Date(local+':00+07:00');
 if(!Number.isFinite(d.valueOf())||new Date(d.valueOf()+7*3600000).toISOString().slice(0,16)!==local)
  return {ok:false,error:'invalid_local_datetime'};
 return {ok:true,appointment_at:d.toISOString()};
}
