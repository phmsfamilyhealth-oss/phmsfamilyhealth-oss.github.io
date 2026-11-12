// PHMS family-scoped reusable reschedule contacts. No user identity or family IDs come from this payload.
const DAY_KEYS=['mon','tue','wed','thu','fri','sat','sun'];
const HOUR_MODES=['office','morning','afternoon','morning-afternoon','custom'];
const CLOCK=/^(?:[01]\d|2[0-3]):(?:00|30)$/;
const clockMinutes=s=>{if(!CLOCK.test(s||''))return NaN;const [h,m]=s.split(':').map(Number);return h*60+m;};
const safe=x=>typeof x==='string'?x.normalize('NFKC').trim().replace(/[ \t]+/g,' '):'';
export function validateFamilyRescheduleContact(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return {ok:false,error:'invalid_contact'};
 const daysMode=raw.daysMode;
 if(!['government','specific'].includes(daysMode))return {ok:false,error:'invalid_days'};
 const weekdays=daysMode==='government'?[]:raw.weekdays;
 if(!Array.isArray(weekdays)||weekdays.length>(daysMode==='government'?0:7)||new Set(weekdays).size!==weekdays.length||
   weekdays.some(k=>!DAY_KEYS.includes(k))||(daysMode==='specific'&&!weekdays.length))return {ok:false,error:'invalid_weekdays'};
 const hoursMode=raw.hoursMode||null;
 if(hoursMode!==null&&!HOUR_MODES.includes(hoursMode))return {ok:false,error:'invalid_hours'};
 const startTime=hoursMode==='custom'?safe(raw.startTime):null;
 const endTime=hoursMode==='custom'?safe(raw.endTime):null;
 if(hoursMode==='custom'&&(!CLOCK.test(startTime)||!CLOCK.test(endTime)||clockMinutes(endTime)-clockMinutes(startTime)<30))
   return {ok:false,error:'invalid_time_range'};
 if(!Array.isArray(raw.phones)||raw.phones.length>12)return {ok:false,error:'invalid_phones'};
 const phones=raw.phones.map(safe);
 if(phones.some(p=>!p||p.length>120||/[\r\n]/.test(p))||phones.join('\n').length>500||
   new Set(phones.map(x=>x.toLocaleLowerCase('th-TH'))).size!==phones.length)return {ok:false,error:'invalid_phones'};
 const noticeDays=raw.noticeDays==null||raw.noticeDays===''?null:Number(raw.noticeDays);
 if(noticeDays!==null&&![1,3,5,7].includes(noticeDays))return {ok:false,error:'invalid_notice'};
 const noticeUnit=raw.noticeUnit==='working'?'working':raw.noticeUnit==='calendar'||raw.noticeUnit==null?'calendar':null;
 if(noticeUnit===null)return {ok:false,error:'invalid_notice_unit'};
 const instructions=safe(raw.instructions||'');
 if(instructions.length>600)return {ok:false,error:'invalid_instructions'};
 return {ok:true,value:{daysMode,weekdays,hoursMode,startTime,endTime,phones,noticeDays,noticeUnit,instructions}};
}
