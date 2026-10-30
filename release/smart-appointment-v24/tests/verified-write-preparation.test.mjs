import test from 'node:test';import assert from 'node:assert/strict';import {prepareVerifiedAppointmentWrite as prepare} from '../contracts/verified-write-preparation.mjs';
const command={actorId:'u',subjectId:'family-person',familyId:'f',operationKey:'key',personId:'forged',appointmentType:'forged',draft:{hospital_name:'Hospital'},canonicalVisit:{visit_mode:'walk_in',visit_time_known:false,planned_visit_date:'2026-11-03',appointment_at:null,status:'planned'}};
const identity={personId:'real-person',appointmentType:'walk_in',familyPersonId:'family-person',familyId:'f'};
test('uses server person ID and appointment type, never client supplied values',async()=>{const r=await prepare(command,{resolveWriteIdentity:async()=>identity});assert.equal(r.ok,true);assert.equal(r.row.person_id,'real-person');assert.equal(r.row.appointment_type,'walk_in')});
test('rejects cross-family resolution',async()=>assert.equal((await prepare(command,{resolveWriteIdentity:async()=>({...identity,familyId:'other'})})).error,'write_identity_mismatch'));
test('rejects unresolved canonical person',async()=>assert.equal((await prepare(command,{resolveWriteIdentity:async()=>({...identity,personId:null})})).error,'write_identity_unresolved'));
test('cannot write without server resolver',async()=>assert.equal((await prepare(command,{})).error,'missing_verified_context'));
