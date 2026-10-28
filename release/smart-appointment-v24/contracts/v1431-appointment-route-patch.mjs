// Reviewed exact-route replacement candidate for Production v1431.
// Integration must inject a fully configured trusted handler into the webhook
// scope. No LIFF access without verification; legacy remains the default.
export const V1431_APPOINTMENT_ANCHOR="if(c==='เพิ่มนัด'||c==='เพิ่มนัด จากภาพรวม'){await state(u,k,id,'crud_add_appointment',{person_confirmed:true,origin:c==='เพิ่มนัด จากภาพรวม'?'person_overview':'appointments'});await replyAppointmentTypePicker(e.replyToken,u,k,id,t,await appointmentActivePersonName(u,k,id));continue}";
export function makeV1431AppointmentRouteReplacement(handlerName='phmsV24OwnerRoute'){
 if(handlerName!=='phmsV24OwnerRoute')throw Error('unknown_trusted_handler');
 // NEVER consume a LINE event without a verified signed-path outcome.
 // The injected handler returns handled:true only after it replies or preserves
 // legacy via a callback. The fallback below retains the original route text.
 return `if(c==='เพิ่มนัด'||c==='เพิ่มนัด จากภาพรวม'){
 let v24Handled=false;
 if(typeof ${handlerName}==='function'){
  try{const v24=await ${handlerName}(e);v24Handled=v24?.handled===true&&['liff','legacy','rejected'].includes(v24.mode)}catch{}
 }
 if(!v24Handled){await state(u,k,id,'crud_add_appointment',{person_confirmed:true,origin:c==='เพิ่มนัด จากภาพรวม'?'person_overview':'appointments'});await replyAppointmentTypePicker(e.replyToken,u,k,id,t,await appointmentActivePersonName(u,k,id));}
 continue
}`;
}
