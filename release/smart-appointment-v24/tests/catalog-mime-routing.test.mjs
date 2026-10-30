import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../contracts/phms-appointment-http-composition.mjs',import.meta.url),'utf8');
test('provider catalog router uses exact JSON media type rather than prefix',()=>{
 assert.match(source,/get\('content-type'\)\?\.split\(';',1\)\[0\]\.trim\(\)\.toLowerCase\(\)===\x27application\/json\x27/);
 assert.doesNotMatch(source,/startsWith\(\x27application\/json\x27\)/);
});
