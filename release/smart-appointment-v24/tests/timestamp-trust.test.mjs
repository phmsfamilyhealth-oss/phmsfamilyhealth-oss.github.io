import test from 'node:test';import assert from 'node:assert/strict';import {mapAppointmentInsert} from '../contracts/supabase-appointment-row.mjs';
const cmd={actorId:'verified',subjectId:'subject',personId:'person',familyId:'family',appointmentType:'follow_up',draft:{},canonicalVisit:{visit_time_known:true,visit_mode:'booked',planned_visit_date:'2026-11-03',local_appointment_datetime:'2026-11-03T09:30',status:'planned'}};
test('server derives UTC from Bangkok local time',()=>assert.equal(mapAppointmentInsert(cmd).row.appointment_at,'2026-11-03T02:30:00.000Z'));
test('caller-provided timestamp is rejected',()=>assert.equal(mapAppointmentInsert({...cmd,canonicalVisit:{...cmd.canonicalVisit,appointment_at:'2026-11-03T09:30:00Z'}}).error,'untrusted_precomputed_timestamp'));
