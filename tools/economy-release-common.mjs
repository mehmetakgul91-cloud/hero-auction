// Explicit operator tools only. Never imported by server.js or any startup hook.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
export const TARGET=Object.freeze({service:'srv-db72kiaj9qps73b0b5tg',host:'dpg-db88ehmq1p3s739vvodg-a',database:'hero_auction_db',major:18,version:5,repo:'mehmetakgul91-cloud/hero-auction'});
export const CONFIRMATION='APPLY_HERO_ECONOMY_001_TO_005';
export const LEDGER='hero_auction_economy_migrations';
export const FLAGS=Object.freeze(['HERO_DIAMONDS_ENABLED','HERO_DIAMOND_EXCHANGE_ENABLED','HERO_DIAMOND_SIGNUP_BONUS_ENABLED','HERO_LOGIN_REWARDS_ENABLED','HERO_MAGIC_DUST_ENABLED','HERO_VICTORY_CHESTS_ENABLED','HERO_REWARDED_ADS_ENABLED','COMMANDER_TEST_GUEST_MODE']);
export const FILES=Object.freeze(['001-paid-diamonds-foundation.sql','002-diamond-exchange.sql','003-diamond-signup-bonus.sql','004-login-rewards.sql','005-victory-chests-magic-dust.sql']);
export const BASE_TABLES=Object.freeze(['hero_auction_wallets','hero_auction_commanders','hero_auction_user_profiles','hero_auction_gold_awards','hero_auction_rooms']);
export const COLUMNS=Object.freeze({
 hero_auction_diamond_wallets:'account_id diamonds',
 hero_auction_upgrade_receipts:'account_id request_id commander_id stat from_level to_level gold_cost diamond_cost pricing_version created_at magic_dust_cost',
 hero_auction_diamond_ledger:'id account_id request_id kind delta balance_before balance_after created_at',
 hero_auction_diamond_exchanges:'account_id request_id kind diamonds_spent gold_granted exchange_rate pricing_version diamond_balance_before diamond_balance_after gold_balance_before gold_balance_after created_at',
 hero_auction_diamond_registrations:'account_id provider eligible created_at',
 hero_auction_diamond_signup_receipts:'account_id kind amount balance_before balance_after created_at',
 hero_auction_login_reward_receipts:'account_id reward_date day_index gold_amount diamond_amount gold_before gold_after diamonds_before diamonds_after created_at',
 hero_auction_login_reward_streaks:'account_id provider last_reward_date day_index updated_at',
 hero_auction_magic_dust_wallets:'account_id magic_dust',
 hero_auction_magic_dust_upgrade_ledger:'account_id request_id delta balance_before balance_after created_at',
 hero_auction_victory_chest_intents:'match_id account_id winner_seat config_version gold_amount magic_dust_amount diamond_amount room_state created_at',
 hero_auction_victory_chest_receipts:'match_id account_id config_version gold_amount magic_dust_amount diamond_amount gold_before gold_after magic_dust_before magic_dust_after diamonds_before diamonds_after created_at'
});
export const NEW_TABLES=Object.freeze(Object.keys(COLUMNS));
const HEX=/^[0-9a-f]{64}$/;
export const sha256=value=>createHash('sha256').update(value).digest('hex');
export function refuse(code){throw Object.assign(Error(code),{safeCode:code});}
const ensure=(condition,code)=>{if(!condition)refuse(code);};
export function parseArgs(argv,apply=false){
 const common=['expect-service','expect-database','expect-major','expect-commit','expect-version','target'];
 const allowed=new Set(apply?[...common,'manifest-sha256','backup-reference','confirm']:common),args={};
 for(let i=0;i<argv.length;i+=2){const key=argv[i]?.slice(2);ensure(argv[i]?.startsWith('--')&&allowed.has(key)&&!Object.hasOwn(args,key)&&typeof argv[i+1]==='string'&&!argv[i+1].startsWith('--'),'INVALID_ARGUMENTS');args[key]=argv[i+1];}
 ensure([...allowed].every(key=>Object.hasOwn(args,key)),'MISSING_EXPLICIT_ARGUMENTS');
 ensure(args['expect-service']===TARGET.service&&args['expect-database']===TARGET.database&&args['expect-major']===String(TARGET.major)&&args.target==='005','WRONG_APPROVED_TARGET');
 ensure(/^[0-9a-f]{40}$/.test(args['expect-commit']),'INVALID_BUILD_COMMIT');
 ensure(['0','5'].includes(args['expect-version'])&&(!apply||args['expect-version']==='0'),'INVALID_EXPECTED_VERSION');
 if(apply){ensure(HEX.test(args['manifest-sha256']),'INVALID_MANIFEST_DIGEST');ensure(/^[A-Za-z0-9][A-Za-z0-9_.:-]{7,119}$/.test(args['backup-reference']),'INVALID_BACKUP_REFERENCE');ensure(args.confirm===CONFIRMATION,'CONFIRMATION_REQUIRED');}
 return Object.freeze(args);
}
export function validateRuntime(env,args){
 ensure(env.RENDER==='true'&&env.RENDER_SERVICE_ID===TARGET.service&&env.RENDER_SERVICE_ID===args['expect-service']&&env.RENDER_SERVICE_TYPE==='web','WRONG_RENDER_RUNTIME');
 ensure(env.RENDER_GIT_COMMIT===args['expect-commit']&&env.RENDER_GIT_REPO_SLUG===TARGET.repo&&env.IS_PULL_REQUEST!=='true','WRONG_RENDER_BUILD');
 ensure(FLAGS.every(key=>env[key]===undefined||env[key]===''||env[key]==='0'),'ECONOMY_FLAGS_MUST_BE_OFF');
 let url;try{url=new URL(env.DATABASE_URL);}catch{refuse('MISSING_OR_INVALID_DATABASE_URL');}
 ensure(['postgres:','postgresql:'].includes(url.protocol)&&url.hostname===TARGET.host&&(!url.port||url.port==='5432')&&!url.hash,'NOT_APPROVED_INTERNAL_DATABASE');
 let database;try{database=decodeURIComponent(url.pathname.slice(1));}catch{refuse('INVALID_DATABASE_NAME');}
 ensure(database===TARGET.database&&url.username&&url.password,'WRONG_DATABASE_IDENTITY');
 // Never let connection-string query parameters override host, credentials,
 // options or search_path. Preserve the existing allowed internal TLS setting.
 ensure([...url.searchParams.keys()].every(key=>key==='sslmode')&&url.searchParams.getAll('sslmode').length<=1&&(!url.searchParams.has('sslmode')||['require','disable'].includes(url.searchParams.get('sslmode'))),'UNAPPROVED_CONNECTION_OPTIONS');
 return Object.freeze({connectionString:env.DATABASE_URL,connectionTimeoutMillis:5000,query_timeout:15000,
  application_name:'hero-explicit-economy-release',options:'-c search_path=public -c statement_timeout=10000 -c lock_timeout=2000 -c idle_in_transaction_session_timeout=15000 -c transaction_timeout=60000'});
}
// Purposefully narrow lexer for these five reviewed plain-DDL files. No regex
// blindly removes BEGIN/COMMIT from SQL strings, comments, functions or bodies.
export function migrationStatements(source){
 ensure(typeof source==='string'&&source.length<100000&&!source.includes('\0'),'INVALID_MIGRATION_TEXT');
 const statements=[];let text='',quoted=false;
 for(let i=0;i<source.length;i++){
  const c=source[i],next=source[i+1];
  if(!quoted&&c==='-'&&next==='-'){while(i<source.length&&source[i]!=='\n')i++;text+='\n';continue;}
  ensure(c!=='\\'&&c!=='"'&&c!=='$'&&!(c==='/'&&next==='*'),'UNSUPPORTED_SQL_SYNTAX');
  if(c==="'"){text+=c;if(quoted&&next==="'"){text+=next;i++;}else quoted=!quoted;continue;}
  if(c===';'&&!quoted){if(text.trim())statements.push(text.trim());text='';}else text+=c;
 }
 ensure(!quoted&&!text.trim()&&statements.length>=3,'INCOMPLETE_MIGRATION');
 ensure(statements[0]==='BEGIN'&&statements.at(-1)==='COMMIT','EXACT_TRANSACTION_WRAPPERS_REQUIRED');
 const body=statements.slice(1,-1);
 for(const statement of body){
  const table=statement.match(/^CREATE TABLE IF NOT EXISTS (hero_auction_[a-z_]+)\s*\(/)?.[1];
  const index=/^CREATE INDEX IF NOT EXISTS hero_auction_victory_chest_intents_room ON hero_auction_victory_chest_intents \(\(room_state->>'code'\)\)$/.test(statement);
  const dust=/^ALTER TABLE hero_auction_upgrade_receipts ADD COLUMN IF NOT EXISTS magic_dust_cost INTEGER NOT NULL DEFAULT 0 CHECK\(magic_dust_cost>=0\)$/.test(statement);
  ensure(table&&NEW_TABLES.includes(table)||index||dust,'UNAPPROVED_MIGRATION_STATEMENT');
  // No CTAS, executable bodies, grants, DML, nested transaction or altered
  // existing balances can be smuggled behind an approved CREATE prefix.
  const words=statement.replace(/'(?:''|[^'])*'/g,"''");
  ensure(!/\b(?:BEGIN|COMMIT|ROLLBACK|SAVEPOINT|SELECT|INSERT|UPDATE|DELETE|MERGE|DROP|TRUNCATE|GRANT|REVOKE|CALL|COPY|EXECUTE|DO)\b/i.test(words),'UNAPPROVED_SQL_OPERATION');
 }
 return body;
}
export async function loadManifest(read=readFile){
 const entries=[];
 for(const [index,name] of FILES.entries()){const source=await read(new URL('../migrations/'+name,import.meta.url),'utf8');entries.push({version:index+1,name,sha256:sha256(source),statements:migrationStatements(source)});}
 const manifestSha256=sha256(JSON.stringify(entries.map(({version,name,sha256})=>({version,name,sha256}))));
 return {entries,manifestSha256};
}
export const SQL=Object.freeze({
 identity:`/* economy-release:identity */ SELECT current_database() AS database,current_setting('server_version_num') AS version,current_schema() AS schema,
 pg_is_in_recovery() AS replica,has_schema_privilege(current_user,'public','USAGE') AS schema_usage,has_schema_privilege(current_user,'public','CREATE') AS schema_create,
 current_setting('transaction_read_only') AS read_only,current_setting('transaction_isolation') AS isolation`,
 catalog:`/* economy-release:catalog */ SELECT c.relname AS name,c.relkind AS kind,c.relpersistence AS persistence,c.relrowsecurity AS rls,c.relforcerowsecurity AS force_rls,
 has_table_privilege(current_user,c.oid,'SELECT') AS can_select,has_table_privilege(current_user,c.oid,'INSERT') AS can_insert,has_table_privilege(current_user,c.oid,'UPDATE') AS can_update,has_table_privilege(current_user,c.oid,'REFERENCES') AS can_reference,
 (SELECT count(*)::int FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal) AS user_triggers,
 (SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
 FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns,
 (SELECT jsonb_agg(jsonb_build_object('name',k.conname,'type',k.contype,'definition',pg_get_constraintdef(k.oid),'validated',k.convalidated,'deferrable',k.condeferrable,'enforced',coalesce((to_jsonb(k)->>'conenforced')::boolean,true)) ORDER BY k.conname) FROM pg_constraint k WHERE k.conrelid=c.oid) AS constraints,
 (SELECT jsonb_agg(jsonb_build_object('name',ic.relname,'valid',i.indisvalid,'ready',i.indisready,'definition',pg_get_indexdef(i.indexrelid)) ORDER BY ic.relname) FROM pg_index i JOIN pg_class ic ON ic.oid=i.indexrelid WHERE i.indrelid=c.oid) AS indexes
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[]) ORDER BY c.relname`,
 ledger:`/* economy-release:ledger */ SELECT version,filename,sha256,manifest_sha256,release_commit,backup_reference,schema_sha256,preservation_sha256 FROM public.hero_auction_economy_migrations ORDER BY version`,
 sequence:`/* economy-release:sequence */ SELECT has_sequence_privilege(current_user,pg_get_serial_sequence('public.hero_auction_diamond_ledger','id'),'USAGE') AS permitted`,
 activity:`/* economy-release:activity */ SELECT count(*) FILTER(WHERE state->>'entryPaid'='true' AND coalesce(state->>'mode','friend')<>'bot' AND (state->>'phase'='auction' OR (state->>'phase'='finished' AND coalesce(state->>'matchSettled','false')<>'true')))::text AS unsettled_paid_rooms,
 count(*) FILTER(WHERE state->>'victoryChestPending'='true')::text AS pending_chest_rooms FROM public.hero_auction_rooms`,
 advisory:`/* economy-release:lock */ SELECT pg_try_advisory_xact_lock(724910,5) AS locked`
});
export function verifyIdentity(row,readOnly){
 ensure(row&&row.database===TARGET.database&&Number(row.version)>=180000&&Number(row.version)<190000&&row.schema==='public'&&row.replica===false,'DATABASE_TARGET_MISMATCH');
 ensure(row.schema_usage===true&&row.schema_create===true,'DDL_SCHEMA_PERMISSION_MISSING');
 ensure(row.isolation==='repeatable read'&&row.read_only===(readOnly?'on':'off'),'TRANSACTION_GUARD_MISMATCH');
}
export async function readCatalog(client){return (await client.query(SQL.catalog,[BASE_TABLES.concat(NEW_TABLES,LEDGER)])).rows;}
export function schemaDigest(rows){return sha256(JSON.stringify(rows.map(({name,kind,persistence,rls,force_rls,columns,constraints,indexes,user_triggers})=>({name,kind,persistence,rls,force_rls,columns,constraints,indexes,user_triggers})).sort((a,b)=>a.name.localeCompare(b.name))));}
export function verifyCatalog(rows,completed=false){
 const byName=new Map(rows.map(row=>[row.name,row]));
 for(const name of BASE_TABLES){const row=byName.get(name);ensure(row&&row.kind==='r'&&row.persistence==='p'&&!row.rls&&!row.force_rls,'BASE_SCHEMA_MISSING_OR_UNSUPPORTED');ensure(row.can_select===true&&row.can_insert===true&&row.can_update===true&&row.can_reference===true,'BASE_TABLE_PERMISSION_MISSING');ensure(row.constraints?.some(c=>c.type==='p'),'BASE_PRIMARY_KEY_MISSING');}
 const wallet=byName.get('hero_auction_wallets'),commander=byName.get('hero_auction_commanders');
 ensure(wallet.columns.some(c=>c.name==='gold'&&c.type==='integer'&&c.notnull)&&wallet.columns.some(c=>c.name==='account_id'&&c.type==='text'&&c.notnull)&&commander.columns.some(c=>c.name==='profile'&&c.type==='jsonb'&&c.notnull),'BASE_COLUMNS_INCOMPATIBLE');
 for(const row of rows){ensure((row.constraints||[]).every(c=>c.validated===true&&c.enforced===true&&c.deferrable===false)&&(row.indexes||[]).every(i=>i.valid===true&&i.ready===true),'UNVALIDATED_CONSTRAINT_OR_INDEX');}
 if(completed){
  for(const name of NEW_TABLES){const row=byName.get(name);ensure(row&&row.kind==='r'&&row.persistence==='p'&&!row.rls&&!row.force_rls&&row.user_triggers===0,'NEW_SCHEMA_INCOMPATIBLE');ensure(row.can_select===true&&row.can_insert===true&&row.can_update===true&&row.can_reference===true,'NEW_TABLE_PERMISSION_MISSING');
   ensure(row.columns.map(c=>c.name).join(' ')===COLUMNS[name]&&row.columns.every(c=>c.notnull===true),'NEW_COLUMNS_INCOMPATIBLE');
   ensure(row.constraints.some(c=>c.type==='p')&&row.constraints.some(c=>c.type==='c')&&(name==='hero_auction_diamond_registrations'||row.constraints.some(c=>c.type==='f')),'NEW_CONSTRAINTS_MISSING');
  }
  ensure(byName.has(LEDGER),'MIGRATION_LEDGER_MISSING');
  ensure(byName.get('hero_auction_upgrade_receipts').columns.some(c=>c.name==='magic_dust_cost'&&c.type==='integer'&&c.default==='0'),'DUST_COLUMN_INCOMPATIBLE');
  ensure(byName.get('hero_auction_victory_chest_intents').indexes.some(i=>i.name==='hero_auction_victory_chest_intents_room'),'INTENT_INDEX_MISSING');
 }
}
export async function readVersion(client,catalog,manifest){
 const present=new Set(catalog.map(row=>row.name));
 if(!present.has(LEDGER)){ensure(NEW_TABLES.every(name=>!present.has(name)),'UNTRACKED_OR_PARTIAL_ECONOMY_SCHEMA');return {version:0,ledger:[]};}
 const records=(await client.query(SQL.ledger)).rows;
 ensure(records.length===FILES.length&&records.every((r,i)=>Number(r.version)===i+1&&r.filename===manifest.entries[i].name&&r.sha256===manifest.entries[i].sha256&&r.manifest_sha256===manifest.manifestSha256&&HEX.test(r.schema_sha256||'')&&HEX.test(r.preservation_sha256||'')),'MIGRATION_LEDGER_MISMATCH');
 ensure(records.every(r=>/^[0-9a-f]{40}$/.test(r.release_commit||'')&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{7,119}$/.test(r.backup_reference||'')&&r.release_commit===records[0].release_commit&&r.backup_reference===records[0].backup_reference&&r.preservation_sha256===records[0].preservation_sha256),'INCONSISTENT_MIGRATION_PROOF');
 verifyCatalog(catalog,true);
 const digest=schemaDigest(catalog);
 ensure(records.every(r=>r.schema_sha256===digest),'TRACKED_SCHEMA_DRIFT');
 ensure((await client.query(SQL.sequence)).rows[0]?.permitted===true,'LEDGER_SEQUENCE_PERMISSION_MISSING');
 return {version:5,ledger:records};
}
export async function preservation(client){
 const result={};
 for(const [key,table,value] of [['gold','hero_auction_wallets','gold'],['commanders','hero_auction_commanders','profile']]){
  const query=`/* economy-release:preserve-${key} */ SELECT count(*)::text AS count,encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(jsonb_build_array(account_id,${value})::text,'UTF8')),'hex'),'' ORDER BY account_id),''),'UTF8')),'hex') AS digest FROM public.${table}`;
  const row=(await client.query(query)).rows[0];ensure(row&&/^\d+$/.test(row.count)&&HEX.test(row.digest),'INVALID_PRESERVATION_RESULT');result[key]={count:row.count,digest:row.digest};
 }
 return {...result,sha256:sha256(JSON.stringify(result))};
}
export async function begin(client,readOnly){await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ '+(readOnly?'READ ONLY':'READ WRITE'));await client.query("SET LOCAL search_path = public; SET LOCAL statement_timeout = '10s'; SET LOCAL lock_timeout = '2s'; SET LOCAL idle_in_transaction_session_timeout = '15s'; SET LOCAL transaction_timeout = '60s'");}
export function safeError(error){return error?.safeCode||(/^[A-Z0-9]{5}$/.test(error?.code||'')?'DATABASE_ERROR_'+error.code:'OPERATION_FAILED');}
export async function connect(config){const {default:pg}=await import('pg');const client=new pg.Client(config);client.on('notice',()=>{});client.on('error',()=>{});try{await client.connect();return client;}catch(error){await client.end().catch(()=>{});throw error;}}
