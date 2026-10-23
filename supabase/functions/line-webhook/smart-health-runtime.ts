import {METRICS,PRESETS,CONTEXT,numberInput,convert,validateReading,validateSession,newReading,labelReading,healthCard,trendCard,type Reading,type Metric} from './smart-health.ts';
type Ports={rpc:(name:string,p:Record<string,unknown>)=>Promise<any>;getState:()=>Promise<any>;state:(key:string,data:any)=>Promise<void>;clear:()=>Promise<void>;send:(messages:any[])=>Promise<void>;people:()=>Promise<any[]>;select:(person:any)=>Promise<void>;self:()=>Promise<void>;upload:(path:string,bytes:Uint8Array,mime:string)=>Promise<void>;remove:(path:string)=>Promise<void>;sign:(bucket:string,path:string)=>Promise<string>;media:(e:any)=>Promise<{bytes:Uint8Array;mime:string;ext:string}>};
type Wizard={step:string;selected:Metric[];readings:Reading[];index:number;field?:string;unit?:string;pending?:Reading;contextIndex?:number;quick?:boolean;page?:number;past?:any[]};
const starts=new Set(['เพิ่มสุขภาพ','เริ่มเลือกช่องสุขภาพ','เริ่มพิมพ์เพิ่มสุขภาพ','รายการช่องสุขภาพ','phms_health_start']);
const scalarUnits:Partial<Record<Metric,string[]>>={DTX:['mg/dL','mmol/L'],Temp:['°C','°F'],Weight:['kg','lb'],Height:['cm','in']};
const sourceFor=(type:Metric)=>({BP:'bp_monitor',SpO2:'oximeter',DTX:'glucose_meter',Temp:'thermometer',Weight:'scale',Height:'tape',HR:'manual',RR:'manual'}[type]);
export async function handleSmartHealth(e:any,p:Ports):Promise<boolean>{
 if(e?.source?.type!=='user')return false;
 const command=e.type==='postback'?String(e.postback?.data||''):String(e.message?.text||'');
 const prev=await p.getState();
 const initial=starts.has(command)||command==='phms_health_people';
 const match=command.match(/^phms_health ([a-f0-9-]{36}) (\d+) (.*)$/);
 const owner=command.match(/^phms_health_owner (self|\d+)$/);
 if(!initial&&!owner&&!match&&prev?.state_key!=='phms_smart_health')return false;
 if(!initial&&!owner&&!match&&(e.type==='postback'||/^(?:ยา|ยาของฉัน|นัดหมาย|เพิ่มนัด|เอกสาร|ครอบครัว|สุขภาพ|ภาพรวมบุคคล|กลับหน้าเริ่มต้น)$/.test(command))){if(prev?.state_key==='phms_smart_health')await p.clear();return false;}
 const call=(action:string,sid:string|null,payload:any={})=>p.rpc('phms_smart_health',{p_line_user_id:e.source.userId,p_action:action,p_session_id:sid,p_payload:payload});
 const send=(title:string,lines:string[],actions:{label:string;data:string}[]=[],back='สุขภาพ')=>p.send([healthCard(title,lines,actions,back)]);
 if(initial){const people=await p.people();await p.state('phms_health_owner',{people});await send('🩺 บันทึกสุขภาพให้ใคร?',[],[{label:'👤 ตัวฉัน',data:'phms_health_owner self'},...people.map((x,i)=>({label:String(x.display_name||'บุคคล'),data:'phms_health_owner '+i}))]);return true;}
 let sid=match?.[1]||prev?.state_data?.sid;
 if(owner){
  if(prev?.state_key!=='phms_health_owner')throw Error('กรุณาเลือกเจ้าของข้อมูลใหม่');
  if(owner[1]==='self')await p.self();else{const person=prev.state_data?.people?.[Number(owner[1])];if(!person)throw Error('บุคคลไม่ถูกต้อง');await p.select(person);}
  sid=crypto.randomUUID();await call('begin',sid);await p.state('phms_smart_health',{sid});
 }
 if(!sid){await send('🩺 เริ่มบันทึกใหม่',[ 'ร่างหมดอายุหรือเปลี่ยนหน้าจอแล้ว'],[{label:'เลือกเจ้าของข้อมูล',data:'phms_health_start'}]);return true;}
 let response=await call('read',sid),s=response.session;
 let rev=Number(s.context_snapshot.revision||0),w:Wizard=s.context_snapshot.wizard||{step:'preset',selected:[],readings:[],index:0};
 const data=(action:string)=>'phms_health '+sid+' '+rev+' '+action;
 const act=(label:string,action:string)=>({label,data:data(action)});
 const eventId=String(e.webhookEventId||e.message?.id||'');let mutation=0;
 const redelivery=!!eventId&&String(s.context_snapshot.last_event_id||'').startsWith(eventId+':');
 const before=structuredClone({...w,past:undefined});let historySaved=false;
 const persist=async()=>{if(!historySaved&&!redelivery&&match?.[3]!=='back'){w.past=[...(w.past||[]),before].slice(-5);historySaved=true;}response=await call('wizard',sid,{revision:rev,wizard:w,event_id:eventId?eventId+':'+mutation++:null});s=response.session;rev=Number(s.context_snapshot.revision);};
 const contexts=()=>Object.entries(CONTEXT[w.pending!.type]||{});
 const nextReading=()=>{w.index++;w.pending=undefined;w.unit=undefined;w.contextIndex=0;w.step=w.index<w.selected.length?'number':'photo';};
 const finishNumber=()=>{const warnings=validateReading(w.pending!);w.step=warnings.length?'unusual':'context';w.contextIndex=0;};
 const accept=()=>{w.readings.push(w.pending!);nextReading();};
 if(match&&Number(match[2])!==rev){await send('🩺 หน้าจอนี้มีข้อมูลใหม่แล้ว',['กดเปิดร่างล่าสุดเพื่อทำต่อ'],[act('เปิดร่างล่าสุด','resume')]);return true;}
 if(s.status==='committed'&&!/^(history |daily |graph |evidence |photos$)/.test(match?.[3]||'')){await send('✅ บันทึกแล้ว',['รายการอยู่ในประวัติสุขภาพ'],[act('📊 ดู 7 วัน','history 7'),act('📊 ดู 30 วัน','history 30'),act('📊 ดู 90 วัน','history 90'),{label:'＋ บันทึกอีกครั้ง',data:'phms_health_start'}]);return true;}
 const action=redelivery?'resume':match?.[3]||'';
 if(action.startsWith('daily ')){
  const page=Number(action.split(' ')[1]);if(!Number.isInteger(page)||page<0)throw Error('หน้าประวัติไม่ถูกต้อง');
  const d=await call('history',null,{days:90});
  const points=[...(d.points||[])].sort((a:any,b:any)=>Date.parse(b.measured_at)-Date.parse(a.measured_at)||String(b.id).localeCompare(String(a.id)));
  const rows=points.slice(page*4,page*4+4);
  await send('📋 ประวัติการวัดรายวัน',[String(d.person_name),...(rows.length?rows.map((x:any)=>new Date(x.measured_at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})+' · '+x.measurement_type+' '+(x.systolic!=null?x.systolic+'/'+x.diastolic:x.value_numeric)+' '+x.unit+' · '+(x.source_device||x.source_type||'ไม่ระบุแหล่ง')+' · รอบ '+(x.measurement_round||1)):['ยังไม่มีค่าวัดในหน้านี้'])],[...(page>0?[act('รายการใหม่กว่า','daily '+(page-1))]:[]),...(points.length>(page+1)*4?[act('รายการก่อนหน้า','daily '+(page+1))]:[]),act('กลับสรุป 7 วัน','history 7')],data('resume'));return true;
 }
 if(action.startsWith('graph ')){const [,days,type]=action.split(' ');if(!METRICS[type as Metric])throw Error('ชนิดกราฟไม่ถูกต้อง');const d=await call('history',null,{days:Number(days)});await p.send([trendCard(d.points||[],type as Metric,Number(days),data('history '+days))]);return true;}
 if(action.startsWith('history ')){
  const d=await call('history',null,{days:Number(action.split(' ')[1])});
  const points=d.points||[],latest=new Map<string,any>();for(const x of points)latest.set(x.measurement_type,x);
  const messages=[];const summary=Array.from(latest.values()).map((x:any)=>x.measurement_type+' '+(x.systolic!==null?x.systolic+'/'+x.diastolic:x.value_numeric)+' '+x.unit+' · '+new Date(x.measured_at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'}));
  for(let i=0;i<Math.max(1,summary.length);i+=6)messages.push(healthCard('📊 ค่าล่าสุด '+action.split(' ')[1]+' วัน',[String(d.person_name),...summary.slice(i,i+6)],[...['BP','HR','SpO2','DTX','Temp','Weight'].map(x=>act('📈 '+x,'graph '+action.split(' ')[1]+' '+x)),act('ประวัติรายวัน','daily 0'),act('7 วัน','history 7'),act('30 วัน','history 30'),act('90 วัน','history 90'),act('รูปเครื่องวัด','photos')],data('resume')));await p.send(messages);return true;
 }
 if(action==='photos'){
  const sources=await call('evidence_list',sid);await send('📷 รูปเครื่องวัด',sources.items?.length?['เลือกรูปเพื่อเปิด']:['ยังไม่มีรูปในครั้งนี้'],(sources.items||[]).map((x:any,i:number)=>act('รูปที่ '+(i+1),'evidence '+x.asset_id)));return true;
 }
 if(action.startsWith('evidence ')){
  const source=await call('evidence_read',sid,{asset_id:action.split(' ')[1]});const url=await p.sign(source.bucket,source.path);await p.send([{type:'image',originalContentUrl:url,previewImageUrl:url}]);return true;
 }
 if(action==='cancel'){await call('cancel',sid);await p.clear();await send('ยกเลิกการกรอกแล้ว',['ค่าวัดยังไม่ได้บันทึก รูปที่แนบถูกเก็บเป็นเอกสารต้นฉบับ']);return true;}
 if(['สุขภาพ','กลับหน้าเริ่มต้น','ภาพรวมบุคคล'].includes(command)){await p.clear();return false;}
 if(e.type==='message'&&e.message?.type==='image'){
  const media=await p.media(e);if(!['image/jpeg','image/png','image/webp'].includes(media.mime)||media.bytes.length>10485760||!media.bytes.length)throw Error('รูปต้องเป็น JPEG PNG หรือ WebP ไม่เกิน 10 MB');
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',media.bytes as BufferSource))).map(x=>x.toString(16).padStart(2,'0')).join('');
  const path='persons/'+s.person_id+'/documents/'+crypto.randomUUID()+'.'+media.ext;
  await p.upload(path,media.bytes,media.mime);
  try{const a=await call('evidence',sid,{revision:rev,path,mime:media.mime,bytes:media.bytes.length,sha256:digest,message_id:String(e.message.id),reading_ids:w.readings.map(x=>x.id)});if(a.duplicate)await p.remove(path);}catch(err){await p.remove(path);throw err;}
  response=await call('read',sid);s=response.session;rev=Number(s.context_snapshot.revision);
  await send('📷 เก็บรูปไว้แล้ว',['แนบกับ '+String(s.context_snapshot.person_label),'รูปใช้เป็นหลักฐาน กรุณากรอกค่าตามเครื่องด้วยตนเอง'],[act('ทำขั้นตอนเดิมต่อ','resume')]);return true;
 }
 if(action==='back'){const past=[...(w.past||[])],old=past.pop();if(old){w={...old,past};if(w.step==='confirm')w.step='review';await persist();}else{await send('🩺 ร่างสุขภาพ',['เลือกทำต่อหรือออกจากร่าง'],[act('ทำต่อ','resume'),act('ยกเลิกการกรอก','cancel')]);return true;}}
 else if(action.startsWith('preset ')){const key=action.split(' ')[1];if(key!=='custom'&&!PRESETS[key])throw Error('ชุดค่าวัดไม่ถูกต้อง');w={step:key==='custom'?'custom':'number',selected:PRESETS[key]?[...PRESETS[key]]:[],readings:[],index:0,past:w.past};await persist();}
 else if(action==='quick'){w.quick=true;w.step='quick';await persist();}
 else if(action.startsWith('toggle ')){const type=action.split(' ')[1] as Metric;if(!METRICS[type])throw Error('ชนิดไม่ถูกต้อง');w.selected=w.selected.includes(type)?w.selected.filter(x=>x!==type):[...w.selected,type];await persist();}
 else if(action==='chosen'){if(!w.selected.length)throw Error('เลือกอย่างน้อยหนึ่งค่า');w.step='number';w.index=0;await persist();}
 else if(action.startsWith('unit ')){const u=action.slice(5);if(!w.pending||!scalarUnits[w.pending.type]?.includes(u))throw Error('หน่วยไม่ถูกต้อง');w.unit=u;await persist();}
 else if(action==='unusual_confirm'){if(w.step!=='unusual')throw Error('ไม่พบค่าวัดที่รอยืนยัน');w.pending!.unusual_confirmed=true;w.step='context';await persist();}
 else if(action==='retype'){w.pending=undefined;w.step='number';await persist();}
 else if(action.startsWith('ctx ')){
  const parts=action.split(' '),entry=contexts()[w.contextIndex||0];if(!entry)throw Error('บริบทไม่ถูกต้อง');
  if(parts[1]!=='skip'){const index=Number(parts[1]);if(!entry[1][index])throw Error('ตัวเลือกไม่ถูกต้อง');w.pending!.context[entry[0]]=entry[1][index];}
  w.contextIndex=(w.contextIndex||0)+1;if(w.contextIndex>=contexts().length)accept();await persist();
 }
 else if(action.startsWith('hr_source ')){if(!w.pending||w.pending.type!=='HR')throw Error('ไม่มี HR ที่รอเลือก');w.pending.device=action.slice(10);w.step='number';await persist();}
 else if(action==='photo_done'){w.step='time';await persist();}
 else if(action==='time_now'){w.step='review';await persist();}
 else if(action==='time_old'){w.step='time_input';await persist();}
 else if(action==='edit'){w.step='edit';await persist();}
 else if(action.startsWith('edit ')){const idx=Number(action.split(' ')[1]);if(!Number.isInteger(idx)||!w.readings[idx])throw Error('ค่าวัดไม่ถูกต้อง');w.pending={...w.readings[idx],context:{...w.readings[idx].context}};delete w.pending.systolic;delete w.pending.diastolic;delete w.pending.value;delete w.pending.original_value;delete w.pending.original_unit;delete w.pending.unusual_confirmed;w.unit=undefined;w.readings.splice(idx,1);w.selected=[...w.selected.slice(0,w.index),w.pending.type,...w.selected.slice(w.index)];w.step='number';await persist();}
 else if(action==='repeat_bp'){
  const round=Math.max(0,...w.readings.filter(x=>x.type==='BP').map(x=>x.round))+1;if(round>3)throw Error('ครบสามรอบแล้ว');
  w.selected=[...w.selected,'BP'];w.index=w.selected.length-1;w.pending=newReading('BP',new Date().toISOString(),'bp_monitor',round);w.step='number';await persist();
 }
 else if(action==='review'){
  validateSession(w.readings);await call('save',sid,{revision:rev,readings:w.readings});response=await call('read',sid);rev=Number(response.session.context_snapshot.revision);await call('review',sid,{revision:rev});w.step='confirm';await persist();
  // Persisting wizard invalidates a review. Review the exact persisted revision again.
  await call('review',sid,{revision:rev});
 }
 else if(action==='commit'){
  const result=await call('commit',sid,{revision:rev});if(!result.committed)throw Error('ยังบันทึกไม่สำเร็จ');
  await send('✅ บันทึกค่าวัดแล้ว',['เจ้าของข้อมูล: '+String(s.context_snapshot.person_label),'บันทึก '+w.readings.length+' ค่าวัด'],[act('📊 ดู 7 วัน','history 7'),act('📷 ดูรูป','photos'),{label:'＋ วัดอีกครั้ง',data:'phms_health_start'}]);return true;
 }
 else if(e.type==='message'&&e.message?.type==='text'&&!action&&!owner&&!redelivery){
  if(s.context_snapshot.last_event_id===String(e.webhookEventId||e.message.id))return true;
  if(w.step==='quick'){
   const nums=command.trim().split(/\s+/);const fields=w.selected.flatMap(type=>type==='BP'?['SYS','DIA']:[type]);if(nums.length!==fields.length)throw Error('จำนวนตัวเลขต้องตรงกับช่องที่แสดง');
   let i=0;w.readings=w.selected.map(type=>{const r=newReading(type,new Date().toISOString(),sourceFor(type));if(type==='BP'){r.systolic=numberInput(nums[i++]);r.diastolic=numberInput(nums[i++]);}else r.value=numberInput(nums[i++]);return r;});
   validateSession(w.readings);w.step='photo';await persist();
  }else if(w.step==='time_input'){
   if(!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(command))throw Error('ใช้รูปแบบ 2026-10-22 08:30 ปี ค.ศ.');
   const at=command.replace(' ','T')+':00+07:00',parsed=Date.parse(at);if(!Number.isFinite(parsed)||parsed>Date.now()+300000||new Date(parsed+7*3600000).toISOString().slice(0,16)!==command.replace(' ','T'))throw Error('วันที่ไม่ถูกต้องหรือเป็นอนาคต');w.readings=w.readings.map(x=>({...x,measured_at:new Date(at).toISOString()}));validateSession(w.readings);w.step='review';await persist();
  }else if(w.step==='number'){
   if(!w.pending)throw Error('เปิดหน้ากรอกค่าก่อน');const r=w.pending,n=numberInput(command);
   if(r.type==='BP'){if(r.systolic===undefined)r.systolic=n;else r.diastolic=n;if(r.diastolic!==undefined)finishNumber();}
   else{r.original_value=n;r.original_unit=w.unit||r.unit;r.value=convert(r.type,n,r.original_unit);finishNumber();}
   await persist();
  }else{await send('เลือกขั้นตอนจากปุ่ม',['ข้อความนี้ยังไม่ได้ใช้เป็นค่าวัด'],[act('เปิดร่างล่าสุด','resume')]);return true;}
 }
 if(w.step==='number'&&!w.pending){w.pending=newReading(w.selected[w.index],new Date().toISOString(),sourceFor(w.selected[w.index]));if(w.pending.type==='HR')w.step='hr_source';await persist();}
 if(w.step==='context'&&contexts().length===0){accept();await persist();if(String(w.step)==='number'){w.pending=newReading(w.selected[w.index],new Date().toISOString(),sourceFor(w.selected[w.index]));if(w.pending.type==='HR')w.step='hr_source';await persist();}}
 if(action==='resume'&&w.step==='confirm'&&s.status!=='review'){w.step='review';await persist();}
 const back=data('back');
 if(w.step==='preset')await send('📋 เลือกชุดค่าวัด',['เจ้าของข้อมูล: '+String(s.context_snapshot.person_label),'ส่งรูปเครื่องวัดก่อนกรอกหรือหลังกรอกได้'],[act('วัดประจำวัน BP + HR','preset daily'),act('ปลายนิ้ว SpO₂ + HR','preset oximeter'),act('เบาหวาน DTX + BP','preset diabetes'),act('วัดครบชุด','preset full'),act('เลือกเอง','preset custom')],back);
 else if(w.step==='custom')await send('📋 เลือกค่าวัดได้หลายชนิด',[],[...Object.keys(METRICS).map(type=>act((w.selected.includes(type as Metric)?'✅ ':'')+METRICS[type as Metric].label,'toggle '+type)),act('เลือกครบแล้ว','chosen')],back);
 else if(w.step==='hr_source')await send('ชีพจรนี้อ่านจากเครื่องไหน?',[],[act('เครื่องความดัน','hr_source bp_monitor'),act('เครื่องปลายนิ้ว','hr_source oximeter'),act('นับเอง / แหล่งอื่น','hr_source manual')],back);
 else if(w.step==='number')await send('🔢 '+METRICS[w.pending!.type].label,[w.pending!.type==='BP'?(w.pending!.systolic===undefined?'พิมพ์ SYS ตัวบน':'พิมพ์ DIA ตัวล่าง'):'พิมพ์เฉพาะตัวเลข หน่วย '+(w.unit||w.pending!.unit),'ส่งรูปได้ทุกขั้น ไม่ใช้รูปบันทึกค่าอัตโนมัติ'],[...(scalarUnits[w.pending!.type]||[]).map(u=>act(u,'unit '+u)),...(w.index===0&&w.readings.length===0?[act('⚡ กรอกตัวเลขหลายช่อง','quick')]:[])],back);
 else if(w.step==='unusual')await send('🔎 ตรวจตัวเลขอีกครั้ง',[labelReading(w.pending!),...validateReading(w.pending!)],[act('ยืนยันตรงตามเครื่อง','unusual_confirm'),act('แก้ตัวเลข','retype')],back);
 else if(w.step==='context'){const entry=contexts()[w.contextIndex||0];await send('บริบท '+METRICS[w.pending!.type].label,[labelReading(w.pending!)],[...entry[1].map((x,i)=>act(x,'ctx '+i)),act('ไม่ระบุ','ctx skip')],back);}
 else if(w.step==='photo')await send('📷 แนบรูปเครื่องวัด',['ส่งรูปในแชตนี้ได้เลย','รูปไม่ชัดก็เก็บเป็นหลักฐานได้ โดยกรอกตัวเลขเอง'],[act('ไปต่อ / ไม่มีรูป','photo_done'),...(w.readings.some(x=>x.type==='BP')?[act('วัด BP รอบถัดไป','repeat_bp')]:[])],back);
 else if(w.step==='quick')await send('⚡ กรอกเฉพาะตัวเลข',[w.selected.flatMap(x=>x==='BP'?['SYS','DIA']:[x+' '+METRICS[x].unit]).join(' → '),'ส่งตัวเลขตามลำดับ คั่นด้วยเว้นวรรค'],[],back);
 else if(w.step==='time')await send('🕒 เวลาที่วัด',[ 'ระบุเวลาที่อ่านค่าจากเครื่อง'],[act('วัดตอนนี้','time_now'),act('เลือกวันเวลาเดิม','time_old')],back);
 else if(w.step==='time_input')await send('🕒 วันเวลาวัด',['พิมพ์วันที่ ค.ศ. และเวลาไทย','ตัวอย่าง 2026-10-22 08:30'],[],back);
 else if(w.step==='edit')await send('แก้ค่าวัด',[],w.readings.map((r,i)=>act(labelReading(r),'edit '+i)),back);
 else if(['review','confirm'].includes(w.step)){
  const lines=['เจ้าของข้อมูล: '+s.context_snapshot.person_label,...w.readings.map(labelReading),'เวลาวัด: '+new Date(w.readings[0]?.measured_at).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})];
  // Chunk the review so every reading remains visible before confirmation.
  const cards=[];for(let i=0;i<lines.length;i+=6)cards.push(healthCard('✅ ตรวจทาน',lines.slice(i,i+6),i+6>=lines.length?[act('แก้ค่าวัด','edit'),act(w.step==='confirm'?'💾 ยืนยันบันทึก':'ตรวจข้อมูลครบแล้ว',w.step==='confirm'?'commit':'review')]:[],back));await p.send(cards);
 }
 return true;
}
