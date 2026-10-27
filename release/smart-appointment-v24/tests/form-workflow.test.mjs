import test from 'node:test';import assert from 'node:assert/strict';import {transition as go} from '../contracts/form-workflow.mjs';
const draft={date:'2026-11-03',time:'09:00'};
test('edit review submit verified success',()=>{let s=go(null,{type:'EDIT',draft});s=go(s,{type:'REVIEW',validation:{ok:true}});assert.equal(s.step,'review');s=go(s,{type:'SUBMIT'});assert.equal(s.step,'submitting');s=go(s,{type:'SUCCESS',receipt:{appointmentId:'a1'}});assert.equal(s.step,'done')});
test('review requires valid draft',()=>{let s=go(go(null,{type:'EDIT',draft}),{type:'REVIEW',validation:{ok:false}});assert.equal(s.step,'edit');assert.equal(s.error,'invalid_draft')});
test('submit requires review',()=>assert.equal(go(null,{type:'SUBMIT'}).error,'review_required'));
test('no edits during submit',()=>{let s=go(go(go(null,{type:'EDIT',draft}),{type:'REVIEW',validation:{ok:true}}),{type:'SUBMIT'});assert.equal(go(s,{type:'EDIT',draft:{}}).error,'busy')});
test('failed save returns review',()=>{let s=go(go(go(null,{type:'EDIT',draft}),{type:'REVIEW',validation:{ok:true}}),{type:'SUBMIT'});assert.equal(go(s,{type:'FAIL'}).step,'review')});
test('missing verified readback cannot complete',()=>{let s=go(go(go(null,{type:'EDIT',draft}),{type:'REVIEW',validation:{ok:true}}),{type:'SUBMIT'});assert.equal(go(s,{type:'SUCCESS',receipt:{}}).error,'unverified_result')});
test('review is snapshot not mutable source',()=>{let s=go(go(null,{type:'EDIT',draft}),{type:'REVIEW',validation:{ok:true}});draft.time='10:00';assert.equal(s.reviewed.time,'09:00')});
