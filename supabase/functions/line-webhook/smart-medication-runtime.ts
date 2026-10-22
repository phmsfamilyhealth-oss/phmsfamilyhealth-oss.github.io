import {MED_FIELDS,MED_OPTIONS,medicationTemplate,medicationFreeTextValues,normalizeMedication,validateMedication} from './smart-medication.ts';
// Dependencies use PHMS's existing state, theme, authorization and intake contracts.
export async function handleSmartMedication(ctx:any):Promise<boolean>{
 const {e,u,k,id,t,c,st,state,clear,rpc,one,replyMessages,theme}=ctx;
 const active=String(st?.state_key||'').startsWith('smart_medication');
 const entry=['เทมเพลตเพิ่มยา','เริ่มเลือกช่องยา','รายการช่องยา','เริ่มพิมพ์เพิ่มยา'].includes(c);
 const command=c.match(/^sm23:(menu|review|edit|set|confirm|cancel|page)(?: (.*))?$/);
 const structured=e.type==='message'&&/^(?:ชื่อสามัญ|ชื่อยา|ชื่อการค้า|ความแรงตัวเลข)\s*[:：=]/m.test(c);
 if(!active&&!entry&&!command&&!structured)return false;
 if(active&&['เพิ่มยา','ยา','กลับหน้าเริ่มต้น','ย้อนกลับ','นัดหมาย','สุขภาพ'].includes(c))return false;
 if(e.source?.type!=='user')return false;
 if(command&&!active){await replyMessages(e.replyToken,t,[card('ร่างนี้ปิดแล้ว',['เปิดเพิ่มยาเพื่อเริ่มใหม่'],[['↩️ เพิ่มยา','เพิ่มยา']])]);return true}
 if(active&&!entry&&!command&&e.type!=='message'){
  // Leave normal navigation to PHMS; keep the persisted draft for resuming.
  return false;
 }
 const saved={...(st?.state_data||{})};let values={...(saved.values||{})};let code=String(saved.source_code||'');
 const send=async (title:string,lines:string[],buttons:string[][])=>replyMessages(e.replyToken,t,[card(title,lines,buttons)]);
 function card(title:string,lines:string[],buttons:string[][]):any{
  const visible=[...buttons.slice(0,2),buttons[buttons.length-1]].filter((v,i,a)=>v&&a.indexOf(v)===i);
  const extra=buttons.filter(v=>!visible.includes(v));
  return {type:'flex',altText:title,contents:{type:'bubble',size:'kilo',
   header:{type:'box',layout:'vertical',paddingAll:'16px',backgroundColor:theme.background,contents:[{type:'text',text:title,weight:'bold',size:'lg',color:theme.color,wrap:true}]},
   body:{type:'box',layout:'vertical',paddingAll:'16px',spacing:'md',contents:lines.map(text=>({type:'text',text:String(text).slice(0,1800)||'—',size:'md',wrap:true}))},
   footer:{type:'box',layout:'vertical',paddingAll:'12px',spacing:'sm',contents:visible.map(([label,data])=>({type:'button',style:'secondary',height:'md',action:{type:'postback',label:label.slice(0,20),data}}))}},...(extra.length?{quickReply:{items:extra.slice(0,13).map(([label,data])=>({type:'action',action:{type:'postback',label:label.slice(0,20),data}}))}}:{})};
 }
 const persist=async (field='',extra:any={})=>state(u,k,id,'smart_medication'+(field?'_field':''),{...saved,values,source_code:code,field,...extra});
 const menu=async(page=0)=>{
  await persist('',{page});const fields=MED_FIELDS.slice(page*6,page*6+6);
  await send('💊 เลือกช่องยา', ['เลือกค่ามาตรฐาน หรือพิมพ์ค่าตามฉลากยา'],[
   ...fields.map(([key,label])=>[(values[key]?'✅ ':'✏️ ')+label,'sm23:edit '+key]),
   ...(page<2?[['ช่องถัดไป ›','sm23:page '+(page+1)]]:[]),...(page>0?[['‹ ช่องก่อนหน้า','sm23:page '+(page-1)]]:[]),
   ['🔎 ตรวจทาน','sm23:review'],['↩️ เพิ่มยา','เพิ่มยา']
  ]);
 };
 const review=async()=>{
  const draft=normalizeMedication(values);const issues=validateMedication(draft);
  await persist('',{normalized_draft:draft,validation_issues:issues});
  const rows=MED_FIELDS.filter(([key])=>values[key]).map(([key,label])=>label+': '+values[key]);
  await send('💊 ตรวจทานร่างยา',[
   'ข้อมูลของ: '+String(saved.person_name||await ctx.name(u,k,id)),
   ...rows,
   ...(issues.length?['ยังขาดหรือกำกวม:',...issues.map(x=>'• '+x)]:['ข้อมูลครบตามรูปแบบ โปรดตรวจเทียบฉลากก่อนยืนยัน']),
   'ข้อมูลยังเป็นร่างจนกดยืนยันบันทึก'
  ],[...(!issues.length?[['✅ ยืนยันบันทึก','sm23:confirm']]:[]),['✏️ แก้แต่ละช่อง','sm23:menu'],['❌ ยกเลิกร่าง','sm23:cancel'],['↩️ เพิ่มยา','เพิ่มยา']]);
 };
 try{
  const auth=one(await rpc(u,k,'phms_resolve_line_command_context',{
   p_line_user_id:id,p_resource:'medications',p_action:'create',p_require_person:true,p_required_scope:'any'
  }));
  if(auth?.context_ready!==true||auth?.permission_granted!==true||!auth?.target_person_id){
   await send('💊 เลือกเจ้าของยาก่อน',['ยังไม่มีบริบทหรือสิทธิ์เพิ่มยาของบุคคลนี้'],[['↩️ เลือกบุคคล','ยา']]);return true;
  }
  if(saved.person_id&&saved.person_id!==String(auth.target_person_id)){
   await send('💊 เจ้าของร่างไม่ตรงกับบุคคลปัจจุบัน',['ร่างเดิมยังอยู่ กรุณากลับไปเลือกเจ้าของร่างเดิมก่อน'],[['↩️ เลือกบุคคล','ยา']]);return true;
  }
  saved.person_id=String(auth.target_person_id);saved.person_name=String(auth.target_person_name||'');
  if(command?.[1]==='cancel'){
   if(code)await rpc(u,k,'phms_finalize_line_intake_review',{p_line_user_id:id,p_source_code:code,p_decision:'cancel'});
   await clear(u,k,id);await send('ยกเลิกร่างยาแล้ว',['ยังไม่มีการเพิ่มคำสั่งยาจากร่างนี้'],[['↩️ ยา','ยา']]);return true;
  }
  if(entry){
   // Reuse the existing draft; showing an example never invokes intake or commit.
   await persist();
   if(c==='เทมเพลตเพิ่มยา'){
    await replyMessages(e.replyToken,t,[card('🧾 กรอกหลายช่อง',[
     'คัดลอกข้อความถัดไป แก้ทุกค่าตามฉลากยาจริง แล้วส่งกลับในแชตนี้',
     'ตัวอย่างยังไม่ถูกบันทึก ระบบจะเปิดร่างให้ตรวจทานก่อนยืนยัน'
    ],[['↩️ เพิ่มยา','เพิ่มยา']]),{type:'text',text:medicationTemplate()}]);
   }else await menu();return true;
  }
  if(command?.[1]==='page'||command?.[1]==='menu'){await menu(Math.max(0,Math.min(2,Number(command[2])||0)));return true}
  if(command?.[1]==='edit'){
   const key=command[2];const f=MED_FIELDS.find(x=>x[0]===key);if(!f){await menu();return true}
   await persist(key);await send('✏️ '+f[1],['เลือกค่าด้านล่าง หรือพิมพ์ข้อมูลจริงในแชต','ค่าปัจจุบัน: '+String(values[key]||'ยังไม่ระบุ')],[
    ...(MED_OPTIONS[key]||[]).slice(0,8).map((v,i)=>[v,'sm23:set '+key+' '+i]),['↩️ เลือกช่อง','sm23:menu']
   ]);return true;
  }
  if(command?.[1]==='set'){
   const m=String(command[2]||'').match(/^(\w+) (\d+)$/);const key=m?.[1]||'';const value=MED_OPTIONS[key]?.[Number(m?.[2])];
   if(saved.field!==key||value===undefined){await send('กรุณาเลือกช่องใหม่',['ตัวเลือกนี้ไม่ตรงกับช่องปัจจุบัน'],[['✏️ เลือกช่อง','sm23:menu']]);return true}
   if(code){await rpc(u,k,'phms_finalize_line_intake_review',{p_line_user_id:id,p_source_code:code,p_decision:'cancel'});code=''}
   values[key]=value;await persist('',{draft_event_id:String(e.webhookEventId||crypto.randomUUID())});await review();return true;
  }
  if(command?.[1]==='review'){await review();return true}
  if(command?.[1]==='confirm'){
   const draft=normalizeMedication(values);if(validateMedication(draft).length){await review();return true}
   // Weekly schedules require a canonical weekday contract; never silently save a daily order.
   if(draft.frequency_type==='times_per_week'){
    await send('ร่างยารายสัปดาห์รอตรวจ',['เก็บวันและเวลาในร่างแล้ว แต่ยังยืนยันคำสั่งยาไม่ได้จนกว่าตารางรายสัปดาห์ของระบบบันทึกจะรองรับครบ'],[['✏️ แก้แต่ละช่อง','sm23:menu'],['↩️ เพิ่มยา','เพิ่มยา']]);return true;
   }
   if(!code){
    const result=one(await rpc(u,k,'phms_start_line_structured_text_intake',{
     p_line_user_id:id,p_line_message_id:'sm23:'+String(saved.draft_event_id||e.webhookEventId||e.message?.id),p_resource:'medication',
     p_raw_text:MED_FIELDS.map(([key,label])=>label+': '+String(values[key]||'')).join('\n'),p_normalized_data:draft
    }));
    code=String(result?.source_code||'');if(!code)throw new Error('source_code_missing');
    await persist('',{normalized_draft:draft});
   }
   // Re-read the authorized candidate immediately before confirmation; do not trust stale card state.
   const authorized=await ctx.loadMedicationDraftByCode(u,k,id,code);
   const persisted=authorized.partial;
   if(JSON.stringify(persisted.input_values)!==JSON.stringify(draft.input_values))throw new Error('stale_draft');
   if(validateMedication(persisted).length)throw new Error('persisted_draft_validation_failed');
   await rpc(u,k,'phms_finalize_line_intake_review',{p_line_user_id:id,p_source_code:code,p_decision:'confirm'});
   const result=one(await rpc(u,k,'phms_line_try_canonical_commit',{p_line_user_id:id,p_source_code:code}));
   if(result?.canonical_commit===true||result?.committed===true){await clear(u,k,id);await send('✅ บันทึกยาแล้ว',['บันทึกผ่านสิทธิ์และขั้นตอนยืนยันของ PHMS แล้ว'],[['💊 ดูรายการยา','ยา']])}
   else {await persist();await send('ยังไม่บันทึกคำสั่งยา',['ร่างยังอยู่ ระบบไม่อนุญาตบันทึกในสถานะหรือสิทธิ์ปัจจุบัน'],[['🔎 ตรวจทานร่าง','sm23:review'],['↩️ ยา','ยา']])}
   return true;
  }
  if(e.type==='message'){
   if(!c||c.length>6000){await send('ข้อความยาวเกินไป',['กรุณาส่งข้อมูลไม่เกิน 6,000 ตัวอักษร'],[['↩️ เลือกช่อง','sm23:menu']]);return true}
   if(saved.field){values[saved.field]=c.trim()}
   else values={...values,...medicationFreeTextValues(c)};
   // Editing invalidates the old source. Cancel first, and fail closed if it cannot be cancelled.
   if(code){await rpc(u,k,'phms_finalize_line_intake_review',{p_line_user_id:id,p_source_code:code,p_decision:'cancel'});code=''}
   await persist('',{draft_event_id:String(e.webhookEventId||e.message?.id||crypto.randomUUID())});
   await review();return true;
  }
  return false;
 }catch(err){
  console.error('smart_medication_failed','operation_failed');
  await send('ยังทำรายการยาไม่ได้',['ร่างยังอยู่ กรุณาตรวจข้อมูลและสิทธิ์ก่อนลองอีกครั้ง'],[['🔎 ตรวจทาน','sm23:review'],['↩️ เพิ่มยา','เพิ่มยา']]);return true;
 }
}
