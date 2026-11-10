import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { chromium } from 'playwright';

// Browser regression for the approved PHMS v2.4 UI: verifies that the real
// ES modules BOOT, not merely that GitHub Pages returns an HTML document.
// No real LINE account, medical record, Supabase write, or API key is used.
const root = process.cwd();
const mime = p => p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.mjs') ? 'text/javascript; charset=utf-8' : 'text/plain; charset=utf-8';
const server = createServer(async (req,res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    const path = resolve(root, '.' + pathname);
    if(!path.startsWith(root + sep)) throw new Error('outside_repository');
    const body = await readFile(path);
    res.writeHead(200, {'Content-Type':mime(path),'Cache-Control':'no-store'});
    res.end(body);
  } catch {
    res.writeHead(404,{'Content-Type':'text/plain'});res.end('not found');
  }
});
await new Promise(ok => server.listen(0,'127.0.0.1',ok));
const port = server.address().port;
const base = 'http://127.0.0.1:'+port+'/phms-v24-pilot/prototype/index.html';
let browser;
const member='11111111-1111-4111-8111-111111111111';
try {
 browser=await chromium.launch({headless:true});
 for(const scenario of ['line-selected','direct-unselected']){
  const context=await browser.newContext({viewport:{width:390,height:844},locale:'th-TH'});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror', e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.route('https://static.line-scdn.net/liff/edge/2/sdk.js',route=>route.fulfill({
   status:200,contentType:'text/javascript',
   body:`window.liff={
    init:async()=>{},isLoggedIn:()=>true,isInClient:()=>${scenario==='line-selected'?'true':'false'},
    getIDToken:()=> 'synthetic-identity-token',
    login:()=>{},logout:()=>{},sendMessages:async()=>{}
   }`
  }));
  await page.route('**/functions/v1/phms-v24-appointment-read',async route=>{
   let data={};try{data=JSON.parse(route.request().postData()||'{}')}catch{}
   const body=data.action==='person_options'
    ?{ok:true,people:[{id:member,name:'ยายปุ'}],activePersonId:scenario==='line-selected'?member:null}
    :data.action==='provider_catalog'
      ?{ok:true,catalog:{organizations:[],units:[],clinicians:[]}}
      :{ok:true,items:[]};
   await route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(body)});
  });
  // New-path fallback bypasses cached in-app HTML while preserving relative ES modules.
  const versioned=await page.request.get(base.replace('/index.html','/index-photo-equal-20261110.html'));
  assert.equal(versioned.status(),200,'Versioned UI entrypoint must exist');
  assert.ok((await versioned.text()).includes('name="phms-photo-ui" content="paired-v2-20261110"'),'Versioned entrypoint must contain the new photo layout');
  const url=base+(scenario==='line-selected'?'?member='+member:'');
  await page.goto(url,{waitUntil:'load'});
  await page.waitForTimeout(1400);
  const state=await page.evaluate(()=>{
   const id=n=>document.getElementById(n);
   const visible=n=>{const el=id(n);return !!el&&getComputedStyle(el).display!=='none'&&el.getClientRects().length>0};
   return {
    header:id('appointmentHeaderPerson')?.textContent,
    selected:id('personSelect')?.value,
    pickerVisible:visible('personPicker'),
    flowVisible:visible('appointmentFlow'),
    scenarioVisible:visible('scenarioFlow'),
    cards:document.querySelectorAll('#scenarioFlow .scenario-option').length,
    modeChoices:document.querySelectorAll('.appointment-mode-bar .mode-choice').length,
    simpleMode: id('editor')?.classList.contains('simple-ui'),
    originalModeSelectVisible:visible('detail')&&!id('detail')?.classList.contains('visually-hidden-form'),
    rawOldHeaderVisible:!!document.querySelector('#editor>h2')&&!document.querySelector('#editor>h2').classList.contains('visually-hidden'),
    saveDisabled:id('save')?.disabled===true,
    bodyText:document.body.textContent.slice(0,250)
   };
  });
  console.log('BROWSER_UI_SMOKE',scenario,JSON.stringify({...state,errors}));
  assert.equal(errors.length,0,'Browser JS errors indicate the OLD bare HTML will show');
  assert.equal(state.flowVisible,true,'Approved dynamic appointment flow missing');
  assert.equal(state.cards,3,'Approved three appointment type cards missing');
  assert.equal(state.modeChoices,2,'Approved simple/detailed mode cards missing');
  assert.equal(state.originalModeSelectVisible,false,'Legacy plain mode dropdown visible');
  assert.equal(state.rawOldHeaderVisible,false,'Legacy static details heading visible');
  assert.equal(state.saveDisabled,true,'Pilot must remain read-only');
  if(scenario==='line-selected'){
   assert.equal(state.selected,member,'Deep link was not preselected');
   assert.equal(state.header,'👤 เพิ่มนัดให้: ยายปุ','Header person must match authorized selection');
   assert.equal(state.pickerVisible,false,'Do not show repeated person selection from LINE');
   assert.equal(state.scenarioVisible,true,'Appointment type choices should be visible');
  } else {
   // The fresh direct entry still requires choosing a person.
   assert.equal(state.pickerVisible,true);
  }
  // Default preparation items belong to every NEW appointment, not to the UI
  // render cycle. Verify edit/delete survive mode/scenario switches.
  const checklistValues=()=>page.locator('#prepItems .checklist-row textarea[aria-label^="แก้ไขรายการ"]').evaluateAll(rows=>rows.map(x=>x.value));
  assert.deepEqual(await checklistValues(),[
   '🪪 บัตรประชาชน',
   '📅 ใบนัด (ตรวจสอบวันเวลาอีกครั้ง)'
  ],'Two Thai preparation defaults must be present on first load');
  assert.equal(await page.locator('#prepItems .checklist-row input[type="checkbox"]:checked').count(),0,'Initial items must be pending, not completed');
  if(scenario==='line-selected'){
   await page.locator('#scenarioFlow .scenario-option[data-scenario="booked"]').click();
   await page.locator('#simpleExtras summary').click();
   await page.locator('#prepChoiceGrid .prep-choice-card').nth(1).click();
   await page.locator('#prepItems .checklist-row textarea[aria-label^="แก้ไขรายการ"]').first().fill('🪪 บัตรประชาชน (ตัวจริง)');
   await page.locator('#prepItems .checklist-row textarea[aria-label^="แก้ไขรายการ"]').first().dispatchEvent('change');
   assert.deepEqual(await checklistValues(),[
    '🪪 บัตรประชาชน (ตัวจริง)',
    '📅 ใบนัด (ตรวจสอบวันเวลาอีกครั้ง)'
   ],'Default items must remain editable');
   await page.locator('#prepItems .checklist-row button.phms-delete-button').first().click();
   assert.deepEqual(await checklistValues(),['📅 ใบนัด (ตรวจสอบวันเวลาอีกครั้ง)'],'Deleted default must disappear');
   const buttonDimensions=await page.locator('#prepItems .phms-delete-button').first().evaluate(button=>{
    const face=button.querySelector('.phms-delete-face');
    return {text:face.textContent.trim(),hit:button.getBoundingClientRect().height,pill:face.getBoundingClientRect().height,bg:getComputedStyle(face).backgroundColor};
   });
   assert.equal(buttonDimensions.text,'ลบ');
   assert.ok(buttonDimensions.hit>=44,'Delete touch target must be at least 44px high');
   assert.ok(buttonDimensions.pill<=34,'Visible delete pill should be compact');
   assert.equal(buttonDimensions.bg,'rgb(255, 242, 243)','All delete pills use the same pink background');
   const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9VFYDj8AAAAASUVORK5CYII=','base64');
   await page.locator('#documents').setInputFiles({name:'appointment-test.png',mimeType:'image/png',buffer:png});
   assert.equal(await page.locator('#appointmentPhotoList .appointment-photo-item').count(),1,'Photo is visible after selecting it');
   assert.equal((await page.locator('#appointmentPhotoList .phms-delete-face').first().textContent()).trim(),'ลบ');
   const photoActionSizes=await page.locator('#appointmentPhotoList .appointment-photo-actions').evaluate(actions=>{
    const view=actions.querySelector('.phms-photo-view').getBoundingClientRect();
    const remove=actions.querySelector('.phms-delete-button').getBoundingClientRect();
    return {viewWidth:view.width,deleteWidth:remove.width,viewHeight:view.height,deleteHeight:remove.height};
   });
   assert.ok(Math.abs(photoActionSizes.viewWidth-photoActionSizes.deleteWidth)<1,'Photo View and Delete must have equal width');
   assert.ok(Math.abs(photoActionSizes.viewHeight-photoActionSizes.deleteHeight)<1,'Photo View and Delete must have equal height');
   assert.ok(photoActionSizes.viewHeight>=44,'Photo actions remain accessible on iPhone');

   await page.setViewportSize({width:320,height:700});
   const narrowPhotoActions=await page.locator('#appointmentPhotoList .appointment-photo-actions').evaluate(actions=>{
    const a=actions.querySelector('.phms-photo-view').getBoundingClientRect();
    const b=actions.querySelector('.phms-delete-button').getBoundingClientRect();
    return {aW:a.width,bW:b.width,aH:a.height,bH:b.height,overflow:actions.scrollWidth-actions.clientWidth};
   });
   assert.ok(Math.abs(narrowPhotoActions.aW-narrowPhotoActions.bW)<1,'Buttons must be equally wide at 320px');
   assert.ok(Math.abs(narrowPhotoActions.aH-narrowPhotoActions.bH)<1,'Buttons must be equally tall at 320px');
   assert.ok(narrowPhotoActions.overflow<=1,'Photo action row must not overflow on narrow phones');
   await page.setViewportSize({width:390,height:844});
   await page.locator('#appointmentPhotoList .phms-photo-view').click();
   assert.equal(await page.locator('#appointmentPhotoDialog').evaluate(el=>el.open),true,'Preview is not deletion');
   await page.locator('#closeAppointmentPhoto').click();
   assert.equal(await page.locator('#appointmentPhotoList .appointment-photo-item').count(),1);
   await page.locator('#appointmentPhotoList .phms-delete-button').click();
   assert.equal(await page.locator('#appointmentPhotoList .appointment-photo-item').count(),0,'Delete immediately removes the draft photo');
   assert.equal(await page.locator('#checklistUndoNotice').count(),0,'No undo banner should return');

   await page.locator('#prepEntry').fill('💊 ยาประจำตัว');
   await page.locator('#prepAdd').click();
   assert.deepEqual(await checklistValues(),['📅 ใบนัด (ตรวจสอบวันเวลาอีกครั้ง)','💊 ยาประจำตัว']);
   await page.locator('.appointment-mode-bar .mode-choice[data-mode="full"]').click();
   await page.locator('.appointment-mode-bar .mode-choice[data-mode="simple"]').click();
   await page.locator('#scenarioFlow .scenario-option[data-scenario="walk_in"]').click();
   await page.locator('#scenarioFlow .scenario-option[data-scenario="booked"]').click();
   assert.deepEqual(await checklistValues(),['📅 ใบนัด (ตรวจสอบวันเวลาอีกครั้ง)','💊 ยาประจำตัว'],'Mode/type changes must not re-seed deleted defaults');
   await page.locator('#resetAppointmentDraft').click();
   await page.locator('#confirmAppointmentReset').click();
   assert.deepEqual(await checklistValues(),[
    '🪪 บัตรประชาชน',
    '📅 ใบนัด (ตรวจสอบวันเวลาอีกครั้ง)'
   ],'Explicit clear begins a fresh form with editable defaults');
   console.log('BROWSER_PREPARATION_DEFAULTS_PASS');
  }
  await context.close();
 }
 console.log('BROWSER_UI_SMOKE_PASS');
} finally {
 if(browser) await browser.close();
 await new Promise(ok=>server.close(ok));
}
