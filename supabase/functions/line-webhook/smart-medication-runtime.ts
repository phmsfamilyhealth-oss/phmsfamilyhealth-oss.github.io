import {MED_FIELDS,MED_OPTIONS,medicationTemplate,medicationFreeTextValues,normalizeMedication,validateMedication} from './smart-medication.ts';
const errors:Record<string,string>={permission_denied:'สิทธิ์เพิ่มยาของบุคคลนี้เปลี่ยนไป ร่างยังอยู่ กรุณาตรวจสิทธิ์ก่อนลองอีกครั้ง',validation_failed:'ข้อมูลยังไม่ครบหรือรูปแบบไม่ถูกต้อง เลือกแก้ช่องแล้วตรวจทานใหม่ได้',conflict:'พบรายการที่อาจซ้ำหรือข้อมูลขัดกัน กรุณาตรวจรายการยาเดิมก่อน',timeout:'ระบบตอบกลับไม่ทัน ร่างยังอยู่ กดตรวจทานแล้วลองยืนยันอีกครั้งได้',commit_blocked:'ระบบยังไม่อนุญาตบันทึก ร่างยังอยู่และแก้ไขได้'};
export async function handleSmartMedication(ctx:any):Promise<boolean>{
 const {e,u,k,id,t,c,st,state,clear,rpc,one,replyMessages,theme}=ctx;
 const active=String(st?.state_key||'').startsWith('smart_medication');
 const entry=['เทมเพลตเพิ่มยา','เริ่มเลือกช่องยา','รายการช่องยา','เริ่มพิมพ์เพิ่มยา'].includes(c);
 const command=c.match(/^sm23:(menu|review|edit|set|confirm|cancel|page|type|date)(?: (.*))?$/);
 const structured=e.type==='message'&&/^(?:ชื่อสามัญ|ชื่อยา|ชื่อการค้า|ความแรงตัวเลข)\s*[:：=]/m.test(c);
 if(!active&&!entry&&!command&&!structured)return false;
 if(active&&['เพิ่มยา','ยา','กลับหน้าเริ่มต้น','ย้อนกลับ','นัดหมาย','สุขภาพ'].includes(c))return false;
 if(e.source?.type!=='user')return false;
 if(ctx.smartMedicationEnabled&&!await ctx.smartMedicationEnabled(u,k,id))return false;
 if(active&&!entry&&!command&&e.type!=='message')return false;
 const saved:any=active?{...(st?.state_data||{})}:{};
 let values={...(saved.values||{})},code=String(saved.source_code||'');
 saved.draft_id ||= crypto.randomUUID();saved.revision ||= crypto.randomUUID();
 function card(title:string,lines:string[],buttons:string[][]):any{
  const visible=[...buttons.slice(0,2),buttons.at(-1)].filter((v,i,a)=>v&&a.indexOf(v)===i) as string[][];
  const extra=buttons.filter(v=>!visible.includes(v));
  return {type:'flex',altText:title,contents:{type:'bubble',size:'kilo',header:{type:'box',layout:'vertical',paddingAll:'16px',backgroundColor:theme.background,contents:[{type:'text',text:title,weight:'bold',size:'lg',color:theme.color,wrap:true}]},body:{type:'box',layout:'vertical',paddingAll:'16px',spacing:'md',contents:lines.map(text=>({type:'text',text:String(text).slice(0,1200)||'—',size:'md',wrap:true}))},footer:{type:'box',layout:'vertical',paddingAll:'12px',spacing:'sm',contents:visible.map(([label,data])=>({type:'button',style:'secondary',height:'md',action:{type:'postback',label:Array.from(label).slice(0,20).join(''),data}}))}},...(extra.length?{quickReply:{items:extra.slice(0,13).map(([label,data])=>({type:'action',action:{type:'postback',label:Array.from(label).slice(0,20).join(''),data}}))}}:{})};
 }
 const send=(title:string,lines:string[],buttons:string[][])=>replyMessages(e.replyToken,t,[card(title,lines,buttons)]);
 const persist=async(field='',extra:any={})=>{Object.assign(saved,extra);saved.values=values;saved.source_code=code;saved.field=field;await state(u,k,id,'smart_medication'+(field?'_field':''),saved)};
 const successful=async(result:any)=>{
  const rec=(result.records||[]).find((x:any)=>x.resource_type==='medication');
  await clear(u,k,id);
  await send('💊 บันทึกยาแล้ว',['บันทึกข้อมูลของ '+saved.person_name+' แล้ว','รายการนี้ผ่านการยืนยันข้อมูลที่กรอก สามารถเปิดตรวจรายละเอียดได้'],[
   ...(rec?.person_medication_id?[['🔎 เปิดยาที่บันทึก','ดูยา '+String(rec.person_medication_id).slice(0,12)]]:[]),['↩️ รายการยา','ยา']]);
 };
 const syncDraft=async(draft:any):Promise<boolean>=>{
  if(!draft.generic_name)return true;
  const raw=MED_FIELDS.map(([key,label])=>label+': '+String(values[key]||'')).join('\n');
  if(code){
   const reopened=one(await rpc(u,k,'phms_finalize_line_intake_review',{p_line_user_id:id,p_source_code:code,p_decision:'reopen'}));
   if(reopened?.canonical_commit===true){await successful(reopened);return false}
   await rpc(u,k,'phms_record_line_manual_structured_extraction',{p_line_user_id:id,p_source_code:code,p_document_type:'medication_label',p_manual_text:raw,p_normalized_data:draft});
  }else{
   const result=one(await rpc(u,k,'phms_start_line_structured_text_intake',{p_line_user_id:id,p_line_message_id:'sm23:'+saved.draft_id,p_resource:'medication',p_raw_text:raw,p_normalized_data:draft}));
   code=String(result?.source_code||'');if(!code)throw new Error('intake_source_missing');
  }
  saved.synced_revision=saved.revision;await persist('',{normalized_draft:draft});return true;
 };
 const review=async(sync=true)=>{
  const draft=normalizeMedication(values),issues=validateMedication(draft);
  await persist('',{normalized_draft:draft,validation_issues:issues,session_expired:false});
  if(sync&&saved.synced_revision!==saved.revision&&!await syncDraft(draft))return;
  const rows=MED_FIELDS.filter(([key])=>values[key]).map(([key,label])=>label+': '+(String(values[key]).length>150?String(values[key]).slice(0,150)+'…':values[key]));
  await send('💊 ตรวจทานร่างยา',['ข้อมูลของ: '+saved.person_name,...rows,...(issues.length?['ยังขาดหรือกำกวม:',...issues.map(x=>'• '+x)]:['ตรวจเทียบกับฉลากจริงแล้วกดยืนยันบันทึก']),saved.last_error||'ข้อมูลยังเป็นร่างจนกดยืนยันบันทึก'],[
   ...(!issues.length?[['✅ ยืนยันบันทึก','sm23:confirm '+saved.revision]]:[]),['✏️ แก้แต่ละช่อง','sm23:menu'],['❌ ยกเลิกร่าง','sm23:cancel'],['↩️ เพิ่มยา','เพิ่มยา']]);
 };
 const menu=async(page=0)=>{
  const max=Math.ceil(MED_FIELDS.length/6)-1;page=Math.max(0,Math.min(max,page));await persist('',{page});
  await send('💊 เลือกช่องยา',['เลือกค่ามาตรฐาน หรือกดพิมพ์เองตามฉลาก'],[...MED_FIELDS.slice(page*6,page*6+6).map(([key,label])=>[(values[key]?'✅ ':'✏️ ')+label,'sm23:edit '+key]),...(page<max?[['ช่องถัดไป ›','sm23:page '+(page+1)]]:[]),...(page>0?[['‹ ช่องก่อนหน้า','sm23:page '+(page-1)]]:[]),['🔎 ตรวจทาน','sm23:review'],['↩️ เพิ่มยา','เพิ่มยา']]);
 };
 try{
  const auth=one(await rpc(u,k,'phms_resolve_line_command_context',{p_line_user_id:id,p_resource:'medications',p_action:'create',p_require_person:true,p_required_scope:'any'}));
  if(auth?.context_ready!==true||auth?.permission_granted!==true||!auth?.target_person_id){await send('💊 ยังเพิ่มยาของบุคคลนี้ไม่ได้',['ร่างเดิมยังอยู่ กรุณาเลือกบุคคลและตรวจสิทธิ์'],[['↩️ เลือกบุคคล','ยา']]);return true}
  if(saved.person_id&&saved.person_id!==String(auth.target_person_id)){await send('💊 เจ้าของร่างไม่ตรงกับบุคคลปัจจุบัน',['ร่างเดิมยังอยู่ กรุณาเลือกเจ้าของร่างเดิมก่อน'],[['↩️ เลือกบุคคล','ยา']]);return true}
  saved.person_id=String(auth.target_person_id);saved.person_name=String(auth.target_person_name||'');
  if(command&&!active){await send('💊 ร่างนี้ปิดแล้ว',['เปิดเพิ่มยาเพื่อเริ่มใหม่ ปุ่มเก่าจะไม่สร้างข้อมูลซ้ำ'],[['↩️ เพิ่มยา','เพิ่มยา']]);return true}
  if(saved.session_expired){saved.revision=crypto.randomUUID();await persist('',{session_expired:false,last_error:'หมดเวลาของหน้าก่อนหน้าแล้ว ร่างยังอยู่ กรุณาตรวจทานและยืนยันใหม่'});await review(false);return true}
  if(command?.[1]==='cancel'){
   if(code){const r=one(await rpc(u,k,'phms_finalize_line_intake_review',{p_line_user_id:id,p_source_code:code,p_decision:'reopen'}));if(r.canonical_commit===true){await successful(r);return true}await rpc(u,k,'phms_finalize_line_intake_review',{p_line_user_id:id,p_source_code:code,p_decision:'cancel'})}
   await clear(u,k,id);await send('💊 ยกเลิกร่างยาแล้ว',['ยังไม่มีการเพิ่มคำสั่งยาจากร่างนี้'],[['↩️ ยา','ยา']]);return true;
  }
  if(entry){await persist();if(c==='เทมเพลตเพิ่มยา')await replyMessages(e.replyToken,t,[card('🧾 กรอกหลายช่อง',['คัดลอกข้อความถัดไป แก้ทุกค่าตามฉลากยาจริง แล้วส่งกลับในแชตนี้','ตัวอย่างไม่ถูกบันทึกอัตโนมัติ ระบบจะเปิดร่างให้ตรวจทาน'],[['↩️ เพิ่มยา','เพิ่มยา']]),{type:'text',text:medicationTemplate()}]);else await menu();return true}
  if(command?.[1]==='page'||command?.[1]==='menu'){await menu(Number(command[2])||0);return true}
  if(command?.[1]==='edit'){
   const [key,pageText]=String(command[2]||'').split(' '),f=MED_FIELDS.find(x=>x[0]===key);if(!f){await menu();return true}
   const choices=ctx.medicationNameOptions&&['generic_name','brand_name'].includes(key)?await ctx.medicationNameOptions(u,k,key,values):MED_OPTIONS[key]||[];
   const page=Math.max(0,Math.min(Math.max(0,Math.ceil(choices.length/8)-1),Number(pageText)||0));
   await persist(key,{field_options:choices});const m=card('💊 '+f[1],['ค่าปัจจุบัน: '+String(values[key]||'ยังไม่ระบุ'),['weekdays','time'].includes(key)?'เลือกได้หลายค่า หรือพิมพ์หลายค่าคั่นด้วยจุลภาค':'เลือกค่า หรือกดพิมพ์เองตามฉลาก'],[...choices.slice(page*8,page*8+8).map((v:string,i:number)=>[v,'sm23:set '+key+' '+(page*8+i)]),...(page>0?[['‹ ตัวเลือกก่อนหน้า','sm23:edit '+key+' '+(page-1)]]:[]),...((page+1)*8<choices.length?[['ตัวเลือกถัดไป ›','sm23:edit '+key+' '+(page+1)]]:[]),['✍️ พิมพ์เอง','sm23:type '+key],['↩️ เลือกช่อง','sm23:menu']]);
   if(key==='start_date')m.quickReply={items:[{type:'action',action:{type:'datetimepicker',label:'📅 เลือกวันเริ่ม',data:'sm23:date '+saved.revision,mode:'date'}}]};
   await replyMessages(e.replyToken,t,[m]);return true;
  }
  if(command?.[1]==='type'){const f=MED_FIELDS.find(x=>x[0]===command[2]);if(f){await persist(f[0]);await send('💊 พิมพ์'+f[1],['ส่งค่าจริงในแชตนี้ได้เลย'],[['↩️ เลือกช่อง','sm23:menu']])}else await menu();return true}
  let key='',value='';
  if(command?.[1]==='set'){
   const m=String(command[2]||'').match(/^(\w+) (\d+)$/);key=m?.[1]||'';value=(saved.field_options||MED_OPTIONS[key]||[])[Number(m?.[2])]??'';
   if(saved.field!==key||!value){await menu();return true}
   if(['weekdays','time'].includes(key)&&value!=='ไม่เกี่ยวข้อง'){
    let xs=String(values[key]||'').split(',').map(x=>x.trim()).filter(x=>x&&x!=='ไม่เกี่ยวข้อง');xs=xs.includes(value)?xs.filter(x=>x!==value):[...xs,value];value=xs.join(',');
   }
  }else if(command?.[1]==='date'){
   if(saved.field!=='start_date'||command[2]!==saved.revision){await review(false);return true}
   key='start_date';value=String(e.postback?.params?.date||'');
  }else if(command?.[1]==='review'){await review();return true}
  else if(command?.[1]==='confirm'){
   if(command[2]!==saved.revision){await review(false);return true}
   const draft=normalizeMedication(values);if(validateMedication(draft).length){await review();return true}
   if(saved.synced_revision!==saved.revision&&!await syncDraft(draft))return true;
   const authorized=await ctx.loadMedicationDraftByCode(u,k,id,code);
   if(authorized.person_id&&authorized.person_id!==saved.person_id)throw new Error('permission_denied');
   if(JSON.stringify(Object.entries(authorized.partial.input_values||{}).sort())!==JSON.stringify(Object.entries(draft.input_values||{}).sort())||validateMedication(authorized.partial).length)throw new Error('validation_failed');
   // One database transaction handles confirm + commit; failure rolls back confirmation, keeping an editable draft.
   const result=one(await rpc(u,k,'phms_finalize_line_intake_review',{p_line_user_id:id,p_source_code:code,p_decision:'commit',p_expected_input_values:draft.input_values}));
   if(result?.canonical_commit===true){await successful(result)}else{saved.revision=crypto.randomUUID();saved.last_error=errors[String(result?.error_code)]||errors.commit_blocked;await persist();await review(false)}return true;
  }else if(e.type==='message'){
   if(!c||c.length>6000){await send('💊 ข้อความยาวเกินไป',['กรุณาส่งไม่เกิน 6,000 ตัวอักษร'],[['↩️ เลือกช่อง','sm23:menu']]);return true}
   if(saved.field){key=saved.field;value=c.trim();if(value.length>700){await send('💊 ค่านี้ยาวเกินไป',['กรุณาส่งค่าของช่องไม่เกิน 700 ตัวอักษร'],[['↩️ เลือกช่อง','sm23:menu']]);return true}}
   else values={...values,...medicationFreeTextValues(c)};
  }else return false;
  if(key)values[key]=value;
  saved.revision=crypto.randomUUID();delete saved.last_error;
  // Persist user edits before any remote call; an RPC error must never discard what was typed.
  await persist();await review();return true;
 }catch(err){
  const text=String(err);const reason=/permission|denied|identity|context|not_owned/.test(text)?'permission_denied':/valid|required|invalid/.test(text)?'validation_failed':/timeout|Abort|fetch|network/i.test(text)?'timeout':'commit_blocked';
  saved.last_error=errors[reason];try{await persist()}catch{/* Keep the database draft; do not clear on a failed state write. */}
  console.error('smart_medication_failed',reason);
  await send('💊 ยังบันทึกยาไม่ได้',[saved.last_error],[["✏️ แก้แต่ละช่อง","sm23:menu"],["🔎 ตรวจทานร่าง","sm23:review"],["↩️ เพิ่มยา","เพิ่มยา"]]);return true;
 }
}
