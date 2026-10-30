import test from 'node:test';import assert from 'node:assert/strict';import {fetchProviderMaster} from '../contracts/supabase-provider-master.mjs';
const tables=['healthcare_organizations','healthcare_service_units','healthcare_clinicians'];
const recorded=[];
const client={from(table){recorded.push(table);return {select(cols){assert.ok(cols.includes('deleted_at'));return {is(col,val){assert.equal(col,'deleted_at');assert.equal(val,null);return {limit(max){assert.equal(max,1000);return Promise.resolve({data:[{id:table}],error:null})}}}}}}}};
test('reads real-schema tables and excludes deleted rows',async()=>{const r=await fetchProviderMaster(client);assert.deepEqual(recorded,tables);assert.equal(r.organizations[0].id,tables[0]);assert.equal(r.units[0].id,tables[1]);assert.equal(r.clinicians[0].id,tables[2]);});
test('unavailable client rejects rather than invent provider options',async()=>await assert.rejects(fetchProviderMaster(null),/catalog_client_required/));
test('database error fails closed',async()=>await assert.rejects(fetchProviderMaster({from:()=>({select:()=>({is:()=>({limit:async()=>({error:{message:'db'},data:null})})})})}),/provider_catalog_unavailable/));
