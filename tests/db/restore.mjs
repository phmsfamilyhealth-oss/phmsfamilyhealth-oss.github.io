import {PGlite} from '@electric-sql/pglite';
import {pg_trgm} from '@electric-sql/pglite/contrib/pg_trgm';
import {unaccent} from '@electric-sql/pglite/contrib/unaccent';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
const fixture=name=>JSON.parse(gunzipSync(fs.readFileSync(new URL('./fixtures/'+name+'.json.gz',import.meta.url))));
export async function restore(){
 const db=await PGlite.create({extensions:{pg_trgm,unaccent}});const s=fixture('schema');
 const extra=fixture('additional');
 const q=v=>'"'+String(v).replaceAll('"','""')+'"';
 await db.exec("create schema private; create schema auth; create schema extensions; create schema storage; set check_function_bodies=false; create role anon; create role authenticated; create role service_role bypassrls; create role supabase_auth_admin; create role dashboard_user; create role authenticator; create extension pg_trgm with schema extensions; create extension unaccent with schema extensions; create function extensions.digest(text,text) returns bytea language sql immutable as 'select sha256(convert_to($1,''UTF8''))'; create function extensions.digest(bytea,text) returns bytea language sql immutable as 'select sha256($1)'; create function extensions.uuid_generate_v4() returns uuid language sql as 'select gen_random_uuid()';");
 await db.exec("create function public.gen_random_bytes(n integer) returns bytea language sql volatile as 'select decode(left(string_agg(replace(gen_random_uuid()::text,''-'',''''),''''),n*2),''hex'') from generate_series(1,ceil(n/16.0)::integer)';");
 for(const seq of extra.sequences||[])await db.exec(seq);
 for(const t of s.types||[])await db.exec(`create type ${q(t.schema)}.${q(t.name)} as enum (${t.labels.map(x=>"'"+x.replaceAll("'","''")+"'").join(',')})`);
 for(const t of s.tables)await db.exec(`create table ${q(t.schema)}.${q(t.name)} (${t.columns.map(c=>q(c.name)+' '+c.type+(c.notnull?' not null':'')).join(',')})`);
 let remaining=s.functions;for(let n=0;n<5&&remaining.length;n++){const next=[];for(const f of remaining){try{await db.exec(f.definition)}catch(e){next.push({...f,error:e.message})}}if(next.length===remaining.length)break;remaining=next}
 console.log('Functions restored',s.functions.length-remaining.length,'unavailable',remaining.map(f=>[f.name,f.error]));
 const errors=[];
 for(const t of s.tables)for(const c of t.columns)if(c.default&&!c.generated){try{await db.exec(`alter table ${q(t.schema)}.${q(t.name)} alter column ${q(c.name)} set default ${c.default}`)}catch(e){errors.push([t.name,c.name,e.message])}}
 for(const c of s.constraints.filter(c=>c.type!=='f')){try{await db.exec(`alter table ${q(c.schema)}.${q(c.table)} add constraint ${q(c.name)} ${c.definition}`)}catch(e){errors.push([c.name,e.message])}}
 for(const idx of fixture('indexes')){try{await db.exec(idx)}catch(e){errors.push(['index',e.message])}}
 for(const c of s.constraints.filter(c=>c.type==='f')){try{await db.exec(`alter table ${q(c.schema)}.${q(c.table)} add constraint ${q(c.name)} ${c.definition}`)}catch(e){errors.push([c.name,e.message])}}
 for(const t of s.triggers){try{await db.exec(t.definition)}catch(e){errors.push([t.table,e.message])}}
 for(const t of s.tables)if(t.rls)await db.exec(`alter table ${q(t.schema)}.${q(t.name)} enable row level security`);
 for(const p of s.policies){try{await db.exec(`create policy ${q(p.policyname)} on ${q(p.schemaname)}.${q(p.tablename)} as ${p.permissive} for ${p.cmd} to ${p.roles.map(q).join(',')} ${p.qual?'using ('+p.qual+')':''} ${p.with_check?'with check ('+p.with_check+')':''}`)}catch(e){errors.push([p.policyname,e.message])}}
 let views=fixture('views');for(let i=0;i<5&&views.length;i++){const next=[];for(const v of views){try{await db.exec(`create view ${q(v.schemaname)}.${q(v.viewname)} as ${v.definition}`)}catch(e){next.push({...v,error:e.message})}}views=next}if(views.length)throw Error(JSON.stringify(views.map(v=>[v.viewname,v.error])));
 for(const g of extra.grants||[])await db.exec(`grant ${g.privilege_type} on ${q(g.table_schema)}.${q(g.table_name)} to ${q(g.grantee)}`);
 await db.exec('grant usage on schema public,private,auth,extensions to authenticated,anon,service_role');
 for(const f of s.functions)if(f.acl){
  const sigs=(await db.query('select p.oid::regprocedure::text sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname=$1 and n.nspname=$2',[f.name,f.schema])).rows;
  for(const {sig} of sigs){await db.exec(`revoke all on function ${sig} from public,anon,authenticated,service_role`);for(const a of f.acl){const role=a.split('=')[0]||'public';if(role==='postgres'||role==='supabase_admin')continue;await db.exec(`grant execute on function ${sig} to ${q(role)}`)}}
 }
 console.log('Restore exceptions',JSON.stringify(errors));if(errors.length)throw Error('Schema restore incomplete');
 return {db,s};
}
if(import.meta.main){const {db}=await restore();console.log((await db.query('select version()')).rows);await db.close()}
