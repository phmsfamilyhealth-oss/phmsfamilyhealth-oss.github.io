import {scheduleDates} from "./non-daily-schedule.mjs";
/**
 * Constructs an idempotent, non-mutating Scheduled Dose proposal from a verified order.
 * No API/write side-effects. Backend must independently verify the actor and active
 * order and execute its existing transaction/RLS/audit protocol before persisting.
 */
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function planNonDailyScheduledDoses({order,regimen,doses,startDate,endDate}){
 if(!order||order.status!=="VERIFIED"||!order.verifiedAt||!uuid.test(order.id||"")||!uuid.test(order.personId||"")||!uuid.test(order.personMedicationId||"")||!uuid.test(regimen?.id||""))throw Error("VERIFIED_ORDER_REQUIRED");
 if(!Array.isArray(doses)||!doses.length)throw Error("DOSE_RULES_REQUIRED");
 if(!Array.isArray(doses)||doses.some(d=>!d.slotKey||!/^\d\d:\d\d$/.test(d.localTime||"")||!(Number(d.quantity)>0)||!d.unit))throw Error("INVALID_DOSE_RULE");
 const dates=scheduleDates({...regimen,orderVerified:true},startDate,endDate);
 const results=[];
 for(const date of dates){
  if(order.effectiveFrom && date<order.effectiveFrom.slice(0,10))continue;
  if(order.effectiveTo && date>order.effectiveTo.slice(0,10))continue;
  for(const d of doses){
   const key="medsched:"+order.id+":"+date+":"+d.slotKey+":"+d.localTime;
   results.push({person_id:order.personId,person_medication_id:order.personMedicationId,regimen_id:regimen.id,order_version_id:order.id,planned_date:date,slot_key:d.slotKey,planned_dose:d.quantity,planned_unit:d.unit,timezone:d.timezone,idempotency_key:key,requires_server_scheduled_at:true});
  }
 }
 if(new Set(results.map(x=>x.idempotency_key)).size!==results.length)throw Error("DUPLICATE_DOSE_RULE");
 return results;
}
