import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../edge-candidate/live-index.ts',import.meta.url),'utf8');
test('read-only API is excluded from write-schema migration requirement',()=>{
 assert.match(source,/action==='person_options'\|\|action==='provider_catalog'/);
 assert.match(source,/if\(!readOnly&&await isSchemaReady\(\)!==true\)/);
});
test('unsafe origins and missing server settings remain fail closed',()=>{
 assert.match(source,/if\(origin&&!originAllowed\(origin\)\)/);
 assert.match(source,/if\(!handler\|\|!isSchemaReady\)/);
 assert.match(source,/PHMS_V24_PRIVATE_DATABASE_URL/);
});
