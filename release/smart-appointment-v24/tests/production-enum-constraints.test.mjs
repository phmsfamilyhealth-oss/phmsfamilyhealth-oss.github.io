import test from 'node:test';import assert from 'node:assert/strict';import {canonicalizeVisit} from '../contracts/canonical-visit-mapper.mjs';import {mapAppointmentInsert} from '../contracts/supabase-appointment-row.mjs';
const cmd={actorId:'verified',subjectId:'fp',personId:'p',familyId:'f',appointmentType:'follow_up',draft:{},canonicalVisit:{visit_mode:'booked',visit_time_known:true,planned_visit_date:'2026-11-03',local_appointment_datetime:'2026-11-03T09:30',status:'planned'}};
test('booked appointment uses database-supported visit_mode',()=>assert.equal(canonicalizeVisit({scenario:'booked',date:'2026-11-03',time_known:true,time:'09:30'}).visit.visit_mode,'booked'));
test('historical known-time appointment also uses booked mode',()=>assert.equal(canonicalizeVisit({scenario:'historical',date:'2026-10-20',time_known:true,time:'09:30'}).visit.visit_mode,'booked'));
test('nonexistent scheduled visit_mode blocked before write',()=>assert.equal(mapAppointmentInsert({...cmd,canonicalVisit:{...cmd.canonicalVisit,visit_mode:'scheduled'}}).error,'invalid_visit_mode'));
test('nonexistent followup appointment_type blocked before write',()=>assert.equal(mapAppointmentInsert({...cmd,appointmentType:'followup'}).error,'invalid_appointment_type'));
test('valid follow_up type accepted by mapper',()=>assert.equal(mapAppointmentInsert(cmd).ok,true));
