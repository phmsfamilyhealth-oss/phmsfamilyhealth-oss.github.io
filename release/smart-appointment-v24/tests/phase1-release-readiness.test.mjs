import test from 'node:test';
import assert from 'node:assert/strict';
import {PHASE1_REQUIRED,assessPhase1} from '../contracts/phase1-release-readiness.mjs';
test('no evidence never passes release',()=>assert.equal(assessPhase1({}).passed,false));
test('all non-device gates require verifiable evidence',()=>{
 const evidence=Object.fromEntries(PHASE1_REQUIRED.map(k=>[k,{passed:true,reference:'CI/deployment proof '+k}]));
 assert.deepEqual(assessPhase1(evidence),{passed:true,missing:[],realDeviceWaived:true});
 assert.deepEqual(assessPhase1(evidence,{waiveRealDevice:false}).missing,['real_device_uat']);
});
test('reported pass without reference is rejected',()=>{
 const evidence=Object.fromEntries(PHASE1_REQUIRED.map(k=>[k,{passed:true,reference:'validated'}]));
 evidence.atomic_commit_backend={passed:true,reference:' '};
 assert.ok(assessPhase1(evidence).missing.includes('atomic_commit_backend'));
});
test('explicit failures deny release',()=>{
 const evidence=Object.fromEntries(PHASE1_REQUIRED.map(k=>[k,{passed:true,reference:'validated'}]));
 evidence.permission_negative={passed:false,reference:'tested'};
 assert.ok(assessPhase1(evidence).missing.includes('permission_negative'));
});
