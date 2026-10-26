import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const input=process.argv[2];
if(!input)throw Error('Usage: node scripts/integrate-smart-health.mjs <latest-production-index.ts>');
let source=await fs.readFile(input,'utf8');
if(source.includes('PHMS_SMART_HEALTH_RUNTIME_V1'))throw Error('Smart Health already integrated; inspect before applying again');
const anchor="if(e.type==='message'&&e.message.type!=='text'){try{await handleLineMedia(e,u,k,id,t)}";
if(source.split(anchor).length!==2)throw Error('Production media dispatch changed; automatic patch refused');
const hook=`/* PHMS_SMART_HEALTH_RUNTIME_V1
 Pilot controlled by the existing database runtime configuration.
 Gate stays closed until isolated integration, production permissions and device UAT pass. */
if(sourceType==='user'&&id&&e.replyToken&&await phmsSmartHealthEnabled(u,k,id)){
 try{
  const handled=await handleSmartHealth(e,{
   rpc:async(n:string,p:any)=>one(await rpc(u,k,n,p)),
   getState:()=>getState(u,k,id),state:(key:string,data:any)=>state(u,k,id,key,data),clear:()=>clear(u,k,id),
   send:(messages:any[])=>replyMessages(e.replyToken,t,messages),
   people:()=>listAccessibleResourcePeopleAction(u,k,id,'health','create'),
   select:async(person:any)=>{await rpc(u,k,'phms_select_line_context_family',{p_line_user_id:id,p_selection_code:person.family_selection_code});await rpc(u,k,'phms_select_line_context_person',{p_line_user_id:id,p_selection_code:person.person_selection_code});},
   self:async()=>{await rpc(u,k,'phms_set_line_personal_context',{p_line_user_id:id});},
   upload:async(path:string,bytes:Uint8Array,mime:string)=>{const r=await uploadTemp(u,k,path,bytes,mime,'phms-medical-sources');if(!r.ok)throw Error('health_evidence_upload_failed');},
   remove:async(path:string)=>{const r=await fetch(u+'/storage/v1/object/phms-medical-sources',{method:'DELETE',headers:H(k),body:JSON.stringify({prefixes:[path]})});if(!r.ok)throw Error('health_evidence_cleanup_failed');},
   sign:(bucket:string,path:string)=>signGalleryObject(u,k,bucket,path,300),
   media:async(ev:any)=>{if(ev.message?.contentProvider?.type==='external')throw Error('ส่งรูปเข้าแชตโดยตรงอีกครั้ง');const r=await fetch('https://api-data.line.me/v2/bot/message/'+encodeURIComponent(String(ev.message.id))+'/content',{headers:{Authorization:'Bearer '+t}});if(!r.ok)throw Error('health_line_image_fetch_failed');const bytes=new Uint8Array(await r.arrayBuffer());const mt=mediaType(bytes);if(!mt||mt.mime==='application/pdf')throw Error('รองรับรูป JPEG PNG หรือ WebP');return {bytes,...mt};}
  });
  if(handled)continue;
 }catch(err){
  console.error('smart_health_runtime',String(err));
  await replyMessages(e.replyToken,t,[healthCard('🩺 ยังทำรายการนี้ไม่ได้',['ร่างเดิมยังอยู่ กรุณาเปิดร่างล่าสุดเพื่อตรวจข้อมูลก่อนทำต่อ'],[{label:'เปิดร่างล่าสุด',data:'phms_health_resume'}])]);continue;
 }
}
`;
source="import {handleSmartHealth} from './smart-health-runtime.ts';\nimport {healthCard} from './smart-health.ts';\nasync function phmsSmartHealthEnabled(u:string,k:string,id:string):Promise<boolean>{try{return one(await rpc(u,k,'phms_smart_health_access',{p_line_user_id:id}))?.allowed===true}catch(err){console.error('smart_health_gate_unavailable');return false}}\n"+source.replace(anchor,hook+anchor);
await fs.mkdir('supabase/functions/line-webhook',{recursive:true});
await fs.writeFile('supabase/functions/line-webhook/index.ts',source);
console.log(JSON.stringify({input:path.resolve(input),base_sha256:createHash('sha256').update(await fs.readFile(input)).digest('hex'),output:'supabase/functions/line-webhook/index.ts',rollout:'database gate defaults off; pilot requires verified actor UUID'}));
