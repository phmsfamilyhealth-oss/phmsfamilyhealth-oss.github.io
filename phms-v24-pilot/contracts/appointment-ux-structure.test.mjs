import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';

const page=readFileSync(new URL('../prototype/index.html',import.meta.url),'utf8');
const script=page.split('<script type="module">')[1]?.split('</script>')[0]||'';
function assertSequence(parts){
 let cursor=-1;
 for(const part of parts){
  const next=script.indexOf(part,cursor+1);
  assert.ok(next>cursor,'Expected JS layout order: '+part);
  cursor=next;
 }
}
test('all original HTML id attributes remain unique',()=>{
 const ids=[...page.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
 assert.equal(ids.length,new Set(ids).size,'Duplicate DOM id prevents accessible field selection');
});
test('elder-first flow has one set of source fields and the correct order',()=>{
 assertSequence([
  "const scenarioSection=makeFlowSection('scenarioFlow'",
  "const mainSection=makeFlowSection('mainFlow'",
  "moveLabelAndInput('purpose',mainSection)",
  "moveLabelAndInput('hospitalSearch',mainSection",
  "const timeSection=makeFlowSection('timeFlow'",
  "moveLabelAndInput('date',timeSection",
  "timeSection.append($('timebox'),conflictNotice,$('appointmentPhotosSection'))",
  "const extrasSection=makeFlowSection('extrasFlow'"
 ]);
 for(const id of ['purpose','hospitalSearch','date','time','known','documents','personSelect'])assert.match(page,new RegExp('id="'+id+'"'));
});
test('detail mode shares existing controls and keeps data on display changes',()=>{
 assert.match(script,/modeChoices\.append\(button\)/);
 assert.match(script,/editor\.classList\.toggle\('simple-ui',simple\)/);
 assert.match(script,/providerExtras\.append\(providerSummary\)/);
 assert.match(script,/moveRangeTo\(unitFieldLabel,\$\('doctorHint'\),providerExtras\)/);
 assert.match(script,/linkedDisclosure\.classList\.toggle\('hidden',mode!=='historical'\)/);
 assert.match(script,/updateFilledIndicators\(\)/);
 const switchStart=script.indexOf("$('scenario').addEventListener('change',()=>{");
 const switchEnd=script.indexOf('});',switchStart);
 assert.ok(switchStart>=0&&switchEnd>switchStart,'Scenario switch handler not found');
 assert.ok(!script.slice(switchStart,switchEnd).includes('clearAppointmentPhotos'),'Scenario switches must not clear selected photos');
});
test('scenario-specific date, time and photo guards survive layout',()=>{
 assert.match(script,/function checkDateRule\(\)/);
 assert.match(script,/\$\('date'\)\.min=/);
 assert.match(script,/\$\('date'\)\.max=/);
 assert.match(script,/function updateAppointmentPhotoVisibility\(\)/);
 assert.match(script,/\$\('scenario'\)\.value==='historical'/);
 assert.match(script,/\$\('known'\)\.value==='yes'/);
});
test('pilot remains fail-closed for persistence and retains canonical handoffs',()=>{
 assert.match(page,/id="save" disabled/);
 assert.match(page,/id="openCanonicalFinance"/);
 assert.match(page,/id="openCanonicalMedication"/);
 assert.match(script,/canHandoffSavedVisit/);
 assert.match(script,/existingPHMSLineCommand/);
});

test('LINE-selected authorized person is shown in the header without a second person step',()=>{
 assert.ok(script.includes('function resolveAppointmentMemberDeepLink()'));
 assert.ok(script.includes('people.people.some(x=>x.id===memberId)'));
 assert.ok(script.includes('if(memberId)select.value=memberId;'));
 assert.ok(script.includes('personSection.hidden=locked'));
 assert.ok(script.includes("personSection.classList.toggle('hidden',locked)"));
 assert.ok(script.includes("👤 เพิ่มนัดให้: '+person"));
 assert.ok(page.includes('#personPicker[hidden]'));
 const modules=page.split('<script type="module">');
 assert.equal(modules.length,4,'Main module, auxiliary module and independent safety-net must remain');
 assert.ok(modules[3].includes('authorizedLineSelection'));
 assert.ok(modules[3].includes('picker.hidden=true'));
 assert.ok(modules[3].includes("select.addEventListener('change',sync)"));
});

test('all three appointment browser modules parse as JavaScript',()=>{
 const scripts=page.split('<script type="module">').slice(1).map(fragment=>fragment.split('</script>')[0]);
 assert.equal(scripts.length,3);
 for(const [index,source] of scripts.entries()){
  const result=spawnSync(process.execPath,['--check','--input-type=module'],{input:source,encoding:'utf8'});
  assert.equal(result.status,0,'Invalid script module '+(index+1)+': '+result.stderr);
 }
});

test('LINE context restores the authorized selected person without asking twice',()=>{
 assert.ok(script.includes("activePersonId:allowed.some(x=>x.id===data.activePersonId)?data.activePersonId:''"));
 assert.ok(script.includes("window.liff?.isInClient?.()&&people.activePersonId&&people.people.some(x=>x.id===people.activePersonId)"));
 assert.ok(script.includes("memberId=people.activePersonId;"));
 assert.ok(script.includes("authorizedPersonFromLine=true;"));
 assert.ok(script.includes("select.dataset.phmsLinePerson=authorizedPersonFromLine?'1':'0'"));
 assert.ok(script.includes("authorizedPersonFromLine&&selected===memberId"));
 assert.ok(page.includes("select.dataset.phmsLinePerson==='1')||window.liff?.isInClient?.()===true"));
 assert.ok(script.includes("authorizedPersonFromLine=false;select.dataset.phmsLinePerson='0'"));
 assert.ok(script.includes("if(memberId&&!people.people.some(x=>x.id===memberId))memberId=''"),'Unauthorized URL must never preselect');
 assert.ok(page.includes('id="save" disabled'),'No write release during UAT');
});

test('real person-header fallback execution hides repeated selection only when LINE person is already chosen',()=>{
 const inline=page.split('<script type="module">')[3]?.split('</script>')[0];
 assert.ok(inline?.includes('authorizedLineSelection'),'UI fallback missing');
 const uuid='11111111-1111-4111-8111-111111111111';
 const render=({person='',fromLine=false,member='',active=false}={})=>{
  const callbacks={};
  const picker={hidden:false,classList:{add(){},remove(){}}};
  const header={textContent:'ยังไม่ได้เลือกบุคคล',hidden:false};
  const select={
   value:person,options:[{value:'',textContent:'เลือกบุคคล'},{value:uuid,textContent:'ยายปุ'}],
   dataset:{phmsLinePerson:active?'1':'0'},addEventListener(name,callback){callbacks[name]=callback}
  };
  const fake={
   document:{getElementById(id){return {personSelect:select,personPicker:picker,appointmentHeaderPerson:header}[id]}},
   window:{liff:{isInClient(){return fromLine}},addEventListener(){}},
   location:{search:member?'?member='+member:''},
   URLSearchParams,
   MutationObserver:class{observe(){}}
  };
  vm.runInNewContext(inline,fake);
  return {header,picker,select,callbacks};
 };
 const chosenLine=render({person:uuid,fromLine:true});
 assert.equal(chosenLine.header.textContent,'👤 เพิ่มนัดให้: ยายปุ');
 assert.equal(chosenLine.picker.hidden,true,'in-LINE preselected person must never see picker twice');
 const selectedByAuthorizedContext=render({person:uuid,fromLine:false,active:true});
 assert.equal(selectedByAuthorizedContext.picker.hidden,true);
 const chosenDeepLink=render({person:uuid,member:uuid});
 assert.equal(chosenDeepLink.picker.hidden,true);
 const direct=render({person:uuid});
 assert.equal(direct.picker.hidden,false,'Direct link must retain a person-change control');
 const unselected=render({fromLine:true});
 assert.equal(unselected.picker.hidden,false,'Do not hide picker without verified selection');
 assert.equal(unselected.header.textContent,'ยังไม่ได้เลือกบุคคล');
 assert.ok(!page.includes('<h2>1. เลือกบุคคลที่จะเพิ่มนัด</h2>'));
});

test('two editable preparation defaults seed once per new appointment draft',()=>{
 assert.ok(script.includes("'🪪 บัตรประชาชน'"));
 assert.ok(script.includes("'📅 ใบนัด (ตรวจสอบวันเวลาอีกครั้ง)'"));
 assert.ok(script.includes('function resetChecklistToDefaults()'));
 assert.ok(script.includes("checklistItems=DEFAULT_APPOINTMENT_CHECKLIST.map(title=>({title,status:'pending'}))"));
 assert.equal(script.split('resetChecklistToDefaults();').length-1,2,'Only initial draft and explicit full reset/person-change may re-seed defaults');
 assert.ok(script.includes("makePhmsDeleteButton('ลบ '+item.title,()=>removeChecklistItem(item))"),'Checklist uses shared immediate-delete control');
 assert.ok(script.includes("checklistItems.splice(index,1);\n renderChecklist();"),'Delete removes only the selected item and refreshes the list');
 assert.ok(!script.includes('checklistUndo')&&!script.includes('เลิกทำ')&&!script.includes('askChecklistDelete'),'Checklist has no undo button or confirmation dialog');
 assert.ok(script.includes("item.title=v;renderChecklist()"),'User edit stays available');
 assert.ok(script.includes("checklistItems.push({title:v,status:'pending'})"),'User can add new items');
 assert.ok(!script.includes("checklistItems=[];renderChecklist();"),'Full reset must initialize a fresh draft with defaults');
 assert.ok(script.includes("preparation_items:isPastAppointment()?[]:checklistItems.map(x=>({...x}))"),'Review continues to use only the items retained by the user');
});

test('shared PHMS delete action is consistent across every local-draft removal',()=>{
 assert.ok(page.includes('PHMS DELETE ACTION v1'),'Shared visual tokens must be present');
 assert.ok(page.includes('button.phms-delete-button .phms-delete-face'),'The accessible delete pill must have one shared style');
 assert.ok(page.includes('width:66px!important;height:32px!important'),'Visible delete pill must stay compact');
 assert.ok(page.includes('height:44px!important;min-height:44px!important'),'Delete target must remain easy to tap');
 assert.ok(script.includes('function makePhmsDeleteButton(label,handler)'),'Do not create a second competing delete style');
 assert.equal((script.match(/const remove=makePhmsDeleteButton\(/g)||[]).length,5,'Checklist, photo, procedure, journey photo and substep use the same delete button');
 assert.ok(script.includes("makePhmsDeleteButton('ลบรูปใบนัด '+(index+1)"),'Photo removal uses shared delete action');
 assert.ok(script.includes("makePhmsDeleteButton('ลบรายการตรวจ '+item"),'Procedure removal uses shared delete action');
 assert.ok(script.includes("view.className='secondary phms-photo-view phms-photo-action'"),'Photo preview stays visually distinct from delete');
 assert.ok(!script.includes("remove.textContent='🗑️'"),'Emoji-only deletion is not acceptable');
 assert.ok(!script.includes("remove.className='photo-remove'"),'Old large picture delete button must not reappear');
 assert.ok(!script.includes('checklistUndo')&&!script.includes('askChecklistDelete'),'Local draft deletion stays immediate and without undo');
});

test('journey guide image controls are detailed-mode only and fail closed on private persistence',()=>{
 assert.ok(page.includes('id="primaryJourneyPhotos"'),'Location photographs belong to the existing detailed section');
 assert.ok(page.includes('id="primaryJourneyFileInput"'),'Main location has its own file picker');
 assert.ok(page.includes('id="visitStepsDetails"'),'Journey steps reuse the existing advanced section');
 assert.ok(script.includes('const JOURNEY_PHOTO_MAX=5'),'Each location has a strict five-photo cap');
 assert.ok(script.includes('function prepareJourneyImage(file)'),'Images are processed on-device');
 assert.ok(script.includes("canvas.toBlob(done,'image/jpeg',quality)"),'EXIF stripped by adaptive JPEG recompression');
 assert.ok(script.includes('makeStopGallery(stop'),'Each stop has its own photo gallery');
 assert.ok(script.includes('stop.instructions.push('),'Instruction substeps are editable');
 assert.ok(script.includes('clearJourneyDraft()'),'Draft reset must release private photos');
 assert.ok(!script.includes("supabase.storage.from('public'"),'Do not upload photos to public storage');
});


test('fixed arrival lead uses eight accessible choices and preserves the safe 30-minute default',()=>{
 const match=page.match(/<select id="arrival_lead_minutes">([\s\S]*?)<\/select>/);
 assert.ok(match,'Arrival must remain a select-backed field in the form');
 const entries=[...match[1].matchAll(/<option value="(\d+)"/g)].map(x=>Number(x[1]));
 assert.deepEqual(entries,[15,30,45,60,90,120,150,180]);
 assert.ok(match[1].includes('<option value="30" selected>30 นาที</option>'));
 assert.ok(!page.includes('<input id="arrival_lead_minutes" type="number"'));
 assert.match(page,/id="arrivalLeadChoices"/);
 assert.match(page,/id="arrivalLeadPreview"/);
 assert.match(script,/button\.setAttribute\('aria-pressed'/);
 assert.match(script,/setArrivalLeadMinutes\(30\)/);
 assert.match(script,/sourceFilled\.set\('arrival_lead_minutes'/);
 assert.match(script,/values\.has\('arrival_lead_minutes'\)/);
});

test('arrival lead calculations handle every option, unknown time and crossing midnight',()=>{
 const from=script.indexOf('function normalizeArrivalLeadMinutes');
 const to=script.indexOf('function updateArrivalLeadUI',from);
 assert.ok(from>0&&to>from,'The pure arrival math must be present');
 const state={scenario:{value:'booked'},known:{value:'yes'},time:{value:'09:00'},arrival_lead_minutes:{value:'30'}};
 const options=[[15,'15 นาที'],[30,'30 นาที'],[45,'45 นาที'],[60,'1 ชั่วโมง'],[90,'1 ชั่วโมงครึ่ง'],[120,'2 ชั่วโมง'],[150,'2 ชั่วโมงครึ่ง'],[180,'3 ชั่วโมง']];
 const ctx={state,options};
 const calculate=vm.runInNewContext(
   'const ARRIVAL_LEAD_OPTIONS=options;const $=id=>state[id];const arrivalLeadSelect=state.arrival_lead_minutes;'+script.slice(from,to)+';({normalize:normalizeArrivalLeadMinutes,clock:arrivalTimeForAppointment})',
   ctx);
 for(const [offset,expected] of [[15,'08:45 น.'],[30,'08:30 น.'],[45,'08:15 น.'],[60,'08:00 น.'],[90,'07:30 น.'],[120,'07:00 น.'],[150,'06:30 น.'],[180,'06:00 น.']]){
  state.arrival_lead_minutes.value=String(offset);
  assert.equal(calculate.clock(),expected);
 }
 for(const invalid of ['','0','14','29','31','720']){
  assert.equal(calculate.normalize(invalid),30);
 }
 state.arrival_lead_minutes.value='180';state.time.value='00:20';
 assert.equal(calculate.clock(),'21:20 น. (วันก่อนนัด)');
 state.known.value='no';
 assert.equal(calculate.clock(),'');
 state.known.value='yes';state.scenario.value='historical';
 assert.equal(calculate.clock(),'');
});


test('reschedule contact opens on disclosure with one editor and verified-source guard',()=>{
 assert.equal((page.match(/id="contact_phone"/g)||[]).length,1,'No duplicate hospital telephone editors');
 assert.equal((page.match(/id="rescheduleContactEditor"/g)||[]).length,1);
 assert.ok(!page.includes('id="contactLoad"'),'Do not demand a second fetch button');
 for(const id of ['rescheduleDays','rescheduleDayCards','rescheduleWeekdaysBox','rescheduleWeekdays','rescheduleHoursSection','rescheduleHours','rescheduleHourCards','rescheduleStart','rescheduleEnd','contact_phone','rescheduleNotice','rescheduleNoticeCards','rescheduleNoticeUnit','rescheduleNoticeUnitCards','rescheduleInstructions']){
  assert.ok(page.includes('id="'+id+'"'),id+' missing from one editable contact panel');
 }
 assert.match(script,/contactRescheduleBox'\)\.addEventListener\('toggle'/);
 assert.match(script,/loadRescheduleContacts\(\)/);
 assert.match(script,/if\(!c\.verified\)/);
 assert.match(script,/if\(generation!==contactLoadGeneration/,'Late results must not refill a different hospital/person');
 assert.match(script,/function resetContactDraft\(\)/);
 assert.match(script,/selectedContactDays\(\)/);
 assert.match(script,/selectedContactHours\(\)/);
 assert.match(script,/selectedContactNotice\(\)/);
 assert.ok(page.includes('ยังไม่บันทึกการแก้ไขกลับทะเบียนกลาง'),'Never claim per-appointment edits update the master');
});

test('procedure cards allow 7 bilingual options and manual additions without preselecting',()=>{
 const names=['🩸 เจาะเลือด','🧪 เก็บปัสสาวะ','🧫 เก็บอุจจาระ','🫁 เก็บเสมหะ','🩻 เอกซเรย์','💓 ตรวจคลื่นไฟฟ้าหัวใจ','💻 พบแพทย์ออนไลน์'];
 for(const name of names)assert.ok(script.includes(name),'Missing procedure option: '+name);
 for(const term of ['Blood test','Urine sample','Stool sample','Sputum sample','X-ray','ECG / EKG','Telemedicine'])assert.ok(script.includes(term));
 assert.ok(page.includes('id="procedureCommonCards"'));
 assert.ok(page.includes('id="procedureOtherCards"'));
 assert.match(script,/procedurePreviewItems\.indexOf\(preset\.name\)/);
 assert.match(script,/function syncProcedureChoices\(\)/);
 assert.match(script,/function addProcedurePreview\(\)/);
 assert.ok(page.includes('id="procedureEntry"'),'Other procedure manual entry remains possible');
});

test('hospital preparation cards explicitly distinguish fasting, water, medications, and source time',()=>{
 assert.match(script,/const prepOrderPresets=/);
 for(const key of ["stop-food-water","water-ok","no-fast","special"]){
  assert.ok(script.includes("'"+key+"'"));
 }
 for(const time of ["20:00","22:00","00:00","02:00"])assert.ok(script.includes("'"+time+"'"));
 assert.ok(script.includes("prepMedicineText.placeholder='ระบุชื่อยาและคำสั่งจริง"));
 assert.ok(script.includes("'bring-water'"));
 assert.ok(script.includes("'hold-urine'"));
 assert.ok(script.includes("'medicine'"));
 assert.match(script,/function resetPrepOrderCards\(\)/);
 assert.match(script,/selectedPrepOrder='none'/,'No unverified hospital instruction is auto-selected');
 assert.match(script,/examPrepChoice\.value=fasting/,'Existing review flow receives selected structured category');
 assert.match(script,/examPrepDetails\.value=texts\.join/,'Review retains full explicit instructions');
 assert.ok(script.includes("รุ่นทดลองยังไม่บันทึกการแก้ไขกลับทะเบียนกลาง"));
});

test('draft packager allows 15 minutes without changing 30-minute default',async()=>{
 const {prepareDraftForReview}=await import('./draft-packager.mjs');
 const fifteen=prepareDraftForReview({arrival_lead_minutes:15});
 assert.equal(fifteen.ok,true);
 assert.equal(fifteen.draft.arrival_lead_minutes,15);
 const fallback=prepareDraftForReview({});
 assert.equal(fallback.draft.arrival_lead_minutes,30);
 for(const minutes of [0,14,16,29,181,720])assert.deepEqual(prepareDraftForReview({arrival_lead_minutes:minutes}).errors,['invalid_arrival_lead_minutes']);
});


test('required label is explicitly readable red without changing field validation',()=>{
 assert.match(page, /#editor #requiredLegend\{color:#b42318!important;font-weight:750!important/);
 assert.match(script, /requiredLegend'\)\.innerHTML='<strong class="phms-required-mark">\*<\/strong> <strong>จำเป็นต้องกรอก<\/strong>'/);
 assert.match(page, /<p class="notice phms-connection-status" id="connectionStatus" role="status" aria-live="polite">/);
});
test('LINE boot shows genuine phases and bounded authorization-loading recovery',()=>{
 assert.match(page, /rel="preload" href="https:\/\/static\.line-scdn\.net\/liff\/edge\/2\/sdk\.js"/);
 for(const key of ["'sdk','กำลังเปิด LINE","'login','กำลังยืนยันตัวตน","'people','กำลังตรวจสิทธิ์","'catalog','กำลังโหลดข้อมูลโรงพยาบาล"]){
  assert.ok(script.includes(key),'Missing progress phase '+key);
 }
 assert.match(script,/function showLineLoading\(phase,message\)/);
 assert.match(script,/function stopLineLoading\(\)/);
 assert.match(script,/const controller=new AbortController\(\)/);
 assert.match(script,/controller\.abort\(\),12000/);
 assert.match(script,/setTimeout\(\(\)=>\{\s*if\(generation!==lineStartup\.generation\)return;[\s\S]*?3500\)/);
 assert.match(script,/retry\.addEventListener\('click',\(\)=>location\.reload\(\)\)/);
 assert.match(script,/people\.error==='members_timeout'/);
 assert.match(script,/connectionBanner\.dataset\.state=\/ไม่สำเร็จ\|ไม่พร้อม/,'Errors must take priority over "loading" matches');
});


test('reschedule exposes seven fully spelled Thai weekday emoji cards only in custom-day mode',()=>{
 for(const day of ['💛 วันจันทร์','🩷 วันอังคาร','💚 วันพุธ','🧡 วันพฤหัสบดี','💙 วันศุกร์','💜 วันเสาร์','❤️ วันอาทิตย์']){
  assert.ok(script.includes(day),'A weekday full label is missing '+day);
 }
 assert.match(page,/#rescheduleContactEditor \.phms-choice-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(script,/rescheduleWeekdaysBox'\)\.classList\.toggle\('hidden',!specific\)/);
 assert.match(script,/rescheduleHoursSection'\)\.classList\.toggle\('hidden',!hasDay\)/);
 assert.match(script,/mode==='government'/);
 assert.match(script,/rescheduleHours'\)\.value='office'/);
 assert.ok(script.includes('ยังไม่มีการตรวจวันหยุดพิเศษอัตโนมัติ'));
});
test('custom contact time uses only selectable half-hour slots and 1 3 5 7 day cards',()=>{
 assert.ok(!page.includes('id="rescheduleNoticeNumber"'),'No free-form day count');
 assert.ok(!page.includes('type="time"'),'Native unrestricted minute picker removed');
 assert.match(script,/for\(let minute=0;minute<24\*60;minute\+=30\)/);
 assert.match(script,/minute%60/);
 assert.match(script,/for\(const value of \['1','3','5','7'\]\)/);
 assert.match(script,/function selectedContactNotice\(\)/);
 assert.ok(script.includes("['calendar','📅 วันปฏิทิน'"));
 assert.ok(script.includes("['working','🏛️ วันทำการ'"));
 assert.ok(script.includes("'rescheduleNoticeUnit').value='working'"));
 assert.match(script,/function selectedContactHours\(\)/);
 assert.match(script,/08:30–16:30 น./);
});
