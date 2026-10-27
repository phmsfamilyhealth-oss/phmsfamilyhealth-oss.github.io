import test from 'node:test';
import assert from 'node:assert/strict';
import {confirmAppointment} from '../contracts/confirm-orchestrator.mjs';
const request={credential:'signed-token-placeholder',selectedPersonCode:'P1',operationKey:'12345678-1234-4234-8234-123456789abc',draft:{scenario:'booked',date:'2026-11-03',time_known:true,time:'09:30',hospital:'Demo hospital',prep:'ใบนัด'}};
const make=(overrides={})=>{let commits=0;const adapters={
 verifyLineIdentity:async()=>({userId:'verified-user'}),
 resolvePerson:async()=>({familyPersonId:'authorized-subject',familyId:'family-a'}),
 isReleaseEnabled:async()=>true,
 centralCanAccess:async(_u,_p,_r,_a)=>true,
 verifyProviderBinding:async()=>true,
 atomicCommit:async x=>{commits++;assert.equal(x.actorId,'verified-user');assert.equal(x.subjectId,'authorized-subject');return {appointmentId:'apt-1',authorizedReadback:true}},
 ...overrides
};return {adapters,getCommits:()=>commits};};
test('valid authorized request produces verified appointment receipt',async()=>{const m=make();const r=await confirmAppointment(request,m.adapters);assert.equal(r.ok,true);assert.equal(m.getCommits(),1);});
test('missing token denies before commit',async()=>{let m=make();let r=await confirmAppointment({...request,credential:''},m.adapters);assert.equal(r.error,'unauthenticated');assert.equal(m.getCommits(),0);});
test('token verification rejects forged identity',async()=>{let m=make({verifyLineIdentity:async()=>null});let r=await confirmAppointment(request,m.adapters);assert.equal(r.error,'unauthenticated');assert.equal(m.getCommits(),0);});
test('unknown person denied',async()=>{let m=make({resolvePerson:async()=>null});let r=await confirmAppointment(request,m.adapters);assert.equal(r.error,'person_not_found');assert.equal(m.getCommits(),0);});
test('release gate OFF denies request',async()=>{let m=make({isReleaseEnabled:async()=>false});let r=await confirmAppointment(request,m.adapters);assert.equal(r.error,'feature_not_released');assert.equal(m.getCommits(),0);});
test('no create permission denies',async()=>{let m=make({centralCanAccess:async()=>false});let r=await confirmAppointment(request,m.adapters);assert.equal(r.error,'permission_denied');assert.equal(m.getCommits(),0);});
test('invalid time denies',async()=>{let m=make();let r=await confirmAppointment({...request,draft:{...request.draft,time:'25:90'}},m.adapters);assert.equal(r.error,'invalid_draft');assert.equal(m.getCommits(),0);});
test('provider mismatch denies',async()=>{let m=make({verifyProviderBinding:async()=>false});let r=await confirmAppointment(request,m.adapters);assert.equal(r.error,'provider_mismatch');assert.equal(m.getCommits(),0);});
test('document permission separately required',async()=>{let m=make({centralCanAccess:async(_u,_p,r)=>r!=='documents'});let r=await confirmAppointment({...request,draft:{...request.draft,documents:[{name:'x.pdf',type:'application/pdf',size:123}]}},m.adapters);assert.equal(r.error,'document_permission_denied');assert.equal(m.getCommits(),0);});
test('never report success without authorized readback',async()=>{let m=make({atomicCommit:async()=>({appointmentId:'apt-1'})});let r=await confirmAppointment(request,m.adapters);assert.equal(r.error,'commit_not_verified');});
test('invalid idempotency key denied',async()=>{let m=make();let r=await confirmAppointment({...request,operationKey:'same'},m.adapters);assert.equal(r.error,'invalid_operation_key');assert.equal(m.getCommits(),0);});
