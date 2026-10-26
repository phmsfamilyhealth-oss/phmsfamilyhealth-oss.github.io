import {spawnSync} from 'node:child_process';
for(const file of ['medication.integration.mjs','health.integration.mjs']){
 const result=spawnSync(process.execPath,[new URL(file,import.meta.url).pathname],{stdio:'inherit'});
 if(result.error)throw result.error;
 if(result.status!==0)process.exit(result.status??1);
}
