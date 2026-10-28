// Offline-only, fail-closed preparation for the signed current Production webhook.
// Never deploy automatically. Requires full live source and an operator-provided
// expected SHA-256 checksum from an independently captured Production backup.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const anchor="if(c==='เพิ่มนัด'||c==='เพิ่มนัด จากภาพรวม'){await state(u,k,id,'crud_add_appointment',{person_confirmed:true,origin:c==='เพิ่มนัด จากภาพรวม'?'person_overview':'appointments'});await replyAppointmentTypePicker(e.replyToken,u,k,id,t,await appointmentActivePersonName(u,k,id));continue}";
export function prepareLiveWebhookPatch(source,{expectedSha256,replacement}={}){
 if(typeof source!=='string'||!source.includes(anchor)||source.split(anchor).length!==2)throw Error('production_route_anchor_mismatch');
 if(!/^[0-9a-f]{64}$/i.test(expectedSha256||''))throw Error('verified_live_sha256_required');
 const sha=createHash('sha256').update(source).digest('hex');
 if(sha.toLowerCase()!==expectedSha256.toLowerCase())throw Error('live_webhook_source_changed');
 if(typeof replacement!=='string'||!replacement.trim()||!replacement.includes('continue'))throw Error('reviewed_replacement_required');
 const patched=source.replace(anchor,replacement);
 if(patched===source||patched.split(replacement).length!==2)throw Error('patch_failed');
 return {patched,originalSha256:sha,patchedSha256:createHash('sha256').update(patched).digest('hex'),originalRoute:anchor};
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 const [sourceFile,expectedSha256,replacementFile,outputFile]=process.argv.slice(2);
 if(!sourceFile||!replacementFile||!outputFile)throw Error('usage: source sha256 replacement output');
 const result=prepareLiveWebhookPatch(readFileSync(sourceFile,'utf8'),{expectedSha256,replacement:readFileSync(replacementFile,'utf8')});
 writeFileSync(outputFile,result.patched);console.log('Offline candidate generated (NOT deployed)',result.originalSha256,result.patchedSha256);
}
