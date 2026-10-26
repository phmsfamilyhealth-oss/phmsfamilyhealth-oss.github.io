import {db} from './db.mjs';import fs from 'node:fs';import assert from 'node:assert/strict';
await db.waitReady;
const catalog=JSON.parse(fs.readFileSync('tests/appointment/fixtures/security-catalog.json','utf8'));
for(const role of ['anon','authenticated','service_role'])try{await db.exec(`create role ${role} ${role==='service_role'?'bypassrls':''}`)}catch(e){if(!e.message.includes('already exists'))throw e}
await db.exec('grant usage on schema public,auth to anon,authenticated,service_role');
for(const group of ['rls','grants','policies'])for(const sql of catalog[group]||[])try{await db.exec(sql)}catch(e){if(!e.message.includes('already exists'))throw e}
const results=[];
for(const role of ['anon','authenticated']){
 await db.exec('begin');await db.exec(`set local role ${role};select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000099',true)`);
 try{const r=await db.query('select count(*)::int n from public.appointments');assert.equal(r.rows[0].n,0);results.push({role,unauthorizedRead:'zero rows'})}catch(e){if(e.code==='42501')results.push({role,unauthorizedRead:'permission denied'});else throw e}finally{await db.exec('rollback')}
}
assert.equal((await db.query("select public.phms_line_appointment_wizard_enabled('UNKNOWN_TEST_ONLY') enabled")).rows[0].enabled,false);
fs.writeFileSync('tests/appointment/evidence/security-integration-results.json',JSON.stringify({results,policies:catalog.policies.length,productionData:false},null,2));console.log(JSON.stringify(results));
