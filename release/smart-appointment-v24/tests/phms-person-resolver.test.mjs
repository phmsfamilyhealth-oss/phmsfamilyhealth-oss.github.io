import test from 'node:test';import assert from 'node:assert/strict';import {makePhmsPersonResolver} from '../contracts/phms-person-resolver.mjs';
const id='33333333-3333-4333-8333-333333333333',actor='11111111-1111-4111-8111-111111111111';
const db={from:t=>{assert.equal(t,'family_persons');return{select:()=>({eq:(col,value)=>({limit:async()=>({data:[{id,family_id:'family',person_id:'person',status:'active'}],error:null})})})}}};
test('canonical family member requires existing central permissions',async()=>{const resolve=makePhmsPersonResolver({supabase:db,centralCanAccess:async()=>true});assert.equal((await resolve(actor,id)).familyPersonId,id)});
test('denied create permission cannot resolve member',async()=>{const resolve=makePhmsPersonResolver({supabase:db,centralCanAccess:async(a,p,r,action)=>action==='view'});assert.equal(await resolve(actor,id),null)});
test('arbitrary displayed name cannot be treated as member ID',async()=>{const resolve=makePhmsPersonResolver({supabase:db,centralCanAccess:async()=>true});assert.equal(await resolve(actor,'grandmother'),null)});
