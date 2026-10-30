// Rescheduling is an explicit two-phase process; never mutate original appointment before confirmation.
export const RESCHEDULE_PHASES=Object.freeze({REQUESTED:'requested',CONTACT_PENDING:'contact_pending',CONFIRMED:'confirmed'});
export function validateRescheduleTransition({from,to,original,newDate,authorizedSource,confirmedByHospital}={}){
 if(!original?.id||authorizedSource?.id!==original.id)return {ok:false,error:'original_appointment_not_authorized'};
 if(!['requested','contact_pending','confirmed'].includes(to))return {ok:false,error:'invalid_reschedule_phase'};
 if(!((from==null&&to==='requested')||(from==='requested'&&to==='contact_pending')||(from==='contact_pending'&&to==='confirmed')))return {ok:false,error:'invalid_reschedule_transition'};
 if(to==='confirmed'&&(!confirmedByHospital||typeof newDate!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(newDate)))return {ok:false,error:'reschedule_confirmation_required'};
 return {ok:true,phase:to,keepOriginalUnchanged:true,createsLinkedAppointment:to==='confirmed',rescheduledFromAppointmentId:to==='confirmed'?original.id:null};
}
