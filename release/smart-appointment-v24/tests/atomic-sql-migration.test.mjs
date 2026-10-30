import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../migrations/001_gated_atomic_appointment_draft.sql',import.meta.url),'utf8');
test('migration grants RPC only to service role and denies browser roles',()=>{assert.match(sql,/REVOKE ALL ON FUNCTION[^;]+FROM PUBLIC, anon, authenticated/);assert.match(sql,/GRANT EXECUTE ON FUNCTION[^;]+TO service_role/)});
test('database transaction rechecks release gate and both central actions',()=>{assert.match(sql,/private\.phms_appointment_release_gate/);assert.match(sql,/'appointments','create'/);assert.match(sql,/'appointments','view'/)});
test('database transaction locks idempotency and rejects payload changes',()=>{assert.match(sql,/pg_advisory_xact_lock/);assert.match(sql,/operation_key_reused/);assert.match(sql,/PRIMARY KEY\(actor_user_id,operation_key\)/)});
test('uses trusted family person record and never trusts provider IDs',()=>{assert.match(sql,/FROM public\.family_persons/);assert.match(sql,/unsupported_related_data/)});
test('migration is separately staged, not self-deploying',()=>{assert.match(sql,/NOT APPLIED TO PRODUCTION/);assert.match(sql,/BEGIN;/);assert.match(sql,/COMMIT;/)});

test('production checklist projection rejects dual-source payload instead of silently dropping structured tasks',()=>{
  assert.match(sql,/IF v_task_count > 0\s+THEN RAISE EXCEPTION 'checklist_dual_source_not_supported'/);
  assert.doesNotMatch(sql,/checklist_instructions_not_supported_by_projection/);
});

test('atomic write rejects a visit date differing from Bangkok-local appointment timestamp',()=>{assert.match(sql,/v_time AT TIME ZONE 'Asia\/Bangkok'/);assert.match(sql,/appointment_date_time_mismatch/)});
