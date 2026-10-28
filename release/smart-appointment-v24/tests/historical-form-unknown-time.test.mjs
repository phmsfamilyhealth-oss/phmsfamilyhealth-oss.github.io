import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../prototype/index.html',import.meta.url),'utf8');
test('LIFF historical visit does not force known time and retains completed status',()=>{
 assert.ok(html.includes("$('scenario').value==='booked')$('known').value='yes'"));
 assert.ok(!html.includes("$('scenario').value==='historical'||$('scenario').value==='booked'"));
 assert.ok(html.includes("$('scenario').value==='historical'?'completed':'planned'"));
 assert.ok(html.includes("const unknown=$('known').value==='no'"));
});
