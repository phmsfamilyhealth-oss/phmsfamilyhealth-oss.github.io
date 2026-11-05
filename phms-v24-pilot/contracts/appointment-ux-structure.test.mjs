import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

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
