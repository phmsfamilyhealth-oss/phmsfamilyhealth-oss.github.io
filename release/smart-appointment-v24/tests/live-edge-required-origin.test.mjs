import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../edge-candidate/live-index.ts',import.meta.url),'utf8');
test('live Edge refuses write startup without a configured trusted LIFF origin',()=>{assert.match(source,/const required=\[[^\]]*'PHMS_V24_LIFF_ORIGIN'/);assert.match(source,/const ready=required\.every\(name=>env\(name\)\)/);assert.match(source,/if\(!readOnly&&await isSchemaReady\(\)!==true\)return withCors\(json\('feature_not_released',404\)\)/);});

test('LIFF origin policy excludes URL paths, credentials and query strings',()=>{assert.match(source,/originAllowed=origin=>/);assert.match(source,/url\.origin===trustedOrigin/);assert.match(source,/url\.username===''&&url\.password===''/);assert.match(source,/url\.pathname==='\/'/);assert.match(source,/url\.search===''&&url\.hash===''/);});
