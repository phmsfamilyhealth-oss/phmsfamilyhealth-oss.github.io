import test from 'node:test';import assert from 'node:assert/strict';
import {V1431_APPOINTMENT_ANCHOR,makeV1431AppointmentRouteReplacement} from '../contracts/v1431-appointment-route-patch.mjs';
import {prepareLiveWebhookPatch} from '../scripts/prepare-live-webhook-patch.mjs';
import {createHash} from 'node:crypto';
test('candidate route keeps byte-identical original legacy logic behind fail-safe fallback',()=>{const replacement=makeV1431AppointmentRouteReplacement();assert.match(replacement,/typeof phmsV24OwnerRoute==='function'/);assert.match(replacement,/if\(!v24Handled\)/);assert.ok(replacement.includes("await replyAppointmentTypePicker(e.replyToken,u,k,id,t,await appointmentActivePersonName(u,k,id))"));assert.equal(replacement.split('continue').length,2)});
test('patch replaces exact v1431 anchor and leaves unrelated medication route intact',()=>{const original='const medicationHandler=true;\n'+V1431_APPOINTMENT_ANCHOR+'\nconst legacyDoctors=true;';const expectedSha256=createHash('sha256').update(original).digest('hex');const result=prepareLiveWebhookPatch(original,{expectedSha256,replacement:makeV1431AppointmentRouteReplacement()});assert.equal(result.patched.includes(V1431_APPOINTMENT_ANCHOR),false);assert.ok(result.patched.startsWith('const medicationHandler=true;\n'));assert.ok(result.patched.endsWith('\nconst legacyDoctors=true;'))});
test('patch cannot select unreviewed handler identifier',()=>assert.throws(()=>makeV1431AppointmentRouteReplacement('untrusted'),/unknown_trusted_handler/));

test('transport-uncertain response is consumed rather than triggering duplicate legacy LINE reply',()=>{const replacement=makeV1431AppointmentRouteReplacement();assert.ok(replacement.includes("'delivery_uncertain'"));assert.ok(replacement.includes('if(!v24Handled)'))});
