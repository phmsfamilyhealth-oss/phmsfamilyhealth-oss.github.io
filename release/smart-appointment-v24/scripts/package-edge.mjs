// Validate and package the actual Edge module dependency closure before deployment.
// Usage: node release/smart-appointment-v24/scripts/package-edge.mjs [output-directory]
// No environment secrets, network calls or deployment changes.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,dirname,relative,join,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const entry=join(root,'edge-candidate/live-index.ts');
const out=resolve(process.argv[2]||join(root,'dist/edge'));
const visited=new Set();
function visit(path){
 const normalized=resolve(path);
 if(!normalized.startsWith(root+sep)||!existsSync(normalized))throw new Error('missing_or_unsafe_edge_dependency: '+path);
 if(visited.has(normalized))return;
 visited.add(normalized);
 const source=readFileSync(normalized,'utf8');
 const rx=/\b(?:import|export)\s+(?:[^;'"]+?\s+from\s+)?['"]([^'"]+)['"]/g;
 for(const match of source.matchAll(rx)){
  const spec=match[1];
  if(!spec.startsWith('.'))continue;
  visit(resolve(dirname(normalized),spec));
 }
 const dest=join(out,relative(root,normalized));
 mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,source);
}
visit(entry);
const manifest={entrypoint:'edge-candidate/live-index.ts',files:[...visited].map(x=>relative(root,x)).sort()};
mkdirSync(out,{recursive:true});
writeFileSync(join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('PHMS v2.4 Edge dependency closure:',manifest.files.length,'files');
