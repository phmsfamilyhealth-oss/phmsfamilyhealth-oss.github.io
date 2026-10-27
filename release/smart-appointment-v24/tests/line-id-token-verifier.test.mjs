import test from 'node:test';import assert from 'node:assert/strict';import {makeLineIdTokenVerifier} from '../contracts/line-id-token-verifier.mjs';
const sub='U'+'a'.repeat(32),exp=Math.floor(Date.now()/1000)+3600;
const mk=(payload,verifyStatus=200)=>makeLineIdTokenVerifier({channelId:'1234567890',resolveLineSubject:async(lineSub)=>lineSub===sub?{userId:'trusted-uuid'}:null,fetchImpl:async(url,options)=>{assert.equal(url,'https://api.line.me/oauth2/v2.1/verify');assert.equal(options.body.get('client_id'),'1234567890');assert.equal(options.body.get('id_token'),'a'.repeat(30));return {ok:verifyStatus===200,json:async()=>payload}}});
test('LINE verified subject maps to trusted PHMS user',async()=>assert.deepEqual(await mk({aud:'1234567890',sub,exp})('a'.repeat(30)),{userId:'trusted-uuid'}));
test('invalid audience or expired token cannot authenticate',async()=>{assert.equal(await mk({aud:'unexpected',sub,exp})('a'.repeat(30)),null);assert.equal(await mk({aud:'1234567890',sub,exp:1})('a'.repeat(30)),null)});
test('LINE verify API rejection cannot authenticate',async()=>assert.equal(await mk({aud:'1234567890',sub,exp},401)('a'.repeat(30)),null));
test('unmapped LINE identity cannot authenticate',async()=>assert.equal(await mk({aud:'1234567890',sub:'U'+'b'.repeat(32),exp})('a'.repeat(30)),null));
test('missing verified PHMS mapping is configuration failure',()=>assert.throws(()=>makeLineIdTokenVerifier({channelId:'1234567890'}),/line_identity_not_configured/));
