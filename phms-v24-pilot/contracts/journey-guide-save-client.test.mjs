import test from 'node:test';
import assert from 'node:assert/strict';
import {packJourneyTemplate,collectJourneyGalleries,saveFamilyJourney} from './journey-guide-save-client.mjs';
const uid=(n)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const step=id=>({id,title:'เจาะเลือด',place:'ห้องเจาะเลือด',time:'09:30',
 directions:'ไปทางซ้าย',note:'ตามใบนัด',instructions:['กดคิว'],photos:[]});
const jpeg=()=>new Blob([new Uint8Array([255,216,255,217])],{type:'image/jpeg'});
const photo=(name,id=null)=>({name,caption:'มุมทางเดิน',blob:jpeg(),...(id?{remotePhotoId:id,sourceTemplateId:uid(1)}:{})});
test('family template excludes appointment-specific time without losing editable route',()=>{
 const packed=packJourneyTemplate({department:'อายุรกรรม',place:'ชั้น 2',directions:'ลิฟต์ขวา',steps:[step(uid(2))]});
 assert.equal(packed.steps[0].time,'');
 assert.equal(packed.steps[0].directions,'ไปทางซ้าย');
 assert.equal(packed.steps[0].instructions[0],'กดคิว');
 assert.throws(()=>packJourneyTemplate({steps:[{...step(uid(2)),title:''}]}),/กรุณาระบุชื่อขั้นตอน/);
});
test('first secure save writes only an authorized template followed by individual photo slots',async()=>{
 const calls=[];let counter=20;
 const post=async(action,data)=>{
  calls.push({action,...data});
  if(action==='template_save')return {ok:true,id:uid(1),version:1};
  if(action==='photo_put')return {ok:true,id:uid(++counter)};
  return {ok:true};
 };
 const base={photos:[photo('a.jpg'),photo('b.jpg')]};
 const steps=[step(uid(2))];steps[0].photos=[photo('c.jpg')];
 const result=await saveFamilyJourney({post,template:packJourneyTemplate({place:'ห้อง 4',steps}),galleries:collectJourneyGalleries(base,steps)});
 assert.equal(result.photoCount,3);
 assert.deepEqual(calls.map(x=>x.action),['template_save','photo_reorder','photo_put','photo_put','photo_put','photo_reorder']);
 assert.deepEqual(calls.filter(x=>x.action==='photo_put').map(x=>[x.stepKey,x.position]),
  [['primary',1],['primary',2],[uid(2),1]]);
 assert.equal(calls[0].expectedVersion,null);
 assert.equal(base.photos[0].sourceTemplateId,uid(1));
});
test('update deletes removed media, preserves existing image refs and reorders after a new image',async()=>{
 const calls=[],a=photo('kept.jpg',uid(4)),c=photo('fresh.jpg');
 const previous={id:uid(1),version:3,photos:[
  {id:uid(4),stepKey:'primary',position:1},
  {id:uid(5),stepKey:'primary',position:2}]};
 const post=async(action,data)=>{
  calls.push({action,...data});
  if(action==='template_save')return {ok:true,id:uid(1),version:4};
  if(action==='photo_put')return {ok:true,id:uid(6)};
  return {ok:true};
 };
 const result=await saveFamilyJourney({post,existing:previous,template:packJourneyTemplate({place:'หน้าตึก',steps:[]}),galleries:[{stepKey:'primary',photos:[c,a]}]});
 assert.equal(result.version,4);
 assert.deepEqual(calls.map(x=>x.action),['template_save','photo_delete','photo_reorder','photo_put','photo_reorder']);
 assert.equal(calls.find(x=>x.action==='photo_delete').photoId,uid(5));
 assert.equal(calls.find(x=>x.action==='photo_put').position,2);
 assert.deepEqual(calls.at(-1).photos.map(x=>x.photoId),[uid(6),uid(4)]);
 assert.deepEqual(calls.at(-1).photos.map(x=>x.position),[1,2]);
});
test('failed release gate never uploads or deletes photos',async()=>{
 const calls=[];
 const post=async(action,data)=>{calls.push(action);return {ok:false,error:'feature_not_released'};};
 await assert.rejects(()=>saveFamilyJourney({post,template:packJourneyTemplate({place:'จุดคัดกรอง',steps:[]}),galleries:[{stepKey:'primary',photos:[photo('a.jpg')]}]}),/feature_not_released/);
 assert.deepEqual(calls,['template_save']);
});
