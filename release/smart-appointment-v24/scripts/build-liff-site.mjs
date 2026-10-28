// Build a deployable static LIFF page from public configuration only.
// Example: PHMS_V24_PUBLIC_LIFF_ID=<LINE LIFF ID> PHMS_V24_PUBLIC_CONFIRM_API=https://<project>.supabase.co/functions/v1/phms-v24-appointment-confirm node scripts/build-liff-site.mjs
// No secret keys, tokens or private database URLs are permitted in browser output.
import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const html=readFileSync(join(root,'prototype/index.html'),'utf8');
export function renderLiffHtml(template,{liffId,confirmApi}={}){
 if(typeof liffId!=='string'||!/^[0-9]{5,20}-[A-Za-z0-9]{5,32}$/.test(liffId))throw Error('public_liff_id_required');
 let url;try{url=new URL(confirmApi)}catch{throw Error('public_confirm_api_invalid')}
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/functions/v1/phms-v24-appointment-confirm')throw Error('public_confirm_api_invalid');
 if(!url.hostname.endsWith('.supabase.co')||!url.hostname.slice(0,-'.supabase.co'.length).match(/^[a-z0-9-]+$/i))throw Error('public_confirm_api_untrusted_host');
 if(!template.includes('name="phms-liff-id" content=""')||!template.includes('name="phms-confirm-api" content=""'))throw Error('unexpected_liff_template');
 return template.replace('name="phms-liff-id" content=""','name="phms-liff-id" content="'+liffId+'"').replace('name="phms-confirm-api" content=""','name="phms-confirm-api" content="'+url.href+'"');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const output=resolve(process.argv[2]||join(root,'dist/site'));
 const result=renderLiffHtml(html,{liffId:process.env.PHMS_V24_PUBLIC_LIFF_ID,confirmApi:process.env.PHMS_V24_PUBLIC_CONFIRM_API});
 mkdirSync(join(output,'prototype'),{recursive:true});mkdirSync(join(output,'contracts'),{recursive:true});
 writeFileSync(join(output,'prototype/index.html'),result);
 for(const name of ['scenario-validator.mjs','draft-packager.mjs','provider-picker-state.mjs','liff-confirm-client.mjs','liff-provider-catalog-client.mjs'])copyFileSync(join(root,'contracts',name),join(output,'contracts',name));
 console.log('LIFF static site generated with public configuration only');
}
