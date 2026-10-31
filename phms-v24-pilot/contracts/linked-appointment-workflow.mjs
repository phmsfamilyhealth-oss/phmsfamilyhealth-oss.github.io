// Security-sensitive UI handoff checks. The PHMS LINE backend MUST authorize each request again.
// A "prior appointment" for follow-up is NOT necessarily the visit receiving medicines/expenses.
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export function historicalVisitDate(item){
 const raw=String(item?.planned_visit_date||item?.appointment_at||'').slice(0,10);
 const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
 if(!match)return '';
 const y=Number(match[1]),m=Number(match[2]),d=Number(match[3]);
 const date=new Date(Date.UTC(y,m-1,d));
 return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d?raw:'';
}
export function isEligibleSavedVisit(item,today){
 const date=historicalVisitDate(item);
 return uuid.test(String(item?.id||''))&&!!date&&/^\d{4}-\d{2}-\d{2}$/.test(today)&&date<=today;
}
export function canHandoffSavedVisit(item,{memberId,sourceMemberId,formDate='',today}={}){
 return uuid.test(String(memberId||''))&&memberId===sourceMemberId&&
 isEligibleSavedVisit(item,today)&&(!formDate||historicalVisitDate(item)===formDate);
}
export function existingPHMSLineCommand(appointmentId,resource){
 if(!uuid.test(String(appointmentId||'')))throw new Error('invalid_appointment_id');
 if(resource!=='medication'&&resource!=='finance')throw new Error('invalid_resource');
 return (resource==='medication'?'เพิ่มยาจากนัด ':'ค่าใช้จ่ายนัด ')+appointmentId.slice(0,12);
}
