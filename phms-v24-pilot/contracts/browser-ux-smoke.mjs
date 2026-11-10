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
      ?{ok:true,catalog:{
       organizations:[
        {id:'22222222-2222-4222-8222-222222222221',name:'โรงพยาบาลทดสอบ ก',display_name:'รพ.ทดสอบ ก'},
        {id:'22222222-2222-4222-8222-222222222222',name:'โรงพยาบาลทดสอบ ข',display_name:'รพ.ทดสอบ ข'}],
       units:[
        {id:'33333333-3333-4333-8333-333333333331',organization_id:'22222222-2222-4222-8222-222222222221',name:'อายุรกรรม',location_detail:'อาคาร A ชั้น 2 ช่องยื่นใบนัด',is_verified:true},
        {id:'33333333-3333-4333-8333-333333333332',organization_id:'22222222-2222-4222-8222-222222222222',name:'กระดูกและข้อ',location_detail:'',is_verified:false}
       ],clinicians:[],
       personHospitalHns:[
        {organizationId:'22222222-2222-4222-8222-222222222221',value:'HN-TEST-A',verified:true},
        {organizationId:'22222222-2222-4222-8222-222222222222',value:'HN-TEST-B',verified:false}
       ]}}
      :data.action==='appointment_sources'
      ?{ok:true,appointments:[{id:'44444444-4444-4444-8444-444444444444',title:'ตรวจตามนัด',organization_id:'22222222-2222-4222-8222-222222222222',service_unit_id:'33333333-3333-4333-8333-333333333332',location_detail:'อาคาร B ชั้น 1 จุดบริการเดิม',created_at:'2026-10-01T00:00:00Z'}]}
      :{ok:true,items:[]};
   await route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(body)});
  });
  const journeyActions=[];
  let photoSerial=40;
  await page.route('**/functions/v1/phms-v24-journey-guide',async route=>{
   let data={};try{data=JSON.parse(route.request().postData()||'{}')}catch{}
   journeyActions.push(data);
   const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
   const body=data.action==='template_get'
    ?{ok:true,template:null,canSaveTemplate:scenario==='line-selected'}
    :data.action==='template_save'
    ?{ok:true,id:id(1),version:1}
    :data.action==='photo_put'
    ?{ok:true,id:id(++photoSerial)}
    :{ok:true};
   await route.fulfill({status:200,contentType:'application/json',
    headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(body)});
  });
  // An older versioned test URL must forward to live HTML, not freeze an outdated UI.
  const aliasUrl=base.replace('/index.html','/index-photo-equal-20261110.html');
  const versioned=await page.request.get(aliasUrl);
  assert.equal(versioned.status(),200,'Compatibility URL must exist');
  const aliasHtml=await versioned.text();
  assert.ok(aliasHtml.includes('name="phms-forward-to-canonical" content="index.html"'),'Old test link must forward to the canonical form');
  assert.ok(aliasHtml.includes("canonical.search=window.location.search"),'Forwarding must preserve LINE person context');
  assert.ok(aliasHtml.includes("window.location.replace(canonical.href)"),'Old test link must not serve a stale copy');
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
   // Hospital picker sets a hidden select programmatically. It must still trigger HN sync.
   const hospitalButtons=page.locator('#hospitalQuickCards .adaptive-provider-choice:not(.adaptive-provider-more)');
   assert.equal(await hospitalButtons.count(),2,'Synthetic authorized hospital cards must load');
   await hospitalButtons.nth(0).click();
   await page.waitForFunction(()=>document.getElementById('hospital_hn').value==='HN-TEST-A');
   if(!(await page.locator('#providerExtras').evaluate(x=>x.open)))await page.locator('#providerExtras > summary').click();
   await page.locator('#unitQuickCards .adaptive-provider-choice:not(.adaptive-provider-more)').first().click();
   await page.waitForFunction(()=>document.getElementById('location_detail').value==='อาคาร A ชั้น 2 ช่องยื่นใบนัด');
   assert.match(await page.locator('#hospitalLocationSyncNote').textContent(),/ทะเบียนแผนก/,'Verified master location has provenance');
   assert.equal(await page.locator('#hospital_vn').inputValue(),'','VN starts blank for each new visit');
   await page.locator('#hospital_vn').evaluate(input=>{input.value='VN-FROM-FIRST-VISIT';input.dispatchEvent(new Event('input',{bubbles:true}));});
   await hospitalButtons.nth(1).click();
   await page.waitForFunction(()=>document.getElementById('hospital_hn').value==='HN-TEST-B');
   assert.equal(await page.locator('#location_detail').inputValue(),'','Changing hospital must remove the prior clinic location');
   await page.locator('#unitQuickCards .adaptive-provider-choice:not(.adaptive-provider-more)').first().click();
   await page.waitForFunction(()=>document.getElementById('location_detail').value==='อาคาร B ชั้น 1 จุดบริการเดิม');
   assert.match(await page.locator('#hospitalLocationSyncNote').textContent(),/นัดเดิม/,'Fallback remains labeled as needing verification');
   await page.locator('#location_detail').evaluate(input=>{input.value='จุดแก้ไขเฉพาะนัด';input.dispatchEvent(new Event('input',{bubbles:true}));});
   await page.waitForTimeout(150);
   assert.equal(await page.locator('#location_detail').inputValue(),'จุดแก้ไขเฉพาะนัด','Manual clinic location must remain editable');
   assert.equal(await page.locator('#hospital_vn').inputValue(),'','Switching hospital clears the previous visit number');
   await page.locator('#hospital_hn').evaluate(input=>{input.value='HN-CORRECTED-IN-DRAFT';input.dispatchEvent(new Event('input',{bubbles:true}));});
   await page.waitForTimeout(200);
   assert.equal(await page.locator('#hospital_hn').inputValue(),'HN-CORRECTED-IN-DRAFT','Manual HN override must not be overwritten');
   await hospitalButtons.nth(0).click();
   await page.waitForFunction(()=>document.getElementById('hospital_hn').value==='HN-TEST-A');
   assert.equal(await page.locator('#location_detail').inputValue(),'','Old hospital location must never bleed into a new hospital');
   await page.locator('#unitQuickCards .adaptive-provider-choice:not(.adaptive-provider-more)').first().click();
   await page.waitForFunction(()=>document.getElementById('location_detail').value==='อาคาร A ชั้น 2 ช่องยื่นใบนัด');
   assert.equal(await page.locator('#hospital_vn').inputValue(),'','Returning to a hospital must not restore a stale VN');
   // No hospital workflow is prefilled. A caregiver may add and order multiple stops.
   assert.equal(await page.locator('#visitStepsList .visit-stop-card').count(),0);
   await page.locator('.mode-choice[data-mode="full"]').click();
   // Journey location photos belong ONLY to detailed mode and have a separate 5-photo cap.
   const hospitalDetail=page.locator('#primaryLocationDetails');
   const detailInitiallyOpen=await hospitalDetail.evaluate(el=>el.open);
   if(!detailInitiallyOpen)await hospitalDetail.locator(':scope > summary').click();
   assert.ok(await page.locator('#primaryJourneyPhotos').isVisible(),'The detailed photo editor wrapper must be visible');
   const journeyPng=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9VFYDj8AAAAASUVORK5CYII=','base64');
   const journeyFile=(name)=>({name,mimeType:'image/png',buffer:journeyPng});
   await page.locator('#primaryJourneyFileInput').setInputFiles(
    Array.from({length:6},(_,i)=>journeyFile('point-'+i+'.png')));
   await page.waitForFunction(()=>document.querySelectorAll('#primaryJourneyGallery .phms-journey-photo-tile').length===5);
   assert.equal(await page.locator('#primaryJourneyPhotoCount').textContent(),'5/5 รูป','Main point has own five-photo limit');
   assert.ok(await page.locator('#primaryJourneyAddPhoto').evaluate(x=>x.hidden),'Cannot add sixth point photo');
   const locationCaptions=page.locator('#primaryJourneyGallery input[aria-label^="คำอธิบายรูป"]');
   await locationCaptions.first().fill('หน้าลิฟต์ทางขวา');
   await page.locator('#primaryJourneyGallery .phms-journey-photo-tile').nth(1).locator('.phms-journey-cover').click();
   assert.match(await page.locator('#primaryJourneyGallery .phms-journey-photo-name').first().textContent(),/point-1.png/,'Choosing cover moves the full photo');
   await page.locator('#primaryJourneyGallery .phms-delete-button').first().click();
   assert.equal(await page.locator('#primaryJourneyPhotoCount').textContent(),'4/5 รูป','Deletion updates location gallery count');
   assert.ok(!(await page.locator('#primaryJourneyAddPhoto').evaluate(x=>x.hidden)),'Add is available after delete');
   await page.locator('#visitStepsDetails > summary').click();
   await page.locator('#visitStepAdd').click();
   await page.locator('#visitStepAdd').click();
   assert.equal(await page.locator('#visitStepsList .visit-stop-card').count(),2);
   const stopNames=page.locator('#visitStepsList input[aria-label^="ทำอะไร"]');
   await stopNames.nth(0).fill('เจาะเลือด');
   await stopNames.nth(1).fill('เอกซเรย์');
   const stops=page.locator('#visitStepsList .visit-stop-card');
   await stops.nth(0).locator('input[type=file]').setInputFiles([
    journeyFile('blood-left.png'),journeyFile('blood-right.png')]);
   await page.waitForFunction(()=>document.querySelectorAll('#visitStepsList .visit-stop-card:first-child .phms-journey-photo-tile').length===2);
   await stops.nth(1).locator('input[type=file]').setInputFiles(journeyFile('xray.png'));
   await page.waitForFunction(()=>document.querySelectorAll('#visitStepsList .visit-stop-card:nth-child(2) .phms-journey-photo-tile').length===1);
   await stops.nth(0).locator('.visit-stop-instructions button.secondary').click();
   await stops.nth(0).locator('input[aria-label^="วิธีทำข้อ"]').first().fill('กดบัตรคิว');
   await stops.nth(1).locator('button.visit-move').first().click();
   assert.equal(await stops.nth(0).locator('.phms-journey-photo-tile').count(),1,'Step photo follows X-ray during reorder');
   assert.equal(await stops.nth(1).locator('.phms-journey-photo-tile').count(),2,'Both blood draw angles stay with that stop');
   assert.equal(await stops.nth(1).locator('input[aria-label^="วิธีทำข้อ"]').first().inputValue(),'กดบัตรคิว','Substep follows its parent');
   assert.deepEqual(await stopNames.evaluateAll(xs=>xs.map(x=>x.value)),['เอกซเรย์','เจาะเลือด']);
   assert.deepEqual(await stopNames.evaluateAll(xs=>xs.map(x=>x.value)),['เอกซเรย์','เจาะเลือด']);
   // A different hospital's route must not be displayed until the caregiver reviews it.
   assert.ok(await page.locator('#journeyContextWarning').isVisible(),'Changing hospital requires route review');
   await page.locator('#journeyKeepAfterReview').click();
   await page.locator('#visitStepsList .visit-stop-card').first().locator('.visit-stop-heading button.phms-delete-button').click();
   assert.equal(await page.locator('#visitStepsList .visit-stop-card').count(),1,'One stop is removable without deleting the other');
   await page.waitForFunction(()=>!document.getElementById('journeySavePanel').hidden);
   if(await page.locator('#journeyContextWarning').isVisible()){
    await page.locator('#journeyKeepAfterReview').click();
   }
   await page.locator('#journeySaveTemplate').click();
   await page.waitForTimeout(1200);
   const saveStatus=await page.locator('#journeySaveStatus').textContent();
   assert.match(saveStatus,/บันทึกเส้นทางประจำของครอบครัวแล้ว/,'Unexpected journey save status: '+saveStatus+'; actions='+journeyActions.map(x=>x.action).join(','));
   assert.equal(journeyActions.filter(x=>x.action==='template_save').length,1,'Authorized family route save is explicit');
   assert.equal(journeyActions.filter(x=>x.action==='photo_put').length,6,'Each of the six point photos uploaded individually');
   assert.equal(journeyActions.filter(x=>x.action==='photo_reorder').length,2,'Image ordering is rechecked before and after upload');
   assert.equal(journeyActions.filter(x=>x.action==='template_save')[0].template.steps[0].time,'','A reusable route never copies appointment-specific time');
   assert.equal(await page.locator('#showJourneyElderPreview').count(),0,'Redundant detailed-mode viewer button is removed');
   assert.equal((await page.locator('#primaryLocationDetails > summary .phms-summary-label').textContent()).trim(),'📍 จุดติดต่อหลัก','Primary point summary is concise without optional suffix');
   assert.equal((await page.locator('#visitStepsDetails > summary .phms-summary-label').textContent()).trim(),'🧭 ขั้นตอนในวันนัด','Journey steps summary is concise without optional suffix');
   await page.locator('.mode-choice[data-mode="simple"]').click();
   assert.ok(await page.locator('#details').evaluate(x=>x.classList.contains('hidden')),'Journey editing stays hidden in simple mode');
   assert.equal(await page.locator('#primaryJourneyPhotoCount').textContent(),'4/5 รูป','Switching modes preserves detailed photo draft');
   assert.ok(await page.locator('#simpleJourneyGuide').isVisible(),'Elder route guide is visible in Simple mode without exposing editing fields');
   await page.locator('#simpleJourneyOpen').click();
   assert.ok(await page.locator('#journeyElderPreviewDialog').isVisible(),'Simple mode opens the same read-only guide');
   assert.equal(await page.locator('#journeyElderPreviewDialog .phms-journey-elder-card').count(),2,'The main point and one remaining step are visible');
   assert.equal(await page.locator('#journeyElderPreviewDialog button.phms-delete-button').count(),0,'No editing controls in the Simple guide');
   const progress=page.locator('#journeyElderPreviewDialog input[type="checkbox"]').first();
   await progress.check();
   assert.ok(await progress.isChecked(),'Progress may be marked independently of template');
   await page.locator('#journeyElderPreviewDialog .phms-journey-elder-close').click();
   const getSummaryGeometry=async()=>page.locator('#simpleExtras>summary').evaluate(summary=>{
    const label=summary.querySelector(':scope > .phms-summary-label');
    const badge=summary.querySelector(':scope > .filled-indicator');
    const header=summary.getBoundingClientRect(),l=label?.getBoundingClientRect(),b=badge?.getBoundingClientRect();
    return {status:badge?.textContent?.trim(),shown:badge&&!badge.hidden,
     labelText:label?.textContent?.trim(),labelFits:!!label&&label.scrollWidth<=label.clientWidth+1,
     flex:getComputedStyle(summary).display,headerHeight:header.height,
     badgeWithin:!!b&&b.left>=header.left&&b.right<=header.right+.5&&b.top>=header.top&&b.bottom<=header.bottom+.5,
     sameRow:!!l&&!!b&&Math.abs((l.top+l.bottom)/2-(b.top+b.bottom)/2)<3,
     badgeLeft:b?.left,labelRight:l?.right};
   });
   let statusLine=await getSummaryGeometry();
   assert.equal(statusLine.labelText,'📋 เตรียมก่อนพบหมอ','Preparation heading uses the short, consistent Thai name');
   assert.ok(statusLine.labelFits,'Preparation heading must be fully visible next to its badge on iPhone');
   assert.equal(statusLine.status,'มีข้อมูล','All disclosure badges use one exact label');
   assert.ok(statusLine.shown&&statusLine.flex==='flex'&&statusLine.badgeWithin&&statusLine.sameRow,'Status stays on the title line');
   assert.ok(statusLine.headerHeight<=70,'Disclosure must not gain a second badge row');
   await page.setViewportSize({width:320,height:700});
   statusLine=await getSummaryGeometry();
   assert.ok(statusLine.badgeWithin&&statusLine.sameRow&&statusLine.headerHeight<=70,'At 320px the badge stays on the same title row');
   assert.ok(statusLine.labelFits,'At 320px preparation title must not be clipped');
   await page.setViewportSize({width:390,height:844});
   await page.locator('#simpleExtras summary').click();
   await page.locator('#prepChoiceGrid .prep-choice-card').nth(1).click();
   const statuses=await page.locator('#editor .filled-indicator:not([hidden]), #editor .prep-choice-filled:not(.hidden)').evaluateAll(nodes=>nodes.map(el=>el.textContent.trim()));
   assert.ok(statuses.length>0&&statuses.every(text=>text==='มีข้อมูล'),'All populated disclosures and prep choices say มีข้อมูล');
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
   assert.ok(['rgb(255, 242, 243)','rgb(252, 227, 231)'].includes(buttonDimensions.bg),'Delete pill uses the standard pink or its hovered shade');
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
