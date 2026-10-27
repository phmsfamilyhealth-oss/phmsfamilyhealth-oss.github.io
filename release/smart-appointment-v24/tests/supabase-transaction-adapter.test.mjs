import test from 'node:test';import assert from 'node:assert/strict';import {makeSupabaseAppointmentTransaction as make} from '../contracts/supabase-transaction-adapter.mjs';
const c={actorId:'u',familyId:'f',subjectId:'p',operationKey:'key',preparedRow:{appointment_type:'walk_in'}};
test('requires dedicated RPC and sends verified row',async()=>{let name,args;const a=make({rpc:async(n,p)=>{name=n;args=p;return {data:{ok:true,appointment_id:'appointment-id'},error:null}}});const r=await a(c);assert.equal(name,'phms_v24_commit_appointment');assert.equal(args.p_appointment.appointment_type,'walk_in');assert.equal(r.appointmentId,'appointment-id')});
test('RPC missing fails closed without direct insert',async()=>assert.equal(await make({from:()=>{throw Error('must not insert')}})(c),null));
test('missing or denied RPC never reports success',async()=>assert.equal(await make({rpc:async()=>({data:null,error:{message:'function missing'}})})(c),null));
test('malformed receipt rejected',async()=>assert.equal(await make({rpc:async()=>({data:{ok:true},error:null})})(c),null));
