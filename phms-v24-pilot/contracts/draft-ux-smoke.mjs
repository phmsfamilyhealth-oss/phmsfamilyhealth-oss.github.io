import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { chromium } from 'playwright';

// Synthetic, offline-integration check: no real LINE, Supabase patient data, or writes.
const root=process.cwd();
const server=createServer(async (req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  const full=resolve(root,'.'+pathname);
  if(!full.startsWith(root+sep))throw Error('invalid_path');
  const data=await readFile(full);
  res.writeHead(200,{'Content-Type':full.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8'});
  res.end(data);
 }catch{res.writeHead(404);res.end('not_found');}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const base='http://127.0.0.1:'+server.address().port+'/phms-v24-pilot/prototype/index.html';
const member='11111111-1111-4111-8111-111111111111';
const hospital='22222222-2222-4222-8222-222222222221';
const clinic='33333333-3333-4333-8333-333333333331';
let browser;
try{
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},locale:'th-TH'});
 const page=await context.newPage();
 const errors=[];
 page.on('pageerror',e=>errors.push(e.stack||e.message));
 page.on('console',m=>{if(m.text().startsWith('phms_draft_restore_failed'))console.log('DRAFT_STACK',m.text())});
 let stored=null;
 const calls=[];
 await page.route('https://static.line-scdn.net/liff/edge/2/sdk.js',route=>route.fulfill({
  status:200,contentType:'text/javascript',
  body:`window.liff={init:async()=>{},isLoggedIn:()=>true,isInClient:()=>true,getIDToken:()=>'synthetic-token',login:()=>{},logout:()=>{},closeWindow:()=>{}}`
 }));
 await page.route('**/functions/v1/phms-v24-appointment-read',async route=>{
  let request={};try{request=JSON.parse(route.request().postData()||'{}')}catch{}
  const response=request.action==='person_options'
   ?{ok:true,people:[{id:member,name:'ผู้ป่วยทดสอบ'}],activePersonId:member}
   :request.action==='provider_catalog'
    ?{ok:true,catalog:{organizations:[{id:hospital,name:'โรงพยาบาลทดสอบ',display_name:'โรงพยาบาลทดสอบ'}],
      units:[{id:clinic,organization_id:hospital,name:'อายุรกรรม',is_verified:true}],
      clinicians:[],personHospitalHns:[]}}
    :request.action==='appointment_sources'
     ?{ok:true,appointments:[]}
     :{ok:true,items:[]};
  await route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(response)});
 });
 await page.route('**/functions/v1/phms-v24-appointment-confirm',async route=>{
  let request={};try{request=JSON.parse(route.request().postData()||'{}')}catch{}
  calls.push(request.action);
  let response;
  if(request.action==='capabilities')response={ok:true,canSave:false};
  else if(request.action==='draft_get')response={ok:true,draft:stored,updatedAt:'2026-11-19T01:00:00Z'};
  else if(request.action==='draft_save'){stored={...request.payload,photos:[]};response={ok:true};}
  else if(request.action==='draft_delete'){stored=null;response={ok:true};}
  else response={ok:false,error:'unsupported_action'};
  await route.fulfill({status:response.ok?200:400,contentType:'application/json',
   headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(response)});
 });
 await page.route('**/functions/v1/phms-v24-family-reschedule-contact',route=>route.fulfill({
  status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({ok:true,contact:null,canWrite:false})
 }));
 await page.route('**/functions/v1/phms-v24-journey-guide',route=>route.fulfill({
  status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({ok:true,template:null,canSaveTemplate:false})
 }));
 await page.goto(base+'?member='+member,{waitUntil:'load'});
 await page.waitForFunction(()=>document.getElementById('personSelect')?.value==='11111111-1111-4111-8111-111111111111');
 await page.waitForFunction(()=>document.getElementById('draftOpenArea')&&document.getElementById('systemDraftBar'));
 const layout=await page.evaluate(()=>{
  const open=document.getElementById('draftOpenArea'),save=document.getElementById('systemDraftBar');
  const person=document.getElementById('personPicker'),review=document.getElementById('review');
  return {openAfterPerson:!!(person.compareDocumentPosition(open)&Node.DOCUMENT_POSITION_FOLLOWING),
   saveBeforeReview:!!(save.compareDocumentPosition(review)&Node.DOCUMENT_POSITION_FOLLOWING),
   deleteFolded:document.getElementById('draftManagement').hidden,
   oldControlAbsent:!document.getElementById('draftPersonSelect'),
   saveText:document.getElementById('systemDraftSave').textContent,
   openText:document.getElementById('systemDraftOpen').textContent};
 });
 assert.equal(layout.openAfterPerson,true,'Open draft must follow person selection');
 assert.equal(layout.saveBeforeReview,true,'Save draft must be near final review');
 assert.equal(layout.deleteFolded,true,'Delete draft must be initially hidden');
 assert.equal(layout.oldControlAbsent,true,'Do not show redundant draft person selector');
 assert.match(layout.saveText,/บันทึกไว้กรอกต่อ/);
 assert.match(layout.openText,/เปิดร่างที่บันทึกไว้/);

 // Nonexistent draft returns actionable text; never erases the form.
 await page.locator('#systemDraftOpen').click();
 await page.waitForFunction(()=>document.getElementById('draftOpenStatus').textContent.includes('ยังไม่มีร่าง'));
 assert.equal(stored,null);
 await page.locator('#purpose').evaluate(el=>{el.value='ตรวจเข่าครั้งแรก';el.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.locator('#additionalNote').evaluate(el=>{el.value='หมายเหตุทดสอบ';el.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.locator('#systemDraftSave').click();
 await page.waitForFunction(()=>document.getElementById('draftSaveStatus').textContent.includes('เก็บร่างแล้ว'));
 assert.equal(stored.fields.purpose,'ตรวจเข่าครั้งแรก');
 assert.equal(stored.fields.additionalNote,'หมายเหตุทดสอบ');
 assert.equal(await page.locator('#draftManagement').evaluate(el=>el.hidden),false);

 // A new unsaved value must not be silently replaced: show a clear confirmation.
 await page.locator('#purpose').evaluate(el=>{el.value='ข้อความที่ยังไม่ได้เก็บ';el.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.locator('#systemDraftOpen').click();
 await page.waitForFunction(()=>document.getElementById('draftOverwriteDialog').open);
 assert.equal(await page.locator('#purpose').inputValue(),'ข้อความที่ยังไม่ได้เก็บ');
 await page.locator('#draftOverwriteDialog .phms-draft-accept').click();
 await page.waitForTimeout(1000);
 console.log('DRAFT_OPEN_DIAGNOSTIC',JSON.stringify({ui:await page.evaluate(()=>({status:document.getElementById('draftOpenStatus')?.textContent,formPurpose:document.getElementById('purpose')?.value,formError:document.getElementById('error')?.textContent,person:document.getElementById('personSelect')?.value})),scriptErrors:errors}));
 await page.waitForFunction(()=>document.getElementById('draftOpenStatus').textContent.includes('เปิดร่างสำเร็จ'),{timeout:5000});
 assert.equal(await page.locator('#purpose').inputValue(),'ตรวจเข่าครั้งแรก');
 assert.equal(await page.locator('#additionalNote').inputValue(),'หมายเหตุทดสอบ');
 assert.equal(await page.locator('#personSelect').inputValue(),member);
 assert.equal(await page.locator('#draftManagement').evaluate(el=>el.hidden),false);

 await page.locator('#draftManagement > summary').click();
 await page.locator('#systemDraftDelete').click();
 await page.waitForFunction(()=>document.getElementById('draftDeleteDialog').open);
 assert.ok(stored,'Delete must require confirmation');
 await page.locator('#draftDeleteDialog .phms-draft-danger').click();
 await page.waitForFunction(()=>document.getElementById('draftOpenStatus').textContent.includes('ลบร่างที่บันทึกไว้แล้ว'));
 assert.equal(stored,null);
 assert.equal(await page.locator('#draftManagement').evaluate(el=>el.hidden),true);
 assert.equal(await page.locator('#purpose').inputValue(),'ตรวจเข่าครั้งแรก','Deleting stored draft must not clear current form');
 assert.ok(calls.includes('draft_get')&&calls.includes('draft_save')&&calls.includes('draft_delete'));
 console.log('PHMS_DRAFT_UI_OK',JSON.stringify({layout,calls,scriptErrors:errors}));
 await context.close();
}finally{
 if(browser)await browser.close();
 await new Promise(ok=>server.close(ok));
}
