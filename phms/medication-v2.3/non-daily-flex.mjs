// PHMS medication non-daily 9-screen Flex templates. Rendering only; no hardcoded medication or patient data.
// Caller MUST supply server-issued opaque postback tokens and central PHMS theme style.
export const NON_DAILY_SCREENS=Object.freeze(["frequency","weekday","dose_time","review","weekly","today","record","next","reschedule"]);
const titles={frequency:"💊 ยานี้ใช้บ่อยแค่ไหน",weekday:"📅 เลือกวันประจำสัปดาห์",dose_time:"🕒 เลือกมื้อและเวลา",review:"🔎 ตรวจทานคำสั่งยา",weekly:"📆 ตารางยารายสัปดาห์",today:"💊 ยาที่ต้องใช้วันนี้",record:"✅ บันทึกใช้ยาจริง",next:"📅 ครั้งถัดไปที่ต้องใช้ยา",reschedule:"🔄 เลื่อนหรือข้ามรอบ"};
export function renderNonDailyFlex({screen,subtitle,lines=[],actions=[],backAction,theme,status="HAS_DATA"}){
 if(!NON_DAILY_SCREENS.includes(screen))throw Error("UNKNOWN_SCREEN");
 if(!["HAS_DATA","EMPTY","ERROR","PENDING_VERIFICATION","PERMISSION_DENIED","PROCESSING"].includes(status))throw Error("UNKNOWN_STATE");
 if(!theme?.header||!theme?.primaryText||!theme?.background||!theme?.backBackground||!theme?.backText)throw Error("CENTRAL_THEME_REQUIRED");
 if(typeof subtitle!=="string")throw Error("SUBTITLE_REQUIRED");
 if(!Array.isArray(lines)||lines.some(s=>typeof s!=="string"))throw Error("INVALID_LINES");
 const secure=a=>a&&typeof a.label==="string"&&/^[a-zA-Z0-9:_-]{12,200}$/.test(a.token||"");
 if(actions.some(a=>!secure(a))||(backAction&&!secure(backAction)))throw Error("SECURE_TOKEN_REQUIRED");
 const content=[{type:"text",text:titles[screen],weight:"bold",size:"lg",color:theme.primaryText,wrap:true},{type:"text",text:subtitle||"ข้อมูลการใช้ยา",size:"sm",color:theme.primaryText,wrap:true,margin:"md"}];
 const stateText={EMPTY:"ยังไม่มีข้อมูล",ERROR:"เกิดข้อผิดพลาด กรุณาลองอีกครั้ง",PENDING_VERIFICATION:"ต้องตรวจสอบข้อมูลก่อนใช้",PERMISSION_DENIED:"คุณไม่มีสิทธิ์ดูข้อมูลนี้",PROCESSING:"กำลังดำเนินการ"};
 if(status!=="HAS_DATA")content.push({type:"text",text:stateText[status],wrap:true,color:theme.primaryText,margin:"lg"});
 else for(const x of lines)content.push({type:"text",text:x||"—",wrap:true,color:theme.primaryText,margin:"md"});
 const buttons=actions.map(a=>({type:"box",layout:"vertical",height:"44px",backgroundColor:theme.header,justifyContent:"center",alignItems:"center",action:{type:"postback",label:a.label,data:a.token},contents:[{type:"text",text:a.label,color:"#FFFFFF",align:"center",wrap:true}]}));
 if(backAction)buttons.push({type:"box",layout:"vertical",height:"44px",backgroundColor:theme.backBackground,justifyContent:"center",alignItems:"center",action:{type:"postback",label:backAction.label,data:backAction.token},contents:[{type:"text",text:backAction.label,color:theme.backText,align:"center"}]});
 return {type:"flex",altText:titles[screen],contents:{type:"bubble",size:"mega",body:{type:"box",layout:"vertical",backgroundColor:theme.background,contents:content},footer:{type:"box",layout:"vertical",spacing:"md",contents:buttons}}};
}
