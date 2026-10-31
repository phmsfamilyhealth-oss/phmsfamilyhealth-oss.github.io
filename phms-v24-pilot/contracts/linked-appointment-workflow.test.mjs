import test from 'node:test';
import assert from 'node:assert/strict';
import {historicalVisitDate,isEligibleSavedVisit,canHandoffSavedVisit,existingPHMSLineCommand} from './linked-appointment-workflow.mjs';
const person='5acdde74-0b1c-4868-b780-706db359e70d';
const visit={id:'a9b7e24b-9e28-45a6-8ebd-9c35e6b47902',planned_visit_date:'2026-10-20',title:'Synthetic appointment'};
test('accepts same saved visit for same person and matching date',()=>{
 assert.equal(canHandoffSavedVisit(visit,{memberId:person,sourceMemberId:person,formDate:'2026-10-20',today:'2026-10-31'}),true);
});
test('no cross-person, future-visit, mismatched-date handoff',()=>{
 assert.equal(canHandoffSavedVisit(visit,{memberId:person,sourceMemberId:'bc7ce7de-c942-4028-b048-4dbf8fe81931',today:'2026-10-31'}),false);
 assert.equal(canHandoffSavedVisit(visit,{memberId:person,sourceMemberId:person,formDate:'2026-10-19',today:'2026-10-31'}),false);
 assert.equal(isEligibleSavedVisit({...visit,planned_visit_date:'2026-11-03'},'2026-10-31'),false);
});
test('invalid calendar dates and forged identifiers are rejected',()=>{
 assert.equal(historicalVisitDate({...visit,planned_visit_date:'2026-02-30'}),'');
 assert.equal(isEligibleSavedVisit({...visit,id:'not-an-id'},'2026-10-31'),false);
 assert.throws(()=>existingPHMSLineCommand('not-an-id','finance'),/invalid_appointment_id/);
 assert.throws(()=>existingPHMSLineCommand(visit.id,'inventory'),/invalid_resource/);
});
test('existing LINE routes preserve the correct visit code',()=>{
 assert.equal(existingPHMSLineCommand(visit.id,'finance'),'ค่าใช้จ่ายนัด a9b7e24b-9e2');
 assert.equal(existingPHMSLineCommand(visit.id,'medication'),'เพิ่มยาจากนัด a9b7e24b-9e2');
});
