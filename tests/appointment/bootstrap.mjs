import {db} from './db.mjs';
import fs from 'node:fs';

await db.waitReady;for(const role of ['anon','authenticated','service_role'])await db.exec(`create role ${role} ${role==='service_role'?'bypassrls':''}`);
await db.exec(`create schema if not exists private;create schema if not exists auth;create schema if not exists storage;create schema if not exists extensions;create schema if not exists cron;create schema if not exists vault;create schema if not exists net;set check_function_bodies=off;create extension if not exists "uuid-ossp" with schema extensions;`);
await db.exec(`create function public.gen_random_bytes(n integer) returns bytea language sql volatile as $$select substring(decode(string_agg(replace(gen_random_uuid()::text,'-',''),''),'hex') from 1 for n) from generate_series(1,(n+15)/16)$$;
create function extensions.digest(data text,algorithm text) returns bytea language sql immutable as $$select case lower(algorithm) when 'sha256' then sha256(convert_to(data,'UTF8')) when 'md5' then decode(md5(data),'hex') else null end$$;
create function extensions.digest(data bytea,algorithm text) returns bytea language sql immutable as $$select case lower(algorithm) when 'sha256' then sha256(data) else null end$$;
create function public.digest(data text,algorithm text) returns bytea language sql immutable as $$select extensions.digest(data,algorithm)$$;`);
const catalog=JSON.parse(fs.readFileSync('tests/appointment/fixtures/schema-catalog.json','utf8'));
let errors=[];let applied=0;
async function apply(group,sql){try{await db.exec(sql);applied++}catch(e){errors.push({group,sql:sql.slice(0,180),message:e.message})}}
for(const group of ['types','sequences','tables'])for(const sql of catalog[group]||[])await apply(group,sql);
for(const schema of ['auth','private','public'])for(const f of JSON.parse(fs.readFileSync(`tests/appointment/fixtures/functions-${schema}.json`,'utf8')))await apply('function-'+schema,f.ddl);
for(const sql of catalog.constraints||[])if(!sql.includes(' FOREIGN KEY '))await apply('constraint',sql);
for(const {ddl:sql} of JSON.parse(fs.readFileSync('tests/appointment/fixtures/indexes.json','utf8')))await apply('index',sql);
for(const sql of catalog.constraints||[])if(sql.includes(' FOREIGN KEY '))await apply('constraint',sql);
for(const x of JSON.parse(fs.readFileSync('tests/appointment/fixtures/triggers.json','utf8')))await apply('trigger',x.ddl);
fs.writeFileSync('tests/appointment/evidence/bootstrap-results.json',JSON.stringify({applied,errors},null,2));
console.log(JSON.stringify({applied,errors:errors.length,examples:errors.slice(0,8)}));


if(errors.length)throw Error("Schema bootstrap failed: "+JSON.stringify(errors));
