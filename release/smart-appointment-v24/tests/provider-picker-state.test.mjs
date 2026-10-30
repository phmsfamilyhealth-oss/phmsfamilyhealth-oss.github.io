import test from 'node:test';import assert from 'node:assert/strict';import {providerPickerState as state} from '../contracts/provider-picker-state.mjs';
const m={organizations:[{id:'h1',name:'รพ. ก'},{id:'h2',name:'รพ. ข'}],units:[{id:'u1',organization_id:'h1',name:'หัวใจ'},{id:'u2',organization_id:'h2',name:'กระดูก'}],clinicians:[{id:'d1',organization_id:'h1',service_unit_id:'u1',display_name:'แพทย์ ก'},{id:'d2',organization_id:'h2',service_unit_id:'u2',display_name:'แพทย์ ข'}]};
test('without master data provider chooser has no options',()=>{const r=state(null);assert.equal(r.organizations.length,0);assert.equal(r.valid,false)});
test('correct hospital scopes clinic and clinician',()=>{const r=state(m,'h1','u1','d1');assert.deepEqual(r.units.map(x=>x.value),['u1']);assert.deepEqual(r.clinicians.map(x=>x.value),['d1']);assert.equal(r.valid,true)});
test('changing hospital invalidates former unit and clinician',()=>{const r=state(m,'h2','u1','d1');assert.equal(r.unitId,'');assert.equal(r.clinicianId,'');assert.deepEqual(r.clinicians,[])});
test('unknown hospital is invalid',()=>assert.equal(state(m,'wrong').valid,false));
