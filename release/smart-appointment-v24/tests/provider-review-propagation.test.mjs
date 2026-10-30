import test from 'node:test';import assert from 'node:assert/strict';import {prepareDraftForReview} from '../contracts/draft-packager.mjs';
const id='11111111-1111-4111-8111-111111111111';
test('preserves hierarchy through review for verification',()=>{const r=prepareDraftForReview({scenario:'booked',date:'2026-11-01',time_known:true,time:'09:00',provider_selection:{organizationId:id,unitId:'',clinicianId:''}});assert.equal(r.ok,true);assert.deepEqual(r.draft.provider_selection,{organizationId:id,unitId:'',clinicianId:''})});
test('invalid registry object fails closed',()=>{const r=prepareDraftForReview({provider_selection:{organizationId:{id}}});assert.equal(r.ok,false);assert.deepEqual(r.errors,['invalid_provider_selection'])});
