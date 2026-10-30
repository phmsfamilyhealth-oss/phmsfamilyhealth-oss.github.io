import test from 'node:test';import assert from 'node:assert/strict';import {loadAuthorizedProviderPicker as load} from '../contracts/provider-catalog-orchestrator.mjs';
const request={credential:'verified-line-token',personCode:'P1',organizationId:'h1',unitId:'u1',clinicianId:'d1'};
const adapters={verifyLineIdentity:async()=>({userId:'u1'}),resolvePerson:async()=>({familyPersonId:'p1'}),isReleaseEnabled:async()=>true,centralCanAccess:async()=>true,getAuthorizedProviderMaster:async()=>({organizations:[{id:'h1',name:'โรงพยาบาลหนึ่ง'}],units:[{id:'u1',organization_id:'h1',name:'คลินิก'}],clinicians:[{id:'d1',organization_id:'h1',service_unit_id:'u1',display_name:'แพทย์ ก'}]})};
test('authorized provider catalog is properly scoped',async()=>{const r=await load(request,adapters);assert.equal(r.ok,true);assert.equal(r.clinicians[0].label,'แพทย์ ก')});
test('reject forged token',async()=>assert.equal((await load(request,{...adapters,verifyLineIdentity:async()=>null})).error,'unauthenticated'));
test('reject cross family target',async()=>assert.equal((await load(request,{...adapters,resolvePerson:async()=>null})).error,'person_not_found'));
test('release off fails closed',async()=>assert.equal((await load(request,{...adapters,isReleaseEnabled:async()=>false})).error,'feature_not_released'));
test('central view permission required',async()=>assert.equal((await load(request,{...adapters,centralCanAccess:async()=>false})).error,'permission_denied'));
test('catalog absent fails closed',async()=>assert.equal((await load(request,{...adapters,getAuthorizedProviderMaster:async()=>null})).error,'provider_catalog_unavailable'));
