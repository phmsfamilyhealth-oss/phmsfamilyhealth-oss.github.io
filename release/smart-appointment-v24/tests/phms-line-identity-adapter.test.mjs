import test from 'node:test';import assert from 'node:assert/strict';import {makePhmsLineIdentityAdapter} from '../contracts/phms-line-identity-adapter.mjs';
const sub='U'+'a'.repeat(32),uid='11111111-1111-4111-8111-111111111111';
test('LINE verification is chained to active PHMS identity record',async()=>{
 const supabase={from:()=>({select:()=>({eq:()=>({limit:async()=>({data:[{id:'f',user_id:uid,is_active:true}],error:null})})})})};
 const fetchImpl=async()=>({ok:true,json:async()=>({aud:'1234567890',sub,exp:Math.floor(Date.now()/1000)+3600})});
 const verify=makePhmsLineIdentityAdapter({supabase,channelId:'1234567890',fetchImpl});
 assert.deepEqual(await verify('a'.repeat(30)),{userId:uid});
});
test('inactive line identity fails even if LINE token is valid',async()=>{
 const supabase={from:()=>({select:()=>({eq:()=>({limit:async()=>({data:[{user_id:uid,is_active:false}],error:null})})})})};
 const fetchImpl=async()=>({ok:true,json:async()=>({aud:'1234567890',sub,exp:Math.floor(Date.now()/1000)+3600})});
 assert.equal(await makePhmsLineIdentityAdapter({supabase,channelId:'1234567890',fetchImpl})('a'.repeat(30)),null);
});
