export type Metric = 'BP'|'HR'|'SpO2'|'DTX'|'Temp'|'Weight'|'Height'|'RR';
export type Reading = {id:string; type:Metric; value?:number; systolic?:number; diastolic?:number; unit:string; original_value?:number; original_unit?:string; measured_at:string; round:number; device:string; context:Record<string,string>; unusual_confirmed?:boolean};
export const METRICS:Record<Metric,{label:string;unit:string;min:number;max:number;decimals:number}>={
 BP:{label:'ความดัน',unit:'mmHg',min:1,max:400,decimals:0}, HR:{label:'ชีพจร',unit:'/min',min:1,max:400,decimals:0},
 SpO2:{label:'ออกซิเจนปลายนิ้ว',unit:'%',min:1,max:100,decimals:0}, DTX:{label:'น้ำตาลปลายนิ้ว',unit:'mg/dL',min:1,max:2000,decimals:2},
 Temp:{label:'อุณหภูมิ',unit:'°C',min:10,max:60,decimals:2}, Weight:{label:'น้ำหนัก',unit:'kg',min:.1,max:700,decimals:3},
 Height:{label:'ส่วนสูง',unit:'cm',min:10,max:300,decimals:2}, RR:{label:'อัตราหายใจ',unit:'/min',min:1,max:200,decimals:0}
};
export const PRESETS:Record<string,Metric[]>={daily:['BP','HR'],oximeter:['SpO2','HR'],diabetes:['DTX','BP'],full:['BP','HR','SpO2','Temp','DTX','Weight']};
export const CONTEXT:Partial<Record<Metric,Record<string,string[]>>>={
 BP:{activity:['พัก','หลังออกแรง'],posture:['นั่ง','นอน','ยืน'],arm:['ซ้าย','ขวา']},HR:{activity:['พัก','หลังออกแรง']},RR:{activity:['พัก','หลังออกแรง']},
 SpO2:{activity:['พัก','หลังออกแรง']},DTX:{meal:['ก่อนอาหาร','หลังอาหาร 1 ชั่วโมง','หลังอาหาร 2 ชั่วโมง','ก่อนนอน','สุ่ม']},
 Temp:{site:['รักแร้','ปาก','หู','หน้าผาก','ทวารหนัก']}
};
export function numberInput(raw:string):number {
 const s=raw.trim(); if(!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(s))throw Error('กรอกเฉพาะตัวเลข เช่น 72 หรือ 36.5');
 const n=Number(s);if(!Number.isFinite(n))throw Error('ตัวเลขไม่ถูกต้อง');return n;
}
export function convert(type:Metric,n:number,unit:string):number {
 if(!Number.isFinite(n))throw Error('ตัวเลขไม่ถูกต้อง');
 const allowed:Partial<Record<Metric,Record<string,(x:number)=>number>>>={DTX:{'mmol/L':x=>x*18.0182},Temp:{'°F':x=>(x-32)*5/9},Weight:{lb:x=>x*.45359237},Height:{in:x=>x*2.54}};
 if(unit===METRICS[type].unit)return n;const f=allowed[type]?.[unit];if(!f)throw Error('หน่วยไม่ตรงประเภท');return f(n);
}
export function validateReading(r:Reading):string[] {
 const m=METRICS[r.type];if(!m)throw Error('ประเภทไม่ถูกต้อง');
 if(r.unit!==m.unit)throw Error('ต้องแปลงเป็นหน่วยมาตรฐานก่อน');
 if(!/^[0-9a-f-]{36}$/i.test(r.id))throw Error('รหัสค่าวัดไม่ถูกต้อง');
 if(!Number.isInteger(r.round)||r.round<1||r.round>3)throw Error('รอบต้องเป็น 1 ถึง 3');
 if(!['manual','bp_monitor','oximeter','glucose_meter','thermometer','scale','tape'].includes(r.device))throw Error('แหล่งข้อมูลไม่ถูกต้อง');
 if(!Number.isFinite(Date.parse(r.measured_at))||Date.parse(r.measured_at)>Date.now()+300000)throw Error('วันเวลาวัดไม่ถูกต้อง');
 for(const [key,v] of Object.entries(r.context)){
  if(key==='symptoms'){if(v.length>500)throw Error('อาการยาวเกิน 500 ตัวอักษร');continue;}
  if(!CONTEXT[r.type]?.[key]?.includes(v))throw Error('บริบทไม่ตรงประเภทค่าวัด');
 }
 const values=r.type==='BP'?[r.systolic,r.diastolic]:[r.value];
 for(const x of values){if(typeof x!=='number'||!Number.isFinite(x)||x<m.min||x>m.max)throw Error('ค่านอกช่วงรับข้อมูล ตรวจหน้าจอเครื่องและหน่วยอีกครั้ง');if(m.decimals===0&&!Number.isInteger(x))throw Error('ค่านี้ต้องเป็นจำนวนเต็ม');}
 if(r.type==='BP'&&r.systolic!<=r.diastolic!)return ['SYS ไม่สูงกว่า DIA กรุณาตรวจตัวเลขอีกครั้ง'];
 // Plausibility prompts only. These are deliberately not clinical alerts or diagnostic thresholds.
 const prompts:Partial<Record<Metric,[number,number]>>={HR:[30,220],RR:[5,80],Weight:[1,350],Height:[30,250],Temp:[30,45],DTX:[10,1000],SpO2:[50,100]};
 if(r.type==='BP'&&(r.systolic!<50||r.systolic!>300||r.diastolic!<20||r.diastolic!>200))return ['ตัวเลขต่างจากที่พบทั่วไป ยืนยันตามเครื่องวัดหรือแก้ไข'];
 const p=prompts[r.type];return p&&(r.value!<p[0]||r.value!>p[1])?['ตัวเลขต่างจากที่พบทั่วไป ยืนยันตามเครื่องวัดหรือแก้ไข']:[];
}
export function validateSession(readings:Reading[]):void {
 if(!readings.length||readings.length>30)throw Error('ต้องมีค่าวัด 1 ถึง 30 รายการ');
 const ids=new Set<string>(),events=new Set<string>();
 for(const r of readings){const warnings=validateReading(r);if(warnings.length&&!r.unusual_confirmed)throw Error('ต้องยืนยันค่าที่ต้องตรวจซ้ำ');
  if(ids.has(r.id))throw Error('รหัสค่าวัดซ้ำ');ids.add(r.id);
  const key=[r.type,r.device,r.round,r.measured_at].join('|');if(events.has(key))throw Error('ค่าวัดซ้ำในแหล่ง เวลา และรอบเดียวกัน');events.add(key);
 }
}
export function inputValue(r:Reading,raw:string,unit=r.unit,field:'value'|'systolic'|'diastolic'='value'):Reading {
 const n=numberInput(raw),v=convert(r.type,n,unit);return {...r,[field]:v,unit:METRICS[r.type].unit,...(field==='value'?{original_value:n,original_unit:unit}:{}),unusual_confirmed:false};
}
export function newReading(type:Metric,at:string,device='manual',round=1):Reading{return {id:crypto.randomUUID(),type,unit:METRICS[type].unit,measured_at:at,round,device,context:{}};}
export function labelReading(r:Reading){return METRICS[r.type].label+' '+(r.type==='BP'?r.systolic+'/'+r.diastolic:String(Number(r.value?.toFixed(3))))+' '+r.unit+' · รอบ '+r.round;}
// Unit constants: glucose factor 18.0182 follows the WHO-hosted Dominica
// Diabetes and Hypertension Management Manual (2011), conversion appendix.
// Fahrenheit, pound and inch factors follow NIST SP 811 Appendix B.8.
export function trendCard(points:any[],metric:Metric,days:number,back:string):any {
 const rows=points.filter(x=>x.measurement_type===metric).sort((a,b)=>Date.parse(a.measured_at)-Date.parse(b.measured_at));
 const series=metric==='BP'?['systolic','diastolic']:['value_numeric'];
 const groups=new Map<string,any[]>();for(const r of rows){const day=new Date(r.measured_at).toLocaleDateString('en-CA',{timeZone:'Asia/Bangkok'});groups.set(day,[...(groups.get(day)||[]),r]);}
 const data=[...groups].map(([day,rs])=>({day,...Object.fromEntries(series.map(k=>[k,rs.reduce((a,r)=>a+Number(r[k]),0)/rs.length]))}));
 const card=healthCard('📈 '+METRICS[metric].label+' '+days+' วัน',data.length?['ค่าเฉลี่ยรายวัน · '+METRICS[metric].unit,'จุดแต่ละสีเป็นชุดข้อมูล ไม่ใช่ระดับอันตราย']:['ยังไม่มีค่าวัดในช่วงนี้'],[],back);
 if(!data.length)return card;
 const min=Math.min(...data.flatMap(x=>series.map(k=>Number((x as any)[k])))),max=Math.max(...data.flatMap(x=>series.map(k=>Number((x as any)[k]))));
 const start=Date.parse(rows[0].measured_at),end=Date.parse(rows.at(-1).measured_at);
 const nodes:any[]=[{type:'text',text:max.toFixed(1),size:'14px',color:'#546175',position:'absolute',offsetTop:'0px',offsetStart:'0px'},{type:'text',text:min.toFixed(1),size:'14px',color:'#546175',position:'absolute',offsetBottom:'0px',offsetStart:'0px'}];
 for(const [si,key] of series.entries())for(const point of data){const at=Date.parse(point.day+'T12:00:00+07:00');const x=end>start?Math.max(0,Math.min(1,(at-start)/(end-start))):.5,y=(Number((point as any)[key])-min)/(max-min||1);nodes.push({type:'box',layout:'vertical',position:'absolute',offsetStart:(42+Math.round(x*190))+'px',offsetTop:(10+Math.round((1-y)*130))+'px',width:'5px',height:'5px',cornerRadius:'3px',backgroundColor:si?'#9F5B20':'#315E9A',contents:[]});}
 card.contents.body.contents.push({type:'box',layout:'vertical',height:'160px',contents:nodes},{type:'text',text:data[0].day+' → '+data.at(-1)!.day,size:'14px',wrap:true},...(metric==='BP'?[{type:'text',text:'น้ำเงิน SYS · น้ำตาล DIA',size:'16px',wrap:true}]:[]));return card;
}
export function healthCard(title:string,lines:string[],actions:{label:string;data:string}[],back='สุขภาพ'):any {
 const button=(label:string,data:string,back=false)=>({type:'box',layout:'vertical',height:back?'44px':'48px',justifyContent:'center',backgroundColor:'#E5F1EB',cornerRadius:'8px',paddingAll:'8px',action:{type:'postback',label,data,displayText:label},contents:[{type:'text',text:label,size:'18px',color:'#28553F',align:'center',wrap:true}]});
 const groups=[];for(let i=0;i<actions.length;i+=4)groups.push(actions.slice(i,i+4));if(!groups.length)groups.push([]);
 const bubbles=groups.map(group=>({type:'bubble',size:'kilo',header:{type:'box',layout:'vertical',paddingAll:'16px',backgroundColor:'#E5F1EB',contents:[{type:'text',text:title,size:'22px',weight:'bold',wrap:true,color:'#28553F'}]},body:{type:'box',layout:'vertical',paddingAll:'16px',spacing:'8px',contents:(lines.length?lines:['เลือกจากปุ่มด้านล่าง']).slice(0,7).map(text=>({type:'text',text:text||' ',size:'18px',wrap:true,color:'#263649'}))},footer:{type:'box',layout:'vertical',paddingAll:'12px',spacing:'8px',contents:[...group.map(a=>button(a.label,a.data)),button('↩️ กลับ',back,true)]}}));
 return {type:'flex',altText:title,contents:bubbles.length===1?bubbles[0]:{type:'carousel',contents:bubbles}};
}
