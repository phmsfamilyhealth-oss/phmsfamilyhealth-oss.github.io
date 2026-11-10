// PHMS v2.4 Hospital Journey Guide — isolated pilot edge candidate.
// Strictly independent of the live LINE webhook and existing appointment-confirm.
// Writes remain fail-closed until PHMS_JOURNEY_WRITE_ENABLED=true is approved.
import {createClient} from 'npm:@supabase/supabase-js@2';
import postgres from 'npm:postgres@3.4.7';
import {makePhmsLineIdentityAdapter} from '../contracts/phms-line-identity-adapter.mjs';
import {makePhmsAuthorityAdapter} from '../contracts/phms-private-authority.mjs';
import {normalizeJourneyDraft,validateJourneyPhoto,JOURNEY_UUID} from '../contracts/journey-guide-rules.mjs';
const ORIGIN='https://phmsfamilyhealth-oss.github.io',BUCKET='phms-journey-guides';
const env=n=>(Deno.env.get(n)||'').trim();
const serviceKey=()=>{if(env('SUPABASE_SERVICE_ROLE_KEY'))return env('SUPABASE_SERVICE_ROLE_KEY');try{return JSON.parse(env('SUPABASE_SECRET_KEYS'))?.default||''}catch{return ''}};
const reply=(code,body)=>new Response(JSON.stringify(body),{status:code,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const isUUID=x=>typeof x==='string'&&JOURNEY_UUID.test(x);
let db=null;
try{
 if(env('SUPABASE_URL')&&env('SUPABASE_DB_URL')&&serviceKey()){
  const client=createClient(env('SUPABASE_URL'),serviceKey(),{auth:{persistSession:false,autoRefreshToken:false}});
  const sql=postgres(env('SUPABASE_DB_URL'),{max:2,prepare:false,connect_timeout:5,idle_timeout:10});
  const rights=makePhmsAuthorityAdapter(async(q,args)=>({rows:await sql.unsafe(q,args)}));
  const verify=makePhmsLineIdentityAdapter({supabase:client,channelId:'2011619364',fetchImpl:fetch});
  db={client,sql,rights,verify};
 }
}catch{/* Configuration failures stay fail-closed. */}
async function authorize(req,raw,write){
 if(!db)return {error:reply(404,{ok:false,error:'feature_not_released'})};
 if(!isUUID(raw.selectedPersonCode)||!isUUID(raw.organizationId)||!isUUID(raw.unitId))return {error:reply(400,{ok:false,error:'invalid_request'})};
 const token=/^Bearer ([^\s]+)$/.exec(req.headers.get('authorization')||'')?.[1];
 if(!token)return {error:reply(401,{ok:false,error:'unauthenticated'})};
 try{
  const actor=await db.verify(token);
  if(!actor?.userId)return {error:reply(401,{ok:false,error:'unauthenticated'})};
  if(await db.rights.isReleaseEnabled(actor.userId)!==true)return {error:reply(404,{ok:false,error:'feature_not_released'})};
  if(await db.rights.centralCanAccess(actor.userId,raw.selectedPersonCode,'appointments',write?'create':'view')!==true)
   return {error:reply(403,{ok:false,error:'permission_denied'})};
  const {data,error}=await db.client.from('family_persons').select('id,family_id,status').eq('id',raw.selectedPersonCode).limit(2);
  if(error||data?.length!==1||!isUUID(data[0].family_id)||data[0].status==='inactive')
   return {error:reply(404,{ok:false,error:'person_not_found'})};
  const units=await db.sql.unsafe("select id from public.healthcare_service_units where id=$1::uuid and organization_id=$2::uuid and deleted_at is null limit 1",[raw.unitId,raw.organizationId]);
  if(units.length!==1)return {error:reply(400,{ok:false,error:'invalid_provider'})};
  const canSaveTemplate=env('PHMS_JOURNEY_WRITE_ENABLED')==='true'&&
  await db.rights.centralCanAccess(actor.userId,raw.selectedPersonCode,'appointments','create')===true;
  return {actorId:actor.userId,familyId:data[0].family_id,orgId:raw.organizationId,unitId:raw.unitId,canSaveTemplate};
 }catch{return {error:reply(503,{ok:false,error:'service_unavailable'})};}
}
async function ownedTemplate(ctx,id){
 if(!isUUID(id))return null;
 const rows=await db.sql.unsafe("select id,steps,version from private.phms_journey_templates where id=$1::uuid and family_id=$2::uuid and organization_id=$3::uuid and service_unit_id=$4::uuid limit 1",
  [id,ctx.familyId,ctx.orgId,ctx.unitId]);
 return rows.length===1?rows[0]:null;
}
async function getTemplate(ctx){
 const rows=await db.sql.unsafe("select id,version,title,main_location,steps,updated_at from private.phms_journey_templates where family_id=$1::uuid and organization_id=$2::uuid and service_unit_id=$3::uuid limit 1",
  [ctx.familyId,ctx.orgId,ctx.unitId]);
 if(rows.length!==1)return reply(200,{ok:true,template:null,canSaveTemplate:ctx.canSaveTemplate===true});
 const row=rows[0],photos=[];
 const stored=await db.sql.unsafe("select id,step_key,position,caption,file_name,storage_path from private.phms_journey_photos where template_id=$1::uuid order by step_key,position",[row.id]);
 for(const photo of stored){
  const signed=await db.client.storage.from(BUCKET).createSignedUrl(photo.storage_path,120);
  if(signed.error||!signed.data?.signedUrl)continue;
  photos.push({id:photo.id,stepKey:photo.step_key,position:photo.position,caption:photo.caption,fileName:photo.file_name,url:signed.data.signedUrl});
 }
 return reply(200,{ok:true,template:{id:row.id,version:row.version,title:row.title,
  mainLocation:row.main_location,steps:row.steps,updatedAt:row.updated_at,
  source:'family',photos,photoUrlExpiresSeconds:120},canSaveTemplate:ctx.canSaveTemplate===true});
}
async function saveTemplate(ctx,raw){
 const parsed=normalizeJourneyDraft(raw.template);
 if(!parsed.ok)return reply(400,{ok:false,error:parsed.error});
 if(raw.expectedVersion!==null&&raw.expectedVersion!==undefined&&(!Number.isInteger(raw.expectedVersion)||raw.expectedVersion<1))
  return reply(400,{ok:false,error:'invalid_expected_version'});
 let rows;
 if(raw.expectedVersion!==null&&raw.expectedVersion!==undefined){
  rows=await db.sql.unsafe("update private.phms_journey_templates set title=$1,main_location=$2::jsonb,steps=$3::jsonb,version=version+1,updated_by=$4::uuid,updated_at=now() where family_id=$5::uuid and organization_id=$6::uuid and service_unit_id=$7::uuid and version=$8::int returning id,version",
   [parsed.title,JSON.stringify(parsed.mainLocation),JSON.stringify(parsed.steps),ctx.actorId,ctx.familyId,ctx.orgId,ctx.unitId,raw.expectedVersion]);
 }else{
  rows=await db.sql.unsafe("insert into private.phms_journey_templates(family_id,organization_id,service_unit_id,title,main_location,steps,created_by,updated_by) values($1::uuid,$2::uuid,$3::uuid,$4,$5::jsonb,$6::jsonb,$7::uuid,$7::uuid) on conflict(family_id,organization_id,service_unit_id) do nothing returning id,version",
   [ctx.familyId,ctx.orgId,ctx.unitId,parsed.title,JSON.stringify(parsed.mainLocation),JSON.stringify(parsed.steps),ctx.actorId]);
 }
 if(rows.length!==1)return reply(409,{ok:false,error:'version_conflict'});
 return reply(200,{ok:true,id:rows[0].id,version:rows[0].version});
}
async function putPhoto(ctx,raw){
 if(!isUUID(raw.templateId)||typeof raw.stepKey!=='string'||typeof raw.base64!=='string'||raw.base64.length>2800000||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(raw.base64))return reply(400,{ok:false,error:'invalid_photo'});
 const owner=await ownedTemplate(ctx,raw.templateId);
 if(!owner)return reply(404,{ok:false,error:'template_not_found'});
 let bytes;
 try{bytes=Uint8Array.from(atob(raw.base64),c=>c.charCodeAt(0))}catch{return reply(400,{ok:false,error:'invalid_photo'})}
 const check=validateJourneyPhoto({stepKey:raw.stepKey,position:raw.position,bytes,mimeType:'image/jpeg'},owner.steps);
 if(!check.ok)return reply(400,{ok:false,error:check.error});
 const caption=typeof raw.caption==='string'?raw.caption.trim():'',
       fileName=typeof raw.fileName==='string'?raw.fileName.trim():'';
 if(caption.length>140||fileName.length<1||fileName.length>200)return reply(400,{ok:false,error:'invalid_photo_metadata'});
 const existing=await db.sql.unsafe("select position from private.phms_journey_photos where template_id=$1::uuid and step_key=$2",[raw.templateId,raw.stepKey]);
 if(existing.length>=5||existing.some(r=>r.position===raw.position))return reply(409,{ok:false,error:'photo_limit'});
 const path=ctx.familyId+'/'+raw.templateId+'/'+raw.stepKey+'/'+crypto.randomUUID()+'.jpg';
 const upload=await db.client.storage.from(BUCKET).upload(path,bytes,{contentType:'image/jpeg',upsert:false,cacheControl:'60'});
 if(upload.error)return reply(503,{ok:false,error:'private_storage_unavailable'});
 try{
  const data=await db.sql.unsafe("insert into private.phms_journey_photos(template_id,step_key,position,storage_path,caption,file_name,byte_size,created_by) values($1::uuid,$2,$3::int,$4,$5,$6,$7::int,$8::uuid) returning id",
   [raw.templateId,raw.stepKey,raw.position,path,caption,fileName,bytes.length,ctx.actorId]);
  return reply(200,{ok:true,id:data[0].id});
 }catch{
  await db.client.storage.from(BUCKET).remove([path]);
  return reply(409,{ok:false,error:'photo_limit'});
 }
}

async function reorderPhotos(ctx,raw){
 if(!isUUID(raw.templateId)||!Array.isArray(raw.photos)||raw.photos.length>205||
    !Number.isInteger(raw.expectedVersion)||raw.expectedVersion<1)return reply(400,{ok:false,error:'invalid_photo_manifest'});
 const owner=await ownedTemplate(ctx,raw.templateId);
 if(!owner)return reply(404,{ok:false,error:'template_not_found'});
 if(owner.version!==raw.expectedVersion)return reply(409,{ok:false,error:'version_conflict'});
 const ids=new Set(),positions=new Set(),provided=new Map();
 for(const x of raw.photos){
  if(!x||!isUUID(x.photoId)||ids.has(x.photoId)||
     !Number.isInteger(x.position)||x.position<1||x.position>5||
     typeof x.stepKey!=='string'||typeof x.caption!=='string'||x.caption.length>140||
     !(x.stepKey==='primary'||isUUID(x.stepKey)&&owner.steps.some(y=>y.id===x.stepKey)))
   return reply(400,{ok:false,error:'invalid_photo_manifest'});
  const positionKey=x.stepKey+'|'+x.position;
  if(positions.has(positionKey))return reply(400,{ok:false,error:'duplicate_photo_position'});
  positions.add(positionKey);ids.add(x.photoId);provided.set(x.photoId,x);
 }
 // All stored photo IDs must be accounted for; clients delete unwanted photos first.
 const initial=await db.sql.unsafe("select id,template_id,step_key,position,storage_path,caption,file_name,byte_size,created_by,created_at from private.phms_journey_photos where template_id=$1::uuid",[raw.templateId]);
 if(initial.length!==raw.photos.length||initial.some(x=>!ids.has(x.id)))return reply(409,{ok:false,error:'photo_manifest_conflict'});
 // Transaction prevents transient duplicate positions when photos 1 and 2 are swapped.
 try{
  await db.sql.begin(async tx=>{
   const locks=await tx.unsafe("select version from private.phms_journey_templates where id=$1::uuid for update",[raw.templateId]);
   if(locks.length!==1||locks[0].version!==raw.expectedVersion)throw Error('version_conflict');
   const records=await tx.unsafe("select id,template_id,step_key,position,storage_path,caption,file_name,byte_size,created_by,created_at from private.phms_journey_photos where template_id=$1::uuid for update",[raw.templateId]);
   if(records.length!==provided.size||records.some(x=>!provided.has(x.id)))throw Error('photo_manifest_conflict');
   await tx.unsafe("delete from private.phms_journey_photos where template_id=$1::uuid",[raw.templateId]);
   for(const row of records){
    const next=provided.get(row.id);
    await tx.unsafe("insert into private.phms_journey_photos(id,template_id,step_key,position,storage_path,caption,file_name,byte_size,created_by,created_at) values($1::uuid,$2::uuid,$3,$4::integer,$5,$6,$7,$8::integer,$9::uuid,$10::timestamptz)",
     [row.id,row.template_id,next.stepKey,next.position,row.storage_path,next.caption,row.file_name,row.byte_size,row.created_by,row.created_at]);
   }
  });
 }catch{return reply(409,{ok:false,error:'photo_manifest_conflict'})}
 return reply(200,{ok:true,photoCount:raw.photos.length});
}
async function deletePhoto(ctx,raw){
 if(!isUUID(raw.templateId)||!isUUID(raw.photoId))return reply(400,{ok:false,error:'invalid_request'});
 const owner=await ownedTemplate(ctx,raw.templateId);if(!owner)return reply(404,{ok:false,error:'template_not_found'});
 const rows=await db.sql.unsafe("select storage_path from private.phms_journey_photos where id=$1::uuid and template_id=$2::uuid limit 1",[raw.photoId,raw.templateId]);
 if(rows.length!==1)return reply(404,{ok:false,error:'photo_not_found'});
 const removal=await db.client.storage.from(BUCKET).remove([rows[0].storage_path]);
 if(removal.error)return reply(503,{ok:false,error:'private_storage_unavailable'});
 await db.sql.unsafe("delete from private.phms_journey_photos where id=$1::uuid and template_id=$2::uuid",[raw.photoId,raw.templateId]);
 return reply(200,{ok:true});
}
Deno.serve(async request=>{
 const origin=request.headers.get('origin');
 if(origin&&origin!==ORIGIN)return reply(403,{ok:false,error:'origin_not_allowed'});
 const cors=res=>{if(!origin)return res;const h=new Headers(res.headers);h.set('access-control-allow-origin',ORIGIN);h.set('vary','Origin');return new Response(res.body,{status:res.status,headers:h})};
 if(request.method==='OPTIONS')return origin===ORIGIN?new Response(null,{status:204,headers:{
  'access-control-allow-origin':ORIGIN,'access-control-allow-methods':'POST, OPTIONS',
  'access-control-allow-headers':'authorization, content-type','access-control-max-age':'300','vary':'Origin'}}):reply(403,{ok:false,error:'origin_not_allowed'});
 if(request.method!=='POST')return cors(reply(405,{ok:false,error:'method_not_allowed'}));
 if(!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get('content-type')||''))return cors(reply(415,{ok:false,error:'unsupported_media_type'}));
 if(!/^Bearer [^\s]+$/.test(request.headers.get('authorization')||''))return cors(reply(401,{ok:false,error:'unauthenticated'}));
 let raw;
 try{const source=await request.text();if(new TextEncoder().encode(source).length>2900000)return cors(reply(413,{ok:false,error:'payload_too_large'}));raw=JSON.parse(source)}
 catch{return cors(reply(400,{ok:false,error:'invalid_request'}))}
 if(!raw||!['template_get','template_save','photo_put','photo_delete','photo_reorder'].includes(raw.action))return cors(reply(400,{ok:false,error:'unsupported_action'}));
 const write=raw.action!=='template_get';
 if(write&&env('PHMS_JOURNEY_WRITE_ENABLED')!=='true')return cors(reply(404,{ok:false,error:'feature_not_released'}));
 const ctx=await authorize(request,raw,write);
 if(ctx.error)return cors(ctx.error);
 try{
  if(raw.action==='template_get')return cors(await getTemplate(ctx));
  if(raw.action==='template_save')return cors(await saveTemplate(ctx,raw));
  if(raw.action==='photo_put')return cors(await putPhoto(ctx,raw));
  if(raw.action==='photo_reorder')return cors(await reorderPhotos(ctx,raw));
  return cors(await deletePhoto(ctx,raw));
 }catch{return cors(reply(503,{ok:false,error:'service_unavailable'}))}
});
