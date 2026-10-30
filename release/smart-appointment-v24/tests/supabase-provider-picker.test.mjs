import test from 'node:test';import assert from 'node:assert/strict';import {loadSupabaseProviderPicker as load} from '../contracts/supabase-provider-picker.mjs';
const request={credential:'valid-verified-line-token',personCode:'P1',organizationId:'h1',unitId:'u1',clinicianId:'d1'};
const identity={verifyLineIdentity:async()=>({userId:'user'}),resolvePerson:async()=>({familyPersonId:'person'}),isReleaseEnabled:async()=>true,centralCanAccess:async()=>true};
let reads=0;const data={healthcare_organizations:[{id:'h1',name:'รพ. ก'}],healthcare_service_units:[{id:'u1',organization_id:'h1',name:'แผนก'}],healthcare_clinicians:[{id:'d1',organization_id:'h1',service_unit_id:'u1',display_name:'แพทย์ ก'}]};
const db={from(name){reads++;return {select(){return {is(){return {limit:async()=>({data:data[name],error:null})}}}}}}};
test('authorized read returns provider choices',async()=>{const r=await load(request,identity,db);assert.equal(r.ok,true);assert.equal(r.clinicians[0].value,'d1')});
test('denied release does not query database',async()=>{reads=0;const r=await load(request,{...identity,isReleaseEnabled:async()=>false},db);assert.equal(r.ok,false);assert.equal(reads,0)});
test('denied permission does not query database',async()=>{reads=0;const r=await load(request,{...identity,centralCanAccess:async()=>false},db);assert.equal(r.error,'permission_denied');assert.equal(reads,0)});
test('missing database connection fails closed',async()=>assert.equal((await load(request,identity,null)).error,'provider_catalog_unavailable'));
