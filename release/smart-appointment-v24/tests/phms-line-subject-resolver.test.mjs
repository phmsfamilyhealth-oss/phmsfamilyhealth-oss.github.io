import test from 'node:test';import assert from 'node:assert/strict';import {makePhmsLineSubjectResolver} from '../contracts/phms-line-subject-resolver.mjs';
const sub='U'+'a'.repeat(32),userId='11111111-1111-4111-8111-111111111111';
const client=(rows,error=null)=>({from:table=>{assert.equal(table,'line_identities');return {select:columns=>{assert.equal(columns,'id,user_id,is_active');return {eq:(key,value)=>{assert.equal(key,'line_user_id');assert.equal(value,sub);return {limit:async n=>{assert.equal(n,2);return {data:rows,error}}}}}}}}});
test('verified LINE subject resolves existing active PHMS user',async()=>assert.deepEqual(await makePhmsLineSubjectResolver(client([{id:'a',user_id:userId,is_active:true}]))(sub),{userId}));
test('inactive LINE link is denied',async()=>assert.equal(await makePhmsLineSubjectResolver(client([{id:'a',user_id:userId,is_active:false}]))(sub),null));
test('ambiguous identity rows fail closed',async()=>assert.equal(await makePhmsLineSubjectResolver(client([{user_id:userId,is_active:true},{user_id:userId,is_active:true}]))(sub),null));
test('unlinked subject and DB errors fail closed',async()=>{assert.equal(await makePhmsLineSubjectResolver(client([]))(sub),null);assert.equal(await makePhmsLineSubjectResolver(client([],{}))(sub),null)});
test('invalid subject and absent client fail closed',async()=>{assert.equal(await makePhmsLineSubjectResolver(client([]))('forged'),null);assert.throws(()=>makePhmsLineSubjectResolver(null),/identity_db_not_configured/)});
