// Explicit operator only. Never imported by server startup or feature handlers.
import {readFile} from 'node:fs/promises';
import {isDeepStrictEqual} from 'node:util';
import {TARGET as ECONOMY_TARGET,sha256,refuse,safeError,connect} from './economy-release-common.mjs';
export {sha256,refuse,safeError,connect};
export const TARGET=Object.freeze({...ECONOMY_TARGET,owner:'hero_auction_db_user'});
export const CONFIRMATION='APPLY_HERO_ADMIN_ANALYTICS_006_007_THREE_TABLES';
export const FLAGS=Object.freeze(['HERO_ADMIN_WALLET_CREDITS_ENABLED','HERO_PLAYER_ANALYTICS_ENABLED']);
export const FILES=Object.freeze(['006-admin-wallet-credits.sql','007-player-sessions.sql']);
export const NEW_TABLES=Object.freeze(['hero_auction_admin_wallet_credits','hero_auction_player_activity','hero_auction_player_sessions']);
export const BASE_TABLES=Object.freeze(['hero_auction_wallets','hero_auction_commanders','hero_auction_user_profiles']);
const hex=value=>typeof value==='string'&&value.length===64&&!/[^0-9a-f]/.test(value);
const ensure=(value,code)=>{if(!value)refuse(code)};
export function parseArgs(argv,apply=false){
 const keys=['expect-service','expect-database','expect-owner','expect-major','expect-commit','expect-state'];
 if(apply)keys.push('manifest-sha256','schema-sha256','backup-reference','confirm');
 const allowed=new Set(keys),args={};
 for(let i=0;i<argv.length;i+=2){const key=argv[i]?.slice(2);ensure(argv[i]?.startsWith('--')&&allowed.has(key)&&!Object.hasOwn(args,key)&&typeof argv[i+1]==='string'&&!argv[i+1].startsWith('--'),'INVALID_ARGUMENTS');args[key]=argv[i+1];}
 ensure(keys.every(key=>Object.hasOwn(args,key)),'MISSING_EXPLICIT_ARGUMENTS');
 ensure(args['expect-service']===TARGET.service&&args['expect-database']===TARGET.database&&args['expect-owner']===TARGET.owner&&args['expect-major']===String(TARGET.major),'WRONG_APPROVED_TARGET');
 ensure(args['expect-commit'].length===40&&!/[^0-9a-f]/.test(args['expect-commit']),'INVALID_BUILD_COMMIT');
 ensure(['absent','complete'].includes(args['expect-state'])&&(!apply||args['expect-state']==='absent'),'INVALID_EXPECTED_STATE');
 if(apply){ensure(hex(args['manifest-sha256'])&&hex(args['schema-sha256']),'INVALID_REVIEWED_DIGEST');ensure(args['backup-reference'].length>=8&&args['backup-reference'].length<=120&&/^[A-Za-z0-9]/.test(args['backup-reference'])&&!/[^A-Za-z0-9_.:-]/.test(args['backup-reference']),'INVALID_BACKUP_REFERENCE');ensure(args.confirm===CONFIRMATION,'CONFIRMATION_REQUIRED');}
 return Object.freeze(args);
}
export function validateRuntime(env,args){
 ensure(env.RENDER==='true'&&env.RENDER_SERVICE_ID===TARGET.service&&env.RENDER_SERVICE_TYPE==='web','WRONG_RENDER_RUNTIME');
 ensure(env.RENDER_GIT_COMMIT===args['expect-commit']&&env.RENDER_GIT_REPO_SLUG===TARGET.repo&&env.IS_PULL_REQUEST!=='true','WRONG_RENDER_BUILD');
 ensure(FLAGS.every(flag=>env[flag]===undefined||env[flag]===''||env[flag]==='0'),'NEW_FLAGS_MUST_BE_OFF');
 // node-postgres otherwise falls back to PGPORT/PGSSLMODE when a URL omits
 // them. Refuse every ambient PG override rather than silently changing target.
 ensure(!Object.keys(env).some(key=>/^PG[A-Z_]*$/.test(key)),'AMBIENT_PG_OVERRIDES_FORBIDDEN');
 let url;try{url=new URL(env.DATABASE_URL)}catch{refuse('MISSING_OR_INVALID_DATABASE_URL')}
 ensure(['postgres:','postgresql:'].includes(url.protocol)&&url.hostname===TARGET.host&&(!url.port||url.port==='5432')&&!url.hash,'NOT_APPROVED_INTERNAL_DATABASE');
 let database,role;try{database=decodeURIComponent(url.pathname.slice(1));role=decodeURIComponent(url.username)}catch{refuse('INVALID_DATABASE_IDENTITY')}
 ensure(database===TARGET.database&&role===TARGET.owner&&url.password,'WRONG_DATABASE_IDENTITY');
 ensure([...url.searchParams.keys()].every(key=>key==='sslmode')&&url.searchParams.getAll('sslmode').length<=1&&(!url.searchParams.has('sslmode')||['require','disable'].includes(url.searchParams.get('sslmode'))),'UNAPPROVED_CONNECTION_OPTIONS');
 return Object.freeze({connectionString:env.DATABASE_URL,connectionTimeoutMillis:5000,query_timeout:15000,application_name:'hero-explicit-admin-analytics-release',options:'-c search_path=public -c statement_timeout=10000 -c lock_timeout=2000 -c idle_in_transaction_session_timeout=15000 -c transaction_timeout=60000'});
}
// Only the two reviewed plain-DDL files. No arbitrary SQL, ALTER, DML, functions,
// extension, grant, data backfill, fourth table, or extra migration ledger.
export function migrationStatements(source){
 ensure(typeof source==='string'&&source.length<100000&&!source.includes('\0'),'INVALID_MIGRATION_TEXT');
 const statements=[];let text='',quoted=false;
 for(let i=0;i<source.length;i++){
  const c=source[i],next=source[i+1];
  if(!quoted&&c==='-'&&next==='-'){while(i<source.length&&source[i]!=='\n')i++;text+='\n';continue;}
  ensure(c!=='\\'&&c!=='"'&&c!=='$'&&!(c==='/'&&next==='*'),'UNSUPPORTED_SQL_SYNTAX');
  if(c==="'"){text+=c;if(quoted&&next==="'"){text+=next;i++}else quoted=!quoted;continue;}
  if(c===';'&&!quoted){if(text.trim())statements.push(text.trim());text=''}else text+=c;
 }
 ensure(!quoted&&!text.trim()&&statements.length>=3,'INCOMPLETE_MIGRATION');
 ensure(statements[0]==='BEGIN'&&statements.at(-1)==='COMMIT','EXACT_TRANSACTION_WRAPPERS_REQUIRED');
 const body=statements.slice(1,-1);
 for(const statement of body){
  const table=statement.match(/^CREATE TABLE IF NOT EXISTS (hero_auction_[a-z_]+)\s*\(/)?.[1];
  const indexes=[
   'CREATE INDEX IF NOT EXISTS hero_auction_admin_wallet_credits_created ON hero_auction_admin_wallet_credits(created_at DESC,request_id DESC)',
   'CREATE INDEX IF NOT EXISTS hero_auction_player_sessions_retention ON hero_auction_player_sessions(started_at)',
   'CREATE INDEX IF NOT EXISTS hero_auction_player_sessions_account_seen ON hero_auction_player_sessions(account_id,last_seen_at DESC)'];
  ensure(table&&NEW_TABLES.includes(table)||indexes.includes(statement),'UNAPPROVED_MIGRATION_STATEMENT');
  const words=statement.replace(/'(?:''|[^'])*'/g,"''");
  ensure(!/\b(?:BEGIN|COMMIT|ROLLBACK|SAVEPOINT|SELECT|INSERT|UPDATE|DELETE|MERGE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|CALL|COPY|EXECUTE|DO|AS)\b/i.test(words.replaceAll('ON DELETE CASCADE','')),'UNAPPROVED_SQL_OPERATION');
  const allowedCalls=new Set([...NEW_TABLES,'hero_auction_wallets','CHECK','KEY','IN','VARCHAR','length','btrim','clock_timestamp']);
  for(const match of words.matchAll(/\b([A-Za-z_][A-Za-z_0-9]*)\s*\(/g))ensure(allowedCalls.has(match[1]),'UNAPPROVED_SQL_FUNCTION');
 }
 return body;
}
export async function loadManifest(read=readFile){
 const entries=[];
 for(const [i,name]of FILES.entries()){const source=await read(new URL('../migrations/'+name,import.meta.url),'utf8');entries.push({version:i+6,name,sha256:sha256(source),statements:migrationStatements(source)});}
 ensure(entries[0].statements.length===2&&entries[1].statements.length===4,'UNEXPECTED_MIGRATION_SHAPE');
 const created=entries.flatMap(entry=>entry.statements.map(statement=>statement.match(/^CREATE TABLE IF NOT EXISTS ([a-z_]+)/)?.[1]).filter(Boolean));
 ensure(isDeepStrictEqual(created,NEW_TABLES),'EXACT_THREE_TABLES_REQUIRED');
 return {entries,manifestSha256:sha256(JSON.stringify(entries.map(({version,name,sha256})=>({version,name,sha256}))))};
}
export const SQL=Object.freeze({
 identity:`/* admin-release:identity */ SELECT current_database() AS database,current_user AS role,session_user AS session_role,
 (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) AS owner,
 current_setting('server_version_num') AS version,current_schema() AS schema,pg_is_in_recovery() AS replica,
 has_schema_privilege(current_user,'public','USAGE') AS schema_usage,has_schema_privilege(current_user,'public','CREATE') AS schema_create,
 current_setting('transaction_read_only') AS read_only,current_setting('transaction_isolation') AS isolation`,
 catalog:`/* admin-release:catalog */ SELECT c.relname AS name,c.relkind AS kind,c.relpersistence AS persistence,c.relrowsecurity AS rls,c.relforcerowsecurity AS force_rls,
 has_table_privilege(current_user,c.oid,'SELECT') AS can_select,has_table_privilege(current_user,c.oid,'INSERT') AS can_insert,has_table_privilege(current_user,c.oid,'UPDATE') AS can_update,has_table_privilege(current_user,c.oid,'REFERENCES') AS can_reference,
 (SELECT count(*)::int FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal) AS user_triggers,
 (SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns,
 (SELECT jsonb_agg(jsonb_build_object('type',k.contype,'definition',pg_get_constraintdef(k.oid),'validated',k.convalidated,'deferrable',k.condeferrable,'enforced',coalesce((to_jsonb(k)->>'conenforced')::boolean,true)) ORDER BY k.contype,pg_get_constraintdef(k.oid)) FROM pg_constraint k WHERE k.conrelid=c.oid) AS constraints,
 (SELECT jsonb_agg(jsonb_build_object('valid',i.indisvalid,'ready',i.indisready,'definition',pg_get_indexdef(i.indexrelid)) ORDER BY pg_get_indexdef(i.indexrelid)) FROM pg_index i WHERE i.indrelid=c.oid) AS indexes
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f') ORDER BY c.relname`,
 advisory:'/* admin-release:lock */ SELECT pg_try_advisory_xact_lock(724910,7) AS locked'
});
export function canonicalCatalog(rows){return rows.map(({name,kind,persistence,rls,force_rls,user_triggers,columns,constraints,indexes})=>({name,kind,persistence,rls,force_rls,user_triggers,columns:(columns||[]).map(({name,type,notnull,default:defaultValue})=>({name,type,notnull,default:defaultValue})),
 constraints:(constraints||[]).map(({type,definition,validated,deferrable,enforced})=>({type,definition:definition.replace(/\s+/g,' ').trim(),validated,deferrable,enforced})).sort((a,b)=>(a.type+a.definition).localeCompare(b.type+b.definition)),
 indexes:(indexes||[]).map(({valid,ready,definition})=>({valid,ready,definition:definition.replace(/^CREATE (UNIQUE )?INDEX \S+ ON /,(_,unique)=>'CREATE '+(unique||'')+'INDEX ON ').replace(/\s+/g,' ').trim()})).sort((a,b)=>a.definition.localeCompare(b.definition))
})).sort((a,b)=>a.name.localeCompare(b.name))}
export const schemaDigest=rows=>sha256(JSON.stringify(canonicalCatalog(rows)));
export async function loadApprovedSchema(read=readFile){
 const schema=JSON.parse(await read(new URL('./admin-analytics-approved-schema.json',import.meta.url),'utf8'));
 ensure(schema.version===1&&schema.postgresMajor===18&&isDeepStrictEqual(schema.tables.map(row=>row.name).sort(),[...NEW_TABLES].sort()),'INVALID_APPROVED_SCHEMA');
 ensure(schema.schemaSha256===schemaDigest(schema.tables),'APPROVED_SCHEMA_DIGEST_MISMATCH');
 return schema;
}
export function verifyIdentity(row,readOnly){
 ensure(row&&row.database===TARGET.database&&row.role===TARGET.owner&&row.session_role===TARGET.owner&&row.owner===TARGET.owner&&Number(row.version)>=180000&&Number(row.version)<190000&&row.schema==='public'&&row.replica===false,'DATABASE_TARGET_OWNER_MISMATCH');
 ensure(row.schema_usage===true&&row.schema_create===true,'DDL_SCHEMA_PERMISSION_MISSING');
 ensure(row.isolation==='repeatable read'&&row.read_only===(readOnly?'on':'off'),'TRANSACTION_GUARD_MISMATCH');
}
export const readCatalog=async client=>(await client.query(SQL.catalog)).rows;
export function verifyCatalog(rows,approved){
 ensure(new Set(rows.map(row=>row.name)).size===rows.length,'DUPLICATE_CATALOG_ENTRY');
 for(const name of BASE_TABLES){const row=rows.find(row=>row.name===name);ensure(row&&row.kind==='r'&&row.persistence==='p'&&!row.rls&&!row.force_rls&&row.can_select===true&&row.can_reference===true&&row.constraints?.some(c=>c.type==='p'),'BASE_SCHEMA_MISSING_OR_UNSUPPORTED');}
 const wallet=rows.find(row=>row.name==='hero_auction_wallets');ensure(wallet.columns.some(c=>c.name==='account_id'&&c.type==='text'&&c.notnull)&&wallet.columns.some(c=>c.name==='gold'&&c.type==='integer'&&c.notnull),'BASE_WALLET_INCOMPATIBLE');
 const commander=rows.find(row=>row.name==='hero_auction_commanders'),profile=rows.find(row=>row.name==='hero_auction_user_profiles');
 ensure(commander.columns.some(c=>c.name==='account_id'&&c.type==='text'&&c.notnull)&&commander.columns.some(c=>c.name==='profile'&&c.type==='jsonb'&&c.notnull)&&profile.columns.some(c=>c.name==='account_id'&&c.type==='text'&&c.notnull)&&profile.columns.some(c=>c.name==='display_name'&&c.type==='text'&&c.notnull),'BASE_PROFILE_INCOMPATIBLE');
 for(const row of rows)ensure((row.constraints||[]).every(c=>c.validated===true&&c.enforced===true&&c.deferrable===false)&&(row.indexes||[]).every(i=>i.valid===true&&i.ready===true),'UNVALIDATED_CONSTRAINT_OR_INDEX');
 const present=rows.filter(row=>NEW_TABLES.includes(row.name));
 ensure(present.length===0||present.length===3,'PARTIAL_ADMIN_ANALYTICS_SCHEMA');
 if(!present.length)return 'absent';
 ensure(present.every(row=>row.can_select===true&&row.can_insert===true&&row.can_update===true&&row.can_reference===true),'NEW_TABLE_PERMISSION_MISSING');
 ensure(schemaDigest(present)===approved.schemaSha256&&isDeepStrictEqual(canonicalCatalog(present),canonicalCatalog(approved.tables)),'APPROVED_SCHEMA_MISMATCH');
 return 'complete';
}
// Snapshot proof: catches writes made by THIS transaction. It does not assert
// that unrelated live game transactions were globally paused or unchanged.
export async function preservation(client,catalog){
 const tables={};
 for(const row of catalog.filter(row=>!NEW_TABLES.includes(row.name))){
  ensure(row.kind==='r'&&row.persistence==='p'&&row.can_select===true&&!row.rls&&!row.force_rls&&/^[a-z_][a-z0-9_]*$/.test(row.name),'PRESERVATION_TABLE_UNSUPPORTED');
  const result=(await client.query(`/* admin-release:preserve */ SELECT count(*)::text AS count,encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex'),'' ORDER BY to_jsonb(t)::text),''),'UTF8')),'hex') AS digest FROM public.${row.name} t`)).rows[0];
  ensure(result&&typeof result.count==='string'&&!/[^0-9]/.test(result.count)&&result.count.length&&hex(result.digest),'INVALID_PRESERVATION_RESULT');tables[row.name]={count:result.count,digest:result.digest};
 }
 return {tables,sha256:sha256(JSON.stringify(tables)),scope:'same_transaction_snapshot'};
}
export async function begin(client,readOnly){await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ '+(readOnly?'READ ONLY':'READ WRITE'));await client.query("SET LOCAL search_path = public; SET LOCAL statement_timeout = '10s'; SET LOCAL lock_timeout = '2s'; SET LOCAL idle_in_transaction_session_timeout = '15s'; SET LOCAL transaction_timeout = '60s'");}
