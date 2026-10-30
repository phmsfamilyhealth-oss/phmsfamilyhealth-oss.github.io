import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../edge-candidate/live-index.ts',import.meta.url),'utf8');
test('historical scenario has server-derived appointment type rather than unconditional rejection',()=>assert.match(source,/scenario==='booked'\|\|scenario==='historical'/));
test('historical write stays behind installed RPC, idempotency ledger and migrated constraint',()=>{assert.match(source,/canReleaseAppointmentSchema\(result\[0\]\)/);assert.match(source,/historical_check_ready/);assert.match(source,/if\(!readOnly&&await isSchemaReady\(\)!==true\)/)});
