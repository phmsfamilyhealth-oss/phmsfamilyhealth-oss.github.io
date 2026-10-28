import test from 'node:test';import assert from 'node:assert/strict';import {handleAppointmentConfirm as handle} from '../contracts/confirm-http-handler.mjs';
const body={selectedPersonCode:'p1',operationKey:'12345678-1234-4234-8234-123456789abc',draft:{scenario:'booked',date:'2026-11-03',time_known:true,time:'09:00',hospital:'Demo'}};
const make=(value=body,headers={})=>new Request('https://example.test/confirm',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer example-verified-credential',...headers},body:JSON.stringify(value)});
const adapters={verifyLineIdentity:async()=>({userId:'u1'}),resolvePerson:async()=>({familyId:'f1',familyPersonId:'p1'}),isReleaseEnabled:async()=>true,centralCanAccess:async()=>true,verifyProviderBinding:async()=>true,atomicCommit:async()=>({appointmentId:'a1',authorizedReadback:true})};
test('HTTP success 201 with safe receipt',async()=>{const r=await handle(make(),adapters);assert.equal(r.status,201);assert.equal((await r.json()).appointmentId,'a1')});
test('GET is rejected',async()=>assert.equal((await handle(new Request('https://example.test/confirm'),adapters)).status,405));
test('missing auth header rejected',async()=>assert.equal((await handle(make(body,{authorization:''}),adapters)).status,401));
test('bad JSON rejected',async()=>{const r=new Request('https://example.test/confirm',{method:'POST',headers:{authorization:'Bearer example-verified-credential','content-type':'application/json'},body:'{' });assert.equal((await handle(r,adapters)).status,400)});
test('wrong content type rejected',async()=>assert.equal((await handle(make(body,{'content-type':'text/plain'}),adapters)).status,415));
test('oversized header rejected',async()=>assert.equal((await handle(make(body,{'content-length':'40000'}),adapters)).status,413));
test('release off hides feature',async()=>assert.equal((await handle(make(),{...adapters,isReleaseEnabled:async()=>false})).status,404));
test('central permission denial',async()=>assert.equal((await handle(make(),{...adapters,centralCanAccess:async()=>false})).status,403));
test('backend error gives generic 503',async()=>{const r=await handle(make(),{...adapters,verifyLineIdentity:async()=>{throw new Error('private secret must not leak')}});assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/private secret/);});
test('frontend identity cannot override verified actor',async()=>{const r=await handle(make({...body,userId:'spoofed',familyId:'other'}),{...adapters,atomicCommit:async x=>{assert.equal(x.actorId,'u1');assert.equal(x.familyId,'f1');return {appointmentId:'a1',authorizedReadback:true}}});assert.equal(r.status,201);});

test('JSON-like MIME types cannot bypass strict content type gate',async()=>{for(const ct of ['application/jsonp','application/json-bogus','application/jsonx']){const r=await handle(make(body,{'content-type':ct}),adapters);assert.equal(r.status,415,ct)}});
test('application/json with charset remains accepted',async()=>{const r=await handle(make(body,{'content-type':'application/json; charset=utf-8'}),adapters);assert.equal(r.status,201)});

test('multibyte UTF-8 payload over 32KiB rejected despite shorter JavaScript length',async()=>{const oversized={...body,draft:{...body.draft,note:'ก'.repeat(12000)}};const r=await handle(make(oversized),adapters);assert.equal(r.status,413);});

test('missing appointment view permission is forbidden, not misreported as malformed input',async()=>{const r=await handle(make(),{...adapters,centralCanAccess:async(_actor,_subject,_resource,action)=>action!=='view'});assert.equal(r.status,403);assert.equal((await r.json()).error,'read_permission_denied');});
