/** Pure non-daily schedule planning. Requires verified prescriber instructions. No database writes. */
const days=["sun","mon","tue","wed","thu","fri","sat"];
export function scheduleDates(rule,start,end){
 if(!rule||rule.orderVerified!==true)throw Error("ORDER_UNVERIFIED");
 const s=new Date(start+"T12:00:00Z"),e=new Date(end+"T12:00:00Z");
 if(Number.isNaN(+s)||Number.isNaN(+e)||e<s||(+e - +s)/86400000>366)throw Error("INVALID_RANGE");
 const mode=rule.frequency;const selected=new Set(rule.weekdays||[]);
 if(["weekly","selected_weekdays"].includes(mode)&&(!selected.size||[...selected].some(d=>!days.includes(d))))throw Error("WEEKDAY_REQUIRED");
 if(["every_n_days","every_n_weeks"].includes(mode)&&(!Number.isSafeInteger(rule.interval)||rule.interval<1))throw Error("INTERVAL_REQUIRED");
 if(["every_n_days","every_n_weeks","monthly"].includes(mode)&&(!rule.anchorDate||Number.isNaN(+new Date(rule.anchorDate+"T12:00:00Z"))))throw Error("ANCHOR_REQUIRED");
 const anchor=rule.anchorDate?new Date(rule.anchorDate+"T12:00:00Z"):null;
 const result=[];
 for(let d=new Date(s);d<=e;d.setUTCDate(d.getUTCDate()+1)){
  let ok=false;const day=days[d.getUTCDay()];
  if(mode==="daily")ok=true;
  else if(mode==="weekly"||mode==="selected_weekdays")ok=selected.has(day);
  else if(mode==="every_n_days"||mode==="every_n_weeks"){
   const offset=Math.round((d-anchor)/86400000),step=rule.interval*(mode==="every_n_weeks"?7:1);
   ok=offset>=0&&offset%step===0;
  }else if(mode==="monthly"){
   const months=(d.getUTCFullYear()-anchor.getUTCFullYear())*12+d.getUTCMonth()-anchor.getUTCMonth();
   ok=months>=0&&d.getUTCDate()===anchor.getUTCDate();
  }else if(["prn","other"].includes(mode))ok=false;
  else throw Error("UNKNOWN_FREQUENCY");
  if(ok)result.push(d.toISOString().slice(0,10));
 }
 return result;
}
export function missedOnlyScheduled(scheduledDates, administeredDates,asOf){const done=new Set(administeredDates);return scheduledDates.filter(d=>d<asOf&&!done.has(d))}
