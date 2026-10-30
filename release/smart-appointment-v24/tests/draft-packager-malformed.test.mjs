import test from 'node:test';import assert from 'node:assert/strict';import {prepareDraftForReview as pack} from '../contracts/draft-packager.mjs';
test('null draft rejected without throwing',()=>assert.deepEqual(pack(null),{ok:false,errors:['invalid_payload']}));
test('array draft rejected without throwing',()=>assert.equal(pack([]).ok,false));
test('malformed document metadata rejected instead of silently discarded',()=>assert.deepEqual(pack({documents:{name:'x'}}),{ok:false,errors:['invalid_documents']}));
test('valid empty attachments accepted',()=>{const r=pack({scenario:'walk_in',date:'2026-11-01',time_known:false,documents:[]});assert.equal(r.ok,true);assert.deepEqual(r.draft.document_metadata,[])});
