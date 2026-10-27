import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../edge-candidate/index.ts',import.meta.url),'utf8');
test('candidate entrypoint never silently writes patient records',()=>{
 assert.match(source,/feature_not_released/);
 assert.doesNotMatch(source,/supabase\.from\(|service_role|INSERT INTO|Deno\.env\.get/);
 assert.match(source,/Deno\.serve/);
});
test('candidate blocks unauthenticated and cross-origin preflight requests',()=>{
 assert.match(source,/request\.method==='OPTIONS'/);
 assert.match(source,/unauthenticated/);
 assert.doesNotMatch(source,/access-control-allow-origin/i);
});
