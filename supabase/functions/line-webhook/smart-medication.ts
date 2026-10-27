/* PHMS v2.3 Smart medication intake. Pure normalization shared by both entry modes. */
export const MED_FIELDS = [
 ['generic_name','ชื่อสามัญ'],['brand_name','ชื่อการค้า'],['strength_value','ความแรงตัวเลข'],
 ['strength_unit','หน่วยความแรง'],['dosage_form','รูปแบบยา'],['dose_value','จำนวนต่อครั้ง'],
 ['dose_unit','หน่วยต่อครั้ง'],['frequency','ความถี่'],['weekdays','วันในสัปดาห์'],
 ['time','เวลา'],['instructions','วิธีใช้'],['meal_relation','สัมพันธ์อาหาร'],
 ['route','ช่องทางให้ยา'],['prn_condition','อาการที่ให้ใช้ยา'],['warnings','คำเตือน'],['start_date','เริ่มใช้'],['notes','หมายเหตุ'],['administration_site','บริเวณใช้ยา']
] as const;
export type MedicationDraft = Record<string, any>;
const aliases:Record<string,string> = Object.fromEntries(MED_FIELDS.map(([k,v])=>[v,k]));
Object.assign(aliases,{'ชื่อยา':'generic_name','ชื่อสามัญยา':'generic_name','ความแรง':'strength','ครั้งละ':'dose','ความสัมพันธ์กับอาหาร':'meal_relation'});
const forms:Record<string,string>={'เม็ด':'tablet','แคปซูล':'capsule','ยาน้ำ':'liquid','ยาหยอดตา':'eye drops','หยอดตา':'eye drops','ครีม':'cream','ยาฉีด':'injection'};
const units:Record<string,string>={'มก':'mg','มก.':'mg','มิลลิกรัม':'mg','ไมโครกรัม':'mcg','ug':'mcg','µg':'mcg','ml':'mL','มล':'mL','มล.':'mL','iu':'IU','%':'%'};
const meals:Record<string,string>={'ก่อนอาหาร':'before_meal','หลังอาหาร':'after_meal','พร้อมอาหาร':'with_meal','ท้องว่าง':'empty_stomach','ไม่สัมพันธ์กับอาหาร':'independent','ไม่เกี่ยวข้อง':'not_applicable'};
const days=['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
export const MED_OPTIONS:Record<string,string[]>={
 generic_name:['Gabapentin','Ergocalciferol (Vitamin D2)','Paracetamol'],
 strength_unit:['mg','mcg','g','IU','%','mg/mL'],dosage_form:['เม็ด','แคปซูล','ยาน้ำ','ยาหยอดตา','ครีม','ยาฉีด'],
 dose_value:['0.5','1','2'],dose_unit:['เม็ด','แคปซูล','mL','หยด','ครั้งพ่น','ยูนิต'],
 frequency:['วันละ 1 ครั้ง','วันละ 2 ครั้ง','วันละ 3 ครั้ง','ทุก 8 ชั่วโมง','ทุกวันศุกร์','ทุก 2 วัน','ทุก 2 สัปดาห์','ตามอาการ'],
 weekdays:['จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์','อาทิตย์','ไม่เกี่ยวข้อง'],
 time:['เช้า','กลางวัน','เย็น','ก่อนนอน','08:00','20:00'],
 route:['รับประทาน','หยอดตา','ทาผิวหนัง','พ่นจมูก','สูดพ่น','ฉีดใต้ผิวหนัง','ฉีดเข้ากล้าม','ฉีดเข้าเส้นเลือด'],instructions:['รับประทานตามฉลาก','หยอดตาตามฉลาก','ทาตามฉลาก'],meal_relation:Object.keys(meals),administration_site:['ตาซ้าย','ตาขวา','ตาทั้งสองข้าง'],
 brand_name:['ไม่ทราบ','ไม่มี'],warnings:['ไม่ทราบ','ไม่มี'],notes:['ไม่มี']
};
export function medicationTemplate():string {return [
 'ตัวอย่างเท่านั้น — แก้ข้อมูลตามฉลากยาจริงก่อนส่ง',
 'ชื่อสามัญ: Gabapentin','ชื่อการค้า: ไม่ทราบ','ความแรงตัวเลข: 100','หน่วยความแรง: mg',
 'รูปแบบยา: แคปซูล','จำนวนต่อครั้ง: 1','หน่วยต่อครั้ง: แคปซูล','ความถี่: วันละ 1 ครั้ง',
 'วันในสัปดาห์: ไม่เกี่ยวข้อง','เวลา: ก่อนนอน','วิธีใช้: รับประทานตามฉลากยา',
 'สัมพันธ์อาหาร: ไม่สัมพันธ์กับอาหาร','คำเตือน: ตรวจสอบจากฉลากยาจริง','เริ่มใช้: ระบุ YYYY-MM-DD',
 'หมายเหตุ: ตัวอย่างเท่านั้น'
].join('\n')}
export function medicationFieldsFromText(raw:string):Record<string,string>{
 const values:Record<string,string>={};
 for(const line of raw.replace(/\\n/g,'\n').split(/\r?\n/)){
  const m=line.trim().match(/^([^:：=]+)\s*[:：=]\s*(.*)$/);if(!m)continue;
  const key=aliases[m[1].trim()];if(key){if(values[key]!==undefined&&values[key]!==m[2].trim())values._ambiguities=(values._ambiguities||'')+' '+m[1].trim();values[key]=m[2].trim()}
 }
 return values;
}
function list(v:any):string[]{return String(v||'').split(/[,/、]|\s+และ\s+/).map(x=>x.trim()).filter(Boolean)}
export function normalizeMedication(values:Record<string,any>):MedicationDraft{
 const d:MedicationDraft={schema_version:'phms.medication.draft.v1',status:'regular',input_values:Object.fromEntries(Object.entries(values).filter(([,v])=>String(v??'').trim()!=='').sort(([a],[b])=>a.localeCompare(b)))};
 const clean=(v:any)=>{const s=String(v??'').trim();return /^(?:-|—|ไม่ทราบ|ไม่มี|ไม่เกี่ยวข้อง)$/.test(s)?'':s};
 for(const k of ['generic_name','brand_name','instructions','warnings','notes','administration_site','prn_condition'])if(clean(values[k]))d[k]=clean(values[k]);
 const strength=String(values.strength||'').match(/^(\d+(?:\.\d+)?)\s*(\S+)$/);
 const dose=String(values.dose||'').match(/^(\d+(?:\.\d+)?)\s*(\S+)$/);
 const num=(v:any)=>/^\d+(?:\.\d+)?$/.test(String(v).trim())?Number(v):undefined;
 d.strength_value=num(values.strength_value??strength?.[1]);d.strength_unit=String(values.strength_unit??strength?.[2]??'').trim();
 d.strength_unit=units[d.strength_unit.toLowerCase()]||d.strength_unit;
 d.dose_value=num(values.dose_value??dose?.[1]);d.dose_unit=String(values.dose_unit??dose?.[2]??'').trim();
 d.dosage_form=forms[String(values.dosage_form)]||String(values.dosage_form||'');
 if(d.dose_value&&d.dose_unit)d.dose_text=d.dose_value+' '+d.dose_unit;
 const f=String(values.frequency||'').trim();let m=f.match(/^วันละ\s*(\d+)\s*ครั้ง$/);
 d.schedule_kind='';d.schedule_interval=1;
 if(m){d.frequency_type='times_per_day';d.frequency_value=Number(m[1]);d.frequency_unit='day';d.schedule_kind='daily'}
 else if((m=f.match(/^ทุก\s*(\d+)\s*ชั่วโมง$/))){d.frequency_type='interval';d.frequency_value=Number(m[1]);d.frequency_unit='hour';d.schedule_kind='interval_hour';d.schedule_interval=Number(m[1])}
 else if((m=f.match(/^ทุก\s*(\d+)\s*วัน(?:นับจากวันเริ่ม)?$/))){d.frequency_type='interval';d.frequency_value=Number(m[1]);d.frequency_unit='day';d.schedule_kind='interval_day';d.schedule_interval=Number(m[1])}
 else if((m=f.match(/^ทุก\s*(\d+)\s*(?:สัปดาห์|อาทิตย์)$/))){d.frequency_type='interval';d.frequency_value=Number(m[1]);d.frequency_unit='week';d.schedule_kind='interval_week';d.schedule_interval=Number(m[1])}
 else if((m=f.match(/^(?:สัปดาห์ละ|อาทิตย์ละ)\s*(\d+)\s*ครั้ง$/))){d.frequency_type='times_per_week';d.frequency_value=Number(m[1]);d.frequency_unit='week';d.schedule_kind='weekday'}
 else if(f==='ทุกวัน'){d.frequency_type='times_per_day';d.frequency_unit='day';d.schedule_kind='daily'}
 else if(/^ทุกวัน/.test(f)){d.frequency_type='selected_weekdays';d.frequency_value=1;d.frequency_unit='week';d.schedule_kind='weekday'}
 else if(/^ตามอาการ(?:$|\s|เมื่อ)/.test(f)){d.frequency_type='prn';d.frequency_unit='as_needed';d.frequency_value=1;d.schedule_kind='prn';d.status='prn'}
 const dayText=String(values.weekdays||'').replace(/ไม่เกี่ยวข้อง/g,'')||f;
 d.weekdays=days.flatMap((name,i)=>dayText.includes(name)?[i]:[]);
 if(d.schedule_kind==='weekday'&&!d.frequency_value)d.frequency_value=d.weekdays.length;
 const time=String(values.time||'');d.time_of_day=[];d.exact_times=[];
 for(const [re,label] of [[/เช้า/,'morning'],[/กลางวัน|เที่ยง/,'noon'],[/เย็น/,'evening'],[/ก่อนนอน/,'bedtime']] as const)if(re.test(time))d.time_of_day.push(label);
 for(const x of time.matchAll(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g))d.exact_times.push(x[1].padStart(2,'0')+':'+x[2]);
 if(f==='ทุกวัน')d.frequency_value=d.exact_times.length||d.time_of_day.length;
 d.meal_relation=meals[String(values.meal_relation)]||String(values.meal_relation||'');
 const routeMap:Record<string,string>={'รับประทาน':'oral','หยอดตา':'ophthalmic','ทาผิวหนัง':'topical','หยอดหู':'otic','พ่นจมูก':'nasal','สูดพ่น':'inhalation','ฉีดใต้ผิวหนัง':'subcutaneous','ฉีดเข้ากล้าม':'intramuscular','ฉีดเข้าเส้นเลือด':'intravenous','อมใต้ลิ้น':'sublingual'};
 d.route=routeMap[String(values.route)]||'';
 if(!d.route&&/รับประทาน|กิน/.test(d.instructions||''))d.route='oral';
 if(!d.route&&d.dosage_form==='eye drops')d.route='ophthalmic';
 if(!d.route&&d.dosage_form==='cream')d.route='topical';
 const ratio=d.strength_unit.match(/^(mg|mcg|IU)\/(\d+(?:\.\d+)?)?\s*mL$/);
 if(ratio){d.strength_denominator_value=Number(ratio[2]||1);d.strength_denominator_unit='mL';d.concentration_text=d.strength_value+' '+ratio[1]+'/'+d.strength_denominator_value+' mL'}
 const date=String(values.start_date||'');if(/^\d{4}-\d{2}-\d{2}$/.test(date)&&!isNaN(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date)d.start_date=date;
 if(d.instructions){
  if(d.administration_site&&!d.instructions.includes(d.administration_site))d.instructions+='\nบริเวณใช้ยา: '+d.administration_site;
  if(d.prn_condition&&!d.instructions.includes(d.prn_condition))d.instructions+='\nใช้เมื่อ: '+d.prn_condition;
  if(d.warnings)d.instructions+='\nคำเตือน: '+d.warnings;
 }
 // Retain all entered values, including unreadable data, for review and correction.
 return d;
}
export function validateMedication(d:MedicationDraft):string[]{
 const issues:string[]=[];const v=d.input_values||{};
 if(!d.generic_name||d.generic_name.length<2||d.generic_name.length>200||/^ระบุ|ตัวอย่าง|ชื่อยา/.test(d.generic_name))issues.push('ชื่อสามัญยา');
 if(!(d.strength_value>0)||!Number.isFinite(d.strength_value))issues.push('ความแรงต้องเป็นตัวเลขมากกว่า 0');
 if(!['mg','mcg','g','IU','%','mg/mL','mcg/mL','IU/mL','mg/5mL'].includes(d.strength_unit))issues.push('หน่วยความแรง');
 if(!d.dosage_form)issues.push('รูปแบบยา');
 if(!(d.dose_value>0)||!Number.isFinite(d.dose_value))issues.push('จำนวนต่อครั้งต้องมากกว่า 0');
 if(!['เม็ด','แคปซูล','mL','หยด','ครั้งพ่น','ยูนิต','g'].includes(d.dose_unit))issues.push('หน่วยต่อครั้ง');
 if(d.dosage_form==='capsule'&&d.dose_unit!=='แคปซูล'||d.dosage_form==='tablet'&&d.dose_unit!=='เม็ด'||d.dosage_form==='eye drops'&&d.dose_unit!=='หยด')issues.push('หน่วยต่อครั้งไม่ตรงรูปแบบยา');
 const statedDays=days.flatMap((name,i)=>String(v.frequency||'').startsWith('ทุกวัน')&&String(v.frequency).includes(name)?[i]:[]);
 if(statedDays.length&&JSON.stringify(statedDays)!==JSON.stringify(d.weekdays))issues.push('วันในสัปดาห์ขัดกับความถี่');
 if(!['weekday','interval_week'].includes(d.schedule_kind)&&d.weekdays.length)issues.push('วันในสัปดาห์ไม่ตรงชนิดตารางยา');
 if(!d.frequency_type||!d.schedule_kind||!(d.frequency_value>0)||!Number.isInteger(d.schedule_interval)||d.schedule_interval<1||d.schedule_interval>10000)issues.push('ความถี่');
 if(['weekday','interval_week'].includes(d.schedule_kind)&&(!d.weekdays.length||(d.frequency_type==='times_per_week'&&d.weekdays.length*(d.exact_times.length||d.time_of_day.length)!==d.frequency_value)))issues.push('วันในสัปดาห์ให้ตรงจำนวนครั้ง');
 if(d.schedule_kind!=='prn'&&!d.time_of_day.length&&!d.exact_times.length)issues.push('เวลาใช้ยา');
 if(/\d{1,2}:\d{2}/.test(String(v.time))&&[...String(v.time).matchAll(/\d{1,2}:\d{2}/g)].some(x=>!/^([01]?\d|2[0-3]):[0-5]\d$/.test(x[0])))issues.push('เวลาไม่อยู่ในช่วง 00:00–23:59');
 if(d.schedule_kind==='interval_hour'&&(d.exact_times.length!==1||d.schedule_interval>168))issues.push('ทุก X ชั่วโมงต้องระบุเวลาเริ่ม 1 เวลา');
 if(d.schedule_kind==='prn'&&!d.prn_condition)issues.push('อาการที่ให้ใช้ยาตามคำสั่งจริง');
 if(d.exact_times.length&&d.time_of_day.length)issues.push('เลือกเวลานาฬิกาหรือช่วงเวลาอย่างใดอย่างหนึ่ง');
 if(new Set(d.exact_times).size!==d.exact_times.length)issues.push('เวลาใช้ยาซ้ำกัน');
 const times=d.exact_times.length||d.time_of_day.length;
 if(d.frequency_type==='times_per_day'&&times!==d.frequency_value)issues.push('จำนวนเวลาไม่ตรงความถี่ต่อวัน');
 if(!d.instructions)issues.push('วิธีใช้ตามฉลาก');
 if(v._ambiguities)issues.push('ค่าซ้ำขัดกัน: '+v._ambiguities);
 if(!d.route)issues.push('ช่องทางให้ยา');
 if(d.route==='oral'&&!['before_meal','after_meal','with_meal','empty_stomach','independent'].includes(d.meal_relation))issues.push('ความสัมพันธ์กับอาหารสำหรับยารับประทาน');
 if(d.route&&d.route!=='oral'&&d.meal_relation!=='not_applicable')issues.push('เลือกไม่เกี่ยวข้องกับอาหารสำหรับยาที่ไม่รับประทาน');
 if(d.route==='ophthalmic'&&!/^(?:ตาซ้าย|ตาขวา|ตาทั้งสองข้าง)$/.test(d.administration_site||''))issues.push('ข้างตาที่หยอด');
 if(!d.start_date)issues.push('วันเริ่มใช้ รูปแบบ YYYY-MM-DD');
 if(/ตัวอย่างเท่านั้น|ระบุ YYYY|ตรวจสอบจากฉลากยาจริง/.test(JSON.stringify(v)))issues.push('ยังมีข้อมูลตัวอย่าง ต้องแก้ตามยาจริง');
 return [...new Set(issues)];
}
export function medicationFreeTextValues(raw:string):Record<string,string>{
 const v=medicationFieldsFromText(raw);if(Object.keys(v).length)return v;
 const s=raw.trim();const m=s.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*(mg\/5mL|mg\/mL|mcg\/mL|mg|mcg|g|IU|%)(?=\s|$)/i);
 if(m){v.generic_name=m[1];v.strength_value=m[2];v.strength_unit=m[3]}
 for(const key of Object.keys(forms))if(s.includes(key))v.dosage_form=key;
 const dose=s.match(/(?:ครั้งละ\s*)?(\d+(?:\.\d+)?)\s*(แคปซูล|เม็ด|หยด|mL)/i);if(dose){v.dose_value=dose[1];v.dose_unit=dose[2]}
 const f=s.match(/(?:วันละ|สัปดาห์ละ|อาทิตย์ละ)\s*\d+\s*ครั้ง|ทุก\s*\d+\s*(?:ชั่วโมง|วัน|สัปดาห์)|ทุกวัน(?:จันทร์|อังคาร|พุธ|พฤหัสบดี|ศุกร์|เสาร์|อาทิตย์)|ตามอาการ/);if(f)v.frequency=f[0];
 // Never infer a daily frequency, meal relation, start date or eye side from a drug name.
 v.time=s;return v;
}
export function medicationScheduleLabel(d:MedicationDraft):string{
 const named=(d.weekdays||[]).map((n:number)=>'วัน'+days[n]).join('และ');
 if(d.schedule_kind==='weekday')return 'ทุก'+named;
 if(d.schedule_kind==='interval_week')return 'ทุก '+d.schedule_interval+' สัปดาห์ • '+named+' • เริ่ม '+(d.schedule_anchor_date||d.start_date||'');
 if(d.schedule_kind==='interval_day')return 'ทุก '+d.schedule_interval+' วันนับจาก '+(d.schedule_anchor_date||d.start_date||'');
 if(d.schedule_kind==='interval_hour')return 'ทุก '+d.schedule_interval+' ชั่วโมง';
 if(d.schedule_kind==='prn'||d.status==='prn')return 'เมื่อมีอาการตามคำสั่ง';
 return 'วันละ '+d.frequency_value+' ครั้ง';
}
