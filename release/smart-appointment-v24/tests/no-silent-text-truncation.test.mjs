import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {mapAppointmentInsert} from '../contracts/supabase-appointment-row.mjs';
const sql=readFileSync(new URL('../migrations/001_gated_atomic_appointment_draft.sql',import.meta.url),'utf8');
const base={actorId:'u',subjectId:'fp',personId:'p',familyId:'f',appointmentType:'walk_in',draft:{},canonicalVisit:{visit_mode:'walk_in',visit_time_known:false,appointment_at:null,planned_visit_date:'2026-11-03',status:'planned'}};
test('overlong hospital name is rejected before writing',()=>assert.equal(mapAppointmentInsert({...base,draft:{hospital_name:'x'.repeat(161)}}).error,'appointment_text_too_long'));
test('overlong clinical note is rejected rather than shortened',()=>assert.equal(mapAppointmentInsert({...base,draft:{note:'x'.repeat(1001)}}).error,'appointment_text_too_long'));
test('checklist instruction cannot be silently shortened',()=>assert.equal(mapAppointmentInsert({...base,draft:{preparation_tasks:[{title:'Bring results',instruction:'x'.repeat(1001)}]}}).error,'checklist_instruction_too_long'));
test('SQL transaction rejects both oversize appointment and checklist fields',()=>{assert.match(sql,/appointment_text_too_long/);assert.match(sql,/checklist_instruction_too_long/);});
