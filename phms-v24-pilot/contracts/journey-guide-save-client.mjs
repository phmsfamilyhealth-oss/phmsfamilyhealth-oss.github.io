// PHMS Hospital Journey: permission-gated template sync. The caller must obtain
// a LINE ID token and authorized person+hospital+unit context on each action.
// The server remains authoritative on ownership, roles and write-release gates.
const validId=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const fail=(action,data)=>{const err=new Error(data?.error||'service_unavailable');err.action=action;return err};
export function packJourneyTemplate({department,place,directions,note,steps}={}){
 if(!Array.isArray(steps)||steps.length>40)throw new Error('invalid_steps');
 const items=steps.map((item,index)=>{
  if(!validId(item.id))throw new Error('invalid_step_id');
  const title=String(item.title||'').trim();
  if(!title)throw new Error('กรุณาระบุชื่อขั้นตอนที่ '+(index+1));
  if(!Array.isArray(item.instructions)||item.instructions.length>15)throw new Error('invalid_instructions');
  return {id:item.id,title,place:String(item.place||'').slice(0,240),
   directions:String(item.directions||'').slice(0,600),note:String(item.note||'').slice(0,600),
   // Never copy visit-specific scheduled times into a reusable family route.
   time:'',instructions:item.instructions.filter(x=>String(x).trim()).map(x=>String(x).slice(0,220))};
 });
 const mainLocation={place:String(place||'').slice(0,240),directions:String(directions||'').slice(0,600),
  note:String(note||'').slice(0,600)};
 if(!items.length&&!Object.values(mainLocation).some(Boolean))throw new Error('กรุณาระบุจุดติดต่อหรือขั้นตอนก่อนบันทึก');
 return {title:('เส้นทาง '+(String(department||'').trim()||'ไปโรงพยาบาล')).slice(0,160),
  mainLocation,steps:items};
}
export function collectJourneyGalleries(primary,steps){
 if(!primary||!Array.isArray(primary.photos)||!Array.isArray(steps))throw new Error('invalid_galleries');
 return [{stepKey:'primary',photos:primary.photos},
  ...steps.map(step=>({stepKey:step.id,photos:step.photos||[]}))];
}
async function jpegBase64(blob){
 if(!blob||blob.type!=='image/jpeg'||blob.size<=0||blob.size>2*1024*1024)
  throw new Error('photo_size_or_type');
 // Blob's arrayBuffer avoids any filesystem or local storage persistence.
 const bytes=new Uint8Array(await blob.arrayBuffer());
 let chars='';
 for(let i=0;i<bytes.length;i+=16384)chars+=String.fromCharCode(...bytes.subarray(i,i+16384));
 return btoa(chars);
}
export async function saveFamilyJourney({post,template,existing=null,galleries,onProgress=()=>{}}={}){
 if(typeof post!=='function'||!template||!Array.isArray(galleries))throw new Error('invalid_save_request');
 const full=[];
 for(const group of galleries){
  if(!group||!(group.stepKey==='primary'||validId(group.stepKey))||
     !Array.isArray(group.photos)||group.photos.length>5)throw new Error('photo_limit');
  for(const [i,photo] of group.photos.entries())full.push({photo,stepKey:group.stepKey,position:i+1});
 }
 if(full.length>205)throw new Error('photo_limit');
 if(existing&&(!validId(existing.id)||!Number.isInteger(existing.version)))throw new Error('invalid_template_version');
 onProgress('กำลังบันทึกจุดติดต่อและขั้นตอน…');
 const stored=await post('template_save',{template,expectedVersion:existing?.version??null});
 if(stored?.ok!==true||!validId(stored.id)||!Number.isInteger(stored.version))
  throw fail('template_save',stored);
 const templateId=stored.id,expectedVersion=stored.version;
 const remote=new Set(full.filter(x=>x.photo.remotePhotoId&&x.photo.sourceTemplateId===templateId)
  .map(x=>x.photo.remotePhotoId));
 const known=Array.isArray(existing?.photos)?existing.photos:[];
 // The caller explicitly agreed to replace the family's previous route.
 // Remove only media belonging to that exact template and not retained in this draft.
 for(const photo of known){
  if(remote.has(photo.id))continue;
  onProgress('กำลังปรับรูปเก่าที่ไม่ได้ใช้…');
  const deleted=await post('photo_delete',{templateId,photoId:photo.id});
  if(deleted?.ok!==true)throw fail('photo_delete',deleted);
 }
 const manifest=(onlyRemote,compact=false)=>{
  const result=[];
  for(const group of galleries){
   let n=0;
   for(const photo of group.photos){
    const isRemote=!!photo.remotePhotoId&&photo.sourceTemplateId===templateId;
    if(onlyRemote&&!isRemote)continue;
    if(!isRemote&&!onlyRemote)throw new Error('missing_photo_upload');
    result.push({photoId:photo.remotePhotoId,stepKey:group.stepKey,
     position:compact?++n:group.photos.indexOf(photo)+1,caption:String(photo.caption||'').slice(0,140)});
   }
  }
  return result;
 };
 // Temporarily pack existing photos into 1..N per point, leaving room for new images.
 const before=await post('photo_reorder',{templateId,expectedVersion,photos:manifest(true,true)});
 if(before?.ok!==true)throw fail('photo_reorder',before);
 for(const group of galleries){
  let position=group.photos.filter(x=>x.remotePhotoId&&x.sourceTemplateId===templateId).length;
  for(const photo of group.photos){
   if(photo.remotePhotoId&&photo.sourceTemplateId===templateId)continue;
   onProgress('กำลังบันทึกรูปประกอบ…');
   const base64=await jpegBase64(photo.blob);
   const added=await post('photo_put',{templateId,stepKey:group.stepKey,position:++position,
    fileName:String(photo.name||'รูปสถานที่').slice(0,200),caption:String(photo.caption||'').slice(0,140),base64});
   if(added?.ok!==true||!validId(added.id))throw fail('photo_put',added);
   photo.remotePhotoId=added.id;photo.sourceTemplateId=templateId;
  }
 }
 const after=await post('photo_reorder',{templateId,expectedVersion,photos:manifest(true,false)});
 if(after?.ok!==true)throw fail('photo_reorder',after);
 return {id:templateId,version:expectedVersion,photoCount:full.length};
}
