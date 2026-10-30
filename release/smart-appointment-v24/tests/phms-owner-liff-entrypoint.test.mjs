import test from 'node:test';import assert from 'node:assert/strict';import {makePhmsOwnerLiffEntrypoint} from '../contracts/phms-owner-liff-entrypoint.mjs';
const actor='11111111-1111-4111-8111-111111111111',member='33333333-3333-4333-8333-333333333333',family='44444444-4444-4444-8444-444444444444';
function setup({gate=true,access=true,person=true}={}){
 let reads=0,legacy=0,gateQueries=0,permissionQueries=0;
 const privateQuery=async(sql)=>{if(sql.includes('phms_appointment_release_gate')){gateQueries++;return {rows:[{allowed:gate}]}}if(sql.includes('user_can_access_family_person')){permissionQueries++;return {rows:[{allowed:access}]}}throw Error('unexpected query')};
 const supabase={from:table=>{assert.equal(table,'family_persons');return {select:()=>({eq:()=>({limit:async()=>{reads++;return {data:person?[{id:member,family_id:family,person_id:'55555555-5555-4555-8555-555555555555',status:'active'}]:[],error:null}}})})}}};
 const route=makePhmsOwnerLiffEntrypoint({supabase,privateQuery,launchUrl:'https://example.test/appointment/',legacy:async()=>{legacy++}});
 return {route,counts:()=>({reads,legacy,gateQueries,permissionQueries})};
}
test('owner gate plus person rights route to LIFF with exact server-validated member',async()=>{const x=setup();const result=await x.route({command:'เพิ่มนัด',verifiedActorId:actor,selectedPersonCode:member});assert.equal(result.mode,'liff');assert.equal(new URL(result.url).searchParams.get('member'),member);assert.equal(x.counts().reads,1);assert.equal(x.counts().legacy,0)});
test('gate denied stays in existing LINE flow and never queries member',async()=>{const x=setup({gate:false});assert.equal((await x.route({command:'เพิ่มนัด จากภาพรวม',verifiedActorId:actor,selectedPersonCode:member})).mode,'legacy');assert.equal(x.counts().reads,0);assert.equal(x.counts().legacy,1)});
test('cross family/no appointment permission cannot resolve member',async()=>{const x=setup({access:false});assert.equal((await x.route({command:'เพิ่มนัด',verifiedActorId:actor,selectedPersonCode:member})).mode,'legacy');assert.equal(x.counts().reads,0)});
test('unknown member fails closed and retains legacy route',async()=>{const x=setup({person:false});assert.equal((await x.route({command:'เพิ่มนัด',verifiedActorId:actor,selectedPersonCode:member})).mode,'legacy')});
