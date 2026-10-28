import test from 'node:test';import assert from 'node:assert/strict';
import {makeLineOwnerLiffWebhookBridge} from '../contracts/line-owner-liff-webhook-bridge.mjs';
const lineUserId='U'+'a'.repeat(32),actor='11111111-1111-4111-8111-111111111111',member='33333333-3333-4333-8333-333333333333';
const event={source:{userId:lineUserId},postback:{data:'เพิ่มนัด'}};
function make({signed=true,gate=true,access=true,subject=true,activeMember=true}={}){
 let sent=0,legacy=0,active=0;
 const supabase={from:table=>{if(table==='line_identities')return {select:()=>({eq:()=>({limit:async()=>({data:subject?[{id:'44444444-4444-4444-8444-444444444444',user_id:actor,is_active:true}]:[],error:null})})})};if(table==='family_persons')return {select:()=>({eq:()=>({limit:async()=>({data:[{id:member,family_id:'55555555-5555-4555-8555-555555555555',person_id:'66666666-6666-4666-8666-666666666666',status:'active'}],error:null})})})};throw Error('unexpected table')}};
 const privateQuery=async sql=>({rows:[{allowed:sql.includes('phms_appointment_release_gate')?gate:access}]});
 const bridge=makeLineOwnerLiffWebhookBridge({supabase,privateQuery,launchUrl:'https://example.test/appointment/',verifyEvent:async()=>signed,resolveActiveMember:async()=>{active++;return activeMember?member:null},sendLiff:async(_e,url)=>{sent++;assert.equal(new URL(url).searchParams.get('member'),member)},legacy:async ctx=>{assert.equal(ctx.event,event);legacy++}});
 return {bridge,stats:()=>({sent,legacy,active})};
}
test('signed LINE user with central rights opens scoped LIFF link',async()=>{const x=make();assert.equal((await x.bridge(event)).mode,'liff');assert.deepEqual(x.stats(),{sent:1,legacy:0,active:1})});
test('unsigned LINE event never looks up active person nor opens legacy flow',async()=>{const x=make({signed:false});assert.deepEqual(await x.bridge(event),{handled:true,mode:'rejected'});assert.deepEqual(x.stats(),{sent:0,legacy:0,active:0})});
test('pilot off and cross-family permission denied use legacy flow',async()=>{for(const opts of [{gate:false},{access:false},{subject:false}]){const x=make(opts);assert.equal((await x.bridge(event)).mode,'legacy');assert.equal(x.stats().sent,0);assert.equal(x.stats().legacy,1)}});
test('unrelated postbacks are not intercepted',async()=>{const x=make();assert.deepEqual(await x.bridge({...event,postback:{data:'ยา'}}),{handled:false});assert.deepEqual(x.stats(),{sent:0,legacy:0,active:0})});

test('missing active member preserves legacy route without LIFF launch',async()=>{const x=make({activeMember:false});const eventResult=await x.bridge(event);assert.equal(eventResult.mode,'legacy');assert.equal(x.stats().sent,0);assert.equal(x.stats().legacy,1)});

test('LIFF reply transport uncertainty never triggers a duplicate legacy reply',async()=>{
 let sent=0,legacy=0;
 const supabase={from:table=>{if(table==='line_identities')return {select:()=>({eq:()=>({limit:async()=>({data:[{id:'44444444-4444-4444-8444-444444444444',user_id:actor,is_active:true}],error:null})})})};if(table==='family_persons')return {select:()=>({eq:()=>({limit:async()=>({data:[{id:member,family_id:'55555555-5555-4555-8555-555555555555',person_id:'66666666-6666-4666-8666-666666666666',status:'active'}],error:null})})})};throw Error('unexpected')}};
 const bridge=makeLineOwnerLiffWebhookBridge({supabase,privateQuery:async()=>({rows:[{allowed:true}]}),launchUrl:'https://example.test/appointment/',verifyEvent:async()=>true,resolveActiveMember:async()=>member,sendLiff:async()=>{sent++;throw Error('ambiguous LINE transport')},legacy:async()=>{legacy++}});
 const result=await bridge(event);
 assert.deepEqual(result,{handled:true,mode:'delivery_uncertain'});
 assert.equal(sent,1);assert.equal(legacy,0);
});
