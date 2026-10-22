// Active production line-webhook v1328. Insert helper before Deno.serve and handler immediately after the unified command parse.
// Source captured verbatim to preserve real implementation and avoid fabricated tests.

/* PHMS REFILL SLICE 1: existing central appointment category theme, actual RPC data only. */
function phmsRefillStepCard(title:string,lines:string[],actions:{label:string,data:string}[]){
 const theme=PHMS_CATEGORY_THEME.appointments;
 const boxes=actions.map(a=>({type:'button',style:'primary',height:'md',color:theme.color,action:{type:'postback',label:a.label,data:a.data}}));
 return {type:'flex',altText:title,contents:{type:'bubble',size:'mega',header:{type:'box',layout:'vertical',backgroundColor:theme.background,paddingAll:'16px',contents:[{type:'text',text:title,size:'lg',weight:'bold',wrap:true,color:theme.color}]},body:{type:'box',layout:'vertical',spacing:'md',paddingAll:'16px',contents:lines.map(x=>({type:'text',text:x,wrap:true,size:'md',color:theme.color}))},footer:{type:'box',layout:'vertical',spacing:'md',paddingAll:'12px',contents:boxes}}};
}



/* PHMS_REFILL_SLICE1_LIVE_V1 */
if(sourceType==='user'&&id&&e.replyToken){
 const prev=await getState(u,k,id);
 const isRefillCommand=c==='phms_refill_begin'||c==='phms_refill_cancel'||c==='phms_refill_confirm'||c==='phms_refill_back'||/^phms_refill_med [a-f0-9-]{36}$/.test(c)||/^phms_refill_detail [a-f0-9-]{36}$/.test(c);
 if(isRefillCommand||prev?.state_key==='phms_refill_s1'){
  try{
   const done=async(title:string,lines:string[],actions:any[]=[])=>await replyMessages(e.replyToken,t,[phmsRefillStepCard(title,lines,actions)]);
   if(c==='phms_refill_cancel'){await clear(u,k,id);await done('📅 ยกเลิกเพิ่มนัดแล้ว',['ยังไม่ได้บันทึกนัด'],[{label:'↩️ เมนูนัด',data:'เพิ่มนัด'}]);continue;}
   if(c==='phms_refill_begin'){
    const opt=one(await rpc(u,k,'phms_med_v23_refill_options',{p_line_user_id:id}));
    const meds=Array.isArray(opt?.items)?opt.items:[];
    if(!meds.length){await done('💊 นัดรับยาเดิม',['ยังไม่มีรายการยาในทะเบียนของบุคคลนี้','เพิ่มข้อมูลยาในทะเบียนก่อน แล้วกลับมานัดรับยา'],[{label:'↩️ กลับ',data:'เพิ่มนัด'}]);continue;}
    await state(u,k,id,'phms_refill_s1',{step:'med',key:crypto.randomUUID(),person:opt.person_name});
    await done('💊 รับยาเดิม — เลือกยา',['นัดรับยาให้ '+String(opt.person_name||'บุคคลที่เลือก'),'เลือกรายการยาที่จะรับ'],[...meds.slice(0,8).map((m:any)=>({label:String(m.name||'ยา').slice(0,18),data:'phms_refill_med '+m.person_medication_id})),{label:'↩️ กลับ',data:'phms_refill_cancel'}]);continue;
   }
   if(/^phms_refill_detail [a-f0-9-]{36}$/.test(c)){
     const d=one(await rpc(u,k,'phms_med_v23_refill_detail',{p_line_user_id:id,p_appointment_id:c.split(' ')[1]}));
     await done('📅 รายละเอียดนัดรับยา',['โรงพยาบาล: '+String(d.hospital_name||'-'),'วันนัด: '+String(d.appointment_at||'-'),'จุดรับยา: '+String(d.location_detail||'-'),...((d.items||[]).map((x:any)=>'💊 รายการยา • '+String(x.status||'PLANNED')))], [{label:'↩️ เมนูนัด',data:'เพิ่มนัด'}]);continue;
   }
   const d={...(prev?.state_data||{})};
   if(!d.key)throw Error('refill_session_expired');
   if(/^phms_refill_med [a-f0-9-]{36}$/.test(c)){
     const opt=one(await rpc(u,k,'phms_med_v23_refill_options',{p_line_user_id:id}));
     if(!opt?.items?.some((m:any)=>m.person_medication_id===c.split(' ')[1]))throw Error('refill_medication_not_authorized');
     d.med=c.split(' ')[1];d.step='date';await state(u,k,id,'phms_refill_s1',d);
     await done('📅 นัดรับยาวันไหน',['พิมพ์วันและเวลา เช่น 2026-11-05 09:00','ใช้เวลาประเทศไทย (เวลาโรงพยาบาล)'],[{label:'↩️ กลับเลือกยา',data:'phms_refill_begin'}]);continue;
   }
   if(c==='phms_refill_back'){
     if(d.step==='review'){d.step='location';await state(u,k,id,'phms_refill_s1',d);await done('🏥 จุดรับยา',['พิมพ์จุดรับยาที่โรงพยาบาล เช่น ห้องจ่ายยา OPD']);}
     else {await clear(u,k,id);await done('📅 ยกเลิกขั้นตอน',['เริ่มนัดใหม่ได้จากเมนูนัด'],[{label:'➕ เพิ่มนัด',data:'เพิ่มนัด'}]);}
     continue;
   }
   if(c==='phms_refill_confirm'){
     if(d.step!=='review'||!d.med||!d.at||!d.hospital)throw Error('refill_incomplete');
     const saved=one(await rpc(u,k,'phms_med_v23_refill_create',{p_line_user_id:id,p_key:d.key,p_at:d.at,p_hospital:d.hospital,p_location:d.location||null,p_items:[{person_medication_id:d.med}],p_notes:null}));
     const detail=one(await rpc(u,k,'phms_med_v23_refill_detail',{p_line_user_id:id,p_appointment_id:saved.appointment_id}));
     await clear(u,k,id);
     await done('✅ บันทึกนัดรับยาเรียบร้อย',['โรงพยาบาล: '+String(detail.hospital_name||'-'),'วันนัด: '+String(detail.appointment_at||'-'),'รายการยา: '+String(detail.items?.length||0)+' รายการ','ยังไม่มีการเพิ่มยาลงสต็อกจากใบนัด'],[{label:'🔎 ดูรายละเอียด',data:'phms_refill_detail '+saved.appointment_id},{label:'↩️ เมนูนัด',data:'เพิ่มนัด'}]);continue;
   }
   if(e.type==='message'){
    if(d.step==='date'){
     const m=c.match(/^(\d{4}-\d\d-\d\d)\s+(\d\d:\d\d)$/);
     if(!m||Number.isNaN(Date.parse(m[1]+'T'+m[2]+':00+07:00')))throw Error('refill_date_invalid');
     d.at=m[1]+'T'+m[2]+':00+07:00';d.step='hospital';await state(u,k,id,'phms_refill_s1',d);
     await done('🏥 รับยาที่โรงพยาบาลไหน',['พิมพ์ชื่อโรงพยาบาลตามใบนัด']);continue;
    }
    if(d.step==='hospital'){
     if(c.length<2||c.length>180)throw Error('refill_hospital_invalid');
     d.hospital=c;d.step='location';await state(u,k,id,'phms_refill_s1',d);
     await done('🏥 รับยาที่จุดไหน',['พิมพ์ชื่อห้องจ่ายยา หรือพิมพ์ ไม่ทราบ']);continue;
    }
    if(d.step==='location'){
     if(c.length<2||c.length>180)throw Error('refill_location_invalid');
     d.location=c==='ไม่ทราบ'?null:c;d.step='review';await state(u,k,id,'phms_refill_s1',d);
     await done('🔎 ตรวจข้อมูลก่อนบันทึก',['ผู้รับยา: '+String(d.person||'-'),'วันนัด: '+String(d.at),'โรงพยาบาล: '+d.hospital,'จุดรับยา: '+String(d.location||'ยังไม่ทราบ'),'นัดนี้ยังไม่เพิ่มสต็อกยา'],[{label:'✅ ยืนยันบันทึก',data:'phms_refill_confirm'},{label:'↩️ แก้จุดรับยา',data:'phms_refill_back'},{label:'❌ ยกเลิก',data:'phms_refill_cancel'}]);continue;
    }
   }
   if(d.step==='review'){await done('🔎 ตรวจข้อมูลก่อนบันทึก',['เลือกปุ่มยืนยัน หรือย้อนกลับแก้ไข'],[{label:'✅ ยืนยันบันทึก',data:'phms_refill_confirm'},{label:'↩️ แก้ไข',data:'phms_refill_back'}]);continue;}
   throw Error('refill_unexpected_step');
  }catch(err){console.error('phms_refill_s1',String(err));await replyMessages(e.replyToken,t,[phmsRefillStepCard('⚠️ ยังทำรายการไม่ได้',['กรุณาตรวจข้อมูล หรือเริ่มนัดรับยาใหม่'],[{label:'💊 เริ่มนัดรับยาใหม่',data:'phms_refill_begin'},{label:'↩️ กลับ',data:'เพิ่มนัด'}])]);continue;}
 }
}

