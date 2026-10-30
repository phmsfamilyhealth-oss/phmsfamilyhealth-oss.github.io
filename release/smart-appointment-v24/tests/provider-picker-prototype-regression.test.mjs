import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../prototype/index.html',import.meta.url),'utf8');
test('all three providers expose exactly one visible autocomplete combobox each',()=>{
 for(const k of ['hospital','unit','clinician']){
  assert.match(html,new RegExp('id="'+k+'Search" role="combobox"'));
  assert.match(html,new RegExp('id="'+k+'SearchResults"[^>]+role="listbox"'));
  assert.match(html,new RegExp('id="provider'+(k==='hospital'?'Org':k==='unit'?'Unit':'Clinician')+'" class="hidden"'));
 }
 assert.doesNotMatch(html,/id="manualDoctor"/);
});
test('results are keyboard and touch accessible and sourced from authorized catalog',()=>{
 assert.match(html,/masterMatches\(x,term\)/);
 assert.match(html,/button\.addEventListener\('click'/);
 assert.match(html,/e\.key==='ArrowDown'/);
 assert.match(html,/e\.key==='Escape'/);
 assert.match(html,/authorizedCatalog/);
});
test('no unapproved master writes are available; unmatched addition is disabled',()=>{
 assert.match(html,/add\.disabled=true/);
 assert.match(html,/รอเปิดระบบตรวจสอบทะเบียน/);
 assert.match(html,/<button id="save" disabled/);
});
test('changing organization clears unit and doctor, and changing unit clears clinician',()=>{
 assert.match(html,/unit=changed==='providerOrg'\?'':/);
 assert.match(html,/changed==='providerOrg'\|\|changed==='providerUnit'/);
 assert.match(html,/document\.getElementById\('clinicianSearch'\)\.value=''/);
});
test('doctor is optional without a fabricated clinician id and the review retains selected names',()=>{
 assert.match(html,/document\.getElementById\('doctor'\)\.value=clinician\?\.display_name\|\|document\.getElementById\('clinicianSearch'\)\.value\.trim\(\)/);
 assert.match(html,/if\(id==='doctor'&&!\$\('doctor'\)\.value\.trim\(\)\)continue/);
 assert.match(html,/hospital:'โรงพยาบาล',department:'แผนก',doctor:'แพทย์'/);
 assert.match(html,/clinicianId:selectedClinicianId\(\)/);
});

test('selection closes results and keeps chosen label in same input',()=>{assert.match(html,/state\.selectedItem=item;state\.searchText=item\.label;input\.value=item\.label;closeCombo\(kind\)/);assert.match(html,/if\(!state\.isOpen\)\{closeCombo\(kind\);return;\}/);});
test('escape and outside pointer close active results; focus reopens',()=>{assert.match(html,/e\.key==='Escape'\)\{closeCombo\(kind\)/);assert.match(html,/document\.addEventListener\('pointerdown'/);assert.match(html,/input\.addEventListener\('focus'/);});
test('typing resets selection and Thai IME composition cannot confirm prematurely',()=>{assert.match(html,/if\(e\.isComposing\)return/);assert.match(html,/state\.searchText=input\.value;state\.selectedItem=null;state\.isOpen=true/);assert.match(html,/e\.keyCode!==229/);});
