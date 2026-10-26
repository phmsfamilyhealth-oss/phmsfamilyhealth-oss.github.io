// Receipt UI delegates all writes to one atomic RPC and the existing inventory ledger.
export async function handleRefillReceipt(ctx:any):Promise<boolean>{
 const {e,u,k,id,t,c,prev,rpc,one,state,clear,replyMessages,card}=ctx;
 if(!/^refill_receive(?: |$)/.test(c)&&(prev?.state_key!=='phms_refill_receipt'||e.type!=='message'||['นัดหมาย','ยา','เพิ่มนัด','กลับหน้าเริ่มต้น'].includes(c)))return false;
 const show=async(title:string,lines:string[],buttons:any[]=[])=>replyMessages(e.replyToken,t,[card(title,lines,[...buttons,{label:'↩️ กลับรายละเอียดนัด',data:'phms_refill_detail '+d.appointment_id}])]);
 let d:any={...(prev?.state_data||{})};
 try{
  if(!one(await rpc(u,k,'phms_line_appointment_wizard_enabled',{p_line_user_id:id})))throw Error('release_disabled');
  if(/^refill_receive [a-f0-9-]{36}$/.test(c)){
   d={appointment_id:c.split(' ')[1],step:'item',key:crypto.randomUUID()};
   const detail=one(await rpc(u,k,'phms_med_v23_refill_detail',{p_line_user_id:id,p_appointment_id:d.appointment_id}));
   d.person_id=detail.person_id;d.person=detail.person_name||'บุคคลที่เลือก';
  }
  if(!d.appointment_id||!d.key)throw Error('session_expired');
  const detail=one(await rpc(u,k,'phms_med_v23_refill_detail',{p_line_user_id:id,p_appointment_id:d.appointment_id}));
  if(detail.person_id!==d.person_id)throw Error('person_changed');
  const options=one(await rpc(u,k,'phms_med_v23_line_inventory_intake_options',{p_line_user_id:id}));
  d.person=String(options.person_name||d.person);
  const save=()=>state(u,k,id,'phms_refill_receipt',d);
  if(c==='refill_receive edit'){d.step='quantity';await save();await show('💊 จำนวนที่ได้รับจริง',['ของ '+d.person,'พิมพ์จำนวนที่นับได้จริง เช่น 30','หากไม่ได้รับยา ให้พิมพ์ 0']);return true;}
  if(c==='refill_receive confirm'){
   if(!['review','saved'].includes(d.step))throw Error('review_required');
   const result=one(await rpc(u,k,'phms_line_refill_receive',{p_line_user_id:id,p_appointment_id:d.appointment_id,p_key:d.key,p_items:[d.item]}));
   const readback=one(await rpc(u,k,'phms_med_v23_refill_detail',{p_line_user_id:id,p_appointment_id:d.appointment_id}));
   const actual=readback.items.find((x:any)=>x.id===d.item.item_id);
   if(!actual||Number(actual.received_quantity)!==Number(d.item.quantity))throw Error('readback_failed');
   d.step='saved';await save();
   await show('✅ บันทึกการรับยาจริงแล้ว',['ของ '+d.person,'ได้รับ '+actual.received_quantity+' '+actual.received_unit,
    ...(result.items?.[0]?.stock?['รหัสภาชนะ: '+result.items[0].stock.stock_container_id]:[]),
    ...(result.items?.[0]?.expense_id?['เชื่อมค่าใช้จ่ายแล้ว']:[])]);return true;
  }
  const command=c.match(/^refill_receive (item|status|unit|pool|location|next) (.+)$/);
  if(command){
   const [,action,value]=command;
   if(action==='item'){
    const selected=detail.items.find((x:any)=>x.id===value&&x.status==='PLANNED');if(!selected)throw Error('item_not_planned');
    d.item={item_id:selected.id};d.medication_id=selected.medication_id;d.step='quantity';
   }else if(action==='status'&&d.step==='status'&&['RECEIVED','PARTIALLY_RECEIVED'].includes(value)){d.item.status=value;d.step='unit';}
   else if(action==='unit'&&d.step==='unit'&&['tablet','capsule','bottle','ml','unit'].includes(value)){d.item.unit=value;d.step=d.item.quantity===0?'review':'pool';}
   else if(action==='pool'&&d.step==='pool'){
    const pool=options.pools.find((p:any)=>p.id===value);if(!pool)throw Error('pool_denied');d.item.pool_id=pool.id;d.step='location';
   }else if(action==='location'&&d.step==='location'){
    const pool=options.pools.find((p:any)=>p.id===d.item.pool_id);
    if(!pool?.locations?.some((l:any)=>l.id===value))throw Error('location_denied');d.item.location_id=value;d.step='lot';
   }else if(action==='next'&&d.step==='item'){d.page=Number(value);}
   else throw Error('expired_button');
  }else if(e.type==='message'){
   const text=c.trim();
   if(d.step==='quantity'){
    if(!/^\d+(?:\.\d{1,3})?$/.test(text)||Number(text)>1000000)throw Error('quantity_invalid');
    d.item.quantity=Number(text);d.item.status=Number(text)===0?'NOT_RECEIVED':null;d.step=Number(text)===0?'unit':'status';
   }else if(d.step==='lot'){if(text.length>100)throw Error('lot_invalid');d.item.lot=text==='ไม่ทราบ'?null:text;d.step='expiry';}
   else if(d.step==='expiry'){
    if(text!=='ไม่ทราบ'&&(!/^\d{4}-\d{2}-\d{2}$/.test(text)||!Number.isFinite(Date.parse(text))||new Date(text).toISOString().slice(0,10)!==text))throw Error('expiry_invalid');
    d.item.expiry=text==='ไม่ทราบ'?null:text;d.step='container';
   }else if(d.step==='container'){if(text.length<3||text.length>80)throw Error('container_invalid');d.item.container=text;d.step='cost';}
   else if(d.step==='cost'){
    if(text!=='ไม่ทราบ'&&(!/^\d+(?:\.\d{1,2})?$/.test(text)||Number(text)>10000000))throw Error('cost_invalid');
    d.item.cost=text==='ไม่ทราบ'?null:Number(text);d.step='review';
   }else throw Error('choose_button');
  }
  await save();
  const button=(label:string,action:string,value:string)=>({label,data:'refill_receive '+action+' '+value});
  if(d.step==='item'){
   const items=detail.items.filter((x:any)=>x.status==='PLANNED'),page=Math.max(0,Number(d.page)||0),slice=items.slice(page*5,page*5+5);
   await show('💊 เลือกรายการที่รับจริง',['ของ '+d.person,...(!items.length?['บันทึกครบแล้ว ไม่มีรายการรอรับ']:[])],
    [...slice.map((x:any)=>button(String(options.medications.find((m:any)=>m.id===x.medication_id)?.name||'ยา').slice(0,30),'item',x.id)),
     ...(items.length>(page+1)*5?[button('รายการถัดไป','next',String(page+1))]:[])]);
  }else if(d.step==='quantity')await show('💊 จำนวนที่ได้รับจริง',['ของ '+d.person,'พิมพ์จำนวนที่นับได้จริง เช่น 30','ไม่ได้รับยา ให้พิมพ์ 0']);
  else if(d.step==='status')await show('💊 รับยาครบหรือไม่',['เลือกตามที่ได้รับจริง'],[button('ได้รับครบ','status','RECEIVED'),button('ได้รับบางส่วน','status','PARTIALLY_RECEIVED')]);
  else if(d.step==='unit')await show('💊 หน่วยของยาที่นับ',['เลือกหน่วยตามฉลาก'],[['เม็ด','tablet'],['แคปซูล','capsule'],['ขวด','bottle'],['มิลลิลิตร','ml'],['หน่วย','unit']].map(([a,b])=>button(a,'unit',b)));
  else if(d.step==='pool')await show('🗄️ เลือกคลังรับเข้า',['ของ '+d.person,...(!options.pools.length?['ยังไม่มีคลัง กรุณาจัดเตรียมคลังในระบบยาก่อน ร่างยังอยู่']:[])],options.pools.slice(0,8).map((p:any)=>button(p.name,'pool',p.id)));
  else if(d.step==='location')await show('🗄️ เลือกที่เก็บ',['เลือกชั้นหรือจุดเก็บ'],(options.pools.find((p:any)=>p.id===d.item.pool_id)?.locations||[]).slice(0,8).map((l:any)=>button(l.name,'location',l.id)));
  else if(d.step==='lot')await show('💊 เลข LOT',['พิมพ์เลข LOT ตามฉลาก','ถ้าอ่านไม่ออก ให้พิมพ์ ไม่ทราบ']);
  else if(d.step==='expiry')await show('📅 วันหมดอายุ',['พิมพ์ตามฉลาก รูปแบบ ค.ศ.-เดือน-วัน เช่น 2028-06-30','ถ้าไม่มีวันหมดอายุ ให้พิมพ์ ไม่ทราบ']);
  else if(d.step==='container')await show('🏷️ ชื่อภาชนะรับยา',['พิมพ์รหัสหรือชื่อที่ติดบนขวด/กล่อง เช่น กล่องรับยา-01']);
  else if(d.step==='cost')await show('💰 ค่ายาที่ได้รับ',['พิมพ์จำนวนเงินของรายการนี้ เช่น 50 หรือ 0','ถ้ายังไม่ทราบ ให้พิมพ์ ไม่ทราบ']);
  else if(d.step==='review')await show('🔎 ตรวจการรับยาก่อนยืนยัน',['ของ '+d.person,'ได้รับ '+d.item.quantity+' '+d.item.unit,'LOT: '+(d.item.lot||'ไม่ทราบ'),'หมดอายุ: '+(d.item.expiry||'ไม่ทราบ'),'ค่ายา: '+(d.item.cost??'ยังไม่ทราบ'),'กดยืนยันเมื่อรับยาและตรวจข้อมูลแล้วเท่านั้น'],[{label:'✅ ยืนยันรับยาจริง',data:'refill_receive confirm'},{label:'✏️ แก้ข้อมูล',data:'refill_receive edit'}]);
  return true;
 }catch(error){console.error('phms_refill_receipt',String(error));await replyMessages(e.replyToken,t,[card('⚠️ ยังบันทึกไม่ได้',['กรุณาตรวจข้อมูลและสิทธิ์ของบุคคลที่เลือก','ร่างยังอยู่ กลับมาตรวจทานหรือลองอีกครั้งได้'],[{label:'↩️ รายละเอียดนัด',data:d.appointment_id?'phms_refill_detail '+d.appointment_id:'นัดหมาย'}])]);return true;}
}
