import test from 'node:test';import assert from 'node:assert/strict';import {verifyCanonicalVisitAgainstDatabase as check} from '../contracts/db-constraint-gate.mjs';
const walk={visit_mode:'walk_in',visit_time_known:false,appointment_at:null,planned_visit_date:'2026-11-03',status:'planned'};
test('walk-in date only matches production constraint',()=>assert.equal(check(walk).ok,true));
test('historical completed date-only supported by candidate constraint',()=>assert.equal(check({...walk,visit_mode:'booked',status:'completed'}).ok,true));
test('booked no-time cannot bypass DB constraint',()=>assert.equal(check({...walk,visit_mode:'scheduled'}).error,'unknown_time_constraint'));
test('walk in unknown time cannot invent timestamp',()=>assert.equal(check({...walk,appointment_at:'2026-11-03T12:00:00Z'}).error,'unknown_time_constraint'));
test('planned requires date or timestamp',()=>assert.equal(check({visit_mode:'scheduled',visit_time_known:true,status:'planned'}).error,'planned_date_required'));
