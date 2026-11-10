// PHMS v2.4 — strict, dependency-free journey template contract.
// No patient data is accepted through client-provided family IDs.
export const JOURNEY_MAX_PHOTOS_PER_POINT=5;
export const JOURNEY_MAX_STEPS=40;
export const JOURNEY_MAX_IMAGE_BYTES=2*1024*1024;
export const JOURNEY_UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text=(s,max)=>typeof s==='string'&&s.length<=max?s.trim():null;
const validObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export function normalizeJourneyDraft(input){
 if(!validObject(input)||!validObject(input.mainLocation)||!Array.isArray(input.steps)||input.steps.length>JOURNEY_MAX_STEPS)
  return {ok:false,error:'invalid_journey'};
 const title=text(input.title,160);
 if(!title)return {ok:false,error:'invalid_title'};
 const getFields=(src,fields)=>{
  if(!validObject(src))return null;
  const out={};
  for(const [key,max] of fields){
   const value=text(src[key]??'',max);
   if(value===null)return null;
   out[key]=value;
  }
  return out;
 };
 const main=getFields(input.mainLocation,[['place',240],['directions',600],['note',600]]);
 if(!main)return {ok:false,error:'invalid_main_location'};
 const steps=[],ids=new Set();
 for(const step of input.steps){
  if(!validObject(step)||!JOURNEY_UUID.test(step.id||'')||ids.has(step.id))return {ok:false,error:'invalid_step_id'};
  const fields=getFields(step,[['title',120],['place',240],['directions',600],['note',600],['time',5]]);
  if(!fields||!Array.isArray(step.instructions)||step.instructions.length>15||
     fields.time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(fields.time))return {ok:false,error:'invalid_step'};
  const instructions=step.instructions.map(x=>text(x,220));
  if(instructions.some(x=>x===null))return {ok:false,error:'invalid_instructions'};
  steps.push({id:step.id,...fields,instructions});
  ids.add(step.id);
 }
 return {ok:true,title,mainLocation:main,steps};
}
export function validJourneyPhotoPoint(pointKey,steps){
 return pointKey==='primary'||JOURNEY_UUID.test(pointKey)&&steps.some(s=>s.id===pointKey);
}
export function validateJourneyPhoto({stepKey,position,bytes,mimeType},steps){
 if(!validJourneyPhotoPoint(stepKey,steps))return {ok:false,error:'invalid_photo_point'};
 if(!Number.isInteger(position)||position<1||position>JOURNEY_MAX_PHOTOS_PER_POINT)return {ok:false,error:'photo_limit'};
 if(!(bytes instanceof Uint8Array)||bytes.length<1||bytes.length>JOURNEY_MAX_IMAGE_BYTES)return {ok:false,error:'photo_size'};
 if(mimeType!=='image/jpeg'||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)return {ok:false,error:'invalid_photo_type'};
 return {ok:true};
}
