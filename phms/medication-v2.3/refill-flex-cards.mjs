/** Read-only refill UI card templates. Backend must issue opaque context tokens and verify permission. */
export const REFILL_SCREENS=["person","medicines","datetime","hospital","document","preparation","review","saved","detail","received","partial","not_received","inventory","labels"];
const headings=["👤 เลือกผู้รับยา","💊 เลือกรายการยาที่จะรับ","📅 วันและเวลานัด","🏥 โรงพยาบาลและจุดรับยา","📎 แนบรูปใบนัด","📋 สิ่งที่ต้องเตรียม","🔎 ตรวจทานนัดรับยา","✅ บันทึกนัดรับยาสำเร็จ","💊 รายละเอียดนัดรับยา","📦 บันทึกรับยาแล้ว","⚠️ รับยาไม่ครบ","☎️ ยังไม่ได้รับยา","📦 รับยาเข้าคลัง","🏷️ รหัสภาชนะและสติกเกอร์"];
export function refillCard({screen,lines=[],actions=[],back,theme,state="HAS_DATA"}){
 const i=REFILL_SCREENS.indexOf(screen);if(i<0)throw Error("UNKNOWN_SCREEN");
 if(!["HAS_DATA","EMPTY","ERROR","PERMISSION_DENIED","PROCESSING","PENDING_VERIFICATION","SESSION_EXPIRED"].includes(state))throw Error("INVALID_STATE");
 if(!theme?.background||!theme?.text||!theme?.primary||!theme?.primaryText||!theme?.backBackground||!theme?.backText)throw Error("CENTRAL_THEME_REQUIRED");
 const token=a=>a&&typeof a.label==="string"&&/^medctx [0-9a-f-]{36}$/.test(a.data||"");
 if([...actions,...(back?[back]:[])].some(a=>!token(a)))throw Error("SECURE_CONTEXT_REQUIRED");
 if(actions.length>3)throw Error("OVERFLOW_REQUIRED");
 const messages={EMPTY:"ยังไม่มีข้อมูล",ERROR:"เกิดข้อผิดพลาด กรุณาลองใหม่",PERMISSION_DENIED:"ไม่มีสิทธิ์ดูข้อมูลนี้",PROCESSING:"กำลังดำเนินการ",PENDING_VERIFICATION:"ต้องตรวจสอบข้อมูล",SESSION_EXPIRED:"รายการหมดอายุ กรุณาเริ่มใหม่"};
 const data=state==="HAS_DATA"?lines:[messages[state]];
 const body=[{type:"text",text:headings[i],weight:"bold",size:"lg",wrap:true,color:theme.text},...data.map(x=>({type:"text",text:String(x),wrap:true,size:"md",color:theme.text,margin:"md"}))];
 const btn=(a,isBack)=>({type:"box",layout:"vertical",height:"44px",justifyContent:"center",alignItems:"center",backgroundColor:isBack?theme.backBackground:theme.primary,action:{type:"postback",label:a.label,data:a.data},contents:[{type:"text",text:a.label,wrap:true,color:isBack?theme.backText:theme.primaryText,align:"center"}]});
 return {type:"flex",altText:headings[i],contents:{type:"bubble",size:"mega",body:{type:"box",layout:"vertical",backgroundColor:theme.background,contents:body},footer:{type:"box",layout:"vertical",spacing:"sm",contents:[...actions.map(a=>btn(a,false)),...(back?[btn(back,true)]:[])]}}};
}
