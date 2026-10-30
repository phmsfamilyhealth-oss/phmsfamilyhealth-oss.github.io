import test from 'node:test';import assert from 'node:assert/strict';import {makeAppointmentBackend} from '../contracts/appointment-backend.mjs';
const uid='11111111-1111-4111-8111-111111111111',fid='22222222-2222-4222-8222-222222222222',fpid='33333333-3333-4333-8333-333333333333',pid='44444444-4444-4444-8444-444444444444';
let calls=0;
const security={
 verifyLineIdentity:async()=>({userId:uid}),resolvePerson:async()=>({familyPersonId:fpid,familyId:fid}),isReleaseEnabled:async()=>true,
 centralCanAccess:async()=>true,verifyProviderBinding:async()=>true,
 resolveWriteIdentity:async()=>({personId:pid,appointmentType:'walk_in',familyPersonId:fpid,familyId:fid}),
 readAuthorizedAppointment:async()=>({id:'appointment1',family_id:fid,family_person_id:fpid,deleted_at:null,hospital_name:'Test hospital'})
};
const draft={scenario:'walk_in',date:'2026-11-03',time_known:false,time:null,hospital:'Test hospital',prep:'Bring referral'};
const mkRequest=()=>new Request('https://example.test/appointment-confirm',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer verified-line-token'},body:JSON.stringify({selectedPersonCode:'P1',operationKey:'55555555-5555-4555-8555-555555555555',draft})});
test('HTTP -> authorization -> canonical row -> Supabase atomic RPC -> readback',async()=>{
 let sent;const handler=makeAppointmentBackend({security,supabase:{rpc:async(name,args)=>{calls++;sent={name,args};return {data:{ok:true,appointment_id:'appointment1'},error:null}}}});
 const response=await handler(mkRequest());const body=await response.json();
 assert.equal(response.status,201);assert.equal(body.ok,true);assert.equal(body.appointmentId,'appointment1');
 assert.equal(sent.name,'phms_v24_commit_appointment');assert.equal(sent.args.p_appointment.person_id,pid);
 assert.equal(sent.args.p_appointment.preparation_tasks[0].title,'Bring referral');
 assert.equal(sent.args.p_appointment.visit_mode,'walk_in');
});
test('denied release stops RPC',async()=>{let writes=0;const handler=makeAppointmentBackend({security:{...security,isReleaseEnabled:async()=>false},supabase:{rpc:async()=>{writes++}}});const response=await handler(mkRequest());assert.equal(response.status,404);assert.equal(writes,0)});
test('bad readback is not reported as success',async()=>{const handler=makeAppointmentBackend({security:{...security,readAuthorizedAppointment:async()=>({...await security.readAuthorizedAppointment(),family_id:'other'})},supabase:{rpc:async()=>({data:{ok:true,appointment_id:'appointment1'},error:null})}});const response=await handler(mkRequest());assert.equal(response.status,503);assert.equal((await response.json()).ok,false)});
test('missing trusted security adapter fails at startup',()=>assert.throws(()=>makeAppointmentBackend({supabase:{rpc:async()=>{}},security:{}}),/backend_not_configured/));
