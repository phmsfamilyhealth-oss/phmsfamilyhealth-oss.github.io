import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/* PHMS_LINE_PAID_SEND_SAFETY_V1 */
async function phmsPaidLineSendStatus(u?:string,k?:string){
  const U=u||Deno.env.get("SUPABASE_URL")||"";
  const K=k||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!U||!K)return {allowed:false,mode:"off",until:null as string|null};
  try{
    const r=await fetch(U+"/rest/v1/phms_runtime_environment?singleton=eq.true&select=line_paid_send_mode,line_paid_send_enabled_until&limit=1",{
      headers:{apikey:K,Authorization:"Bearer "+K}
    });
    if(!r.ok){
      console.error("line_paid_send_gate_read_failed",r.status,await r.text());
      return {allowed:false,mode:"off",until:null as string|null};
    }
    const rows=await r.json();
    const x=rows?.[0]||{};
    const mode=String(x?.line_paid_send_mode||"off");
    const until=x?.line_paid_send_enabled_until?String(x.line_paid_send_enabled_until):null;
    if(mode==="on")return {allowed:true,mode,until};
    if(mode!=="test")return {allowed:false,mode,until};
    const t=until?new Date(until).getTime():0;
    return {allowed:Number.isFinite(t)&&t>Date.now(),mode,until};
  }catch(e){
    console.error("line_paid_send_gate_error",String(e));
    return {allowed:false,mode:"off",until:null as string|null};
  }
}
async function phmsChargeableLineFetch(url:string,init?:RequestInit){
  const gate=await phmsPaidLineSendStatus();
  if(!gate.allowed){
    console.log("line_chargeable_send_suppressed",{mode:gate.mode,until:gate.until});
    return new Response(JSON.stringify({suppressed:true,reason:"paid_line_messages_disabled",mode:gate.mode,until:gate.until}),{
      status:202,headers:{"content-type":"application/json"}
    });
  }
  return fetch(url,init);
}
const enc=new TextEncoder();
function b64(b:Uint8Array){let s="";for(const x of b)s+=String.fromCharCode(x);return btoa(s)}
async function signRaw(raw:string,secret:string){const key=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const out=await crypto.subtle.sign("HMAC",key,enc.encode(raw));return b64(new Uint8Array(out))}
async function validSignature(raw:string,sig:string,secret:string){return(await signRaw(raw,secret))===sig}
function rh(k:string){return{apikey:k,Authorization:`Bearer ${k}`}}
async function rpcRaw(u:string,k:string,name:string,body:any){const r=await fetch(`${u}/rest/v1/rpc/${name}`,{method:"POST",headers:{...rh(k),"Content-Type":"application/json"},body:JSON.stringify(body??{})});const t=await r.text();if(!r.ok)throw new Error(`${name}:${r.status}:${t}`);return t?JSON.parse(t):null}
async function rpcOne(u:string,k:string,name:string,body:any){const d=await rpcRaw(u,k,name,body);return Array.isArray(d)?d[0]??null:d}
async function rpcRows(u:string,k:string,name:string,body:any){const d=await rpcRaw(u,k,name,body);return Array.isArray(d)?d:[]}
async function signedPersonPhoto(u:string,k:string,objectName:any){
 const path=String(objectName||'').trim();if(!path)return null;
 try{
  const url=u+'/storage/v1/object/sign/phms-person-photos/'+path.split('/').map(encodeURIComponent).join('/');
  const r=await fetch(url,{method:'POST',headers:{...rh(k),'Content-Type':'application/json'},body:JSON.stringify({expiresIn:86400})});
  if(!r.ok)return null;
  const d=await r.json();const s=String(d?.signedURL||d?.signedUrl||'');
  if(!s)return null;
  if(s.startsWith('http'))return s;
  if(s.startsWith('/storage/v1/'))return u+s;
  if(s.startsWith('/object/'))return u+'/storage/v1'+s;
  return u+'/storage/v1/'+s.replace(/^\/+/, '');
 }catch{return null}
}
async function signedStorageObject(u:string,k:string,bucket:any,objectName:any){
 const b=String(bucket||'').trim(),path=String(objectName||'').trim();if(!b||!path)return null;
 try{
  const url=u+'/storage/v1/object/sign/'+encodeURIComponent(b)+'/'+path.split('/').map(encodeURIComponent).join('/');
  const r=await fetch(url,{method:'POST',headers:{...rh(k),'Content-Type':'application/json'},body:JSON.stringify({expiresIn:1800})});
  if(!r.ok)return null;
  const d=await r.json();const x=String(d?.signedURL||d?.signedUrl||'');
  if(!x)return null;
  if(x.startsWith('http'))return x;
  if(x.startsWith('/storage/v1/'))return u+x;
  if(x.startsWith('/object/'))return u+'/storage/v1'+x;
  return u+'/storage/v1/'+x.replace(/^\/+/, '');
 }catch{return null}
}
async function rateLimit(u:string,k:string,scope:string,subject:string,limit:number,windowSeconds:number){
  return await rpcOne(u,k,"phms_rate_limit_check",{p_scope:scope,p_subject:subject,p_limit:limit,p_window_seconds:windowSeconds})
}
async function getIdentity(u:string,k:string,uid:string){const r=await fetch(`${u}/rest/v1/line_identities?line_user_id=eq.${encodeURIComponent(uid)}&select=user_id,onboarding_status,is_active&limit=1`,{headers:rh(k)});return r.ok?(await r.json())?.[0]??null:null}
async function sha256Hex(v:string){
 const b=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v)));
 return Array.from(b).map(x=>x.toString(16).padStart(2,"0")).join("")
}
async function lineDeepLink(token:string,command:string,fallback:string){
 try{
  const r=await fetch("https://api.line.me/v2/bot/info",{headers:{Authorization:"Bearer "+token}});
  if(!r.ok)return fallback;
  const d=await r.json();const id=String(d?.basicId||"");
  return id?"https://line.me/R/oaMessage/"+encodeURIComponent(id)+"/?"+encodeURIComponent(command):fallback
 }catch{return fallback}
}
function q(label:string,text:string){return{type:"action",action:{type:"message",label:phmsNormalizeActionLabel(label),text}}}
function qpb(label:string,data:string){return{type:"action",action:{type:"postback",label:phmsNormalizeActionLabel(label),data}}}
function phmsInternalActionText(v:any){
 const s=String(v||"").trim();
 if(/(?:^|\s)#?(?:[0-9a-f]{8}(?:-[0-9a-f]{3,})+|[0-9a-f]{12})(?=\s|$)/i.test(s))return true;
 return /(?:ดู|แก้|ยืนยัน|ยกเลิก|ตั้ง|เลือก|ผูก|ย้าย|กู้คืน|เชื่อม|มอบหมาย|แจ้ง|เพิ่ม|ลบ|ประวัติ|สิทธิ์|บทบาท|ถังขยะ)[^\n]{0,90}[0-9a-f]{8,12}(?=\s|$)/i.test(s)
}
/* PHMS_ELDER_FRIENDLY_COPY_GUARD_V2: authored UI text only; preserve stored health/clinical data and action commands. */
function phmsSeniorFriendlyCopy(raw:any){
 let s=String(raw??'');
 const exact=new Map<string,string>([
  ['ตอนนี้ยังใช้ส่วนนี้ไม่ได้','ตอนนี้ยังใช้ส่วนนี้ไม่ได้'],
  ['กดปุ่มด้านล่างเพื่อกลับไปส่วนที่พร้อมทดสอบได้เลย','เลือกเรื่องอื่นจากปุ่มด้านล่างได้เลย'],
  ['No data found','ยังไม่มีข้อมูลในส่วนนี้'],
  ['No records found','ยังไม่มีข้อมูลในส่วนนี้'],
  ['Saved successfully','บันทึกให้แล้ว'],
  ['Feature not implemented','ตอนนี้ยังใช้ส่วนนี้ไม่ได้'],
  ['Feature unavailable','ตอนนี้ยังใช้ส่วนนี้ไม่ได้'],
  ['Permission denied','ตอนนี้ยังดูข้อมูลนี้ไม่ได้']
 ]);
 const t=s.trim();
 if(exact.has(t))return exact.get(t)!;
 // PHMS_ELDER_LANGUAGE_POLICY_V2: exact system copy only; preserve clinical narratives.
 const uiErrors=new Map<string,string>([
  ['ไม่พบข้อมูลใน Database','ยังไม่พบข้อมูลนี้นะ'],
  ['Permission denied','ตอนนี้ยังไม่มีสิทธิ์ดูข้อมูลนี้'],
  ['Operation failed','ยังทำรายการไม่ได้ ลองอีกครั้งนะ'],
  ['กรุณาระบุ Parameter','ช่วยเลือกข้อมูลก่อนนะ'],
  ['Confirm submission','ตรวจแล้วกดบันทึกได้เลย'],
  ['Loading data failed','เปิดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้งนะ'],
  ['Unauthorized','ตอนนี้ยังไม่มีสิทธิ์ใช้งานส่วนนี้'],
  ['Internal Server Error','ตอนนี้ยังทำรายการไม่ได้ ลองอีกครั้งนะ'],
  ['Network error','เชื่อมต่อไม่สำเร็จ ลองอีกครั้งนะ'],
  ['null','ยังไม่มีข้อมูล'],
  ['undefined','ยังไม่มีข้อมูล']
 ]);
 if(uiErrors.has(t))return uiErrors.get(t)!;
 if(/^(?:Error|API error|Token expired|Database error|Failed to fetch|Request failed)(?:\\s*[:(].*)?$/i.test(t))return 'ตอนนี้ยังทำรายการไม่ได้ ลองอีกครั้งนะ';

 if(/^(?:(?:TypeError|ReferenceError|SyntaxError|InternalServerError|UnhandledRejection|Traceback|Error):\s*[^\n]*|\{\s*"error"\s*:\s*"[^\n]*"\s*\})$/i.test(t))return 'อิ่มอุ่นทำรายการนี้ไม่ได้ในตอนนี้ ลองอีกครั้งนะ';
 return s.replace(/🛠️\s*ส่วนนี้กำลังพัฒนา\/ตั้งค่าอยู่/g,'ตอนนี้ยังใช้ส่วนนี้ไม่ได้')
  .replace(/กดปุ่มด้านล่างเพื่อกลับไปส่วนที่พร้อมทดสอบได้เลย/g,'เลือกเรื่องอื่นจากปุ่มด้านล่างได้เลย');
}

function phmsCleanVisibleText(v:any){
 let s=String(v??"");
 /* PHMS_ELDER_FRIENDLY_COPY_GUARD_V1
    This operates only on known PHMS UI boilerplate.
    Never rewrite patient-entered clinical narratives or action.data. */
 s=s.replace(/🛠️\s*ส่วนนี้กำลังพัฒนา\/ตั้งค่าอยู่/g,'ตอนนี้ยังใช้ส่วนนี้ไม่ได้');
 s=s.replace(/กดปุ่มด้านล่างเพื่อกลับไปส่วนที่พร้อมทดสอบได้เลย/g,'เลือกเรื่องอื่นจากปุ่มด้านล่างได้เลย');
 const hiddenLine=/(?:รหัส(?:นัด|คำเชิญ|รับเข้า|ฉบับรอตรวจ|คำขอ|สมาชิก|บุคคล|เคส|งาน|เอกสาร|ลิงก์|เชื่อม|ครอบครัว|รายการภายใน)|(?:appointment|invite|record|request|task|draft|intake|source|member|person|case|link)[ _-]?(?:id|code|token))/i;
 s=s.split(/\r?\n/).filter((line:string)=>{
   const x=String(line||"");
   return !hiddenLine.test(x)
 }).join("\n");
 s=s.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,"");
 s=s.replace(/\b[0-9a-f]{8}-[0-9a-f]{3,}\b/gi,"");
 s=s.replace(/#(?:[0-9a-f]{8}(?:-[0-9a-f]{3,})+|[0-9a-f]{12})\b/gi,"");
 s=s.replace(/\((?:#)?[0-9a-f]{12}\)/gi,"");
 return phmsSeniorFriendlyCopy(s.replace(/[ \t]+\n/g,"\n").replace(/[ \t]{2,}/g," ").replace(/\n{3,}/g,"\n\n").trim())
}
function phmsSafeLineNode(node:any,depth=0):any{
 if(depth>24||!node||typeof node!=="object")return node;
 if(Array.isArray(node)){for(const x of node)phmsSafeLineNode(x,depth+1);return node}
 if(node.type==="message"&&typeof node.label==="string"&&typeof node.text==="string"&&phmsInternalActionText(node.text)){
  const label=phmsNormalizeActionLabel(node.label),data=node.text;
  for(const k of Object.keys(node))delete node[k];
  node.type="postback";node.label=label;node.data=data;node.displayText=label;
  return node
 }
 if(node.type==="postback"&&typeof node.label==="string"&&!node.displayText)node.displayText=phmsNormalizeActionLabel(node.label);
 if(node.type==="text"&&typeof node.text==="string")node.text=phmsCleanVisibleText(node.text);
 if(typeof node.altText==="string")node.altText=phmsCleanVisibleText(node.altText);
 if(typeof node.label==="string")node.label=phmsNormalizeActionLabel(node.label);
 if(typeof node.displayText==="string")node.displayText=phmsCleanVisibleText(node.displayText).slice(0,300)||node.label||"เปิดรายการ";
 for(const [k,v] of Object.entries(node)){
  if(k==="data"||k==="uri")continue;
  phmsSafeLineNode(v,depth+1)
 }
 return node
}


function phmsLineActionSignature(a:any){
 if(!a||typeof a!=="object")return "";
 const cmd=String(a.data??a.text??"").trim();
 if(cmd)return "cmd|"+cmd;
 if(a.uri)return "uri|"+String(a.uri);
 return String(a.type||"")+"|"+String(a.label||"")
}
function phmsActionCommand(a:any){return String(a?.data??a?.text??"").trim()}
function phmsIsBackAction(a:any){
 const label=String(a?.label||"").trim(),cmd=phmsActionCommand(a);
 const explicitLabel=/^(?:↩️?|⬅️?)\s*/u.test(label)||/(?:ย้อนกลับ|กลับ)/.test(label);
 const explicitCommand=/^(?:ย้อนกลับ|กลับหน้าเริ่มต้น|กลับ\b)/.test(cmd);
 const cancelToParent=/ยกเลิก/.test(label)&&!/^ยกเลิก/.test(cmd)&&!!phmsBackTargetFromCommand(cmd,"");
 return explicitLabel||explicitCommand||cancelToParent
}
function phmsBackTargetFromCommand(command:any,label:any=""){
 const s=String(command||"").trim(),l=String(label||"").trim();
 const rules:[RegExp,string][]=[
  [/^ดูนัด(?:\s|$)/,"รายละเอียดนัด"],
  [/^(?:นัดหมายบุคคลปัจจุบัน|นัดหมาย)$/,"นัดหมาย"],
  [/^สิ่งที่ต้องทำก่อนนัด(?:\s|$)/,"เตรียมก่อนนัด"],
  [/^(?:ค่าใช้จ่ายนัด|รายละเอียดค่ารักษา|หลักฐานค่าใช้จ่าย)(?:\s|$)/,"ค่ารักษา"],
  [/^เอกสารนัด(?:\s|$)/,"เอกสารนัด"],
  [/^เลื่อนนัด(?:\s|$)/,"เลื่อนนัด"],
  [/^เชื่อมนัด(?:\s|$)/,"เชื่อมนัด"],
  [/^ดูยา(?:\s|$)/,"รายละเอียดยา"],
  [/^(?:ยา|ยาของฉัน)$/,"ยา"],
  [/^ดูสุขภาพ(?:\s|$)/,"รายละเอียดสุขภาพ"],
  [/^สุขภาพ$/,"สุขภาพ"],
  [/^บุคคลในครอบครัว(?:\s|$)/,"บุคคลในครอบครัว"],
  [/^(?:ครอบครัว|สมาชิกครอบครัว|บัญชีในครอบครัว)$/,"ครอบครัว"],
  [/^รายละเอียดบุคคล(?:\s|$)/,"รายละเอียดบุคคล"],
  [/^ข้อมูลของฉัน$/,"ข้อมูลของฉัน"],
  [/^คนที่ดูหรือช่วยดูแล(?:\s|$)/,"คนที่ดูหรือช่วยดูแล"],
  [/^สิทธิ์บุคคล(?:\s|$)/,"สิทธิ์บุคคล"],
  [/^(?:ตรวจคำขอสิทธิ์|คำขอสิทธิ์)$/,"คำขอสิทธิ์"],
  [/^ตั้งค่ากลุ่มส่วนตัว(?:\s|$)/,"ตั้งค่ากลุ่ม"],
  [/^ตั้งเตือนนัด(?:\s|$)/,"ตั้งค่าเตือนนัด"],
  [/^สรุปนัดตามโรคและแผนก(?:\s|$)/,"สรุปนัด"],
  [/^กลุ่มนัด(?:\s|$)/,"กลุ่มนัด"],
  [/^ดูเคสการรักษา(?:\s|$)/,"เคสการรักษา"],
  [/^(?:กลับหน้าเริ่มต้น|หน้าเริ่มต้น)$/,"หน้าเริ่มต้น"]
 ];
 for(const [re,name] of rules)if(re.test(s))return {label:"↩️ "+name,data:s||"กลับหน้าเริ่มต้น"};
 const cleaned=l.replace(/[\u21a9\ufe0f\u2b05\ufe0f\u2705\u{1f4b0}\u{1f4c5}\u2764\ufe0f\u270f\ufe0f]/gu,"")
  .replace(/(?:ย้อนกลับ|กลับไป|กลับ)/g,"").replace(/\s*\/\s*/g," ").trim();
 if(cleaned)return {label:"↩️ "+cleaned.slice(0,16),data:s||"กลับหน้าเริ่มต้น"};
 return null
}
function phmsBackTargetFromAction(a:any){return phmsBackTargetFromCommand(phmsActionCommand(a),a?.label)}
function phmsMessageContextText(m:any){
 if(m?.type==="text")return String(m.text||"");
 return String(m?.altText||"")+" "+String(m?.contents?.header?.contents?.map?.((x:any)=>x?.text||"")?.join?.(" ")||"")
}
function phmsInferBackTarget(m:any,quickItems:any[]=[]){
 const all=[...phmsCollectFlexButtonActions(m),...((Array.isArray(quickItems)?quickItems:[]).map((x:any)=>({action:x?.action})))];
 for(const x of all){
  if(x?.action&&phmsIsBackAction(x.action)){
   const t=phmsBackTargetFromAction(x.action);if(t)return t
  }
 }
 const txt=phmsMessageContextText(m);
 if(/(?:นัด|โรงพยาบาล|ค่ารักษา|เตรียมก่อนนัด|เอกสารนัด)/.test(txt))return {label:"↩️ นัดหมาย",data:"นัดหมายบุคคลปัจจุบัน"};
 if(/ยา/.test(txt))return {label:"↩️ ยา",data:"ยา"};
 if(/สุขภาพ/.test(txt))return {label:"↩️ สุขภาพ",data:"สุขภาพ"};
 if(/(?:ครอบครัว|สมาชิก|บุคคล|สิทธิ์|ผู้ดูแล)/.test(txt))return {label:"↩️ ครอบครัว",data:"ครอบครัว"};
 return {label:"↩️ หน้าเริ่มต้น",data:"กลับหน้าเริ่มต้น"}
}
function phmsNormalizeBackAction(a:any,target:any){
 if(!a||typeof a!=="object")return a;
 if(/(?:ยกเลิก|ลบ|เอาออก|ปฏิเสธ)/.test(String(a.label||''))){
  a.label=phmsNormalizeActionLabel(a.label);
  if(a.type==='postback')a.displayText=a.label;
  return a
 }
 const t=phmsBackTargetFromAction(a)||target||{label:"↩️ หน้าเริ่มต้น",data:"กลับหน้าเริ่มต้น"};
 a.label=phmsNormalizeActionLabel(t.label||'↩️ หน้าเริ่มต้น');
 if(a.type==="message")a.text=String(t.data||a.text||"กลับหน้าเริ่มต้น");
 else if(a.type==="postback"){
  a.data=String(t.data||a.data||"กลับหน้าเริ่มต้น");
  a.displayText=a.label
 }
 return a
}

function phmsFitActionLabelNoEllipsis(raw:any,max=16){
 let s=String(raw??'').replace(/\s+/g,' ').trim();
 if(!s)return 'เปิดรายการ';
 if(s.length<=max)return s;

 const replacements:[RegExp,string][]=[
  [/ข้อความสำหรับแชร์/g,'แชร์ข้อความ'],
  [/ประวัติการแก้ไข/g,'ประวัติแก้ไข'],
  [/เลือกวิธีจัดกลุ่ม/g,'จัดกลุ่ม'],
  [/ดูนัดของทุกคน/g,'นัดทุกคน'],
  [/นัดที่ผ่านมาแล้ว/g,'นัดที่ผ่านมา'],
  [/ดูรายละเอียดนัด/g,'ดูนัด'],
  [/ดูรายละเอียดค่ารักษา/g,'ค่ารักษา'],
  [/ดูรายละเอียด/g,'รายละเอียด'],
  [/แก้ไขรายละเอียด/g,'แก้รายละเอียด'],
  [/เอกสารของนัด/g,'เอกสารนัด'],
  [/ตั้งค่าแจ้งเตือนนัด/g,'ตั้งค่าเตือน'],
  [/ตั้งค่าแจ้งเตือน/g,'ตั้งค่าเตือน'],
  [/บุคคลในครอบครัว/g,'คนในครอบครัว'],
  [/คนที่เข้าถึงข้อมูลของฉัน/g,'คนที่ดูข้อมูลฉัน'],
  [/นัดก่อนหน้าทั้งหมด/g,'นัดก่อนหน้า'],
  [/ดูนัดถัดไป/g,'นัดถัดไป'],
  [/ตรวจสอบสถานะและไปต่อ/g,'ตรวจสถานะ'],
  [/ใช้ LINE Login แทน/gi,'LINE Login'],
  [/เพิ่มเอกสารให้นัด/g,'เพิ่มเอกสาร'],
  [/หลักฐานค่าใช้จ่าย/g,'หลักฐานจ่าย'],
  [/ค่าใช้จ่ายหลังนัด/g,'ค่าใช้จ่าย'],
  [/ดูหลักฐานค่าใช้จ่าย/g,'ดูหลักฐาน'],
  [/ดูรายการที่ค้าง/g,'รายการค้าง'],
  [/ตั้งค่ากลุ่มนี้/g,'ตั้งค่ากลุ่ม']
 ];
 for(const [re,to] of replacements)s=s.replace(re,to).replace(/\s+/g,' ').trim();
 if(s.length<=max)return s;

 const meaning:[RegExp,string][]=[
  [/(?:แชร์|share)/i,'แชร์'],
  [/(?:ประวัติ|ย้อนหลัง)/,'ประวัติ'],
  [/(?:เอกสาร|ไฟล์)/,'เอกสาร'],
  [/(?:หลักฐาน)/,'หลักฐาน'],
  [/(?:ค่าใช้จ่าย|ค่ารักษา|ชำระ)/,'ค่าใช้จ่าย'],
  [/(?:แจ้งเตือน|เตือน)/,'ตั้งค่าเตือน'],
  [/(?:จัดกลุ่ม|กรอง|หมวด)/,'จัดกลุ่ม'],
  [/(?:ครอบครัว)/,'ครอบครัว'],
  [/(?:สิทธิ์|สิทธิ)/,'จัดการสิทธิ์'],
  [/(?:แก้|แก้ไข)/,'แก้ไข'],
  [/(?:อนุมัติ)/,'อนุมัติ'],
  [/(?:ยืนยัน)/,'ยืนยัน'],
  [/(?:บันทึก)/,'บันทึก'],
  [/(?:ยกเลิก)/,'ยกเลิก'],
  [/(?:ปฏิเสธ)/,'ปฏิเสธ'],
  [/(?:นัด)/,'นัดหมาย'],
  [/(?:ยา)/,'ยา'],
  [/(?:สุขภาพ)/,'สุขภาพ'],
  [/(?:กลับ|ย้อนกลับ)/,'กลับ']
 ];
 for(const [re,to] of meaning)if(re.test(s))return to.length<=max?to:to.slice(0,max);

 try{
  const seg=new Intl.Segmenter('th',{granularity:'word'});
  let out='';
  for(const part of seg.segment(s)){
    const next=(out+part.segment).trimEnd();
    if(next.length>max)break;
    out+=part.segment;
  }
  out=out.trim();
  if(out.length>=3)return out
 }catch{}
 return s.slice(0,max).trim()
}
function phmsNormalizeActionLabel(v:any){
 let s=phmsCleanVisibleText(String(v??'')).trim();
 s=s.replace(/^((?:[↩⬅➡☑✅❌➕➖]|\p{Extended_Pictographic})\uFE0F?)(?:\s*\1)+\s*/u,'$1 ');
 s=s.replace(/^(\S+)(?:\s+\1)+(?=\s|$)/u,'$1');
 if(!s)return 'เปิดรายการ';

 const m=s.match(/^((?:\p{Extended_Pictographic}\uFE0F?(?:\u200D\p{Extended_Pictographic}\uFE0F?)*|[↩⬅➡])\uFE0F?)(?:\s+|$)/u);
 const icon=m?m[1]:'';
 const core=(m?s.slice(m[0].length):s).trim()||'เปิดรายการ';
 if(!icon)return phmsFitActionLabelNoEllipsis(core,16);
 const maxCore=Math.max(6,16-icon.length-1);
 return icon+' '+phmsFitActionLabelNoEllipsis(core,maxCore)
}
function phmsActionUsable(a:any,forButton=false){
 if(!a||typeof a!=="object")return false;
 const type=String(a.type||"");
 if(type==="postback")return !!String(a.data||"").trim();
 if(type==="message")return !!String(a.text||"").trim();
 if(type==="uri")return /^[a-z][a-z0-9+.-]*:/i.test(String(a.uri||"").trim());
 if(type==="datetimepicker")return !!String(a.data||"").trim()&&["date","time","datetime"].includes(String(a.mode||""));
 if(type==="richmenuswitch")return !!String(a.data||"").trim()&&!!String(a.richMenuAliasId||"").trim();
 if(type==="clipboard")return !!String(a.clipboardText||"").trim();
 if(!forButton&&["camera","cameraRoll","location"].includes(type))return true;
 return false
}
function phmsQuickVisibleLabelKey(a:any){
 return phmsNormalizeActionLabel(a?.label||"")
  .replace(/^(?:(?:[↩⬅➡☑✅❌➕➖]|\p{Extended_Pictographic})\uFE0F?\s*)+/u,"")
  .trim().toLocaleLowerCase("th-TH")
}
function phmsThemeAccentFromNode(node:any,current=''){
 const bg=String(node?.header?.backgroundColor||node?.backgroundColor||'').toUpperCase();
 const map:any={
  '#EAF4FF':'blue','#EEF4FF':'blue','#EEF6FF':'blue','#F7FBFF':'blue','#EEF3FA':'blue','#F4F7FB':'blue','#F3F6FA':'blue',
  '#EEF8F3':'green','#F1F8F4':'green','#F0F7F4':'green','#F7FBF9':'green','#F3F8F4':'green',
  '#F4F1FA':'purple','#F7F4FF':'purple',
  '#FFF7E8':'warm','#FFF4E5':'warm','#FFF8E8':'warm','#FFF9ED':'warm',
  '#FDEFF3':'rose','#FDEFF4':'rose','#FFF3F3':'rose',
  '#F7F9FC':'slate','#FAFAFA':'slate','#F4F5F7':'slate','#F8F9FB':'slate'
 };
 if(map[bg])return map[bg];
 // PHMS_CARD_HUE_INFERENCE_V3: honor unfamiliar pastel card header colors, not a rainbow fallback.
 const h=bg.match(/^#([0-9A-F]{6})$/);
 if(h){
  const r=parseInt(h[1].slice(0,2),16),g=parseInt(h[1].slice(2,4),16),b=parseInt(h[1].slice(4,6),16);
  if(Math.max(r,g,b)-Math.min(r,g,b)<5)return 'slate';
  if(r>g+4&&b>g+4)return b>r+3?'purple':'rose';
  if(b>r+4&&b>g+4)return 'blue';
  if(r>g+5&&g>b+4)return 'warm';
  if(g>r+4&&g>b+3)return 'green';
 }
 return current||'slate'
}
function phmsActionSemantic(a:any){
 const cmd=phmsActionCommand(a),label=String(a?.label||''),text=(label+' '+cmd).trim();
 const plainLabel=label.replace(/^\s*(?:(?:\p{Extended_Pictographic}\uFE0F?)|[↩⬅➡])\s*/u,'').trim();
 // PHMS_RED_CANCEL_V2: an explicit cancel/delete stays red even if it navigates back.
 if(/(?:ยกเลิก|ลบ|เอาออก|ล้างข้อมูล|ปฏิเสธ|ถอนสิทธิ|เลิกเชื่อม|ปิดการเชื่อม|ยุติ)/.test(plainLabel)||
   /^(?:ยกเลิก|ลบ|เอาออก|ล้างข้อมูล|ปฏิเสธ|ถอนสิทธิ|เลิกเชื่อม|ปิดการเชื่อม|ยุติ)/.test(cmd))return 'danger';
 if(phmsIsBackAction(a))return 'back';
 // PHMS_BUTTON_COLOR_CONTRACT_V1: green marks a real confirmation, never navigation/add/cancel.
 if(/^(?:ยืนยัน|อนุมัติ|ตกลง$|บันทึก(?:$|ข้อมูล|การแก้ไข|รายการ|นัดนี้|และ|เลย|การเปลี่ยนแปลง))/.test(plainLabel))return 'confirm';
 if(/(?:รับงาน|ทำแล้ว|เสร็จ|สร้าง|เพิ่ม|เชื่อม|ผูก|ส่งคำขอ|ใช้เป็นหลักฐาน|ไปต่อ|เริ่มใช้งาน)/.test(text))return 'success';
 if(/(?:เปลี่ยนคน|เลือกคน|บุคคลในครอบครัว|ครอบครัว|ผู้ดูแล|ผู้รับผิดชอบ|เจ้าของนัด)/.test(text))return 'people';
 if(/(?:ค่าใช้จ่าย|ชำระ|ใบเสร็จ|สลิป|หลักฐานค่าใช้จ่าย|ผู้จ่าย)/.test(text))return 'finance';
 if(/(?:ประวัติ|ที่ผ่านมา|ก่อนหน้า|timeline|ย้อนหลัง|การแก้ไข)/i.test(text))return 'history';
 if(/(?:จัดกลุ่ม|เลือกวิธีจัดกลุ่ม|กรอง|filter|sort|หมวด)/i.test(text))return 'group';
 if(/(?:แจ้งเตือน|เตือนนัด|notification|แจ้งในกลุ่ม)/i.test(text))return 'notify';
 if(/(?:แชร์|share|ส่งข้อความ|ข้อความสำหรับแชร์)/i.test(text))return 'share';
 if(/(?:เอกสาร|ไฟล์|รูป|หลักฐาน|แนบ|อัปโหลด|ดาวน์โหลด)/.test(text))return 'document';
 if(/(?:แก้|ตั้งค่า|จัดการ|เลื่อนนัด|เปลี่ยนการชำระเงิน|เปลี่ยนผู้จ่าย)/.test(text))return 'manage';
 if(/(?:นัด|appointment)/i.test(text))return 'appointment';
 if(/(?:ยา|medication)/i.test(text))return 'medication';
 if(/(?:สุขภาพ|health)/i.test(text))return 'health';
 if(/(?:หน้าเริ่มต้น|home)/i.test(text))return 'home';
 return 'view'
}
function phmsDarkThemePalette(theme='blue'){
 /* PHMS_GLOBAL_BUTTON_THEME_RULE_V4:
  * 1. Ordinary buttons share the card-header color FAMILY, but adjacent controls use distinctly
  *    spaced, low-saturation darker tones (alternating blue/purple/gray or warm relatives).
  * 2. The curated ORDER matters: neighboring shades must visibly differ, not merely be unique.
  * 3. White labels must achieve WCAG 2.1 AA contrast >= 4.5:1 against every background.
  * 4. Green belongs to explicit confirm/save actions; red belongs to cancel/delete.
  * 5. No rainbow per action, no truncation, and never modify private medical records.
  * 6. This applies to LINE Flex card buttons; LINE Quick Reply chip colors are app-owned.
  */
 const palettes:any={"blue":["#285679","#65708D","#346D83","#615979","#3A5775","#557488","#375E81","#725F88"],"purple":["#4A527B","#776989","#3D6C83","#75557B","#446177","#655A87","#425977","#796678"],"warm":["#5B4B41","#87725A","#4F6675","#7A5A52","#5C6079","#80664D","#4E556A","#846B61"],"rose":["#5F4D65","#84667F","#4E657A","#815A69","#515776","#775B82","#586776","#795268"],"slate":["#3D5571","#6D6B86","#376A7D","#745F74","#4A5779","#5A7183","#465B72","#76657D"],"green":["#355A72","#696A85","#436D7A","#745F78","#3E5675","#597383","#425D78","#70617D"]};
 return palettes[String(theme||'slate')]||palettes.slate
}
function phmsSemanticPreferredIndex(semantic:string){
 const order:any={appointment:0,document:1,history:2,share:3,manage:4,people:5,group:6,notify:7,finance:8,medication:9,health:10,home:11,view:0,back:11};
 return Number(order[semantic]??0)
}
function phmsMutedSpecialPalette(semantic:string){
 /* PHMS_LOCKED_SPECIAL_BUTTON_COLORS_V1 */
 if(semantic==='danger')return ['#8F3F4A'];
 if(semantic==='confirm')return ['#256D49'];
 if(semantic==='back')return ['#64748B'];
 return []
}
function phmsHexRgb(hex:string){
 const h=String(hex||'').replace('#','');
 if(!/^[0-9a-f]{6}$/i.test(h))return [0,0,0];
 return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]
}
function phmsColorDistance(a:string,b:string){
 const A=phmsHexRgb(a),B=phmsHexRgb(b);
 const rmean=(A[0]+B[0])/2,dr=A[0]-B[0],dg=A[1]-B[1],db=A[2]-B[2];
 return Math.sqrt((2+rmean/256)*dr*dr+4*dg*dg+(2+(255-rmean)/256)*db*db)
}
function phmsMinDistanceToUsed(color:string,used:Set<string>){
 if(!used.size)return 999;
 let min=999;
 for(const x of used)min=Math.min(min,phmsColorDistance(color,x));
 return min
}
function phmsPickDistinctThemeColor(palette:string[],preferred:number,used:Set<string>){
 const available=palette.filter((x:string)=>!used.has(x));
 if(!available.length)return palette[preferred%palette.length]||'#1F4E79';
 const preferredColor=palette[preferred%palette.length];
 if(preferredColor&&!used.has(preferredColor)&&phmsMinDistanceToUsed(preferredColor,used)>=55)return preferredColor;
 let best=available[0],bestScore=-1;
 for(const c of available){
  const d=phmsMinDistanceToUsed(c,used);
  const idx=palette.indexOf(c);
  const prefDistance=Math.min(Math.abs(idx-preferred),palette.length-Math.abs(idx-preferred));
  const score=d-(prefDistance*2.5);
  if(score>bestScore){best=c;bestScore=score}
 }
 return best
}
/* PHMS_BUTTON_READABILITY_GUARD_V1: two small columns must not cut Thai labels. */
function phmsExpandCrowdedButtonRows(m:any){
 const visibleLength=(v:any)=>{
  const text=String(v||'').trim();
  try{return Array.from(new Intl.Segmenter('th',{granularity:'grapheme'}).segment(text)).length}
  catch{return Array.from(text).length}
 };
 function visit(node:any,depth=0):void{
  if(depth>30||!node||typeof node!=='object')return;
  if(Array.isArray(node)){for(const child of node)visit(child,depth+1);return}
  if(node.type==='box'&&node.layout==='horizontal'&&Array.isArray(node.contents)&&node.contents.length>=2&&
     node.contents.every((x:any)=>x?.type==='button')&&
     node.contents.some((x:any)=>visibleLength(x?.action?.label)>9)){
    node.layout='vertical';
    for(const child of node.contents)delete child.flex;
  }
  for(const [key,val] of Object.entries(node)){
   if(key==='action'||key==='quickReply')continue;
   visit(val,depth+1)
  }
 }
 for(const bubble of phmsFlexBubbles(m))visit(bubble);
 return m
}
/* PHMS_GLOBAL_FLEX_BUTTON_DIMENSIONS_V1
   All cards: same compact LINE button height and spacing.
   Keep accessible text intact; do not change action data, labels, colors, or permissions. */
function phmsNormalizeFlexButtonDimensions(m:any){
 for(const bubble of phmsFlexBubbles(m)){
  const visit=(node:any,depth=0):void=>{
   if(!node||typeof node!=='object'||depth>30)return;
   if(Array.isArray(node)){node.forEach((x:any)=>visit(x,depth+1));return}
   if(node.type==='button'){
    // PHMS_BUTTON_SIZE_STANDARD_V2: md by default; sm only when expressly opted in.
    const compact=node.phmsButtonSize==='sm'||node.phmsButtonSize==='small'||node.phmsKeepSmall===true;
    node.height=compact?'sm':'md';
    delete node.phmsButtonSize;
    delete node.phmsKeepSmall;
    delete node.margin;
    delete node.flex;
    return
   }
   if(node.type==='box'&&Array.isArray(node.contents)&&node.contents.some((x:any)=>x?.type==='button')){
    node.spacing='sm';
    if(node.layout==='horizontal')node.alignItems='center';
   }
   for(const [key,value] of Object.entries(node)){
    if(key==='action'||key==='quickReply')continue;
    visit(value,depth+1)
   }
  };
  visit(bubble);
 }
 return m
}
function phmsApplyDarkFlexButtonPalette(m:any){
 // PHMS_GLOBAL_BUTTON_ADJACENCY_V4: deliberately sequence tested neighboring shades.
 for(const bubble of phmsFlexBubbles(m)){
  const theme=phmsThemeAccentFromNode(bubble,'slate');
  const palette=phmsDarkThemePalette(theme);
  const used=new Set<string>();
  const buttons=phmsCollectFlexButtons(bubble);
  let normalIndex=0;
  for(const button of buttons){
   const semantic=phmsActionSemantic(button.action);
   const special=phmsMutedSpecialPalette(semantic);
   let color='';
   if(special.length){
    // Reserved red/green always override card theme, regardless of label icon/navigation.
    const available=special.filter((x:string)=>!used.has(x));
    color=(available.length?available:special)
      .slice().sort((a:string,b:string)=>phmsMinDistanceToUsed(b,used)-phmsMinDistanceToUsed(a,used))[0];
   }else{
    // Static tested ramp makes adjacent ordinary buttons noticeably different.
    // Restart only after exhausting eight harmonious shades; avoid near-duplicate neighbors.
    color=palette[normalIndex%palette.length];
    normalIndex++;
   }
   button.style='primary';
   button.color=color||palette[0]||'#3D5571';
   used.add(button.color)
  }
 }
 return m
}
/* PHMS_REPLY_BUTTON_REPAIR_V1: restorations required by the central LINE
   card/Quick Reply normalizer. Reply API stays independent of the
   chargeable Push API safety switch. */
function phmsFlexBubbles(m:any):any[]{
  const node=m?.type==="flex"?m.contents:m;
  if(node?.type==="bubble")return [node];
  if(node?.type==="carousel"&&Array.isArray(node.contents))return node.contents.filter((x:any)=>x?.type==="bubble");
  return [];
}
function phmsCollectFlexButtons(node:any,out:any[]=[],depth=0):any[]{
  if(depth>30||!node||typeof node!=="object")return out;
  if(Array.isArray(node)){for(const x of node)phmsCollectFlexButtons(x,out,depth+1);return out}
  if(node.type==="button"&&node.action&&typeof node.action==="object")out.push(node);
  for(const [key,value] of Object.entries(node)){
    if(key==="action"||key==="quickReply")continue;
    phmsCollectFlexButtons(value,out,depth+1);
  }
  return out;
}
function phmsApplyButtonSemantics(button:any){
  if(button?.type==="button"&&phmsActionUsable(button.action,true))button.style="primary";
  return button;
}
function phmsPruneAndStyleButtons(m:any){
  for(const bubble of phmsFlexBubbles(m)){
    const seen=new Set<string>();
    function visit(node:any,depth=0):void{
      if(depth>30||!node||typeof node!=="object")return;
      if(Array.isArray(node)){
        const keep:any[]=[];
        for(const child of node){
          if(child?.type==="button"){
            if(!phmsActionUsable(child.action,true)||!phmsQuickReplyActionAllowed({type:'action',action:child.action}))continue;
            const sig=phmsLineActionSignature(child.action);
            if(sig&&seen.has(sig))continue;
            if(sig)seen.add(sig);
            phmsApplyButtonSemantics(child);
          }else visit(child,depth+1);
          keep.push(child);
        }
        node.splice(0,node.length,...keep);
        return;
      }
      for(const [key,value] of Object.entries(node)){
        if(key==="action"||key==="quickReply")continue;
        visit(value,depth+1);
      }
    }
    visit(bubble);
    if(bubble.footer?.type==="box"&&Array.isArray(bubble.footer.contents)&&bubble.footer.contents.length===0)delete bubble.footer;
  }
  return m;
}
function phmsEnsureUniqueActionIcons(actions:any[]){
  const used=new Set<string>();
  const icons=["📅","📋","📄","👥","✏️","🔍","💊","❤️","📎","🔔","🧾","💰","⚙️","🕘","✅","↩️","🏠","🗂️","📍","🛡️","🔗","🤝","🩺","📝","ℹ️"];
  const preferred:any={appointment:"📅",document:"📄",history:"🕘",share:"🔗",manage:"✏️",people:"👥",group:"🗂️",notify:"🔔",finance:"💰",medication:"💊",health:"❤️",home:"🏠",view:"🔍",back:"↩️",success:"✅",danger:"⚠️"};
  for(const action of Array.isArray(actions)?actions:[]){
    if(!action||typeof action!=="object")continue;
    action.label=phmsNormalizeActionLabel(action.label||"เปิดรายการ");
    const label=String(action.label||"").trim();
    const match=label.match(/^((?:\p{Extended_Pictographic}\uFE0F?(?:\u200D\p{Extended_Pictographic}\uFE0F?)*|[↩⬅➡])\uFE0F?)(?:\s+|$)/u);
    let icon=match?match[1]:"";
    if(icon&&!used.has(icon)){
      used.add(icon);
    }else{
      const plain=(match?label.slice(match[0].length):label).trim()||"เปิดรายการ";
      const candidate=[preferred[phmsActionSemantic(action)],...icons].find((v:any)=>v&&!used.has(v));
      if(candidate){
        icon=candidate;
        action.label=phmsNormalizeActionLabel(icon+" "+plain);
        used.add(icon);
      }else action.label=phmsNormalizeActionLabel(plain);
    }
    if(action.type==="postback")action.displayText=String(action.label||"");
  }
  return actions;
}
function phmsEnsureUniqueFlexButtonIcons(m:any){
  for(const bubble of phmsFlexBubbles(m)){
    const actions=phmsCollectFlexButtons(bubble).map((button:any)=>button.action).filter(Boolean);
    phmsEnsureUniqueActionIcons(actions);
  }
  return m;
}

function phmsQuickItemFromAction(a:any){
 if(!phmsActionUsable(a,true))return null;
 const action:any={...a,label:phmsNormalizeActionLabel(a.label||"เลือก")};
 if(action.type==="postback")action.displayText=action.label;
 return {type:"action",action}
}
function phmsCollectFlexButtonActions(node:any,out:any[]=[],depth=0){
 if(depth>28||!node||typeof node!=="object")return out;
 if(Array.isArray(node)){for(const x of node)phmsCollectFlexButtonActions(x,out,depth+1);return out}
 if(node.type==="button"&&node.action&&typeof node.action==="object")out.push({action:node.action});
 for(const [k,v] of Object.entries(node)){
  if(k==="quickReply")continue;
  phmsCollectFlexButtonActions(v,out,depth+1)
 }
 return out
}
function phmsFirstFlexBubble(m:any){
 if(m?.type!=="flex")return null;
 const c=m?.contents;
 if(c?.type==="bubble")return c;
 if(c?.type==="carousel"&&Array.isArray(c.contents))return c.contents.find((x:any)=>x?.type==="bubble")||null;
 return null
}

function phmsNormalizeFlexBackButtons(node:any,target:any,state={seen:false},depth=0){
 if(depth>30||!node||typeof node!=="object")return state;
 if(Array.isArray(node)){
  const keep:any[]=[];
  for(const child of node){
   if(child?.type==="button"&&child?.action&&phmsIsBackAction(child.action)){
    if(state.seen)continue;
    phmsNormalizeBackAction(child.action,target);
    phmsApplyButtonSemantics(child);
    state.seen=true;keep.push(child);continue
   }
   phmsNormalizeFlexBackButtons(child,target,state,depth+1);keep.push(child)
  }
  node.splice(0,node.length,...keep);return state
 }
 for(const [k,v] of Object.entries(node)){
  if(k==="quickReply"||k==="action")continue;
  phmsNormalizeFlexBackButtons(v,target,state,depth+1)
 }
 return state
}
function phmsEnsureFlexBackButton(m:any){
 // Home is the navigation root. Never add a button that returns to itself.
 if(m?.type==='flex'&&String(m?.altText||'').trim()==='🏡 หน้าเริ่มต้นอิ่มอุ่น')return m;
 // PHMS_APPT_PICKER_COMPACT_BACK: stage one already has a real Cancel action;
 // do not inject a redundant extra navigation button.
 if(m?.type==='flex'&&m?.altText==='🏷️ เลือกแบบนัด')return m;
 if(m?.type!=="flex")return m;
 const target=phmsInferBackTarget(m);
 const state=phmsNormalizeFlexBackButtons(m,target);
 if(state.seen)return m;
 const bubble=phmsFirstFlexBubble(m);if(!bubble)return m;
 const back={type:'button',style:'primary',color:'#64748B',action:{type:"postback",label:phmsNormalizeActionLabel(target.label),data:target.data,displayText:phmsNormalizeActionLabel(target.label)}};
 if(bubble.footer?.type==="box"&&Array.isArray(bubble.footer.contents))bubble.footer.contents.push(back);
 else bubble.footer={type:"box",layout:"vertical",spacing:"sm",paddingAll:"12px",contents:[back]};
 return m
}


/* PHMS_QUICK_REPLY_ACTION_CONTRACT_V1
 Central UX invariant: every visible Quick Reply must have an executable action
 and a real matching route/state handler. Register/test the route before adding
 any new button; never ship placeholder/no-op actions. Do not show unauthorized
 actions. Audit all new action commands end-to-end in LINE before release.
 This transport guard is fail-closed for invalid LINE actions; routing correctness
 also requires static + stateful E2E acceptance tests.
*/
function phmsQuickReplyActionAllowed(item:any){
 const a=item?.action;
 if(item?.type!=='action'||!a||typeof a!=='object')return false;
 const label=String(a.label??'').trim();
 if(!label)return false;
 const typ=String(a.type??'');
 // The Messaging API does not allow rich menu switching via Quick Reply.
 if(typ==='richmenuswitch')return false;
 const cmd=String(a.data??a.text??'').trim();
 if(/^(?:todo|tbd|noop|no[-_ ]?op|not[-_ ]?implemented|coming[-_ ]?soon|undefined|null)$/i.test(cmd))return false;
 // LINE postbacks and message actions have a maximum command payload of 300.
 if((typ==='postback'||typ==='datetimepicker')&&(!cmd||cmd.length>300))return false;
 if(typ==='message'&&(!String(a.text??'').trim()||String(a.text).length>300))return false;
 if(typ==='uri'&&!/^(?:https?:\/\/|line:\/\/|tel:|mailto:)/i.test(String(a.uri??'').trim()))return false;
 if(typ==='clipboard'&&String(a.clipboardText??'').length>1000)return false;
 return phmsActionUsable(a,false);
}

function phmsNormalizeQuickItems(items:any[],target:any,ensureBack=true){
 const list=Array.isArray(items)?items.filter(Boolean):[],seen=new Set<string>(),normal:any[]=[],backs:any[]=[];
 for(const item of list){
  const a=item?.action;if(!phmsQuickReplyActionAllowed(item))continue;
  a.label=phmsNormalizeActionLabel(a.label||'เลือก');
  if(a.type==='postback')a.displayText=a.label;
  if(phmsIsBackAction(a)){
   if(backs.length)continue;
   phmsNormalizeBackAction(a,target);backs.push(item);continue
  }
  const sig=phmsLineActionSignature(a);if(!sig||seen.has(sig))continue;
  seen.add(sig);normal.push(item)
 }
 const labelToSigs=new Map<string,Set<string>>();
 for(const item of normal){
  const a=item.action,key=phmsQuickVisibleLabelKey(a),sig=phmsLineActionSignature(a);
  if(!labelToSigs.has(key))labelToSigs.set(key,new Set<string>());
  labelToSigs.get(key)!.add(sig)
 }
 const unambiguous=normal.filter((item:any)=>{
  const key=phmsQuickVisibleLabelKey(item.action);
  return (labelToSigs.get(key)?.size||0)<=1
 });
 if(ensureBack&&!backs.length){
  const action={type:'postback',label:phmsNormalizeActionLabel(target?.label||'↩️ หน้าเริ่มต้น'),data:String(target?.data||'กลับหน้าเริ่มต้น'),displayText:phmsNormalizeActionLabel(target?.label||'↩️ หน้าเริ่มต้น')};
  backs.push({type:'action',action})
 }
 const out=[...unambiguous.slice(0,12),...backs.slice(0,1)].slice(0,13);
 phmsEnsureUniqueActionIcons(out.map((x:any)=>x?.action).filter(Boolean));
 return out
}
/* PHMS_UNIFIED_IMAGE_RADIUS_V2
 * Central display-only LINE Flex design rule.
 * Images have no native cornerRadius field: apply it to a box around each image.
 * All boxes (including bubble.hero) are normalized; never modify original URLs.
 * person=14px, media=12px, hero=16px.
 */
const PHMS_IMAGE_RADIUS = {person:'14px',media:'12px',hero:'16px'} as const;
function phmsRoundImageRadius(img:any,hero=false){
 const u=String(img?.url||'');
 if(/phms-person-photos|person[_-]?photo/i.test(u))return PHMS_IMAGE_RADIUS.person;
 return hero?PHMS_IMAGE_RADIUS.hero:PHMS_IMAGE_RADIUS.media
}
function phmsRoundedImageBox(img:any,hero=false){
 const x:any={...img};
 // Layout ownership belongs to the containing box, not the image it surrounds.
 const wrapper:any={type:'box',layout:'vertical',
  cornerRadius:phmsRoundImageRadius(img,hero),contents:[x]};
 for(const prop of ['flex','margin','position','offsetTop','offsetBottom','offsetStart','offsetEnd']){
  if(x[prop]!==undefined){wrapper[prop]=x[prop];delete x[prop]}
 }
 // A Flex hero box must span the bubble; small avatars keep their intrinsic size.
 if(hero)wrapper.width='100%';
 else if(typeof x.size==='string'&&/^\d+(?:\.\d+)?px$/.test(x.size)){
  wrapper.width=x.size;
 }
 return wrapper
}
function phmsRoundFlexImages(node:any,depth=0):void{
 if(!node||typeof node!=='object'||depth>35)return;
 if(Array.isArray(node)){
  for(const x of node)phmsRoundFlexImages(x,depth+1);
  return
 }
 if(node.type==='image'){
  // Unsupported image-component properties are deliberately stripped.
  delete node.cornerRadius;delete node.borderRadius;
  return
 }
 if(node.type==='bubble'&&node.hero?.type==='image'){
  node.hero=phmsRoundedImageBox(node.hero,true)
 }
 if(node.type==='box'&&Array.isArray(node.contents)){
  // Already isolated by the original UI: no extra wrapper/spacing.
  if(node.contents.length===1&&node.contents[0]?.type==='image'){
   node.cornerRadius=node.cornerRadius||phmsRoundImageRadius(node.contents[0],false);
  }else{
   node.contents=node.contents.map((ch:any)=>ch?.type==='image'
    ?phmsRoundedImageBox(ch,false):ch)
  }
 }
 for(const [key,value] of Object.entries(node)){
  if(key==='action'||key==='quickReply')continue;
  if(value&&typeof value==='object')phmsRoundFlexImages(value,depth+1)
 }
}
function phmsDualActionMessage(m:any){
 // PHMS_IMOON_ELDER_LANGUAGE_GLOBAL_V2
 // Short, gender-neutral Thai for every action label and static UI heading.
 // Never transform patient-authored text, clinical notes, command data, IDs, or permission payloads.
 const elderWords=(v:any)=>typeof v==='string'?v
  .replace(/รพ\.\/คลินิก|สถานพยาบาล/g,'โรงพยาบาล')
  .replace(/แพทย์ผู้รักษา|แพทย์ที่รักษา/g,'หมอ')
  .replace(/กลุ่มการรักษา\/โรค|กลุ่มโรค\/เรื่องที่รักษา/g,'โรค/เรื่องรักษา')
  .replace(/การเตรียมตัวก่อนเข้ารับบริการ|การเตรียมตัวก่อนนัด/g,'เตรียมตัว')
  .replace(/หมายเหตุทั่วไป/g,'หมายเหตุ')
  .replace(/Permission denied/gi,'ยังไม่มีสิทธิ์ดูข้อมูลนี้')
  .replace(/Loading data failed|Operation failed/gi,'ยังทำรายการไม่ได้ ลองอีกครั้งนะ')
  .replace(/Confirm submission/gi,'ตรวจแล้วกดบันทึกได้เลย'):v;
 const simpleHead=(v:any)=>typeof v==='string'&&/^(?:รพ\.\/คลินิก|สถานพยาบาล|แพทย์ผู้รักษา|กลุ่มการรักษา\/โรค|กลุ่มโรค\/เรื่องที่รักษา|หมายเหตุทั่วไป|การเตรียมตัวก่อนนัด)$/.test(v)?elderWords(v):v;
 const walkUi=(x:any,depth=0):void=>{if(!x||typeof x!=='object'||depth>18)return;if(Array.isArray(x)){for(const y of x)walkUi(y,depth+1);return}
  if(x.action&&typeof x.action.label==='string')x.action.label=elderWords(x.action.label);
  if(x.action&&typeof x.action.displayText==='string')x.action.displayText=elderWords(x.action.displayText);
  if(x.type==='text'&&typeof x.text==='string')x.text=simpleHead(x.text);
  // UI headings only: leave free-form patient notes and clinical values unchanged.
  if(x.type==='text'&&typeof x.text==='string'&&x.text.length<55&&/^(?:รพ\.\/คลินิก|สถานพยาบาล|หมายเหตุทั่วไป|กลุ่มการรักษา\/โรค)\s*[:：]?$/.test(x.text.trim()))x.text=elderWords(x.text);
  if(typeof x.altText==='string')x.altText=elderWords(x.altText);
  for(const k of ['contents','header','body','footer','hero','quickReply','items','action','template','columns'])if(x[k])walkUi(x[k],depth+1);
 };
 walkUi(m);
 phmsSafeLineNode(m);
 if(m?.type==="flex"){
  const existing=Array.isArray(m?.quickReply?.items)?m.quickReply.items:[];
  phmsPruneAndStyleButtons(m);
  const hadInteractive=phmsCollectFlexButtonActions(m).length>0||existing.length>0;
  if(hadInteractive)phmsEnsureFlexBackButton(m);
  phmsPruneAndStyleButtons(m);
  phmsEnsureUniqueFlexButtonIcons(m);
  phmsExpandCrowdedButtonRows(m);
  phmsApplyDarkFlexButtonPalette(m);
  phmsNormalizeFlexButtonDimensions(m);

  const target=phmsInferBackTarget(m,existing);
  const cardActions=phmsCollectFlexButtonActions(m).map((x:any)=>x.action).filter(Boolean);
  const cardSigs=new Set(cardActions.map((a:any)=>phmsLineActionSignature(a)).filter(Boolean));
  const cardLabels=new Set(cardActions.map((a:any)=>phmsQuickVisibleLabelKey(a)).filter(Boolean));

  // CARD_ACTION_WINS_OVER_QUICK_REPLY:
  // 1) never mirror a card button into Quick Reply,
  // 2) same visible label with different record targets is kept on cards only,
  // 3) Quick Reply is reserved for extra/global actions that are real and unambiguous.
  const remaining=existing.filter((item:any)=>{
   const a=item?.action;if(!phmsQuickReplyActionAllowed(item))return false;
   const sig=phmsLineActionSignature(a),label=phmsQuickVisibleLabelKey(a);
   if(sig&&cardSigs.has(sig))return false;
   if(label&&cardLabels.has(label))return false;
   return true
  });

  const quick=phmsNormalizeQuickItems(remaining,target,false);
  if(quick.length)m.quickReply={items:quick};else delete m.quickReply
 }else if(m?.type==="text"&&Array.isArray(m?.quickReply?.items)&&m.quickReply.items.length){
  const existing=m.quickReply.items;
  const target=phmsInferBackTarget(m,existing);
  const quick=phmsNormalizeQuickItems(existing,target,true);
  if(quick.length)m.quickReply={items:quick};else delete m.quickReply
 }
 if(m?.type==='flex')phmsRoundFlexImages(m.contents);
 return phmsSafeLineNode(m)
}
async function replyLine(replyToken:string,text:string,token:string,items:any[]=[]){
 if(String(text||"").startsWith("⚠️")&&items.length<13)items=[...items,qpb("🐞 แจ้งปัญหา","แจ้งปัญหา")];
 const msg:any={type:"text",text};if(items.length)msg.quickReply={items};
 const r=await fetch("https://api.line.me/v2/bot/message/reply",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({replyToken,messages:[phmsDualActionMessage(msg)]})});
 if(!r.ok)console.error("router_reply",r.status,await r.text())
}
async function replyMessages(replyToken:string,token:string,messages:any[]){
 const enhanced=messages.slice(0,5).map(m=>m?.type==="flex"&&String(m?.altText||"").startsWith("📅 นัดหมายของ ")&&m?.contents?.type==="bubble"?m:phmsDualActionMessage(m));
 const r=await fetch("https://api.line.me/v2/bot/message/reply",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({replyToken,messages:enhanced})});
 if(!r.ok)console.error("router_reply_messages",r.status,await r.text())
}
async function pushLine(to:string,text:string,token:string,items:any[]=[]){
 const msg:any={type:"text",text};
 if(items.length)msg.quickReply={items:items.slice(0,13)};
 const r=await phmsChargeableLineFetch("https://api.line.me/v2/bot/message/push",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({to,messages:[phmsDualActionMessage(msg)]})});
 if(!r.ok)console.error("router_push",r.status,await r.text())
}


function phmsRestrictedAppointmentCommand(cmd:string){
 const text=String(cmd||"");
 let m=text.match(/^(?:แก้ค่าใช้จ่ายนัด|แนบหลักฐานค่าใช้จ่าย|เปลี่ยนการชำระเงิน|ค่าใช้จ่ายหลังนัด)\s+#?([0-9a-fA-F-]{8,36})/i);
 if(m)return {code:String(m[1]||""),kind:"finance_edit"};
 m=text.match(/^(?:ค่าใช้จ่ายนัด|รายละเอียดค่ารักษา|ดูรายละเอียดค่ารักษา|รายการค่ารักษา|หลักฐานค่าใช้จ่าย)\s+#?([0-9a-fA-F-]{8,36})/i);
 if(m)return {code:String(m[1]||""),kind:"finance_view"};
 m=text.match(/^(?:ตั้งค่าแจ้งเตือนนัด|ผู้รับแจ้งเตือนนัด|เทมเพลตแจ้งเตือนนัด|สิ่งที่ต้องทำก่อนนัด|เชื่อมนัด|เมนูนัด)\s+#?([0-9a-fA-F-]{8,36})/i);
 if(m)return {code:String(m[1]||""),kind:"manage"};
 m=text.match(/^เลื่อนนัด\s+#?([0-9a-fA-F-]{8,36})/i);
 if(m)return {code:String(m[1]||""),kind:"reschedule"};
 return null
}
async function blockLimitedAppointmentDetail(cmd:string,uid:string,replyToken:string,token:string,u:string,k:string){
 const req=phmsRestrictedAppointmentCommand(cmd);
 if(!req)return false;
 try{
  const caps=await rpcOne(u,k,"phms_line_record_capabilities",{p_line_user_id:uid,p_resource:"appointment",p_record_code:req.code});
  if(req.kind==="finance_view"){
   if(caps?.can_view_finance===true||caps?.can_view_sensitive===true)return false;
   await replyLine(replyToken,"🔒 ส่วนนี้เป็นข้อมูลค่าใช้จ่าย\n\nค่าใช้จ่ายและหลักฐานการชำระเงิน ดูได้เฉพาะเจ้าของข้อมูลสุขภาพ ผู้ดูแลหลัก หรือผู้ช่วยดูแลที่ถูกมอบหมายในนัดนี้และมีสิทธิ์ดูนัด",token,[qpb("📅 ดูรายละเอียดนัด","ดูนัด "+req.code)]);
   return true
  }
  if(req.kind==="finance_edit"){
   if(caps?.can_update_finance===true)return false;
   await replyLine(replyToken,"🔒 คุณมีสิทธิ์ดูค่าใช้จ่ายได้ แต่ยังไม่มีสิทธิ์แก้ไข\n\nการแก้ยอด ช่องทางชำระ ผู้จ่าย หรือแนบหลักฐานการชำระ ต้องมีสิทธิ์แก้ไขนัดของบุคคลนี้ด้วย",token,[qpb("💰 ดูค่าใช้จ่าย","ค่าใช้จ่ายนัด "+req.code),qpb("📅 ดูรายละเอียดนัด","ดูนัด "+req.code)]);
   return true
  }
  if(req.kind==="reschedule"){
   if(caps?.can_update===true)return false;
   try{
    const rr=await rpcOne(u,k,"phms_line_appointment_reschedule_get",{p_line_user_id:uid,p_record_code:req.code});
    if(rr?.is_assignee===true)return false
   }catch{}
   await replyLine(replyToken,"🔒 การเลื่อนนัดทำได้เฉพาะคนที่จัดการนัดได้ หรือคนที่ได้รับมอบหมายให้เลื่อนนัดนี้",token,[qpb("📅 ดูรายละเอียดนัด","ดูนัด "+req.code)]);
   return true
  }
  if(caps?.can_update===true)return false;
  await replyLine(replyToken,"🔒 ส่วนนี้เป็นเมนูจัดการนัด\n\nคุณยังดูรายละเอียด บันทึกหลังนัด และประวัติการแก้ไขได้ตามสิทธิ์ แต่การตั้งค่า/แก้ไขต้องเป็นคนที่จัดการนัดได้",token,[qpb("📅 ดูรายละเอียดนัด","ดูนัด "+req.code)]);
  return true
 }catch{return false}
}

async function queuePermissionNotice(_u:string,_k:string,_uid:string,_memberCode:string,_summary:string){return}
function normalize(v:string){return v.trim().replace(/\s+/g," ")}
function commandKey(cmd:string){switch(cmd){case"ยา":case"ยาของฉัน":return"medications";case"นัด":case"นัดหมาย":return"appointments";case"สุขภาพ":return"health";case"ฉุกเฉิน":return"emergency";case"ช่วยเหลือ":return"help";default:return null}}
function titleFor(key:string){return key==="medications"?"💊 ยา":key==="appointments"?"📅 นัดหมาย":key==="health"?"🩺 สุขภาพ":key==="emergency"?"🚨 ฉุกเฉิน":"💬 ช่วยเหลือ"}
function helpText(){return"💬 เมนูอิ่มอุ่น\n\n• ยา — ดูยาของคนที่กำลังเลือกดู\n• นัดหมาย — ดูนัดของคนที่กำลังเลือกดู\n• สุขภาพ — ดูข้อมูลสุขภาพของคนที่กำลังเลือกดู\n• ครอบครัว — สมาชิก บทบาท และสิทธิ์\n• ฉุกเฉิน — ใช้ข้อมูลของคนที่กำลังเลือกดู\n\nถ้าต้องการเปลี่ยนคน ให้เลือก “เปลี่ยนข้อมูลที่ดู” หรือ “ครอบครัว”"}
function readyText(x:any){const title=titleFor(x.command_key);const auto=x.auto_selected?"✅ ระบบเลือกตัวเลือกเดียวให้อัตโนมัติแล้ว\n":"";let ctx="";if(x.active_scope==="family")ctx=`🏠 ครอบครัว: ${x.family_name||"ครอบครัว"}`+(x.target_person_name?`\n👤 กำลังดูข้อมูลของ: ${x.target_person_name}`:"");else ctx=`👤 กำลังดูข้อมูลของ: ${x.target_person_name||"ข้อมูลของฉัน"}`;if(x.command_key==="appointments"&&!x.target_person_name&&x.active_scope==="family")return`${title}\n${auto}${ctx}\n✅ พร้อมใช้นัดหมายระดับครอบครัว\n\nตรวจคนที่เลือกและสิทธิ์เรียบร้อยแล้ว`;return`${title}\n${auto}${ctx}\n✅ ตรวจคนที่เลือกและสิทธิ์เรียบร้อยแล้ว`}
function permissionDeniedText(x:any){const target=x.target_person_name?`\n👤 ${x.target_person_name}`:"";const fam=x.family_name?`\n🏠 ${x.family_name}`:"";return`🔐 ไม่มีสิทธิ์เข้าถึง ${titleFor(x.command_key).replace(/^.. /,"")}${fam}${target}\n\nอิ่มอุ่นตรวจสิทธิ์ของคนหรือครอบครัวที่เลือกแล้ว และจะไม่เปิดข้อมูลจนกว่าจะได้รับสิทธิ์`}
function familyChoiceText(options:any[],intro="🏠 มีมากกว่า 1 ครอบครัว"){const rows=options.slice(0,10).map((x:any,i:number)=>`${i+1}. ${x.family_name||"ครอบครัว"}`).join("\n");return`${intro}\nช่วยเลือกครอบครัวก่อน\n\n${rows}`}
function personChoiceText(options:any[],familyName?:string){const rows=options.slice(0,10).map((x:any,i:number)=>`${i+1}. ${x.display_name||"บุคคลในครอบครัว"}`).join("\n");return`👤 มีมากกว่า 1 คน${familyName?`ใน ${familyName}`:"ในครอบครัวนี้"}\nช่วยเลือกคนที่ต้องการก่อน\n\n${rows}`}
async function showCurrentSelection(uid:string,replyToken:string,token:string,u:string,k:string){
  const x=await rpcOne(u,k,"phms_get_line_context_state",{p_line_user_id:uid});
  if(!x){await replyLine(replyToken,"⚠️ ยังดูข้อมูลที่เลือกอยู่ไม่ได้ ลองอีกครั้งนะ",token);return}
  const text=x.active_scope==="family"
    ?`👤 ข้อมูลที่กำลังดู\n\n🏠 ครอบครัว: ${x.family_name||"-"}\n👤 คนที่กำลังดู: ${x.family_person_name||"ยังไม่ได้เลือก"}`
    :"👤 ข้อมูลที่กำลังดู\n\nกำลังดู: ข้อมูลของฉัน";
  const items=x.active_scope==="family"
    ?[q("🔄 เปลี่ยนคน","เปลี่ยนคน"),q("🏠 เปลี่ยนครอบครัว","เลือกครอบครัว"),q("👤 ข้อมูลของฉัน","ใช้ข้อมูลของฉัน")]
    :[q("👨‍👩‍👧 ใช้ครอบครัว","เลือกครอบครัว"),q("🏡 หน้าเริ่มต้น","หน้าเริ่มต้น")];
  await replyLine(replyToken,text,token,items)
}
async function showSwitchSelection(replyToken:string,token:string){
  await replyLine(replyToken,"🔄 เปลี่ยนข้อมูลที่ดู\n\nต้องการดูข้อมูลของใคร?",token,[q("👤 ข้อมูลของฉัน","ใช้ข้อมูลของฉัน"),q("👨‍👩‍👧 ครอบครัว","เลือกครอบครัว")])
}
async function handleMain(uid:string,replyToken:string,key:string,token:string,u:string,k:string){if(key==="help"){await replyLine(replyToken,helpText(),token,[q("👤 ข้อมูลที่กำลังดู","ข้อมูลที่กำลังดู"),q("🔄 เปลี่ยนข้อมูลที่ดู","เปลี่ยนข้อมูลที่ดู"),q("🏠 ครอบครัว","ครอบครัว")]);return}const x=await rpcOne(u,k,"phms_prepare_line_main_command",{p_line_user_id:uid,p_command_key:key});if(!x){await replyLine(replyToken,"⚠️ ยังเปิดเมนูนี้ไม่ได้ ลองอีกครั้งนะอีกครั้ง",token);return}const opts=Array.isArray(x.selection_options)?x.selection_options:[];if(x.flow_state==="ready"){const items=x.active_scope==="family"?[q("🔄 เปลี่ยนคน","เปลี่ยนคน"),q("🏠 เปลี่ยนครอบครัว","เลือกครอบครัว"),q("👤 ข้อมูลของฉัน","ใช้ข้อมูลของฉัน")]:[q("👨‍👩‍👧 ใช้ครอบครัว","เลือกครอบครัว"),q("👤 ข้อมูลที่กำลังดู","ข้อมูลที่กำลังดู")];await replyLine(replyToken,readyText(x),token,items);return}if(x.flow_state==="permission_denied"){await replyLine(replyToken,permissionDeniedText(x),token,[q("🔄 เปลี่ยนคน","เปลี่ยนคน"),q("🏠 เปลี่ยนครอบครัว","เลือกครอบครัว"),q("🔑 ขอสิทธิ์","ขอสิทธิ์")]);return}if(x.flow_state==="choose_family"){await replyLine(replyToken,familyChoiceText(opts,"🏠 เมนูนี้ต้องใช้ครอบครัว"),token,opts.slice(0,10).map((o:any)=>qpb(`🏠 ${String(o.family_name||"ครอบครัว").slice(0,17)}`,`เลือกครอบครัว ${o.selection_code}`)));return}if(x.flow_state==="choose_person"){await replyLine(replyToken,personChoiceText(opts,x.family_name),token,opts.slice(0,10).map((o:any)=>qpb(`👤 ${String(o.display_name||"บุคคล").slice(0,18)}`,`เลือกบุคคล ${o.selection_code}`)));return}if(x.flow_state==="no_family"){await replyLine(replyToken,"👨‍👩‍👧 บัญชีนี้ยังไม่มีครอบครัวที่ใช้งานได้",token,[q("👤 ข้อมูลของฉัน","ใช้ข้อมูลของฉัน"),q("👤 ข้อมูลที่กำลังดู","ข้อมูลที่กำลังดู")]);return}if(x.flow_state==="no_person"){await replyLine(replyToken,`👤 ${x.family_name?`ครอบครัว ${x.family_name} `:""}ยังไม่มีบุคคลที่พร้อมใช้กับเมนูนี้`,token,[q("🏠 เปลี่ยนครอบครัว","เลือกครอบครัว"),q("👤 ข้อมูลที่กำลังดู","ข้อมูลที่กำลังดู")]);return}await replyLine(replyToken,`⚠️ ยังไม่ได้เลือกคนหรือครอบครัวที่พร้อมสำหรับเมนูนี้\nสถานะ: ${x.resolution_code||"invalid_context"}`,token,[q("🔄 เปลี่ยนข้อมูลที่ดู","เปลี่ยนข้อมูลที่ดู"),q("🏠 เลือกครอบครัว","เลือกครอบครัว")])}
const resourceMap:Record<string,string>={"ข้อมูลส่วนตัว":"persons","ข้อมูลบุคคล":"persons","profile":"persons","persons":"persons","ยา":"medications","medications":"medications","นัดหมาย":"appointments","นัด":"appointments","appointments":"appointments","สุขภาพ":"health_data","health":"health_data","health_data":"health_data","ฉุกเฉิน":"emergency","ข้อมูลฉุกเฉิน":"emergency","emergency":"emergency","เอกสาร":"documents","documents":"documents","ค่ารักษา":"expenses","ค่าใช้จ่าย":"expenses","expenses":"expenses"};
const actionMap:Record<string,string>={"ดู":"view","view":"view","เพิ่ม":"create","สร้าง":"create","create":"create","แก้ไข":"update","แก้":"update","update":"update","ลบ":"delete","delete":"delete","แจ้งเตือน":"receive_notifications","receive_notifications":"receive_notifications"};
const roleMap:Record<string,string>={"admin":"admin","แอดมิน":"admin","ผู้ช่วยดูแลครอบครัว":"admin","member":"member","สมาชิก":"member","สมาชิกครอบครัว":"member","caregiver":"caregiver","ผู้ดูแล":"caregiver","viewer":"viewer","patient":"patient","ผู้ป่วย":"patient"};
function resourceLabel(r:string){return r==="persons"?"ข้อมูลส่วนตัว":r==="medications"?"ยา":r==="appointments"?"นัดหมาย":r==="health_data"?"สุขภาพ":r==="emergency"?"ข้อมูลฉุกเฉิน":r==="documents"?"เอกสาร":r==="expenses"?"ค่ารักษา":r==="permissions"?"สิทธิ์อนุมัติ":"ข้อมูล"}
function actionLabel(a:string){return a==="view"?"ดู":a==="create"?"เพิ่ม":a==="update"?"แก้ไข":a==="delete"?"ลบ":a==="receive_notifications"?"รับแจ้งเตือน":a==="manage_permissions"?"จัดการสิทธิ์/อนุมัติ":a}
function findPerm(perms:any[],resource:string){return(perms||[]).find((p:any)=>p.resource===resource)||{resource,view:false,create:false,update:false,delete:false,receive_notifications:false}}
function autoNote(prep:any){return prep?.auto_selected?`✅ เลือกครอบครัวให้อัตโนมัติ: ${prep.family_name||"ครอบครัว"}\n\n`:""}
async function prepareFamily(uid:string,u:string,k:string){return rpcOne(u,k,"phms_prepare_line_family_management",{p_line_user_id:uid})}
async function replyFamilyNotReady(x:any,replyToken:string,token:string){const opts=Array.isArray(x?.selection_options)?x.selection_options:[];if(x?.flow_state==="choose_family"){await replyLine(replyToken,familyChoiceText(opts,"🏠 การจัดการครอบครัวต้องเลือกครอบครัว"),token,opts.slice(0,10).map((o:any)=>qpb(`🏠 ${String(o.family_name||"ครอบครัว").slice(0,17)}`,`เลือกครอบครัว ${o.selection_code}`)));return true}if(x?.flow_state==="no_family"){await replyLine(replyToken,"👨‍👩‍👧 ยังไม่มีครอบครัวที่ใช้งานได้\nสร้างหรือเข้าร่วมครอบครัวก่อนใช้งานส่วนนี้",token,[q("🏠 สร้างครอบครัว","สร้างครอบครัว"),q("🔗 เข้าร่วมครอบครัว","เข้าร่วมครอบครัว")]);return true}if(x?.flow_state!=="ready"){await replyLine(replyToken,"⚠️ ยังไม่ได้เลือกครอบครัวที่จะดู ช่วยเลือกครอบครัวก่อน",token,[q("🏠 เลือกครอบครัว","เลือกครอบครัว")]);return true}return false}
function dashboardText(x:any){return`👨‍👩‍👧 ครอบครัว${x.auto_selected?"\n✅ เลือกครอบครัวให้อัตโนมัติ เพราะมีเพียง 1 ครอบครัว":""}\n🏠 ${x.family_name||"ครอบครัว"}\n👥 สมาชิกบัญชี: ${x.member_count??0} คน\n👤 บุคคลในครอบครัว: ${x.person_count??0} คน\n🔐 จัดการสิทธิ์ได้: ${x.can_manage_permissions?"ได้":"ไม่ได้"}${x.pending_access_request_count?`\n📥 คำขอสิทธิ์รอตรวจ: ${x.pending_access_request_count}`:""}`}
async function showDashboard(uid:string,replyToken:string,token:string,u:string,k:string){
 const x=await prepareFamily(uid,u,k);if(await replyFamilyNotReady(x,replyToken,token))return;
 let rows:any[]=[];try{rows=await listMembers(uid,u,k)}catch{}
 const me=rows.find((m:any)=>m?.is_self);
 const myRoles=Array.isArray(me?.roles)?me.roles:[];
 const isAdmin=myRoles.includes("admin");
 const canInvite=x?.is_owner===true||isAdmin;
 let reviewableCount=0;try{reviewableCount=(await rpcRows(u,k,"phms_list_line_access_requests_for_review",{p_line_user_id:uid})).length}catch{}
 const footer:any[]=[
  {type:"button",style:"primary",action:{type:"postback",label:"👥 บัญชีในครอบครัว",data:"บัญชีในครอบครัว"}},
  {type:"button",style:"secondary",action:{type:"postback",label:"👤 บุคคลในครอบครัว",data:"บุคคลในครอบครัว"}}
 ];
 if(x.can_manage_permissions){
  footer.push({type:"button",style:"secondary",action:{type:"postback",label:"🔐 จัดการครอบครัว",data:"สิทธิ์สมาชิก"}});
 }else{
  footer.push({type:"button",style:"secondary",action:{type:"postback",label:"🛡️ ฉันทำอะไรได้บ้าง",data:"สิทธิ์สมาชิก"}});
 }
 if(reviewableCount>0)footer.push({type:"button",style:"secondary",action:{type:"postback",label:"📥 คำขอรออนุมัติ ("+String(reviewableCount)+")",data:"ตรวจคำขอสิทธิ์"}});
 if(x.can_manage_permissions)footer.push({type:"button",style:"secondary",action:{type:"postback",label:"🧩 ตั้งค่าบุคคล",data:"ตั้งค่าบุคคล"}});
 if(canInvite)footer.push({type:"button",style:"secondary",action:{type:"postback",label:"🔗 เชิญคนเข้าครอบครัว",data:"ชวนเข้าครอบครัว"}});
 footer.push({type:"button",action:{type:"postback",label:"🏠 เปลี่ยนครอบครัว",data:"เลือกครอบครัว"}});
 const flex:any={type:"flex",altText:"👨‍👩‍👧 ครอบครัว "+String(x.family_name||""),contents:{type:"bubble",size:"kilo",
  header:{type:"box",layout:"vertical",backgroundColor:"#FFF6E8",paddingAll:"18px",contents:[
   {type:"text",text:"👨‍👩‍👧 ครอบครัว",weight:"bold",size:"xl",color:"#7A5428"},
   {type:"text",text:String(x.family_name||"ครอบครัว"),weight:"bold",size:"md",margin:"sm",wrap:true}
  ]},
  body:{type:"box",layout:"vertical",spacing:"md",paddingAll:"18px",contents:[
   {type:"text",text:"👥 บัญชีสมาชิก: "+String(x.member_count??0)+" คน",size:"sm"},
   {type:"text",text:"👤 บุคคลในครอบครัว: "+String(x.person_count??0)+" คน",size:"sm"},
   {type:"text",text:x.can_manage_permissions?"🔐 คุณจัดการครอบครัวได้":"🔐 คุณใช้งานตามสิทธิ์ที่ได้รับ",size:"sm"},
   ...(reviewableCount>0?[{type:"text",text:"📥 คำขอที่คุณพิจารณาได้: "+String(reviewableCount),size:"sm",weight:"bold"}]:[])
  ]},
  footer:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"14px",contents:footer.slice(0,7)}
 }};
 await replyMessages(replyToken,token,[flex])
}
async function listMembers(uid:string,u:string,k:string){return rpcRows(u,k,"phms_list_line_family_members",{p_line_user_id:uid})}
async function showAccountMembers(uid:string,replyToken:string,token:string,u:string,k:string,prefix="",page=0){
 const x=await prepareFamily(uid,u,k);if(await replyFamilyNotReady(x,replyToken,token))return;
 const rows=await listMembers(uid,u,k),me=rows.find((m:any)=>m?.is_self),myRoles=Array.isArray(me?.roles)?me.roles:[],isAdmin=myRoles.includes("admin"),canInvite=x?.is_owner===true||isAdmin;
 if(!rows.length){await replyLine(replyToken,prefix+"👥 ยังไม่มีบัญชีสมาชิกในครอบครัวนี้",token,[...(canInvite?[qpb("🔗 เชิญสมาชิก","ชวนเข้าครอบครัว")]:[]),qpb("↩️ ครอบครัว","ครอบครัว")]);return}
 const pageSize=8,total=Math.max(1,Math.ceil(rows.length/pageSize)),pg=Math.max(0,Math.min(Number(page)||0,total-1));
 const pageRows=rows.filter((_:any,i:number)=>i>=pg*pageSize&&i<(pg+1)*pageSize);
 const cards=pageRows.map((m:any)=>{
  const roles=[visibleFamilyRoleThai(Array.isArray(m?.roles)?m.roles:[])],effective=visibleFamilyRoleThai(m?.roles),footer:any[]=[];
  if(x.can_manage_permissions){
   if(!m?.is_owner)footer.push({type:"button",style:"primary",action:{type:"postback",label:"🛡️ แก้บทบาท",data:"บทบาท "+String(m?.selection_code||"")}});
   footer.push({type:"button",style:"secondary",action:{type:"postback",label:"👤 สิทธิ์เข้าถึงบุคคล",data:"สิทธิ์เฉพาะบุคคล "+String(m?.selection_code||"")}});
   if(x?.is_owner===true&&!m?.is_owner)footer.push({type:"button",style:"secondary",action:{type:"postback",label:"🗑️ นำออกจากบ้าน",data:"นำสมาชิกออก "+String(m?.selection_code||"")}});
   else if(isAdmin&&!m?.is_owner)footer.push({type:"button",style:"secondary",action:{type:"postback",label:"📤 ขอเจ้าบ้านนำออก",data:"ขอนำสมาชิกออก "+String(m?.selection_code||"")}});
  }else if(m?.is_self&&!m?.is_owner)footer.push({type:"button",style:"secondary",action:{type:"postback",label:"🛡️ ฉันทำอะไรได้บ้าง",data:"เลือกสมาชิก "+String(m?.selection_code||"")}});
  return {type:"bubble",size:"kilo",header:{type:"box",layout:"vertical",backgroundColor:m?.is_self?"#EAF4FF":"#F7F4FF",paddingAll:"16px",contents:[
   {type:"text",text:String(m?.display_name||"สมาชิก")+(m?.is_self?" (ฉัน)":""),weight:"bold",size:"lg",wrap:true},{type:"text",text:"บัญชีสมาชิก",size:"xs",color:"#777777",margin:"sm"}
  ]},body:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"16px",contents:[
   {type:"text",text:"บทบาท: "+roles.join(" • "),size:"sm",wrap:true,color:"#555555"},{type:"text",text:"สิทธิ์หลัก: "+effective,size:"xs",wrap:true,color:"#294B6B"}
  ]},...(footer.length?{footer:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"12px",contents:footer}}:{})}
 });
 const summary:any={type:"bubble",size:"kilo",header:{type:"box",layout:"vertical",backgroundColor:"#FFF6E8",paddingAll:"16px",contents:[
  {type:"text",text:"👥 บัญชีในครอบครัว",weight:"bold",size:"lg",color:"#7A5428"},{type:"text",text:String(x?.family_name||"ครอบครัว"),size:"sm",weight:"bold",margin:"sm",wrap:true}
 ]},body:{type:"box",layout:"vertical",paddingAll:"16px",contents:[{type:"text",text:"ทั้งหมด "+rows.length+" บัญชี • หน้า "+(pg+1)+"/"+total,size:"sm",weight:"bold"}]},
 footer:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"12px",contents:[
  ...(canInvite?[{type:"button",style:"primary",action:{type:"postback",label:"🔗 เชิญสมาชิก",data:"ชวนเข้าครอบครัว"}}]:[]),
  ...(pg>0?[{type:"button",action:{type:"postback",label:"⬅️ ก่อนหน้า",data:"บัญชีในครอบครัว หน้า "+(pg-1)}}]:[]),
  ...(pg<total-1?[{type:"button",action:{type:"postback",label:"➡️ ถัดไป",data:"บัญชีในครอบครัว หน้า "+(pg+1)}}]:[]),
  {type:"button",action:{type:"postback",label:"↩️ ครอบครัว",data:"ครอบครัว"}}
 ]}};
 await replyMessages(replyToken,token,[{type:"flex",altText:"👥 บัญชีในครอบครัว • หน้า "+(pg+1)+"/"+total,contents:{type:"carousel",contents:[summary,...cards]}}])
}
function memberLine(m:any,i:number){const roles=(m.roles||[]).join(", ")||"ไม่มีบทบาท";return`${i+1}. ${m.display_name||"สมาชิก"}${m.is_self?" (คุณ)":""}\nบทบาท: ${roles}${m.can_manage_permissions?" • จัดการสิทธิ์ได้":""}`}
async function showMemberDetail(uid:string,code:string,replyToken:string,token:string,u:string,k:string,prefix=""){
 const d=await rpcOne(u,k,"phms_get_line_family_member_detail",{p_line_user_id:uid,p_member_code:code});
 let access:any={people:[],helpers:[]};
 try{access=await rpcOne(u,k,"phms_list_line_member_person_access",{p_line_user_id:uid,p_member_code:code})||access}catch{}
 const people=Array.isArray(access?.people)?access.people:[];
 const helpers=Array.isArray(access?.helpers)?access.helpers:[];
 const own=people.find((p:any)=>p?.is_self===true);
 const others=people.filter((p:any)=>!p?.is_self && [p?.profile,p?.medications,p?.appointments,p?.health].some((x:any)=>String(x||"none")!=="none"));
 const accessLines:any[]=[];
 if(own){
  accessLines.push({type:"text",text:"• ข้อมูลของตัวเอง — "+(access?.self_manage===false?"ดูได้ แต่แก้เองไม่ได้":"จัดการเองได้"),size:"xs",wrap:true,color:"#294B6B"});
  if(helpers.length){
   accessLines.push({type:"text",text:"• คนที่จัดการข้อมูลแทน:",size:"xs",weight:"bold",wrap:true,color:"#555555"});
   for(const h of helpers.slice(0,6))accessLines.push({type:"text",text:"  - "+String(h?.display_name||"สมาชิก"),size:"xs",wrap:true,color:"#555555"});
  }else if(access?.self_manage===false){
   accessLines.push({type:"text",text:"• ยังไม่ได้กำหนดผู้ช่วยดูแล",size:"xs",wrap:true,color:"#9A5A00"});
  }
 }
 for(const p of others.slice(0,7)){
  const levels=[p?.medications,p?.appointments,p?.health].map((x:any)=>String(x||"none"));
  const allManage=levels.every((x:string)=>x==="manage");
  const allView=levels.every((x:string)=>x==="view"||x==="manage")&&!allManage;
  const detail=p?.is_caregiver||allManage
   ?"จัดการข้อมูลได้เต็ม"
   :allView
    ?"ดูข้อมูลได้"
    :"ยา "+levelThai(p?.medications)+" • นัด "+levelThai(p?.appointments)+" • สุขภาพ "+levelThai(p?.health);
  accessLines.push({type:"text",text:"• "+String(p?.person_name||"บุคคล")+" — "+detail,size:"xs",wrap:true,color:"#444444"});
 }
 if(!accessLines.length)accessLines.push({type:"text",text:"ยังไม่มีการดูข้อมูลสุขภาพ",size:"xs",wrap:true,color:"#777777"});

 const body:any[]=[
  {type:"text",text:String(d.display_name||"สมาชิก")+(d.is_self?" (ฉัน)":""),weight:"bold",size:"lg",wrap:true},
  {type:"text",text:"หน้าที่ในครอบครัว: "+visibleFamilyRoleThai(d?.roles),size:"sm",weight:"bold",wrap:true,color:"#294B6B",margin:"sm"},
  {type:"separator",margin:"md"},
  {type:"text",text:"สิทธิ์ที่มี",size:"sm",weight:"bold",margin:"md"},
  ...accessLines
 ];
 if(d.is_owner)body.push({type:"text",text:"👑 เจ้าบ้านดูแลเรื่องสมาชิก แต่จะดูสุขภาพคนอื่นต้องได้รับอนุญาตก่อน",size:"xs",weight:"bold",color:"#7A5428",margin:"md"});
 else if((d.roles||[]).includes("admin"))body.push({type:"text",text:"🛡️ ผู้ช่วยดูแลครอบครัวช่วยจัดการสมาชิก แต่ไม่ได้สิทธิ์ดูสุขภาพทุกคน",size:"xs",weight:"bold",color:"#58427A",margin:"md"});

 const footer:any[]=[];
 if(d.actor_can_manage_permissions){
  if(!d.is_owner){
   footer.push({type:"button",style:"primary",action:{type:"postback",label:"🛡️ หน้าที่ในครอบครัว",data:"บทบาท "+code}});
  }
  footer.push({type:"button",style:"secondary",action:{type:"postback",label:"👤 ข้อมูลสุขภาพที่เข้าถึงได้หลังเชื่อมบัญชี",data:"สิทธิ์เฉพาะบุคคล "+code}});
  if(access?.self_person_code){
   footer.push({type:"button",style:"secondary",action:{type:"postback",label:"🙋 การจัดการข้อมูลตัวเอง",data:"สิทธิ์ตัวเองสมาชิก "+code}});
   footer.push({type:"button",style:"secondary",action:{type:"postback",label:"👥 คนที่จัดการข้อมูลแทน",data:"เปิดสิทธิ์บุคคล "+String(access.self_person_code)}});
  }
 }
 if(d.is_self&&!d.actor_can_manage_permissions){
  footer.push({type:"button",style:"primary",action:{type:"postback",label:"📥 ขอเพิ่มสิทธิ์",data:"เมนูขอสิทธิ์ของฉัน"}});
  footer.push({type:"button",style:"secondary",action:{type:"postback",label:"👤 ข้อมูลของฉัน",data:"ข้อมูลของฉัน"}});
 }
 if(d.is_self&&access?.self_person_code&&!(d.actor_can_manage_permissions&&!d.is_owner)){
  footer.push({type:"button",style:"secondary",action:{type:"postback",label:"🙋 จัดการข้อมูลของฉัน",data:"สิทธิ์ตัวเองสมาชิก "+code}});
 }
 footer.push({type:"button",action:{type:"postback",label:"↩️ บัญชีทั้งหมด",data:"บัญชีในครอบครัว"}});

 const flex:any={type:"flex",altText:"🛡️ บทบาทและสิทธิ์ "+String(d.display_name||"สมาชิก"),contents:{type:"bubble",size:"kilo",
  header:{type:"box",layout:"vertical",backgroundColor:"#F7F4FF",paddingAll:"16px",contents:[
   {type:"text",text:"🛡️ บทบาทและสิทธิ์",weight:"bold",size:"xl",color:"#58427A"}
  ]},
  body:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"16px",contents:body},
  footer:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"12px",contents:footer.slice(0,5)}
 }};
 await replyMessages(replyToken,token,[flex])
}
async function showMyRequestMenu(uid:string,replyToken:string,token:string,u:string,k:string){
 await replyLine(replyToken,
  "📥 ขอให้คนในบ้านช่วยอนุญาต\n\nเลือกเรื่องที่ต้องการ แล้วอิ่มอุ่นจะส่งคำขอให้คนที่ดูแลเรื่องนั้น",
  token,[
   qpb("🏡 ขอเป็นผู้ช่วยดูแลครอบครัว","เลือกบทบาทที่ต้องการขอ"),
   qpb("👤 ขอสิทธิ์ดูสุขภาพ","เลือกบุคคลเพื่อขอสิทธิ์"),
   qpb("💚 คำขอผู้ดูแลหลัก","คำขอผู้ดูแลหลัก"),
   qpb("↩️ ฉันทำอะไรได้บ้าง","สิทธิ์สมาชิก")
  ])
}
async function showRoleRequestMenu(uid:string,replyToken:string,token:string,u:string,k:string){
 await replyLine(replyToken,
  "🏡 ขอเป็นผู้ช่วยดูแลครอบครัว\n\nเจ้าบ้านจะเป็นคนดูคำขอและตอบรับ\nถ้าอยากดูยา นัดหมอ หรือเรื่องสุขภาพของใคร ให้เลือกชื่อคนนั้น แล้วขอสิทธิ์แยกต่างหากนะ",
  token,[
   qpb("🏡 ขอเป็นผู้ช่วยดูแลครอบครัว","ขอบทบาท admin"),
   qpb("👤 ขอสิทธิ์จัดการข้อมูลบุคคล","เลือกบุคคลเพื่อขอสิทธิ์"),
   qpb("↩️ กลับ","เมนูขอสิทธิ์ของฉัน")
  ])
}
async function choosePersonForMyRequest(uid:string,replyToken:string,token:string,u:string,k:string,page=0){
 const people=await rpcRows(u,k,"phms_list_line_context_persons",{p_line_user_id:uid}),pageSize=9,total=Math.max(1,Math.ceil(people.length/pageSize)),pg=Math.max(0,Math.min(Number(page)||0,total-1));
 const rows=people.filter((_:any,i:number)=>i>=pg*pageSize&&i<(pg+1)*pageSize),items:any[]=rows.map((p:any)=>qpb("👤 "+String(p.display_name||"บุคคล").slice(0,18),"ขอสิทธิ์แบบง่าย "+String(p.selection_code)));
 if(pg>0)items.push(qpb("⬅️ ก่อนหน้า","เลือกบุคคลเพื่อขอสิทธิ์ หน้า "+(pg-1)));
 if(pg<total-1)items.push(qpb("➡️ ถัดไป","เลือกบุคคลเพื่อขอสิทธิ์ หน้า "+(pg+1)));
 items.push(qpb("↩️ กลับ","เมนูขอสิทธิ์ของฉัน"));
 await replyLine(replyToken,"👤 ขอสิทธิ์เข้าถึงบุคคล\n\nเลือกบุคคลที่ต้องการขอสิทธิ์\nหน้า "+(pg+1)+"/"+total,token,items)
}
async function showSimplePersonRequest(uid:string,personCode:string,replyToken:string,token:string,u:string,k:string){
 const people=await rpcRows(u,k,"phms_list_line_context_persons",{p_line_user_id:uid});
 const p=people.find((x:any)=>String(x.selection_code)===String(personCode));
 await replyLine(replyToken,
  "🔐 ขอสิทธิ์กับ "+String(p?.display_name||"บุคคล")+"\n\nเลือกแบบที่ต้องการ\n• ดูทั้งหมด = ดูยา นัดหมาย สุขภาพ\n• จัดการทั้งหมด = ดู/เพิ่ม/แก้ไข/ลบข้อมูลทั้งหมดของคนนี้",
  token,[
   qpb("👀 ขอดูข้อมูลทั้งหมด","ส่งคำขอสิทธิ์แบบง่าย "+personCode+" view"),
   qpb("✏️ ขอดูและแก้ไขได้ทุกเรื่อง","ส่งคำขอสิทธิ์แบบง่าย "+personCode+" manage"),
   qpb("↩️ เลือกคนใหม่","เลือกบุคคลเพื่อขอสิทธิ์")
  ])
}
async function showCaregiverTargets(uid:string,memberCode:string,replyToken:string,token:string,u:string,k:string,page=0){
 const m=await rpcOne(u,k,"phms_get_line_family_member_detail",{p_line_user_id:uid,p_member_code:memberCode});
 const access=await rpcOne(u,k,"phms_list_line_member_person_access",{p_line_user_id:uid,p_member_code:memberCode}),rows=Array.isArray(access?.people)?access.people:[];
 const people=(await rpcRows(u,k,"phms_list_line_context_persons",{p_line_user_id:uid})).filter((p:any)=>!(rows.find((x:any)=>String(x.person_code)===String(p.selection_code))?.is_self));
 const pageSize=8,total=Math.max(1,Math.ceil(people.length/pageSize)),pg=Math.max(0,Math.min(Number(page)||0,total-1)),items:any[]=[];
 for(const p of people.filter((_:any,i:number)=>i>=pg*pageSize&&i<(pg+1)*pageSize)){
  const row=rows.find((x:any)=>String(x.person_code)===String(p.selection_code)),assigned=!!row?.is_caregiver;
  items.push(qpb((assigned?"✅ ":"⬜ ")+String(p.display_name||"บุคคล").slice(0,17),(assigned?"นำผู้ช่วยดูแลออก ":"เพิ่มผู้ช่วยดูแล ")+memberCode+" "+String(p.selection_code)))
 }
 if(pg>0)items.push(qpb("⬅️ ก่อนหน้า","ผู้ช่วยดูแล "+memberCode+" "+(pg-1)));
 if(pg<total-1)items.push(qpb("➡️ ถัดไป","ผู้ช่วยดูแล "+memberCode+" "+(pg+1)));
 items.push(qpb("↩️ กลับบทบาท","บทบาท "+memberCode));
 await replyLine(replyToken,"🧑‍⚕️ ผู้ช่วยดูแลสุขภาพ — "+String(m?.display_name||"สมาชิก")+"\n\nเลือกคนที่ให้ดูแลได้หลายคน • หน้า "+(pg+1)+"/"+total,token,items)
}
function rosterShortBirth(x:any){
 const raw=String(x?.birth_info?.date||'');const m=raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
 if(!m)return '';
 const months=['','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
 return Number(m[3])+' '+months[Number(m[2])]
}
function rosterDate(v:any){
 const s=String(v||'');if(!s)return '—';
 try{return new Intl.DateTimeFormat('th-TH',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Bangkok'}).format(new Date(s))}catch{return s}
}
async function showMembers(uid:string,replyToken:string,token:string,u:string,k:string,prefix="",page=0){
 const x=await prepareFamily(uid,u,k);
 if(await replyFamilyNotReady(x,replyToken,token))return;
 const actorMembers=await listMembers(uid,u,k);
 const actorSelf=actorMembers.find((m:any)=>m?.is_self===true);
 const actorMemberCode=String(actorSelf?.selection_code||actorSelf?.member_code||"");
 const roster=await rpcOne(u,k,"phms_list_line_family_roster",{p_line_user_id:uid});
 let rows=Array.isArray(roster?.entries)?[...roster.entries]:[];
 let prefItems:any[]=[];
 try{
  const pr=await rpcOne(u,k,"phms_list_line_person_display_preferences",{p_line_user_id:uid});
  prefItems=Array.isArray(pr?.items)?pr.items:[]
 }catch{}
 const prefMap=new Map(prefItems.map((z:any)=>[String(z.person_code||""),z]));
 rows.sort((a:any,b:any)=>{
  if(!!a?.is_self!==!!b?.is_self)return a?.is_self?-1:1;
  const pa:any=prefMap.get(String(a?.person_code||""))||{},pbx:any=prefMap.get(String(b?.person_code||""))||{};
  if(!!pa?.is_pinned!==!!pbx?.is_pinned)return pa?.is_pinned?-1:1;
  const ao=Number.isFinite(Number(pa?.display_order))?Number(pa.display_order):999999;
  const bo=Number.isFinite(Number(pbx?.display_order))?Number(pbx.display_order):999999;
  if(ao!==bo)return ao-bo;
  const au=Number(pa?.use_count||0),bu=Number(pbx?.use_count||0);if(au!==bu)return bu-au;
  const at=Date.parse(String(pa?.last_used_at||""))||0,bt=Date.parse(String(pbx?.last_used_at||""))||0;if(at!==bt)return bt-at;
  return String(a?.display_name||"").localeCompare(String(b?.display_name||""),"th")
 });
 const pageSize=8,totalPages=Math.max(1,Math.ceil(rows.length/pageSize)),safePage=Math.max(0,Math.min(Number(page)||0,totalPages-1));
 const pageRows=rows.slice(safePage*pageSize,(safePage+1)*pageSize);
 const photoMap=new Map<string,string>();
 try{
  const dir=await rpcOne(u,k,"phms_list_line_family_person_directory_v2",{p_line_user_id:uid});
  for(const p of (Array.isArray(dir?.people)?dir.people:[])){
   if(p?.person_code&&p?.photo_object_name)photoMap.set(String(p.person_code),String(p.photo_object_name))
  }
 }catch{}
 if(!rows.length){
  await replyLine(replyToken,prefix+"👥 ยังไม่มีสมาชิกหรือบุคคลในครอบครัวนี้",token,[
   ...(x.can_manage_permissions?[qpb("➕ เพิ่มบุคคล","เพิ่มคน"),qpb("🔗 เชิญสมาชิก","ชวนเข้าครอบครัว")]:[]),
   qpb("↩️ ครอบครัว","ครอบครัว")
  ]);return
 }
 const cards:any[]=await Promise.all(pageRows.map(async(m:any)=>{
  const roles=[visibleFamilyRoleThai(m?.roles)];
  const caregivers=Array.isArray(m?.caregivers)?m.caregivers:[];
  const primary=caregivers.find((c:any)=>c?.is_primary===true);
  const personIsOwner=Array.isArray(m?.roles)&&m.roles.includes("owner");
  const linked=!!m?.line_linked;
  const can=!!m?.can_view;
  const body:any[]=[
   {type:"text",text:String(m.display_name||"สมาชิก")+(m.is_self?" (ฉัน)":""),weight:"bold",size:"md",wrap:true},
   {type:"text",text:String(m.relationship_label||(m.entry_type==="account_only"?"สมาชิกบัญชี":"สมาชิกในครอบครัว")),size:"xs",color:"#777777",margin:"sm",wrap:true},
   ...(x?.can_manage_permissions===true?[{type:"text",text:linked?"🟢 เชื่อมบัญชี LINE แล้ว":"⚪ ยังไม่เชื่อมบัญชี LINE",size:"xs",color:linked?"#2F6B4F":"#8A6B2F",margin:"sm",wrap:true}]:[]),
   ...(roles.length?[{type:"text",text:"บทบาท: "+roles.join(" • "),size:"xs",wrap:true,color:"#555555",margin:"sm"}]:[]),
   ...(m.entry_type==="person"&&primary&&m?.self_manage===false?[{type:"text",text:"ผู้จัดการหลัก: "+String(primary.display_name||"สมาชิก"),size:"xs",wrap:true,color:"#555555",margin:"sm"}]:[])
  ];
  if(m.entry_type==="person"&&can){
   body.push({type:"separator",margin:"md"});
   if(m?.birth_info?.age!==null&&m?.birth_info?.age!==undefined){
    body.push({type:"text",text:"อายุ "+String(m.birth_info.age)+" ปี"+(m?.birth_info?.date?" ("+rosterShortBirth(m)+")":""),size:"xs",wrap:true,color:"#555555",margin:"md"})
   }
   body.push({type:"text",text:"💊 ยา "+String(m.medication_count??0)+" • 📅 นัด "+String(m.appointment_count??0)+" • ❤️ สุขภาพ "+String(m.health_count??0),size:"sm",weight:"bold",wrap:true,margin:"md"});
   // One divider below the counts, before any upcoming appointment or health summary.
   body.push({type:"separator",margin:"md"});
   if(m?.next_appointment)body.push({type:"text",text:"นัดถัดไป: "+String(m.next_appointment.title||"นัดหมาย")+"\n"+rosterDate(m.next_appointment.appointment_at),size:"xs",wrap:true,color:"#555555",margin:"sm"});
   if(m?.next_appointment&&m?.latest_health)body.push({type:"separator",margin:"md"});
   if(m?.latest_health){
    const h=m.latest_health;
    const hv=h.systolic&&h.diastolic?String(h.systolic)+"/"+String(h.diastolic):String(h.value_numeric??h.value_text??"—");
    body.push({type:"text",text:"สุขภาพล่าสุด: "+String(h.measurement_type||"ข้อมูลสุขภาพ")+" "+hv+(h.unit?" "+String(h.unit):""),size:"xs",wrap:true,color:"#555555",margin:"sm"})
   }
  }else if(m.entry_type==="person"){
   body.push({type:"text",text:"🔒 ไม่มีสิทธิ์ดูรายละเอียดของบุคคลนี้",size:"xs",wrap:true,color:"#777777",margin:"md"})
  }
  const footer:any[]=[];
  if(m.entry_type==="person"&&can){
   footer.push({type:"button",style:"primary",action:{type:"postback",label:"จัดการ / เปิดภาพรวม",data:"เปิดบุคคล "+String(m.person_code||"")}})
  }
  if(m.entry_type==="person"&&!linked&&x.can_manage_permissions){
   footer.push({type:"button",style:"secondary",action:{type:"postback",label:m?.setup_status==="draft"?"🗂️ แก้ไข Draft":"⚙️ ตั้งค่าคนนี้",data:m?.setup_status==="draft"?"ตั้งค่าบุคคลร่าง "+String(m.person_code||""):"ตั้งค่าก่อนเชื่อม "+String(m.person_code||"")}})
  }
  if(m.entry_type==="person"&&!m?.is_self&&x?.can_manage_permissions===true){
   const personLabel=String(m?.display_name||"บุคคลนี้").trim()||"บุคคลนี้";
   const accessLabel=("🔐 สิทธิ์ของ "+personLabel).slice(0,20);
   footer.push({type:"button",style:"secondary",action:{type:"postback",label:accessLabel,data:"เปิดสิทธิ์บุคคล "+String(m.person_code||"")}})
  }else if(m.entry_type==="person"&&!can&&!(x.can_manage_permissions&&!linked)){
   footer.push({type:"button",style:"secondary",action:{type:"postback",label:"🔐 ขอสิทธิ์",data:"ขอสิทธิ์ดูบุคคล "+String(m.person_code||"")}})
  }
  if(m.entry_type==="person"&&m?.person_code&&!m?.is_self){
   const pref:any=prefMap.get(String(m.person_code||""))||{};
   footer.push({type:"button",style:"secondary",action:{type:"postback",label:pref?.is_pinned?"📍 เลิกปักหมุด":"📌 ปักหมุด",data:"ตั้งลำดับบุคคล "+String(m.person_code||"")+" "+(pref?.is_pinned?"unpin":"pin")}})
  }
  if(m.entry_type==="person"&&!personIsOwner&&!m?.is_self){
   if(x?.is_owner===true)footer.push({type:"button",style:"secondary",action:{type:"postback",label:"🗑️ นำออกจากครอบครัว",data:"นำบุคคลออก "+String(m.person_code||"")}});
   else if(x?.can_manage_permissions===true)footer.push({type:"button",style:"secondary",action:{type:"postback",label:"📤 ขอเจ้าบ้านนำออก",data:"ขอนำบุคคลออก "+String(m.person_code||"")}})
  }
  const photoObject=m.entry_type==="person"?photoMap.get(String(m.person_code||"")):null;
  const photoUrl=photoObject?await signedPersonPhoto(u,k,photoObject):null;
  return {type:"bubble",size:"kilo",
   ...(photoUrl?{hero:{type:"image",url:photoUrl,size:"full",aspectRatio:"20:10",aspectMode:"cover"}}:{}),
   header:{type:"box",layout:"vertical",backgroundColor:m.is_self?"#EAF4FF":x?.can_manage_permissions===true?(linked?"#F1F8F4":"#FFF8E8"):"#F1F5FA",paddingAll:"14px",contents:[
    {type:"text",text:m.entry_type==="account_only"?"👥 สมาชิกบัญชี":"👤 บุคคลในครอบครัว",size:"xs",color:"#666666",weight:"bold"}
   ]},
   body:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"14px",contents:body},
   ...(footer.length?{footer:{type:"box",layout:"vertical",paddingAll:"12px",spacing:"sm",contents:footer.slice(0,6)}}:{})
  }
 }));
 const summary:any={type:"bubble",size:"kilo",
  header:{type:"box",layout:"vertical",backgroundColor:"#EAF4FF",paddingAll:"16px",contents:[
   {type:"text",text:"👥 บุคคลในครอบครัว",weight:"bold",size:"lg",color:"#1F4B7A"},
   {type:"text",text:String(x?.family_name||"ครอบครัว"),size:"sm",weight:"bold",margin:"sm",wrap:true}
  ]},
  body:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"16px",contents:[
   {type:"text",text:"ทั้งหมด "+String(rows.length)+" รายการ"+(totalPages>1?" • หน้า "+(safePage+1)+"/"+totalPages:""),size:"sm",weight:"bold"},
   {type:"text",text:"เลือกการ์ดเพื่อเปิดภาพรวมของคนนั้น อิ่มอุ่นจะแสดงเฉพาะบุคคลที่คุณมองเห็นตามสิทธิ์",size:"xs",wrap:true,color:"#777777"}
  ]},
  footer:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"12px",contents:[
   {type:"button",style:"primary",action:{type:"postback",label:"↕️ จัดลำดับที่ฉันเห็น",data:"จัดลำดับบุคคล"}},
   ...(x.can_manage_permissions?[{type:"button",style:"secondary",action:{type:"postback",label:"➕ เพิ่มบุคคล",data:"เพิ่มคน"}}]:[]),
   ...(safePage>0?[{type:"button",style:"secondary",action:{type:"postback",label:"⬅️ ก่อนหน้า",data:"บุคคลในครอบครัว หน้า "+String(safePage-1)}}]:[]),
   ...(safePage<totalPages-1?[{type:"button",style:"secondary",action:{type:"postback",label:"➡️ ถัดไป",data:"บุคคลในครอบครัว หน้า "+String(safePage+1)}}]:[]),
   {type:"button",action:{type:"postback",label:"↩️ ครอบครัว",data:"ครอบครัว"}}
  ]}
 };
 await replyMessages(replyToken,token,[{type:"flex",altText:"👥 บุคคลในครอบครัว",contents:{type:"carousel",contents:[summary,...cards].slice(0,12)}}])
}

async function showPersonOrderManager(uid:string,replyToken:string,token:string,u:string,k:string,page=0,prefix=""){
 const roster=await rpcOne(u,k,"phms_list_line_family_roster",{p_line_user_id:uid});
 let rows=(Array.isArray(roster?.entries)?[...roster.entries]:[]).filter((x:any)=>x?.entry_type==="person");
 let prefItems:any[]=[];
 try{
  const pr=await rpcOne(u,k,"phms_list_line_person_display_preferences",{p_line_user_id:uid});
  prefItems=Array.isArray(pr?.items)?pr.items:[]
 }catch{}
 const prefMap=new Map(prefItems.map((z:any)=>[String(z?.person_code||""),z]));
 rows.sort((a:any,b:any)=>{
  if(!!a?.is_self!==!!b?.is_self)return a?.is_self?-1:1;
  const pa:any=prefMap.get(String(a?.person_code||""))||{},pb:any=prefMap.get(String(b?.person_code||""))||{};
  if(!!pa?.is_pinned!==!!pb?.is_pinned)return pa?.is_pinned?-1:1;
  const ao=Number.isFinite(Number(pa?.display_order))?Number(pa.display_order):999999;
  const bo=Number.isFinite(Number(pb?.display_order))?Number(pb.display_order):999999;
  if(ao!==bo)return ao-bo;
  const au=Number(pa?.use_count||0),bu=Number(pb?.use_count||0);if(au!==bu)return bu-au;
  const at=Date.parse(String(pa?.last_used_at||""))||0,bt=Date.parse(String(pb?.last_used_at||""))||0;if(at!==bt)return bt-at;
  return String(a?.display_name||"").localeCompare(String(b?.display_name||""),"th")
 });
 const pageSize=7,total=Math.max(1,Math.ceil(rows.length/pageSize)),pg=Math.max(0,Math.min(Number(page)||0,total-1));
 const pageRows=rows.slice(pg*pageSize,(pg+1)*pageSize);
 const summary:any={type:"bubble",size:"kilo",
  header:{type:"box",layout:"vertical",backgroundColor:"#FFF7E8",paddingAll:"16px",contents:[
   {type:"text",text:"↕️ จัดลำดับที่ฉันเห็น",weight:"bold",size:"lg",color:"#805B18"},
   {type:"text",text:"มุมมองส่วนตัว • ไม่กระทบสมาชิกคนอื่น",size:"xs",color:"#8A6B2F",margin:"sm",wrap:true}
  ]},
  body:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"16px",contents:[
   ...(prefix?[{type:"text",text:prefix,size:"sm",weight:"bold",color:"#285943",wrap:true}]:[]),
   {type:"text",text:"ฉันอยู่แรกสุดเสมอ → คนที่ปักหมุด → ลำดับที่จัดเอง",size:"sm",wrap:true},
   {type:"text",text:"หน้า "+String(pg+1)+" / "+String(total),size:"xs",color:"#777777"}
  ]},
  footer:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"12px",contents:[
   ...(pg>0?[{type:"button",style:"secondary",action:{type:"postback",label:"⬅️ ก่อนหน้า",data:"จัดลำดับบุคคล "+String(pg-1)}}]:[]),
   ...(pg<total-1?[{type:"button",style:"secondary",action:{type:"postback",label:"➡️ ถัดไป",data:"จัดลำดับบุคคล "+String(pg+1)}}]:[]),
   {type:"button",action:{type:"postback",label:"↩️ บุคคลในครอบครัว",data:"บุคคลในครอบครัว"}}
  ]}
 };
 const cards=pageRows.map((p:any,idx:number)=>{
  const pc=String(p?.person_code||""),pref:any=prefMap.get(pc)||{};
  const footer:any[]=p?.is_self?[
   {type:"button",action:{type:"postback",label:"↩️ กลับรายชื่อ",data:"บุคคลในครอบครัว"}}
  ]:[
   {type:"button",style:"primary",action:{type:"postback",label:pref?.is_pinned?"📍 เลิกปักหมุด":"📌 ปักหมุด",data:"ตั้งลำดับบุคคล "+pc+" "+(pref?.is_pinned?"unpin":"pin")+" "+String(pg)}},
   {type:"button",style:"secondary",action:{type:"postback",label:"⬆️ ขึ้น",data:"ตั้งลำดับบุคคล "+pc+" move_up "+String(pg)}},
   {type:"button",style:"secondary",action:{type:"postback",label:"⬇️ ลง",data:"ตั้งลำดับบุคคล "+pc+" move_down "+String(pg)}}
  ];
  return {type:"bubble",size:"kilo",
   header:{type:"box",layout:"vertical",backgroundColor:p?.is_self?"#EAF4FF":pref?.is_pinned?"#FFF7E8":"#F7F9FC",paddingAll:"14px",contents:[
    {type:"text",text:String(pg*pageSize+idx+1)+". "+String(p?.display_name||"บุคคล")+(p?.is_self?" (ฉัน)":""),weight:"bold",size:"md",wrap:true},
    {type:"text",text:p?.is_self?"ตำแหน่งคงที่อันดับแรก":pref?.is_pinned?"📌 ปักหมุดแล้ว":"ยังไม่ปักหมุด",size:"xs",color:"#777777",margin:"sm"}
   ]},
   body:{type:"box",layout:"vertical",paddingAll:"14px",contents:[
    {type:"text",text:p?.is_self?"บัญชีของคุณอยู่แรกเสมอ":"ปักหมุดหรือเลื่อนขึ้น/ลงเฉพาะมุมมองของคุณ",size:"xs",wrap:true,color:"#666666"}
   ]},
   footer:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"12px",contents:footer}
  }
 });
 await replyMessages(replyToken,token,[{type:"flex",altText:"↕️ จัดลำดับบุคคล",contents:{type:"carousel",contents:[summary,...cards].slice(0,12)}}])
}
async function showPersonDashboardRouter(uid:string,personCode:string,replyToken:string,token:string,u:string,k:string){
 try{
  const selected=await rpcOne(u,k,"phms_select_line_context_person",{p_line_user_id:uid,p_selection_code:personCode});
  const d=await rpcOne(u,k,"phms_get_line_person_dashboard",{p_line_user_id:uid});
  const meds=d?.summaries?.medications||{},appts=d?.summaries?.appointments||{},health=d?.summaries?.health_data||{};
  let personTheme="#6C9CB9";
  try{const pref=await rpcOne(u,k,"phms_line_person_theme_color",{p_line_user_id:uid,p_color:null});if(/^#[0-9A-Fa-f]{6}$/.test(String(pref?.color||"")))personTheme=String(pref.color)}catch{}
  const tint=(hex:string)=>{const vals=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));return "#"+vals.map(v=>Math.round(v*0.17+255*0.83).toString(16).padStart(2,"0")).join("")};
  const personThemeLight=tint(personTheme);

  const selfManage=d?.self_access?.profile?.update===true||
    d?.self_access?.medications?.update===true||
    d?.self_access?.appointments?.update===true||
    d?.self_access?.health_data?.update===true;
  const personName=String(d?.display_name||selected?.person_display_name||"บุคคล");
  let extras:any={};try{extras=await rpcOne(u,k,"phms_line_person_extra_summaries",{p_line_user_id:uid})||{}}catch(e){console.error("person_extra_summaries",String(e))}

  const previewDoc=extras?.documents?.view===true&&Array.isArray(extras?.documents?.items)?extras.documents.items[0]:null;
  if(previewDoc?.preview_bucket&&previewDoc?.preview_path){
   const bucket=String(previewDoc.preview_bucket),path=String(previewDoc.preview_path);
   if(/^[a-zA-Z0-9_-]+$/.test(bucket)&&path.length<1024){
    try{
     const endpoint=u+"/storage/v1/object/sign/"+encodeURIComponent(bucket)+"/"+path.split("/").map(encodeURIComponent).join("/");
     const response=await fetch(endpoint,{method:"POST",headers:{...rh(k),"Content-Type":"application/json"},body:JSON.stringify({expiresIn:3600})});
     if(response.ok){
      const signed=await response.json(),relative=String(signed?.signedURL||signed?.signedUrl||"");
      if(relative.startsWith("/"))previewDoc.preview_url=u+relative;
      else if(relative.startsWith("https://"))previewDoc.preview_url=relative;
     }
    }catch(e){console.error("document_preview_sign_failed",String(e))}
   }
  }
  const body:any[]=[
   {type:"box",layout:"horizontal",contents:[
    {type:"text",text:"💊 ยา",size:"sm",color:"#666666",flex:5},
    {type:"text",text:String(meds?.count??0)+" รายการ",size:"sm",weight:"bold",align:"end",flex:5}
   ]},
   {type:"box",layout:"horizontal",contents:[
    {type:"text",text:"📅 นัดหมาย",size:"sm",color:"#666666",flex:5},
    {type:"text",text:String(appts?.count??0)+" รายการ",size:"sm",weight:"bold",align:"end",flex:5}
   ]},
   {type:"box",layout:"horizontal",contents:[
    {type:"text",text:"❤️ สุขภาพ",size:"sm",color:"#666666",flex:5},
    {type:"text",text:String(health?.count??0)+" รายการ",size:"sm",weight:"bold",align:"end",flex:5}
   ]},
   ...(d?.is_self?[
    {type:"separator",margin:"md"},
    {type:"text",text:"🙋 สิทธิ์ข้อมูลของฉัน: "+(selfManage?"จัดการข้อมูลตัวเองได้":"ดูได้ แต่แก้เองไม่ได้"),size:"sm",weight:"bold",wrap:true,color:selfManage?"#285943":"#8A6B2F",margin:"md"}
   ]:[])
  ];
  const footer:any[]=[];
  if(d?.access?.medications?.view)footer.push({type:"button",style:"primary",action:{type:"postback",label:"💊 ยา",data:"เปิดข้อมูลบุคคล medications "+String(d.person_code||personCode)}});
  if(d?.access?.appointments?.view)footer.push({type:"button",style:"primary",action:{type:"postback",label:"📅 นัดหมาย",data:"เปิดข้อมูลบุคคล appointments "+String(d.person_code||personCode)}});
  if(d?.access?.health_data?.view)footer.push({type:"button",style:"primary",action:{type:"postback",label:"❤️ สุขภาพ",data:"เปิดข้อมูลบุคคล health "+String(d.person_code||personCode)}});
  if(d?.is_self){
 footer.push({type:"button",style:"secondary",action:{type:"postback",label:"👀 คนที่ดูข้อมูลฉันได้",data:"คนที่ดูข้อมูลฉันได้ 0"}});
 footer.push({type:"button",style:"secondary",action:{type:"postback",label:"🙋 จัดการสิทธิ์ข้อมูลของฉัน",data:"จัดการสิทธิ์ข้อมูลของฉัน"}});
}
  if(d?.access?.manage_permissions===true)footer.push({type:"button",style:"secondary",action:{type:"postback",label:"👥 คนที่ช่วยจัดการ",data:"เปิดสิทธิ์บุคคล "+String(d.person_code||personCode)}});
  footer.push({type:"button",action:{type:"postback",label:"↩️ บุคคลในครอบครัว",data:"บุคคลในครอบครัว"}});
  const flex:any={type:"flex",altText:"👤 ภาพรวม "+personName,contents:{type:"bubble",size:"kilo",
   header:{type:"box",layout:"vertical",backgroundColor:personThemeLight,paddingAll:"18px",contents:[
    {type:"text",text:"👤 "+personName,weight:"bold",size:"xl",color:d?.is_self?"#1F4B7A":"#285943",wrap:true},
    ...(d?.relationship_label?[{type:"text",text:String(d.relationship_label),size:"sm",color:"#667085",margin:"sm",wrap:true}]:[]),
    {type:"text",text:"ภาพรวมข้อมูล",size:"xs",color:"#667085",margin:"sm"}
   ]},
   body:{type:"box",layout:"vertical",spacing:"md",paddingAll:"18px",contents:body},
   footer:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"14px",contents:footer.slice(0,6)}
  }};
  const categoryCards:any[]=[
   ["💊 ยา","medications",meds,"medications"],
   ["📅 นัด","appointments",appts,"appointments"],
   ["❤️ สุขภาพ","health_data",health,"health"]
  ].filter((v:any)=>d?.access?.[v[1]]?.view===true).map((v:any)=>{
   const b:any={type:"bubble",size:"kilo",header:{type:"box",layout:"vertical",backgroundColor:personThemeLight,paddingAll:"14px",contents:[{type:"text",text:v[0],weight:"bold",size:"lg",color:"#294B6B"}]},
    body:{type:"box",layout:"vertical",paddingAll:"16px",contents:[{type:"text",text:String(v[2]?.count??0)+" รายการ",weight:"bold",size:"lg"}]},
    footer:{type:"box",layout:"vertical",paddingAll:"12px",contents:[{type:"button",style:"primary",action:{type:"postback",label:"ดู"+v[0].replace(/^[^ ]+ /,""),data:"เปิดข้อมูลบุคคล "+v[3]+" "+String(d.person_code||personCode)}}]}};
   return b;
  });
  const canEditProfile=d?.access?.profile?.update===true;
  const menuCard:any={type:"bubble",size:"kilo",header:{type:"box",layout:"vertical",backgroundColor:"#F1F8F4",paddingAll:"14px",contents:[{type:"text",text:"👤 รายละเอียดบุคคล",weight:"bold",size:"lg"}]},body:{type:"box",layout:"vertical",paddingAll:"16px",contents:[{type:"text",text:"เปิดดูข้อมูลส่วนตัวและการตั้งค่าของบุคคลนี้",size:"sm",wrap:true}]},footer:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"12px",contents:[{type:"button",style:"primary",action:{type:"postback",label:"👤 รายละเอียดบุคคล",data:"รายละเอียดบุคคล"}},...(canEditProfile?[{type:"button",style:"secondary",action:{type:"postback",label:"🎨 สีประจำตัว",data:"สีประจำตัว"}}]:[])]}};
  for(const [key,title,cmdName] of [["documents","📄 เอกสาร","ดูเอกสารบุคคล"],["expenses","💰 ค่าใช้จ่าย","ดูค่าใช้จ่ายบุคคล"]]){
   const item=extras?.[key];
   if(item?.view!==true)continue;
   const rows=Array.isArray(item?.items)?item.items:[];
   const contents:any[]=[{type:"text",text:"มี "+String(item.count??0)+" รายการ",size:"sm",weight:"bold",wrap:true}];
   if(key==="documents"){
    if(rows.length){
     const doc=rows[0];
     contents.push({type:"separator",margin:"md"},{type:"text",text:"เอกสารล่าสุด",size:"sm",weight:"bold",color:"#294B6B",margin:"md"});
     if(typeof doc.preview_url==="string"&&doc.preview_url.startsWith("https://"))contents.push({type:"image",url:doc.preview_url,size:"full",aspectRatio:"16:9",aspectMode:"fit",margin:"md"});
     contents.push({type:"text",text:String(doc.title||"เอกสาร"),size:"md",weight:"bold",wrap:true,margin:"md"},
      {type:"text",text:"ประเภท: "+String(doc.type||"ไม่ระบุ")+" • "+String(doc.date||"ไม่ระบุวันที่"),size:"sm",wrap:true,color:"#667085",margin:"sm"});
    }else contents.push({type:"text",text:"ยังไม่มีเอกสารที่แสดงได้",size:"sm",wrap:true,color:"#667085",margin:"md"});
   }else{
    const verified=item.amounts_verified===true;
    const money=(n:any)=>Number(n||0).toLocaleString("th-TH",{minimumFractionDigits:2,maximumFractionDigits:2})+" ฿";
    contents.push({type:"separator",margin:"md"},
     {type:"text",text:"รวมทั้งหมด",size:"sm",color:"#667085",margin:"md"},
     {type:"text",text:verified?money(item.total_paid):"ยังไม่มียอดสรุป",size:"xl",weight:"bold",color:"#294B6B",wrap:true},
     {type:"text",text:"เดือนนี้",size:"sm",color:"#667085",margin:"md"},
     {type:"text",text:verified?money(item.month_paid):"ยังไม่มียอดสรุป",size:"lg",weight:"bold",wrap:true});
    if(rows.length){
     contents.push({type:"separator",margin:"md"},{type:"text",text:"รายการล่าสุด",size:"sm",weight:"bold",color:"#294B6B",margin:"md"});
     for(const expense of rows.slice(0,2))contents.push({type:"text",text:String(expense.date||"ไม่ระบุวันที่")+"  •  "+(expense.amount===null?"ยังไม่ระบุยอด":money(expense.amount)),size:"sm",wrap:true,margin:"sm"});
    }
   }
   categoryCards.push({type:"bubble",size:"kilo",header:{type:"box",layout:"vertical",backgroundColor:personThemeLight,paddingAll:"14px",contents:[{type:"text",text:title,size:"lg",weight:"bold",color:"#294B6B"}]},body:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"16px",contents},footer:{type:"box",layout:"vertical",paddingAll:"12px",contents:[{type:"button",style:"primary",action:{type:"postback",label:key==="documents"?"📄 เอกสารทั้งหมด":"💰 ค่าใช้จ่ายทั้งหมด",data:cmdName}}]}});
  }
  const summaryBubble=flex.contents;
  summaryBubble.body.contents=[
   {type:"text",text:"💊 ยา "+(d?.access?.medications?.view===true?String(meds?.count??0):"—")+"  ·  📅 นัด "+(d?.access?.appointments?.view===true?String(appts?.count??0):"—")+"  ·  ❤️ สุขภาพ "+(d?.access?.health_data?.view===true?String(health?.count??0):"—"),size:"sm",weight:"bold",wrap:true},
   {type:"separator",margin:"md"},
   {type:"text",text:"เลือกการ์ดแต่ละหมวดเพื่อเปิดดูข้อมูล",size:"sm",wrap:true,color:"#555555"}
  ];
  if(summaryBubble.footer?.contents)summaryBubble.footer.contents=summaryBubble.footer.contents.filter((b:any)=>!/^เปิดข้อมูลบุคคล (?:medications|appointments|health) /.test(String(b?.action?.data||"")));
  await replyMessages(replyToken,token,[{type:"flex",altText:"👤 ภาพรวม "+personName,contents:{type:"carousel",contents:[summaryBubble,...categoryCards,menuCard].slice(0,12)}}])
 }catch(err){
  console.error("router_person_dashboard",String(err));
  const msg=String((err as any)?.message??err);
  const where=msg.includes("family_person_not_found")?"ไม่พบ person code ในบริบทครอบครัวปัจจุบัน":msg.includes("person_selection_not_accessible")?"สิทธิ์/การมองเห็นของบุคคลไม่ตรงกับปุ่ม":msg.includes("family_context")?"บริบทครอบครัวเปลี่ยน":"การเปิด person dashboard ล้มเหลว";
  await replyLine(replyToken,"⚠️ ระบบเปิดภาพรวมบุคคลนี้ไม่สำเร็จ — นี่เป็นปัญหาระบบ ไม่ใช่ข้อมูลที่คุณพิมพ์ผิด\n\nจุดที่พบ: "+where+"\nเปิดรายชื่อใหม่แล้วลองอีกครั้ง",token,[qpb("👥 เปิดรายชื่อใหม่","บุคคลในครอบครัว")])
 }
}

function roleThai(r:string){
 const m:any={owner:"เจ้าบ้าน",admin:"ผู้ช่วยดูแลครอบครัว",caregiver:"สมาชิกครอบครัว",viewer:"สมาชิกครอบครัว",patient:"สมาชิกครอบครัว",member:"สมาชิกครอบครัว"};
 return m[r]||r
}
function visibleFamilyRoleThai(roles:any){
 const xs=Array.isArray(roles)?roles:[];
 if(xs.includes("owner"))return "เจ้าบ้าน";
 if(xs.includes("admin"))return "ผู้ช่วยดูแลครอบครัว";
 return "สมาชิกครอบครัว"
}
function roleHelp(){
 return [
  "👑 เจ้าบ้าน — ชวนคนเข้าครอบครัว และตั้งผู้ช่วยดูแลครอบครัว",
  "🛡️ ผู้ช่วยดูแลครอบครัว — ช่วยจัดการสมาชิกในบ้าน",
  "👥 สมาชิกครอบครัว — ดูและใช้ข้อมูลที่ได้รับอนุญาต",
  "💚 เรื่องสุขภาพ: ต้องให้ผู้ดูแลหลักอนุญาตแยกต่างหาก"
 ].join("\n")
}
function levelThai(v:any){
 const x=String(v||"none");
 return x==="manage"?"จัดการ":x==="view"?"ดู":"ไม่มีสิทธิ์"
}
function actionText(p:any){
 const a=[p?.view&&"ดู",p?.create&&"เพิ่ม",p?.update&&"แก้",p?.delete&&"ลบ",p?.receive_notifications&&"แจ้งเตือน"].filter(Boolean);
 return a.length?a.join(" • "):"—"
}
function familyPermSummary(d:any){
 const ps=Array.isArray(d?.family_permissions)?d.family_permissions:[];
 return ["medications","appointments","health_data"].map(r=>{
  const x=ps.find((p:any)=>String(p.resource)===r)||{};
  return (r==="medications"?"💊 ยา":r==="appointments"?"📅 นัดหมาย":"❤️ สุขภาพ")+": "+actionText(x)
 })
}
function personPermissionSummary(d:any){
 const ps=Array.isArray(d?.person_permissions)?d.person_permissions:[];
 const names=[...new Set(ps.map((x:any)=>String(x.person_name||"")).filter(Boolean))];
 if(!names.length)return {count:0,text:"ยังไม่มีสิทธิ์เฉพาะบุคคล"};
 return {count:names.length,text:"เฉพาะบุคคล: "+names.slice(0,3).join(", ")+(names.length>3?" +"+(names.length-3):"")}
}

async function showPermissionDashboard(uid:string,replyToken:string,token:string,u:string,k:string,prefix=""){
 let prep=await prepareFamily(uid,u,k);
 if(prep?.flow_state==="choose_family"){
  const opts=Array.isArray(prep?.selection_options)?prep.selection_options:[];
  if(opts.length===1&&opts[0]?.selection_code){
   try{
    await rpcOne(u,k,"phms_select_line_context_family",{p_line_user_id:uid,p_selection_code:String(opts[0].selection_code)});
    prep=await prepareFamily(uid,u,k)
   }catch{}
  }
 }
 if(await replyFamilyNotReady(prep,replyToken,token))return;
 const ms=await listMembers(uid,u,k);
 const details:any[]=[];
 for(const m of ms.slice(0,10)){
  try{details.push(await rpcOne(u,k,"phms_get_line_family_member_detail",{p_line_user_id:uid,p_member_code:String(m.selection_code)}))}catch{}
 }
 const seenUsers=new Set<string>();
 const uniqueDetails=details.filter((d:any)=>{
  const key=String(d?.user_id||d?.member_code||"");
  if(!key||seenUsers.has(key))return false;
  seenUsers.add(key);return true
 });
 const actorDetail=uniqueDetails.find((d:any)=>d?.is_self===true);
 const actorRoles=Array.isArray(actorDetail?.roles)?actorDetail.roles:[];
 const actorIsManager=prep?.is_owner===true||actorRoles.includes("admin");
 const visibleDetails=actorIsManager?uniqueDetails:uniqueDetails.filter((d:any)=>d?.is_self===true);
 const roster=await rpcOne(u,k,"phms_list_line_family_roster",{p_line_user_id:uid});
 const allPeople=(Array.isArray(roster?.entries)?roster.entries:[]).filter((p:any)=>p?.entry_type==="person");
 const unlinkedPeople=allPeople.filter((p:any)=>!p?.account_linked);
 const ownerCount=uniqueDetails.filter((d:any)=>(d?.roles||[]).includes("owner")).length;
 const adminCount=uniqueDetails.filter((d:any)=>(d?.roles||[]).includes("admin")).length;
 const summary:any={type:"bubble",size:"kilo",
  header:{type:"box",layout:"vertical",backgroundColor:"#EEF3FA",paddingAll:"16px",contents:[
   {type:"text",text:"🛡️ บทบาทและสิทธิ์",weight:"bold",size:"xl",color:"#294B6B"},
   {type:"text",text:String(prep?.family_name||"ครอบครัว"),size:"md",weight:"bold",margin:"sm",wrap:true}
  ]},
  body:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"14px",contents:actorIsManager?[
   {type:"text",text:"สมาชิก "+String(uniqueDetails.length)+" บัญชี • รอเชื่อม "+String(unlinkedPeople.length)+" คน",size:"sm",weight:"bold",wrap:true},
   {type:"text",text:"เจ้าบ้าน "+ownerCount+" • ผู้ช่วยดูแลครอบครัว "+adminCount,size:"xs",wrap:true,color:"#555555"},
   {type:"separator",margin:"md"},
   {type:"text",text:"ตำแหน่งในบ้านใช้ดูแลเรื่องสมาชิกเท่านั้น ถ้าจะดูสุขภาพใครต้องให้ผู้ดูแลหลักของคนนั้นอนุญาตก่อน",size:"xs",wrap:true,color:"#777777"}
  ]:[
   {type:"text",text:"หน้านี้แสดงเฉพาะสิทธิ์ของคุณ และบุคคลที่คุณได้รับสิทธิ์ดูแล/เข้าถึง",size:"sm",weight:"bold",wrap:true},
   {type:"text",text:"ถ้าคุณไม่ได้ดูแลหรือเข้าถึงข้อมูลของใคร หน้านี้จะแสดงเฉพาะสิทธิ์ของคุณ",size:"xs",wrap:true,color:"#777777"}
  ]},
  footer:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"12px",contents:[
   ...(actorIsManager?[
    {type:"button",style:"secondary",action:{type:"postback",label:"👥 บัญชีในครอบครัว",data:"บัญชีในครอบครัว"}},
    {type:"button",style:"secondary",action:{type:"postback",label:"👤 บุคคลในบ้าน",data:"บุคคลในครอบครัว"}},
    {type:"button",style:"secondary",action:{type:"postback",label:"🐞 รายงานปัญหา",data:"ตรวจรายงานบัค"}},
    ...(prep?.is_owner?[{type:"button",style:"secondary",action:{type:"postback",label:"🏡 เปลี่ยนเจ้าบ้าน",data:"เปลี่ยนเจ้าบ้าน"}}]:[]),
    ...(actorRoles.includes("admin")&&!prep?.is_owner?[{type:"button",style:"secondary",action:{type:"postback",label:"🙋 ขอเลิกเป็นผู้ช่วยดูแลครอบครัว",data:"ขอลาออกจากแอดมิน"}}]:[])
   ]:[]),
   {type:"button",style:"secondary",action:{type:"postback",label:"📥 เรื่องในบ้านรอตอบรับ",data:"คำขอบ้าน"}},
   {type:"button",action:{type:"postback",label:"↩️ ครอบครัว",data:"ครอบครัว"}}
  ]}
 };
 const memberCards:any[]=[];
 for(const d of visibleDetails){
  let a:any={people:[],helpers:[]};
  try{a=await rpcOne(u,k,"phms_list_line_member_person_access",{p_line_user_id:uid,p_member_code:String(d.member_code)})||a}catch{}
  const people=Array.isArray(a?.people)?a.people:[];
  const helpers=Array.isArray(a?.helpers)?a.helpers:[];
  const own=people.find((p:any)=>p?.is_self===true);
  const others=people.filter((p:any)=>!p?.is_self&&[p?.profile,p?.medications,p?.appointments,p?.health].some((x:any)=>String(x||"none")!=="none"));
  const rights:any[]=[];
  if(own){
   rights.push({type:"text",text:"🙋 สิทธิ์ของฉัน",size:"sm",weight:"bold",wrap:true,color:"#294B6B"});
   rights.push({type:"text",text:"• "+(a?.self_manage===false?"ดูข้อมูลตัวเองได้ แต่แก้เองไม่ได้":"ดู/เพิ่ม/แก้ข้อมูลตัวเองได้"),size:"xs",wrap:true,color:"#294B6B"});
   rights.push({type:"text",text:"🤝 คนที่ช่วยจัดการข้อมูลของฉัน",size:"sm",weight:"bold",wrap:true,color:"#555555",margin:"sm"});
   if(helpers.length){
    for(const h of helpers.slice(0,6))rights.push({type:"text",text:"• "+String(h?.display_name||"สมาชิก")+(h?.is_primary?" (ผู้จัดการหลัก)":""),size:"xs",wrap:true,color:"#555555"})
   }else rights.push({type:"text",text:"• ไม่มี",size:"xs",wrap:true,color:"#777777"})
  }
  if(others.length){
   rights.push({type:"text",text:"🧑‍⚕️ คนที่ฉันดูแล / เข้าถึงข้อมูลได้",size:"sm",weight:"bold",wrap:true,color:"#555555",margin:"sm"});
   for(const p of others.slice(0,8)){
    const levels=[p?.medications,p?.appointments,p?.health].map((x:any)=>String(x||"none"));
    const detail=(p?.is_caregiver||levels.every((x:string)=>x==="manage"))
     ?"จัดการข้อมูลได้"
     :levels.every((x:string)=>x==="view"||x==="manage")
      ?"ดูข้อมูลได้"
      :"ยา "+levelThai(p?.medications)+" • นัด "+levelThai(p?.appointments)+" • สุขภาพ "+levelThai(p?.health);
    rights.push({type:"text",text:"• "+String(p?.person_name||"บุคคล")+" — "+detail,size:"xs",wrap:true,color:"#444444"})
   }
  }
  if(!rights.length)rights.push({type:"text",text:"ยังไม่มีข้อมูลสิทธิ์ที่แสดงได้",size:"xs",wrap:true,color:"#777777"});
  const canEditRole=d?.actor_can_manage_permissions===true&&!d?.is_owner;
  const canEditPerson=d?.actor_can_manage_permissions===true;
  const foot:any[]=[
   ...(canEditRole?[{type:"button",style:"primary",action:{type:"postback",label:"🛡️ หน้าที่ในครอบครัว",data:"บทบาท "+String(d.member_code)}}]:[]),
   ...(canEditPerson?[{type:"button",style:"secondary",action:{type:"postback",label:"👤 สิทธิ์เข้าถึงบุคคล",data:"สิทธิ์เฉพาะบุคคล "+String(d.member_code)}}]:[]),
   ...(canEditPerson&&a?.self_person_code?[{type:"button",style:"secondary",action:{type:"postback",label:"🙋 การจัดการข้อมูลตัวเอง",data:"สิทธิ์ตัวเองสมาชิก "+String(d.member_code)}}]:[]),
   ...(d?.is_self&&!canEditPerson?[{type:"button",style:"primary",action:{type:"postback",label:"📥 ขอเพิ่มสิทธิ์",data:"เมนูขอสิทธิ์ของฉัน"}}]:[])
  ];
  memberCards.push({type:"bubble",size:"kilo",
   header:{type:"box",layout:"vertical",backgroundColor:d?.is_self?"#EAF4FF":"#F8F7FB",paddingAll:"14px",contents:[
    {type:"text",text:"👤 "+String(d?.display_name||"สมาชิก")+(d?.is_self?" (ฉัน)":""),size:"lg",weight:"bold",wrap:true,color:d?.is_self?"#1F4B7A":"#3F3650"},
    {type:"text",text:"หน้าที่ในครอบครัว: "+visibleFamilyRoleThai(d?.roles),size:"xs",margin:"sm",color:"#666666",wrap:true}
   ]},
   body:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"14px",contents:rights},
   ...(foot.length?{footer:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"10px",contents:foot.slice(0,4)}}:{})
  })
 }
 const prelinkCards:any[]=[];
 let prelinkConfiguredCount=0;
 if(actorIsManager){
  for(const p of unlinkedPeople.slice(0,6)){
   const pc=String(p?.person_code||"");
   let setup:any=null;try{setup=await rpcOne(u,k,"phms_get_line_prelink_person_setup",{p_line_user_id:uid,p_person_code:pc})}catch{}
   const pendingRoles=Array.isArray(setup?.pending_roles)?setup.pending_roles:[];
   const pa=Array.isArray(setup?.pending_access)?setup.pending_access:[];
   const helpers=Array.isArray(setup?.helpers)?setup.helpers:[];
   if(pendingRoles.includes("admin")||pa.length||helpers.length||setup?.self_manage===false)prelinkConfiguredCount++;
   const detailLines:any[]=[
    {type:"text",text:"• ข้อมูลตัวเอง — "+(setup?.self_manage===false?"ดูอย่างเดียว":"จัดการเองได้หลังเชื่อม"),size:"xs",wrap:true,color:"#294B6B"},
    {type:"text",text:"• หน้าที่ในครอบครัว — "+(pendingRoles.includes("admin")?"ผู้ช่วยดูแลครอบครัว":"สมาชิกครอบครัว"),size:"xs",wrap:true,color:"#555555"},
    {type:"text",text:"• คนที่ช่วยจัดการข้อมูล — "+(helpers.length?helpers.map((x:any)=>String(x?.display_name||"บุคคล")).join(" • "):"ยังไม่มี"),size:"xs",wrap:true,color:"#555555"}
   ];
   for(const x of pa.slice(0,4)){
    const lv=[x?.medications_level,x?.appointments_level,x?.health_level].map((v:any)=>String(v||"none"));
    const desc=x?.is_caregiver||lv.every((v:string)=>v==="manage")?"จัดการ":lv.every((v:string)=>v==="view"||v==="manage")?"ดู":"กำหนดบางส่วน";
    detailLines.push({type:"text",text:"• เข้าถึง "+String(x?.target_name||"บุคคล")+" — "+desc,size:"xs",wrap:true,color:"#444444"})
   }
   prelinkCards.push({type:"bubble",size:"kilo",
    header:{type:"box",layout:"vertical",backgroundColor:"#FFF8E8",paddingAll:"14px",contents:[
     {type:"text",text:"⏳ "+String(p?.display_name||"บุคคล"),weight:"bold",size:"lg",wrap:true},
     {type:"text",text:"ตั้งค่าไว้ก่อนเชื่อมบัญชี",size:"xs",color:"#8A6B2F",margin:"sm"}
    ]},
    body:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"14px",contents:detailLines},
    footer:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"10px",contents:[
     {type:"button",style:"primary",action:{type:"postback",label:"⚙️ แก้ค่าล่วงหน้า",data:"ตั้งค่าก่อนเชื่อม "+pc}}
    ]}
   })
  }
 }
 if(actorIsManager&&unlinkedPeople.length){
  summary.body.contents.push({type:"text",text:"ตั้งค่าล่วงหน้าแล้ว "+String(prelinkConfiguredCount)+" / "+String(unlinkedPeople.length)+" คน",size:"xs",wrap:true,color:"#8A6B2F"})
 }
 await replyMessages(replyToken,token,[{type:"flex",altText:"🛡️ บทบาทและสิทธิ์ใน "+String(prep?.family_name||"ครอบครัว"),contents:{type:"carousel",contents:[summary,...memberCards,...prelinkCards].slice(0,12)}}])
}

async function showFamilyResource(uid:string,code:string,resource:string,replyToken:string,token:string,u:string,k:string){const d=await rpcOne(u,k,"phms_get_line_family_member_detail",{p_line_user_id:uid,p_member_code:code});const p=findPerm(d.family_permissions,resource);const text=`🔐 สิทธิ์${resourceLabel(resource)} — ${d.display_name}\nดู: ${p.view?"✅":"—"}\nเพิ่ม: ${p.create?"✅":"—"}\nแก้ไข: ${p.update?"✅":"—"}\nลบ: ${p.delete?"✅":"—"}${d.is_owner?"\n\nℹ️ สถานะเจ้าบ้านไม่ได้เปิดข้อมูลนี้อัตโนมัติ ค่าด้านบนคือสิทธิ์จริงที่ได้รับ":""}`;const items:any[]=[];if(d.actor_can_manage_permissions){for(const a of["view","create","update","delete"]){const on=!!p[a];items.push(q(`${on?"➖":"➕"} ${actionLabel(a)}`,`${on?"ถอน":"ให้"}สิทธิ์ ${code} ${resourceLabel(resource)} ${actionLabel(a)}`))}}items.push(qpb("↩️ สมาชิก",`เลือกสมาชิก ${code}`));await replyLine(replyToken,text,token,items)}
async function showRoles(uid:string,code:string,replyToken:string,token:string,u:string,k:string){
 const d=await rpcOne(u,k,"phms_get_line_family_member_detail",{p_line_user_id:uid,p_member_code:code});
 if(d.is_owner){
  await replyLine(replyToken,
   "👑 เจ้าบ้าน — "+String(d.display_name||"สมาชิก")+"\n\nเจ้าบ้านดูแลสมาชิกและการตั้งค่าบ้าน ส่วนข้อมูลสุขภาพต้องได้รับสิทธิ์แยก",
   token,[qpb("🏡 เปลี่ยนเจ้าบ้าน","เปลี่ยนเจ้าบ้าน"),qpb("📥 เรื่องในบ้านรอตอบรับ","คำขอบ้าน"),qpb("↩️ กลับ","เลือกสมาชิก "+code)]);return
 }
 const isAdmin=(d.roles||[]).includes("admin");
 const items:any[]=[];
 if(d.actor_is_owner){
  items.push(qpb((isAdmin?"✅ ":"⬜ ")+"ผู้ช่วยดูแลครอบครัว",(isAdmin?"ถอนบทบาท ":"ให้บทบาท ")+code+" admin"))
 }
 items.push(qpb("👤 ไปตั้งสิทธิ์สุขภาพ","บุคคลในครอบครัว"));
 if(d.is_self&&isAdmin)items.push(qpb("🙋 เลิกเป็นผู้ช่วยดูแลครอบครัว","ขอลาออกจากแอดมิน"));
 if(d.actor_is_owner)items.push(qpb("🏡 เปลี่ยนเจ้าบ้าน","เปลี่ยนเจ้าบ้าน"));
 items.push(qpb("📥 เรื่องในบ้านรอตอบรับ","คำขอบ้าน"));
 items.push(qpb("↩️ กลับ","เลือกสมาชิก "+code));
 await replyLine(replyToken,
  "🏡 หน้าที่ในบ้าน — "+String(d.display_name||"สมาชิก")+"\n\n"+
  "หน้าที่ในบ้าน: "+visibleFamilyRoleThai(d.roles)+"\n\n"+
  roleHelp()+"\n\n"+
  (d.actor_is_owner
    ?"เจ้าบ้านตั้งหรือยกเลิกผู้ช่วยดูแลครอบครัวได้ตรงนี้"
    :"ผู้ช่วยดูแลครอบครัวช่วยจัดการครอบครัวได้ ส่วนข้อมูลสุขภาพให้ผู้ดูแลหลักหรือเจ้าของข้อมูลเป็นผู้อนุญาต"),
  token,items)
}
async function showDelegation(uid:string,code:string,replyToken:string,token:string,u:string,k:string){const d=await rpcOne(u,k,"phms_get_line_family_member_detail",{p_line_user_id:uid,p_member_code:code});const text=`🛡️ สิทธิ์อนุมัติ/จัดการสิทธิ์ — ${d.display_name}\nสถานะ: ${d.can_manage_permissions?"ได้รับมอบหมายแล้ว":"ยังไม่ได้รับมอบหมาย"}\n\nผู้ได้รับมอบหมายอนุมัติหรือเปลี่ยนสิทธิ์ได้เฉพาะขอบเขตที่ตนมีสิทธิ์อยู่ และ เจ้าบ้าน จะมีบันทึก/การแจ้งเตือนเมื่อมีการเปลี่ยนแปลง`;const items:any[]=[];if(d.actor_is_owner&&!d.is_owner)items.push(q(d.can_manage_permissions?"🔒 ถอนสิทธิ์อนุมัติ":"🛡️ มอบสิทธิ์อนุมัติ",`${d.can_manage_permissions?"ถอน":"มอบ"}สิทธิ์อนุมัติ ${code}`));items.push(qpb("↩️ สมาชิก",`เลือกสมาชิก ${code}`));await replyLine(replyToken,text,token,items)}
async function showPersonPermissionSummary(uid:string,memberCode:string,personCode:string,replyToken:string,token:string,u:string,k:string,prefix=""){
 const m=await rpcOne(u,k,"phms_get_line_family_member_detail",{p_line_user_id:uid,p_member_code:memberCode});
 const a=await rpcOne(u,k,"phms_list_line_member_person_access",{p_line_user_id:uid,p_member_code:memberCode});
 const row=(Array.isArray(a?.people)?a.people:[]).find((x:any)=>String(x.person_code)===String(personCode))||{
  person_name:"บุคคล",is_self:false,is_caregiver:false,medications:"none",appointments:"none",health:"none",receive_notifications:false
 };
 const relation=row.is_self?"ข้อมูลของตัวเอง":row.is_caregiver?"ผู้ช่วยดูแล":
   (row.medications!=="none"||row.appointments!=="none"||row.health!=="none")?"ดูข้อมูลได้":"ยังดูไม่ได้";
 const text=prefix+"👤 การดูข้อมูลสุขภาพ\n"+
  "บัญชี: "+String(m.display_name||"สมาชิก")+"\n"+
  "ข้อมูลของ: "+String(row.person_name||"บุคคล")+"\n"+
  "สถานะ: "+relation+"\n\n"+
  "💊 ยา: "+levelThai(row.medications)+"\n"+
  "📅 นัดหมาย: "+levelThai(row.appointments)+"\n"+
  "❤️ สุขภาพ: "+levelThai(row.health)+"\n"+
  "🔔 แจ้งเตือน: "+(row.receive_notifications?"รับ":"ไม่รับ")+"\n\n"+
  "ถ้าทุกหมวดใช้สิทธิ์เหมือนกัน เลือกปุ่มลัดได้เลย\n"+
  "• ดูได้ = เปิดดูได้ แต่แก้ไม่ได้\n"+
  "• ดูและแก้ไขได้ = ดู เพิ่ม และแก้ไขข้อมูลได้\n"+
  "• ผู้ช่วยดูแล = ช่วยจัดการเฉพาะเรื่องที่อนุญาต\n"+
  "ถ้าต้องการแต่ละหมวดไม่เท่ากัน ค่อยใช้ “กำหนดละเอียด”";
 const items:any[]=[];
 if(m.actor_can_manage_permissions){
  items.push(qpb("👀 ผู้ที่ดูข้อมูลได้","ตั้งสิทธิ์เร็ว "+memberCode+" "+personCode+" view"));
  items.push(qpb("🛠️ จัดการข้อมูล","ตั้งสิทธิ์เร็ว "+memberCode+" "+personCode+" manage"));
  items.push(qpb("🤝 ผู้ช่วยดูแล","ตั้งสิทธิ์เร็ว "+memberCode+" "+personCode+" caregiver"));
  items.push(qpb("🚫 ดูไม่ได้","ตั้งสิทธิ์เร็ว "+memberCode+" "+personCode+" none"));
  items.push(qpb("🧾 กำหนดละเอียด","เทมเพลตสิทธิ์บุคคล "+memberCode+" "+personCode));
  items.push(qpb("⚙️ ตั้งทีละสิทธิ์","ตั้งสิทธิ์ทีละรายการ "+memberCode+" "+personCode))
 }
 items.push(qpb("↩️ กลับสมาชิก","เลือกสมาชิก "+memberCode));
 await replyLine(replyToken,text,token,items.slice(0,13))
}
async function showPersonAccessDirectMenu(uid:string,memberCode:string,personCode:string,replyToken:string,token:string,u:string,k:string){
 const m=await rpcOne(u,k,"phms_get_line_family_member_detail",{p_line_user_id:uid,p_member_code:memberCode});
 const a=await rpcOne(u,k,"phms_list_line_member_person_access",{p_line_user_id:uid,p_member_code:memberCode});
 const row=(Array.isArray(a?.people)?a.people:[]).find((x:any)=>String(x.person_code)===String(personCode))||{person_name:"บุคคล"};
 await replyLine(replyToken,
  "⚙️ ตั้งสิทธิ์ทีละรายการ\nบัญชี: "+String(m.display_name||"สมาชิก")+"\nบุคคล: "+String(row.person_name||"บุคคล")+"\n\nเลือกหมวดที่ต้องการแก้",
  token,[
   qpb("⚙️ สิทธิ์พื้นฐาน","ตั้งสิทธิ์พื้นฐาน "+memberCode+" "+personCode),
   qpb("📅 นัด","ตั้งสิทธิ์หมวด appointments "+memberCode+" "+personCode),
   qpb("💊 ยา","ตั้งสิทธิ์หมวด medications "+memberCode+" "+personCode),
   qpb("❤️ สุขภาพ","ตั้งสิทธิ์หมวด health_data "+memberCode+" "+personCode),
   qpb("📄 เอกสาร","ตั้งสิทธิ์หมวด documents "+memberCode+" "+personCode),
   qpb("💰 ค่าใช้จ่าย","ตั้งสิทธิ์หมวด expenses "+memberCode+" "+personCode),
   qpb("↩️ สรุป","สิทธิ์บุคคล "+memberCode+" "+personCode)
  ])
}
async function showPersonResource(uid:string,memberCode:string,personCode:string,resource:string,replyToken:string,token:string,u:string,k:string,changeLabel=""){
 const d=await rpcOne(u,k,"phms_get_line_person_permission_detail",{p_line_user_id:uid,p_member_code:memberCode,p_person_code:personCode});
 const m=await rpcOne(u,k,"phms_get_line_family_member_detail",{p_line_user_id:uid,p_member_code:memberCode});
 const p=findPerm(d.permissions,resource);
 const text=(changeLabel?"✅ "+String(m.display_name||"สมาชิก")+" — "+changeLabel+" ของ "+String(d.person_name||"บุคคล")+"\n\n":"")+"🔐 "+resourceLabel(resource)+" — "+String(d.person_name||"บุคคล")+"\n"+
  "บัญชี: "+String(m.display_name||"สมาชิก")+"\n\n"+
  "ดู: "+(p.view?"✅":"—")+"\nเพิ่ม: "+(p.create?"✅":"—")+"\nแก้ไข: "+(p.update?"✅":"—")+"\nลบ: "+(p.delete?"✅":"—")+"\nแจ้งเตือน: "+(p.receive_notifications?"✅":"—");
 const items:any[]=[];
 if(d.actor_can_manage_permissions){
  for(const act of["view","create","update","delete"]){
   const on=!!p[act];
   items.push(qpb((on?"➖ ":"➕ ")+actionLabel(act),(on?"ถอน":"ให้")+"สิทธิ์บุคคล "+memberCode+" "+personCode+" "+resourceLabel(resource)+" "+actionLabel(act)))
  }
  if(d.actor_is_owner||d.actor_is_admin){
   const on=!!p.receive_notifications;
   items.push(qpb((on?"➖ ":"➕ ")+"แจ้งเตือน",(on?"ถอน":"ให้")+"สิทธิ์บุคคล "+memberCode+" "+personCode+" "+resourceLabel(resource)+" แจ้งเตือน"))
  }
 }
 items.push(qpb("↩️ ตั้งทีละรายการ","ตั้งสิทธิ์ทีละรายการ "+memberCode+" "+personCode));
 await replyLine(replyToken,text,token,items.slice(0,13))
}
async function choosePersonForMember(uid:string,memberCode:string,replyToken:string,token:string,u:string,k:string,page=0){
 const m=await rpcOne(u,k,"phms_get_line_family_member_detail",{p_line_user_id:uid,p_member_code:memberCode});
 const people=await rpcRows(u,k,"phms_list_line_context_persons",{p_line_user_id:uid}),pageSize=8,total=Math.max(1,Math.ceil(people.length/pageSize)),pg=Math.max(0,Math.min(Number(page)||0,total-1)),items:any[]=[];
 for(const p of people.filter((_:any,i:number)=>i>=pg*pageSize&&i<(pg+1)*pageSize))items.push(qpb("👤 "+String(p.display_name||"บุคคล").slice(0,18),"สิทธิ์บุคคล "+memberCode+" "+p.selection_code));
 if(pg>0)items.push(qpb("⬅️ ก่อนหน้า","สิทธิ์เฉพาะบุคคล "+memberCode+" "+(pg-1)));
 if(pg<total-1)items.push(qpb("➡️ ถัดไป","สิทธิ์เฉพาะบุคคล "+memberCode+" "+(pg+1)));
 items.push(qpb("☑️ หลายบุคคล • สิทธิ์เดียวกัน","เลือกหลายบุคคลสิทธิ์ "+memberCode),qpb("↩️ กลับ","เลือกสมาชิก "+memberCode));
 await replyLine(replyToken,"👤 จัดการสิทธิ์เข้าถึงบุคคล\nบัญชี: "+String(m.display_name||"สมาชิก")+"\n\nเลือกบุคคล • หน้า "+(pg+1)+"/"+total,token,items)
}
async function showPrelinkSetup(uid:string,personCode:string,replyToken:string,token:string,u:string,k:string){
 const s=await rpcOne(u,k,"phms_get_line_prelink_person_setup",{p_line_user_id:uid,p_person_code:personCode});
 const roles=Array.isArray(s?.pending_roles)?s.pending_roles:[];
 const access=Array.isArray(s?.pending_access)?s.pending_access:[];
 const helpers=Array.isArray(s?.helpers)?s.helpers:[];
 const lines=[
  "• ข้อมูลตัวเอง: "+(s?.self_manage===false?"ดูอย่างเดียว / ให้คนอื่นช่วยจัดการ":"จัดการเองได้หลังเชื่อม"),
  "• หน้าที่ในครอบครัว: "+(roles.includes("admin")?"ผู้ช่วยดูแลครอบครัว":"สมาชิกครอบครัว"),
  "• คนที่ช่วยจัดการข้อมูล: "+(helpers.length?helpers.map((x:any)=>String(x?.display_name||"บุคคล")).join(" • "):"ยังไม่มี"),
  "• ข้อมูลสุขภาพที่เข้าถึงได้หลังเชื่อมบัญชี: "+(access.length?String(access.length)+" คน":"ยังไม่ได้ตั้ง")
 ];
 for(const x of access.slice(0,4)){
  const lv=[x?.medications_level,x?.appointments_level,x?.health_level].map((v:any)=>String(v||"none"));
  const desc=x?.is_caregiver||lv.every((v:string)=>v==="manage")?"จัดการเต็ม":lv.every((v:string)=>v==="view"||v==="manage")?"ดูได้":"บางส่วน";
  lines.push("  - "+String(x?.target_name||"บุคคล")+": "+desc)
 }
 await replyLine(replyToken,
  "⚙️ ตั้งค่าก่อนเชื่อมบัญชี\nบุคคล: "+String(s?.person_name||"บุคคล")+"\n\n"+lines.join("\n")+
  "\n\nตั้ง “จัดการตัวเอง” และมีคนอื่นช่วยจัดการเพิ่มได้พร้อมกัน",
  token,[
   qpb("🙋 การจัดการข้อมูลของเจ้าตัว","สิทธิ์เจ้าตัวล่วงหน้า "+personCode),
   qpb("👥 คนที่ช่วยจัดการข้อมูล","เลือกผู้ดูแลให้บุคคล "+personCode),
   qpb("👤 ข้อมูลสุขภาพที่เข้าถึงได้หลังเชื่อมบัญชี","สิทธิ์ล่วงหน้า "+personCode),
   qpb("🛡️ หน้าที่ในครอบครัว","บทบาทล่วงหน้า "+personCode),
   qpb("↩️ บทบาทและสิทธิ์","สิทธิ์สมาชิก")
  ])
}
async function showPrelinkRoles(uid:string,personCode:string,replyToken:string,token:string,u:string,k:string){
 const s=await rpcOne(u,k,"phms_get_line_prelink_person_setup",{p_line_user_id:uid,p_person_code:personCode});
 const prep=await prepareFamily(uid,u,k);
 const current=new Set(Array.isArray(s?.pending_roles)?s.pending_roles:[]);
 const items:any[]=[];
 if(prep?.is_owner){
  items.push(qpb((current.has("admin")?"✅ ":"⬜ ")+"ผู้ช่วยดูแลครอบครัว","สลับบทบาทล่วงหน้า "+personCode+" admin"))
 }
 items.push(qpb("👥 กำหนดผู้ช่วยดูแล","เลือกผู้ดูแลให้บุคคล "+personCode));
 items.push(qpb("👤 กำหนดข้อมูลสุขภาพที่ดูได้","สิทธิ์ล่วงหน้า "+personCode));
 items.push(qpb("↩️ กลับ","ตั้งค่าก่อนเชื่อม "+personCode));
 await replyLine(replyToken,
  "🛡️ หน้าที่ในครอบครัวล่วงหน้า — "+String(s?.person_name||"บุคคล")+"\n\n"+
  "สมาชิกครอบครัวเป็นค่าเริ่มต้นอัตโนมัติ จึงไม่ต้องเลือก\n"+
  "การช่วยจัดการข้อมูลคนอื่นกำหนดแยกเป็นสิทธิ์รายบุคคล\n\n"+
  (prep?.is_owner?"เจ้าบ้านสามารถตั้งผู้ช่วยดูแลครอบครัวล่วงหน้าได้":"ผู้ช่วยดูแลครอบครัวไม่สามารถแต่งตั้งผู้ช่วยดูแลครอบครัวคนใหม่ได้"),
  token,items)
}
async function togglePrelinkRole(uid:string,personCode:string,role:string,replyToken:string,token:string,u:string,k:string){
 const s=await rpcOne(u,k,"phms_get_line_prelink_person_setup",{p_line_user_id:uid,p_person_code:personCode});
 const cur=new Set(Array.isArray(s?.pending_roles)?s.pending_roles:[]);
 if(cur.has(role))cur.delete(role);else cur.add(role);
 await rpcOne(u,k,"phms_set_line_prelink_roles",{p_line_user_id:uid,p_person_code:personCode,p_roles:[...cur]});
 await showPrelinkRoles(uid,personCode,replyToken,token,u,k)
}
async function choosePrelinkTarget(uid:string,subjectCode:string,replyToken:string,token:string,u:string,k:string,page=0){
 const s=await rpcOne(u,k,"phms_get_line_prelink_person_setup",{p_line_user_id:uid,p_person_code:subjectCode});
 const targets=(await rpcRows(u,k,"phms_list_line_context_persons",{p_line_user_id:uid})).filter((p:any)=>String(p.selection_code)!==String(subjectCode));
 const pageSize=8,total=Math.max(1,Math.ceil(targets.length/pageSize)),pg=Math.max(0,Math.min(Number(page)||0,total-1)),items:any[]=[];
 for(const p of targets.filter((_:any,i:number)=>i>=pg*pageSize&&i<(pg+1)*pageSize))items.push(qpb("👤 "+String(p.display_name||"บุคคล").slice(0,18),"ตั้งการดูข้อมูลล่วงหน้า "+subjectCode+" "+p.selection_code));
 if(pg>0)items.push(qpb("⬅️ ก่อนหน้า","สิทธิ์ล่วงหน้า "+subjectCode+" "+(pg-1)));
 if(pg<total-1)items.push(qpb("➡️ ถัดไป","สิทธิ์ล่วงหน้า "+subjectCode+" "+(pg+1)));
 items.push(qpb("➕ สร้างบุคคลใหม่ให้เข้าถึง","เพิ่มบุคคลใหม่ให้ผู้ดูแล "+subjectCode),qpb("↩️ กลับ","ตั้งค่าก่อนเชื่อม "+subjectCode));
 await replyLine(replyToken,"👤 ข้อมูลสุขภาพที่เข้าถึงได้หลังเชื่อมบัญชี\nกำลังตั้งให้: "+String(s?.person_name||"บุคคล")+"\n\nเลือกบุคคล • หน้า "+(pg+1)+"/"+total,token,items)
}
async function showPrelinkAccess(uid:string,subjectCode:string,targetCode:string,replyToken:string,token:string,u:string,k:string){
 const s=await rpcOne(u,k,"phms_get_line_prelink_person_setup",{p_line_user_id:uid,p_person_code:subjectCode});
 const row=(Array.isArray(s?.pending_access)?s.pending_access:[]).find((x:any)=>String(x.target_person_code)===String(targetCode))||{
  target_name:null,is_caregiver:false,profile_level:"none",medications_level:"none",appointments_level:"none",health_level:"none",emergency_level:"none",receive_notifications:false
 };
 let targetName=String(row?.target_name||"");
 if(!targetName||targetName==="บุคคล"){
  try{
   const people=await rpcRows(u,k,"phms_list_line_context_persons",{p_line_user_id:uid});
   const target=people.find((x:any)=>String(x.selection_code)===String(targetCode));
   targetName=String(target?.display_name||"บุคคล")
  }catch{targetName="บุคคล"}
 }
 const text="👤 การดูข้อมูลหลังเชื่อมบัญชี\n"+
  "กำลังตั้งให้: "+String(s?.person_name||"บุคคล")+"\n"+
  "บุคคลที่เข้าถึง: "+targetName+"\n\n"+
  "สิทธิ์จัดการแทน: "+(row.is_caregiver?"ได้":"ไม่ได้")+"\n"+
  "💊 ยา: "+levelThai(row.medications_level)+"\n"+
  "📅 นัดหมาย: "+levelThai(row.appointments_level)+"\n"+
  "❤️ สุขภาพ: "+levelThai(row.health_level)+"\n"+
  "🔔 แจ้งเตือน: "+(row.receive_notifications?"รับ":"ไม่รับ");
 await replyLine(replyToken,text,token,[
  qpb("🧾 ตั้งด้วยเทมเพลต","เทมเพลตสิทธิ์ล่วงหน้า "+subjectCode+" "+targetCode),
  qpb("⚙️ ตั้งทีละสิทธิ์","ตั้งการดูข้อมูลล่วงหน้าทีละรายการ "+subjectCode+" "+targetCode),
  qpb("↩️ เลือกบุคคล","สิทธิ์ล่วงหน้า "+subjectCode)
 ])
}
async function showPrelinkDirect(uid:string,subjectCode:string,targetCode:string,replyToken:string,token:string,u:string,k:string){
 const s=await rpcOne(u,k,"phms_get_line_prelink_person_setup",{p_line_user_id:uid,p_person_code:subjectCode});
 const row=(Array.isArray(s?.pending_access)?s.pending_access:[]).find((x:any)=>String(x.target_person_code)===String(targetCode))||{
  target_name:null,is_caregiver:false,medications_level:"none",appointments_level:"none",health_level:"none",receive_notifications:false
 };
 let targetName=String(row?.target_name||"");
 if(!targetName||targetName==="บุคคล"){
  try{
   const people=await rpcRows(u,k,"phms_list_line_context_persons",{p_line_user_id:uid});
   const target=people.find((x:any)=>String(x.selection_code)===String(targetCode));
   targetName=String(target?.display_name||"บุคคล")
  }catch{targetName="บุคคล"}
 }
 await replyLine(replyToken,
  "⚙️ ตั้งการดูข้อมูลล่วงหน้า\nกำลังตั้งให้: "+String(s?.person_name||"บุคคล")+"\nเข้าถึงข้อมูลของ: "+targetName+"\n\nเลือกหัวข้อที่ต้องการเปลี่ยน",
  token,[
   qpb((row.is_caregiver?"✅ ":"⬜ ")+"จัดการข้อมูลแทน","สลับผู้ดูแลล่วงหน้า "+subjectCode+" "+targetCode),
   qpb("💊 ยา: "+levelThai(row.medications_level),"เลือกระดับล่วงหน้า "+subjectCode+" "+targetCode+" medications"),
   qpb("📅 นัด: "+levelThai(row.appointments_level),"เลือกระดับล่วงหน้า "+subjectCode+" "+targetCode+" appointments"),
   qpb("❤️ สุขภาพ: "+levelThai(row.health_level),"เลือกระดับล่วงหน้า "+subjectCode+" "+targetCode+" health"),
   qpb((row.receive_notifications?"✅ ":"⬜ ")+"แจ้งเตือน","สลับแจ้งเตือนล่วงหน้า "+subjectCode+" "+targetCode),
   qpb("↩️ สรุป","ตั้งการดูข้อมูลล่วงหน้า "+subjectCode+" "+targetCode)
  ])
}
async function prelinkUpdate(uid:string,subjectCode:string,targetCode:string,patch:any,u:string,k:string){
 const s=await rpcOne(u,k,"phms_get_line_prelink_person_setup",{p_line_user_id:uid,p_person_code:subjectCode});
 const row=(Array.isArray(s?.pending_access)?s.pending_access:[]).find((x:any)=>String(x.target_person_code)===String(targetCode))||{};
 await rpcOne(u,k,"phms_set_line_prelink_person_access_bundle",{
  p_line_user_id:uid,p_subject_person_code:subjectCode,p_target_person_code:targetCode,
  p_is_caregiver:patch.is_caregiver??row.is_caregiver??false,
  p_medications_level:patch.medications_level??row.medications_level??"none",
  p_appointments_level:patch.appointments_level??row.appointments_level??"none",
  p_health_level:patch.health_level??row.health_level??"none",
  p_receive_notifications:patch.receive_notifications??row.receive_notifications??false
 })
}

async function showReviewRequests(uid:string,replyToken:string,token:string,u:string,k:string,prefix="",page=0){
 const rows=await rpcRows(u,k,"phms_list_line_access_requests_for_review",{p_line_user_id:uid});
 if(!rows.length){await replyLine(replyToken,prefix+"✅ ไม่มีคำขอที่รอให้คุณอนุมัติในตอนนี้",token,[qpb("👨‍👩‍👧 ครอบครัว","ครอบครัว")]);return}
 const pageSize=5,total=Math.max(1,Math.ceil(rows.length/pageSize)),pg=Math.max(0,Math.min(Number(page)||0,total-1)),pageRows=rows.filter((_:any,i:number)=>i>=pg*pageSize&&i<(pg+1)*pageSize);
 const text=prefix+"📥 คำขอรอตรวจ • หน้า "+(pg+1)+"/"+total+"\n\n"+pageRows.map((r:any,i:number)=>{
  const detail=r.request_type==="role"?"บทบาท: "+roleThai(String(r.requested_role||"")):r.request_type==="admin_self_bundle"?"Admin ขอเพิ่ม/แก้สิทธิ์ของตัวเอง — "+String(r.person_name||"บุคคล"):r.request_type==="person_bundle"?(r.requested_action==="manage"?"ขอสิทธิ์จัดการข้อมูล":"ขอดูยา นัดหมาย และสุขภาพ")+(r.person_name?" — "+r.person_name:""):r.request_type==="self_caregiver"?"ขอเพิ่มผู้ช่วยดูแล — "+String(r.person_name||"บุคคล"):r.request_type==="self_viewer"?"ขออนุญาตให้สมาชิกดูข้อมูลอย่างเดียว — "+String(r.person_name||"บุคคล"):(r.request_type==="permission"&&r.resource==="appointments"&&r.requested_action==="view"?"ขอสิทธิ์ดูนัดหมาย — "+String(r.person_name||"บุคคล"):String(r.resource||"สิทธิ์")+" "+String(r.requested_action||""));
  return (pg*pageSize+i+1)+". "+String(r.requester_display_name||"สมาชิก")+"\n"+detail+(r.reason?"\nเหตุผล: "+r.reason:"")
 }).join("\n\n");
 const items:any[]=[];pageRows.forEach((r:any,i:number)=>{
 const n=pg*pageSize+i+1;
 if(r.request_type==="self_viewer"){
  items.push(qpb("✅ อนุมัติ #"+n,"อนุมัติผู้ดู "+r.request_code));
  items.push(qpb("❌ ปฏิเสธ #"+n,"ปฏิเสธผู้ดู "+r.request_code));
 }else{
  items.push(qpb("✅ อนุมัติ #"+n,"อนุมัติสิทธิ์ "+r.request_code));
  items.push(qpb("❌ ปฏิเสธ #"+n,"ปฏิเสธสิทธิ์ "+r.request_code));
 }
});
 if(pg>0)items.push(qpb("⬅️ ก่อนหน้า","ตรวจคำขอสิทธิ์ หน้า "+(pg-1)));
 if(pg<total-1)items.push(qpb("➡️ ถัดไป","ตรวจคำขอสิทธิ์ หน้า "+(pg+1)));
 await replyLine(replyToken,text,token,items)
}
function requestHelpText(prefix=""){return`${prefix}🔑 ขอสิทธิ์\nคุณขอสิทธิ์ของตัวเองได้ แล้วผู้ที่มีอำนาจในครอบครัวจะเป็นผู้พิจารณา\n\nตัวอย่าง:\n• ขอสิทธิ์ ยา ดู\n• ขอสิทธิ์ สุขภาพ แก้ไข\n• ขอสิทธิ์ นัดหมาย เพิ่ม\n• ขอสิทธิ์อนุมัติ\n• ขอบทบาท ผู้ดูแล\n\nถ้าต้องการสิทธิ์เฉพาะบุคคล ให้กดเลือกจากหน้า “สิทธิ์เข้าถึงบุคคล” เพื่อไม่ต้องพิมพ์รหัส`}
function familyError(e:any){const m=String(e).toLowerCase();if(m.includes("permission_management_denied")||m.includes("insufficient permission"))return"🔐 คุณไม่มีสิทธิ์จัดการสิทธิ์ของครอบครัวนี้";if(m.includes("permission_outside_actor_authority"))return"🔐 คุณได้รับมอบหมายให้จัดการสิทธิ์ แต่ไม่สามารถให้/ถอนสิทธิ์ที่อยู่นอกขอบเขตสิทธิ์ของตัวเองได้";if(m.includes("owner_required_for_permission_delegation"))return"🔐 เฉพาะ เจ้าบ้าน เท่านั้นที่มอบหรือถอนสิทธิ์อนุมัติได้";if(m.includes("access_request_required_for_self_target"))return"📥 หากต้องการเพิ่มสิทธิ์ให้ตัวเองในข้อมูลของคนอื่น ช่วยส่งคำขอเพื่อให้เจ้าตัว/ผู้ดูแลปัจจุบัน/ผู้มีอำนาจคนอื่นอนุมัติ";if(m.includes("request_self_review_not_allowed"))return"🔐 ผู้ขอไม่สามารถอนุมัติคำขอของตัวเองได้";if(m.includes("person_steward_required"))return"⚠️ ตั้งค่านี้ไม่ได้ เพราะจะทำให้ไม่มีใครจัดการข้อมูลของบุคคลนี้ เปิดให้เจ้าตัวจัดการเองหรือมีผู้ช่วยอย่างน้อย 1 คน";if(m.includes("owner_permissions_are_implicit"))return"ℹ️ สิทธิ์ข้อมูลสุขภาพของเจ้าบ้านต้องกำหนดเป็นรายบุคคล";if(m.includes("owner_required_for_admin_role")||m.includes("admin_role_management_denied"))return"🔐 คุณไม่มีสิทธิ์เปลี่ยนหน้าที่ผู้ช่วยดูแลครอบครัว";if(m.includes("owner_required_for_notification_permission")||m.includes("owner_or_admin_required_for_notification_permission"))return"🔐 สิทธิ์รับแจ้งเตือนเฉพาะบุคคลตั้งได้โดยเจ้าบ้านหรือแอดมิน";if(m.includes("owner_required_to_remove_member")||m.includes("owner_required_to_remove_person"))return"🔐 เฉพาะเจ้าบ้านเท่านั้นที่นำสมาชิกหรือบุคคลออกได้";if(m.includes("cannot_remove_family_owner")||m.includes("cannot_remove_self_member"))return"👑 ไม่สามารถนำเจ้าบ้านออกด้วยคำสั่งนี้ได้";if(m.includes("linked_person_remove_via_member_required"))return"ℹ️ บุคคลนี้เชื่อมบัญชีแล้ว ลองนำออกจากหน้า “บัญชีในครอบครัว” แทน";if(m.includes("family_member_not_found"))return"⚠️ ไม่พบสมาชิกนี้ เปิดรายชื่อสมาชิกใหม่";if(m.includes("family_person_not_found"))return"⚠️ ไม่พบบุคคลนี้ เปิดรายชื่อคนใหม่";if(m.includes("last_caregiver_required"))return"⚠️ ถอดไม่ได้ เพราะเจ้าตัวแก้ข้อมูลเองไม่ได้และยังไม่มีคนอื่นช่วยจัดการ เปิดให้เจ้าตัวจัดการเองหรือเพิ่มคนช่วยก่อน";if(m.includes("caregiver_target_required"))return"👤 สิทธิ์ช่วยจัดการต้องระบุบุคคลที่เข้าถึงก่อน";if(m.includes("caregiver_required_before_person_invite")||m.includes("self_manage_or_helper_required_before_person_invite"))return"🙋 ก่อนเชื่อมบัญชี ให้เลือกเจ้าตัวจัดการเอง หรือกำหนดคนอื่นช่วยจัดการอย่างน้อย 1 คน";if(m.includes("self_viewer_request_required"))return"📥 คุณยังไม่มีสิทธิ์จัดการข้อมูลตัวเอง การเพิ่มผู้ดูต้องส่งคำขอให้ผู้ดูแลอนุมัติก่อน";if(m.includes("self_can_grant_viewer_directly"))return"✅ คุณจัดการข้อมูลตัวเองได้ จึงเพิ่มผู้ดูได้โดยตรงจากหน้า “คนที่ดูข้อมูลฉันได้”";if(m.includes("self_viewer_reviewer_not_authorized"))return"🔐 คำขอนี้ต้องให้ผู้ดูแลหลักของเจ้าของข้อมูลสุขภาพอนุมัติก่อน หากไม่มีผู้ดูแลจึงให้เจ้าบ้าน/แอดมินพิจารณา";if(m.includes("target_is_caregiver_manage_access")||m.includes("target_has_manage_access"))return"ℹ️ คนนี้มีสิทธิ์จัดการข้อมูลอยู่แล้ว จึงไม่จัดเป็น Viewer ดูอย่างเดียว";if(m.includes("family_context_required"))return"🏠 ช่วยเลือกครอบครัวก่อน";if(m.includes("health_access_management_denied")||m.includes("medical_grant_denied")||m.includes("caregiver_management_denied"))return"🔒 ยังไม่มีสิทธิ์ตั้งคนช่วยดูแล ให้เจ้าของข้อมูลหรือผู้ดูแลหลักเป็นคนจัดการ";
if(m.includes("subject_uses_self_access"))return"ℹ️ เจ้าของข้อมูลจัดการข้อมูลตัวเองอยู่แล้ว จึงไม่ต้องเพิ่มเป็นผู้ช่วยอีกคน";
if(m.includes("primary_caregiver_has_full_access"))return"💚 คนนี้เป็นผู้ดูแลหลักอยู่แล้ว มีสิทธิ์ดูแลข้อมูลตามหน้าที่";
if(m.includes("family_person_not_found"))return"👤 คนนี้ถูกนำออกจากรายชื่อแล้ว เปิดรายชื่อคนในบ้านใหม่ได้เลย";
if(m.includes("permission_request_not_found"))return"⚠️ ไม่พบคำขอสิทธิ์นี้ หรือมีคนตรวจไปแล้ว";return"⚠️ ยังเปิดการตั้งค่าสิทธิ์ไม่ได้ ลองใหม่อีกครั้งนะ"}
async function showPersonClaimRequests(uid:string,replyToken:string,token:string,u:string,k:string,prefix="",page=0){
 const rows=await rpcRows(u,k,"phms_list_person_claims_for_review_from_line",{p_line_user_id:uid});
 if(!rows.length){await replyLine(replyToken,prefix+"✅ ตอนนี้ไม่มีคำขอเชื่อมบุคคลที่รอให้คุณตรวจ",token,[q("👨‍👩‍👧 ครอบครัว","ครอบครัว")]);return}
 const pageSize=5,total=Math.max(1,Math.ceil(rows.length/pageSize)),pg=Math.max(0,Math.min(Number(page)||0,total-1)),pageRows=rows.filter((_:any,i:number)=>i>=pg*pageSize&&i<(pg+1)*pageSize);
 const lines=pageRows.map((x:any,i:number)=>(pg*pageSize+i+1)+". 👤 "+String(x.person_display_name||"บุคคล")+"\nผู้ขอเชื่อม: "+String(x.claimant_display_name||"ผู้ใช้ PHMS")+"\nครอบครัว: "+String(x.family_name||"ครอบครัว")).join("\n\n");
 const items:any[]=[];pageRows.forEach((x:any,i:number)=>{items.push(qpb("✅ อนุมัติ #"+(pg*pageSize+i+1),"อนุมัติเชื่อมบุคคล "+String(x.review_code)));items.push(qpb("❌ ปฏิเสธ #"+(pg*pageSize+i+1),"ปฏิเสธเชื่อมบุคคล "+String(x.review_code)))});
 if(pg>0)items.push(qpb("⬅️ ก่อนหน้า","ตรวจคำขอเชื่อมบุคคล หน้า "+(pg-1)));
 if(pg<total-1)items.push(qpb("➡️ ถัดไป","ตรวจคำขอเชื่อมบุคคล หน้า "+(pg+1)));
 items.push(q("↩️ ครอบครัว","ครอบครัว"));
 await replyLine(replyToken,prefix+"🪪 คำขอเชื่อมบุคคล • หน้า "+(pg+1)+"/"+total+"\n\n"+lines,token,items)
}

async function showFamilyPersonInvitePicker(uid:string,replyToken:string,token:string,u:string,k:string,page=0,prefix=""){
 const roster=await rpcOne(u,k,"phms_list_line_family_roster",{p_line_user_id:uid});
 const entries=Array.isArray(roster?.entries)?roster.entries:[];
 const candidates=entries.filter((x:any)=>
  x?.entry_type==="person" &&
  x?.account_linked!==true &&
  String(x?.person_code||"").length===12
 );
 const pageSize=8,totalPages=Math.max(1,Math.ceil(candidates.length/pageSize));
 const pg=Math.max(0,Math.min(Number(page)||0,totalPages-1));
 const shown=candidates.slice(pg*pageSize,pg*pageSize+pageSize);
 if(!candidates.length){
  await replyLine(replyToken,
   (prefix?prefix+"\n\n":"")+
   "✅ ตอนนี้ไม่มีบุคคลที่รอเชื่อมบัญชี\n\n"+
   "ทุกบุคคลในครอบครัวที่มีอยู่เชื่อมบัญชีแล้ว หรือยังไม่มีบุคคลใหม่ให้เชิญ\n"+
   "คำเชิญเจ้าตัวจะไม่แสดงคนที่เชื่อมบัญชีแล้ว เพื่อป้องกันการผูกบัญชีซ้ำ",
   token,[
    qpb("➕ เพิ่มบุคคลใหม่","เพิ่มคน"),
    qpb("⚙️ คำเชิญแบบอื่น","เมนูคำเชิญอื่น"),
    qpb("↩️ ครอบครัว","ครอบครัว")
   ]
  );
  return
 }
 const lines=shown.map((x:any,i:number)=>{
  const rel=String(x?.relationship_label||"").trim();
  return String(pg*pageSize+i+1)+". "+String(x?.display_name||"บุคคล")+(rel?" • "+rel:"")
 }).join("\n");
 const items:any[]=shown.map((x:any)=>qpb(
  ("👤 "+String(x?.display_name||"บุคคล")).slice(0,20),
  "สร้างคำเชิญให้บุคคล "+String(x?.person_code||"")
 ));
 if(pg>0)items.push(qpb("⬅️ ก่อนหน้า","เลือกคนรับคำเชิญ หน้า "+String(pg-1)));
 if(pg<totalPages-1)items.push(qpb("➡️ ถัดไป","เลือกคนรับคำเชิญ หน้า "+String(pg+1)));
 items.push(qpb("⚙️ คำเชิญแบบอื่น","เมนูคำเชิญอื่น"));
 items.push(qpb("↩️ ครอบครัว","ครอบครัว"));
 await replyLine(replyToken,
  (prefix?prefix+"\n\n":"")+
  "🔗 คำเชิญเข้าร่วมครอบครัว\n\n"+
  "เลือกว่าคำเชิญนี้เป็นของใคร\n"+
  "จะแสดงเฉพาะบุคคลที่ยังไม่เชื่อมบัญชีเท่านั้น\n\n"+
  lines+
  (totalPages>1?"\n\nหน้า "+String(pg+1)+"/"+String(totalPages):""),
  token,items.slice(0,13)
 )
}
async function createFamilyPersonInvite(uid:string,personCode:string,replyToken:string,token:string,u:string,k:string){
 try{
  const inv=await rpcOne(u,k,"phms_create_line_family_person_invite",{
   p_line_user_id:uid,p_person_code:personCode
  });
  const familyToken=String(inv?.family_invite_token||"");
  const personToken=String(inv?.person_invite_token||"");
  if(!familyToken||!personToken)throw new Error("invite_token_missing");
  const familyName=String(inv?.family_name||"ครอบครัว");
  const familyCode=String(inv?.family_code||"");
  const personName=String(inv?.person_name||"บุคคล");
  const command="เข้าร่วมคำเชิญ "+familyToken+" รับบุคคล "+personToken;
  const fallback=u+"/functions/v1/family-invite?token="+encodeURIComponent(familyToken)+"&person_token="+encodeURIComponent(personToken);
  const link=await lineDeepLink(token,command,fallback);
  const text=
   "🌷 คำเชิญเข้าร่วมครอบครัวสำหรับ “"+personName+"”\n\n"+
   "🏠 "+familyName+"\n"+
   "👤 คำเชิญนี้ระบุตัวตนไว้แล้ว: "+personName+"\n\n"+
   "ส่งข้อความนี้ให้เจ้าตัวเท่านั้น เมื่อรับคำเชิญ อิ่มอุ่นจะเชื่อมบัญชีของผู้รับกับข้อมูลบุคคลนี้ และไม่สร้างบุคคลซ้ำ\n\n"+
   "🔗 แตะลิงก์นี้เพื่อรับคำเชิญ\n"+link+
   (familyCode?"\n\n🔑 รหัสบ้าน: "+familyCode:"")+
   "\n\nลิงก์มีอายุ 30 วัน";
  await replyLine(replyToken,text,token,[
   qpb("👤 เชิญคนอื่นต่อ","ชวนเข้าครอบครัว"),
   qpb("↩️ ครอบครัว","ครอบครัว")
  ])
 }catch(err){
  const msg=String(err);
  console.error("create_family_person_invite",msg);
  if(msg.includes("person_already_linked")){
   await showFamilyPersonInvitePicker(uid,replyToken,token,u,k,0,"ℹ️ คนนี้เชื่อมบัญชีแล้ว จึงเอาออกจากรายชื่อคำเชิญ")
  }else if(msg.includes("legal_name_required_for_person_invite")){
   await replyLine(replyToken,
    "🪪 ยังสร้างคำเชิญให้คนนี้ไม่ได้\n\nต้องมีชื่อจริงและนามสกุลก่อน เพื่อใช้ยืนยันว่าเจ้าตัวกำลังรับข้อมูลของใคร\nชื่อเรียก/ชื่อเล่นอย่างเดียวไม่ใช้ยืนยันตัวตน",
    token,[qpb("👤 กลับเลือกรายชื่อ","ชวนเข้าครอบครัว"),qpb("👤 บุคคลในครอบครัว","บุคคลในครอบครัว")]
   )
  }else if(msg.includes("self_manage_or_helper_required_before_person_invite")){
   await replyLine(replyToken,
    "🙋 ก่อนเชิญเจ้าตัว ต้องกำหนดก่อนว่าเจ้าตัวจัดการข้อมูลตัวเองได้ หรือมีคนอื่นช่วยจัดการอย่างน้อย 1 คน",
    token,[qpb("👤 กลับเลือกรายชื่อ","ชวนเข้าครอบครัว"),qpb("🧩 ตั้งค่าบุคคล","ตั้งค่าบุคคล")]
   )
  }else if(msg.includes("person_setup_not_published")){
   await replyLine(replyToken,
    "⚠️ บุคคลนี้ยังตั้งค่าไม่ครบ จึงยังส่งคำเชิญเชื่อมบัญชีไม่ได้",
    token,[qpb("🧩 ตั้งค่าบุคคล","ตั้งค่าบุคคล"),qpb("👤 กลับเลือกรายชื่อ","ชวนเข้าครอบครัว")]
   )
  }else{
   await replyLine(replyToken,
    "⚠️ ยังสร้างคำเชิญให้บุคคลนี้ไม่ได้ ลองอีกครั้งนะ",
    token,[qpb("🔄 เลือกใหม่","ชวนเข้าครอบครัว"),qpb("↩️ ครอบครัว","ครอบครัว")]
   )
  }
 }
}

async function showInviteTypeMenu(uid:string,replyToken:string,token:string,u:string,k:string){
 const prep=await prepareFamily(uid,u,k);
 let ov:any=null;try{ov=await rpcOne(u,k,"phms_get_line_active_person_access_overview",{p_line_user_id:uid})}catch{}
 const personName=String(ov?.person_name||"").trim();
 const items:any[]=[];
 if(personName){
  items.push(qpb("👤 เชิญเจ้าตัวในบ้าน","ชวนเข้าครอบครัว"));
  items.push(qpb("🧑‍⚕️ เชิญผู้ดูแล / ผู้มีสิทธิ์ดู","ชวนผู้ดูแลบุคคลปัจจุบัน"));
 }
 if(prep?.is_owner)items.push(qpb("🛡️ เชิญผู้ช่วยดูแลครอบครัว","ชวนผู้ช่วยดูแลครอบครัว"));
 items.push(qpb("👥 เชิญสมาชิกทั่วไป","ชวนสมาชิกทั่วไปจริง"));
 items.push(qpb("↩️ กลับครอบครัว","ครอบครัว"));
 const text=personName
  ?"🔗 เชิญคนเข้าครอบครัว\n\nตอนนี้กำลังดูข้อมูลของ “"+personName+"”\n\n👤 เชิญเจ้าตัว — เชื่อมบัญชีกับข้อมูลบุคคลนี้\n🤝 ผู้ช่วยดูแล / 👀 ผู้ที่ดูข้อมูลได้ — เชิญคนมาช่วยดูแลหรือดูข้อมูลของบุคคลนี้\n"+(prep?.is_owner?"🛡️ ผู้ช่วยดูแลครอบครัว — เจ้าบ้านเท่านั้นที่มอบหน้าที่นี้ได้\n":"")+"👥 สมาชิกทั่วไป — เข้าบ้านโดยยังไม่มีสิทธิ์ข้อมูลอัตโนมัติ"
  :"🔗 เชิญคนเข้าครอบครัว\n\n"+(prep?.is_owner?"🛡️ คุณสามารถเชิญผู้ช่วยดูแลครอบครัวได้\n":"")+"👥 หรือเชิญสมาชิกทั่วไปเข้าบ้านก่อน";
 await replyLine(replyToken,text,token,items)
}
async function createGeneralMemberInvite(uid:string,replyToken:string,token:string,u:string,k:string){
 const inv=await rpcOne(u,k,"phms_create_line_family_invite",{p_line_user_id:uid});
 const familyName=String(inv?.family_name||"ครอบครัว");
 const familyCode=String(inv?.family_code||"");
 const fallback=u+"/functions/v1/family-invite?token="+encodeURIComponent(String(inv?.invite_token||""));
 const link=await lineDeepLink(token,"เข้าร่วมคำเชิญ "+String(inv?.invite_token||""),fallback);
 const text=
  "🌼 มาร่วมบ้านเดียวกันในอิ่มอุ่นนะ\n\n"+
  "🏠 "+familyName+"\n"+
  "👥 คำเชิญนี้เป็นสมาชิกครอบครัวทั่วไป\n\n"+
  "ยังไม่ได้ผูกกับ บุคคลใด เมื่อเข้าร่วมแล้ว เจ้าบ้าน ค่อยกำหนดว่าให้ดูแลใครหรือเข้าถึงข้อมูลอะไรได้ 💛\n\n"+
  "🔗 แตะลิงก์นี้เพื่อเข้าร่วม\n"+link+
  (familyCode?"\n\n🔑 รหัสบ้าน: "+familyCode:"")+
  "\n\nลิงก์มีอายุ 30 วัน";
 await replyLine(replyToken,text,token,[qpb("↩️ ครอบครัว","ครอบครัว")])
}
async function createแอดมินInvite(uid:string,replyToken:string,token:string,u:string,k:string){
 const prep=await prepareFamily(uid,u,k);
 if(!prep?.is_owner)throw new Error("owner_required_for_admin_role");
 const inv=await rpcOne(u,k,"phms_create_line_family_invite",{p_line_user_id:uid});
 const identity=await getIdentity(u,k,uid);if(!identity?.user_id)throw new Error("line_identity_not_linked");
 const hash=await sha256Hex(String(inv?.invite_token||""));
 const ins=await fetch(u+"/rest/v1/family_invite_intents",{method:"POST",headers:{...rh(k),Prefer:"return=minimal"},body:JSON.stringify({
  token_hash:hash,family_id:String(inv.family_id),family_person_id:null,created_by:String(identity.user_id),
  intent_type:"admin",permission_preset:"admin_role_only",status:"pending"
 })});
 if(!ins.ok)throw new Error("admin_invite_intent_create_failed:"+ins.status+":"+await ins.text());
 const fallback=u+"/functions/v1/family-invite?token="+encodeURIComponent(String(inv?.invite_token||""));
 const link=await lineDeepLink(token,"เข้าร่วมคำเชิญ "+String(inv?.invite_token||""),fallback);
 await replyLine(replyToken,
  "🛡️ คำเชิญผู้ช่วยดูแลครอบครัว\n\n🏠 "+String(inv?.family_name||"ครอบครัว")+
  "\nหน้าที่: ผู้ช่วยดูแลครอบครัว\n\nผู้ช่วยดูแลครอบครัวช่วยจัดการสมาชิกและการตั้งค่าครอบครัวได้\nแต่ไม่ได้สิทธิ์เปิดยา นัดหมาย สุขภาพ หรือรายละเอียดของทุกคนอัตโนมัติ\nไม่สามารถตั้งผู้ช่วยดูแลครอบครัวคนอื่น เปลี่ยนเจ้าบ้าน หรือลบเจ้าบ้านได้"+
  "\n\n🔗 "+link,token,[qpb("↩️ ครอบครัว","ครอบครัว")])
}
async function showCaregiverInvitePreset(uid:string,replyToken:string,token:string,u:string,k:string,page=0){
 const ov=await rpcOne(u,k,"phms_get_line_active_person_access_overview",{p_line_user_id:uid}),personName=String(ov?.person_name||"บุคคล");
 const existing=(Array.isArray(ov?.members)?ov.members:[]).filter((m:any)=>!m?.is_self&&!m?.is_owner);
 const pageSize=7,total=Math.max(1,Math.ceil(existing.length/pageSize)),pg=Math.max(0,Math.min(Number(page)||0,total-1));
 const items:any[]=[qpb("💚 ผู้ดูแล • จัดการได้","สร้างคำเชิญผู้ดูแล caregiver_standard"),qpb("👀 ผู้ที่ดูข้อมูลได้","สร้างคำเชิญผู้ดูแล viewer")];
 for(const m of existing.filter((_:any,i:number)=>i>=pg*pageSize&&i<(pg+1)*pageSize))items.push(qpb("👤 "+String(m.display_name||"สมาชิก").slice(0,16),"สิทธิ์บุคคล "+String(m.member_code)+" "+String(ov.person_code)));
 if(pg>0)items.push(qpb("⬅️ ก่อนหน้า","ชวนผู้ดูแลบุคคลปัจจุบัน หน้า "+(pg-1)));
 if(pg<total-1)items.push(qpb("➡️ ถัดไป","ชวนผู้ดูแลบุคคลปัจจุบัน หน้า "+(pg+1)));
 items.push(qpb("↩️ กลับ","ชวนเข้าครอบครัว"));
 await replyLine(replyToken,"🧑‍⚕️ สิทธิ์กับ “"+personName+"”\n\nถ้าคนนี้อยู่ในครอบครัวแล้ว เลือกชื่อด้านล่างเพื่อแก้สิทธิ์ได้ทันที\nหน้า "+(pg+1)+"/"+total+"\n\nถ้ายังไม่ได้อยู่ในบ้าน เลือก preset ด้านบน",token,items)
}
async function createCaregiverInvite(uid:string,replyToken:string,token:string,u:string,k:string,preset:string){
 if(preset==="role_only")preset="caregiver_standard";
 const inv=await rpcOne(u,k,"phms_create_line_family_invite",{p_line_user_id:uid});
 const ov=await rpcOne(u,k,"phms_get_line_active_person_access_overview",{p_line_user_id:uid});
 const identity=await getIdentity(u,k,uid);
 if(!identity?.user_id||!ov?.actor_can_manage_permissions)throw new Error("permission_denied");
 const hash=await sha256Hex(String(inv?.invite_token||""));
 const ins=await fetch(u+"/rest/v1/family_invite_intents",{
  method:"POST",
  headers:{...rh(k),Prefer:"return=minimal"},
  body:JSON.stringify({
   token_hash:hash,
   family_id:String(ov.family_id),
   family_person_id:String(ov.family_person_id),
   created_by:String(identity.user_id),
   intent_type:"caregiver",
   permission_preset:preset,
   status:"pending"
  })
 });
 if(!ins.ok)throw new Error("invite_intent_create_failed:"+ins.status+":"+await ins.text());
 const familyName=String(inv?.family_name||"ครอบครัว");
 const familyCode=String(inv?.family_code||"");
 const personName=String(ov?.person_name||"บุคคล");
 const level=preset==="viewer"?"ดูอย่างเดียว":"ผู้ดูแล • จัดการข้อมูลได้";
 const detail=preset==="viewer"
  ?"ดูข้อมูลยา นัดหมาย และสุขภาพได้อย่างเดียว"
  :"ดู • เพิ่ม • แก้ไข • ลบ ยา นัดหมาย และสุขภาพ + รับแจ้งเตือน";
 const fallback=u+"/functions/v1/family-invite?token="+encodeURIComponent(String(inv?.invite_token||""));
 const link=await lineDeepLink(token,"เข้าร่วมคำเชิญ "+String(inv?.invite_token||""),fallback);
 const text=
  "🌿 อิ่มอุ่นมีคำเชิญให้มาช่วยดูแลคนในบ้าน\n\n"+
  "🏠 "+familyName+"\n"+
  "🧑‍⚕️ ดูแล: "+personName+"\n"+
  "🔐 ระดับ: "+level+"\n"+
  "✨ "+detail+"\n\n"+
  "🔗 แตะลิงก์นี้เพื่อเข้าร่วม\n"+link+
  (familyCode?"\n\n🔑 รหัสบ้าน: "+familyCode:"")+
  "\n\nถ้ามีบัญชีอิ่มอุ่นอยู่แล้ว ใช้บัญชีเดิมรับคำเชิญได้เลย\nถ้ายังไม่มี อิ่มอุ่นจะพาเชื่อมบัญชีก่อน 💛";
 await replyLine(replyToken,text,token,[qpb("↩️ ครอบครัว","ครอบครัว")])
}

/* AIM_CAREGIVER_PICKER_CANONICAL_V1: status-filtered source, stable member IDs and primary/self protection. */
async function showCaregiverPickerForPerson(uid:string,personCode:string,replyToken:string,token:string,u:string,k:string,page=0,prefix=""){
 const roster=await rpcOne(u,k,"phms_list_line_family_roster",{p_line_user_id:uid});
 const entries=Array.isArray(roster?.entries)?roster.entries:[];
 const person=entries.find((x:any)=>x?.entry_type==="person"&&String(x?.person_code)===String(personCode));
 if(!person){
  await replyLine(replyToken,"คนนี้ไม่ได้อยู่ในรายชื่อที่ใช้งานแล้ว เปิดรายชื่อใหม่ได้เลย",token,[qpb("👤 คนในบ้าน","บุคคลในครอบครัว")]);return
 }
 await rpcOne(u,k,"phms_select_line_context_person",{p_line_user_id:uid,p_selection_code:personCode});
 const care=await rpcOne(u,k,"phms_list_line_person_caregivers",{p_line_user_id:uid});
 const canManage=care?.can_manage===true;
 if(!canManage){
  await replyLine(replyToken,"🔒 การตั้งคนช่วยดูแลข้อมูลของ "+String(person.display_name||"คนในบ้าน")+" ต้องให้เจ้าของข้อมูลที่จัดการเองได้หรือผู้ดูแลที่มีสิทธิ์เป็นคนทำ",token,[
   qpb("📥 ขอสิทธิ์","ขอสิทธิ์แบบง่าย "+personCode),
   qpb("👤 คนในบ้าน","บุคคลในครอบครัว")
  ]);return
 }
 const current=Array.isArray(care?.assistants)?care.assistants:[];
 const assignedCodes=new Set(current.map((x:any)=>String(x.member_code||"")));
 const rosterMembers=Array.isArray(care?.candidates)?care.candidates:[];
 const candidates:any[]=[];
 for(const m of rosterMembers){
  const code=String(m.member_code||"");
  if(!/^[a-f0-9]{12}$/i.test(code))continue;
  const label=String(m.display_name||"สมาชิก");
  if(m.is_primary===true)continue; // primary caregiver already has full authority
  const assigned=m.assigned_assistant===true||assignedCodes.has(code);
  candidates.push({label:(assigned?"✅ ":"⬜ ")+label.slice(0,17),
   data:(assigned?"ถอดผู้ดูแลให้บุคคล ":"ตั้งผู้ดูแลให้บุคคล ")+personCode+" "+code});
 }
 const unlinked=entries.filter((x:any)=>x?.entry_type==="person"&&x?.account_linked!==true&&String(x?.person_code)!==String(personCode));
 for(const cand of unlinked){
  let cs:any=null;
  try{cs=await rpcOne(u,k,"phms_get_line_prelink_person_setup",{p_line_user_id:uid,p_person_code:String(cand.person_code)})}catch{}
  const assigned=Array.isArray(cs?.pending_access)&&cs.pending_access.some((x:any)=>String(x?.target_person_code)===String(personCode)&&x?.is_caregiver===true);
  candidates.push({label:(assigned?"✅ ⏳ ":"⬜ ⏳ ")+String(cand.display_name||"บุคคล").slice(0,14),data:"สลับผู้ช่วยล่วงหน้า "+personCode+" "+String(cand.person_code)});
 }
 const size=7,total=Math.max(1,Math.ceil(candidates.length/size)),pg=Math.max(0,Math.min(Number(page)||0,total-1));
 const items:any[]=candidates.slice(pg*size,pg*size+size).map((x:any)=>qpb(x.label,x.data));
 if(pg>0)items.push(qpb("⬅️ ก่อนหน้า","เลือกผู้ดูแลให้บุคคล "+personCode+" "+(pg-1)));
 if(pg<total-1)items.push(qpb("➡️ ถัดไป","เลือกผู้ดูแลให้บุคคล "+personCode+" "+(pg+1)));
 items.push(qpb("☑️ เลือกหลายคน","เลือกผู้ช่วยหลายคน "+personCode));
 items.push(qpb("➕ เพิ่มคนใหม่","เพิ่มผู้ช่วยใหม่ให้บุคคล "+personCode));
 items.push(qpb("👤 คนในบ้าน","บุคคลในครอบครัว"));
 const primary=care?.primary_name?"\n💚 ผู้ดูแลหลัก: "+String(care.primary_name):"";
 const count=current.length;
 await replyLine(replyToken,(prefix?prefix+"\n\n":"")+"👥 คนที่ช่วยดูแล "+String(person.display_name||"คนในบ้าน")+
  "\nตอนนี้มีผู้ช่วย "+count+" คน"+primary+
  "\n\n⬜ แตะชื่อเพื่อเพิ่มผู้ช่วย\n✅ แตะชื่อเพื่อเอาออก\n⏳ รอเชื่อมบัญชี"+
  (total>1?"\nหน้า "+(pg+1)+"/"+total:""),token,items.slice(0,13))
}
async function setSelfCaregiverPrelink(uid:string,personCode:string,replyToken:string,token:string,u:string,k:string){
 await rpcOne(u,k,"phms_set_line_person_self_access",{
  p_line_user_id:uid,p_person_code:personCode,p_mode:"self_manage",
  p_resource:null,p_action:null,p_enabled:null
 });
 await replyLine(replyToken,"✅ ตั้งให้เจ้าตัวจัดการข้อมูลของตัวเองได้หลังเชื่อมบัญชีแล้ว",token,[
  qpb("⚙️ กลับตั้งค่าล่วงหน้า","ตั้งค่าก่อนเชื่อม "+personCode),
  qpb("↩️ บุคคลในครอบครัว","บุคคลในครอบครัว")
 ])
}

function selfAccessLevelThai(v:any){return String(v||"none")==="manage"?"จัดการ":String(v||"none")==="view"?"ดู":"ไม่มี"}
async function showSelfAccessDirectory(uid:string,replyToken:string,token:string,u:string,k:string,prefix=""){
 const out=await rpcOne(u,k,"phms_list_line_self_viewers",{p_line_user_id:uid});
 const rows=Array.isArray(out?.items)?out.items:[];
 const active=rows.filter((m:any)=>
   m?.is_caregiver||m?.has_manage_access||m?.view_all||
   m?.medications!=="none"||m?.appointments!=="none"||m?.health!=="none"||m?.pending_request
 );
 const summary:any={type:"bubble",size:"kilo",
  header:{type:"box",layout:"vertical",backgroundColor:"#EEF6FF",paddingAll:"16px",contents:[
   {type:"text",text:"👀 คนที่เข้าถึงข้อมูลของฉัน",weight:"bold",size:"lg",color:"#365F8D"},
   {type:"text",text:String(out?.person_name||"ข้อมูลของฉัน"),size:"sm",weight:"bold",margin:"sm",wrap:true}
  ]},
  body:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"16px",contents:[
   ...(prefix?[{type:"text",text:prefix,size:"sm",weight:"bold",color:"#285943",wrap:true}]:[]),
   {type:"text",text:"ตอนนี้มี "+String(active.filter((x:any)=>!x?.pending_request||x?.view_all||x?.has_manage_access).length)+" คนที่มีสิทธิ์เข้าถึง",size:"sm",weight:"bold",wrap:true},
   {type:"text",text:"การ์ดแต่ละคนจะแสดงว่า ดูหรือจัดการ ยา / นัดหมาย / สุขภาพ ได้แค่ไหน และรับแจ้งเตือนหรือไม่",size:"xs",color:"#667788",wrap:true},
   {type:"text",text:"ผู้ดูแล = อาจเพิ่ม/แก้ข้อมูลได้ • Viewer = ดูอย่างเดียว",size:"xs",color:"#777777",wrap:true}
  ]},
  footer:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"12px",contents:[
   {type:"button",style:"primary",action:{type:"postback",label:"⚙️ เพิ่ม / ลดคนที่ดูได้",data:"จัดการคนที่ดูข้อมูลฉัน"}},
   {type:"button",style:"secondary",action:{type:"postback",label:"🙋 สิทธิ์ข้อมูลของฉัน",data:"จัดการสิทธิ์ข้อมูลของฉัน"}},
   {type:"button",style:"secondary",action:{type:"postback",label:"↩️ ภาพรวมบุคคล",data:"กลับภาพรวมบุคคล"}}
  ]}
 };
 const cards=active.slice(0,9).map((m:any)=>{
  const role=m?.is_caregiver||m?.has_manage_access?"🛡️ ผู้ช่วยจัดการ":m?.pending_request&&!m?.view_all?"⏳ รออนุมัติ":"👀 ผู้ดู";
  const body:any[]=[
   {type:"text",text:role,size:"xs",weight:"bold",color:m?.has_manage_access?"#2F6B4F":m?.pending_request?"#8A6B2F":"#365F8D"},
   {type:"text",text:"💊 ยา: "+selfAccessLevelThai(m?.medications),size:"sm",wrap:true},
   {type:"text",text:"📅 นัดหมาย: "+selfAccessLevelThai(m?.appointments),size:"sm",wrap:true},
   {type:"text",text:"❤️ สุขภาพ: "+selfAccessLevelThai(m?.health),size:"sm",wrap:true},
   {type:"text",text:"🔔 แจ้งเตือน: "+(m?.receive_notifications?"รับ":"ไม่รับ"),size:"sm",wrap:true}
  ];
  const foot:any[]=[];
  if(out?.self_manage===true&&!m?.has_manage_access&&!m?.is_caregiver){
   foot.push({type:"button",style:"secondary",action:{type:"postback",label:m?.view_all?"➖ ยกเลิกสิทธิ์ดู":"➕ ให้ดูอย่างเดียว",data:"ตั้งผู้ดูของฉัน "+String(m.member_code)+" "+(m?.view_all?"off":"on")+" 0"}})
  }
  return {type:"bubble",size:"kilo",
   header:{type:"box",layout:"vertical",backgroundColor:m?.has_manage_access?"#F1F8F4":m?.pending_request?"#FFF7E8":"#F7F9FC",paddingAll:"14px",contents:[
    {type:"text",text:String(m?.display_name||"สมาชิก"),weight:"bold",size:"md",wrap:true}
   ]},
   body:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"14px",contents:body},
   ...(foot.length?{footer:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"10px",contents:foot}}:{})
  }
 });
 if(!active.length){
  cards.push({type:"bubble",size:"kilo",body:{type:"box",layout:"vertical",paddingAll:"18px",contents:[
   {type:"text",text:"ยังไม่มีคนอื่นที่เข้าถึงข้อมูลของคุณ",weight:"bold",size:"md",wrap:true},
   {type:"text",text:"กด “เพิ่ม / ลดคนที่ดูได้” เพื่อจัดการ Viewer ได้",size:"sm",color:"#777777",wrap:true,margin:"sm"}
  ]}})
 }
 await replyMessages(replyToken,token,[{type:"flex",altText:"👀 คนที่เข้าถึงข้อมูลของฉัน",contents:{type:"carousel",contents:[summary,...cards].slice(0,12)}}])
}
async function showSelfViewerManagePicker(uid:string,replyToken:string,token:string,u:string,k:string,page=0,prefix=""){
 const out=await rpcOne(u,k,"phms_list_line_self_viewers",{p_line_user_id:uid});
 const rows=Array.isArray(out?.items)?out.items:[];
 const pageSize=8,total=Math.max(1,Math.ceil(rows.length/pageSize)),pg=Math.max(0,Math.min(Number(page)||0,total-1));
 const pageRows=rows.slice(pg*pageSize,(pg+1)*pageSize);
 const items:any[]=[];
 for(const m of pageRows){
  const name=String(m?.display_name||"สมาชิก");
  if(m?.has_manage_access||m?.is_caregiver){
   items.push(qpb("🛡️ "+name.slice(0,15),"ดูสถานะผู้ดู "+String(m.member_code)));
  }else if(m?.view_all){
   if(out?.self_manage===true)items.push(qpb("☑️ "+name.slice(0,16),"ตั้งผู้ดูของฉัน "+String(m.member_code)+" off "+pg));
   else items.push(qpb("✅ "+name.slice(0,16),"ดูสถานะผู้ดู "+String(m.member_code)));
  }else if(m?.pending_request){
   items.push(qpb("⏳ "+name.slice(0,16),"ดูสถานะผู้ดู "+String(m.member_code)));
  }else if(out?.self_manage===true){
   items.push(qpb("⬜ "+name.slice(0,16),"ตั้งผู้ดูของฉัน "+String(m.member_code)+" on "+pg));
  }else{
   items.push(qpb("📤 "+name.slice(0,16),"ขอผู้ดูของฉัน "+String(m.member_code)+" "+pg));
  }
 }
 if(pg>0)items.push(qpb("⬅️ ก่อนหน้า","จัดการคนที่ดูข้อมูลฉัน "+(pg-1)));
 if(pg<total-1)items.push(qpb("➡️ ถัดไป","จัดการคนที่ดูข้อมูลฉัน "+(pg+1)));
 items.push(qpb("👀 ดูสรุปคนที่เข้าถึง","คนที่ดูข้อมูลฉันได้ 0"));
 const intro=out?.self_manage===true
  ?"คุณจัดการข้อมูลตัวเองได้ จึงติ๊ก/ยกเลิก Viewer ได้ทันที"
  :"คุณแก้ข้อมูลตัวเองไม่ได้ การเพิ่ม Viewer จะส่งคำขอให้ผู้ดูแลอนุมัติก่อน";
 await replyLine(replyToken,
  (prefix?prefix+"\n\n":"")+"☑️ จัดการคนที่ดูข้อมูลของฉัน\n\n"+intro+
  "\n\n☑️ = ดูยา นัดหมาย สุขภาพได้อย่างเดียว\n🛡️ = มีสิทธิ์จัดการสูงกว่า Viewer"+
  (total>1?"\nหน้า "+(pg+1)+"/"+total:""),
  token,items.slice(0,13))
}

async function showMemberSelfAccess(uid:string,memberCode:string,replyToken:string,token:string,u:string,k:string){
 const m=await rpcOne(u,k,"phms_get_line_family_member_detail",{p_line_user_id:uid,p_member_code:memberCode});
 const a=await rpcOne(u,k,"phms_list_line_member_person_access",{p_line_user_id:uid,p_member_code:memberCode});
 const helpers=Array.isArray(a?.helpers)?a.helpers:[];
 const items:any[]=[];
 const isSelf=m?.is_self===true;
 const selfManage=a?.self_manage!==false;
 if(a?.self_person_code){
  if(isSelf)items.push(qpb("👀 คนที่ดูข้อมูลฉันได้","คนที่ดูข้อมูลฉันได้ 0"));
  if(m?.actor_can_manage_permissions){
   items.push(qpb(selfManage?"👁️ เปลี่ยนเป็นดูอย่างเดียว":"✅ ให้จัดการข้อมูลตัวเอง",
     "ตั้งสิทธิ์ตัวเองสมาชิก "+memberCode+" "+(selfManage?"view_only":"self_manage")));
  }else if(isSelf&&selfManage){
   items.push(qpb("👁️ เปลี่ยนเป็นดูอย่างเดียว","ตั้งสิทธิ์ตัวเองสมาชิก "+memberCode+" view_only"));
  }
  if(m?.actor_can_manage_permissions){
   items.push(qpb("👥 จัดการคนช่วยข้อมูลของฉัน","เลือกผู้ดูแลให้บุคคล "+String(a.self_person_code)));
  }else if(isSelf&&selfManage){
   items.push(qpb("👥 เพิ่ม/ลดผู้ช่วยดูแล","เลือกผู้ดูแลให้บุคคล "+String(a.self_person_code)));
   items.push(qpb("☑️ เลือกหลายคน","เลือกผู้ช่วยหลายคน "+String(a.self_person_code)));
  }else if(isSelf&&!selfManage){
   items.push(qpb("📥 ขอสิทธิ์จัดการข้อมูลของฉัน","ขอจัดการข้อมูลตัวเอง"));
   items.push(qpb("📥 ขอเพิ่มผู้ช่วยดูแล","ขอผู้ช่วยดูแลตัวเอง "+memberCode));
  }
 }
 items.push(qpb("↩️ กลับ","เลือกสมาชิก "+memberCode));
 await replyLine(replyToken,
  "🙋 จัดการข้อมูลของฉัน — "+String(m?.display_name||"สมาชิก")+"\n\n"+
  "สิทธิ์ตัวเอง: "+(selfManage?"ดู/เพิ่ม/แก้ข้อมูลตัวเองได้":"ดูข้อมูลตัวเองได้ แต่แก้เองไม่ได้")+"\n"+
  "คนที่ช่วยจัดการ: "+(helpers.length?helpers.map((x:any)=>String(x?.display_name||"สมาชิก")).join(" • "):"ไม่มี")+"\n\n"+
  (isSelf&&!selfManage
    ?"ถ้าต้องการจัดการข้อมูลตัวเอง หรือเพิ่มผู้ช่วยดูแล อิ่มอุ่นจะส่งคำขอไปยังผู้ดูแลปัจจุบันก่อนอนุมัติ"
    :"คุณสามารถมีสิทธิ์จัดการตัวเอง และมีคนอื่นช่วยจัดการพร้อมกันได้"),
  token,items.slice(0,13))
}
async function showPrelinkSelfAccess(uid:string,personCode:string,replyToken:string,token:string,u:string,k:string){
 const s=await rpcOne(u,k,"phms_get_line_prelink_person_setup",{p_line_user_id:uid,p_person_code:personCode});
 const helpers=Array.isArray(s?.helpers)?s.helpers:[];
 await replyLine(replyToken,
  "🙋 การจัดการข้อมูลของเจ้าตัว — "+String(s?.person_name||"บุคคล")+"\n\n"+
  "หลังเชื่อมบัญชี: "+(s?.self_manage===false?"ดูได้ แต่แก้เองไม่ได้":"ดู/เพิ่ม/แก้ข้อมูลตัวเองได้")+"\n"+
  "คนที่ช่วยจัดการ: "+(helpers.length?helpers.map((x:any)=>String(x?.display_name||"บุคคล")).join(" • "):"ไม่มี")+
  "\n\nเปิดจัดการตัวเองและมีผู้ช่วยดูแลพร้อมกันได้",
  token,[
   qpb(s?.self_manage===false?"✅ ให้จัดการตัวเอง":"👁️ เปลี่ยนเป็นดูอย่างเดียว",
     "ตั้งสิทธิ์เจ้าตัวล่วงหน้า "+personCode+" "+(s?.self_manage===false?"self_manage":"view_only")),
   qpb("👥 จัดการคนที่ช่วย","เลือกผู้ดูแลให้บุคคล "+personCode),
   qpb("↩️ กลับ","ตั้งค่าก่อนเชื่อม "+personCode)
  ])
}

async function getFamilyFlowState(uid:string,u:string,k:string){
 try{return await rpcOne(u,k,"phms_get_line_conversation_state",{p_line_user_id:uid})}catch{return null}
}
async function setFamilyFlowState(uid:string,key:string,data:any,u:string,k:string){
 return rpcOne(u,k,"phms_set_line_conversation_state",{p_line_user_id:uid,p_state_key:key,p_state_data:data,p_ttl_minutes:30})
}
async function showBulkPersonPermissionPicker(uid:string,memberCode:string,replyToken:string,token:string,u:string,k:string,page=0,changedCode="",changedOn:any=null){
 const roster=await rpcOne(u,k,"phms_list_line_family_roster",{p_line_user_id:uid});
 const people=(Array.isArray(roster?.entries)?roster.entries:[]).filter((x:any)=>x?.entry_type==="person"&&x?.person_code);
 const st=await getFamilyFlowState(uid,u,k);
 const selected=new Set<string>(st?.state_key==="bulk_person_permission"&&String(st?.state_data?.member_code||"")===memberCode?(st?.state_data?.selected||[]):[]);
 const pageSize=7,total=Math.max(1,Math.ceil(people.length/pageSize)),pg=Math.max(0,Math.min(Number(page)||0,total-1));
 const items:any[]=[];
 for(const x of people.slice(pg*pageSize,pg*pageSize+pageSize)){
  const pc=String(x.person_code),on=selected.has(pc);
  items.push(qpb((on?"☑️ ":"⬜ ")+String(x.display_name||"บุคคล").slice(0,16),"สลับเลือกหลายสิทธิ์ "+memberCode+" "+pc+" "+pg))
 }
 if(pg>0)items.push(qpb("⬅️ ก่อนหน้า","เลือกหลายบุคคลสิทธิ์ "+memberCode+" "+(pg-1)));
 if(pg<total-1)items.push(qpb("➡️ ถัดไป","เลือกหลายบุคคลสิทธิ์ "+memberCode+" "+(pg+1)));
 if(selected.size)items.push(qpb("✅ ตั้งสิทธิ์ "+selected.size+" คน","ตั้งระดับหลายบุคคล "+memberCode));
 items.push(qpb("❌ ยกเลิก","สิทธิ์เฉพาะบุคคล "+memberCode));
 const changed=changedCode?people.find((x:any)=>String(x.person_code)===String(changedCode)):null;
 const confirm=changed?(changedOn?"✅ เลือกเพิ่ม: ":"➖ เอาออก: ")+String(changed.display_name||"บุคคล")+"\n":"";
 await replyLine(replyToken,confirm+"☑️ ให้บัญชีนี้เข้าถึงหลายบุคคล\n\nเลือกหลายบุคคลที่ต้องการใช้สิทธิ์ชุดเดียวกัน แล้วกด “ตั้งสิทธิ์”\nเลือกแล้ว "+selected.size+" คน"+(total>1?" • หน้า "+(pg+1)+"/"+total:""),token,items.slice(0,13))
}
async function showCaregiverBulkPicker(uid:string,personCode:string,replyToken:string,token:string,u:string,k:string,page=0,prefix=""){
 const members=await listMembers(uid,u,k);
 let subject:any=null;
 try{
  const roster=await rpcOne(u,k,"phms_list_line_family_roster",{p_line_user_id:uid});
  subject=(Array.isArray(roster?.entries)?roster.entries:[]).find((x:any)=>x?.entry_type==="person"&&String(x?.person_code)===String(personCode));
 }catch{}
 const st=await getFamilyFlowState(uid,u,k);
 const selected=new Set<string>(st?.state_key==="caregiver_multi"&&String(st?.state_data?.person_code||"")===personCode?(st?.state_data?.selected||[]):[]);
 const rows=members.filter((m:any)=>m?.selection_code&&!(subject?.account_display_name&&String(subject.account_display_name)===String(m?.display_name||"")));
 const pageSize=7,total=Math.max(1,Math.ceil(rows.length/pageSize)),pg=Math.max(0,Math.min(Number(page)||0,total-1));
 const items:any[]=[];
 for(const m of rows.slice(pg*pageSize,pg*pageSize+pageSize)){
  const mc=String(m.selection_code),on=selected.has(mc);
  items.push(qpb((on?"☑️ ":"⬜ ")+String(m.display_name||"สมาชิก").slice(0,16),"สลับเลือกผู้ช่วย "+personCode+" "+mc+" "+pg))
 }
 if(pg>0)items.push(qpb("⬅️ ก่อนหน้า","เลือกผู้ช่วยหลายคน "+personCode+" "+(pg-1)));
 if(pg<total-1)items.push(qpb("➡️ ถัดไป","เลือกผู้ช่วยหลายคน "+personCode+" "+(pg+1)));
 if(selected.size)items.push(qpb("✅ เพิ่ม "+selected.size+" คน","ยืนยันผู้ช่วยหลายคน "+personCode));
 items.push(qpb("↩️ กลับ","เลือกผู้ดูแลให้บุคคล "+personCode));
 await replyLine(replyToken,(prefix?prefix+"\n\n":"")+"☑️ เลือกผู้ช่วยดูแลหลายคน\n\nเลือกได้หลายบัญชี รวมเจ้าบ้าน\nเลือกแล้ว "+selected.size+" คน"+(total>1?" • หน้า "+(pg+1)+"/"+total:""),token,items.slice(0,13))
}
async function showSelfCaregiverRequestPicker(uid:string,memberCode:string,replyToken:string,token:string,u:string,k:string,page=0){
 const members=(await listMembers(uid,u,k)).filter((m:any)=>m?.selection_code&&!m?.is_self);
 const st=await getFamilyFlowState(uid,u,k);
 const selected=new Set<string>(st?.state_key==="self_caregiver_request_multi"&&String(st?.state_data?.member_code||"")===memberCode?(st?.state_data?.selected||[]):[]);
 const pageSize=7,total=Math.max(1,Math.ceil(members.length/pageSize)),pg=Math.max(0,Math.min(Number(page)||0,total-1));
 const items:any[]=[];
 for(const m of members.slice(pg*pageSize,pg*pageSize+pageSize)){
  const mc=String(m.selection_code),on=selected.has(mc);
  items.push(qpb((on?"☑️ ":"⬜ ")+String(m.display_name||"สมาชิก").slice(0,16),"สลับคำขอคนช่วย "+memberCode+" "+mc+" "+pg))
 }
 if(pg>0)items.push(qpb("⬅️ ก่อนหน้า","ขอผู้ช่วยดูแลตัวเอง "+memberCode+" "+(pg-1)));
 if(pg<total-1)items.push(qpb("➡️ ถัดไป","ขอผู้ช่วยดูแลตัวเอง "+memberCode+" "+(pg+1)));
 if(selected.size)items.push(qpb("📤 ส่งคำขอ "+selected.size+" คน","ส่งคำขอคนช่วย "+memberCode));
 items.push(qpb("↩️ กลับ","สิทธิ์ตัวเองสมาชิก "+memberCode));
 await replyLine(replyToken,"📥 ขอเพิ่มผู้ช่วยดูแลของฉัน\n\nเลือกได้ 1 คนหรือหลายคน แล้วส่งคำขอครั้งเดียว\nรายชื่อรวมเจ้าบ้านด้วยถ้าเจ้าของไม่ใช่คุณ\nคำขอจะส่งไปยังผู้ดูแลปัจจุบันเพื่ออนุมัติ หากไม่มีผู้ดูแลจึงใช้เจ้าบ้าน/ผู้ช่วยดูแลครอบครัวเป็นทางสำรอง\nเลือกแล้ว "+selected.size+" คน",token,items.slice(0,13))
}

function financeReviewNumber(v:any){
 const th:any={"๐":"0","๑":"1","๒":"2","๓":"3","๔":"4","๕":"5","๖":"6","๗":"7","๘":"8","๙":"9"};
 const x=String(v??"").replace(/[๐-๙]/g,c=>th[c]||c).replace(/,/g,"").replace(/บาท/gi,"").replace(/THB/gi,"").replace(/฿/g,"").trim();
 if(!x||x==="-")return null;
 const n=Number(x);if(!Number.isFinite(n)||n<0)throw new Error("finance_amount_invalid");
 return Math.round(n*100)/100
}
function financeReviewYesNo(v:any){
 const x=String(v??"").trim().toLowerCase();
 if(["ใช่","yes","y","true","1","เปิด","ให้","รับ"].includes(x))return true;
 if(["ไม่","ไม่ใช่","no","n","false","0","ปิด","ไม่ให้","ไม่รับ"].includes(x))return false;
 throw new Error("invalid_yes_no")
}
function financeReviewCategory(v:any){
 const x=String(v||"").toLowerCase();
 if(/ยา|medication|pharmacy/.test(x))return "medication";
 if(/เลือด|แล็บ|แลบ|lab|ปัสสาวะ|ห้องปฏิบัติการ/.test(x))return "lab";
 if(/x[- ]?ray|เอกซ|เอ็กซ|อัลตรา|ultra|ct\b|mri|รังสี|scan/.test(x))return "imaging";
 if(/หัตถการ|ผ่าตัด|ทำแผล|ฉีด|procedure|scope|ส่องกล้อง/.test(x))return "procedure";
 if(/เวชภัณฑ์|อุปกรณ์|medical supply/.test(x))return "medical_supply";
 if(/ห้อง|เตียง|room|บริการผู้ป่วย/.test(x))return "room";
 if(/ลงทะเบียน|ค่าธรรมเนียม|registration/.test(x))return "registration";
 if(/เดินทาง|รถ|แท็กซี่|taxi|จอดรถ/.test(x))return "transport";
 if(/แพทย์|หมอ|ค่าตรวจ|consult/.test(x))return "consultation";
 return "other"
}
function financeReviewDefaultCgd(v:any){
 return ({room:"01",medication:"03",medical_supply:"05",lab:"07",imaging:"08",procedure:"11",registration:"16"} as any)[String(v||"")]||""
}
function financeReviewCgdCode(v:any){
 const d=String(v??"").replace(/[^0-9]/g,"");if(!d)return "";
 const n=Number(d);return n>=1&&n<=16?String(n).padStart(2,"0"):""
}
function financeReviewItem(lineRaw:string){
 const cleaned=String(lineRaw||"").replace(/^[-•*]\s*/,"").replace(/^\d+[.)]\s*/,"").trim();
 if(!cleaned||cleaned==="-")return null;
 const parts=cleaned.split("|").map(x=>x.trim()).filter(Boolean),main=String(parts.shift()||"");
 const m=main.match(/^(.*?)(?:\s+|[:=])(?:฿\s*|THB\s*)?([0-9๐-๙][0-9๐-๙,]*(?:\.[0-9๐-๙]{1,2})?)\s*(?:บาท|฿|THB)?$/i);
 if(!m)return null;
 const label=String(m[1]||"").trim();if(!label)return null;
 const category=financeReviewCategory(label);
 const item:any={label,amount:financeReviewNumber(m[2]),category,cgd_category_code:financeReviewDefaultCgd(category)||undefined};
 for(const p of parts){
  const kv=p.match(/^([^:：=]+?)\s*[:：=]\s*(.*)$/);if(!kv)continue;
  const key=String(kv[1]||"").trim().toLowerCase().replace(/\s+/g,""),value=String(kv[2]||"").trim();
  if(!value||value==="-")continue;
  if(["cgd","หมวดcgd","หมวดกรมบัญชีกลาง","กรมบัญชีกลาง","หมวดมาตรฐาน","หมวดค่ารักษามาตรฐาน"].includes(key))item.cgd_category_code=financeReviewCgdCode(value)||item.cgd_category_code;
  else if(["รหัสcgd","รหัสกรมบัญชีกลาง","cgdcode","cgditem","รหัสมาตรฐาน","รหัสรายการมาตรฐาน"].includes(key))item.cgd_item_code=value;
  else if(["ชื่อcgd","ชื่อรายการcgd","cgdname","ชื่อรายการมาตรฐาน"].includes(key))item.cgd_item_name=value;
  else if(["รหัสรพ","รหัสโรงพยาบาล","hospitalcode"].includes(key))item.hospital_item_code=value;
  else if(["อัตราcgd","อัตรากรมบัญชีกลาง","cgdrate","อัตรามาตรฐาน","อัตราอ้างอิง"].includes(key)){const r=financeReviewNumber(value);if(r!==null)item.cgd_reference_rate=r}
  else if(["วันที่อัตรา","วันที่มีผล","cgddate"].includes(key))item.cgd_rate_effective_date=value;
  else if(["อ้างอิงcgd","เอกสารcgd","cgdref"].includes(key))item.cgd_source_ref=value
 }
 item.cgd_match_status=item.cgd_item_code?"item_code_provided":item.cgd_category_code?"category_only":"unmapped";
 return item
}
function financeReviewParse(text:string,defaultCoverage=""){
 const top:any={},items:any[]=[];let detail=false;
 const topKeys=new Set([
  "ยอดที่จ่ายจริง","ยอดที่จ่าย","ยอดชำระ","จ่ายจริง",
  "ใช้สิทธิ","สิทธิรักษา","สิทธิ",
  "ยอดที่สิทธิ/ประกันออกให้","ยอดสิทธิออกให้","ประกันออกให้",
  "ช่องทางชำระ","วิธีชำระ","ผู้จ่าย","คนจ่าย","หมายเหตุ"
 ]);
 const pushItem=(raw:string)=>{
  const it=financeReviewItem(raw);
  if(it)items.push(it);
  return !!it
 };
 for(const raw of String(text||"").replace(/\r/g,"").split("\n")){
  const original=String(raw||"");
  const line=original.trim();if(!line)continue;
  const kv=line.match(/^([^:：=]+?)\s*[:：=]\s*(.*)$/);
  if(kv){
   const key=String(kv[1]||"").trim(),value=String(kv[2]||"").trim();
   if(/^รายละเอียด(?:ค่าใช้จ่าย)?$/.test(key)){
    detail=true;
    if(value&&value!=="-"){
     const chunks=value.split(/\s*;\s*|\s+•\s+/).filter(Boolean);
     for(const part of chunks)pushItem(part)
    }
    continue
   }
   if(topKeys.has(key)){
    detail=false;top[key]=value;continue
   }
   // รองรับรูปแบบธรรมชาติแบบ "ค่ายา: 320", "ค่าตรวจเลือด = 450"
   if(value&&value!=="-"&&pushItem(key+" "+value)){continue}
   detail=false;top[key]=value;continue
  }
  if(line==="-")continue;
  if(detail){
   pushItem(line);continue
  }
  // นอก section รายละเอียด ให้รับเฉพาะบรรทัดที่ตั้งใจทำเป็น list ชัดเจน
  if(/^[-•*]\s+/.test(original.trim())||/^\d+[.)]\s+/.test(original.trim()))pushItem(line)
 }
 const paid=financeReviewNumber(top["ยอดที่จ่ายจริง"]??top["ยอดที่จ่าย"]??top["ยอดชำระ"]??top["จ่ายจริง"]);
 if(paid===null)throw new Error("paid_amount_required");
 let coverageUsed=String(defaultCoverage||"").trim()!=="";
 if(String(top["ใช้สิทธิ"]??"").trim()!=="")coverageUsed=financeReviewYesNo(top["ใช้สิทธิ"]);
 const coverage=String(top["สิทธิรักษา"]??top["สิทธิ"]??defaultCoverage??"").trim();
 if(coverageUsed&&!coverage)throw new Error("coverage_type_required");
 const covered=financeReviewNumber(top["ยอดที่สิทธิ/ประกันออกให้"]??top["ยอดสิทธิออกให้"]??top["ประกันออกให้"]);
 const total=Math.round(items.reduce((a:number,x:any)=>a+Number(x?.amount||0),0)*100)/100;
 return {
  paid_amount:paid,coverage_used:coverageUsed,coverage_type:coverage||null,covered_amount:covered,
  notes:String(top["หมายเหตุ"]??"").trim()==="-"?"":String(top["หมายเหตุ"]??"").trim(),
  items,breakdown_total:total,breakdown_difference:Math.round((paid-total)*100)/100
 }
}
function financeReviewHasBreakdownIntent(text:string){
 const raw=String(text||"").replace(/\r/g,"");
 const lines=raw.split("\n").map(x=>x.trim()).filter(Boolean);
 let inDetail=false;
 for(const line of lines){
  const dm=line.match(/^รายละเอียด(?:ค่าใช้จ่าย)?\s*[:：=]\s*(.*)$/);
  if(dm){
   inDetail=true;
   const v=String(dm[1]||"").trim();
   if(v&&v!=="-")return true;
   continue
  }
  if(inDetail){
   if(/^[-•*]\s+/.test(line)||/^\d+[.)]\s+/.test(line)){
    if(/[0-9๐-๙]/.test(line))return true
   }
   const kv=line.match(/^([^:：=]+?)\s*[:：=]\s*(.*)$/);
   if(kv&&!/^(ยอดที่จ่ายจริง|ยอดที่จ่าย|ยอดชำระ|จ่ายจริง|ใช้สิทธิ|สิทธิรักษา|สิทธิ|ยอดที่สิทธิ\/ประกันออกให้|ยอดสิทธิออกให้|ประกันออกให้|ช่องทางชำระ|วิธีชำระ|ผู้จ่าย|คนจ่าย|หมายเหตุ)$/.test(String(kv[1]||"").trim())&&/[0-9๐-๙]/.test(String(kv[2]||"")))return true
  }
  const kv=line.match(/^([^:：=]+?)\s*[:：=]\s*(.*)$/);
  if(kv){
   const key=String(kv[1]||"").trim(),v=String(kv[2]||"").trim();
   if(/(ค่า|ยา|แพทย์|หมอ|ตรวจ|แล็บ|แลบ|x.?ray|เอกซ|อัลตรา|ct|mri|หัตถการ|เวชภัณฑ์|ห้อง|เตียง|เดินทาง|ค่าธรรมเนียม)/i.test(key)&&/[0-9๐-๙]/.test(v))return true
  }
 }
 return false
}
function financeReviewMoney(v:any){
 const n=Number(v||0);return "฿"+n.toLocaleString("th-TH",{minimumFractionDigits:n%1?2:0,maximumFractionDigits:2})
}
function financeReviewMethod(v:any){
 return ({promptpay_qr:"สแกนจ่าย / QR",cash:"เงินสด",credit_card:"บัตรเครดิต",debit_card:"บัตรเดบิต",bank_transfer:"โอนเงิน / Mobile Banking",e_wallet:"E-Wallet",other:"อื่น ๆ"} as any)[String(v||"")]||String(v||"—")
}

function financeSavedCategoryLabel(v:any){
 return ({consultation:"ค่าตรวจ/แพทย์",medication:"ค่ายา",lab:"ค่าตรวจแล็บ",imaging:"ค่ารังสี/ภาพวินิจฉัย",procedure:"ค่าหัตถการ",medical_supply:"ค่าเวชภัณฑ์",room:"ค่าห้อง/บริการ",registration:"ค่าธรรมเนียม",transport:"ค่าเดินทาง",other:"อื่น ๆ"} as any)[String(v||"other")]||String(v||"อื่น ๆ")
}
function financeSavedDate(v:any){
 if(!v)return "—";
 try{return new Intl.DateTimeFormat("th-TH",{timeZone:"Asia/Bangkok",day:"numeric",month:"short",year:"numeric"}).format(new Date(v))}catch{return String(v)}
}
async function showSavedFinanceCards(replyToken:string,token:string,uid:string,u:string,k:string,recordCode:string,prefix=""){
 const out=await rpcOne(u,k,"phms_line_appointment_finance",{p_line_user_id:uid,p_record_code:recordCode});
 const e=out?.expense||null;
 if(!e)return false;
 const items=Array.isArray(out?.items)?out.items:[];
 const docs=Array.isArray(out?.payment_documents)?out.payment_documents:[];
 const code=String(out?.record_code||recordCode);
 const total=Math.round(items.reduce((sum:number,x:any)=>sum+Number(x?.amount||0),0)*100)/100;
 const diff=Math.round((Number(e?.paid_amount||0)-total)*100)/100;
 const summaryBody:any[]=[
  ...(prefix?[{type:"text",text:prefix,size:"sm",weight:"bold",color:"#285943",wrap:true},{type:"separator",margin:"md"}]:[]),
  {type:"text",text:"👤 "+String(out?.person_name||"ผู้ใช้"),size:"sm",weight:"bold",wrap:true},
  {type:"text",text:"📆 "+financeSavedDate(out?.appointment_at)+" • "+String(out?.appointment_title||"นัดหมาย"),size:"sm",wrap:true},
  ...(out?.hospital_name?[{type:"text",text:"🏥 "+String(out.hospital_name),size:"sm",wrap:true}]:[]),
  {type:"separator",margin:"md"},
  {type:"text",text:"💵 จ่ายจริง: "+financeReviewMoney(e?.paid_amount),size:"lg",weight:"bold",wrap:true},
  {type:"text",text:"🪪 "+(e?.coverage_used?"ใช้สิทธิ"+(e?.coverage_type?" • "+String(e.coverage_type):""):"จ่ายเอง"),size:"sm",wrap:true},
  ...(e?.covered_amount!==undefined&&e?.covered_amount!==null?[{type:"text",text:"🏥 สิทธิ/ประกันออกให้: "+financeReviewMoney(e.covered_amount),size:"sm",wrap:true}]:[]),
  ...(Number(e?.paid_amount||0)>0?[
    {type:"text",text:"💳 "+financeReviewMethod(e?.payment_method_code||e?.payment_method),size:"sm",wrap:true},
    {type:"text",text:"👤 ผู้จ่าย: "+String(e?.payer||"—"),size:"sm",wrap:true}
  ]:[]),
  {type:"separator",margin:"md"},
  {type:"text",text:"🧾 รายการค่าใช้จ่าย: "+String(items.length)+" รายการ",size:"sm",weight:"bold",wrap:true},
  ...(items.length?[
    {type:"text",text:"Σ รวมรายการย่อย: "+financeReviewMoney(total),size:"sm",weight:"bold",wrap:true},
    {type:"text",text:Math.abs(diff)<0.01?"✅ รวมรายการย่อยตรงกับยอดจ่ายจริง":"⚠️ รายการย่อยต่างจากยอดจ่ายจริง "+financeReviewMoney(Math.abs(diff)),size:"xs",weight:"bold",color:Math.abs(diff)<0.01?"#285943":"#9A6700",wrap:true}
  ]:[{type:"text",text:"ยังไม่ได้แจกแจงรายการย่อย",size:"xs",color:"#777777",wrap:true}]),
  ...(e?.notes?[{type:"text",text:"📝 "+String(e.notes),size:"sm",wrap:true}]:[]),
  {type:"text",text:"📎 หลักฐานการชำระ "+String(docs.length)+" รายการ",size:"xs",color:"#667085",wrap:true}
 ];
 const summaryFooter:any[]=[
  ...(docs.length?[{type:"button",style:"secondary",action:{type:"postback",label:("📎 ดูหลักฐาน ("+String(docs.length)+")").slice(0,20),data:"หลักฐานค่าใช้จ่าย "+code+" 0"}}]:[]),
  ...(out?.can_update===true?[
   {type:"button",style:"primary",action:{type:"postback",label:"✏️ แก้ค่ารักษา",data:"แก้ค่าใช้จ่ายนัด "+code}},
   {type:"button",style:docs.length?"secondary":"primary",action:{type:"postback",label:docs.length?"➕ แนบหลักฐานเพิ่ม":"➕ แนบหลักฐาน",data:"แนบหลักฐานค่าใช้จ่าย "+code}}
  ]:[]),
  {type:"button",style:"secondary",action:{type:"postback",label:"📎 เอกสารของนัด",data:"เอกสารนัด "+code}},
  {type:"button",action:{type:"postback",label:"↩️ รายละเอียดนัด",data:"ดูนัด "+code}}
 ];
 const cards:any[]=[{type:"bubble",size:"kilo",
  header:{type:"box",layout:"vertical",backgroundColor:"#FFF7E8",paddingAll:"18px",contents:[
   {type:"text",text:"💰 รายละเอียดค่ารักษา",weight:"bold",size:"xl",color:"#805B18"},
   {type:"text",text:"สรุปยอดและรายการที่บันทึกไว้",size:"xs",color:"#7A6A4F",margin:"sm",wrap:true}
  ]},
  body:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"16px",contents:summaryBody},
  footer:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"12px",contents:summaryFooter}
 }];
 for(let i=0;i<Math.min(items.length,9);i++){
  const x=items[i]||{};
  const itemBody:any[]=[
   {type:"text",text:financeReviewMoney(x?.amount),size:"xl",weight:"bold",color:"#805B18",wrap:true},
   {type:"text",text:"หมวด: "+financeSavedCategoryLabel(x?.category),size:"sm",wrap:true},
   ...(x?.cgd_category_code?[{type:"text",text:"🏛️ หมวดมาตรฐาน "+String(x.cgd_category_code)+(x?.cgd_category_name?" • "+String(x.cgd_category_name):""),size:"sm",wrap:true}]:[]),
   ...(x?.cgd_item_code?[{type:"text",text:"รหัสรายการมาตรฐาน: "+String(x.cgd_item_code),size:"xs",wrap:true,color:"#555555"}]:[]),
   ...(x?.cgd_item_name?[{type:"text",text:String(x.cgd_item_name),size:"xs",wrap:true,color:"#555555"}]:[]),
   ...(x?.hospital_item_code?[{type:"text",text:"รหัส รพ.: "+String(x.hospital_item_code),size:"xs",wrap:true,color:"#555555"}]:[]),
   ...(x?.cgd_reference_rate!==undefined&&x?.cgd_reference_rate!==null?[{type:"text",text:"อัตราอ้างอิง: "+financeReviewMoney(x.cgd_reference_rate),size:"xs",wrap:true,color:"#555555"}]:[]),
   ...(x?.note?[{type:"text",text:"📝 "+String(x.note),size:"xs",wrap:true,color:"#555555"}]:[])
  ];
  cards.push({type:"bubble",size:"kilo",
   header:{type:"box",layout:"vertical",backgroundColor:"#FAFAFA",paddingAll:"16px",contents:[
    {type:"text",text:"🧾 รายการ "+String(i+1)+" / "+String(items.length),size:"xs",color:"#667085"},
    {type:"text",text:String(x?.label||financeSavedCategoryLabel(x?.category)),weight:"bold",size:"lg",wrap:true,margin:"sm"}
   ]},
   body:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"16px",contents:itemBody},
   footer:{type:"box",layout:"vertical",paddingAll:"12px",contents:[
    {type:"button",action:{type:"postback",label:"💰 กลับสรุปค่ารักษา",data:"ค่าใช้จ่ายนัด "+code}}
   ]}
  })
 }
 if(items.length>9){
  cards.push({type:"bubble",size:"kilo",
   body:{type:"box",layout:"vertical",paddingAll:"18px",contents:[
    {type:"text",text:"ยังมีอีก "+String(items.length-9)+" รายการ",weight:"bold",size:"md",wrap:true},
    {type:"text",text:"จำนวนรายการมากกว่าที่ LINE carousel แสดงได้ในครั้งเดียว ข้อมูลยังถูกบันทึกครบในระบบ",size:"sm",color:"#667085",wrap:true,margin:"md"}
   ]},
   footer:{type:"box",layout:"vertical",paddingAll:"12px",contents:[
    {type:"button",action:{type:"postback",label:"🔄 โหลดสรุปอีกครั้ง",data:"ค่าใช้จ่ายนัด "+code}}
   ]}
  })
 }
 await replyMessages(replyToken,token,[{type:"flex",altText:"💰 รายละเอียดค่ารักษา "+financeReviewMoney(e?.paid_amount),contents:{type:"carousel",contents:cards.slice(0,12)}}]);
 return true
}


function appointmentNotifyChoiceText(kind:string){
 return (kind==="created"?"✅ สร้างนัดเรียบร้อยแล้ว":"✅ บันทึกการแก้ไขนัดแล้ว")+
  "\n\n🔔 ต้องการส่งแจ้งเตือนตอนนี้ไหม?\n"+
  "อิ่มอุ่นจะส่งตาม “ตั้งค่าแจ้งเตือน” ของนัดนี้: ผู้รับที่เลือก/ผู้มีสิทธิ์รับแจ้งเตือน และ LINE กลุ่มที่เลือกไว้\n\n"+
  "ถ้าเป็นการแก้เล็กน้อย กด “ไม่ต้องแจ้ง” ได้ • การเตือนตามวันที่/เวลาที่ตั้งไว้ยังทำงานตามปกติ";
}
async function pushAppointmentNotifyChoice(uid:string,token:string,recordCode:string,kind:string){
 await pushLine(uid,appointmentNotifyChoiceText(kind),token,[
  qpb("🔔 แจ้งตอนนี้","แจ้งอัปเดตนัด "+recordCode+" "+kind),
  qpb("⚙️ ตั้งค่าเตือน","ตั้งค่าแจ้งเตือนนัด "+recordCode),
  qpb("🔕 ไม่ต้องแจ้ง","ไม่แจ้งอัปเดตนัด "+recordCode),
  qpb("📅 ดูนัด","ดูนัด "+recordCode)
 ])
}

function appointmentNotifyDaysLabel(v:any){
 const a=Array.isArray(v)?v.map((x:any)=>Number(x)).filter((x:number)=>Number.isFinite(x)):[3];
 return (a.length?a:[3]).map((d:number)=>d===0?'วันนัด':String(d)+' วันก่อน').join(' • ')
}
function appointmentNotifySelectedNames(rows:any[],fallback='—'){
 const x=(Array.isArray(rows)?rows:[]).filter((r:any)=>r?.selected===true).map((r:any)=>String(r?.display_name||r?.channel_name||'')).filter(Boolean);
 return x.length?x.join(', '):fallback
}
async function showAppointmentNotificationSettings(uid:string,replyToken:string,token:string,u:string,k:string,recordCode:string,prefix=''){
 const w=await rpcOne(u,k,'phms_line_appointment_notification_workspace',{p_line_user_id:uid,p_record_code:recordCode});
 const code=String(w?.record_code||recordCode),s=w?.settings||{},users=Array.isArray(w?.users)?w.users:[],groups=Array.isArray(w?.groups)?w.groups:[];
 const mode=String(s?.recipient_mode||'default');
 const selectedUsers=appointmentNotifySelectedNames(users,mode==='default'?'ผู้รับที่เปิดรับแจ้งเตือนนัดของบุคคลนี้':'ยังไม่ได้เลือกคน');
 const selectedGroups=appointmentNotifySelectedNames(groups,'ไม่ได้เลือก LINE กลุ่ม');
 const text=(prefix?prefix+'\n\n':'')+
  '🔔 ตั้งค่าการแจ้งเตือนนัด\n\n'+
  '📌 '+String(w?.title||'นัดหมาย')+'\n'+
  '🗓️ ส่ง: '+appointmentNotifyDaysLabel(s?.days_before)+'\n'+
  '🕘 เวลา: '+String(s?.time||'09:00')+' น. (Asia/Bangkok)\n'+
  '👤 ผู้รับ: '+(mode==='custom'?'กำหนดเอง':'มาตรฐาน')+'\n'+
  '   '+selectedUsers+'\n'+
  '👥 กลุ่ม: '+selectedGroups+'\n\n'+
  'ค่าเริ่มต้นของระบบคือ “3 วันก่อนหน้า เวลา 09:00” โดยยึดวันปฏิทิน ไม่ได้นับย้อนหลัง 72 ชั่วโมง';
 const qr:any[]=[
  qpb('👤👥 เลือกผู้รับ','ผู้รับแจ้งเตือนนัด '+code),
  qpb('🗓️ 3 วัน • 09:00','ตั้งเตือนมาตรฐาน '+code),
  qpb('⚙️ กำหนดวัน/เวลา','วิธีตั้งเวลาแจ้งเตือน '+code),
  qpb('🧩 เทมเพลต','เทมเพลตแจ้งเตือนนัด '+code),
  qpb('🔔 ส่งตอนนี้','ส่งแจ้งเตือนนัดตอนนี้ '+code),
  qpb('↩️ รายละเอียดนัด','ดูนัด '+code)
 ];
 await replyLine(replyToken,text,token,qr)
}
async function showAppointmentNotificationTargets(uid:string,replyToken:string,token:string,u:string,k:string,recordCode:string,prefix=''){
 const w=await rpcOne(u,k,'phms_line_appointment_notification_workspace',{p_line_user_id:uid,p_record_code:recordCode});
 const code=String(w?.record_code||recordCode),s=w?.settings||{},users=Array.isArray(w?.users)?w.users:[],groups=Array.isArray(w?.groups)?w.groups:[];
 const mode=String(s?.recipient_mode||'default');
 const userLines=users.slice(0,10).map((x:any)=>String(x?.selected?'✅ ':'⬜ ')+String(x?.display_name||'สมาชิก')).join('\n')||'— ไม่มีผู้รับที่มีสิทธิ์';
 const groupLines=groups.slice(0,10).map((x:any)=>String(x?.selected?'✅ ':'⬜ ')+String(x?.channel_name||'LINE กลุ่ม')).join('\n')||'— ยังไม่มีกลุ่มที่เชื่อมกับบ้านนี้';
 const qr:any[]=[];
 qr.push(qpb(mode==='default'?'✅ ผู้รับมาตรฐาน':'○ ผู้รับมาตรฐาน','โหมดผู้รับแจ้งเตือน '+code+' default'));
 qr.push(qpb(mode==='custom'?'✅ กำหนดเอง':'○ กำหนดเอง','โหมดผู้รับแจ้งเตือน '+code+' custom'));
 const self=users.find((x:any)=>x?.is_self===true);
 if(self)qr.push(qpb(self?.selected?'✅ เตือนฉันแล้ว':'👤 เตือนฉัน','เลือกผู้รับแจ้งเตือน '+code+' '+String(self?.user_code||'')));
 for(const x of users.filter((x:any)=>!x?.is_self).slice(0,4)){
  qr.push(qpb((x?.selected?'✅ ':'⬜ ')+String(x?.display_name||'สมาชิก'),'สลับผู้รับแจ้งเตือน '+code+' '+String(x?.user_code||'')))
 }
 for(const x of groups.slice(0,4)){
  qr.push(qpb((x?.selected?'✅ ':'⬜ ')+String(x?.channel_name||'LINE กลุ่ม'),'สลับกลุ่มแจ้งเตือน '+code+' '+String(x?.channel_code||'')))
 }
 qr.push(qpb('↩️ ตั้งค่าการเตือน','ตั้งค่าแจ้งเตือนนัด '+code));
 await replyLine(replyToken,(prefix?prefix+'\n\n':'')+
  '👤👥 ผู้รับแจ้งเตือน\n\n'+
  'โหมด: '+(mode==='custom'?'กำหนดเอง':'ผู้รับมาตรฐาน')+
  '\n\n👤 สมาชิก\n'+userLines+
  '\n\n👥 LINE กลุ่มของบ้านนี้\n'+groupLines+
  '\n\nกลุ่มที่ไม่ผูกกับครอบครัวของนัดนี้จะไม่แสดงในรายการ',
  token,qr.slice(0,13))
}
async function showAppointmentNotificationTemplates(uid:string,replyToken:string,token:string,u:string,k:string,recordCode:string,prefix=''){
 const w=await rpcOne(u,k,'phms_line_appointment_notification_workspace',{p_line_user_id:uid,p_record_code:recordCode});
 const code=String(w?.record_code||recordCode),rows=Array.isArray(w?.templates)?w.templates:[];
 const lines=rows.length?rows.slice(0,10).map((x:any,i:number)=>
  String(i+1)+'. '+String(x?.template_name||'เทมเพลต')+' • '+appointmentNotifyDaysLabel(x?.days_before)+' • '+String(x?.time||'09:00')
 ).join('\n'):'ยังไม่มีเทมเพลตของครอบครัวนี้';
 const qr:any[]=rows.slice(0,8).map((x:any)=>qpb(('🧩 '+String(x?.template_name||'เทมเพลต')).slice(0,20),'ใช้เทมเพลตแจ้งเตือน '+code+' '+String(x?.template_code||'')));
 qr.push(qpb('💾 วิธีบันทึกเทมเพลต','วิธีบันทึกเทมเพลตแจ้งเตือน '+code));
 qr.push(qpb('↩️ ตั้งค่าการเตือน','ตั้งค่าแจ้งเตือนนัด '+code));
 await replyLine(replyToken,(prefix?prefix+'\n\n':'')+'🧩 เทมเพลตแจ้งเตือน\n\n'+lines,token,qr.slice(0,13))
}
async function routeAppointmentNotificationSettings(cmd:string,uid:string,replyToken:string,token:string,u:string,k:string){
 let m=cmd.match(/^(?:ตั้งค่าแจ้งเตือนนัด|แจ้งเตือนนัด)\s+#?([0-9a-fA-F-]{8,36})$/);
 if(m){await showAppointmentNotificationSettings(uid,replyToken,token,u,k,m[1]);return true}

 m=cmd.match(/^ตั้งเตือนมาตรฐาน\s+#?([0-9a-fA-F-]{8,36})$/);
 if(m){
  await rpcOne(u,k,'phms_line_appointment_set_notification_schedule',{p_line_user_id:uid,p_record_code:m[1],p_days_before:[3],p_time_local:'09:00',p_recipient_mode:null});
  await showAppointmentNotificationSettings(uid,replyToken,token,u,k,m[1],'✅ ตั้งเป็น 3 วันก่อนหน้า เวลา 09:00 แล้ว');
  return true
 }

 m=cmd.match(/^วิธีตั้งเวลาแจ้งเตือน\s+#?([0-9a-fA-F-]{8,36})$/);
 if(m){
  await replyLine(replyToken,
   '⚙️ ตั้งวัน/เวลาเอง\n\nพิมพ์ได้แบบนี้:\nตั้งเตือนนัด '+m[1]+' ก่อน 3 วัน เวลา 09:00\n\nหลายครั้งก็ได้ เช่น:\nตั้งเตือนนัด '+m[1]+' ก่อน 7,3,1 วัน เวลา 09:00\n\n“3 วันก่อน” หมายถึงวันที่ก่อนวันนัด 3 วัน ณ เวลา 09:00 ตามเวลาไทย ไม่ใช่ลบ 72 ชั่วโมงจากเวลานัด',
   token,[qpb('↩️ กลับ','ตั้งค่าแจ้งเตือนนัด '+m[1])]);
  return true
 }

 m=cmd.match(/^ตั้งเตือนนัด\s+#?([0-9a-fA-F-]{8,36})\s+(?:ก่อน\s+)?([0-9,\s]+)\s*วัน(?:ก่อน)?\s+(?:เวลา\s*)?([0-2]?\d:[0-5]\d)$/);
 if(m){
  const days=Array.from(new Set(String(m[2]).split(/[\s,]+/).map(x=>Number(x)).filter(x=>Number.isInteger(x)&&x>=0&&x<=60)));
  if(!days.length){await replyLine(replyToken,'⚠️ จำนวนวันไม่ถูกต้อง ใช้ได้ตั้งแต่ 0–60 วัน',token);return true}
  await rpcOne(u,k,'phms_line_appointment_set_notification_schedule',{p_line_user_id:uid,p_record_code:m[1],p_days_before:days,p_time_local:m[3],p_recipient_mode:null});
  await showAppointmentNotificationSettings(uid,replyToken,token,u,k,m[1],'✅ อัปเดตวันและเวลาแจ้งเตือนแล้ว');
  return true
 }

 m=cmd.match(/^ผู้รับแจ้งเตือนนัด\s+#?([0-9a-fA-F-]{8,36})$/);
 if(m){await showAppointmentNotificationTargets(uid,replyToken,token,u,k,m[1]);return true}

 m=cmd.match(/^โหมดผู้รับแจ้งเตือน\s+#?([0-9a-fA-F-]{8,36})\s+(default|custom)$/);
 if(m){
  const w=await rpcOne(u,k,'phms_line_appointment_notification_workspace',{p_line_user_id:uid,p_record_code:m[1]});
  await rpcOne(u,k,'phms_line_appointment_set_notification_schedule',{
    p_line_user_id:uid,p_record_code:m[1],
    p_days_before:Array.isArray(w?.settings?.days_before)?w.settings.days_before:[3],
    p_time_local:String(w?.settings?.time||'09:00'),p_recipient_mode:m[2]
  });
  await showAppointmentNotificationTargets(uid,replyToken,token,u,k,m[1],m[2]==='custom'?'✅ เปลี่ยนเป็นกำหนดผู้รับเองแล้ว':'✅ กลับไปใช้ผู้รับมาตรฐานแล้ว');
  return true
 }

 m=cmd.match(/^เลือกผู้รับแจ้งเตือน\s+#?([0-9a-fA-F-]{8,36})\s+([a-f0-9-]{8,36})$/i);
 if(m){
  await rpcOne(u,k,'phms_line_appointment_set_notification_user_target',{p_line_user_id:uid,p_record_code:m[1],p_user_code:m[2],p_enabled:true});
  await showAppointmentNotificationTargets(uid,replyToken,token,u,k,m[1],'✅ เปิดแจ้งเตือนให้คุณแล้ว');
  return true
 }

 m=cmd.match(/^สลับผู้รับแจ้งเตือน\s+#?([0-9a-fA-F-]{8,36})\s+([a-f0-9-]{8,36})$/i);
 if(m){
  const w=await rpcOne(u,k,'phms_line_appointment_notification_workspace',{p_line_user_id:uid,p_record_code:m[1]});
  const x=(Array.isArray(w?.users)?w.users:[]).find((z:any)=>String(z?.user_code||'').toLowerCase()===String(m[2]).toLowerCase());
  if(!x){await replyLine(replyToken,'⚠️ ไม่พบผู้รับรายนี้ในนัด',token);return true}
  await rpcOne(u,k,'phms_line_appointment_set_notification_user_target',{p_line_user_id:uid,p_record_code:m[1],p_user_code:m[2],p_enabled:!(x?.selected===true)});
  await showAppointmentNotificationTargets(uid,replyToken,token,u,k,m[1]);
  return true
 }

 m=cmd.match(/^สลับกลุ่มแจ้งเตือน\s+#?([0-9a-fA-F-]{8,36})\s+([a-f0-9-]{8,36})$/i);
 if(m){
  const w=await rpcOne(u,k,'phms_line_appointment_notification_workspace',{p_line_user_id:uid,p_record_code:m[1]});
  const x=(Array.isArray(w?.groups)?w.groups:[]).find((z:any)=>String(z?.channel_code||'').toLowerCase()===String(m[2]).toLowerCase());
  if(!x){await replyLine(replyToken,'⚠️ ไม่พบกลุ่มนี้ในครอบครัวของนัด',token);return true}
  await rpcOne(u,k,'phms_line_appointment_set_group_channel_target',{p_line_user_id:uid,p_record_code:m[1],p_channel_code:m[2],p_enabled:!(x?.selected===true)});
  await showAppointmentNotificationTargets(uid,replyToken,token,u,k,m[1]);
  return true
 }

 m=cmd.match(/^ส่งแจ้งเตือนนัดตอนนี้\s+#?([0-9a-fA-F-]{8,36})$/);
 if(m){
  const rr=await rpcOne(u,k,'phms_line_appointment_notify_now',{p_line_user_id:uid,p_record_code:m[1]});
  let kicked=false;
  try{
   const secret=Deno.env.get('PHMS_CRON_SECRET')||'';
   if(secret){
    const d=await fetch(u+'/functions/v1/line-notification-dispatch',{method:'POST',headers:{'x-phms-cron-secret':secret,'content-type':'application/json'},body:'{}'});
    kicked=d.ok;
   }
  }catch(err){console.error('appointment_notify_now_dispatch',String(err))}
  await showAppointmentNotificationSettings(uid,replyToken,token,u,k,m[1],
   '🔔 '+(kicked?'ส่งแจ้งเตือนแล้ว':'นำแจ้งเตือนเข้าคิวส่งทันทีแล้ว')+
   '\n👤 ผู้รับ '+String(rr?.user_notifications||0)+' คน • 👥 กลุ่ม '+String(rr?.group_notifications||0)+' กลุ่ม');
  return true
 }

 m=cmd.match(/^เทมเพลตแจ้งเตือนนัด\s+#?([0-9a-fA-F-]{8,36})$/);
 if(m){await showAppointmentNotificationTemplates(uid,replyToken,token,u,k,m[1]);return true}

 m=cmd.match(/^ใช้เทมเพลตแจ้งเตือน\s+#?([0-9a-fA-F-]{8,36})\s+([a-f0-9-]{8,36})$/i);
 if(m){
  const rr=await rpcOne(u,k,'phms_line_apply_appointment_notification_template',{p_line_user_id:uid,p_record_code:m[1],p_template_code:m[2]});
  await showAppointmentNotificationSettings(uid,replyToken,token,u,k,m[1],'✅ ใช้เทมเพลต '+String(rr?.applied_template||'แล้ว'));
  return true
 }

 m=cmd.match(/^วิธีบันทึกเทมเพลตแจ้งเตือน\s+#?([0-9a-fA-F-]{8,36})$/);
 if(m){
  await replyLine(replyToken,'💾 บันทึกค่าปัจจุบันเป็นเทมเพลต\n\nพิมพ์:\nบันทึกเทมเพลตแจ้งเตือน '+m[1]+' ชื่อ บ้านหลัก\n\nอิ่มอุ่นจะจำทั้งวัน/เวลา ผู้รับ และ LINE กลุ่มที่เลือกอยู่',token,[qpb('↩️ กลับ','เทมเพลตแจ้งเตือนนัด '+m[1])]);
  return true
 }

 m=cmd.match(/^บันทึกเทมเพลตแจ้งเตือน\s+#?([0-9a-fA-F-]{8,36})\s+ชื่อ\s+(.{1,80})$/);
 if(m){
  const rr=await rpcOne(u,k,'phms_line_save_appointment_notification_template',{p_line_user_id:uid,p_record_code:m[1],p_template_name:String(m[2]).trim()});
  await showAppointmentNotificationTemplates(uid,replyToken,token,u,k,m[1],'✅ บันทึกเทมเพลต “'+String(rr?.template_name||m[2]).trim()+'” แล้ว');
  return true
 }

 return false
}

async function routeAppointmentManualNotify(cmd:string,uid:string,replyToken:string,token:string,u:string,k:string){
 const send=cmd.match(/^แจ้งอัปเดตนัด\s+#?([0-9a-fA-F-]{8,36})(?:\s+(created|updated))?$/);
 if(send){
  try{
   const rr=await rpcOne(u,k,"phms_line_appointment_manual_notify",{
    p_line_user_id:uid,p_record_code:send[1],p_change_kind:send[2]||"updated"
   });
   const users=Number(rr?.user_notifications||0),groups=Number(rr?.group_notifications||0);
   const text=users||groups
    ?"🔔 ส่งแจ้งเตือนแล้ว\n\n👤 ผู้รับอื่น "+String(users)+" คน"+(groups?"\n👥 LINE กลุ่ม "+String(groups)+" กลุ่ม":"")
    :"ℹ️ ไม่มีผู้รับอื่นที่เปิดรับแจ้งเตือนนัดนี้อยู่ตอนนี้";
   await replyLine(replyToken,text,token,[qpb("📅 ดูรายละเอียดนัด","ดูนัด "+String(rr?.record_code||send[1]))]);
  }catch(err){
   console.error("appointment_manual_notify",String(err));
   await replyLine(replyToken,"⚠️ ยังส่งแจ้งเตือนไม่ได้ ลองอีกครั้งนะ",token,[qpb("📅 กลับนัด","ดูนัด "+send[1])])
  }
  return true
 }
 const skip=cmd.match(/^ไม่แจ้งอัปเดตนัด\s+#?([0-9a-fA-F-]{8,36})$/);
 if(skip){
  await replyLine(replyToken,"🔕 ไม่ส่งแจ้งเตือนเพิ่ม\n\nข้อมูลที่แก้ยังบันทึกเรียบร้อยแล้ว และการเตือนตามเวลานัดเดิมยังทำงานตามปกติ",token,[qpb("📅 ดูรายละเอียดนัด","ดูนัด "+skip[1])]);
  return true
 }
 return false
}
async function captureAppointmentEditMutation(uid:string,cmd:string,u:string,k:string){
 let st:any=null;
 try{st=await getFamilyFlowState(uid,u,k)}catch{return null}
 const key=String(st?.state_key||""),data=st?.state_data||{};
 let code="";
 if(key==="crud_edit_appointment_template"&&String(data?.mode||"")==="record")code=String(data?.record_code||"");
 else if(key==="crud_edit_appointment_record_field")code=String(data?.record_code||"");
 else if(key==="crud_edit_appointment_reason")code=String(data?.record_code||"");
 else if(key==="crud_edit"&&String(data?.resource||"")==="appointment")code=String(data?.record_code||"");
 else return null;
 if(!code)return null;
 if(/^(?:กลับ|ดูนัด|แก้นัด|แก้เทมเพลตนัด|เลือกแก้ช่องนัด|พิมพ์ค่าใหม่ช่องนัด|ยกเลิก)/.test(cmd))return null;
 try{
  const w=await rpcOne(u,k,"phms_line_appointment_workspace",{p_line_user_id:uid,p_record_code:code});
  return {record_code:String(w?.record_code||code),updated_at:String(w?.item?.updated_at||"")}
 }catch{return null}
}
async function appointmentEditMutationSucceeded(uid:string,marker:any,u:string,k:string){
 if(!marker?.record_code)return false;
 try{
  const w=await rpcOne(u,k,"phms_line_appointment_workspace",{p_line_user_id:uid,p_record_code:String(marker.record_code)});
  const after=String(w?.item?.updated_at||"");
  return !!after&&after!==String(marker.updated_at||"")
 }catch{return false}
}
async function routeAppointmentCreateConfirm(cmd:string,uid:string,replyToken:string,token:string,u:string,k:string){
 const m=cmd.match(/^ยืนยันรับเข้า\s+#?([0-9a-fA-F-]{8,36})$/);
 if(!m)return false;
 const st=await getFamilyFlowState(uid,u,k);
 const key=String(st?.state_key||"");
 if(!["crud_review_appointment_draft","crud_edit_appointment_draft","crud_edit_appointment_draft_field","crud_edit_appointment_template"].includes(key))return false;
 try{
  const rr=await rpcOne(u,k,"phms_finalize_line_intake_review",{p_line_user_id:uid,p_source_code:m[1],p_decision:"confirm"});
  await rpcOne(u,k,"phms_clear_line_conversation_state",{p_line_user_id:uid});
  let commit:any=null;
  try{commit=await rpcOne(u,k,"phms_line_try_canonical_commit",{p_line_user_id:uid,p_source_code:m[1]})}
  catch(err){console.error("router_canonical_commit",String(err))}
  const records=Array.isArray(commit?.records)?commit.records:[];
  const appt=records.find((x:any)=>x?.resource_type==="appointment"&&x?.appointment_id);
  if((commit?.canonical_commit===true||commit?.committed===true)&&appt?.appointment_id){
   const code=String(appt.appointment_id).slice(0,12);
   try{
    const lr=await rpcOne(u,k,"phms_line_link_intake_source_to_appointment",{p_line_user_id:uid,p_source_code:m[1],p_record_code:code});
    if(lr?.linked===true)try{await rpcOne(u,k,"phms_line_appointment_mark_slip_attached",{p_line_user_id:uid,p_record_code:code})}catch{}
   }catch(err){console.error("router_appointment_source_link",String(err))}
   let w:any=null;try{w=await rpcOne(u,k,"phms_line_appointment_workspace",{p_line_user_id:uid,p_record_code:code})}catch{}
   const historical=["completed","no_show","cancelled"].includes(String(w?.item?.status||"scheduled"));
   await replyLine(replyToken,
    (historical?"✅ บันทึกประวัตินัดย้อนหลังแล้ว":"✅ สร้างนัดเรียบร้อยแล้ว")+
    "\n\n👤 นัดของ: "+String(rr?.person_name||w?.person_name||"-")+
    "\n📌 นัดเพื่อ: "+String(w?.item?.title||"นัดหมาย")+
    "\n\n"+(historical?"รายการย้อนหลังไม่ส่งแจ้งเตือนอัตโนมัติ":"เลือกได้ว่าจะส่งแจ้งเตือนให้ผู้เกี่ยวข้องตอนนี้หรือไม่"),
    token,
    historical?[
      qpb("📅 ดูรายละเอียดนัด","ดูนัด "+code),
      qpb("🕘 ดูประวัตินัด","ประวัตินัด")
    ]:[
      qpb("🔔 แจ้งตอนนี้","แจ้งอัปเดตนัด "+code+" created"),
      qpb("🔔 ตั้งการเตือน","ตั้งค่าแจ้งเตือนนัด "+code),
      qpb("🔕 ไม่ต้องแจ้ง","ไม่แจ้งอัปเดตนัด "+code),
      qpb("📎 เพิ่มเอกสาร","แนบเอกสารนัด "+code),
      qpb("📅 ดูรายละเอียด","ดูนัด "+code)
    ]
   );
   return true
  }
  await replyLine(replyToken,"✅ ยืนยันข้อมูลรับเข้าแล้ว แต่ยังไม่พบการสร้างนัด canonical สำเร็จ\n\nเปิดนัดหมายเพื่อตรวจรายการอีกครั้ง",token,[qpb("📅 นัดหมาย","นัดหมาย")]);
 }catch(err){
  console.error("router_appointment_create_confirm",String(err));
  await replyLine(replyToken,"⚠️ ยังยืนยันและบันทึกนัดไม่ได้ ลองตรวจข้อมูลแล้วลองใหม่",token,[qpb("📅 นัดหมาย","นัดหมาย")])
 }
 return true
}


function prepTaskStatusLabel(v:any){
 const x=String(v||"pending");
 return x==="completed"?"✅ เสร็จแล้ว":x==="skipped"?"↪️ ข้ามแล้ว":"⬜ ยังไม่เสร็จ"
}
function prepTaskEditTemplate(x:any){
 return [
  "รายการ: "+String(x?.title||""),
  "รายละเอียด: "+String(x?.instruction||""),
  "หมายเหตุ: "+String(x?.note||"")
 ].join("\n")
}
function parsePrepTaskEdit(raw:string){
 const out:any={};
 for(const line of String(raw||"").replace(/\r/g,"").split("\n")){
  const m=line.match(/^([^:：]+)[:：]\s*(.*)$/);
  if(!m)continue;
  const k=String(m[1]||"").trim(),v=String(m[2]||"").trim();
  if(k==="รายการ")out.title=v;
  else if(k==="รายละเอียด")out.instruction=v;
  else if(k==="หมายเหตุ")out.note=v;
 }
 return out
}
async function showAppointmentPreparationTasks(uid:string,replyToken:string,token:string,u:string,k:string,recordCode:string,page=0,prefix=""){
 const w=await rpcOne(u,k,"phms_line_appointment_workspace",{p_line_user_id:uid,p_record_code:recordCode});
 const caps=await rpcOne(u,k,"phms_line_record_capabilities",{p_line_user_id:uid,p_resource:"appointment",p_record_code:recordCode});
 const docs=await rpcOne(u,k,"phms_line_appointment_documents",{p_line_user_id:uid,p_record_code:recordCode});
 let evidence:any={items:[]};try{evidence=await rpcOne(u,k,"phms_line_appointment_task_evidence_list",{p_line_user_id:uid,p_record_code:recordCode})}catch(err){console.error("appointment_task_evidence_list",String(err))}
 const evidenceItems=Array.isArray(evidence?.items)?evidence.items:[];
 const evidenceByTask=new Map<string,any[]>();
 for(const ev of evidenceItems){
  const key=String(ev?.task_code||"");if(!key)continue;
  const arr=evidenceByTask.get(key)||[];arr.push(ev);evidenceByTask.set(key,arr)
 }
 const code=String(w?.record_code||recordCode),canUpdate=caps?.can_update===true;
 const tasks=(Array.isArray(w?.tasks)?w.tasks:[]).filter((x:any)=>String(x?.status||"")!=="cancelled");
 const docItems=Array.isArray(docs?.items)?docs.items:[];
 const docByTask=new Map<string,any>();
 for(const d of docItems){
  if(d?.preparation_task_code)docByTask.set(String(d.preparation_task_code),d)
 }
 const pending=tasks.filter((x:any)=>String(x?.status||"")==="pending").length;
 const completed=tasks.filter((x:any)=>String(x?.status||"")==="completed").length;
 const skipped=tasks.filter((x:any)=>String(x?.status||"")==="skipped").length;
 const pageSize=8,totalPages=Math.max(1,Math.ceil(tasks.length/pageSize)),pg=Math.max(0,Math.min(Number(page)||0,totalPages-1));
 const shown=tasks.slice(pg*pageSize,pg*pageSize+pageSize);
 const summary:any={type:"bubble",size:"kilo",
  header:{type:"box",layout:"vertical",backgroundColor:"#EEF8F3",paddingAll:"18px",contents:[
   {type:"text",text:"✅ เตรียมก่อนนัด",weight:"bold",size:"xl",color:"#285943"},
   {type:"text",text:String(w?.item?.title||"นัดหมาย"),size:"md",weight:"bold",wrap:true,margin:"sm"}
  ]},
  body:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"16px",contents:[
   ...(prefix?[{type:"text",text:prefix,size:"sm",weight:"bold",color:"#285943",wrap:true},{type:"separator",margin:"md"}]:[]),
   {type:"text",text:"⬜ ยังไม่เสร็จ "+String(pending)+" • ✅ เสร็จแล้ว "+String(completed)+(skipped?" • ↪️ ข้าม "+String(skipped):""),size:"sm",weight:"bold",wrap:true},
   {type:"text",text:"รายการจะไม่หายหลังติ๊กเสร็จ และสามารถเปลี่ยนกลับเป็น “ยังไม่เสร็จ” ได้",size:"xs",color:"#667085",wrap:true},
   ...(totalPages>1?[{type:"text",text:"หน้า "+String(pg+1)+"/"+String(totalPages),size:"xs",color:"#777777"}]:[])
  ]},
  footer:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"12px",contents:[
   ...(canUpdate?[{type:"button",style:"primary",action:{type:"postback",label:"➕ เพิ่มรายการ",data:"เพิ่มสิ่งที่ต้องทำ "+code}},
    {type:"button",style:"secondary",action:{type:"postback",label:"📎 เลือกเอกสารเตรียม",data:"เลือกเอกสารเตรียม "+code+" 0"}}]:[]),
   ...(pg>0?[{type:"button",action:{type:"postback",label:"⬅️ ก่อนหน้า",data:"สิ่งที่ต้องทำก่อนนัด "+code+" "+String(pg-1)}}]:[]),
   ...(pg<totalPages-1?[{type:"button",action:{type:"postback",label:"➡️ ถัดไป",data:"สิ่งที่ต้องทำก่อนนัด "+code+" "+String(pg+1)}}]:[]),
   {type:"button",action:{type:"postback",label:"↩️ รายละเอียดนัด",data:"ดูนัด "+code}}
  ].slice(0,5)}
 };
 const cards:any[]=[summary];
 for(const x of shown){
  const st=String(x?.status||"pending"),taskCode=String(x?.code||String(x?.id||"").slice(0,12));
  const linkedDoc=docByTask.get(taskCode);
  const taskEvidence=evidenceByTask.get(taskCode)||[];
  const body:any[]=[
   {type:"text",text:prepTaskStatusLabel(st),size:"sm",weight:"bold",color:st==="completed"?"#285943":st==="skipped"?"#805B18":"#555555",wrap:true},
   ...(x?.instruction?[{type:"text",text:String(x.instruction),size:"sm",wrap:true,color:"#555555"}]:[]),
   ...(linkedDoc?[{type:"separator",margin:"md"},
     {type:"text",text:"📎 เอกสาร: "+String(linkedDoc?.title||"เอกสาร"),size:"sm",weight:"bold",wrap:true},
     ...(linkedDoc?.note?[{type:"text",text:String(linkedDoc.note),size:"xs",color:"#667085",wrap:true}]:[])
    ]:[]),
   ...(taskEvidence.length?[{type:"separator",margin:"md"},
     {type:"text",text:"📎 หลักฐาน "+String(taskEvidence.length)+" รายการ",size:"sm",weight:"bold",color:"#365F8D",wrap:true},
     ...taskEvidence.slice(0,2).map((ev:any)=>({type:"text",text:"• "+String(ev?.title||"รูป/เอกสารประกอบ"),size:"xs",color:"#667085",wrap:true}))
    ]:[]),
   ...(x?.note?[{type:"text",text:"📝 "+String(x.note),size:"xs",color:"#667085",wrap:true}]:[])
  ];
  const footer:any[]=[];
  if(canUpdate){
   if(st==="pending"){
    footer.push({type:"button",style:"primary",action:{type:"postback",label:"✅ ทำเสร็จแล้ว",data:"ตั้งสถานะงานเตรียม "+taskCode+" completed"}});

   }else{
    footer.push({type:"button",style:"secondary",action:{type:"postback",label:"↩️ ยังไม่เสร็จ",data:"ตั้งสถานะงานเตรียม "+taskCode+" pending"}});
   }
   footer.push({type:"button",style:"secondary",action:{type:"postback",label:taskEvidence.length?"📎 ดูหลักฐาน":"📎 แนบหลักฐาน",data:"หลักฐานรายการเตรียม "+taskCode}});

  }
  footer.push({type:"button",action:{type:"postback",label:"✅ กลับ checklist",data:"สิ่งที่ต้องทำก่อนนัด "+code+" "+String(pg)}});
  cards.push({type:"bubble",size:"kilo",
   header:{type:"box",layout:"vertical",backgroundColor:st==="completed"?"#EEF8F3":st==="skipped"?"#FFF7E8":"#F7F9FC",paddingAll:"16px",contents:[
    {type:"text",text:String(x?.title||"รายการเตรียม"),weight:"bold",size:"lg",wrap:true}
   ]},
   body:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"16px",contents:body},
   footer:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"12px",contents:footer.slice(0,4)}
  })
 }
 if(!shown.length)cards.push({type:"bubble",size:"kilo",body:{type:"box",layout:"vertical",paddingAll:"18px",contents:[
  {type:"text",text:"ยังไม่มีรายการเตรียมก่อนนัด",weight:"bold",size:"md",wrap:true},
  {type:"text",text:"เพิ่ม checklist เอง หรือเลือกเอกสารที่ต้องเตรียมจากเอกสารของนัดได้",size:"sm",color:"#667085",wrap:true,margin:"md"}
 ]}});
 await replyMessages(replyToken,token,[{type:"flex",altText:"✅ เตรียมก่อนนัด",contents:{type:"carousel",contents:cards.slice(0,10)}}]);
 return true
}
async function showPreparationDocumentPicker(uid:string,replyToken:string,token:string,u:string,k:string,recordCode:string,page=0){
 const out=await rpcOne(u,k,"phms_line_appointment_documents",{p_line_user_id:uid,p_record_code:recordCode});
 const w=await rpcOne(u,k,"phms_line_appointment_workspace",{p_line_user_id:uid,p_record_code:recordCode});
 const code=String(w?.record_code||recordCode),docs=Array.isArray(out?.items)?out.items:[],pageSize=8;
 const totalPages=Math.max(1,Math.ceil(docs.length/pageSize)),pg=Math.max(0,Math.min(Number(page)||0,totalPages-1));
 const shown=docs.slice(pg*pageSize,pg*pageSize+pageSize);
 if(!shown.length){
  await replyLine(replyToken,"📎 นัดนี้ยังไม่มีเอกสารให้เลือกเป็นเอกสารเตรียมก่อนนัด",token,[
   qpb("➕ เพิ่มเอกสาร","แนบเอกสารนัด "+code),
   qpb("✅ กลับเตรียมก่อนนัด","สิ่งที่ต้องทำก่อนนัด "+code+" 0")
  ]);
  return true
 }
 const cards:any[]=[{type:"bubble",size:"kilo",
  header:{type:"box",layout:"vertical",backgroundColor:"#EEF6FF",paddingAll:"16px",contents:[
   {type:"text",text:"📎 เลือกเอกสารเตรียม",weight:"bold",size:"xl",color:"#365F8D"},
   {type:"text",text:"เลือกเอกสารที่ต้องเตรียม/นำไปในวันนัด แล้วอิ่มอุ่นจะสร้างรายการที่ต้องเตรียมให้",size:"sm",color:"#667085",wrap:true,margin:"sm"}
  ]},
  body:{type:"box",layout:"vertical",paddingAll:"14px",contents:[
   {type:"text",text:"ทั้งหมด "+String(docs.length)+" รายการ"+(totalPages>1?" • หน้า "+String(pg+1)+"/"+String(totalPages):""),size:"sm",wrap:true}
  ]},
  footer:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"10px",contents:[
   ...(pg>0?[{type:"button",action:{type:"postback",label:"⬅️ ก่อนหน้า",data:"เลือกเอกสารเตรียม "+code+" "+String(pg-1)}}]:[]),
   ...(pg<totalPages-1?[{type:"button",action:{type:"postback",label:"➡️ ถัดไป",data:"เลือกเอกสารเตรียม "+code+" "+String(pg+1)}}]:[]),
   {type:"button",action:{type:"postback",label:"↩️ กลับ checklist",data:"สิ่งที่ต้องทำก่อนนัด "+code+" 0"}}
  ]}
 }];
 for(const d of shown){
  const hasTask=!!d?.preparation_task_code,st=String(d?.preparation_status||"");
  cards.push({type:"bubble",size:"kilo",
   header:{type:"box",layout:"vertical",paddingAll:"14px",contents:[
    {type:"text",text:String(d?.title||"เอกสาร"),weight:"bold",size:"lg",wrap:true},
    {type:"text",text:hasTask?("✅ อยู่ใน checklist แล้ว • "+prepTaskStatusLabel(st)):"ยังไม่ได้ตั้งเป็นเอกสารเตรียม",size:"xs",color:"#667085",margin:"sm",wrap:true}
   ]},
   body:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"14px",contents:[
    {type:"text",text:"ประเภท: "+String(d?.link_kind||d?.document_type||"เอกสาร"),size:"sm",wrap:true},
    ...(d?.note?[{type:"text",text:"📝 "+String(d.note),size:"sm",wrap:true,color:"#555555"}]:[])
   ]},
   footer:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"10px",contents:hasTask?[
    {type:"button",style:"secondary",action:{type:"postback",label:"✅ ดูใน checklist",data:"สิ่งที่ต้องทำก่อนนัด "+code+" 0"}}
   ]:[
    {type:"button",style:"primary",action:{type:"postback",label:"➕ ใช้เตรียมก่อนนัด",data:"ตั้งเอกสารเตรียม "+code+" "+String(d?.link_id||"")}}
   ]}
  })
 }
 await replyMessages(replyToken,token,[{type:"flex",altText:"📎 เลือกเอกสารเตรียมก่อนนัด",contents:{type:"carousel",contents:cards.slice(0,10)}}]);
 return true
}
async function showTaskEvidenceMenu(uid:string,replyToken:string,token:string,u:string,k:string,taskCode:string){
 const lookup=await rpcOne(u,k,"phms_line_appointment_get_task",{p_line_user_id:uid,p_task_code:taskCode});
 const code=String(lookup?.appointment_code||"");
 const w=await rpcOne(u,k,"phms_line_appointment_workspace",{p_line_user_id:uid,p_record_code:code});
 const task=lookup?.task||{};
 await setFamilyFlowState(uid,"crud_appointment_attach",{
  record_code:code,appointment_id:String(w?.record_id||""),link_kind:"preparation",
  preparation_task_code:String(lookup?.task_code||taskCode),evidence_mode:true
 },u,k);
 const msg:any={type:"text",text:"📎 รูป / หลักฐานของรายการเตรียม\n\n"+String(task?.title||"รายการเตรียม")+
  "\n\nเลือกได้ทั้ง:\n📷 ถ่ายรูปของที่เตรียมเสร็จแล้ว\n🖼️ เลือกรูปจากเครื่อง\n📄 PDF/ไฟล์ใหม่ — กด + ของ LINE แล้วส่งไฟล์ได้เลย\n📎 เอกสารที่ผูกกับนัดนี้แล้ว\n📚 เอกสารเดิม/เอกสารจากนัดก่อน\n\nรูปหรือเอกสารจะยังอยู่ในคลังตามปกติ และถูกระบุเพิ่มว่าเป็นหลักฐานของ checklist ข้อนี้"};
 msg.quickReply={items:[
  {type:"action",action:{type:"camera",label:"📷 ถ่ายรูป"}},
  {type:"action",action:{type:"cameraRoll",label:"🖼️ เลือกรูป"}},
  qpb("📎 ของนัดนี้","เลือกหลักฐานนัดนี้ "+String(lookup?.task_code||taskCode)+" 0"),
  qpb("📚 นัดก่อน / เอกสารเดิม","เลือกหลักฐานเดิม "+String(lookup?.task_code||taskCode)+" 0"),
  qpb("↩️ กลับ checklist","สิ่งที่ต้องทำก่อนนัด "+code+" 0")
 ]};
 await replyMessages(replyToken,token,[msg]);
 return true
}

async function showTaskCurrentEvidencePicker(uid:string,replyToken:string,token:string,u:string,k:string,taskCode:string,offset=0){
 const lookup=await rpcOne(u,k,"phms_line_appointment_get_task",{p_line_user_id:uid,p_task_code:taskCode});
 const code=String(lookup?.appointment_code||"");
 const out=await rpcOne(u,k,"phms_line_appointment_documents",{p_line_user_id:uid,p_record_code:code});
 const all=Array.isArray(out?.items)?out.items:[],off=Math.max(0,Number(offset)||0),items=all.slice(off,off+7);
 if(!items.length){
  await replyLine(replyToken,"📎 นัดนี้ยังไม่มีรูป/เอกสารที่เลือกเป็นหลักฐานได้",token,[
   qpb("📷 เพิ่มรูปใหม่","หลักฐานรายการเตรียม "+taskCode),
   qpb("📚 เอกสารเดิม","เลือกหลักฐานเดิม "+taskCode+" 0"),
   qpb("↩️ กลับ checklist","สิ่งที่ต้องทำก่อนนัด "+code+" 0")
  ]);return true
 }
 const cards:any[]=[];
 for(const d of items){
  let url="";try{url=String(await signedStorageObject(u,k,d?.bucket_id,d?.object_name)||"")}catch{}
  const mime=String(d?.mime_type||"").toLowerCase(),path=String(d?.object_name||"").toLowerCase();
  const image=/^image\//.test(mime)||/\.(?:jpg|jpeg|png|webp)$/.test(path);
  const foot:any[]=[
   ...(url?[{type:"button",style:"secondary",action:{type:"uri",label:image?"🖼️ เปิดรูป":"📄 เปิดเอกสาร",uri:url}}]:[]),
   {type:"button",style:"primary",action:{type:"postback",label:"✅ ใช้เป็นหลักฐาน",data:"ผูกหลักฐานรายการ "+taskCode+" "+String(d?.link_id||"")}}
  ];
  cards.push({type:"bubble",size:"kilo",
   ...(image&&url?{hero:{type:"image",url,size:"full",aspectRatio:"4:3",aspectMode:"fit",backgroundColor:"#F7F9FC",action:{type:"uri",label:"เปิดรูป",uri:url}}}:{}),
   header:{type:"box",layout:"vertical",paddingAll:"14px",contents:[
    {type:"text",text:String(d?.title||"เอกสารนัด"),weight:"bold",size:"md",wrap:true},
    {type:"text",text:"📎 เอกสารของนัดนี้",size:"xs",color:"#667085",margin:"sm"}
   ]},
   body:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"14px",contents:[
    ...(d?.origin_title?[{type:"text",text:"ต้นทาง: "+String(d.origin_title),size:"xs",color:"#667085",wrap:true}]:[]),
    ...(d?.note?[{type:"text",text:"📝 "+String(d.note),size:"sm",wrap:true}]:[])
   ]},
   footer:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"10px",contents:foot}
  })
 }
 const nav:any[]=[];
 if(off>0)nav.push(qpb("⬅️ ก่อนหน้า","เลือกหลักฐานนัดนี้ "+taskCode+" "+String(Math.max(0,off-7))));
 if(off+items.length<all.length)nav.push(qpb("➡️ ถัดไป","เลือกหลักฐานนัดนี้ "+taskCode+" "+String(off+7)));
 nav.push(qpb("↩️ วิธีอื่น","หลักฐานรายการเตรียม "+taskCode));
 const flex:any={type:"flex",altText:"📎 เลือกหลักฐานจากเอกสารของนัด",contents:{type:"carousel",contents:cards.slice(0,10)},quickReply:{items:nav}};
 await replyMessages(replyToken,token,[flex]);return true
}

async function showTaskOldEvidencePicker(uid:string,replyToken:string,token:string,u:string,k:string,taskCode:string,offset=0){
 const lookup=await rpcOne(u,k,"phms_line_appointment_get_task",{p_line_user_id:uid,p_task_code:taskCode});
 const code=String(lookup?.appointment_code||"");
 const out=await rpcOne(u,k,"phms_line_appointment_unlinked_assets",{p_line_user_id:uid,p_record_code:code,p_limit:7,p_offset:Math.max(0,Number(offset)||0)});
 const items=Array.isArray(out?.items)?out.items:[],off=Number(out?.offset||0),total=Number(out?.total_count||0);
 if(!items.length){
  await replyLine(replyToken,"📚 ยังไม่มีเอกสารเดิม/เอกสารจากนัดก่อนที่นำมาใช้ได้",token,[
   qpb("📷 เพิ่มรูปใหม่","หลักฐานรายการเตรียม "+taskCode),
   qpb("📎 ของนัดนี้","เลือกหลักฐานนัดนี้ "+taskCode+" 0"),
   qpb("↩️ กลับ checklist","สิ่งที่ต้องทำก่อนนัด "+code+" 0")
  ]);return true
 }
 const cards:any[]=[];
 for(const a of items){
  let url="";try{url=String(await signedStorageObject(u,k,a?.bucket_id,a?.object_name)||"")}catch{}
  const mime=String(a?.mime_type||"").toLowerCase(),path=String(a?.object_name||"").toLowerCase();
  const image=/^image\//.test(mime)||/\.(?:jpg|jpeg|png|webp)$/.test(path);
  const origin=[a?.origin_hospital_name,a?.origin_title].filter(Boolean).join(" • ");
  const foot:any[]=[
   ...(url?[{type:"button",style:"secondary",action:{type:"uri",label:image?"🖼️ เปิดรูป":"📄 เปิดเอกสาร",uri:url}}]:[]),
   {type:"button",style:"primary",action:{type:"postback",label:"✅ ใช้เป็นหลักฐาน",data:"ใช้ไฟล์เป็นหลักฐาน "+taskCode+" "+String(a?.asset_id||"")}}
  ];
  cards.push({type:"bubble",size:"kilo",
   ...(image&&url?{hero:{type:"image",url,size:"full",aspectRatio:"4:3",aspectMode:"fit",backgroundColor:"#F7F9FC",action:{type:"uri",label:"เปิดรูป",uri:url}}}:{}),
   header:{type:"box",layout:"vertical",paddingAll:"14px",contents:[
    {type:"text",text:String(a?.title||"รูป/เอกสารเดิม"),weight:"bold",size:"md",wrap:true},
    {type:"text",text:"📚 เอกสารเดิม / นัดก่อน",size:"xs",color:"#667085",margin:"sm"}
   ]},
   body:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"14px",contents:[
    ...(origin?[{type:"text",text:"🧭 "+origin,size:"sm",wrap:true}]:[]),
    ...(a?.origin_appointment_at?[{type:"text",text:"📆 "+appointmentLinkDateTime(a.origin_appointment_at),size:"xs",color:"#667085",wrap:true}]:[])
   ]},
   footer:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"10px",contents:foot}
  })
 }
 const nav:any[]=[];
 if(off>0)nav.push(qpb("⬅️ ก่อนหน้า","เลือกหลักฐานเดิม "+taskCode+" "+String(Math.max(0,off-7))));
 if(off+items.length<total)nav.push(qpb("➡️ ถัดไป","เลือกหลักฐานเดิม "+taskCode+" "+String(off+7)));
 nav.push(qpb("↩️ วิธีอื่น","หลักฐานรายการเตรียม "+taskCode));
 const flex:any={type:"flex",altText:"📚 เลือกเอกสารเดิมเป็นหลักฐาน",contents:{type:"carousel",contents:cards.slice(0,10)},quickReply:{items:nav}};
 await replyMessages(replyToken,token,[flex]);return true
}


function treatmentTemplateMap(raw:string){
 const out:any={};let active="";
 for(const original of String(raw||"").split(/\r?\n/)){
  const line=original.trim();if(!line)continue;
  const m=line.match(/^([^:：]+)[:：]\s*(.*)$/);
  if(m){active=m[1].trim();out[active]=m[2].trim();continue}
  if(active)out[active]=(String(out[active]||"")+"\n"+line).trim()
 }
 return out
}
function treatmentDateValue(raw:any){
 const x=String(raw||"").trim();if(!x||x==="-"||x==="—")return null;
 let m=x.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
 if(m){
  let y=Number(m[1]);if(y>2400)y-=543;
  return String(y).padStart(4,"0")+"-"+String(Number(m[2])).padStart(2,"0")+"-"+String(Number(m[3])).padStart(2,"0")
 }
 m=x.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
 if(m){
  let y=Number(m[3]);if(y<100)y=2500+y;if(y>2400)y-=543;
  return String(y).padStart(4,"0")+"-"+String(Number(m[2])).padStart(2,"0")+"-"+String(Number(m[1])).padStart(2,"0")
 }
 const months:any={"ม.ค.":1,"มค":1,"มกราคม":1,"ก.พ.":2,"กพ":2,"กุมภาพันธ์":2,"มี.ค.":3,"มีค":3,"มีนาคม":3,"เม.ย.":4,"เมย":4,"เมษายน":4,"พ.ค.":5,"พค":5,"พฤษภาคม":5,"มิ.ย.":6,"มิย":6,"มิถุนายน":6,"ก.ค.":7,"กค":7,"กรกฎาคม":7,"ส.ค.":8,"สค":8,"สิงหาคม":8,"ก.ย.":9,"กย":9,"กันยายน":9,"ต.ค.":10,"ตค":10,"ตุลาคม":10,"พ.ย.":11,"พย":11,"พฤศจิกายน":11,"ธ.ค.":12,"ธค":12,"ธันวาคม":12};
 m=x.replace(/,/g," ").replace(/\s+/g," ").match(/^(\d{1,2})\s+([^\s]+)\s+(\d{2,4})$/);
 if(m&&months[m[2]]){
  let y=Number(m[3]);if(y<100)y=2500+y;if(y>2400)y-=543;
  return String(y).padStart(4,"0")+"-"+String(months[m[2]]).padStart(2,"0")+"-"+String(Number(m[1])).padStart(2,"0")
 }
 return null
}
function treatmentTimestamp(raw:any){
 const d=treatmentDateValue(raw);return d?d+"T00:00:00+07:00":null
}
function treatmentDateLabel(v:any){
 if(!v)return "—";
 try{return new Intl.DateTimeFormat("th-TH",{timeZone:"Asia/Bangkok",day:"numeric",month:"short",year:"numeric"}).format(new Date(String(v)))}catch{return String(v)}
}
function treatmentEpisodeStatus(v:any){
 return ({active:"กำลังรักษา/ติดตาม",completed:"จบเคส",archived:"เก็บประวัติ"} as any)[String(v||"")]||String(v||"—")
}
function treatmentEventLabel(v:any){
 return ({outpatient:"ผู้ป่วยนอก",emergency:"ฉุกเฉิน/ER",procedure:"หัตถการ/ผ่าตัด/เลเซอร์",inpatient:"นอนโรงพยาบาล",admission:"รับไว้รักษา",discharge:"ออกจากโรงพยาบาล",follow_up:"ติดตามผล"} as any)[String(v||"")]||String(v||"เหตุการณ์รักษา")
}
function treatmentEventCode(v:any){
 const x=String(v||"").trim().toLowerCase();
 if(/(ฉุกเฉิน|er|emergency)/i.test(x))return "emergency";
 if(/(เลเซอร์|หัตถการ|ผ่าตัด|procedure|laser)/i.test(x))return "procedure";
 if(/(admit|แอดมิ|รับไว้|admission)/i.test(x))return "admission";
 if(/(นอน|inpatient)/i.test(x))return "inpatient";
 if(/(discharge|ออกจากโรง|จำหน่าย)/i.test(x))return "discharge";
 if(/(follow|ติดตาม)/i.test(x))return "follow_up";
 return "outpatient"
}
function inferRecordDocumentType(v:any){
 const x=String(v||"").toLowerCase();
 if(/(discharge|ดิสชาร์|สรุปจำหน่าย)/i.test(x))return "discharge_summary";
 if(/(current\s*summary|เคอร์เรนท์)/i.test(x))return "current_summary";
 if(/(medical\s*summary|เมดิคอลซัม|สรุปการรักษา)/i.test(x))return "medical_summary";
 if(/(admission|admit|แอดมิช)/i.test(x))return "admission_record";
 if(/(opd|ผู้ป่วยนอก|เวชระเบียนผู้ป่วยนอก)/i.test(x))return "outpatient_record";
 if(/(referral|ส่งตัว)/i.test(x))return "referral";
 return "medical_record"
}
function recordDocTypeLabel(v:any){
 return ({outpatient_record:"เวชระเบียนผู้ป่วยนอก",discharge_summary:"Discharge Summary",medical_summary:"Medical Summary",current_summary:"Current Summary",admission_record:"Admission/Admit Record",referral:"ใบส่งตัว",medical_record:"เวชระเบียน/เอกสารการแพทย์"} as any)[String(v||"")]||String(v||"เอกสาร")
}
function recordRequestStatus(v:any){
 return ({draft:"ร่าง",requested:"ขอแล้ว • รอเอกสาร",partial:"ได้รับบางส่วน",received:"ได้รับครบแล้ว",cancelled:"ยกเลิก"} as any)[String(v||"")]||String(v||"—")
}
function moneyFromText(v:any){
 const x=String(v||"").replace(/,/g,"").match(/-?\d+(?:\.\d+)?/);return x?Number(x[0]):NaN
}
function requestPaymentMethod(v:any){
 const x=String(v||"").toLowerCase();
 if(/พร้อมเพย์|promptpay|qr/.test(x))return "promptpay_qr";
 if(/เงินสด|cash/.test(x))return "cash";
 if(/เครดิต|credit/.test(x))return "credit_card";
 if(/เดบิต|debit/.test(x))return "debit_card";
 if(/โอน|transfer/.test(x))return "bank_transfer";
 if(/wallet|วอลเล|e-wallet/.test(x))return "e_wallet";
 return x&&x!=="-"?"other":null
}
function parseRecordRequestItems(raw:string){
 const lines=String(raw||"").split(/\r?\n/);const items:any[]=[];let inside=false;
 for(const original of lines){
  const line=original.trim();
  if(/^เอกสารที่ขอ\s*[:：]/.test(line)){inside=true;const after=line.replace(/^เอกสารที่ขอ\s*[:：]\s*/,"");if(after)lines.push("- "+after);continue}
  if(inside&&/^[^\-•]/.test(line)&&/^[^:：]+[:：]/.test(line)){inside=false}
  if(!inside||!/^[-•]/.test(line))continue;
  const body=line.replace(/^[-•]\s*/,"").trim();if(!body)continue;
  const p=body.split("|").map(x=>x.trim());
  const title=p[0];const type=(p[1]&&/^[a-z_]+$/i.test(p[1]))?p[1]:inferRecordDocumentType(title);
  const d1=treatmentDateValue(p[2]||"");const d2=treatmentDateValue(p[3]||"");
  items.push({title,document_type:type,service_period_start:d1,service_period_end:d2})
 }
 return items
}
async function showTreatmentEpisodes(uid:string,replyToken:string,token:string,u:string,k:string,prefix=""){
 const out=await rpcOne(u,k,"phms_line_treatment_episode_overview",{p_line_user_id:uid,p_limit:20});
 const who=String(out?.person_name||"บุคคล"),items=Array.isArray(out?.items)?out.items:[];
 const intro:any={type:"bubble",size:"kilo",
  header:{type:"box",layout:"vertical",backgroundColor:"#EEF8F3",paddingAll:"18px",contents:[
   {type:"text",text:"🩺 เคสการรักษา",weight:"bold",size:"xl",color:"#285943"},
   {type:"text",text:"ข้อมูลของ "+who,size:"sm",color:"#5D7568",margin:"sm",wrap:true}
  ]},
  body:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"16px",contents:[
   ...(prefix?[{type:"text",text:prefix,size:"sm",weight:"bold",color:"#285943",wrap:true},{type:"separator",margin:"md"}]:[]),
   {type:"text",text:"รวมเหตุการณ์รักษา นัด เอกสาร คำขอเวชระเบียน และค่าใช้จ่ายที่เกี่ยวกับเรื่องเดียวกันไว้ในเคสเดียว",size:"sm",wrap:true},
   {type:"text",text:"ทั้งหมด "+String(items.length)+" เคส",size:"xs",color:"#667085"}
  ]},
  footer:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"12px",contents:[
   {type:"button",style:"primary",action:{type:"postback",label:"➕ สร้างเคสการรักษา",data:"สร้างเคสการรักษา"}},
   {type:"button",action:{type:"message",label:"❤️ กลับสุขภาพ",text:"สุขภาพ"}}
  ]}
 };
 const cards:any[]=[intro];
 for(const e of items.slice(0,9)){
  const next=e?.next_appointment;
  cards.push({type:"bubble",size:"kilo",
   header:{type:"box",layout:"vertical",backgroundColor:"#F7FBF9",paddingAll:"16px",contents:[
    {type:"text",text:String(e?.title||"เคสการรักษา"),weight:"bold",size:"lg",wrap:true},
    {type:"text",text:treatmentEpisodeStatus(e?.status),size:"xs",color:"#2F6B4F",margin:"sm",wrap:true}
   ]},
   body:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"16px",contents:[
    ...(e?.care_topic?[{type:"text",text:"🧭 "+String(e.care_topic),size:"sm",wrap:true}]:[]),
    {type:"text",text:"📆 "+treatmentDateLabel(e?.started_at)+(e?.ended_at?" → "+treatmentDateLabel(e.ended_at):""),size:"sm",wrap:true},
    {type:"text",text:"🩺 เหตุการณ์ "+String(e?.encounter_count||0)+" • 📅 นัด "+String(e?.appointment_count||0)+" • 📄 เอกสาร "+String(e?.document_count||0),size:"xs",color:"#667085",wrap:true},
    {type:"text",text:"📥 คำขอเวชระเบียน "+String(e?.record_request_count||0)+" • 💰 "+Number(e?.expense_total||0).toLocaleString("th-TH")+" บาท",size:"xs",color:"#667085",wrap:true},
    ...(next?[{type:"separator",margin:"md"},{type:"text",text:"➡️ นัดถัดไป "+treatmentDateLabel(next.appointment_at)+" • "+String(next.title||"นัดหมาย"),size:"sm",weight:"bold",color:"#365F8D",wrap:true}]:[]),
    ...(e?.summary?[{type:"text",text:String(e.summary),size:"xs",color:"#555555",wrap:true,margin:"md"}]:[])
   ]},
   footer:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"12px",contents:[
    {type:"button",style:"primary",action:{type:"postback",label:"🔎 เปิดเคส",data:"ดูเคสการรักษา "+String(e?.code||"")}}
   ]}
  })
 }
 await replyMessages(replyToken,token,[{type:"flex",altText:"🩺 เคสการรักษาของ "+who,contents:{type:"carousel",contents:cards.slice(0,10)}}]);return true
}
async function showTreatmentEpisode(uid:string,replyToken:string,token:string,u:string,k:string,episodeCode:string,prefix=""){
 const w=await rpcOne(u,k,"phms_line_treatment_episode_workspace",{p_line_user_id:uid,p_episode_code:episodeCode});
 const e=w?.episode||{},code=String(e?.code||episodeCode),events=Array.isArray(w?.events)?w.events:[],appts=Array.isArray(w?.appointments)?w.appointments:[],docs=Array.isArray(w?.documents)?w.documents:[],reqs=Array.isArray(w?.record_requests)?w.record_requests:[];
 const cards:any[]=[{type:"bubble",size:"kilo",
  header:{type:"box",layout:"vertical",backgroundColor:"#EEF8F3",paddingAll:"18px",contents:[
   {type:"text",text:"🩺 "+String(e?.title||"เคสการรักษา"),weight:"bold",size:"xl",color:"#285943",wrap:true},
   {type:"text",text:String(e?.person_name||"บุคคล")+" • "+treatmentEpisodeStatus(e?.status),size:"sm",color:"#5D7568",margin:"sm",wrap:true}
  ]},
  body:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"16px",contents:[
   ...(prefix?[{type:"text",text:prefix,size:"sm",weight:"bold",color:"#285943",wrap:true},{type:"separator",margin:"md"}]:[]),
   ...(e?.care_topic?[{type:"text",text:"🧭 "+String(e.care_topic),size:"sm",weight:"bold",wrap:true}]:[]),
   {type:"text",text:"📆 "+treatmentDateLabel(e?.started_at)+(e?.ended_at?" → "+treatmentDateLabel(e.ended_at):""),size:"sm",wrap:true},
   ...(e?.organization_name?[{type:"text",text:"🏥 เริ่มจาก "+String(e.organization_name),size:"sm",wrap:true}]:[]),
   ...(e?.summary?[{type:"separator",margin:"md"},{type:"text",text:String(e.summary),size:"sm",color:"#555555",wrap:true}]:[]),
   {type:"separator",margin:"md"},
   {type:"text",text:"🩺 เหตุการณ์ "+events.length+" • 📅 นัด "+appts.length+" • 📄 เอกสาร "+docs.length+" • 📥 คำขอ "+reqs.length,size:"xs",color:"#667085",wrap:true}
  ]},
  footer:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"12px",contents:[
   {type:"button",style:"primary",action:{type:"postback",label:"➕ เพิ่มเหตุการณ์รักษา",data:"เพิ่มเหตุการณ์รักษา "+code}},
   {type:"button",style:"secondary",action:{type:"postback",label:"📅 ผูกนัดที่มีอยู่",data:"เลือกนัดเข้าเคส "+code+" 0"}},
   {type:"button",style:"secondary",action:{type:"postback",label:"📥 ขอเวชระเบียน",data:"ขอเวชระเบียน "+code}},
   {type:"button",action:{type:"postback",label:"↩️ เคสทั้งหมด",data:"เคสการรักษา"}}
  ]}
 }];
 const timeline=[...events.map((x:any)=>({kind:"event",at:x?.started_at,x})),...appts.filter((a:any)=>!events.some((ev:any)=>String(ev?.appointment_code||"")===String(a?.code||""))).map((x:any)=>({kind:"appointment",at:x?.appointment_at,x}))].sort((a:any,b:any)=>new Date(a.at||0).getTime()-new Date(b.at||0).getTime());
 if(timeline.length){
  const rows:any[]=[{type:"text",text:"ลำดับเหตุการณ์",size:"sm",weight:"bold",color:"#57456E",wrap:true}];
  for(const z of timeline.slice(0,8)){
   if(z.kind==="event")rows.push({type:"text",text:"• "+treatmentDateLabel(z.at)+" • "+treatmentEventLabel(z.x?.encounter_type)+"\n  "+String(z.x?.reason||"เหตุการณ์รักษา")+(z.x?.organization_name?" • "+String(z.x.organization_name):""),size:"sm",wrap:true});
   else rows.push({type:"text",text:"• "+treatmentDateLabel(z.at)+" • 📅 "+String(z.x?.title||"นัดหมาย")+" • "+String(z.x?.status||""),size:"sm",wrap:true})
  }
  cards.push({type:"bubble",size:"kilo",header:{type:"box",layout:"vertical",backgroundColor:"#F4F1FA",paddingAll:"16px",contents:[
   {type:"text",text:"🧭 Timeline การรักษา",weight:"bold",size:"lg",color:"#57456E"}
  ]},body:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"16px",contents:rows},footer:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"10px",contents:[
   ...(appts.length?[{type:"button",style:"secondary",action:{type:"postback",label:"📅 ดูนัดในเคส",data:"เลือกนัดเข้าเคส "+code+" 0"}}]:[])
  ]}})
 }
 if(reqs.length){
  for(const r of reqs.slice(0,4)){
   const items=Array.isArray(r?.items)?r.items:[],received=items.filter((x:any)=>x?.status==="received").length;
   cards.push({type:"bubble",size:"kilo",header:{type:"box",layout:"vertical",backgroundColor:"#FFF7E8",paddingAll:"16px",contents:[
    {type:"text",text:"📥 คำขอเวชระเบียน",weight:"bold",size:"lg",color:"#805B18"},
    {type:"text",text:recordRequestStatus(r?.status),size:"xs",color:"#8A6B2F",margin:"sm"}
   ]},body:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"16px",contents:[
    ...(r?.organization_name?[{type:"text",text:"🏥 "+String(r.organization_name),size:"sm",wrap:true}]:[]),
    {type:"text",text:"📆 ไปขอ: "+treatmentDateLabel(r?.requested_at),size:"sm",wrap:true},
    {type:"text",text:"📄 ได้รับ "+received+"/"+items.length+" รายการ",size:"sm",weight:"bold",wrap:true},
    ...(r?.received_at?[{type:"text",text:"✅ ได้รับครบ: "+treatmentDateLabel(r.received_at),size:"sm",wrap:true}]:[]),
    ...(r?.fee?[{type:"text",text:"💰 ค่าขอเอกสาร "+Number(r.fee.paid_amount||0).toLocaleString("th-TH")+" บาท",size:"sm",wrap:true}]:[])
   ]},footer:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"10px",contents:[
    {type:"button",style:"primary",action:{type:"postback",label:"🔎 เปิดคำขอ",data:"ดูคำขอเวชระเบียน "+String(r?.code||"")}}
   ]}})
  }
 }else{
  cards.push({type:"bubble",size:"kilo",body:{type:"box",layout:"vertical",paddingAll:"18px",contents:[
   {type:"text",text:"📥 ยังไม่มีคำขอเวชระเบียนในเคสนี้",weight:"bold",size:"md",wrap:true},
   {type:"text",text:"ถ้าต้องไปขอ OPD Record / Admission / Current Summary / Medical Summary / Discharge Summary ให้บันทึกเป็น “คำขอ” ครั้งเดียวแล้วใส่หลายรายการได้",size:"sm",color:"#667085",wrap:true,margin:"md"}
  ]},footer:{type:"box",layout:"vertical",paddingAll:"10px",contents:[
   {type:"button",style:"primary",action:{type:"postback",label:"📥 บันทึกคำขอ",data:"ขอเวชระเบียน "+code}}
  ]}})
 }
 await replyMessages(replyToken,token,[{type:"flex",altText:"🩺 "+String(e?.title||"เคสการรักษา"),contents:{type:"carousel",contents:cards.slice(0,10)}}]);return true
}
async function showTreatmentAppointmentPicker(uid:string,replyToken:string,token:string,u:string,k:string,episodeCode:string,offset=0){
 const list=await rpcOne(u,k,"phms_line_crud_list_v2",{p_line_user_id:uid,p_resource:"appointment",p_offset:0,p_page_size:50});
 const w=await rpcOne(u,k,"phms_line_treatment_episode_workspace",{p_line_user_id:uid,p_episode_code:episodeCode});
 const linked=new Set((Array.isArray(w?.appointments)?w.appointments:[]).map((x:any)=>String(x?.code||"")));
 const rows=(Array.isArray(list?.items)?list.items:[]).sort((a:any,b:any)=>new Date(a?.appointment_at||0).getTime()-new Date(b?.appointment_at||0).getTime());
 const off=Math.max(0,Number(offset)||0),items=rows.slice(off,off+7),code=String(w?.episode?.code||episodeCode);
 const cards:any[]=[];
 for(const a of items){
  const ac=String(a?.code||String(a?.id||"").slice(0,12)),on=linked.has(ac);
  cards.push({type:"bubble",size:"kilo",header:{type:"box",layout:"vertical",paddingAll:"14px",contents:[
   {type:"text",text:String(a?.title||"นัดหมาย"),weight:"bold",size:"md",wrap:true},
   {type:"text",text:treatmentDateLabel(a?.appointment_at),size:"xs",color:"#667085",margin:"sm"}
  ]},body:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"14px",contents:[
   ...(a?.hospital_name?[{type:"text",text:"🏥 "+String(a.hospital_name),size:"sm",wrap:true}]:[]),
   ...(a?.care_topic?[{type:"text",text:"🧭 "+String(a.care_topic),size:"sm",wrap:true}]:[]),
   {type:"text",text:on?"✅ อยู่ในเคสนี้แล้ว":"ยังไม่ได้ผูกกับเคสนี้",size:"sm",weight:"bold",color:on?"#285943":"#555555",wrap:true}
  ]},footer:{type:"box",layout:"vertical",paddingAll:"10px",contents:on?[
   {type:"button",style:"secondary",action:{type:"postback",label:"📅 เปิดนัด",data:"ดูนัด "+ac}}
  ]:[
   {type:"button",style:"primary",action:{type:"postback",label:"🔗 ผูกเข้าเคสนี้",data:"ผูกนัดเข้าเคส "+code+" "+ac}}
  ]}})
 }
 const nav:any[]=[];
 if(off>0)nav.push(qpb("⬅️ ก่อนหน้า","เลือกนัดเข้าเคส "+code+" "+String(Math.max(0,off-7))));
 if(off+items.length<rows.length)nav.push(qpb("➡️ ถัดไป","เลือกนัดเข้าเคส "+code+" "+String(off+7)));
 nav.push(qpb("↩️ กลับเคส","ดูเคสการรักษา "+code));
 const flex:any={type:"flex",altText:"📅 เลือกนัดเข้าเคส",contents:{type:"carousel",contents:cards.slice(0,10)},quickReply:{items:nav}};
 if(cards.length)await replyMessages(replyToken,token,[flex]);else await replyLine(replyToken,"📅 ยังไม่มีนัดของบุคคลนี้",token,nav);
 return true
}
async function showRecordRequest(uid:string,replyToken:string,token:string,u:string,k:string,requestCode:string,prefix=""){
 const w=await rpcOne(u,k,"phms_line_medical_record_request_workspace",{p_line_user_id:uid,p_request_code:requestCode});
 const r=w?.request||{},code=String(r?.code||requestCode),items=Array.isArray(w?.items)?w.items:[],fee=w?.fee||null;
 const cards:any[]=[{type:"bubble",size:"kilo",header:{type:"box",layout:"vertical",backgroundColor:"#FFF7E8",paddingAll:"18px",contents:[
  {type:"text",text:"📥 คำขอเวชระเบียน",weight:"bold",size:"xl",color:"#805B18"},
  {type:"text",text:recordRequestStatus(r?.status),size:"sm",color:"#8A6B2F",margin:"sm"}
 ]},body:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"16px",contents:[
  ...(prefix?[{type:"text",text:prefix,size:"sm",weight:"bold",color:"#285943",wrap:true},{type:"separator",margin:"md"}]:[]),
  ...(r?.organization_name?[{type:"text",text:"🏥 "+String(r.organization_name),size:"sm",wrap:true}]:[]),
  {type:"text",text:"📆 วันที่ไปขอ: "+treatmentDateLabel(r?.requested_at),size:"sm",wrap:true},
  ...(r?.received_at?[{type:"text",text:"✅ วันที่ได้รับครบ: "+treatmentDateLabel(r.received_at),size:"sm",wrap:true}]:[]),
  ...(r?.request_channel?[{type:"text",text:"📮 ช่องทาง: "+String(r.request_channel),size:"sm",wrap:true}]:[]),
  {type:"text",text:"📄 รายการ "+items.filter((x:any)=>x?.status==="received").length+"/"+items.length+" ได้รับแล้ว",size:"sm",weight:"bold",wrap:true},
  ...(fee?[{type:"separator",margin:"md"},{type:"text",text:"💰 ค่าขอเอกสาร "+Number(fee?.paid_amount||0).toLocaleString("th-TH")+" บาท",size:"sm",weight:"bold",wrap:true}]:[])
 ]},footer:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"12px",contents:[
  ...(items.some((x:any)=>x?.status==="requested")?[{type:"button",style:"primary",action:{type:"postback",label:"📎 เพิ่มเอกสารที่ได้รับ",data:"เพิ่มเอกสารคำขอ "+code}}]:[]),
  {type:"button",style:"secondary",action:{type:"postback",label:fee?"✏️ แก้ค่าขอเอกสาร":"💰 บันทึกค่าขอเอกสาร",data:"ค่าขอเวชระเบียน "+code}},
  ...(r?.episode_code?[{type:"button",action:{type:"postback",label:"↩️ กลับเคส",data:"ดูเคสการรักษา "+String(r.episode_code)}}]:[])
 ]}}];
 for(const it of items.slice(0,8)){
  const received=it?.status==="received";
  cards.push({type:"bubble",size:"kilo",header:{type:"box",layout:"vertical",backgroundColor:received?"#EEF8F3":"#F7F9FC",paddingAll:"14px",contents:[
   {type:"text",text:(received?"✅ ":"⬜ ")+String(it?.title||recordDocTypeLabel(it?.document_type)),weight:"bold",size:"md",wrap:true},
   {type:"text",text:recordDocTypeLabel(it?.document_type),size:"xs",color:"#667085",margin:"sm"}
  ]},body:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"14px",contents:[
   ...((it?.service_period_start||it?.service_period_end)?[{type:"text",text:"🩺 ช่วงการรักษา: "+treatmentDateLabel(it?.service_period_start)+(it?.service_period_end?" → "+treatmentDateLabel(it.service_period_end):""),size:"sm",wrap:true}]:[]),
   ...(it?.document_date?[{type:"text",text:"📄 วันที่เอกสาร: "+treatmentDateLabel(it.document_date),size:"sm",wrap:true}]:[]),
   ...(it?.received_at?[{type:"text",text:"📥 ได้รับจริง: "+treatmentDateLabel(it.received_at),size:"sm",wrap:true}]:[])
  ]},...(received?{}:{footer:{type:"box",layout:"vertical",paddingAll:"10px",contents:[
   {type:"button",style:"primary",action:{type:"postback",label:"📎 รับเอกสารนี้",data:"เพิ่มเอกสารคำขอ "+code+" "+String(it?.code||"")}}
  ]}})})
 }
 await replyMessages(replyToken,token,[{type:"flex",altText:"📥 คำขอเวชระเบียน",contents:{type:"carousel",contents:cards.slice(0,10)}}]);return true
}
async function beginRecordRequestExistingAssetMetadata(uid:string,replyToken:string,token:string,u:string,k:string,requestCode:string,itemCode:string,assetId:string){
 const w=await rpcOne(u,k,"phms_line_medical_record_request_workspace",{p_line_user_id:uid,p_request_code:requestCode});
 const items=Array.isArray(w?.items)?w.items:[];
 const it=items.find((x:any)=>String(x?.code||"")===String(itemCode||""))||items.find((x:any)=>x?.status==="requested")||null;
 await setFamilyFlowState(uid,"medical_record_request_attachment_metadata",{
  request_code:requestCode,item_code:String(it?.code||itemCode||""),asset_id:assetId,source_id:"",
  default_title:String(it?.title||""),default_document_type:String(it?.document_type||""),
  default_service_period_start:String(it?.service_period_start||""),default_service_period_end:String(it?.service_period_end||"")
 },u,k);
 await replyLine(replyToken,
  "📄 เลือกไฟล์เดิมแล้ว — ระบุวันที่ให้เอกสารนี้\n\n"+
  "ชื่อเอกสาร: "+String(it?.title||"")+"\n"+
  "ประเภทเอกสาร: "+String(it?.document_type||"")+"\n"+
  "วันที่เอกสาร: \n"+
  "ช่วงรักษาเริ่ม: "+String(it?.service_period_start||"")+"\n"+
  "ช่วงรักษาสิ้นสุด: "+String(it?.service_period_end||"")+"\n"+
  "วันที่ได้รับจริง: \n\n"+
  "วันที่เอกสาร / ช่วงรักษา / วันที่ได้รับจริง แยกเก็บคนละช่อง",
  token,[qpb("❌ ยกเลิก","ดูคำขอเวชระเบียน "+requestCode)]
 );return true
}
async function showRecordRequestExistingAssetPicker(uid:string,replyToken:string,token:string,u:string,k:string,requestCode:string,itemCode:string,offset=0){
 const out=await rpcOne(u,k,"phms_list_line_medical_gallery_v2",{p_line_user_id:uid,p_category:"all",p_days:0,p_limit:7,p_offset:Math.max(0,Number(offset)||0)});
 const rows=Array.isArray(out?.items)?out.items:[],off=Number(out?.offset||0),total=Number(out?.total_count||0);
 if(!rows.length){
  await replyLine(replyToken,"📁 ยังไม่มีไฟล์เดิมให้เลือก",token,[qpb("📷 ส่งไฟล์ใหม่","เพิ่มเอกสารคำขอ "+requestCode+" "+itemCode),qpb("↩️ กลับคำขอ","ดูคำขอเวชระเบียน "+requestCode)]);return true
 }
 const cards:any[]=[];
 for(const a of rows){
  let url="";try{url=String(await signedStorageObject(u,k,a?.bucket_id,a?.object_name)||"")}catch{}
  const mime=String(a?.mime_type||"").toLowerCase(),path=String(a?.object_name||"").toLowerCase();
  const isImage=/^image\//.test(mime)||/\.(?:jpg|jpeg|png|webp)$/.test(path);
  cards.push({type:"bubble",size:"kilo",
   ...(isImage&&url?{hero:{type:"image",url,size:"full",aspectRatio:"4:3",aspectMode:"fit",backgroundColor:"#F7F9FC",action:{type:"uri",label:"เปิดรูป",uri:url}}}:{}),
   header:{type:"box",layout:"vertical",paddingAll:"14px",contents:[
    {type:"text",text:String(a?.title||"รูป/เอกสาร"),weight:"bold",size:"md",wrap:true},
    {type:"text",text:"📁 "+String(a?.category||"ไฟล์เดิม"),size:"xs",color:"#667085",margin:"sm"}
   ]},
   body:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"14px",contents:[
    {type:"text",text:"เพิ่มเมื่อ "+treatmentDateLabel(a?.item_date),size:"xs",color:"#667085",wrap:true},
    ...(a?.document_type&&a.document_type!=="unknown"?[{type:"text",text:"ชนิดเดิม: "+String(a.document_type),size:"xs",color:"#667085",wrap:true}]:[])
   ]},
   footer:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"10px",contents:[
    ...(url?[{type:"button",style:"secondary",action:{type:"uri",label:isImage?"🖼️ เปิดรูป":"📄 เปิดไฟล์",uri:url}}]:[]),
    {type:"button",style:"primary",action:{type:"postback",label:"✅ ใช้ไฟล์นี้",data:"ใช้ไฟล์เดิมคำขอ "+requestCode+" "+itemCode+" "+String(a?.asset_id||"")}}
   ]}
  })
 }
 const q:any[]=[];
 if(off>0)q.push(qpb("⬅️ ก่อนหน้า","เลือกไฟล์เดิมคำขอ "+requestCode+" "+itemCode+" "+String(Math.max(0,off-7))));
 if(off+rows.length<total)q.push(qpb("➡️ ถัดไป","เลือกไฟล์เดิมคำขอ "+requestCode+" "+itemCode+" "+String(off+7)));
 q.push(qpb("📷 ส่งไฟล์ใหม่","เพิ่มเอกสารคำขอ "+requestCode+" "+itemCode));
 q.push(qpb("↩️ กลับคำขอ","ดูคำขอเวชระเบียน "+requestCode));
 await replyMessages(replyToken,token,[{type:"flex",altText:"📁 เลือกไฟล์เดิมเป็นเวชระเบียน",contents:{type:"carousel",contents:cards.slice(0,10)},quickReply:{items:q}}]);return true
}
async function startRecordRequestAttachment(uid:string,replyToken:string,token:string,u:string,k:string,requestCode:string,itemCode=""){
 const w=await rpcOne(u,k,"phms_line_medical_record_request_workspace",{p_line_user_id:uid,p_request_code:requestCode});
 const pending=(Array.isArray(w?.items)?w.items:[]).filter((x:any)=>x?.status==="requested");
 if(!itemCode&&pending.length>1){
  const q:any[]=pending.slice(0,11).map((x:any)=>qpb(("📄 "+String(x?.title||"เอกสาร")).slice(0,20),"เพิ่มเอกสารคำขอ "+requestCode+" "+String(x?.code||"")));
  q.push(qpb("↩️ กลับ","ดูคำขอเวชระเบียน "+requestCode));
  await replyLine(replyToken,"📎 เอกสารที่ได้รับตรงกับรายการไหน?\n\nเลือกก่อน แล้วค่อยถ่ายรูป/เลือกไฟล์ อิ่มอุ่นจะผูกวันที่และชนิดเอกสารกับรายการนั้น",token,q);return true
 }
 const chosen=itemCode||String(pending[0]?.code||"");
 await setFamilyFlowState(uid,"medical_record_request_attach",{request_code:requestCode,item_code:chosen},u,k);
 const msg:any={type:"text",text:"📎 ส่งเอกสารที่ได้รับมาได้เลย\n\n• ถ่ายรูป\n• เลือกรูปจากเครื่อง\n• PDF/ไฟล์ — กด + ของ LINE แล้วส่งไฟล์\n\nหลังรับไฟล์ อิ่มอุ่นจะถาม “วันที่เอกสาร / ช่วงวันที่รักษา / วันที่ได้รับจริง” แยกกันอีกครั้ง"};
 msg.quickReply={items:[
  {type:"action",action:{type:"camera",label:"📷 ถ่ายรูป"}},
  {type:"action",action:{type:"cameraRoll",label:"🖼️ เลือกรูป"}},
  qpb("📁 เลือกไฟล์เดิม","เลือกไฟล์เดิมคำขอ "+requestCode+" "+chosen+" 0"),
  qpb("❌ ยกเลิก","ดูคำขอเวชระเบียน "+requestCode)
 ]};
 await replyMessages(replyToken,token,[msg]);return true
}
async function routeTreatmentEpisodes(cmd:string,rawText:string,uid:string,replyToken:string,token:string,u:string,k:string){
 const st=await getFamilyFlowState(uid,u,k),sk=String(st?.state_key||""),sd=st?.state_data||{};
 const nav=/^(?:เคสการรักษา|ดูเคสการรักษา|ดูคำขอเวชระเบียน|สุขภาพ|นัดหมาย|ครอบครัว|หน้าเริ่มต้น)/.test(cmd);

 if(sk==="treatment_episode_create_router"&&!nav){
  const x=treatmentTemplateMap(rawText);
  const title=String(x["ชื่อเคส"]||x["ชื่อ"]||"").trim();
  if(!title){await replyLine(replyToken,"⚠️ ใส่ชื่อเคสก่อน\n\nชื่อเคส: ...\nกลุ่มโรค/การรักษา: ...\nวันที่เริ่ม: ...\nวันที่สิ้นสุด: -\nสรุป: ...",token,[qpb("❌ ยกเลิก","เคสการรักษา")]);return true}
  try{
   const rr=await rpcOne(u,k,"phms_line_treatment_episode_create",{
    p_line_user_id:uid,p_title:title,p_care_topic:String(x["กลุ่มโรค/การรักษา"]||x["กลุ่มโรค"]||"").trim()||null,
    p_started_at:treatmentTimestamp(x["วันที่เริ่ม"]),p_ended_at:treatmentTimestamp(x["วันที่สิ้นสุด"]),
    p_summary:String(x["สรุป"]||"").trim()||null,p_status:"active"
   });
   await rpcRaw(u,k,"phms_clear_line_conversation_state",{p_line_user_id:uid});
   return await showTreatmentEpisode(uid,replyToken,token,u,k,String(rr?.episode_code||""),"✅ สร้างเคสการรักษาแล้ว")
  }catch(err){console.error("treatment_episode_create",String(err));await replyLine(replyToken,"⚠️ ยังบันทึกเคสไม่ได้ ตรวจวันที่และข้อมูลแล้วส่งใหม่ได้เลย",token,[qpb("❌ ยกเลิก","เคสการรักษา")]);return true}
 }
 if(sk==="treatment_event_create_router"&&!nav){
  const x=treatmentTemplateMap(rawText),ep=String(sd?.episode_code||"");
  const title=String(x["เหตุการณ์"]||x["ชื่อเหตุการณ์"]||"").trim();
  if(!title){await replyLine(replyToken,"⚠️ ใส่ชื่อเหตุการณ์ก่อน เช่น “เลเซอร์ต้อหิน” หรือ “นอนโรงพยาบาล”",token,[qpb("❌ ยกเลิก","ดูเคสการรักษา "+ep)]);return true}
  try{
   const rr=await rpcOne(u,k,"phms_line_treatment_episode_add_event",{
    p_line_user_id:uid,p_episode_code:ep,p_event_type:treatmentEventCode(x["ประเภท"]||title),p_title:title,
    p_started_at:treatmentTimestamp(x["วันที่เริ่ม"]||x["วันที่"]),p_ended_at:treatmentTimestamp(x["วันที่สิ้นสุด"]),
    p_hospital_query:String((x["โรงพยาบาล"]||x["สถานพยาบาล"])||"").trim()||null,p_summary:String(x["สรุป"]||x["รายละเอียด"]||"").trim()||null
   });
   await rpcRaw(u,k,"phms_clear_line_conversation_state",{p_line_user_id:uid});
   return await showTreatmentEpisode(uid,replyToken,token,u,k,ep,"✅ เพิ่มเหตุการณ์รักษาแล้ว")
  }catch(err){console.error("treatment_event_create",String(err));await replyLine(replyToken,"⚠️ ยังเพิ่มเหตุการณ์ไม่ได้ ตรวจวัน/โรงพยาบาลแล้วส่งใหม่ได้เลย",token,[qpb("❌ ยกเลิก","ดูเคสการรักษา "+ep)]);return true}
 }
 if(sk==="medical_record_request_create_router"&&!nav){
  const x=treatmentTemplateMap(rawText),ep=String(sd?.episode_code||""),items=parseRecordRequestItems(rawText);
  if(!items.length){await replyLine(replyToken,"⚠️ ยังไม่พบรายการเอกสารที่ขอ\n\nใส่ใต้ “เอกสารที่ขอ:” ทีละบรรทัด เช่น\n- เวชระเบียนผู้ป่วยนอก\n- Discharge Summary | discharge_summary | 3/9/69 | 5/9/69",token,[qpb("❌ ยกเลิก","ดูเคสการรักษา "+ep)]);return true}
  try{
   const rr=await rpcOne(u,k,"phms_line_medical_record_request_create",{
    p_line_user_id:uid,p_episode_code:ep,p_hospital_query:String((x["โรงพยาบาล"]||x["สถานพยาบาล"])||"").trim(),
    p_requested_at:treatmentTimestamp(x["วันที่ไปขอ"]||x["วันที่ขอ"])||new Date().toISOString(),
    p_items:items,p_request_channel:String(x["ช่องทาง"]||"").trim()||null,p_notes:String(x["หมายเหตุ"]||"").trim()||null
   });
   await rpcRaw(u,k,"phms_clear_line_conversation_state",{p_line_user_id:uid});
   return await showRecordRequest(uid,replyToken,token,u,k,String(rr?.request_code||""),"✅ บันทึกคำขอเวชระเบียน "+String(rr?.item_count||items.length)+" รายการแล้ว")
  }catch(err){console.error("record_request_create",String(err));await replyLine(replyToken,"⚠️ ยังบันทึกคำขอไม่ได้ ตรวจวันที่และรายการแล้วส่งใหม่ได้เลย",token,[qpb("❌ ยกเลิก","ดูเคสการรักษา "+ep)]);return true}
 }
 if(sk==="medical_record_request_attach"&&!nav){
  await replyLine(replyToken,"📎 ตอนนี้รอรูปหรือ PDF อยู่\nกดกล้อง/เลือกรูป หรือกด + ของ LINE เพื่อส่งไฟล์",token,[qpb("❌ ยกเลิก","ดูคำขอเวชระเบียน "+String(sd?.request_code||""))]);return true
 }
 if(sk==="medical_record_request_attachment_metadata"&&!nav){
  const x=treatmentTemplateMap(rawText),req=String(sd?.request_code||""),asset=String(sd?.asset_id||""),item=String(sd?.item_code||"");
  try{
   const rr=await rpcOne(u,k,"phms_line_medical_record_request_add_asset",{
    p_line_user_id:uid,p_request_code:req,p_storage_asset_id:asset,p_item_code:item||null,
    p_document_type:String(x["ประเภทเอกสาร"]||"").trim(),
    p_title:String(x["ชื่อเอกสาร"]||"").trim()||null,
    p_document_date:treatmentDateValue(x["วันที่เอกสาร"]),
    p_service_period_start:treatmentDateValue(x["ช่วงรักษาเริ่ม"]||x["วันที่รักษาเริ่ม"]),
    p_service_period_end:treatmentDateValue(x["ช่วงรักษาสิ้นสุด"]||x["วันที่รักษาสิ้นสุด"]),
    p_received_at:treatmentTimestamp(x["วันที่ได้รับจริง"]||x["วันที่ได้รับ"])||new Date().toISOString()
   });
   await rpcRaw(u,k,"phms_clear_line_conversation_state",{p_line_user_id:uid});
   return await showRecordRequest(uid,replyToken,token,u,k,req,"✅ บันทึกเอกสารที่ได้รับแล้ว • วันที่แต่ละชนิดถูกเก็บแยกกัน")
  }catch(err){console.error("record_request_attachment_metadata",String(err));await replyLine(replyToken,"⚠️ ยังบันทึกรายละเอียดเอกสารไม่ได้\nใช้รูปแบบ\nชื่อเอกสาร: ...\nประเภทเอกสาร: ...\nวันที่เอกสาร: ...\nช่วงรักษาเริ่ม: ...\nช่วงรักษาสิ้นสุด: ...\nวันที่ได้รับจริง: ...",token,[qpb("❌ ยกเลิก","ดูคำขอเวชระเบียน "+req)]);return true}
 }
 if(sk==="medical_record_request_fee_router"&&!nav){
  const x=treatmentTemplateMap(rawText),req=String(sd?.request_code||""),amount=moneyFromText(x["จำนวนเงิน"]||x["ยอดจ่าย"]||"");
  if(!Number.isFinite(amount)||amount<0){await replyLine(replyToken,"⚠️ ใส่จำนวนเงินเป็นตัวเลข เช่น 200 หรือ 200 บาท",token,[qpb("❌ ยกเลิก","ดูคำขอเวชระเบียน "+req)]);return true}
  try{
   await rpcOne(u,k,"phms_line_medical_record_request_set_fee",{
    p_line_user_id:uid,p_request_code:req,p_paid_amount:amount,
    p_payment_method_code:requestPaymentMethod(x["ช่องทางชำระ"]||x["ช่องทาง"]),
    p_payer:String(x["ผู้จ่าย"]||"").trim()||null,
    p_expense_date:treatmentDateValue(x["วันที่จ่าย"]),p_note:String(x["หมายเหตุ"]||"").trim()||null
   });
   await rpcRaw(u,k,"phms_clear_line_conversation_state",{p_line_user_id:uid});
   return await showRecordRequest(uid,replyToken,token,u,k,req,"✅ บันทึกค่าขอเวชระเบียนแล้ว • แยกจากค่ารักษาของนัด")
  }catch(err){console.error("record_request_fee",String(err));await replyLine(replyToken,"⚠️ ยังบันทึกค่าขอเอกสารไม่ได้ ตรวจช่องทางและจำนวนเงินแล้วส่งใหม่ได้เลย",token,[qpb("❌ ยกเลิก","ดูคำขอเวชระเบียน "+req)]);return true}
 }

 if(cmd==="เคสการรักษา"||cmd==="ประวัติการรักษา")return await showTreatmentEpisodes(uid,replyToken,token,u,k);
 let m=cmd.match(/^ดูเคสการรักษา\s+#?([0-9a-fA-F-]{8,36})$/);if(m)return await showTreatmentEpisode(uid,replyToken,token,u,k,m[1]);
 if(cmd==="สร้างเคสการรักษา"){
  await setFamilyFlowState(uid,"treatment_episode_create_router",{},u,k);
  await replyLine(replyToken,"➕ สร้างเคสการรักษา\n\nชื่อเคส:\nกลุ่มโรค/การรักษา:\nวันที่เริ่ม:\nวันที่สิ้นสุด: -\nสรุป:\n\nวันที่ใช้ได้ เช่น 2026-09-03, 3/9/69 หรือ 3 ก.ย. 69",token,[qpb("❌ ยกเลิก","เคสการรักษา")]);return true
 }
 m=cmd.match(/^เพิ่มเหตุการณ์รักษา\s+#?([0-9a-fA-F-]{8,36})$/);if(m){
  await setFamilyFlowState(uid,"treatment_event_create_router",{episode_code:m[1]},u,k);
  await replyLine(replyToken,"🩺 เพิ่มเหตุการณ์รักษา\n\nประเภท: outpatient / emergency / procedure / inpatient / discharge\nเหตุการณ์:\nโรงพยาบาล:\nวันที่เริ่ม:\nวันที่สิ้นสุด: -\nสรุป:\n\nตัวอย่างเหตุการณ์: เลเซอร์ต้อหิน, Admit, Discharge, ER",token,[qpb("❌ ยกเลิก","ดูเคสการรักษา "+m[1])]);return true
 }
 m=cmd.match(/^เลือกนัดเข้าเคส\s+#?([0-9a-fA-F-]{8,36})(?:\s+(\d+))?$/);if(m)return await showTreatmentAppointmentPicker(uid,replyToken,token,u,k,m[1],Number(m[2]||0));
 m=cmd.match(/^ผูกนัดเข้าเคส\s+#?([0-9a-fA-F-]{8,36})\s+#?([0-9a-fA-F-]{8,36})$/);if(m){
  try{await rpcOne(u,k,"phms_line_treatment_episode_link_appointment",{p_line_user_id:uid,p_episode_code:m[1],p_record_code:m[2]});return await showTreatmentEpisode(uid,replyToken,token,u,k,m[1],"✅ ผูกนัดเข้ากับเคสแล้ว")}
  catch(err){console.error("episode_link_appointment",String(err));await replyLine(replyToken,"⚠️ ยังผูกนัดเข้าเคสไม่ได้",token,[qpb("📅 เลือกใหม่","เลือกนัดเข้าเคส "+m[1]+" 0")]);return true}
 }
 m=cmd.match(/^ขอเวชระเบียน\s+#?([0-9a-fA-F-]{8,36})$/);if(m){
  await setFamilyFlowState(uid,"medical_record_request_create_router",{episode_code:m[1]},u,k);
  await replyLine(replyToken,"📥 บันทึกคำขอเวชระเบียน\n\nโรงพยาบาล:\nวันที่ไปขอ:\nช่องทาง: ไปขอที่โรงพยาบาล\nเอกสารที่ขอ:\n- เวชระเบียนผู้ป่วยนอก\n- Admission Record\n- Current Summary\n- Medical Summary\n- Discharge Summary\nหมายเหตุ:\n\nถ้ารู้ช่วงการรักษา ใส่ต่อท้ายได้ เช่น\n- Discharge Summary | discharge_summary | 3/9/69 | 5/9/69",token,[qpb("❌ ยกเลิก","ดูเคสการรักษา "+m[1])]);return true
 }
 m=cmd.match(/^ดูคำขอเวชระเบียน\s+#?([0-9a-fA-F-]{8,36})$/);if(m)return await showRecordRequest(uid,replyToken,token,u,k,m[1]);
 m=cmd.match(/^เพิ่มเอกสารคำขอ\s+#?([0-9a-fA-F-]{8,36})(?:\s+#?([0-9a-fA-F-]{8,36}))?$/);if(m)return await startRecordRequestAttachment(uid,replyToken,token,u,k,m[1],String(m[2]||""));
 m=cmd.match(/^เลือกไฟล์เดิมคำขอ\s+#?([0-9a-fA-F-]{8,36})\s+#?([0-9a-fA-F-]{8,36})(?:\s+(\d+))?$/);if(m)return await showRecordRequestExistingAssetPicker(uid,replyToken,token,u,k,m[1],m[2],Number(m[3]||0));
 m=cmd.match(/^ใช้ไฟล์เดิมคำขอ\s+#?([0-9a-fA-F-]{8,36})\s+#?([0-9a-fA-F-]{8,36})\s+([0-9a-fA-F-]{36})$/);if(m)return await beginRecordRequestExistingAssetMetadata(uid,replyToken,token,u,k,m[1],m[2],m[3]);
 m=cmd.match(/^ค่าขอเวชระเบียน\s+#?([0-9a-fA-F-]{8,36})$/);if(m){
  await setFamilyFlowState(uid,"medical_record_request_fee_router",{request_code:m[1]},u,k);
  await replyLine(replyToken,"💰 ค่าขอ/คัดเวชระเบียน\n\nจำนวนเงิน:\nช่องทางชำระ: เงินสด / PromptPay QR / โอน / บัตร\nผู้จ่าย:\nวันที่จ่าย:\nหมายเหตุ:\n\nถ้าฟรี ใส่ จำนวนเงิน: 0",token,[qpb("❌ ยกเลิก","ดูคำขอเวชระเบียน "+m[1])]);return true
 }
 return false
}

async function routeAppointmentPreparation(cmd:string,rawText:string,uid:string,replyToken:string,token:string,u:string,k:string){
 const st=await getFamilyFlowState(uid,u,k);
 const sk=String(st?.state_key||""),sd=st?.state_data||{};
 if(sk==="appointment_task_edit_router"){
  const backCode=String(sd?.appointment_code||"");
  if(cmd==="ยกเลิกแก้รายการเตรียม"){
   await rpcRaw(u,k,"phms_clear_line_conversation_state",{p_line_user_id:uid});
   return await showAppointmentPreparationTasks(uid,replyToken,token,u,k,backCode,0)
  }
  if(!/^(?:สิ่งที่ต้องทำก่อนนัด|ดูนัด|นัดหมาย|ครอบครัว|หน้าเริ่มต้น)/.test(cmd)){
   const x=parsePrepTaskEdit(rawText);
   if(x.title===undefined&&x.instruction===undefined&&x.note===undefined){
    await replyLine(replyToken,"⚠️ ยังอ่านข้อมูลที่แก้ไม่ได้\n\nใช้รูปแบบ\nรายการ: ...\nรายละเอียด: ...\nหมายเหตุ: ...",token,[qpb("❌ ยกเลิก","ยกเลิกแก้รายการเตรียม")]);
    return true
   }
   try{
    const rr=await rpcOne(u,k,"phms_line_appointment_manage_task",{
     p_line_user_id:uid,p_task_code:String(sd?.task_code||""),
     p_status:null,
     p_title:x.title===undefined?null:x.title,
     p_instruction:x.instruction===undefined?null:x.instruction,
     p_note:x.note===undefined?null:x.note
    });
    await rpcRaw(u,k,"phms_clear_line_conversation_state",{p_line_user_id:uid});
    return await showAppointmentPreparationTasks(uid,replyToken,token,u,k,String(rr?.appointment_code||backCode),0,"✅ แก้รายการเตรียมแล้ว")
   }catch(err){
    console.error("appointment_task_edit_router",String(err));
    await replyLine(replyToken,"⚠️ ยังแก้รายการเตรียมไม่ได้ ข้อมูลเดิมยังอยู่",token,[qpb("❌ ยกเลิก","ยกเลิกแก้รายการเตรียม")]);
    return true
   }
  }
 }

 let evm=cmd.match(/^หลักฐานรายการเตรียม\s+#?([0-9a-fA-F-]{8,36})$/);
 if(evm)return await showTaskEvidenceMenu(uid,replyToken,token,u,k,evm[1]);

 evm=cmd.match(/^เลือกหลักฐานนัดนี้\s+#?([0-9a-fA-F-]{8,36})(?:\s+(\d+))?$/);
 if(evm)return await showTaskCurrentEvidencePicker(uid,replyToken,token,u,k,evm[1],Number(evm[2]||0));

 evm=cmd.match(/^เลือกหลักฐานเดิม\s+#?([0-9a-fA-F-]{8,36})(?:\s+(\d+))?$/);
 if(evm)return await showTaskOldEvidencePicker(uid,replyToken,token,u,k,evm[1],Number(evm[2]||0));

 evm=cmd.match(/^ผูกหลักฐานรายการ\s+#?([0-9a-fA-F-]{8,36})\s+([0-9a-fA-F-]{36})$/);
 if(evm){
  try{
   const rr=await rpcOne(u,k,"phms_line_appointment_attach_task_evidence",{p_line_user_id:uid,p_task_code:evm[1],p_link_id:evm[2],p_note:null});
   await rpcRaw(u,k,"phms_clear_line_conversation_state",{p_line_user_id:uid});
   return await showAppointmentPreparationTasks(uid,replyToken,token,u,k,String(rr?.appointment_code||""),0,"✅ เพิ่มเอกสารเป็นหลักฐานของรายการนี้แล้ว")
  }catch(err){
   console.error("appointment_task_evidence_link",String(err));
   await replyLine(replyToken,"⚠️ ยังผูกเอกสารนี้กับรายการเตรียมไม่ได้",token,[qpb("📎 เลือกใหม่","หลักฐานรายการเตรียม "+evm[1])]);return true
  }
 }

 evm=cmd.match(/^ใช้ไฟล์เป็นหลักฐาน\s+#?([0-9a-fA-F-]{8,36})\s+([0-9a-fA-F-]{36})$/);
 if(evm){
  try{
   const rr=await rpcOne(u,k,"phms_line_appointment_attach_task_asset",{p_line_user_id:uid,p_task_code:evm[1],p_storage_asset_id:evm[2],p_note:null});
   await rpcRaw(u,k,"phms_clear_line_conversation_state",{p_line_user_id:uid});
   return await showAppointmentPreparationTasks(uid,replyToken,token,u,k,String(rr?.appointment_code||""),0,"✅ ใช้รูป/เอกสารเดิมเป็นหลักฐานของรายการนี้แล้ว")
  }catch(err){
   console.error("appointment_task_asset_evidence",String(err));
   await replyLine(replyToken,"⚠️ ยังใช้ไฟล์นี้เป็นหลักฐานไม่ได้",token,[qpb("📚 เลือกใหม่","เลือกหลักฐานเดิม "+evm[1]+" 0")]);return true
  }
 }

 let m=cmd.match(/^สิ่งที่ต้องทำก่อนนัด\s+#?([0-9a-fA-F-]{8,36})(?:\s+(\d+))?$/);
 if(m)return await showAppointmentPreparationTasks(uid,replyToken,token,u,k,m[1],Number(m[2]||0));

 m=cmd.match(/^เลือกเอกสารเตรียม\s+#?([0-9a-fA-F-]{8,36})(?:\s+(\d+))?$/);
 if(m)return await showPreparationDocumentPicker(uid,replyToken,token,u,k,m[1],Number(m[2]||0));

 m=cmd.match(/^ตั้งเอกสารเตรียม\s+#?([0-9a-fA-F-]{8,36})\s+([0-9a-fA-F-]{36})$/);
 if(m){
  try{
   await rpcOne(u,k,"phms_line_appointment_set_document_preparation",{p_line_user_id:uid,p_record_code:m[1],p_link_id:m[2]});
   return await showAppointmentPreparationTasks(uid,replyToken,token,u,k,m[1],0,"✅ เพิ่มเอกสารเข้า checklist เตรียมก่อนนัดแล้ว")
  }catch(err){
   console.error("appointment_document_preparation",String(err));
   await replyLine(replyToken,"⚠️ ยังตั้งเอกสารนี้เป็นรายการเตรียมก่อนนัดไม่ได้",token,[qpb("📎 เลือกใหม่","เลือกเอกสารเตรียม "+m[1]+" 0")]);
   return true
  }
 }

 m=cmd.match(/^(?:ตั้งสถานะงานเตรียม|ทำแล้ว|ข้าม)\s+#?([0-9a-fA-F-]{8,36})(?:\s+(pending|completed|skipped))?$/);
 if(m){
  let status=String(m[2]||"");
  if(!status)status=cmd.startsWith("ข้าม")?"skipped":"completed";
  try{
   const rr=await rpcOne(u,k,"phms_line_appointment_manage_task",{
    p_line_user_id:uid,p_task_code:m[1],p_status:status,
    p_title:null,p_instruction:null,p_note:null
   });
   const prefix=status==="completed"?"✅ ทำรายการนี้เสร็จแล้ว":status==="skipped"?"↪️ ข้ามรายการนี้แล้ว":"⬜ เปลี่ยนกลับเป็นยังไม่เสร็จแล้ว";
   return await showAppointmentPreparationTasks(uid,replyToken,token,u,k,String(rr?.appointment_code||""),0,prefix)
  }catch(err){
   console.error("appointment_task_status_router",String(err));
   await replyLine(replyToken,"⚠️ ยังอัปเดตสถานะรายการนี้ไม่ได้",token);
   return true
  }
 }

 m=cmd.match(/^แก้รายการเตรียม\s+#?([0-9a-fA-F-]{8,36})$/);
 if(m){
  try{
   const code=String(m[1]);
   const lookup=await rpcOne(u,k,"phms_line_appointment_get_task",{p_line_user_id:uid,p_task_code:code});
   const task=lookup?.task||lookup;
   const appointmentCode=String(lookup?.appointment_code||"")
   await setFamilyFlowState(uid,"appointment_task_edit_router",{task_code:code,appointment_code:appointmentCode,title:task?.title||"",instruction:task?.instruction||"",note:task?.note||""},u,k);
   await replyLine(replyToken,"✏️ แก้รายการเตรียมก่อนนัด\n\n"+prepTaskEditTemplate(task)+"\n\nแก้ค่าหลัง : แล้วส่งกลับมา\nใช้ “-” เพื่อลบรายละเอียดหรือหมายเหตุ",token,[qpb("❌ ยกเลิก","ยกเลิกแก้รายการเตรียม")]);
   return true
  }catch(err){
   console.error("appointment_task_edit_open_router",String(err));
   await replyLine(replyToken,"⚠️ ยังเปิดรายการนี้เพื่อแก้ไม่ได้",token);
   return true
  }
 }
 return false
}


function appointmentLinkDateTime(v:any){
 if(!v)return "—";
 try{
  return new Intl.DateTimeFormat("th-TH",{
   timeZone:"Asia/Bangkok",day:"numeric",month:"short",year:"numeric",
   hour:"2-digit",minute:"2-digit",hour12:false
  }).format(new Date(v)).replace("24:","00:")
 }catch{return String(v)}
}
function appointmentLinkStatus(v:any){
 return ({
  scheduled:"กำลังมา",confirmed:"ยืนยันแล้ว",arrived:"ถึงแล้ว",
  completed:"เสร็จแล้ว",cancelled:"ยกเลิก",no_show:"ไม่ได้ไป"
 } as any)[String(v||"")]||String(v||"—")
}
async function showAppointmentLinkManager(uid:string,replyToken:string,token:string,u:string,k:string,recordCode:string,offset=0,prefix=""){
 const out=await rpcOne(u,k,"phms_line_appointment_link_candidates",{
  p_line_user_id:uid,p_record_code:recordCode,p_limit:8,p_offset:Math.max(0,Number(offset)||0)
 });
 const cur=out?.current||{},items=Array.isArray(out?.items)?out.items:[];
 const code=String(out?.record_code||recordCode),total=Number(out?.total_count||0),off=Number(out?.offset||0),limit=Number(out?.limit||8);
 const cards:any[]=[{type:"bubble",size:"kilo",
  header:{type:"box",layout:"vertical",backgroundColor:"#F4F1FA",paddingAll:"18px",contents:[
   {type:"text",text:"🔗 เชื่อมนัด",weight:"bold",size:"xl",color:"#57456E"},
   {type:"text",text:String(out?.person_name||"บุคคล"),size:"sm",weight:"bold",margin:"sm",wrap:true}
  ]},
  body:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"16px",contents:[
   ...(prefix?[{type:"text",text:prefix,size:"sm",weight:"bold",color:"#285943",wrap:true},{type:"separator",margin:"md"}]:[]),
   {type:"text",text:"นัดที่กำลังจัดการ",size:"xs",color:"#667085",weight:"bold"},
   {type:"text",text:appointmentLinkDateTime(cur?.appointment_at)+" • "+String(cur?.title||"นัดหมาย"),size:"sm",weight:"bold",wrap:true},
   ...(cur?.hospital_name?[{type:"text",text:"🏥 "+String(cur.hospital_name),size:"sm",wrap:true}]:[]),
   {type:"separator",margin:"md"},
   {type:"text",text:"เลือกนัดอีกอันเพื่อเชื่อมเข้าชุดเดียวกัน • ถ้านัดนั้นเชื่อมกับนัดอื่นอยู่ อิ่มอุ่นจะรวมทั้งชุดให้อัตโนมัติ",size:"sm",wrap:true},
   {type:"text",text:"รายการเรียงจากเก่า → ใหม่ • ทั้งหมด "+String(total)+" นัด",size:"xs",color:"#667085",wrap:true}
  ]},
  footer:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"12px",contents:[
   ...(off>0?[{type:"button",action:{type:"postback",label:"⬅️ ก่อนหน้า",data:"เชื่อมนัด "+code+" "+String(Math.max(0,off-limit))}}]:[]),
   ...(off+items.length<total?[{type:"button",action:{type:"postback",label:"➡️ ถัดไป",data:"เชื่อมนัด "+code+" "+String(off+limit)}}]:[]),
   {type:"button",action:{type:"postback",label:"↩️ รายละเอียดนัด",data:"ดูนัด "+code}}
  ]}
 }];
 for(const x of items){
  const rel=String(x?.relation_to_current||"unlinked");
  const direct=rel==="previous"||rel==="next";
  const indirect=rel==="connected_previous"||rel==="connected_next"||rel==="connected";
  const connected=direct||indirect;
  const xCode=String(x?.record_code||"");
  const xAt=new Date(String(x?.appointment_at||0)).getTime();
  const curAt=new Date(String(cur?.appointment_at||0)).getTime();
  const currentPrev=String(cur?.followup_of_record_code||"");
  const candidatePrev=String(x?.linked_previous_code||"");
  const replacing=false;
  const relText=rel==="previous"?"⬅️ เชื่อมตรงเป็นนัดก่อนหน้า":
    rel==="next"?"➡️ เชื่อมตรงเป็นนัดถัดไป":
    rel==="connected_previous"?"🔗 เชื่อมอยู่ในชุดเดียวกัน • นัดก่อนหน้า":
    rel==="connected_next"?"🔗 เชื่อมอยู่ในชุดเดียวกัน • นัดถัดไป":
    rel==="connected"?"🔗 เชื่อมอยู่ในชุดเดียวกัน":
    "ยังไม่เชื่อมกับชุดนัดนี้";
  const footer:any[]=[];
  if(direct){
   footer.push({type:"button",style:"secondary",action:{type:"postback",label:"✂️ ยกเลิกเส้นเชื่อม",data:"ยกเลิกเชื่อมนัด "+code+" "+xCode}});
  }else if(!indirect){
   footer.push({type:"button",style:"primary",action:{type:"postback",label:"🔗 เชื่อมเข้าชุดนี้",data:"เชื่อมนัดคู่ "+code+" "+xCode}});
  }
  footer.push({type:"button",action:{type:"postback",label:"📅 ดูนัดนี้",data:"ดูนัด "+xCode}});
  cards.push({type:"bubble",size:"kilo",
   header:{type:"box",layout:"vertical",backgroundColor:connected?"#EEF8F3":"#F7F9FC",paddingAll:"16px",contents:[
    {type:"text",text:appointmentLinkDateTime(x?.appointment_at),size:"xs",color:"#667085",weight:"bold"},
    {type:"text",text:String(x?.title||"นัดหมาย"),weight:"bold",size:"lg",wrap:true,margin:"sm"}
   ]},
   body:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"16px",contents:[
    ...(x?.hospital_name?[{type:"text",text:"🏥 "+String(x.hospital_name),size:"sm",wrap:true}]:[]),
    ...(x?.department?[{type:"text",text:"🏢 "+String(x.department),size:"sm",wrap:true}]:[]),
    {type:"text",text:"สถานะ: "+appointmentLinkStatus(x?.status),size:"xs",color:"#667085",wrap:true},
    {type:"separator",margin:"md"},
    {type:"text",text:relText,size:"sm",weight:"bold",color:connected?"#285943":"#555555",wrap:true},
    ...(replacing?[{type:"text",text:"การกดเชื่อมจะเปลี่ยนนัดก่อนหน้าของนัดที่อยู่ทีหลังมาเป็นคู่นี้",size:"xs",color:"#805B18",wrap:true}]:[])
   ]},
   footer:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"12px",contents:footer}
  })
 }
 if(!items.length){
  cards.push({type:"bubble",size:"kilo",body:{type:"box",layout:"vertical",paddingAll:"18px",contents:[
   {type:"text",text:"ยังไม่มีนัดอื่นของบุคคลนี้ให้เชื่อม",weight:"bold",size:"md",wrap:true},
   {type:"text",text:"สร้างนัดอีกครั้งก่อน แล้วกลับมาเชื่อมทีหลังก็ได้",size:"sm",color:"#667085",wrap:true,margin:"md"}
  ]}})
 }
 await replyMessages(replyToken,token,[{type:"flex",altText:"🔗 เชื่อมนัดที่มีอยู่",contents:{type:"carousel",contents:cards.slice(0,10)}}]);
 return true
}

async function showAppointmentPreviousChain(uid:string,replyToken:string,token:string,u:string,k:string,recordCode:string,page=0){
 const out=await rpcOne(u,k,"phms_line_appointment_chain",{p_line_user_id:uid,p_record_code:recordCode,p_limit:100});
 const items=Array.isArray(out?.previous_appointments)?out.previous_appointments:[];
 const code=String(out?.record_code||recordCode),pageSize=7;
 const totalPages=Math.max(1,Math.ceil(items.length/pageSize));
 const pg=Math.max(0,Math.min(Number(page)||0,totalPages-1));
 const shown=items.slice(pg*pageSize,pg*pageSize+pageSize);

 if(!items.length){
  await replyLine(replyToken,"⬅️ นัดนี้ยังไม่มีนัดก่อนหน้าที่เชื่อมไว้",token,[
   qpb("🔗 เชื่อมนัด","เชื่อมนัด "+code+" 0"),
   qpb("📅 กลับรายละเอียดนัด","ดูนัด "+code)
  ]);
  return true
 }

 const cards:any[]=[{type:"bubble",size:"kilo",
  header:{type:"box",layout:"vertical",backgroundColor:"#F4F1FA",paddingAll:"18px",contents:[
   {type:"text",text:"⬅️ นัดก่อนหน้าทั้งหมด",weight:"bold",size:"xl",color:"#57456E"},
   {type:"text",text:String(out?.person_name||"บุคคล")+" • "+String(items.length)+" ครั้ง",size:"sm",color:"#6D5A82",margin:"sm",wrap:true}
  ]},
  body:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"16px",contents:[
   {type:"text",text:"เรียงจากเก่าสุด → ล่าสุดก่อนนัดปัจจุบัน",size:"sm",wrap:true},
   ...(totalPages>1?[{type:"text",text:"หน้า "+String(pg+1)+"/"+String(totalPages),size:"xs",color:"#777777"}]:[])
  ]},
  footer:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"12px",contents:[
   ...(pg>0?[{type:"button",action:{type:"postback",label:"⬅️ ก่อนหน้า",data:"นัดก่อนหน้าทั้งหมด "+code+" "+String(pg-1)}}]:[]),
   ...(pg<totalPages-1?[{type:"button",action:{type:"postback",label:"➡️ ถัดไป",data:"นัดก่อนหน้าทั้งหมด "+code+" "+String(pg+1)}}]:[]),
   {type:"button",style:"secondary",action:{type:"postback",label:"🔗 จัดการการเชื่อม",data:"เชื่อมนัด "+code+" 0"}},
   {type:"button",action:{type:"postback",label:"↩️ รายละเอียดนัด",data:"ดูนัด "+code}}
  ]}
 }];

 for(let i=0;i<shown.length;i++){
  const x=shown[i]||{};
  const absoluteIndex=pg*pageSize+i+1;
  const body:any[]=[
   {type:"text",text:appointmentLinkDateTime(x?.appointment_at),size:"sm",weight:"bold",wrap:true},
   ...(x?.hospital_name?[{type:"text",text:"🏥 "+String(x.hospital_name),size:"sm",wrap:true}]:[]),
   ...(x?.department?[{type:"text",text:"🏢 "+String(x.department),size:"sm",wrap:true}]:[]),
   ...(x?.doctor_name?[{type:"text",text:"👨‍⚕️ "+String(x.doctor_name),size:"sm",wrap:true}]:[]),
   {type:"text",text:"สถานะ: "+appointmentLinkStatus(x?.status),size:"xs",color:"#667085",wrap:true}
  ];
  if(x?.diagnosis_summary||x?.treatment_summary||x?.next_steps){
   body.push({type:"separator",margin:"md"});
   if(x?.diagnosis_summary)body.push({type:"text",text:"🔎 "+String(x.diagnosis_summary),size:"xs",wrap:true,color:"#555555"});
   if(x?.treatment_summary)body.push({type:"text",text:"🩹 "+String(x.treatment_summary),size:"xs",wrap:true,color:"#555555"});
   if(x?.next_steps)body.push({type:"text",text:"➡️ "+String(x.next_steps),size:"xs",wrap:true,color:"#555555"});
  }
  cards.push({type:"bubble",size:"kilo",
   header:{type:"box",layout:"vertical",backgroundColor:"#FAF8FC",paddingAll:"16px",contents:[
    {type:"text",text:"ครั้งที่ "+String(absoluteIndex),size:"xs",color:"#6D5A82",weight:"bold"},
    {type:"text",text:String(x?.title||"นัดหมาย"),weight:"bold",size:"lg",wrap:true,margin:"sm"}
   ]},
   body:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"16px",contents:body},
   footer:{type:"box",layout:"vertical",paddingAll:"12px",contents:[
    {type:"button",style:"secondary",action:{type:"postback",label:"📅 เปิดนัดนี้",data:"ดูนัด "+String(x?.record_code||"")}}
   ]}
  })
 }
 await replyMessages(replyToken,token,[{type:"flex",altText:"⬅️ นัดก่อนหน้าทั้งหมด "+String(items.length)+" ครั้ง",contents:{type:"carousel",contents:cards.slice(0,10)}}]);
 return true
}
async function routeAppointmentPreviousChain(cmd:string,uid:string,replyToken:string,token:string,u:string,k:string){
 const m=cmd.match(/^นัดก่อนหน้าทั้งหมด\s+#?([0-9a-fA-F-]{8,36})(?:\s+(\d+))?$/);
 if(!m)return false;
 try{
  return await showAppointmentPreviousChain(uid,replyToken,token,u,k,m[1],Number(m[2]||0))
 }catch(err){
  console.error("appointment_previous_chain",String(err));
  await replyLine(replyToken,"⚠️ ยังเปิดรายการนัดก่อนหน้าทั้งหมดไม่ได้",token,[qpb("📅 กลับนัด","ดูนัด "+m[1])]);
  return true
 }
}

async function routeAppointmentLinkManager(cmd:string,uid:string,replyToken:string,token:string,u:string,k:string){
 let m=cmd.match(/^เชื่อมนัด\s+#?([0-9a-fA-F-]{8,36})(?:\s+(\d+))?$/);
 if(m){
  try{return await showAppointmentLinkManager(uid,replyToken,token,u,k,m[1],Number(m[2]||0))}
  catch(err){
   console.error("appointment_link_manager",String(err));
   await replyLine(replyToken,"⚠️ ยังเปิดรายการนัดสำหรับเชื่อมไม่ได้",token,[qpb("📅 กลับนัด","ดูนัด "+m[1])]);
   return true
  }
 }
 m=cmd.match(/^เชื่อมนัดคู่\s+#?([0-9a-fA-F-]{8,36})\s+#?([0-9a-fA-F-]{8,36})$/);
 if(m){
  try{
   const rr=await rpcOne(u,k,"phms_line_appointment_link_pair_auto",{
    p_line_user_id:uid,p_record_code_a:m[1],p_record_code_b:m[2]
   });
   const groupSize=Number(rr?.group_size||0);
   const prefix=rr?.already_connected
    ?"✅ นัดสองรายการนี้อยู่ในชุดเดียวกันอยู่แล้ว"
    :"✅ เชื่อมนัดแล้ว • นัดที่เชื่อมต่อกันอยู่ถูกรวมเป็นชุดเดียวกันอัตโนมัติ"+(groupSize>1?" • รวม "+String(groupSize)+" นัด":"");
   return await showAppointmentLinkManager(uid,replyToken,token,u,k,m[1],0,prefix)
  }catch(err){
   const msg=String(err);
   const why=msg.includes("person_mismatch")?"สองนัดนี้เป็นคนละคน จึงเชื่อมกันไม่ได้":
    msg.includes("same_time")?"สองนัดมีวันเวลาเดียวกัน กรุณาแก้เวลาให้แยกกันก่อน":
    msg.includes("inactive")?"นัดที่ยกเลิกหรือไม่ได้ไปจะไม่ใช้เป็นนัดต่อเนื่อง":
    "ยังเชื่อมสองนัดนี้ไม่ได้";
   await replyLine(replyToken,"⚠️ "+why,token,[qpb("🔗 เลือกใหม่","เชื่อมนัด "+m[1]+" 0"),qpb("📅 กลับนัด","ดูนัด "+m[1])]);
   return true
  }
 }
 m=cmd.match(/^ยกเลิกเชื่อมนัด\s+#?([0-9a-fA-F-]{8,36})\s+#?([0-9a-fA-F-]{8,36})$/);
 if(m){
  try{
   const rr=await rpcOne(u,k,"phms_line_appointment_unlink_pair",{
    p_line_user_id:uid,p_record_code_a:m[1],p_record_code_b:m[2]
   });
   const prefix=rr?.still_connected
    ?"✅ ยกเลิกเส้นเชื่อมคู่นี้แล้ว • แต่ยังอยู่ในชุดเดียวกันผ่านนัดอื่น"
    :"✅ ยกเลิกเส้นเชื่อมคู่นี้แล้ว";
   return await showAppointmentLinkManager(uid,replyToken,token,u,k,m[1],0,prefix)
  }catch(err){
   console.error("appointment_unlink_pair",String(err));
   await replyLine(replyToken,"⚠️ ยกเลิกการเชื่อมไม่ได้ หรือสองนัดนี้ไม่ได้เชื่อมกันโดยตรง",token,[qpb("🔗 กลับจัดการ","เชื่อมนัด "+m[1]+" 0")]);
   return true
  }
 }
 return false
}

async function routeAppointmentAssigneePicker(cmd:string,uid:string,replyToken:string,token:string,u:string,k:string){
 const m=cmd.match(/^เพิ่มผู้รับผิดชอบนัด\s+#?([0-9a-fA-F-]{8,36})(?:\s+(\d+))?$/);
 if(!m)return false;
 const out=await rpcOne(u,k,"phms_list_line_appointment_assignee_options",{p_line_user_id:uid,p_record_code:m[1]});
 const items=Array.isArray(out?.items)?out.items:[];
 const code=String(out?.record_code||m[1]),pageSize=8;
 const total=Math.max(1,Math.ceil(items.length/pageSize));
 const pg=Math.max(0,Math.min(Number(m[2]||0),total-1));
 const page=items.slice(pg*pageSize,pg*pageSize+pageSize);
 if(!page.length){
  await replyLine(replyToken,
   "👥 ยังไม่มีบัญชีสมาชิก active ในครอบครัวให้มอบหมาย\n\nบุคคลที่ยังไม่ได้เชื่อมเป็นบัญชีสมาชิก/LINE จะยังรับหน้าที่และการแจ้งเตือนไม่ได้",
   token,[qpb("↩️ กลับผู้รับผิดชอบ","ผู้รับผิดชอบนัด "+code)]
  );
  return true
 }
 const lines=page.map((x:any,i:number)=>{
  const access=x?.has_appointment_view===true?"ดูนัดได้อยู่แล้ว":"มอบหมายเฉพาะนัดนี้";
  const line=x?.line_ready===true?"":" • ยังไม่เชื่อม LINE";
  return String(pg*pageSize+i+1)+". "+String(x?.display_name||"สมาชิก")+" • "+access+line
 }).join("\n");
 const q:any[]=page.map((x:any)=>qpb(
  ("👤 "+String(x?.display_name||"สมาชิก")).slice(0,20),
  "เลือกผู้รับผิดชอบนัด "+code+" "+String(x?.selection_code||"")
 ));
 if(pg>0)q.push(qpb("⬅️ ก่อนหน้า","เพิ่มผู้รับผิดชอบนัด "+code+" "+String(pg-1)));
 if(pg<total-1)q.push(qpb("➡️ ถัดไป","เพิ่มผู้รับผิดชอบนัด "+code+" "+String(pg+1)));
 q.push(qpb("❌ ยกเลิก","ผู้รับผิดชอบนัด "+code));
 await replyLine(replyToken,
  "➕ มอบหมายหน้าที่วันนัด\n\nเลือกได้ทุกบัญชีสมาชิกในครอบครัว ไม่จำเป็นต้องเป็นคนดูแล\n"+
  "• คนที่มีสิทธิ์ดูนัดอยู่แล้ว ใช้สิทธิ์เดิม\n"+
  "• คนที่ยังไม่มีสิทธิ์ดูนัด จะถูกมอบหมายเฉพาะหน้าที่ของนัดนี้ ไม่ได้สิทธิ์ดูประวัตินัดทั้งหมด\n\n"+
  lines+"\n\nเลือกชื่อก่อน แล้วค่อยเลือกหน้าที่ เช่น 🚗 พาไป • 🤝 ไปด้วย • ☎️ ประสานงาน",
  token,q.slice(0,13)
 );
 return true
}

async function routeSavedFinance(cmd:string,uid:string,replyToken:string,token:string,u:string,k:string){
 const m=cmd.match(/^ค่าใช้จ่ายนัด\s+#?([0-9a-fA-F-]{8,36})$/);
 if(!m)return false;
 try{return await showSavedFinanceCards(replyToken,token,uid,u,k,m[1])}
 catch(err){console.error("router_saved_finance",String(err));return false}
}

async function showFinanceReview(replyToken:string,token:string,recordCode:string,parsed:any,ctx:any){
 const rows:any[]=[
  {type:"text",text:"💵 ยอดจ่ายจริง: "+financeReviewMoney(parsed?.paid_amount),size:"md",weight:"bold",wrap:true},
  {type:"text",text:"🪪 การใช้สิทธิ: "+(parsed?.coverage_used?"ใช้สิทธิ • "+String(parsed?.coverage_type||"—"):"จ่ายเอง"),size:"sm",wrap:true},
  ...(parsed?.covered_amount!==null&&parsed?.covered_amount!==undefined?[{type:"text",text:"🏥 สิทธิ/ประกันออกให้: "+financeReviewMoney(parsed.covered_amount),size:"sm",wrap:true}]:[]),
  ...(Number(parsed?.paid_amount||0)>0?[
   {type:"text",text:"💳 ช่องทาง: "+financeReviewMethod(ctx?.payment_method_code),size:"sm",wrap:true},
   {type:"text",text:"👤 ผู้จ่าย: "+String(ctx?.payer_name||"—"),size:"sm",wrap:true}
  ]:[]),
  {type:"separator",margin:"md"},
  {type:"text",text:"🧾 รายละเอียดค่าใช้จ่าย",size:"sm",weight:"bold",wrap:true},
  ...(Array.isArray(parsed?.items)&&parsed.items.length
   ?parsed.items.slice(0,8).map((x:any)=>({type:"text",text:"• "+String(x?.label||"รายการ")+" — "+financeReviewMoney(x?.amount)+(x?.cgd_category_code?" • CGD "+String(x.cgd_category_code):""),size:"sm",wrap:true}))
   :[{type:"text",text:"ไม่ได้แจกแจงรายการย่อย",size:"sm",color:"#777777",wrap:true}]),
  ...(Array.isArray(parsed?.items)&&parsed.items.length?[
   {type:"text",text:"Σ รวมรายการย่อย: "+financeReviewMoney(parsed?.breakdown_total),size:"sm",weight:"bold",wrap:true},
   {type:"text",text:"✅ ผลตรวจยอด: ตรงกับยอดจ่ายจริง",size:"sm",weight:"bold",color:"#285943",wrap:true}
  ]:[]),
  ...(parsed?.notes?[{type:"text",text:"📝 หมายเหตุ: "+String(parsed.notes),size:"sm",wrap:true}]:[])
 ];
 const flex:any={type:"flex",altText:"💰 ตรวจรายละเอียดค่ารักษาก่อนบันทึก",contents:{type:"bubble",size:"kilo",
  header:{type:"box",layout:"vertical",backgroundColor:"#FFF7E8",paddingAll:"18px",contents:[
   {type:"text",text:"💰 ตรวจรายละเอียดค่ารักษา",weight:"bold",size:"xl",color:"#805B18"},
   {type:"text",text:"ยังไม่บันทึก • ตรวจข้อมูลก่อนยืนยัน",size:"xs",color:"#7A6A4F",margin:"sm",wrap:true}
  ]},
  body:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"16px",contents:rows},
  footer:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"12px",contents:[
   {type:"button",style:"primary",action:{type:"postback",label:"✅ ยืนยันบันทึก",data:"ยืนยันค่าใช้จ่าย "+recordCode}},
   {type:"button",style:"secondary",action:{type:"postback",label:"✏️ แก้รายละเอียด",data:"แก้ค่าใช้จ่ายก่อนบันทึก "+recordCode}},
   {type:"button",action:{type:"postback",label:"❌ ยกเลิก",data:"ดูนัด "+recordCode}}
  ]}
 }};
 await replyMessages(replyToken,token,[flex])
}
async function routeAppointmentFinanceReview(cmd:string,rawText:string,uid:string,replyToken:string,token:string,u:string,k:string){
 const st=await getFamilyFlowState(uid,u,k);
 const key=String(st?.state_key||""),data=st?.state_data||{};
 const confirm=cmd.match(/^ยืนยันค่าใช้จ่าย\s+#?([0-9a-fA-F-]{8,36})$/);
 if(confirm){
  if(key!=="appointment_finance_review"||String(data?.record_code||"")!==String(confirm[1]))return false;
  const parsed=data?.parsed||{},ctx=data?.ctx||{};
  const rr=await rpcOne(u,k,"phms_line_appointment_finance_upsert",{
   p_line_user_id:uid,p_record_code:confirm[1],
   p_paid_amount:parsed.paid_amount,p_coverage_used:parsed.coverage_used,p_coverage_type:parsed.coverage_type,
   p_covered_amount:parsed.covered_amount,p_payment_method:null,p_payer:null,p_notes:parsed.notes,p_items:parsed.items,
   p_payment_method_code:ctx?.payment_method_code||null,p_payer_user_id:ctx?.payer_user_id||null,
   p_payer_family_person_id:ctx?.payer_family_person_id||null
  });
  await rpcOne(u,k,"phms_clear_line_conversation_state",{p_line_user_id:uid});
  await showSavedFinanceCards(replyToken,token,uid,u,k,String(rr?.record_code||confirm[1]),"✅ บันทึกค่ารักษาแล้ว");
  return true
 }
 const edit=cmd.match(/^แก้ค่าใช้จ่ายก่อนบันทึก\s+#?([0-9a-fA-F-]{8,36})$/);
 if(edit){
  if(key!=="appointment_finance_review"||String(data?.record_code||"")!==String(edit[1]))return false;
  const ctx=data?.ctx||{};
  await setFamilyFlowState(uid,"appointment_post_visit_finance_input",{...ctx,record_code:edit[1]},u,k);
  await replyLine(replyToken,"✏️ แก้รายละเอียดค่ารักษา\n\nแก้ค่าที่ต้องการจากข้อความเดิม แล้วส่งกลับมาใหม่\n\n"+String(data?.raw_text||""),token,[qpb("❌ ยกเลิก","ดูนัด "+edit[1])]);
  return true
 }
 if(key==="appointment_finance_review"){
  await showFinanceReview(replyToken,token,String(data?.record_code||""),data?.parsed||{},data?.ctx||{});
  return true
 }
 if(key!=="appointment_post_visit_finance_input")return false;
 if(/^(?:เปลี่ยนการชำระเงิน|เปลี่ยนผู้จ่ายค่าใช้จ่าย|ค่าใช้จ่ายนัด|ดูนัด|นัดหมาย|ยกเลิก)/.test(cmd))return false;
 const recordCode=String(data?.record_code||"");if(!recordCode)return false;
 try{
  const parsed=financeReviewParse(rawText,String(data?.coverage_type||""));
  if(financeReviewHasBreakdownIntent(rawText)&&parsed.items.length===0){
   await replyLine(replyToken,
    "⚠️ พบว่าคุณกรอกรายการค่าใช้จ่ายย่อย แต่อิ่มอุ่นยังแยกรายการออกมาไม่ได้\n\nยังไม่บันทึกยอดรวม เพื่อป้องกันรายละเอียดที่กรอกหาย\n\nใช้ได้ทั้ง\n• ค่ายา: 320\n• ค่าตรวจเลือด: 450\nหรือ\nรายละเอียดค่าใช้จ่าย:\n- ค่ายา 320\n- ค่าตรวจเลือด 450",
    token,[qpb("❌ ยกเลิก","ดูนัด "+recordCode)]
   );return true
  }
  if(parsed.items.length&&Math.abs(Number(parsed.breakdown_difference||0))>=0.01){
   await replyLine(replyToken,
    "⚠️ ยอดรายการย่อยยังไม่ตรงกับยอดจ่ายจริง\n\nยอดจ่ายจริง: "+financeReviewMoney(parsed.paid_amount)+"\nรวมรายการย่อย: "+financeReviewMoney(parsed.breakdown_total)+"\nส่วนต่าง: "+financeReviewMoney(Math.abs(parsed.breakdown_difference))+"\n\nแก้ตัวเลขให้ตรงกันแล้วส่งอีกครั้ง",
    token,[qpb("❌ ยกเลิก","ดูนัด "+recordCode)]
   );return true
  }
  if(parsed.paid_amount>0&&(!data?.payment_method_code||(!data?.payer_user_id&&!data?.payer_family_person_id)))return false;
  const ctx={...data};
  await setFamilyFlowState(uid,"appointment_finance_review",{record_code:recordCode,parsed,ctx,raw_text:rawText},u,k);
  await showFinanceReview(replyToken,token,recordCode,parsed,ctx);
  return true
 }catch(err){
  const m=String((err as any)?.message||err);
  const why=m.includes("paid_amount_required")?"ต้องใส่ยอดที่จ่ายจริง":m.includes("coverage_type_required")?"เลือกใช้สิทธิแล้ว ต้องระบุสิทธิรักษา":"มีข้อมูลบางช่องอ่านไม่ได้";
  await replyLine(replyToken,"⚠️ "+why+"\n\nตรวจเทมเพลตแล้วส่งกลับมาใหม่ อิ่มอุ่นยังไม่ได้บันทึกข้อมูล",token,[qpb("❌ ยกเลิก","ดูนัด "+recordCode)]);
  return true
 }
}

async function routeAppointmentAttachmentCountPrompt(cmd:string,uid:string,replyToken:string,token:string,u:string,k:string){
 let st:any=null;
 try{st=await getFamilyFlowState(uid,u,k)}catch{return false}
 const key=String(st?.state_key||"");
 const data=st?.state_data||{};
 const recordCode=String(data?.record_code||"");
 if(!recordCode)return false;

 if(key==="appointment_existing_file_classify"&&cmd==="จัดประเภทไฟล์นัดเดิม เอกสารประกอบ"){
  const pending=Array.isArray(data?.pending_files)&&data.pending_files.length
   ?data.pending_files
   :[{source_id:String(data?.source_id||""),asset_id:String(data?.asset_id||"")}];
  let existingCount=0;
  try{
   const docs=await rpcOne(u,k,"phms_line_appointment_documents",{p_line_user_id:uid,p_record_code:recordCode});
   existingCount=Array.isArray(docs?.items)?docs.items.length:0
  }catch{}
  await setFamilyFlowState(uid,"appointment_existing_attachment_name",{
   pending_files:pending,current_index:0,record_code:recordCode,link_kind:String(data?.link_kind||"result")
  },u,k);
  const progress=pending.length>1
   ?"🆕 รอบนี้รับเพิ่ม "+String(pending.length)+" ใบ • กำลังกรอกใบที่ 1/"+String(pending.length)
   :"🆕 รอบนี้รับเพิ่ม 1 ใบ";
  await replyLine(replyToken,
   "📎 เอกสารประกอบนัด\n\n"+
   "📚 นัดนี้มีเอกสารบันทึกอยู่แล้ว "+String(existingCount)+" ใบ\n"+
   progress+
   "\n\nกรอกชื่อและหมายเหตุของเอกสารนี้ แล้วส่งเทมเพลตกลับมา\n\nชื่อเอกสาร:\nหมายเหตุ:",
   token,[qpb("🧾 ส่งเทมเพลตอีกครั้ง","เทมเพลตเอกสารประกอบนัด"),qpb("❌ ยกเลิก","ดูนัด "+recordCode)]
  );
  return true
 }

 if(key==="appointment_existing_attachment_name"&&cmd==="เทมเพลตเอกสารประกอบนัด"){
  const pending=Array.isArray(data?.pending_files)?data.pending_files:[];
  const idx=Math.max(0,Number(data?.current_index||0));
  let savedCount=0;
  try{
   const docs=await rpcOne(u,k,"phms_line_appointment_documents",{p_line_user_id:uid,p_record_code:recordCode});
   savedCount=Array.isArray(docs?.items)?docs.items.length:0
  }catch{}
  const progress=pending.length>1
   ?"\n🆕 กำลังกรอกใบที่ "+String(idx+1)+"/"+String(pending.length)
   :"";
  await replyLine(replyToken,
   "🧾 เทมเพลตเอกสารประกอบนัด\n\n"+
   "📚 นัดนี้มีเอกสารบันทึกแล้ว "+String(savedCount)+" ใบ"+
   progress+
   "\n\nชื่อเอกสาร:\nหมายเหตุ:\n\nกรอกค่าหลัง : แล้วส่งกลับมาได้เลย",
   token,[qpb("❌ ยกเลิก","ดูนัด "+recordCode)]
  );
  return true
 }
 return false
}


async function routeHouseholdWorkflow(cmd:string,uid:string,replyToken:string,token:string,u:string,k:string){
 const check=cmd==="คำขอบ้าน"||cmd==="เปลี่ยนเจ้าบ้าน"||cmd==="ขอลาออกจากแอดมิน"
  ||/^(เสนอเป็นเจ้าบ้าน|ตอบรับเจ้าบ้าน|ปฏิเสธเจ้าบ้าน|อนุมัติลาออกแอดมิน|ไม่อนุมัติลาออกแอดมิน)\s+[0-9a-f-]{8,36}$/i.test(cmd);
 if(!check)return false;
 try{
  if(cmd==="คำขอบ้าน"){
   const rr=await rpcOne(u,k,"phms_line_household_pending_requests",{p_line_user_id:uid});
   const xs=Array.isArray(rr?.items)?rr.items:[];
   if(!xs.length){await replyLine(replyToken,"🏡 ตอนนี้ไม่มีเรื่องในบ้านที่รอตอบรับ",token,[qpb("↩️ กลับ","ครอบครัว")]);return true}
   const lines:string[]=[];const buttons:any[]=[];
   for(const x of xs.slice(0,5)){
    if(x?.kind==="owner_transfer"){
     lines.push("• ขอให้ "+String(x.to_name||"สมาชิกครอบครัว")+" เป็นเจ้าบ้านคนใหม่");
     if(x?.can_decide){
      buttons.push(qpb("✅ ยอมรับเป็นเจ้าบ้าน","ตอบรับเจ้าบ้าน "+x.request_code));
      buttons.push(qpb("❌ ไม่รับ","ปฏิเสธเจ้าบ้าน "+x.request_code))
     }
    }else if(x?.kind==="admin_resignation"){
     lines.push("• "+String(x.from_name||"ผู้ช่วยดูแลครอบครัว")+" ขอเลิกเป็นผู้ช่วยดูแลครอบครัว");
     if(x?.can_decide){
      buttons.push(qpb("✅ อนุญาตให้ลาออก","อนุมัติลาออกแอดมิน "+x.request_code));
      buttons.push(qpb("❌ ยังไม่อนุญาต","ไม่อนุมัติลาออกแอดมิน "+x.request_code))
     }
    }
   }
   buttons.push(qpb("↩️ กลับ","ครอบครัว"));
   await replyLine(replyToken,"🏡 เรื่องในบ้านที่รอตอบรับ\n\n"+lines.join("\n")+"\n\nเลือกปุ่มเพื่อตอบรับได้เลย",token,buttons.slice(0,13));
   return true
  }
  if(cmd==="เปลี่ยนเจ้าบ้าน"){
   const prep=await prepareFamily(uid,u,k);
   if(prep?.is_owner!==true){await replyLine(replyToken,"เรื่องนี้ต้องให้เจ้าบ้านเป็นคนจัดการ",token);return true}
   const members=await rpcRows(u,k,"phms_list_line_family_members",{p_line_user_id:uid});
   const buttons:any[]=members.filter((m:any)=>m?.selection_code&&!m?.is_owner).slice(0,10)
     .map((m:any)=>qpb("👤 "+String(m.display_name||"สมาชิกครอบครัว").slice(0,18),"เสนอเป็นเจ้าบ้าน "+String(m.selection_code)));
   buttons.push(qpb("↩️ กลับ","ครอบครัว"));
   await replyLine(replyToken,"🏡 อยากให้ใครเป็นเจ้าบ้านคนใหม่?\n\nคนที่เลือกต้องกดรับก่อน จึงจะเปลี่ยนสำเร็จ",token,buttons);
   return true
  }
  if(cmd==="ขอลาออกจากแอดมิน"){
   await rpcOne(u,k,"phms_line_household_admin_resign",{p_line_user_id:uid});
   await replyLine(replyToken,"✅ ส่งคำขอให้ผู้มีอำนาจดูแลข้อมูลแล้ว\nรอเจ้าบ้านกดอนุญาต คุณจึงจะกลับเป็นสมาชิกครอบครัว",token,[qpb("📥 ดูคำขอ","คำขอบ้าน")]);
   return true
  }
  let m=cmd.match(/^เสนอเป็นเจ้าบ้าน\s+([0-9a-f]{8,40})$/i);
  if(m){
   await rpcOne(u,k,"phms_line_household_owner_nominate",{p_line_user_id:uid,p_member_code:m[1],p_old_owner_role:"member"});
   await replyLine(replyToken,"✅ ส่งคำขอแล้ว\nรอคนที่คุณเลือกกดยอมรับเป็นเจ้าบ้านคนใหม่ก่อนนะ",token,[qpb("📥 ดูคำขอ","คำขอบ้าน")]);
   return true
  }
  m=cmd.match(/^(ตอบรับเจ้าบ้าน|ปฏิเสธเจ้าบ้าน)\s+([0-9a-f-]{8,36})$/i);
  if(m){
   const accepted=m[1]==="ตอบรับเจ้าบ้าน";
   await rpcOne(u,k,"phms_line_household_owner_decide",{p_line_user_id:uid,p_request_code:m[2],p_accept:accepted});
   await replyLine(replyToken,accepted?"✅ คุณเป็นเจ้าบ้านคนใหม่เรียบร้อยแล้ว":"รับทราบ ยังไม่ได้เปลี่ยนเจ้าบ้าน",token,[qpb("🏡 หน้าครอบครัว","ครอบครัว")]);
   return true
  }
  m=cmd.match(/^(อนุมัติลาออกแอดมิน|ไม่อนุมัติลาออกแอดมิน)\s+([0-9a-f-]{8,36})$/i);
  if(m){
   const approved=m[1]==="อนุมัติลาออกแอดมิน";
   await rpcOne(u,k,"phms_line_household_admin_resign_review",{p_line_user_id:uid,p_request_code:m[2],p_approve:approved});
   await replyLine(replyToken,approved?"✅ อนุญาตแล้ว คนนั้นกลับเป็นสมาชิกครอบครัวตามปกติ":"รับทราบ ยังไม่ได้อนุญาตให้ลาออก",token,[qpb("📥 เรื่องที่รอตอบรับ","คำขอบ้าน")]);
   return true
  }
 }catch(e){
  console.error("household_workflow",String(e));
  await replyLine(replyToken,"ตอนนี้ยังทำรายการนี้ไม่ได้\nลองตรวจสิทธิ์หรือคำขอที่ค้าง แล้วลองอีกครั้ง",token,[qpb("📥 ดูคำขอในบ้าน","คำขอบ้าน"),qpb("↩️ กลับ","ครอบครัว")]);
  return true
 }
 return false
}

async function routeFamily(cmd:string,uid:string,replyToken:string,token:string,u:string,k:string){const isFamilyCmd=cmd==="ครอบครัว"||["สมาชิก","สมาชิกครอบครัว","จัดการสมาชิก","บัญชีในครอบครัว","บุคคลในครอบครัว","คนในครอบครัว","สิทธิ์สมาชิก","ฉันทำอะไรได้บ้าง","คำขอสิทธิ์","ตรวจคำขอสิทธิ์","ขอสิทธิ์","ตรวจคำขอ","คำขอเชื่อมบุคคล","ตรวจคำขอเชื่อมบุคคล","ชวนเข้าครอบครัว","เมนูคำเชิญอื่น","ชวนสมาชิกทั่วไปจริง","ชวนผู้ช่วยดูแลครอบครัว","ชวนผู้ดูแลบุคคลปัจจุบัน","ชวนรับบุคคลปัจจุบัน","เมนูขอสิทธิ์ของฉัน","เลือกบุคคลเพื่อขอสิทธิ์","จัดการสิทธิ์ข้อมูลของฉัน","ขอจัดการข้อมูลตัวเอง","จัดการคนที่ดูข้อมูลฉัน","คำขอนำออก"].includes(cmd)||/^(เลือกสมาชิก|สิทธิ์สมาชิก|บทบาท|ให้บทบาท|ถอนบทบาท|สิทธิ์เฉพาะบุคคล|สิทธิ์บุคคล|สิทธิ์บุคคลข้อมูลส่วนตัว|สิทธิ์บุคคลยา|สิทธิ์บุคคลนัดหมาย|สิทธิ์บุคคลสุขภาพ|สิทธิ์บุคคลฉุกเฉิน|ตั้งสิทธิ์ทีละรายการ|ให้สิทธิ์บุคคล|ถอนสิทธิ์บุคคล|อนุมัติสิทธิ์|ปฏิเสธสิทธิ์|ขอสิทธิ์ |ขอสิทธิ์อนุมัติ|ขอบทบาท|ขอสิทธิ์บุคคล|อนุมัติเชื่อมบุคคล|ปฏิเสธเชื่อมบุคคล|สร้างคำเชิญผู้ดูแล|ตั้งค่าก่อนเชื่อม|บทบาทล่วงหน้า|สลับบทบาทล่วงหน้า|สิทธิ์ล่วงหน้า|ตั้งการดูข้อมูลล่วงหน้า|ตั้งการดูข้อมูลล่วงหน้าทีละรายการ|สลับผู้ดูแลล่วงหน้า|สลับแจ้งเตือนล่วงหน้า|เลือกระดับล่วงหน้า|ใช้ระดับล่วงหน้า|ขอสิทธิ์แบบง่าย|ส่งคำขอสิทธิ์แบบง่าย|กำหนดผู้ดูแล|มอบผู้ดูแล|ถอดผู้ดูแล|เลือกผู้ดูแลให้บุคคล|ตั้งผู้ดูแลให้บุคคล|ถอดผู้ดูแลให้บุคคล|ตั้งเจ้าตัวดูแลตัวเอง|เพิ่มบุคคลใหม่ให้ผู้ดูแล|สิทธิ์ตัวเองสมาชิก|ตั้งสิทธิ์ตัวเองสมาชิก|สิทธิ์เจ้าตัวล่วงหน้า|ตั้งสิทธิ์เจ้าตัวล่วงหน้า|สลับจัดการตัวเอง|สลับผู้ช่วยล่วงหน้า|เพิ่มผู้ช่วยใหม่ให้บุคคล|เลือกหลายบุคคลสิทธิ์|สลับเลือกหลายสิทธิ์|ตั้งระดับหลายบุคคล|ใช้ระดับหลายบุคคล|เลือกผู้ช่วยหลายคน|สลับเลือกผู้ช่วย|ยืนยันผู้ช่วยหลายคน|ขอผู้ช่วยดูแลตัวเอง|สลับคำขอคนช่วย|ส่งคำขอคนช่วย|นำสมาชิกออก|ยืนยันนำสมาชิกออก|นำบุคคลออก|ยืนยันนำบุคคลออก|ขอนำสมาชิกออก|ขอนำบุคคลออก|อนุมัตินำออก|ปฏิเสธนำออก|เปิดบุคคล|ตั้งลำดับบุคคล|จัดลำดับบุคคล|บุคคลในครอบครัว หน้า|บัญชีในครอบครัว หน้า|เลือกบุคคลเพื่อขอสิทธิ์ หน้า|ตรวจคำขอสิทธิ์ หน้า|ตรวจคำขอเชื่อมบุคคล หน้า|เลือกคนรับคำเชิญ หน้า|สร้างคำเชิญให้บุคคล|ชวนผู้ดูแลบุคคลปัจจุบัน หน้า|คำขอนำออก หน้า|คนที่ดูข้อมูลฉันได้|ตั้งผู้ดูของฉัน|ขอผู้ดูของฉัน|ดูสถานะผู้ดู|อนุมัติผู้ดู|ปฏิเสธผู้ดู|ตั้งสิทธิ์เร็ว)/.test(cmd);if(!isFamilyCmd && !/^(?:รายละเอียดบุคคล|สีประจำตัว|ตั้งสี|เอาสี|ขอสี|เลือกสี|เอาเป็นสี|#[0-9a-f]{6}$|สี(?:ชมพู|เขียว|ฟ้า|ม่วง|ส้ม|แดง|เหลือง|น้ำเงิน)$|ดูเอกสารบุคคล|ดูค่าใช้จ่ายบุคคล|กลับภาพรวมบุคคล|แจ้งปัญหา|แจ้งบัค|รายงานปัญหา|ตรวจรายงานบัค|สถานะบัค|ยกเลิกแจ้งปัญหา|ตั้งสิทธิ์ห้าหมวด|ตั้งสิทธิ์5หมวด|ตั้งสิทธิ์หมวด|เลือกสิทธิ์หมวด|ตั้งสิทธิ์พื้นฐาน|เลือกสิทธิ์พื้นฐาน)/i.test(cmd))return false;try{if(cmd==="ครอบครัว"){await showDashboard(uid,replyToken,token,u,k);return true}if(cmd==="แจ้งปัญหา"){
 try{await rpcOne(u,k,"phms_line_bug_report_start",{p_line_user_id:uid});await replyLine(replyToken,"🐞 แจ้งปัญหา\nส่งรูปอย่างเดียว หรือพิมพ์ 'แจ้งบัค' แล้วตามด้วยรายละเอียดก็ได้\nส่งข้อความกับรูปพร้อมกันก็ได้\nไม่บังคับให้แจ้งปัญหานะ",token,[qpb("❌ ยกเลิก","ยกเลิกแจ้งปัญหา")]);}
 catch(e){await replyLine(replyToken,"⚠️ ยังเปิดการแจ้งปัญหาไม่ได้ ลองอีกครั้งนะ",token)}
 return true
}
if(cmd==="ยกเลิกแจ้งปัญหา"){await rpcOne(u,k,"phms_line_bug_report_cancel",{p_line_user_id:uid});await replyLine(replyToken,"ยกเลิกการแจ้งปัญหาแล้ว",token);return true}
if(/^(แจ้งบัค|รายงานปัญหา)\s+/.test(cmd)){
 try{const note=cmd.replace(/^(แจ้งบัค|รายงานปัญหา)\s+/,"");const out=await rpcOne(u,k,"phms_line_submit_bug_report",{p_line_user_id:uid,p_description:note,p_image_message_id:null,p_source_screen:"line_chat"});await replyLine(replyToken,"✅ รับรายงานแล้ว เลขที่ "+String(out?.report_code||"")+"\nหากกำลังแนบรูปอยู่ ส่งรูปต่อได้เลย",token)}
 catch(e){await replyLine(replyToken,"⚠️ รับรายงานไม่ได้ ลองอีกครั้งนะ",token)}
 return true
}
const prep=await prepareFamily(uid,u,k);if(await replyFamilyNotReady(prep,replyToken,token))return true;const note=autoNote(prep);
const actorMembers=await listMembers(uid,u,k);
const actorSelf=actorMembers.find((x:any)=>x?.is_self===true);
const actorRoles=Array.isArray(actorSelf?.roles)?actorSelf.roles:[];
const actorIsAdmin=actorRoles.includes("admin");
const actorIsManager=prep.is_owner===true||actorIsAdmin;
let selfViewerPage=cmd.match(/^คนที่ดูข้อมูลฉันได้(?:\s+(\d+))?$/i);
if(selfViewerPage){await showSelfAccessDirectory(uid,replyToken,token,u,k);return true}
let selfViewerManage=cmd.match(/^จัดการคนที่ดูข้อมูลฉัน(?:\s+(\d+))?$/i);
if(selfViewerManage){await showSelfViewerManagePicker(uid,replyToken,token,u,k,Number(selfViewerManage[1]||0));return true}

let selfViewerSet=cmd.match(/^ตั้งผู้ดูของฉัน\s+([a-f0-9]{12})\s+(on|off)(?:\s+(\d+))?$/i);
if(selfViewerSet){
 const rr=await rpcOne(u,k,"phms_set_line_self_viewer",{p_line_user_id:uid,p_member_code:selfViewerSet[1],p_enabled:selfViewerSet[2]==="on"});
 const confirm=selfViewerSet[2]==="on"
  ?"✅ เพิ่มสิทธิ์ให้ "+String(rr?.target_name||"สมาชิก")+"\nดูได้: ข้อมูลส่วนตัว • ยา • นัดหมาย • สุขภาพ • ข้อมูลฉุกเฉิน\nทำไม่ได้: เพิ่ม • แก้ • ลบ"
  :"✅ ลดสิทธิ์ของ "+String(rr?.target_name||"สมาชิก")+"\nยกเลิกสิทธิ์ดูข้อมูลทั้ง 5 เรื่องแล้ว";
 await showSelfViewerManagePicker(uid,replyToken,token,u,k,Number(selfViewerSet[3]||0),confirm);return true
}

let selfViewerReq=cmd.match(/^ขอผู้ดูของฉัน\s+([a-f0-9]{12})(?:\s+(\d+))?$/i);
if(selfViewerReq){
 const rr=await rpcOne(u,k,"phms_request_line_self_viewer",{p_line_user_id:uid,p_member_code:selfViewerReq[1],p_reason:null});
 const msg=rr?.already_allowed?"✅ คนนี้มีสิทธิ์ดูข้อมูลอยู่แล้ว":rr?.already_pending?"⏳ คำขอนี้รอผู้ดูแลอนุมัติอยู่แล้ว":"📤 ส่งคำขอให้ผู้ดูแลอนุมัติแล้ว\n\nคนที่คุณเลือกจะยังดูไม่ได้จนกว่าคำขอจะถูกอนุมัติ";
 await replyLine(replyToken,msg,token,[qpb("👀 กลับรายชื่อ","คนที่ดูข้อมูลฉันได้ "+String(selfViewerReq[2]||0))]);return true
}

let selfViewerStatus=cmd.match(/^ดูสถานะผู้ดู\s+([a-f0-9]{12})$/i);
if(selfViewerStatus){await replyLine(replyToken,"ℹ️ คนนี้มีสิทธิ์อยู่แล้ว หรือมีคำขอรออนุมัติ\nหากเป็นผู้ดูแล อิ่มอุ่นจะแยกจากคนที่ดูได้อย่างเดียว เพราะสิทธิ์ผู้ดูแลสูงกว่า",token,[qpb("👀 กลับ","คนที่ดูข้อมูลฉันได้ 0")]);return true}

let selfViewerReview=cmd.match(/^(อนุมัติผู้ดู|ปฏิเสธผู้ดู)\s+([a-f0-9]{12})$/i);
if(selfViewerReview){
 await rpcOne(u,k,"phms_review_line_self_viewer_request",{p_line_user_id:uid,p_request_code:selfViewerReview[2],p_decision:selfViewerReview[1]==="อนุมัติผู้ดู"?"approve":"reject",p_review_note:null});
 await replyLine(replyToken,selfViewerReview[1]==="อนุมัติผู้ดู"?"✅ อนุมัติสิทธิ์ดูอย่างเดียวแล้ว อิ่มอุ่นกำลังแจ้งผู้ได้รับสิทธิ์ เจ้าของข้อมูลสุขภาพ เจ้าบ้าน และผู้ช่วยดูแลครอบครัว":"✅ ปฏิเสธคำขอแล้ว",token,[qpb("📥 คำขอถัดไป","ตรวจคำขอสิทธิ์")]);return true
}

let accountPage=cmd.match(/^บัญชีในครอบครัว หน้า\s+(\d+)$/i);
if(accountPage){await showAccountMembers(uid,replyToken,token,u,k,"",Number(accountPage[1]||0));return true}
let reqPersonPage=cmd.match(/^เลือกบุคคลเพื่อขอสิทธิ์ หน้า\s+(\d+)$/i);
if(reqPersonPage){await choosePersonForMyRequest(uid,replyToken,token,u,k,Number(reqPersonPage[1]||0));return true}
let caregiverPage=cmd.match(/^กำหนดผู้ดูแล\s+([a-f0-9]{12})\s+(\d+)$/i);
if(caregiverPage){await showCaregiverTargets(uid,caregiverPage[1],replyToken,token,u,k,Number(caregiverPage[2]||0));return true}
let permPersonPage=cmd.match(/^สิทธิ์เฉพาะบุคคล\s+([a-f0-9]{12})\s+(\d+)$/i);
if(permPersonPage){await choosePersonForMember(uid,permPersonPage[1],replyToken,token,u,k,Number(permPersonPage[2]||0));return true}
let preTargetPage=cmd.match(/^สิทธิ์ล่วงหน้า\s+([a-f0-9]{12})\s+(\d+)$/i);
if(preTargetPage){await choosePrelinkTarget(uid,preTargetPage[1],replyToken,token,u,k,Number(preTargetPage[2]||0));return true}
let reviewPage=cmd.match(/^ตรวจคำขอสิทธิ์ หน้า\s+(\d+)$/i);
if(reviewPage){await showReviewRequests(uid,replyToken,token,u,k,"",Number(reviewPage[1]||0));return true}
let claimPage=cmd.match(/^ตรวจคำขอเชื่อมบุคคล หน้า\s+(\d+)$/i);
if(claimPage){await showPersonClaimRequests(uid,replyToken,token,u,k,"",Number(claimPage[1]||0));return true}
let inviteCarePage=cmd.match(/^ชวนผู้ดูแลบุคคลปัจจุบัน หน้า\s+(\d+)$/i);
if(inviteCarePage){await showCaregiverInvitePreset(uid,replyToken,token,u,k,Number(inviteCarePage[1]||0));return true}

if(cmd==="จัดการสิทธิ์ข้อมูลของฉัน"){
 const me=actorMembers.find((x:any)=>x?.is_self===true&&x?.selection_code);
 if(!me){await replyLine(replyToken,"⚠️ ยังไม่พบบัญชีของคุณในครอบครัวนี้",token,[qpb("👥 บุคคลในครอบครัว","บุคคลในครอบครัว")]);return true}
 await showMemberSelfAccess(uid,String(me.selection_code),replyToken,token,u,k);return true
}
if(cmd==="ขอจัดการข้อมูลตัวเอง"){
 const rr=await rpcOne(u,k,"phms_request_line_self_manage",{p_line_user_id:uid,p_reason:null});
 const msg=rr?.status==="already_allowed"
  ?"✅ ตอนนี้คุณมีสิทธิ์จัดการข้อมูลตัวเองอยู่แล้ว"
  :rr?.already_pending
   ?"⏳ มีคำขอจัดการข้อมูลตัวเองรออนุมัติอยู่แล้ว"
   :"📤 ส่งคำขอจัดการข้อมูลตัวเองแล้ว\n\nอิ่มอุ่นส่งคำขอไปยังผู้ดูแลปัจจุบันเพื่อพิจารณา เมื่ออนุมัติแล้วอิ่มอุ่นจะแจ้งผู้ขอ เจ้าของข้อมูลสุขภาพ เจ้าบ้าน และผู้ช่วยดูแลครอบครัว";
 await replyLine(replyToken,msg,token,[qpb("🙋 กลับสิทธิ์ของฉัน","จัดการสิทธิ์ข้อมูลของฉัน"),qpb("↩️ ครอบครัว","ครอบครัว")]);
 return true
}
if(cmd==="ดูเอกสารบุคคล"||cmd==="ดูค่าใช้จ่ายบุคคล"){
 try{
  const summary=await rpcOne(u,k,"phms_line_person_extra_summaries",{p_line_user_id:uid});
  const isDoc=cmd==="ดูเอกสารบุคคล",data=isDoc?summary?.documents:summary?.expenses;
  if(data?.view!==true){await replyLine(replyToken,"🔒 คุณยังไม่มีสิทธิ์ดูข้อมูลส่วนนี้",token);return true}
  const rows=Array.isArray(data.items)?data.items:[];
  const title=isDoc?"📄 เอกสาร":"💰 ค่าใช้จ่าย";
  const body=rows.length?rows.map((x:any,i:number)=>String(i+1)+". "+(isDoc?String(x.title||"เอกสาร")+(x.date?" • "+String(x.date):""):String(x.date||"ไม่ระบุวันที่")+" • "+Number(x.amount??0).toLocaleString("th-TH")+" ฿")).join("\n"):"ยังไม่มีข้อมูลในหมวดนี้";
  await replyLine(replyToken,title+"\n\n"+body,token,[qpb("↩️ ภาพรวมบุคคล","กลับภาพรวมบุคคล")])
 }catch(e){await replyLine(replyToken,"ตอนนี้เปิดข้อมูลไม่ได้ ลองอีกครั้งนะ",token)}
 return true
}
const basePicker=cmd.match(/^ตั้งสิทธิ์พื้นฐาน\s+([a-f0-9]{12})\s+([a-f0-9]{12})$/i);
if(basePicker){
 const current=await rpcOne(u,k,"phms_line_five_category_access_settings",{p_line_user_id:uid,p_member_code:basePicker[1],p_person_code:basePicker[2]});
 const level=({none:"ไม่มีสิทธิ์",view:"ดูได้",manage:"จัดการได้"} as any)[current?.base_level]||"ยังไม่ตั้ง";
 await replyLine(replyToken,"🔐 สิทธิ์พื้นฐานทั้ง 5 หมวด\nตอนนี้: "+level+"\n\nเลือกสิทธิ์เริ่มต้นสำหรับบุคคลนี้ แล้วค่อยตั้งข้อยกเว้นรายหมวดได้\nการเปลี่ยนสิทธิ์พื้นฐานจะล้างข้อยกเว้นเดิม",token,[
 qpb("🛠️ จัดการได้","เลือกสิทธิ์พื้นฐาน "+basePicker[1]+" "+basePicker[2]+" manage"),
 qpb("👀 ดูได้","เลือกสิทธิ์พื้นฐาน "+basePicker[1]+" "+basePicker[2]+" view"),
 qpb("🚫 ไม่ให้ดู","เลือกสิทธิ์พื้นฐาน "+basePicker[1]+" "+basePicker[2]+" none"),
 qpb("↩️ ทั้ง 5 หมวด","ตั้งสิทธิ์ทีละรายการ "+basePicker[1]+" "+basePicker[2])]);
 return true
}
const baseSet=cmd.match(/^เลือกสิทธิ์พื้นฐาน\s+([a-f0-9]{12})\s+([a-f0-9]{12})\s+(none|view|manage)$/i);
if(baseSet){
 try{
 const result=await rpcOne(u,k,"phms_line_set_five_category_base_access",{p_line_user_id:uid,p_member_code:baseSet[1],p_person_code:baseSet[2],p_level:baseSet[3]});
 await replyLine(replyToken,"✅ ตั้งสิทธิ์พื้นฐานแล้ว\nเลือกตั้งข้อยกเว้นในแต่ละหมวดได้เลย",token,[qpb("⚙️ ทั้ง 5 หมวด","ตั้งสิทธิ์ทีละรายการ "+baseSet[1]+" "+baseSet[2])]);
 }catch(e){await replyLine(replyToken,"🔒 คุณไม่มีสิทธิ์ตั้งค่าบุคคลนี้ หรือบุคคลนี้เป็นผู้ดูแลหลัก",token)}
 return true
}
const fiveSettings=cmd.match(/^ตั้งสิทธิ์หมวด (documents|expenses|appointments|medications|health_data) ([a-f0-9]{12}) ([a-f0-9]{12})$/);
if(fiveSettings){
 const settings=await rpcOne(u,k,"phms_line_five_category_access_settings",{p_line_user_id:uid,p_member_code:fiveSettings[2],p_person_code:fiveSettings[3]});
 if(settings?.configured!==true){await replyLine(replyToken,"⚙️ กรุณาตั้งสิทธิ์พื้นฐานก่อน แล้วค่อยเลือกข้อยกเว้นรายหมวด",token,[qpb("🔐 ตั้งสิทธิ์พื้นฐาน","ตั้งสิทธิ์พื้นฐาน "+fiveSettings[2]+" "+fiveSettings[3])]);return true}
 const name:any={documents:"📄 เอกสาร",expenses:"💰 ค่าใช้จ่าย",appointments:"📅 นัด",medications:"💊 ยา",health_data:"❤️ สุขภาพ"};
 await replyLine(replyToken,"🔐 "+name[fiveSettings[1]]+"\nเลือกสิทธิ์ให้บุคคลนี้",token,[
 qpb("👀 ดูได้","เลือกสิทธิ์หมวด "+fiveSettings[1]+" "+fiveSettings[2]+" "+fiveSettings[3]+" view"),
 qpb("🛠️ จัดการได้","เลือกสิทธิ์หมวด "+fiveSettings[1]+" "+fiveSettings[2]+" "+fiveSettings[3]+" manage"),
 qpb("🚫 ไม่มีสิทธิ์","เลือกสิทธิ์หมวด "+fiveSettings[1]+" "+fiveSettings[2]+" "+fiveSettings[3]+" none"),
 qpb("🔄 ตามพื้นฐาน","เลือกสิทธิ์หมวด "+fiveSettings[1]+" "+fiveSettings[2]+" "+fiveSettings[3]+" inherit"),
 qpb("↩️ ตั้งสิทธิ์","ตั้งสิทธิ์ทีละรายการ "+fiveSettings[2]+" "+fiveSettings[3])]);return true
}
const fiveSelection=cmd.match(/^เลือกสิทธิ์หมวด (documents|expenses|appointments|medications|health_data) ([a-f0-9]{12}) ([a-f0-9]{12}) (view|manage|none|inherit)$/);
if(fiveSelection){
 try{await rpcOne(u,k,"phms_line_set_five_category_access",{p_line_user_id:uid,p_member_code:fiveSelection[2],p_person_code:fiveSelection[3],p_resource:fiveSelection[1],p_level:fiveSelection[4]});
 await replyLine(replyToken,"✅ บันทึกสิทธิ์แล้ว",token,[qpb("↩️ ตั้งสิทธิ์","ตั้งสิทธิ์ทีละรายการ "+fiveSelection[2]+" "+fiveSelection[3])])}
 catch(e){await replyLine(replyToken,"ยังเปลี่ยนสิทธิ์ไม่ได้ โปรดตรวจว่าคุณได้รับสิทธิ์ให้จัดการข้อมูลบุคคลนี้",token)}
 return true
}
if(cmd==="กลับภาพรวมบุคคล"){const d=await rpcOne(u,k,"phms_get_line_person_dashboard",{p_line_user_id:uid});await showPersonDashboardRouter(uid,String(d.person_code),replyToken,token,u,k);return true}
if(cmd==="แจ้งปัญหา"){
 await rpcOne(u,k,"phms_line_bug_report_start",{p_line_user_id:uid});
 await replyLine(replyToken,"🐞 แจ้งปัญหาให้อิ่มอุ่น\n\nส่งรูปอย่างเดียวได้เลย หรือพิมพ์ 'แจ้งบัค' ตามด้วยรายละเอียด แล้วค่อยส่งรูปก็ได้\n\nไม่มีรูปก็ส่งข้อความอย่างเดียวได้ ไม่บังคับให้แจ้งปัญหานะ\nหากต้องการยกเลิก พิมพ์ 'ยกเลิกแจ้งปัญหา'",token,[qpb("❌ ยกเลิก","ยกเลิกแจ้งปัญหา")]);
 return true
}
if(cmd==="ยกเลิกแจ้งปัญหา"){await rpcOne(u,k,"phms_line_bug_report_cancel",{p_line_user_id:uid});await replyLine(replyToken,"รับทราบแล้ว ไม่ส่งรายงานปัญหานะ",token);return true}
if(/^(แจ้งบัค|รายงานปัญหา)\s+/.test(cmd)){const d=cmd.replace(/^(แจ้งบัค|รายงานปัญหา)\s+/,"");const out=await rpcOne(u,k,"phms_line_submit_bug_report",{p_line_user_id:uid,p_description:d,p_image_message_id:null,p_source_screen:"line"});await replyLine(replyToken,"✅ รับแจ้งปัญหาแล้ว หมายเลข "+String(out.report_code||""),token);return true}
if(cmd==="ตรวจรายงานบัค"){
 try{
 const z=await rpcOne(u,k,"phms_line_admin_bug_reports",{p_line_user_id:uid,p_limit:12});
 const reports=Array.isArray(z.items)?z.items:[];
 if(!reports.length){await replyLine(replyToken,"🐞 ตอนนี้ยังไม่มีรายงานปัญหาของครอบครัวนี้",token);return true}
 const cards:any[]=[];
 for(const x of reports.slice(0,10)){
  const contents:any[]=[{type:"text",text:String(x.description||"ผู้ใช้แนบรูปแจ้งปัญหา"),size:"sm",wrap:true},
   {type:"text",text:"สถานะ: "+String(x.status||"new"),size:"xs",color:"#667085",margin:"md"},
   {type:"text",text:"วันที่รับเรื่อง: "+String(x.created_at||"").slice(0,16).replace("T"," "),size:"xs",color:"#667085",margin:"sm"}];
  let hero:any=undefined;
  const path=String(x.image_storage_path||"");
  if(/^line-bug\/U[0-9a-f]+\/[0-9]+\.(?:png|jpg|webp)$/i.test(path)){
   try{
    const rs=await fetch(u+"/storage/v1/object/sign/phms-bug-reports/"+path,{method:"POST",headers:{apikey:k,Authorization:"Bearer "+k,"Content-Type":"application/json"},body:JSON.stringify({expiresIn:600})});
    if(rs.ok){const data=await rs.json();const url=String(data.signedURL||"");if(url.startsWith("/object/sign/"))hero={type:"image",url:u+"/storage/v1"+url,size:"full",aspectRatio:"16:9",aspectMode:"cover"}}
   }catch(e){console.error("bug_report_sign_error",String(e))}
  }
  const status=String(x.status||"");
  const actions:any[]=[];
  if(status==="new")actions.push({type:"button",style:"primary",action:{type:"postback",label:"✅ รับเรื่อง",data:"สถานะบัค "+String(x.id)+" triaged"}});
  if(status!=="resolved"&&status!=="closed")actions.push({type:"button",style:"secondary",action:{type:"postback",label:"✔️ แก้แล้ว",data:"สถานะบัค "+String(x.id)+" resolved"}});
  const bubble:any={type:"bubble",size:"kilo",header:{type:"box",layout:"vertical",backgroundColor:"#FFF3E9",paddingAll:"14px",contents:[{type:"text",text:"🐞 รายงาน #"+String(x.id||"").slice(0,8),weight:"bold",size:"md"}]},body:{type:"box",layout:"vertical",paddingAll:"14px",contents},footer:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"10px",contents:actions.length?actions:[{type:"text",text:"ตรวจสอบแล้ว",size:"xs",color:"#667085"}]}};
  if(hero)bubble.hero=hero;
  cards.push(bubble);
 }
 await replyMessages(replyToken,token,[{type:"flex",altText:"🐞 รายงานปัญหา",contents:{type:"carousel",contents:cards}}]);
 }catch(e){console.error("bug_report_review",String(e));await replyLine(replyToken,"🔒 คุณไม่มีสิทธิ์ตรวจรายงาน หรือขณะนี้รายการยังเปิดไม่ได้",token)}
 return true
}
const bugStatus=cmd.match(/^สถานะบัค\s+([0-9a-f-]{36})\s+(triaged|resolved)$/i);
if(bugStatus){
 try{
  await rpcOne(u,k,"phms_line_admin_set_bug_status",{p_line_user_id:uid,p_report_id:bugStatus[1],p_status:bugStatus[2]});
  await replyLine(replyToken,"✅ บันทึกสถานะรายงานแล้ว",token,[qpb("🐞 ดูรายงาน","ตรวจรายงานบัค")])
 }catch(e){await replyLine(replyToken,"🔒 เปลี่ยนสถานะรายงานไม่ได้",token)}
 return true
}
/* AIM_PERSON_DETAIL_ROUTER_V4: unified person details, permission-scoped, all persons */
if(cmd==="รายละเอียดบุคคล"){
 return false; // Core owns the shared person detail card.
 try{
  const [d,p]=await Promise.all([
   rpcOne(u,k,"phms_get_line_person_dashboard",{p_line_user_id:uid}),
   rpcOne(u,k,"phms_get_line_active_person_profile",{p_line_user_id:uid}).catch(()=>null)
  ]);
  const info=p||{},display=String(d?.display_name||info?.display_name||"บุคคล");
  const rows:any[]=[];
  const line=(label:string,value:any)=>({type:"box",layout:"horizontal",spacing:"sm",contents:[
   {type:"text",text:label,size:"sm",color:"#64748B",flex:4,wrap:true},
   {type:"text",text:String(value),size:"sm",color:"#263649",flex:7,wrap:true}
  ]});
  const heading=(v:string)=>({type:"text",text:v,size:"md",weight:"bold",color:"#315C85",margin:"md"});
  const add=(label:string,value:any)=>{if(value!==null&&value!==undefined&&String(value).trim())rows.push(line(label,value))};
  rows.push(heading("👤 ข้อมูลส่วนตัว"));
  const legal=[info?.first_name,info?.last_name].filter(Boolean).join(" ").trim();
  add("ชื่อจริง",legal);
  const sexCode=String(info?.sex||"").trim().toLowerCase();
  const sexText=info?.sex_label||info?.gender_label||({male:"ชาย",female:"หญิง",m:"ชาย",f:"หญิง",other:"อื่น ๆ",unknown:"ไม่ระบุ"} as Record<string,string>)[sexCode]||(sexCode&&sexCode!=="null"?sexCode:null);
  add("เพศ",sexText);
  const rawBirth=String(info?.date_of_birth||info?.birth_info?.date||d?.birth_info?.date||"").trim();
  const thaiBirth=(value:string)=>{
   const m=value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
   if(!m)return value;
   const year=Number(m[1]),month=Number(m[2]),day=Number(m[3]);
   const date=new Date(Date.UTC(year,month-1,day));
   if(!Number.isFinite(date.getTime())||date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return value;
   const days=["วันอาทิตย์","วันจันทร์","วันอังคาร","วันพุธ","วันพฤหัสบดี","วันศุกร์","วันเสาร์"];
   const months=["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
   return days[date.getUTCDay()]+" "+day+" "+months[month-1]+" "+(year+(year<2400?543:0));
  };
  add("วันเกิด",rawBirth?thaiBirth(rawBirth):null);
  if(d?.birth_info?.age!=null||info?.birth_info?.age!=null)add("อายุ",String(d?.birth_info?.age??info?.birth_info?.age)+" ปี");
  rows.push({type:"separator",margin:"md"});
  rows.push(heading("🏡 ข้อมูลในบ้าน"));
  add("ชื่อส่วนตัว",display);
  add("ชื่อในบ้าน",info?.nickname||"ยังไม่ได้ตั้ง");
  add("ความสัมพันธ์",info?.relationship_label);
  const colorData=await rpcOne(u,k,"phms_line_person_theme_color",{p_line_user_id:uid,p_color:null}).catch(()=>null);
  const personalColor=String(colorData?.color||"").trim();
  if(/^#[0-9a-f]{6}$/i.test(personalColor)){
   rows.push({type:"box",layout:"horizontal",spacing:"sm",alignItems:"center",contents:[
    {type:"text",text:"สีประจำตัว",size:"sm",color:"#64748B",flex:4},
    {type:"box",layout:"horizontal",flex:7,spacing:"sm",alignItems:"center",contents:[
     {type:"box",layout:"vertical",width:"22px",height:"22px",backgroundColor:personalColor,cornerRadius:"6px",contents:[{type:"text",text:" ",size:"xs",color:personalColor}]},
     {type:"text",text:personalColor.toUpperCase(),size:"sm",color:"#263649"}
    ]}
   ]});
  }else add("สีประจำตัว","ยังไม่ได้ตั้ง");

  if(rows[rows.length-1]?.type==="text"&&rows[rows.length-1]?.text==="🏡 ข้อมูลในบ้าน")rows.push({type:"text",text:"ดูข้อมูลสมาชิกและผู้ดูแลได้จากภาพรวม",size:"sm",color:"#64748B",wrap:true});
  const canEdit=d?.access?.profile?.update===true;
  const actions:any[]=[
   ...(canEdit?[{type:"button",style:"primary",color:"#315C85",action:{type:"postback",label:"✏️ แก้ข้อมูล",data:"แก้รายละเอียดบุคคล"}}]:[]),

   {type:"button",style:"secondary",action:{type:"postback",label:"↩️ ภาพรวม",data:"เปิดบุคคล "+String(d?.person_code||"")}}
  ];
  await replyMessages(replyToken,token,[{type:"flex",altText:"👤 รายละเอียดบุคคล • "+display,contents:{type:"bubble",size:"kilo",
   header:{type:"box",layout:"vertical",backgroundColor:"#EAF4FF",paddingAll:"16px",contents:[{type:"text",text:"👤 รายละเอียดบุคคล",weight:"bold",size:"lg"},{type:"text",text:display,size:"sm",color:"#47627F",margin:"sm",wrap:true}]},
   body:{type:"box",layout:"vertical",paddingAll:"16px",spacing:"sm",contents:rows},
   footer:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"12px",contents:actions}
  }}])
 }catch(e){console.error("person_detail_router_v4",String(e));await replyLine(replyToken,"ตอนนี้เปิดรายละเอียดบุคคลไม่ได้ ลองเปิดภาพรวมใหม่อีกครั้งนะ",token)}
 return true
}

if(cmd==="แก้รายละเอียดบุคคล"){
 try{
  const p=await rpcOne(u,k,"phms_get_line_active_person_profile",{p_line_user_id:uid});
  if(p?.can_edit!==true){await replyLine(replyToken,"🔒 คุณดูข้อมูลได้ แต่ยังไม่มีสิทธิ์แก้ข้อมูลส่วนตัวของคนนี้",token);return true}
  const make=(title:string,note:string,bg:string,items:[string,string][])=>({type:"bubble",size:"kilo",header:{type:"box",layout:"vertical",backgroundColor:bg,paddingAll:"15px",contents:[{type:"text",text:title,weight:"bold",size:"lg",color:"#294B6B",wrap:true},{type:"text",text:note,size:"sm",color:"#526579",wrap:true,margin:"sm"}]},footer:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"12px",contents:items.map(([label,data])=>({type:"button",style:"primary",action:{type:"postback",label,data}}))}});
  const cards=[
   make("🏷️ ตั้งชื่อเรียก","ชื่อส่วนตัวเห็นเฉพาะคุณ • ชื่อในบ้านทุกคนเห็น","#EDF5FF",[["🏷️ ชื่อส่วนตัว","ตั้งชื่อที่ฉันใช้เรียก"],["🏠 ชื่อในบ้าน","แก้ข้อมูลบุคคล nickname"],["👪 ความสัมพันธ์","ตั้งความสัมพันธ์กับฉัน"]]),
   make("🪪 ข้อมูลส่วนตัว","เลือกข้อมูลที่ต้องการแก้","#F2EDFB",[["🪪 ชื่อจริง","แก้ข้อมูลบุคคล first_name"],["🪪 นามสกุล","แก้ข้อมูลบุคคล last_name"],["🎂 วันเกิด","แก้ข้อมูลบุคคล date_of_birth"]]),
   make("🎨 รูปและสีประจำตัว","เลือกสีได้ 10 สี และห้ามใช้ซ้ำกับคนในบ้าน","#EEF8F3",[["🎨 เปลี่ยนสีประจำตัว","สีประจำตัว"],["📷 เปลี่ยนรูปบุคคล","รูปบุคคล"],["⚧ เพศ","แก้ข้อมูลบุคคล sex"]]),
   make("🧾 แก้หลายรายการ","แก้หลายช่องพร้อมกัน","#FFF7E8",[["🧾 แก้ด้วยเทมเพลต","แก้ข้อมูลบุคคล template"],["↩️ รายละเอียดบุคคล","รายละเอียดบุคคล"]])
  ];
  await replyMessages(replyToken,token,[{type:"flex",altText:"✏️ แก้ข้อมูลส่วนตัว",contents:{type:"carousel",contents:cards}}]);
 }catch(e){console.error("person_edit_menu_router_v5",String(e));await replyLine(replyToken,"ตอนนี้เปิดหน้าแก้ข้อมูลไม่ได้ ลองอีกครั้งนะ",token)}
 return true
}
if(cmd==="สีประจำตัว"){
 const state=await rpcOne(u,k,"phms_line_person_theme_color",{p_line_user_id:uid,p_color:null});
 if(!state?.can_edit){await replyLine(replyToken,"🔒 เปลี่ยนสีให้คนนี้ไม่ได้ เพราะยังไม่มีสิทธิ์แก้ข้อมูลส่วนตัว",token);return true}
 const palette=[["🌸 ชมพู","#E75496"],["💙 ฟ้า","#4F91D9"],["💚 เขียว","#3E9B77"],["💜 ม่วง","#9061BD"],["🧡 ส้ม","#DF8843"],["❤️ แดง","#D85B65"],["💛 เหลือง","#C99A2C"],["🔵 น้ำเงิน","#3979BD"],["🤎 น้ำตาล","#95664F"],["🩶 เทา","#778899"]];
 const colors=await rpcOne(u,k,"phms_line_person_card_colors",{p_line_user_id:uid}).catch(()=>({items:[]}));
 const selected=await rpcOne(u,k,"phms_get_line_person_dashboard",{p_line_user_id:uid}).catch(()=>null);
 const used=new Set((Array.isArray(colors?.items)?colors.items:[]).filter((x:any)=>String(x?.person_code)!==String(selected?.person_code)).map((x:any)=>String(x?.card_color||"").toUpperCase()));
 const free=palette.filter((x:string[])=>!used.has(x[1]));
 await replyLine(replyToken,"🎨 เลือกสีประจำตัว\n\nเลือกสีที่ชอบได้เลยนะ 💙\nสีนี้จะเป็นสีของคนนี้ในบ้าน\nสีที่คนอื่นใช้แล้วจะเลือกซ้ำไม่ได้"+(free.length?"\n\nเลือกสีจากปุ่มด้านล่างได้เลย":"\n\nสีพื้นฐานถูกใช้ครบแล้ว ลองพิมพ์รหัสสีอื่น เช่น ตั้งสี #FF69B4"),token,free.map((x:string[])=>qpb(x[0],"ตั้งสี "+x[1])));return true
}
const themeMatch=cmd.match(/^(?:ตั้งสี(?:ประจำตัว)?|เอาสี|ขอสี|เลือกสี|เอาเป็นสี)\s*(.+)$/i)||cmd.match(/^(#[0-9a-f]{6})$/i)||cmd.match(/^(สี(?:ชมพู|เขียว|ฟ้า|ม่วง|ส้ม|แดง|เหลือง|น้ำเงิน))$/);
if(themeMatch){
 const raw=themeMatch[1].trim();
 const colors:any={"ชมพู":"#E75496","สีชมพู":"#E75496","ฟ้า":"#4F91D9","สีฟ้า":"#4F91D9","เขียว":"#3E9B77","สีเขียว":"#3E9B77","ม่วง":"#9061BD","สีม่วง":"#9061BD","ส้ม":"#DF8843","สีส้ม":"#DF8843","แดง":"#D85B65","สีแดง":"#D85B65","เหลือง":"#C99A2C","สีเหลือง":"#C99A2C","น้ำเงิน":"#3979BD","สีน้ำเงิน":"#3979BD"};
 const value=colors[raw]||raw.toUpperCase();
 if(!/^#[0-9A-F]{6}$/.test(value)){await replyLine(replyToken,"เลือกสีจากปุ่มได้เลย หรือพิมพ์ เช่น ตั้งสี ชมพู",token);return true}
 try{await rpcOne(u,k,"phms_line_person_theme_color",{p_line_user_id:uid,p_color:value});await replyLine(replyToken,"✅ เปลี่ยนสีประจำตัวให้แล้ว 🎨",token,[qpb("🎨 เปลี่ยนสีอีกครั้ง","สีประจำตัว")])}
 catch(e){const reason=String(e);console.error("person_theme_color_update_failed",reason);const message=reason.includes("person_color_already_used_in_family")?"🎨 สีนี้มีคนในบ้านใช้แล้ว เลือกสีอื่นได้เลยนะ":reason.includes("person_update_denied")||reason.includes("person_view_denied")?"🔒 ยังไม่มีสิทธิ์แก้ข้อมูลส่วนตัวของคนนี้ กรุณาตรวจสิทธิ์หมวด 6":reason.includes("family_person_context_required")?"👤 ยังไม่ได้เลือกคนที่จะเปลี่ยนสี กรุณาเปิดภาพรวมของคนนั้นแล้วเลือกสีอีกครั้ง":reason.includes("invalid_hex_color")?"🎨 รหัสสีไม่ถูกต้อง ลองเลือกสีจากปุ่มอีกครั้ง":"⚠️ บันทึกสีไม่สำเร็จ ระบบขัดข้อง กรุณาลองอีกครั้ง";await replyLine(replyToken,message,token,[qpb("🎨 เลือกสีอื่น","สีประจำตัว")])}
 return true
}
let openPerson=cmd.match(/^เปิดบุคคล\s+([a-f0-9]{12})$/i);
if(openPerson){await showPersonDashboardRouter(uid,openPerson[1],replyToken,token,u,k);return true}
let prefCmd=cmd.match(/^ตั้งลำดับบุคคล\s+([a-f0-9]{12})\s+(pin|unpin|move_up|move_down)(?:\s+(\d+))?$/i);
if(prefCmd){
 await rpcOne(u,k,"phms_set_line_person_display_preference",{p_line_user_id:uid,p_person_code:prefCmd[1],p_action:prefCmd[2]});
 const msg=prefCmd[2]==="pin"?"✅ ปักหมุดแล้ว":prefCmd[2]==="unpin"?"✅ เลิกปักหมุดแล้ว":prefCmd[2]==="move_up"?"✅ เลื่อนขึ้นแล้ว":"✅ เลื่อนลงแล้ว";
 await showPersonOrderManager(uid,replyToken,token,u,k,Number(prefCmd[3]||0),msg);return true
}
let orderCmd=cmd.match(/^จัดลำดับบุคคล(?:\s+(\d+))?$/i);
if(orderCmd){await showPersonOrderManager(uid,replyToken,token,u,k,Number(orderCmd[1]||0));return true}
let peoplePage=cmd.match(/^บุคคลในครอบครัว หน้า\s+(\d+)$/i);
if(peoplePage){await showMembers(uid,replyToken,token,u,k,"",Number(peoplePage[1]||0));return true}

let adminRemove=cmd.match(/^ขอนำสมาชิกออก\s+([a-f0-9]{12})$/i);
if(adminRemove){
 if(!actorIsAdmin||prep?.is_owner===true)throw new Error("admin_required_to_request_removal");
 const rr=await rpcOne(u,k,"phms_request_line_family_removal",{p_line_user_id:uid,p_target_kind:"member",p_target_code:adminRemove[1],p_reason:null});
 await replyLine(replyToken,rr?.already_pending?"ℹ️ คำขอนำสมาชิกนี้ออกรอเจ้าบ้านอยู่แล้ว":"📤 ส่งคำขอให้เจ้าบ้านอนุมัติการนำสมาชิกออกแล้ว",token,[qpb("↩️ บัญชีในครอบครัว","บัญชีในครอบครัว")]);return true
}
adminRemove=cmd.match(/^ขอนำบุคคลออก\s+([a-f0-9]{12})$/i);
if(adminRemove){
 if(!actorIsAdmin||prep?.is_owner===true)throw new Error("admin_required_to_request_removal");
 const rr=await rpcOne(u,k,"phms_request_line_family_removal",{p_line_user_id:uid,p_target_kind:"person",p_target_code:adminRemove[1],p_reason:null});
 await replyLine(replyToken,rr?.already_pending?"ℹ️ คำขอนำบุคคลนี้ออกรอเจ้าบ้านอยู่แล้ว":"📤 ส่งคำขอให้เจ้าบ้านอนุมัติการนำบุคคลออกแล้ว",token,[qpb("↩️ บุคคลในครอบครัว","บุคคลในครอบครัว")]);return true
}
let removalPage=cmd.match(/^คำขอนำออก(?: หน้า\s+(\d+))?$/i);
if(removalPage){
 if(prep?.is_owner!==true)throw new Error("owner_required_to_review_removal");
 const rr=await rpcOne(u,k,"phms_list_line_family_removal_requests",{p_line_user_id:uid});
 const items=Array.isArray(rr?.items)?rr.items:[];
 if(!items.length){await replyLine(replyToken,"📥 ตอนนี้ไม่มีคำขอนำออกที่รอเจ้าบ้าน",token,[qpb("↩️ ครอบครัว","ครอบครัว")]);return true}
 const pageSize=5,total=Math.max(1,Math.ceil(items.length/pageSize)),pg=Math.max(0,Math.min(Number(removalPage[1]||0),total-1));
 const pageItems=items.filter((_:any,i:number)=>i>=pg*pageSize&&i<(pg+1)*pageSize);
 const text="📥 คำขอนำออก • หน้า "+(pg+1)+"/"+total+"\n\n"+pageItems.map((x:any,i:number)=>String(pg*pageSize+i+1)+". "+String(x.target_name||"สมาชิก")+"\nผู้ขอ: "+String(x.requester_name||"ผู้ช่วยดูแลครอบครัว")+(x.reason?"\nเหตุผล: "+String(x.reason):"")).join("\n\n");
 const q:any[]=[];
 for(const x of pageItems){
  q.push(qpb("✅ อนุมัติ "+String(x.target_name||"").slice(0,12),"อนุมัตินำออก "+String(x.request_code)));
  q.push(qpb("❌ ปฏิเสธ "+String(x.target_name||"").slice(0,12),"ปฏิเสธนำออก "+String(x.request_code)));
 }
 if(pg>0)q.push(qpb("⬅️ ก่อนหน้า","คำขอนำออก หน้า "+(pg-1)));
 if(pg<total-1)q.push(qpb("➡️ ถัดไป","คำขอนำออก หน้า "+(pg+1)));
 q.push(qpb("↩️ ครอบครัว","ครอบครัว"));
 await replyLine(replyToken,text,token,q);return true
}
let removalReview=cmd.match(/^(อนุมัตินำออก|ปฏิเสธนำออก)\s+([a-f0-9]{12})$/i);
if(removalReview){
 if(prep?.is_owner!==true)throw new Error("owner_required_to_review_removal");
 await rpcOne(u,k,"phms_review_line_family_removal_request",{p_line_user_id:uid,p_request_code:removalReview[2],p_decision:removalReview[1]==="อนุมัตินำออก"?"approve":"reject",p_review_note:null});
 await replyLine(replyToken,removalReview[1]==="อนุมัตินำออก"?"✅ เจ้าบ้านอนุมัติและนำออกแล้ว":"✅ ปฏิเสธคำขอนำออกแล้ว",token,[qpb("📥 คำขอนำออก","คำขอนำออก"),qpb("👥 บุคคลในครอบครัว","บุคคลในครอบครัว")]);return true
}


let bulkPerm=cmd.match(/^เลือกหลายบุคคลสิทธิ์\s+([a-f0-9]{12})(?:\s+(\d+))?$/i);
if(bulkPerm){
 if(!actorIsManager)throw new Error("permission_management_denied");
 const pg=Number(bulkPerm[2]||0);
 const st=await getFamilyFlowState(uid,u,k);
 if(st?.state_key!=="bulk_person_permission"||String(st?.state_data?.member_code||"")!==bulkPerm[1]){
  await setFamilyFlowState(uid,"bulk_person_permission",{member_code:bulkPerm[1],selected:[]},u,k);
 }
 await showBulkPersonPermissionPicker(uid,bulkPerm[1],replyToken,token,u,k,pg);return true
}
bulkPerm=cmd.match(/^สลับเลือกหลายสิทธิ์\s+([a-f0-9]{12})\s+([a-f0-9]{12})\s+(\d+)$/i);
if(bulkPerm){
 if(!actorIsManager)throw new Error("permission_management_denied");
 const st=await getFamilyFlowState(uid,u,k);const arr=Array.isArray(st?.state_data?.selected)?st.state_data.selected:[];
 const set=new Set<string>(arr.map(String));const wasOn=set.has(bulkPerm[2]);if(wasOn)set.delete(bulkPerm[2]);else set.add(bulkPerm[2]);
 await setFamilyFlowState(uid,"bulk_person_permission",{member_code:bulkPerm[1],selected:[...set]},u,k);
 await showBulkPersonPermissionPicker(uid,bulkPerm[1],replyToken,token,u,k,Number(bulkPerm[3]||0),bulkPerm[2],!wasOn);return true
}
bulkPerm=cmd.match(/^ตั้งระดับหลายบุคคล\s+([a-f0-9]{12})$/i);
if(bulkPerm){
 const st=await getFamilyFlowState(uid,u,k);const n=Array.isArray(st?.state_data?.selected)?st.state_data.selected.length:0;
 if(!n){await showBulkPersonPermissionPicker(uid,bulkPerm[1],replyToken,token,u,k,0);return true}
 await replyLine(replyToken,"🔐 ตั้งสิทธิ์ให้ "+n+" คนพร้อมกัน\n\nเลือก preset ที่ต้องการ\n• ดูได้ = เปิดดูได้ แต่แก้ไขไม่ได้\n• ดูและแก้ไขได้ = ดู เพิ่ม และแก้ไขข้อมูลได้\n• ดูไม่ได้ = ไม่เปิดข้อมูลในหมวดที่เลือก",token,[
  qpb("👀 ผู้ที่ดูข้อมูลได้","ใช้ระดับหลายบุคคล "+bulkPerm[1]+" view"),
  qpb("✏️ ดูและแก้ไขได้","ใช้ระดับหลายบุคคล "+bulkPerm[1]+" manage"),
  qpb("🚫 ดูไม่ได้","ใช้ระดับหลายบุคคล "+bulkPerm[1]+" none"),
  qpb("↩️ กลับเลือกคน","เลือกหลายบุคคลสิทธิ์ "+bulkPerm[1])
 ]);return true
}
bulkPerm=cmd.match(/^ใช้ระดับหลายบุคคล\s+([a-f0-9]{12})\s+(none|view|manage)$/i);
if(bulkPerm){
 if(!actorIsManager)throw new Error("permission_management_denied");
 const st=await getFamilyFlowState(uid,u,k);const selected=Array.isArray(st?.state_data?.selected)?st.state_data.selected:[];
 if(!selected.length)throw new Error("person_targets_required");
 const rr=await rpcOne(u,k,"phms_set_line_member_person_access_bulk",{p_line_user_id:uid,p_member_code:bulkPerm[1],p_person_codes:selected,p_level:bulkPerm[2]});
 await rpcOne(u,k,"phms_clear_line_conversation_state",{p_line_user_id:uid});
 const bulkMsg=rr?.requested_owner_approval
   ?"📤 ส่งคำขอให้ผู้มีอำนาจดูแลข้อมูลแล้ว "+String(rr?.requested_people||selected.length)+" คน\n\nสิทธิ์จะยังไม่เปลี่ยนจนกว่าเจ้าของข้อมูลหรือผู้ดูแลหลักจะอนุมัติ"
   :"✅ ตั้งสิทธิ์หลายบุคคลแล้ว\nอัปเดต "+String(rr?.updated_people||selected.length)+" คน";
 await replyLine(replyToken,bulkMsg,token,[qpb("🛡️ ดูสิทธิ์สมาชิก","เลือกสมาชิก "+bulkPerm[1]),qpb("↩️ บทบาทและสิทธิ์","สิทธิ์สมาชิก")]);return true
}

let careMulti=cmd.match(/^เลือกผู้ช่วยหลายคน\s+([a-f0-9]{12})(?:\s+(\d+))?$/i);
if(careMulti){
 const st=await getFamilyFlowState(uid,u,k);
 if(st?.state_key!=="caregiver_multi"||String(st?.state_data?.person_code||"")!==careMulti[1])await setFamilyFlowState(uid,"caregiver_multi",{person_code:careMulti[1],selected:[]},u,k);
 await showCaregiverBulkPicker(uid,careMulti[1],replyToken,token,u,k,Number(careMulti[2]||0));return true
}
careMulti=cmd.match(/^สลับเลือกผู้ช่วย\s+([a-f0-9]{12})\s+([a-f0-9]{12})\s+(\d+)$/i);
if(careMulti){
 const st=await getFamilyFlowState(uid,u,k);const set=new Set<string>((Array.isArray(st?.state_data?.selected)?st.state_data.selected:[]).map(String));
 const wasOn=set.has(careMulti[2]);if(wasOn)set.delete(careMulti[2]);else set.add(careMulti[2]);
 await setFamilyFlowState(uid,"caregiver_multi",{person_code:careMulti[1],selected:[...set]},u,k);
 let memberName="สมาชิก";
 try{
  const md=await rpcOne(u,k,"phms_get_line_family_member_detail",{p_line_user_id:uid,p_member_code:careMulti[2]});
  memberName=String(md?.display_name||memberName)
 }catch{}
 await showCaregiverBulkPicker(uid,careMulti[1],replyToken,token,u,k,Number(careMulti[3]||0),(wasOn?"➖ เอาออก: ":"✅ เลือกเพิ่ม: ")+memberName);return true
}
careMulti=cmd.match(/^ยืนยันผู้ช่วยหลายคน\s+([a-f0-9]{12})$/i);
if(careMulti){
 const st=await getFamilyFlowState(uid,u,k);const selected=Array.isArray(st?.state_data?.selected)?st.state_data.selected:[];
 let ok=0,failed=0;const names:string[]=[];
 for(const mc of selected){
  try{
   const md=await rpcOne(u,k,"phms_get_line_family_member_detail",{p_line_user_id:uid,p_member_code:String(mc)});
   await rpcOne(u,k,"phms_set_line_person_caregiver_for_person",{p_line_user_id:uid,p_member_code:String(mc),p_person_code:careMulti[1],p_enabled:true,p_primary:false});
   ok++;names.push(String(md?.display_name||"สมาชิก"))
  }catch{failed++}
 }
 await rpcOne(u,k,"phms_clear_line_conversation_state",{p_line_user_id:uid});
 await replyLine(replyToken,"✅ เพิ่มผู้ช่วยดูแลแล้ว "+ok+" คน"+(names.length?"\n"+names.map((x:string)=>"• "+x).join("\n"):"")+(failed?"\n⚠️ ข้าม "+failed+" คนที่ตั้งไม่ได้/เป็นบัญชีของเจ้าตัวเอง":""),token,[qpb("👥 ดูผู้ช่วยดูแล","เปิดสิทธิ์บุคคล "+careMulti[1])]);return true
}

let selfReq=cmd.match(/^ขอผู้ช่วยดูแลตัวเอง\s+([a-f0-9]{12})(?:\s+(\d+))?$/i);
if(selfReq){
 const st=await getFamilyFlowState(uid,u,k);
 if(st?.state_key!=="self_caregiver_request_multi"||String(st?.state_data?.member_code||"")!==selfReq[1])await setFamilyFlowState(uid,"self_caregiver_request_multi",{member_code:selfReq[1],selected:[]},u,k);
 await showSelfCaregiverRequestPicker(uid,selfReq[1],replyToken,token,u,k,Number(selfReq[2]||0));return true
}
selfReq=cmd.match(/^สลับคำขอคนช่วย\s+([a-f0-9]{12})\s+([a-f0-9]{12})\s+(\d+)$/i);
if(selfReq){
 const st=await getFamilyFlowState(uid,u,k);const set=new Set<string>((Array.isArray(st?.state_data?.selected)?st.state_data.selected:[]).map(String));
 if(set.has(selfReq[2]))set.delete(selfReq[2]);else set.add(selfReq[2]);
 await setFamilyFlowState(uid,"self_caregiver_request_multi",{member_code:selfReq[1],selected:[...set]},u,k);
 await showSelfCaregiverRequestPicker(uid,selfReq[1],replyToken,token,u,k,Number(selfReq[3]||0));return true
}
selfReq=cmd.match(/^ส่งคำขอคนช่วย\s+([a-f0-9]{12})$/i);
if(selfReq){
 const st=await getFamilyFlowState(uid,u,k);const selected=Array.isArray(st?.state_data?.selected)?st.state_data.selected:[];
 if(!selected.length){await showSelfCaregiverRequestPicker(uid,selfReq[1],replyToken,token,u,k,0);return true}
 const rr=await rpcOne(u,k,"phms_request_line_self_caregivers",{p_line_user_id:uid,p_member_codes:selected,p_reason:null});
 await rpcOne(u,k,"phms_clear_line_conversation_state",{p_line_user_id:uid});
 await replyLine(replyToken,"📤 ส่งคำขอแล้ว\nคำขอใหม่ "+String(rr?.created||0)+" คน"+(rr?.already_exists_or_pending?"\nมีอยู่แล้ว/รออนุมัติ "+String(rr.already_exists_or_pending)+" คน":""),token,[qpb("🙋 กลับจัดการข้อมูลของฉัน","สิทธิ์ตัวเองสมาชิก "+selfReq[1])]);return true
}

let removeMember=cmd.match(/^นำสมาชิกออก\s+([a-f0-9]{12})$/i);
if(removeMember){
 if(prep?.is_owner!==true)throw new Error("owner_required_to_remove_member");
 const d=await rpcOne(u,k,"phms_get_line_family_member_detail",{p_line_user_id:uid,p_member_code:removeMember[1]});
 if(d?.is_owner)throw new Error("cannot_remove_family_owner");
 await replyLine(replyToken,"🗑️ นำสมาชิกออกจากครอบครัว\n\nสมาชิก: "+String(d?.display_name||"สมาชิก")+"\n\nอิ่มอุ่นจะปิดสมาชิกภาพและถอนสิทธิ์ที่ใช้งานอยู่ แต่ไม่ลบประวัติสุขภาพหรือ ประวัติการเปลี่ยนแปลง",token,[qpb("✅ ยืนยันนำออก","ยืนยันนำสมาชิกออก "+removeMember[1]),qpb("❌ ยกเลิก","บัญชีในครอบครัว")]);return true
}
removeMember=cmd.match(/^ยืนยันนำสมาชิกออก\s+([a-f0-9]{12})$/i);
if(removeMember){
 if(prep?.is_owner!==true)throw new Error("owner_required_to_remove_member");
 await rpcOne(u,k,"phms_remove_line_family_member",{p_line_user_id:uid,p_member_code:removeMember[1]});
 await showAccountMembers(uid,replyToken,token,u,k,"✅ นำสมาชิกออกจากครอบครัวแล้ว\n\n");return true
}
let removePerson=cmd.match(/^นำบุคคลออก\s+([a-f0-9]{12})$/i);
if(removePerson){
 if(prep?.is_owner!==true)throw new Error("owner_required_to_remove_person");
 let s:any=null;try{s=await rpcOne(u,k,"phms_get_line_prelink_person_setup",{p_line_user_id:uid,p_person_code:removePerson[1]})}catch{}
 await replyLine(replyToken,"🗑️ นำบุคคลออกจากครอบครัว\n\nบุคคล: "+String(s?.person_name||"บุคคล")+"\n\nใช้กับบุคคลที่ยังไม่เชื่อม LINE อิ่มอุ่นจะซ่อนออกจากบ้านแต่เก็บประวัติข้อมูลไว้",token,[qpb("✅ ยืนยันนำออก","ยืนยันนำบุคคลออก "+removePerson[1]),qpb("❌ ยกเลิก","บุคคลในครอบครัว")]);return true
}
removePerson=cmd.match(/^ยืนยันนำบุคคลออก\s+([a-f0-9]{12})$/i);
if(removePerson){
 if(prep?.is_owner!==true)throw new Error("owner_required_to_remove_person");
 await rpcOne(u,k,"phms_remove_line_family_person",{p_line_user_id:uid,p_person_code:removePerson[1]});
 await showMembers(uid,replyToken,token,u,k,"✅ นำบุคคลออกจากครอบครัวแล้ว\n\n");return true
}
if(["บุคคลในครอบครัว","คนในครอบครัว"].includes(cmd)){await showMembers(uid,replyToken,token,u,k);return true}
if(cmd==="ฉันทำอะไรได้บ้าง"){await showPermissionDashboard(uid,replyToken,token,u,k);return true}
let msa=cmd.match(/^สิทธิ์ตัวเองสมาชิก\s+([a-f0-9]{12})$/i);
if(msa){await showMemberSelfAccess(uid,msa[1],replyToken,token,u,k);return true}
msa=cmd.match(/^ตั้งสิทธิ์ตัวเองสมาชิก\s+([a-f0-9]{12})\s+(self_manage|view_only)$/i);
if(msa){
 const md=await rpcOne(u,k,"phms_get_line_family_member_detail",{p_line_user_id:uid,p_member_code:msa[1]});
 const a=await rpcOne(u,k,"phms_list_line_member_person_access",{p_line_user_id:uid,p_member_code:msa[1]});
 const selfDowngrade=md?.is_self===true&&a?.self_manage!==false&&msa[2]==="view_only";
 if(!actorIsManager&&!selfDowngrade)throw new Error("permission_management_denied");
 await rpcOne(u,k,"phms_set_line_person_self_access",{p_line_user_id:uid,p_person_code:String(a?.self_person_code||""),p_mode:msa[2],p_resource:null,p_action:null,p_enabled:null});
 await showMemberSelfAccess(uid,msa[1],replyToken,token,u,k);return true
}
let psa=cmd.match(/^สิทธิ์เจ้าตัวล่วงหน้า\s+([a-f0-9]{12})$/i);
if(psa){if(!actorIsManager)throw new Error("permission_management_denied");await showPrelinkSelfAccess(uid,psa[1],replyToken,token,u,k);return true}
psa=cmd.match(/^ตั้งสิทธิ์เจ้าตัวล่วงหน้า\s+([a-f0-9]{12})\s+(self_manage|view_only)$/i);
if(psa){
 if(!actorIsManager)throw new Error("permission_management_denied");
 await rpcOne(u,k,"phms_set_line_person_self_access",{p_line_user_id:uid,p_person_code:psa[1],p_mode:psa[2],p_resource:null,p_action:null,p_enabled:null});
 await showPrelinkSelfAccess(uid,psa[1],replyToken,token,u,k);return true
}
let selfToggle=cmd.match(/^สลับจัดการตัวเอง\s+([a-f0-9]{12})$/i);
if(selfToggle){
 if(!actorIsManager)throw new Error("permission_management_denied");
 const s=await rpcOne(u,k,"phms_get_line_prelink_person_setup",{p_line_user_id:uid,p_person_code:selfToggle[1]});
 await rpcOne(u,k,"phms_set_line_person_self_access",{p_line_user_id:uid,p_person_code:selfToggle[1],p_mode:s?.self_manage===false?"self_manage":"view_only",p_resource:null,p_action:null,p_enabled:null});
 await showCaregiverPickerForPerson(uid,selfToggle[1],replyToken,token,u,k);return true
}
let preHelp=cmd.match(/^สลับผู้ช่วยล่วงหน้า\s+([a-f0-9]{12})\s+([a-f0-9]{12})$/i);
if(preHelp){
 if(!actorIsManager)throw new Error("permission_management_denied");
 const subject=await rpcOne(u,k,"phms_get_line_prelink_person_setup",{p_line_user_id:uid,p_person_code:preHelp[2]});
 const row=(Array.isArray(subject?.pending_access)?subject.pending_access:[]).find((x:any)=>String(x?.target_person_code)===String(preHelp[1]));
 const enabled=!(row?.is_caregiver===true);
 await rpcOne(u,k,"phms_set_line_prelink_person_access_bundle",{
  p_line_user_id:uid,p_subject_person_code:preHelp[2],p_target_person_code:preHelp[1],
  p_is_caregiver:enabled,
  p_medications_level:enabled?"manage":"none",
  p_appointments_level:enabled?"manage":"none",
  p_health_level:enabled?"manage":"none",
  p_receive_notifications:enabled
 });
 await showCaregiverPickerForPerson(uid,preHelp[1],replyToken,token,u,k);return true
}
let newHelper=cmd.match(/^เพิ่มผู้ช่วยใหม่ให้บุคคล\s+([a-f0-9]{12})$/i);
if(newHelper){
 if(!actorIsManager)throw new Error("permission_management_denied");
 await rpcOne(u,k,"phms_set_line_conversation_state",{
  p_line_user_id:uid,p_state_key:"family_person_add_as_helper_for_target",
  p_state_data:{target_person_code:newHelper[1]},p_ttl_minutes:30
 });
 await replyLine(replyToken,
  "➕ สร้างบุคคลใหม่ที่จะมาช่วยจัดการ\n\nพิมพ์ชื่อที่ต้องการใช้เรียกบุคคลใหม่นี้\nหลังสร้าง อิ่มอุ่นจะตั้งการดูข้อมูลล่วงหน้าให้บุคคลใหม่นี้ช่วยจัดการเป้าหมายให้อัตโนมัติ",
  token,[qpb("❌ ยกเลิก","เลือกผู้ดูแลให้บุคคล "+newHelper[1])]);
 return true
}
let addForCare=cmd.match(/^เพิ่มบุคคลใหม่ให้ผู้ดูแล\s+([a-f0-9]{12})$/i);
if(addForCare){
 if(!actorIsManager)throw new Error("caregiver_management_denied");
 await rpcOne(u,k,"phms_set_line_conversation_state",{
  p_line_user_id:uid,
  p_state_key:"family_person_add_for_caregiver",
  p_state_data:{subject_person_code:addForCare[1]},
  p_ttl_minutes:30
 });
 await replyLine(replyToken,
  "➕ สร้างบุคคลใหม่ที่จะให้ดูแล\n\nพิมพ์ชื่อที่ต้องการใช้เรียกบุคคลใหม่นี้ก่อน\nเมื่อสร้างเสร็จ อิ่มอุ่นจะกลับมามอบหมายผู้ดูแลให้ต่ออัตโนมัติ",
  token,[qpb("❌ ยกเลิก","ตั้งค่าก่อนเชื่อม "+addForCare[1])]);
 return true
}
let cgp=cmd.match(/^เลือกผู้ดูแลให้บุคคล\s+([a-f0-9]{12})(?:\s+(\d+))?$/i);
if(cgp){await showCaregiverPickerForPerson(uid,cgp[1],replyToken,token,u,k,Number(cgp[2]||0));return true}
cgp=cmd.match(/^ตั้งเจ้าตัวดูแลตัวเอง\s+([a-f0-9]{12})$/i);
if(cgp){if(!actorIsManager)throw new Error("caregiver_management_denied");await setSelfCaregiverPrelink(uid,cgp[1],replyToken,token,u,k);return true}
cgp=cmd.match(/^(ตั้งผู้ดูแลให้บุคคล|ถอดผู้ดูแลให้บุคคล)\s+([a-f0-9]{12})\s+([a-f0-9]{12})$/i);
if(cgp){
 const enabled=cgp[1]==="ตั้งผู้ดูแลให้บุคคล";
 await rpcOne(u,k,"phms_set_line_person_caregiver_for_person",{p_line_user_id:uid,p_member_code:cgp[3],p_person_code:cgp[2],p_enabled:enabled,p_primary:false});
 let memberName="สมาชิก",personName="บุคคล";
 try{
  const md=await rpcOne(u,k,"phms_get_line_family_member_detail",{p_line_user_id:uid,p_member_code:cgp[3]});
  memberName=String(md?.display_name||memberName);
  const roster=await rpcOne(u,k,"phms_list_line_family_roster",{p_line_user_id:uid});
  const pr=(Array.isArray(roster?.entries)?roster.entries:[]).find((x:any)=>String(x?.person_code)===String(cgp[2]));
  personName=String(pr?.display_name||personName)
 }catch{}
 const confirm=enabled
  ?"✅ เพิ่ม "+memberName+" เป็นผู้ช่วยดูแลของ "+personName+" แล้ว"
  :"➖ ถอด "+memberName+" ออกจากผู้ช่วยดูแลของ "+personName+" แล้ว";
 await showCaregiverPickerForPerson(uid,cgp[2],replyToken,token,u,k,0,confirm);return true
}
if(cmd==="ชวนรับบุคคลปัจจุบัน"){
 if(!actorIsManager){await replyLine(replyToken,"🔐 การส่งคำเชิญเชื่อมบัญชีทำได้เฉพาะเจ้าบ้านหรือผู้ช่วยดูแลครอบครัว",token,[qpb("↩️ ครอบครัว","ครอบครัว")]);return true}
 return false
}
const memberInviteCommand=
 cmd==="ชวนเข้าครอบครัว"||
 cmd==="เมนูคำเชิญอื่น"||
 cmd==="ชวนสมาชิกทั่วไปจริง"||
 cmd==="ชวนผู้ดูแลบุคคลปัจจุบัน"||
 /^เลือกคนรับคำเชิญ หน้า\s+\d+$/.test(cmd)||
 /^สร้างคำเชิญให้บุคคล\s+[a-f0-9]{12}$/i.test(cmd)||
 /^สร้างคำเชิญผู้ดูแล\s+/.test(cmd);
if(memberInviteCommand&&!actorIsManager){
 await replyLine(replyToken,"🔐 การเพิ่มหรือเชิญสมาชิกใหม่ทำได้เฉพาะเจ้าบ้านหรือผู้ช่วยดูแลครอบครัว",token,[qpb("↩️ ครอบครัว","ครอบครัว")]);
 return true
}
if(cmd==="ชวนผู้ช่วยดูแลครอบครัว"&&!prep.is_owner){
 await replyLine(replyToken,"🔐 หน้าที่ผู้ช่วยดูแลครอบครัวกำหนดได้เฉพาะเจ้าบ้าน",token,[qpb("↩️ ครอบครัว","ครอบครัว")]);
 return true
}

if(cmd==="เมนูขอสิทธิ์ของฉัน"){await showMyRequestMenu(uid,replyToken,token,u,k);return true}
if(cmd==="เลือกบทบาทที่ต้องการขอ"){await showRoleRequestMenu(uid,replyToken,token,u,k);return true}
if(cmd==="เลือกบุคคลเพื่อขอสิทธิ์"){await choosePersonForMyRequest(uid,replyToken,token,u,k);return true}
let rq=cmd.match(/^ขอสิทธิ์แบบง่าย\s+([a-f0-9]{12})$/i);
if(rq){await showSimplePersonRequest(uid,rq[1],replyToken,token,u,k);return true}
rq=cmd.match(/^ส่งคำขอสิทธิ์แบบง่าย\s+([a-f0-9]{12})\s+(view|manage)$/i);
if(rq){
 const out=await rpcOne(u,k,"phms_request_line_person_bundle",{p_line_user_id:uid,p_person_code:rq[1],p_level:rq[2],p_reason:rq[2]==="manage"?"ขอสิทธิ์จัดการข้อมูลบุคคล":"ขอดูยา นัดหมาย และสุขภาพของบุคคล"});
 await replyLine(replyToken,out?.already_pending?"ℹ️ มีคำขอนี้รอพิจารณาอยู่แล้ว":"✅ ส่งคำขอไปยังเจ้าบ้านและผู้ช่วยดูแลครอบครัวแล้ว",token,[qpb("🛡️ ฉันทำอะไรได้บ้าง","สิทธิ์สมาชิก")]);
 return true
}
let cg=cmd.match(/^กำหนดผู้ดูแล\s+([a-f0-9]{12})$/i);
if(cg){await showCaregiverTargets(uid,cg[1],replyToken,token,u,k);return true}
cg=cmd.match(/^(มอบผู้ดูแล|ถอดผู้ดูแล)\s+([a-f0-9]{12})\s+([a-f0-9]{12})$/i);
if(cg){
 const enabled=cg[1]==="มอบผู้ดูแล";
 await rpcOne(u,k,"phms_set_line_person_caregiver_for_person",{p_line_user_id:uid,p_member_code:cg[2],p_person_code:cg[3],p_enabled:enabled,p_primary:false});
 await showCaregiverTargets(uid,cg[2],replyToken,token,u,k);
 return true
}
let pm=cmd.match(/^ตั้งค่าก่อนเชื่อม\s+([a-f0-9]{12})$/i);if(pm){await showPrelinkSetup(uid,pm[1],replyToken,token,u,k);return true}
pm=cmd.match(/^บทบาทล่วงหน้า\s+([a-f0-9]{12})$/i);if(pm){await showPrelinkRoles(uid,pm[1],replyToken,token,u,k);return true}
pm=cmd.match(/^สลับบทบาทล่วงหน้า\s+([a-f0-9]{12})\s+(admin|caregiver|patient|viewer)$/i);if(pm){await togglePrelinkRole(uid,pm[1],pm[2],replyToken,token,u,k);return true}
pm=cmd.match(/^สิทธิ์ล่วงหน้า\s+([a-f0-9]{12})$/i);if(pm){await choosePrelinkTarget(uid,pm[1],replyToken,token,u,k);return true}
pm=cmd.match(/^ตั้งการดูข้อมูลล่วงหน้า\s+([a-f0-9]{12})\s+([a-f0-9]{12})$/i);if(pm){await showPrelinkAccess(uid,pm[1],pm[2],replyToken,token,u,k);return true}
pm=cmd.match(/^ตั้งการดูข้อมูลล่วงหน้าทีละรายการ\s+([a-f0-9]{12})\s+([a-f0-9]{12})$/i);if(pm){await showPrelinkDirect(uid,pm[1],pm[2],replyToken,token,u,k);return true}
pm=cmd.match(/^สลับผู้ดูแลล่วงหน้า\s+([a-f0-9]{12})\s+([a-f0-9]{12})$/i);if(pm){const s=await rpcOne(u,k,"phms_get_line_prelink_person_setup",{p_line_user_id:uid,p_person_code:pm[1]});const row=(s?.pending_access||[]).find((x:any)=>String(x.target_person_code)===String(pm[2]))||{};await prelinkUpdate(uid,pm[1],pm[2],{is_caregiver:!row.is_caregiver},u,k);await showPrelinkDirect(uid,pm[1],pm[2],replyToken,token,u,k);return true}
pm=cmd.match(/^สลับแจ้งเตือนล่วงหน้า\s+([a-f0-9]{12})\s+([a-f0-9]{12})$/i);if(pm){const s=await rpcOne(u,k,"phms_get_line_prelink_person_setup",{p_line_user_id:uid,p_person_code:pm[1]});const row=(s?.pending_access||[]).find((x:any)=>String(x.target_person_code)===String(pm[2]))||{};await prelinkUpdate(uid,pm[1],pm[2],{receive_notifications:!row.receive_notifications},u,k);await showPrelinkDirect(uid,pm[1],pm[2],replyToken,token,u,k);return true}
pm=cmd.match(/^เลือกระดับล่วงหน้า\s+([a-f0-9]{12})\s+([a-f0-9]{12})\s+(profile|medications|appointments|health|emergency)$/i);if(pm){await replyLine(replyToken,"เลือกระดับที่ต้องการ",token,[qpb("ดูไม่ได้","ใช้ระดับล่วงหน้า "+pm[1]+" "+pm[2]+" "+pm[3]+" none"),qpb("ดูได้","ใช้ระดับล่วงหน้า "+pm[1]+" "+pm[2]+" "+pm[3]+" view"),qpb("ดูและแก้ไขได้","ใช้ระดับล่วงหน้า "+pm[1]+" "+pm[2]+" "+pm[3]+" manage"),qpb("↩️ กลับ","ตั้งการดูข้อมูลล่วงหน้าทีละรายการ "+pm[1]+" "+pm[2])]);return true}
pm=cmd.match(/^ใช้ระดับล่วงหน้า\s+([a-f0-9]{12})\s+([a-f0-9]{12})\s+(profile|medications|appointments|health|emergency)\s+(none|view|manage)$/i);if(pm){const patch:any={};const key=pm[3]==="profile"?"profile_level":pm[3]==="emergency"?"emergency_level":pm[3]+"_level";patch[key]=pm[4];await prelinkUpdate(uid,pm[1],pm[2],patch,u,k);await showPrelinkDirect(uid,pm[1],pm[2],replyToken,token,u,k);return true}
let dm=cmd.match(/^ตั้งสิทธิ์ทีละรายการ\s+([a-f0-9]{12})\s+([a-f0-9]{12})$/i);if(dm){await showPersonAccessDirectMenu(uid,dm[1],dm[2],replyToken,token,u,k);return true}
if(cmd==="ชวนเข้าครอบครัว"){await showFamilyPersonInvitePicker(uid,replyToken,token,u,k,0);return true}
if(cmd==="เมนูคำเชิญอื่น"){await showInviteTypeMenu(uid,replyToken,token,u,k);return true}
let fip=cmd.match(/^เลือกคนรับคำเชิญ หน้า\s+(\d+)$/i);
if(fip){await showFamilyPersonInvitePicker(uid,replyToken,token,u,k,Number(fip[1]||0));return true}
fip=cmd.match(/^สร้างคำเชิญให้บุคคล\s+([a-f0-9]{12})$/i);
if(fip){await createFamilyPersonInvite(uid,fip[1],replyToken,token,u,k);return true}
if(cmd==="ชวนสมาชิกทั่วไปจริง"){await createGeneralMemberInvite(uid,replyToken,token,u,k);return true}
if(cmd==="ชวนผู้ช่วยดูแลครอบครัว"){await createแอดมินInvite(uid,replyToken,token,u,k);return true}
if(cmd==="ชวนผู้ดูแลบุคคลปัจจุบัน"){await showCaregiverInvitePreset(uid,replyToken,token,u,k);return true}
let cim=cmd.match(/^สร้างคำเชิญผู้ดูแล\s+(caregiver_standard|viewer|role_only)$/);
if(cim){await createCaregiverInvite(uid,replyToken,token,u,k,String(cim[1]));return true}if(cmd==="ตรวจคำขอ"||cmd==="คำขอเชื่อมบุคคล"||cmd==="ตรวจคำขอเชื่อมบุคคล"){await showPersonClaimRequests(uid,replyToken,token,u,k,note);return true}let cm=cmd.match(/^(อนุมัติเชื่อมบุคคล|ปฏิเสธเชื่อมบุคคล)\s+([a-f0-9]{12})$/i);if(cm){const decision=cm[1].startsWith("อนุมัติ")?"approve":"reject";await rpcOne(u,k,"phms_review_person_claim_from_line",{p_line_user_id:uid,p_review_code:cm[2],p_decision:decision,p_reason:null});await replyLine(replyToken,decision==="approve"?"✅ อนุมัติคำขอเชื่อมบุคคลแล้ว\nระบบเชื่อมบัญชีกับบุคคลเรียบร้อย":"✅ ปฏิเสธคำขอเชื่อมบุคคลแล้ว",token,[qpb("🪪 ตรวจคำขอที่เหลือ","ตรวจคำขอ"),qpb("👨‍👩‍👧 ครอบครัว","ครอบครัว")]);return true}if(cmd==="สิทธิ์สมาชิก"){await showPermissionDashboard(uid,replyToken,token,u,k,note);return true}
if(["สมาชิก","สมาชิกครอบครัว","จัดการสมาชิก","บัญชีในครอบครัว"].includes(cmd)){await showAccountMembers(uid,replyToken,token,u,k,note);return true}let m=cmd.match(/^(?:เลือกสมาชิก|สิทธิ์สมาชิก)\s+([a-f0-9]{12})$/i);if(m){await showMemberDetail(uid,m[1],replyToken,token,u,k,note);return true}m=cmd.match(/^สิทธิ์(ข้อมูลส่วนตัว|ยา|นัดหมาย|สุขภาพ|ฉุกเฉิน|เอกสาร|ค่ารักษา|ค่าใช้จ่าย|เอกสาร|ค่ารักษา|ค่าใช้จ่าย)\s+([a-f0-9]{12})$/i);if(m){await replyLine(replyToken,"❤️ สิทธิ์สุขภาพกำหนดเป็นรายบุคคล\n\nเลือกเจ้าของข้อมูลสุขภาพก่อน แล้วค่อยกำหนดว่าใครดูหรือช่วยดูแลเรื่องไหนได้",token,[qpb("👤 เลือกคนในครอบครัว","บุคคลในครอบครัว"),qpb("↩️ กลับครอบครัว","ครอบครัว")]);return true}m=cmd.match(/^(ให้สิทธิ์|ถอนสิทธิ์)\s+([a-f0-9]{12})\s+(ข้อมูลส่วนตัว|ยา|นัดหมาย|สุขภาพ|ฉุกเฉิน|เอกสาร|ค่ารักษา|ค่าใช้จ่าย)\s+(ดู|เพิ่ม|แก้ไข|ลบ)$/i);if(m){await replyLine(replyToken,"❤️ ตอนนี้ข้อมูลสุขภาพไม่ใช้สิทธิ์ระดับครอบครัวแล้ว\n\nช่วยเลือกเจ้าของข้อมูลสุขภาพ แล้วตั้งสิทธิ์ให้สมาชิกคนนั้นเป็นรายบุคคล",token,[qpb("👤 เลือกคนในครอบครัว","บุคคลในครอบครัว"),qpb("↩️ กลับครอบครัว","ครอบครัว")]);return true}m=cmd.match(/^สิทธิ์อนุมัติ\s+([a-f0-9]{12})$/i);if(m){await replyLine(replyToken,"ℹ️ ไม่ใช้ตำแหน่งผู้อนุมัติรวมแล้ว\n\nเรื่องครอบครัวใช้ เจ้าบ้าน / ผู้ช่วยดูแลครอบครัว\nเรื่องสุขภาพใช้ เจ้าของข้อมูลสุขภาพ / ผู้ดูแลหลัก",token,[qpb("🏠 จัดการครอบครัว","ครอบครัว"),qpb("👤 เลือกข้อมูลสุขภาพ","บุคคลในครอบครัว")]);return true}m=cmd.match(/^(มอบสิทธิ์อนุมัติ|ถอนสิทธิ์อนุมัติ)\s+([a-f0-9]{12})$/i);if(m){await replyLine(replyToken,"ℹ️ ยกเลิกการมอบสิทธิ์อนุมัติรวมแล้ว\n\nหากช่วยจัดการครอบครัว ให้แต่งตั้งเป็นผู้ช่วยดูแลครอบครัว\nหากช่วยดูแลสุขภาพ ให้ตั้งสิทธิ์จากข้อมูลของคนนั้น",token,[qpb("🏠 จัดการครอบครัว","ครอบครัว"),qpb("👤 เลือกข้อมูลสุขภาพ","บุคคลในครอบครัว")]);return true}m=cmd.match(/^บทบาท\s+([a-f0-9]{12})$/i);if(m){await showRoles(uid,m[1],replyToken,token,u,k);return true}m=cmd.match(/^(ให้บทบาท|ถอนบทบาท)\s+([a-f0-9]{12})\s+(admin|แอดมิน|caregiver|ผู้ดูแล|viewer|สมาชิก|patient|ผู้ป่วย)$/i);if(m){
 const role=roleMap[m[3]];
 if(role==="viewer"||role==="patient"||role==="member"){await replyLine(replyToken,"ทุกคนที่เข้าบ้านเป็นสมาชิกครอบครัวอยู่แล้ว ไม่ต้องเลือกบทบาทเพิ่ม",token);return true}
 if(role==="caregiver"){await replyLine(replyToken,"หากต้องการให้ช่วยดูแลเรื่องยา หรือนัดหมอ ให้เลือกคนและเรื่องที่ต้องการในหน้าข้อมูลสุขภาพ",token,[qpb("👤 ไปหน้าคนในบ้าน","บุคคลในครอบครัว")]);return true}
 const enabled=m[1]==="ให้บทบาท";
 await rpcOne(u,k,"phms_set_line_family_role",{p_line_user_id:uid,p_member_code:m[2],p_role:role,p_enabled:enabled});
 await showRoles(uid,m[2],replyToken,token,u,k);return true
}
m=cmd.match(/^ตั้งสิทธิ์เร็ว\s+([a-f0-9]{12})\s+([a-f0-9]{12})\s+(view|manage|caregiver|none)$/i);
if(m){
 if(!actorIsManager)throw new Error("permission_management_denied");
 const level=m[3];
 const rr=await rpcOne(u,k,"phms_set_line_person_access_bundle",{
  p_line_user_id:uid,p_member_code:m[1],p_person_code:m[2],
  p_is_caregiver:level==="caregiver",
  p_medications_level:level==="none"?"none":level==="view"?"view":"manage",
  p_appointments_level:level==="none"?"none":level==="view"?"view":"manage",
  p_health_level:level==="none"?"none":level==="view"?"view":"manage",
  p_receive_notifications:level==="caregiver"
 });
 if(rr?.status==="pending_owner_approval"){
  await replyLine(replyToken,rr?.already_pending?"⏳ อัปเดตคำขอเดิมที่รอผู้มีอำนาจดูแลข้อมูลแล้ว":"📤 ส่งคำขอให้ผู้มีอำนาจดูแลข้อมูลอนุมัติแล้ว",token,[qpb("↩️ กลับ","สิทธิ์บุคคล "+m[1]+" "+m[2])]);return true
 }
 await showPersonPermissionSummary(uid,m[1],m[2],replyToken,token,u,k,"✅ อัปเดตสิทธิ์แล้ว\n\n");return true
}
m=cmd.match(/^สิทธิ์เฉพาะบุคคล\s+([a-f0-9]{12})$/i);if(m){await choosePersonForMember(uid,m[1],replyToken,token,u,k);return true}m=cmd.match(/^สิทธิ์บุคคล\s+([a-f0-9]{12})\s+([a-f0-9]{12})$/i);if(m){await showPersonPermissionSummary(uid,m[1],m[2],replyToken,token,u,k,note);return true}m=cmd.match(/^สิทธิ์บุคคล(ข้อมูลส่วนตัว|ยา|นัดหมาย|สุขภาพ|ฉุกเฉิน|เอกสาร|ค่ารักษา|ค่าใช้จ่าย)\s+([a-f0-9]{12})\s+([a-f0-9]{12})$/i);if(m){await showPersonResource(uid,m[2],m[3],resourceMap[m[1]],replyToken,token,u,k);return true}m=cmd.match(/^(ให้สิทธิ์บุคคล|ถอนสิทธิ์บุคคล)\s+([a-f0-9]{12})\s+([a-f0-9]{12})\s+(ข้อมูลส่วนตัว|ยา|นัดหมาย|สุขภาพ|ฉุกเฉิน|เอกสาร|ค่ารักษา|ค่าใช้จ่าย)\s+(ดู|เพิ่ม|แก้ไข|ลบ|แจ้งเตือน)$/i);if(m){const enabled=m[1]==="ให้สิทธิ์บุคคล";const rr=await rpcOne(u,k,"phms_set_line_person_permission",{p_line_user_id:uid,p_member_code:m[2],p_person_code:m[3],p_resource:resourceMap[m[4]],p_action:actionMap[m[5]],p_enabled:enabled});if(rr?.status==="pending_owner_approval"){await replyLine(replyToken,(rr?.already_pending?"⏳ อัปเดตคำขอเดิมแล้ว":"📤 ส่งคำขอให้ผู้มีอำนาจดูแลข้อมูลแล้ว")+"\n\nสิทธิ์จะยังไม่เปลี่ยนจนกว่าเจ้าของข้อมูลหรือผู้ดูแลหลักจะอนุมัติ",token,[qpb("↩️ สรุปสิทธิ์","สิทธิ์บุคคล "+m[2]+" "+m[3]),qpb("📥 คำขอสิทธิ์","ตรวจคำขอสิทธิ์")]);return true}await queuePermissionNotice(u,k,uid,m[2],(enabled?"ได้รับ":"ถูกถอน")+"สิทธิ์ "+m[5]+" "+m[4]+" สำหรับบุคคลที่ได้รับมอบหมาย");await showPersonResource(uid,m[2],m[3],resourceMap[m[4]],replyToken,token,u,k,(enabled?"เพิ่ม":"ถอน")+"สิทธิ์ "+m[5]+" "+m[4]);return true}if(cmd==="คำขอสิทธิ์"||cmd==="ตรวจคำขอสิทธิ์"){await showReviewRequests(uid,replyToken,token,u,k,note);return true}m=cmd.match(/^(อนุมัติสิทธิ์|ปฏิเสธสิทธิ์)\s+([a-f0-9]{12})(?:\s+(.+))?$/i);if(m){const decision=m[1].startsWith("อนุมัติ")?"approved":"rejected";await rpcOne(u,k,"phms_review_line_access_request",{p_line_user_id:uid,p_request_code:m[2],p_decision:decision,p_review_note:m[3]??null});await replyLine(replyToken,`${note}${decision==="approved"?"✅ อนุมัติคำขอสิทธิ์แล้ว":"✅ ปฏิเสธคำขอสิทธิ์แล้ว"}`,token,[qpb("📥 ดูคำขอที่เหลือ","ตรวจคำขอสิทธิ์"),qpb("👨‍👩‍👧 ครอบครัว","ครอบครัว")]);return true}if(cmd==="ขอสิทธิ์"){await replyLine(replyToken,requestHelpText(note),token,[q("💊 ขอสิทธิ์ดูยา","ขอสิทธิ์ ยา ดู"),q("🩺 ขอสิทธิ์ดูสุขภาพ","ขอสิทธิ์ สุขภาพ ดู"),q("📅 ขอสิทธิ์ดูนัด","ขอสิทธิ์ นัดหมาย ดู"),q("🛡️ ขอสิทธิ์อนุมัติ","ขอสิทธิ์อนุมัติ")]);return true}m=cmd.match(/^ขอสิทธิ์\s+(ข้อมูลส่วนตัว|ยา|นัดหมาย|สุขภาพ|ฉุกเฉิน|เอกสาร|ค่ารักษา|ค่าใช้จ่าย)\s+(ดู|เพิ่ม|แก้ไข|ลบ)$/i);if(m){const r=resourceMap[m[1]],a=actionMap[m[2]],out=await rpcOne(u,k,"phms_request_line_access",{p_line_user_id:uid,p_request_type:"permission",p_requested_role:null,p_person_code:null,p_resource:r,p_requested_action:a,p_reason:null});await replyLine(replyToken,`${note}${out.already_pending?"ℹ️ มีคำขอนี้รอตรวจอยู่แล้ว":"✅ ส่งคำขอสิทธิ์แล้ว"}\n${resourceLabel(r)} • ${actionLabel(a)}`,token,[q("👨‍👩‍👧 ครอบครัว","ครอบครัว")]);return true}if(cmd==="ขอสิทธิ์อนุมัติ"){const out=await rpcOne(u,k,"phms_request_line_access",{p_line_user_id:uid,p_request_type:"permission",p_requested_role:null,p_person_code:null,p_resource:"permissions",p_requested_action:"manage_permissions",p_reason:"ขอสิทธิ์อนุมัติ/จัดการสิทธิ์จาก LINE"});await replyLine(replyToken,`${note}${out.already_pending?"ℹ️ มีคำขอสิทธิ์อนุมัติรอตรวจอยู่แล้ว":"✅ ส่งคำขอสิทธิ์อนุมัติให้ เจ้าบ้าน พิจารณาแล้ว"}`,token);return true}m=cmd.match(/^ขอบทบาท\s+(admin|แอดมิน|caregiver|ผู้ดูแล|viewer|สมาชิก|patient|ผู้ป่วย)$/i);if(m){
 const role=roleMap[m[1]];
 if(role==="viewer"||role==="patient"||role==="member"){await replyLine(replyToken,"คุณเป็นสมาชิกครอบครัวอยู่แล้ว ไม่ต้องขอเพิ่ม",token);return true}
 if(role==="caregiver"){await choosePersonForMyRequest(uid,replyToken,token,u,k);return true}
 const out=await rpcOne(u,k,"phms_request_line_access",{p_line_user_id:uid,p_request_type:"role",p_requested_role:role,p_person_code:null,p_resource:null,p_requested_action:null,p_reason:null});
 await replyLine(replyToken,`${note}${out.already_pending?"ℹ️ มีคำขอนี้รอตรวจอยู่แล้ว":"✅ ส่งคำขอบทบาท "+roleThai(role)+" ไปให้เจ้าบ้านและผู้ช่วยดูแลครอบครัวแล้ว"}`,token);return true
}m=cmd.match(/^ขอสิทธิ์บุคคล\s+([a-f0-9]{12})\s+(ข้อมูลส่วนตัว|ยา|นัดหมาย|สุขภาพ|ฉุกเฉิน|เอกสาร|ค่ารักษา|ค่าใช้จ่าย)\s+(ดู|เพิ่ม|แก้ไข|ลบ|แจ้งเตือน)$/i);if(m){const r=resourceMap[m[2]],a=actionMap[m[3]],out=await rpcOne(u,k,"phms_request_line_access",{p_line_user_id:uid,p_request_type:"permission",p_requested_role:null,p_person_code:m[1],p_resource:r,p_requested_action:a,p_reason:null});await replyLine(replyToken,`${note}${out.already_pending?"ℹ️ มีคำขอนี้รอตรวจอยู่แล้ว":`✅ ส่งคำขอสิทธิ์เฉพาะบุคคลแล้ว\n${resourceLabel(r)} • ${actionLabel(a)}`}`,token);return true}return false}catch(e){console.error("family_route",String(e));const careBack=cmd.match(/^(?:ตั้งผู้ดูแลให้บุคคล|ถอดผู้ดูแลให้บุคคล)\s+([a-f0-9]{12})\s+[a-f0-9]{12}$/i);await replyLine(replyToken,familyError(e),token,careBack?[qpb("👥 คนที่ช่วย","เลือกผู้ดูแลให้บุคคล "+careBack[1]),qpb("👤 คนในบ้าน","บุคคลในครอบครัว")]:[q("👨‍👩‍👧 ครอบครัว","ครอบครัว"),q("🏠 เปลี่ยนครอบครัว","เลือกครอบครัว")]);return true}}
/* PHMS_PERSON_APPOINTMENTS_ROUTER_FASTPATH_V1
 The person overview "ดูนัด" button must not rely on the heavy core function.
 Resolve the person-scoped code, check appointment view permission, and reply with
 a compact, LINE-valid summary. All queries remain on existing authorized RPCs. */
async function phmsRouterPersonAppointmentCard(
 uid:string,rt:string,token:string,u:string,k:string,personCode:string=''
){
 try{
  if(personCode){
   const selected=await rpcOne(u,k,"phms_select_line_context_person",{
    p_line_user_id:uid,p_selection_code:personCode
   });
   if(selected?.context_ready!==true)throw new Error("person_context_not_ready");
  }
  const workspace=await rpcOne(u,k,"phms_line_appointment_view_request_workspace",{
   p_line_user_id:uid
  });
  if(workspace?.can_view!==true){
   await replyLine(rt,"🔒 ยังไม่มีสิทธิ์ดูนัดหมายของบุคคลนี้",token,[
    qpb("👤 ภาพรวมบุคคล","กลับภาพรวมบุคคล")
   ]);
   return;
  }
  const ov=await rpcOne(u,k,"phms_line_appointment_overview",{
   p_line_user_id:uid,p_upcoming_limit:10,p_history_limit:4
  });
  if(!ov||typeof ov!=="object")throw new Error("appointment_overview_unavailable");
  const upcoming=Array.isArray(ov.upcoming)?ov.upcoming:[];
  const overdue=Array.isArray(ov.overdue)?ov.overdue:[];
  const history=Array.isArray(ov.history)?ov.history:[];
  const who=String(ov.person_name||workspace.person_name||"บุคคลนี้");
  const date=(v:any)=>{
   const t=new Date(String(v||""));
   return Number.isNaN(t.valueOf())?"ไม่ระบุวัน":
     new Intl.DateTimeFormat("th-TH",{timeZone:"Asia/Bangkok",day:"numeric",month:"short",year:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).format(t);
  };
  const short=(v:any,max=125)=>{const s=String(v??"").replace(/\s+/g," ").trim();return s.length>max?s.slice(0,max-1)+"…":s};
  const upcomingSorted=upcoming.slice().sort((a:any,b:any)=>new Date(a.appointment_at).valueOf()-new Date(b.appointment_at).valueOf());
  const shown=upcomingSorted.length?[upcomingSorted[0]]:[];
  const summary=(label:string,count:number,bg:string)=>({type:"box",layout:"vertical",flex:1,backgroundColor:bg,cornerRadius:"12px",paddingAll:"10px",alignItems:"center",contents:[
   {type:"text",text:label,size:"sm",color:"#344054",align:"center",wrap:true},
   {type:"text",text:String(count)+" นัด",size:"lg",weight:"bold",color:"#263649",align:"center"}
  ]});
  const body:any[]=[
   {type:"box",layout:"horizontal",spacing:"sm",contents:[
    summary("กำลังจะถึง",upcoming.length,"#EAF2FA"),
    summary("เลยกำหนด",overdue.length,"#FFF0E7")
   ]},
   {type:"separator",margin:"md"},
   {type:"text",text:"นัดถัดไป",size:"md",weight:"bold",color:"#263649"}
  ];
  if(!shown.length)body.push({type:"text",text:"ยังไม่มีนัดที่กำลังจะมาถึง",size:"md",color:"#475569",wrap:true});
  for(const a of shown){
   const hospital=String(a.hospital_name||"").trim();
   body.push(
    {type:"text",text:short(a.title||"นัดหมาย"),size:"md",weight:"bold",color:"#263649",wrap:true,maxLines:2},
    {type:"text",text:"🕒 "+date(a.appointment_at),size:"sm",color:"#344054",wrap:true},
    ...(hospital?[{type:"text",text:"🏥 "+short(hospital,90),size:"sm",color:"#475569",wrap:true,maxLines:2}]:[]),
    ...(a.doctor_name?[{type:"text",text:"🧑‍⚕️ "+short(a.doctor_name,90),size:"sm",color:"#475569",wrap:true,maxLines:2}]:[])
   );
   if(a.code)body.push({type:"button",style:"primary",color:"#866337",height:"md",action:{type:"postback",label:"🔎 ดูรายละเอียดนัดนี้",data:"ดูนัด "+String(a.code)}});
  }
  const card:any={type:"bubble",size:"kilo",
   header:{type:"box",layout:"vertical",backgroundColor:"#FFF5E5",paddingAll:"14px",contents:[
    {type:"text",text:"📅 นัดหมาย",size:"lg",weight:"bold",color:"#85571D"},
    {type:"text",text:"ข้อมูลของ "+short(who,120),size:"sm",color:"#805E32",margin:"xs",wrap:true}
   ]},
   body:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"14px",contents:body},
   footer:{type:"box",layout:"vertical",spacing:"sm",paddingAll:"10px",contents:[
    {type:"button",style:"primary",color:"#AD762A",height:"md",action:{type:"postback",label:"📅 ดูนัดทั้งหมด",data:"รายการนัดของคนนี้ทุกช่วงเวลา 0"}},
    {type:"box",layout:"vertical",backgroundColor:"#E5F1F8",cornerRadius:"12px",paddingAll:"13px",action:{type:"postback",label:"กลับภาพรวมบุคคล",data:"กลับภาพรวมบุคคล",displayText:"↩️ กลับภาพรวมบุคคล"},contents:[{type:"text",text:"↩️ กลับภาพรวม"+short(who,24),size:"md",weight:"bold",color:"#263649",align:"center",wrap:true}]}
   ]}
  };
  await replyMessages(rt,token,[{type:"flex",altText:"📅 นัดหมายของ "+short(who,120),contents:card}]);
 }catch(err){
  console.error("phms_person_appointments_router_fastpath",String(err).slice(0,200));
  await replyLine(rt,"⚠️ ยังเปิดนัดหมายไม่ได้ ลองเปิดหน้าบุคคลใหม่แล้วกดอีกครั้งนะ",token,[
   qpb("👤 ภาพรวมบุคคล","กลับภาพรวมบุคคล")
  ]);
 }
}

async function forwardToCore(body:any,events:any[],secret:string,u:string){if(!events.length)return;const forwarded={...body,events},raw=JSON.stringify(forwarded),sig=await signRaw(raw,secret);const r=await fetch(`${u}/functions/v1/line-webhook`,{method:"POST",headers:{"Content-Type":"application/json","x-line-signature":sig},body:raw});if(!r.ok)console.error("core_forward",r.status,await r.text())}
Deno.serve(async(req)=>{const token=Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN"),secret=Deno.env.get("LINE_CHANNEL_SECRET"),u=Deno.env.get("SUPABASE_URL"),k=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(!token||!secret||!u||!k)return new Response("server_not_configured",{status:503});if(req.method!=="POST")return new Response("method_not_allowed",{status:405});const sig=req.headers.get("x-line-signature");if(!sig)return new Response("unauthorized",{status:401});const raw=await req.text();if(!(await validSignature(raw,sig,secret)))return new Response("invalid_signature",{status:401});let body:any;try{body=JSON.parse(raw)}catch{return new Response("invalid_json",{status:400})}const forward:any[]=[];const postCore:any[]=[];for(const event of body.events??[]){const uid=event?.source?.type==="user"?event?.source?.userId:null,isText=event?.type==="message"&&event?.message?.type==="text"&&event?.replyToken,isPostback=event?.type==="postback"&&event?.replyToken;
if(uid){
  try{
    const rl=await rateLimit(u,k,"line_router_user",String(uid),60,60);
    if(rl?.allowed===false){
      if(event?.replyToken)await replyLine(event.replyToken,"⚠️ ส่งคำสั่งถี่เกินไป กรุณารอสักครู่แล้วลองใหม่",token);
      continue;
    }
  }catch(e){console.error("router_rate_limit",String(e));return new Response("rate_limit_unavailable",{status:503})}
}
if(uid && event?.type==="message" && event?.message?.type==="image" && event?.replyToken){
 let active=false;
 try{const state=await rpcOne(u,k,"phms_line_bug_report_active",{p_line_user_id:uid});active=state?.active===true}catch{}
 if(active){
  try{
   const mid=String(event.message.id||"");
   if(!/^[0-9]{1,40}$/.test(mid))throw Error("invalid_line_image_id");
   const content=await fetch("https://api-data.line.me/v2/bot/message/"+mid+"/content",{headers:{Authorization:"Bearer "+token}});
   if(!content.ok)throw Error("line_image_download_failed_"+content.status);
   const mime=String(content.headers.get("content-type")||"").split(";")[0].trim().toLowerCase();
   if(!["image/jpeg","image/png","image/webp"].includes(mime))throw Error("unsupported_image_type");
   const bytes=await content.arrayBuffer();
   if(bytes.byteLength<1||bytes.byteLength>10485760)throw Error("image_size_out_of_range");
   const extension=mime==="image/png"?"png":mime==="image/webp"?"webp":"jpg";
   const path="line-bug/"+uid+"/"+mid+"."+extension;
   const uploaded=await fetch(u+"/storage/v1/object/phms-bug-reports/"+path,{method:"POST",headers:{"Authorization":"Bearer "+k,"apikey":k,"Content-Type":mime,"x-upsert":"false"},body:bytes});
   if(!uploaded.ok)throw Error("bug_image_storage_"+uploaded.status);
   const result=await rpcOne(u,k,"phms_line_bug_report_image_capture",{p_line_user_id:uid,p_message_id:mid,p_storage_path:path});
   if(result?.captured!==true)throw Error("image_report_not_active");
   await replyLine(event.replyToken,"✅ รับแจ้งปัญหาและรูปแล้ว\nเลขที่ "+String(result.report_code||""),token);
  }catch(e){
   console.error("bug_report_image_upload",String(e));
   await replyLine(event.replyToken,"⚠️ แนบรูปไม่สำเร็จ ลองส่งรูปอีกครั้ง หรือพิมพ์ 'ยกเลิกแจ้งปัญหา' ได้เลย",token);
  }
  continue
 }
}
if(!uid||(!isText&&!isPostback)){forward.push(event);continue}const cmd=normalize(String(isPostback?(event.postback?.data??""):(event.message?.text??""))),identity=await getIdentity(u,k,uid);if(identity?.onboarding_status!=="ready"||!identity?.user_id){forward.push(event);continue}
if(/^phms_refill_(?:begin|cancel|confirm|back|meds_done|med\s|detail\s)/.test(cmd)){forward.push(event);continue}
const key=commandKey(cmd);

// Person directory / picker belongs to the core flow because the core keeps the
// people_choice conversation state and resolves both hidden postbacks and typed nicknames.
// If the router consumes the opening command, the next "เลือกบุคคล ..." or typed name
// reaches core without that state and falls into the generic fallback.
if(
  ['เปิดบุคคลที่ฉันดูแล','คนในบ้าน','👪 คนในบ้าน','👥 คนในบ้าน','คนในครอบครัว','ดูคนในครอบครัว','บุคคลในครอบครัว','บุคคลที่ฉันดูแล','เลือกคน','เปลี่ยนคน','ถังขยะ','กู้คืนข้อมูล'].includes(cmd)
  || /^เลือกบุคคล\s+/.test(cmd)
){
  forward.push(event);
  continue
}

// AIM_PERSON_CARD_ROUTE_OWNER_V1: individual cards and personal ordering stay in core.
// Both old and new person cards carry the same hidden postback; never handle in legacy family router.
if(/^ตั้งสีบุคคล\s+[a-f0-9]{12}$/i.test(cmd)){
 const code=cmd.match(/[a-f0-9]{12}$/i)?.[0];
 if(code){try{await rpcOne(u,k,"phms_select_line_context_person",{p_line_user_id:uid,p_selection_code:code})}catch(e){console.error("color_select_context",String(e))}}
 forward.push(event);continue
}
if(/^เปิดรายละเอียดบุคคล\s+[a-f0-9]{12}$/i.test(cmd)){forward.push(event);continue}
if(cmd==="รายละเอียดบุคคล" || cmd==="ดูรายละเอียดบุคคล"){forward.push(event);continue}
if(cmd==="กลับภาพรวมบุคคล"){forward.push(event);continue}
// AIM_PERSON_OVERVIEW_CORE_OWNER_V2: Use the unified person overview (photo, details, category cards).
// Never render the legacy router dashboard for this postback.
if(/^เปิดบุคคล\s+[a-f0-9]{12}$/i.test(cmd)){forward.push(event);continue}
if(/^ใช้สีบุคคล\s+[a-f0-9]{12}\s+(?:#[a-f0-9]{6}|auto)$/i.test(cmd)
 || /^เปิดบุคคล\s+[a-f0-9]{12}$/i.test(cmd)
 || /^ตั้งลำดับบุคคล\s+[a-f0-9]{12}\s+(?:pin|unpin|move_up|move_down)(?:\s+\d+)?$/i.test(cmd)
 || /^จัดลำดับบุคคล(?:\s+(?:หน้า\s+)?\d+)?$/i.test(cmd)){
 forward.push(event);
 continue
}

// AIM-FAMILY-ROUTER-SINGLE-OWNER-V1: The core owns the new family overview card.
// Never let the router's legacy family dashboard swallow this command.
if(["ครอบครัว","🏠 ครอบครัว","👨‍👩‍👧‍👦 ครอบครัว","เปิดครอบครัวจากหน้าเริ่มต้น","↩️ ครอบครัว","↩️ คนในบ้าน","บุคคลในครอบครัว","คนในครอบครัว"].includes(cmd)){forward.push(event);continue;}
const personAppointmentCard=cmd.match(/^เปิดนัดจากภาพรวม(?:\s+([a-f0-9]{12}))?$/i);
if(personAppointmentCard){
 await phmsRouterPersonAppointmentCard(uid,event.replyToken,token,u,k,String(personAppointmentCard[1]||""));
 continue
}
if(await routeHouseholdWorkflow(cmd,uid,event.replyToken,token,u,k))continue;
if(key==="medications"||key==="appointments"||key==="health"||key==="help"){
  const canonicalText=key==="medications"?"ยา":key==="appointments"?"นัดหมาย":key==="health"?"สุขภาพ":"ช่วยเหลือ";
  forward.push({...event,message:{...event.message,text:canonicalText}});
  continue
}
if(cmd==="ข้อมูลที่กำลังดู"||cmd==="บริบท"){await showCurrentSelection(uid,event.replyToken,token,u,k);continue}
if(cmd==="เปลี่ยนข้อมูลที่ดู"||cmd==="สลับบริบท"){await showSwitchSelection(event.replyToken,token);continue}
// Family navigation is forwarded to the core above; do not duplicate replies.
if(await blockLimitedAppointmentDetail(cmd,uid,event.replyToken,token,u,k))continue;
if(await routeTreatmentEpisodes(cmd,String(isPostback?(event.postback?.data??""):(event.message?.text??"")),uid,event.replyToken,token,u,k))continue;
if(await routeAppointmentPreparation(cmd,String(isPostback?(event.postback?.data??""):(event.message?.text??"")),uid,event.replyToken,token,u,k))continue;
if(await routeAppointmentLinkManager(cmd,uid,event.replyToken,token,u,k))continue;
if(await routeAppointmentPreviousChain(cmd,uid,event.replyToken,token,u,k))continue;
if(await routeAppointmentNotificationSettings(cmd,uid,event.replyToken,token,u,k))continue;
if(await routeAppointmentManualNotify(cmd,uid,event.replyToken,token,u,k))continue;
if(await routeAppointmentCreateConfirm(cmd,uid,event.replyToken,token,u,k))continue;
if(await routeAppointmentAssigneePicker(cmd,uid,event.replyToken,token,u,k))continue;
if(await routeSavedFinance(cmd,uid,event.replyToken,token,u,k))continue;
if(await routeAppointmentFinanceReview(cmd,String(isPostback?(event.postback?.data??""):(event.message?.text??"")),uid,event.replyToken,token,u,k))continue;
if(await routeAppointmentAttachmentCountPrompt(cmd,uid,event.replyToken,token,u,k))continue;
if(cmd==="สร้างครอบครัว"||cmd==="เข้าร่วมครอบครัว"){
  try{await rpcRaw(u,k,"phms_clear_line_conversation_state",{p_line_user_id:uid})}catch(e){console.error("clear_family_action_state",String(e))}
  forward.push(event);continue
}
if(await routeFamily(cmd,uid,event.replyToken,token,u,k))continue;
if(key){try{await handleMain(uid,event.replyToken,key,token,u,k)}catch(e){console.error("main_route",String(e));await replyLine(event.replyToken,"⚠️ ยังเปิดเมนูนี้ไม่ได้ ลองอีกครั้งนะอีกครั้ง",token)}continue}
const mutation=await captureAppointmentEditMutation(uid,cmd,u,k);
if(mutation)postCore.push({uid,marker:mutation});
forward.push(event)}
await forwardToCore(body,forward,secret,u);
for(const f of postCore){
 try{
  if(await appointmentEditMutationSucceeded(f.uid,f.marker,u,k)){
   await pushAppointmentNotifyChoice(f.uid,token,String(f.marker.record_code),"updated")
  }
 }catch(err){console.error("post_core_appointment_notify_choice",String(err))}
}
return Response.json({ok:true,handled:(body.events?.length??0)-forward.length,forwarded:forward.length})});