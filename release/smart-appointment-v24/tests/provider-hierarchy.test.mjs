import test from 'node:test';import assert from 'node:assert/strict';import {providerChoices,verifyProviderSelection} from '../contracts/provider-hierarchy.mjs';
const master={organizations:[{id:'a'},{id:'b'},{id:'c',deleted_at:'2026-01-01'}],units:[{id:'u1',organization_id:'a'},{id:'u2',organization_id:'b'}],clinicians:[{id:'d1',organization_id:'a',service_unit_id:'u1'},{id:'d2',organization_id:'b',service_unit_id:'u2'},{id:'d3',organization_id:'a',service_unit_id:'u1',deleted_at:'2026-01-01'}]};
test('only hospital-owned departments appear',()=>assert.deepEqual(providerChoices(master,'a','u1').units.map(x=>x.id),['u1']));
test('only hospital and department doctors appear',()=>assert.deepEqual(providerChoices(master,'a','u1').clinicians.map(x=>x.id),['d1']));
test('wrong hospital doctor denied',()=>assert.equal(verifyProviderSelection(master,{organizationId:'a',unitId:'u1',clinicianId:'d2'}),false));
test('wrong hospital clinic denied',()=>assert.equal(verifyProviderSelection(master,{organizationId:'a',unitId:'u2'}),false));
test('inactive doctor denied',()=>assert.equal(verifyProviderSelection(master,{organizationId:'a',unitId:'u1',clinicianId:'d3'}),false));
test('inactive organization denied',()=>assert.equal(verifyProviderSelection(master,{organizationId:'c'}),false));
test('valid hierarchy accepted',()=>assert.equal(verifyProviderSelection(master,{organizationId:'a',unitId:'u1',clinicianId:'d1'}),true));
