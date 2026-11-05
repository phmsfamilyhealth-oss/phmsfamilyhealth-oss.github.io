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
 assert.doesNotMatch(page,/<h2>1\\. เลือกบุคคลที่จะเพิ่มนัด<\\/h2>/);
});
