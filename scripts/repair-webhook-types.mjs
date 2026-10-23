import fs from 'node:fs/promises';
const [input,output]=process.argv.slice(2);
if(!input||!output)throw Error('Usage: node scripts/repair-webhook-types.mjs <fresh-production.ts> <repaired.ts>');
let source=await fs.readFile(input,'utf8');
const start=source.indexOf('  const backAction=(action:any):boolean=>{');
const end=source.indexOf('  const removeBack=',start);
if(start<0||end<0)throw Error('Back navigation implementation changed; inspect before patching');
// A literal backslash-n in a line comment had swallowed the guards and return.
source=source.slice(0,start)+source.slice(start,end).replaceAll('\\n','\n').replaceAll('\\\\s','\\s').replaceAll('\\\\d','\\d')+source.slice(end);
source=source.replaceAll('original.filter(n=>','original.filter((n:any)=>');
source=source.replace('severity,trend,\n  associated_symptoms:',"severity:severity??null,trend:trend??'',\n  associated_symptoms:");
for(const [key,index] of [['person_code',2],['person_code',3],['user_code',2],['channel_code',2]]){
 const pattern=`String(x?.${key}||'').toLowerCase().startsWith(m[${index}].toLowerCase())`;
 while(source.includes(pattern)){
  const at=source.indexOf(pattern),line=source.lastIndexOf('\n',at);
  let declaration=source.lastIndexOf('   const row=',at);
  if(declaration<line-400)declaration=source.lastIndexOf('  const row=',at);
  if(declaration<0)throw Error('Cannot locate narrowed callback match');
  const token='matched'+key.replaceAll('_','');
  source=source.slice(0,declaration)+`  const ${token}=m[${index}].toLowerCase();\n`+source.slice(declaration);
  source=source.replace(pattern,`String(x?.${key}||'').toLowerCase().startsWith(${token})`);
 }
}
await fs.writeFile(output,source);
console.log('Repaired source written; full Deno check remains mandatory.');
