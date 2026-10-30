// PHMS v2.4 Phase 1: verify an exported FULL deployed Edge bundle offline.
// No runtime change, no network, no patient data, no auto-deployment.
// Usage: node verify-live-webhook-bundle.mjs manifest.json exported-bundle-dir
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join,resolve,sep} from 'node:path';
const required=['index.ts','person-overview-px-layout.ts','smart-medication.ts','smart-medication-runtime.ts'];
const route="if(c==='เพิ่มนัด'||c==='เพิ่มนัด จากภาพรวม'){await state(u,k,id,'crud_add_appointment',{person_confirmed:true,origin:c==='เพิ่มนัด จากภาพรวม'?'person_overview':'appointments'});await replyAppointmentTypePicker(e.replyToken,u,k,id,t,await appointmentActivePersonName(u,k,id));continue}";
const sha256=s=>createHash('sha256').update(s).digest('hex');
export function verifyLiveWebhookBundle(manifest,files){
 const problems=[];
 if(manifest?.function!=='line-webhook'||!Number.isSafeInteger(manifest.version)||manifest.version<1)problems.push('invalid_manifest');
 if(!manifest?.files||Object.keys(manifest.files).sort().join('|')!==[...required].sort().join('|'))problems.push('incomplete_manifest');
 if(!files||Object.keys(files).sort().join('|')!==[...required].sort().join('|'))problems.push('incomplete_bundle');
 for(const name of required){
  const body=files?.[name],expected=manifest?.files?.[name];
  if(typeof body!=='string'||!expected||!/^[0-9a-f]{64}$/.test(expected))problems.push('missing_or_invalid_'+name);
  else if(sha256(body)!==expected)problems.push('source_drift_'+name);
 }
 const main=files?.['index.ts'];
 if(typeof main==='string'&&main.split(route).length!==2)problems.push('line_add_appointment_anchor_mismatch');
 if(typeof main==='string'&&main.includes('phmsV24OwnerRoute')&&manifest?.allowV24Route!==true)problems.push('unreviewed_v24_route');
 return {ok:problems.length===0,problems,version:manifest?.version??null};
}
if(process.argv[1]&&resolve(process.argv[1])===new URL(import.meta.url).pathname){
 const [manifestPath,folder]=process.argv.slice(2);
 if(!manifestPath||!folder)throw Error('usage: manifest.json bundle-dir');
 const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
 const files=Object.fromEntries(required.map(name=>[name,readFileSync(join(folder,name),'utf8')]));
 const result=verifyLiveWebhookBundle(manifest,files);
 console.log(JSON.stringify(result));
 if(!result.ok)process.exitCode=1;
}
