import {PGlite} from '@electric-sql/pglite';
import {uuid_ossp} from '@electric-sql/pglite/contrib/uuid_ossp';
// Real PostgreSQL-WASM engine, private memory, no production URL or credentials.
const testURL=process.env.PHMS_TEST_DATABASE_URL;
let database;
if(testURL){
 const url=new URL(testURL);
 if(!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!=='/phms_synthetic_test')throw Error('Test database must be isolated localhost/phms_synthetic_test');
 const {default:pg}=await import('pg');
 pg.types.setTypeParser(1700,Number);
 const pool=new pg.Pool({connectionString:testURL,max:1});
 const query=(sql,params=[])=>pool.query(sql,params.map(v=>typeof v==='object'&&v!==null?JSON.stringify(v):v));
 database={waitReady:Promise.resolve(),query,exec:sql=>pool.query(sql),close:()=>pool.end()};
}else database=new PGlite({extensions:{uuid_ossp}});
export const db=database;
await db.waitReady;
