import {PGlite} from '@electric-sql/pglite';
import {uuid_ossp} from '@electric-sql/pglite/contrib/uuid_ossp';
// Real PostgreSQL-WASM engine, private memory, no production URL or credentials.
export const db=new PGlite({extensions:{uuid_ossp}});
await db.waitReady;
