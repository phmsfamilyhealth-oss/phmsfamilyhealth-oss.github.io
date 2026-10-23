import fs from 'node:fs';
import {db} from './db.mjs';
fs.mkdirSync('tests/appointment/evidence',{recursive:true});
try{for(const step of ['bootstrap','integration','runtime-integration','security-integration']){
 await import(`./${step}.mjs`);console.log(step,'PASS');
}}finally{await db.close()}
