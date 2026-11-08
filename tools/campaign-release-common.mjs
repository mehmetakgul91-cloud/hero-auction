// Explicit migration012 operator only. Never imported by server startup.
import {readFile} from 'node:fs/promises';
import {isDeepStrictEqual} from 'node:util';
import {TARGET,SQL,readCatalog,canonicalCatalog,schemaDigest,verifyIdentity,begin,sha256,refuse,safeError,connect} from './admin-analytics-release-common.mjs';
export {TARGET,SQL,readCatalog,canonicalCatalog,schemaDigest,verifyIdentity,begin,sha256,refuse,safeError,connect};
export const TABLE='hero_auction_campaign_funnel';
export const CONFIRMATION='APPLY_HERO_CAMPAIGN_012_ONE_TABLE';
export const FLAGS=Object.freeze(['HERO_CAMPAIGN_MEASUREMENT_ENABLED']);
export const MIGRATION_SHA='ed57465521fa1693aff47a18f8898deac2ef33c7b5895988bb17abf617899625';
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
 ensure(['absent','complete'].includes(args['expect-state'])&&true,'INVALID_EXPECTED_STATE');
 if(apply){ensure(hex(args['manifest-sha256'])&&hex(args['schema-sha256']),'INVALID_REVIEWED_DIGEST');ensure(args['backup-reference'].length>=8&&args['backup-reference'].length<=120&&/^[A-Za-z0-9]/.test(args['backup-reference'])&&!/[^A-Za-z0-9_.:-]/.test(args['backup-reference']),'INVALID_BACKUP_REFERENCE');ensure(args.confirm===CONFIRMATION,'CONFIRMATION_REQUIRED');}
 return Object.freeze(args);
}
export function validateRuntime(env,args){
 ensure(env.RENDER==='true'&&env.RENDER_SERVICE_ID===TARGET.service&&env.RENDER_SERVICE_TYPE==='web','WRONG_RENDER_RUNTIME');
 ensure(env.RENDER_GIT_COMMIT===args['expect-commit']&&env.RENDER_GIT_REPO_SLUG===TARGET.repo&&env.IS_PULL_REQUEST!=='true','WRONG_RENDER_BUILD');
 ensure(FLAGS.every(flag=>env[flag]===undefined||env[flag]===''||env[flag]==='0'),'CAMPAIGN_FLAG_MUST_BE_OFF');
 // node-postgres otherwise falls back to PGPORT/PGSSLMODE when a URL omits
 // them. Refuse every ambient PG override rather than silently changing target.
 ensure(!Object.keys(env).some(key=>/^PG[A-Z_]*$/.test(key)),'AMBIENT_PG_OVERRIDES_FORBIDDEN');
 let url;try{url=new URL(env.DATABASE_URL)}catch{refuse('MISSING_OR_INVALID_DATABASE_URL')}
 ensure(['postgres:','postgresql:'].includes(url.protocol)&&url.hostname===TARGET.host&&(!url.port||url.port==='5432')&&!url.hash,'NOT_APPROVED_INTERNAL_DATABASE');
 let database,role;try{database=decodeURIComponent(url.pathname.slice(1));role=decodeURIComponent(url.username)}catch{refuse('INVALID_DATABASE_IDENTITY')}
 ensure(database===TARGET.database&&role===TARGET.owner&&url.password,'WRONG_DATABASE_IDENTITY');
 ensure([...url.searchParams.keys()].every(key=>key==='sslmode')&&url.searchParams.getAll('sslmode').length<=1&&(!url.searchParams.has('sslmode')||['require','disable'].includes(url.searchParams.get('sslmode'))),'UNAPPROVED_CONNECTION_OPTIONS');
 return Object.freeze({connectionString:env.DATABASE_URL,connectionTimeoutMillis:5000,query_timeout:15000,application_name:'hero-explicit-campaign-012-release',options:'-c search_path=public -c statement_timeout=10000 -c lock_timeout=2000 -c idle_in_transaction_session_timeout=15000 -c transaction_timeout=60000'});
}

export async function loadRelease(read=readFile){
 const source=await read(new URL('../migrations/012-campaign-measurement.sql',import.meta.url),'utf8');
 ensure(sha256(source)===MIGRATION_SHA,'MIGRATION_012_DIGEST_MISMATCH');
 const statements=source.replace(/--[^\n]*/g,'').split(';').map(s=>s.trim()).filter(Boolean);
 ensure(statements.length===6&&statements[0]==='BEGIN'&&statements.at(-1)==='COMMIT','INVALID_012_WRAPPERS');
 ensure(statements[1]==="SET LOCAL lock_timeout='5s'"&&statements[2]==='SET LOCAL search_path=public,pg_catalog','INVALID_012_SETTINGS');
 ensure(statements[3].startsWith('CREATE TABLE '+TABLE+' (')&&statements[4]==='CREATE INDEX hero_auction_campaign_expiry ON '+TABLE+'(attributed_at)','INVALID_012_DDL');
 const approved=JSON.parse(await read(new URL('./campaign-approved-schema.json',import.meta.url),'utf8'));
 ensure(approved.version===1&&approved.postgresMajor===18&&approved.tables.length===1&&approved.tables[0].name===TABLE&&approved.schemaSha256===schemaDigest(approved.tables),'INVALID_APPROVED_CAMPAIGN_SCHEMA');
 const manifest=JSON.parse(await read(new URL('./campaign-migration-manifest.json',import.meta.url),'utf8'));
 ensure(manifest.version===12&&manifest.name==='012-campaign-measurement.sql'&&manifest.sha256===MIGRATION_SHA&&manifest.schemaSha256===approved.schemaSha256,'INVALID_CAMPAIGN_MANIFEST');
 return {statements:statements.slice(3,5),approved,manifest,manifestSha256:sha256(JSON.stringify(manifest))};
}
export function verifyCatalog(rows,approved){
 ensure(new Set(rows.map(r=>r.name)).size===rows.length,'DUPLICATE_CATALOG_ENTRY');
 const wallet=rows.find(r=>r.name==='hero_auction_wallets');
 ensure(wallet&&wallet.kind==='r'&&wallet.persistence==='p'&&!wallet.rls&&!wallet.force_rls&&wallet.can_select&&wallet.can_reference&&wallet.columns.some(c=>c.name==='account_id'&&c.type==='text'&&c.notnull)&&wallet.constraints.some(c=>c.type==='p'&&c.validated&&c.enforced),'WALLET_SCHEMA_UNSUPPORTED');
 const present=rows.filter(r=>r.name===TABLE);if(!present.length)return 'absent';
 ensure(present[0].can_select&&present[0].can_insert&&present[0].can_update&&present[0].can_reference,'CAMPAIGN_PERMISSION_MISSING');
 ensure(schemaDigest(present)===approved.schemaSha256&&isDeepStrictEqual(canonicalCatalog(present),canonicalCatalog(approved.tables)),'CAMPAIGN_SCHEMA_MISMATCH');return 'complete';
}
export async function preservation(client,catalog){
 const tables={};
 for(const row of catalog.filter(r=>r.name!==TABLE)){
  ensure(row.kind==='r'&&row.persistence==='p'&&row.can_select&&!row.rls&&!row.force_rls&&/^[a-z_][a-z0-9_]*$/.test(row.name),'PRESERVATION_TABLE_UNSUPPORTED');
  const result=(await client.query(`SELECT count(*)::text AS count,encode(sha256(convert_to(coalesce(string_agg(encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex'),'' ORDER BY to_jsonb(t)::text),''),'UTF8')),'hex') AS digest FROM public.${row.name} t`)).rows[0];
  ensure(result&&typeof result.count==='string'&&/^[0-9]+$/.test(result.count)&&hex(result.digest),'INVALID_PRESERVATION_RESULT');tables[row.name]={count:result.count,digest:result.digest};
 }
 return {tables,sha256:sha256(JSON.stringify(tables)),scope:'same_transaction_snapshot'};
}
export async function operate(client,args,release,apply=false){
 args=parseArgs(Object.entries(args).flatMap(([k,v])=>['--'+k,v]),apply);
 if(apply)ensure(args['manifest-sha256']===release.manifestSha256&&args['schema-sha256']===release.approved.schemaSha256,'REVIEWED_DIGEST_MISMATCH');
 let commitAttempted=false;
 try{
  await begin(client,!apply);verifyIdentity((await client.query(SQL.identity)).rows[0],!apply);
  if(apply)ensure((await client.query('SELECT pg_try_advisory_xact_lock(724910,12) AS locked')).rows[0]?.locked===true,'CAMPAIGN_MIGRATION_LOCKED');
  const beforeCatalog=await readCatalog(client),state=verifyCatalog(beforeCatalog,release.approved);
  if(!apply){ensure(state===args['expect-state'],'EXPECTED_SCHEMA_STATE_MISMATCH');const proof=await preservation(client,beforeCatalog);await client.query('ROLLBACK');return {status:'preflight_passed',schemaState:state,manifestSha256:release.manifestSha256,schemaSha256:release.approved.schemaSha256,migrationSha256:MIGRATION_SHA,preservation:proof,readOnly:true,backupVerified:false,flagsChanged:false};}
  if(state==='complete'){await client.query('ROLLBACK');return {status:'already_present_exact_schema_verified',replayed:true,schemaState:state,manifestSha256:release.manifestSha256,schemaSha256:release.approved.schemaSha256,flagsChanged:false};}
  ensure(args['expect-state']==='absent','EXPECTED_SCHEMA_STATE_MISMATCH');
  const before=await preservation(client,beforeCatalog),beforeSchema=schemaDigest(beforeCatalog);
  for(const statement of release.statements)await client.query(statement);
  const afterCatalog=await readCatalog(client);ensure(verifyCatalog(afterCatalog,release.approved)==='complete','CAMPAIGN_SCHEMA_INCOMPLETE');
  ensure(afterCatalog.length===beforeCatalog.length+1&&schemaDigest(afterCatalog.filter(r=>r.name!==TABLE))===beforeSchema,'PREEXISTING_SCHEMA_CHANGED');
  ensure((await client.query('SELECT count(*)::text AS count FROM public.'+TABLE)).rows[0]?.count==='0','NEW_TABLE_NOT_EMPTY');
  const after=await preservation(client,afterCatalog);ensure(isDeepStrictEqual(before,after),'PREEXISTING_DATA_CHANGED');
  commitAttempted=true;await client.query('COMMIT');return {status:'applied',schemaState:'complete',tablesCreated:[TABLE],commit:args['expect-commit'],manifestSha256:release.manifestSha256,schemaSha256:release.approved.schemaSha256,migrationSha256:MIGRATION_SHA,preservation:after,backupReference:args['backup-reference'],backupExternallyVerifiedRequired:true,flagsChanged:false};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});if(commitAttempted)refuse('COMMIT_OUTCOME_UNKNOWN_RUN_READ_ONLY_PREFLIGHT');throw error;}
}
