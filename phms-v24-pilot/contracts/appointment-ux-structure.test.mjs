import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

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
  "timeSection.append($('timebox'),$('appointmentPhotosSection'))",
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
 assert.ok(!script.includes("clearAppointmentPhotos();refresh();"),'Scenario switches must not clear selected photos');
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
