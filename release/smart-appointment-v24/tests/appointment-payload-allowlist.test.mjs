import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../migrations/001_gated_atomic_appointment_draft.sql',import.meta.url),'utf8');
test('atomic RPC rejects unknown fields rather than silently discarding data',()=>{assert.match(sql,/jsonb_object_keys\(p_appointment\)/);assert.match(sql,/unsupported_appointment_field/);});
test('only supported appointment and checklist fields are allowed',()=>{assert.match(sql,/'preparation_tasks'\]\) LIMIT 1/);assert.match(sql,/INSERT INTO public\.appointment_tasks/);});
test('unsupported documents and reschedule remain blocked',()=>{assert.match(sql,/'document_metadata'/);assert.match(sql,/'rescheduled_from_appointment_id'/);assert.match(sql,/unsupported_related_data/);});
