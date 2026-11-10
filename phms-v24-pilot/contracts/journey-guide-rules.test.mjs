import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeJourneyDraft,validateJourneyPhoto,JOURNEY_MAX_PHOTOS_PER_POINT} from './journey-guide-rules.mjs';
const ID='11111111-1111-4111-8111-111111111111';
const step=(id=ID)=>({id,title:'เจาะเลือด',place:'ชั้น 1',time:'08:00',directions:'ไปทางซ้าย',note:'ตามใบนัด',instructions:['กดคิว','รอเรียก']});
const base=()=>({title:'คลินิกตัวอย่าง',mainLocation:{place:'จุดยื่นใบนัด',directions:'ขึ้นลิฟต์',note:''},steps:[step()]});
test('journey payload uses stable step identifiers and no untrusted photo paths',()=>{
 const clean=normalizeJourneyDraft({...base(),steps:[{...step(),storagePath:'external-photo.jpg',photos:['SECRET']}]});
 assert.equal(clean.ok,true);
 assert.equal(clean.steps[0].id,ID);
 assert.equal(Object.hasOwn(clean.steps[0],'photos'),false);
 assert.equal(Object.hasOwn(clean.steps[0],'storagePath'),false);
});
test('journey fails closed on duplicate step IDs, excess steps and oversized text',()=>{
 assert.equal(normalizeJourneyDraft({...base(),steps:[step(),step()]}).ok,false);
 assert.equal(normalizeJourneyDraft({...base(),steps:Array.from({length:41},()=>step())}).ok,false);
 assert.equal(normalizeJourneyDraft({...base(),mainLocation:{place:'x'.repeat(241),directions:'',note:''}}).ok,false);
 assert.equal(normalizeJourneyDraft({...base(),steps:[{...step(),time:'99:99'}]}).ok,false);
 assert.equal(normalizeJourneyDraft({...base(),steps:[{...step(),instructions:Array.from({length:16},()=>'?')}]}).ok,false);
});
test('photo constraints are five per point and server accepts only JPEG payload',()=>{
 const jpeg=new Uint8Array([255,216,255,0]);
 const image=(stepKey,position,bytes=jpeg,mimeType='image/jpeg')=>
   validateJourneyPhoto({stepKey,position,bytes,mimeType},[step()]);
 for(let n=1;n<=JOURNEY_MAX_PHOTOS_PER_POINT;n++)assert.equal(image('primary',n).ok,true);
 assert.equal(image('primary',6).ok,false);
 assert.equal(image(ID,1).ok,true);
 assert.equal(image('22222222-2222-4222-8222-222222222222',1).ok,false);
 assert.equal(image('primary',1,new Uint8Array(2097153)).ok,false);
 assert.equal(image('primary',1,jpeg,'image/png').ok,false);
 assert.equal(image('primary',1,new Uint8Array([1,2,3,4])).ok,false);
});
