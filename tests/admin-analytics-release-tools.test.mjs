import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {TARGET,FLAGS,FILES,NEW_TABLES,CONFIRMATION,SQL,parseArgs,validateRuntime,migrationStatements,loadManifest,loadApprovedSchema,canonicalCatalog,schemaDigest,sha256,safeError} from '../tools/admin-analytics-release-common.mjs';
import {preflight} from '../tools/admin-analytics-preflight.mjs';
import {applyMigrations} from '../tools/apply-admin-analytics-migrations.mjs';
const manifest=await loadManifest(),approved=await loadApprovedSchema(),commit='a'.repeat(40);
const argv=(apply=false,patch={})=>Object.entries({'expect-service':TARGET.service,'expect-database':TARGET.database,'expect-owner':TARGET.owner,'expect-major':'18','expect-commit':commit,'expect-state':'absent',...(apply?{'manifest-sha256':manifest.manifestSha256,'schema-sha256':approved.schemaSha256,'backup-reference':'verified-render-backup-20261027',confirm:CONFIRMATION}:{}),...patch}).flatMap(([key,value])=>['--'+key,value]);
const args=(apply=false,patch={})=>parseArgs(argv(apply,patch),apply);
const environment=()=>({RENDER:'true',RENDER_SERVICE_ID:TARGET.service,RENDER_SERVICE_TYPE:'web',RENDER_GIT_COMMIT:commit,RENDER_GIT_REPO_SLUG:TARGET.repo,IS_PULL_REQUEST:'false',DATABASE_URL:`postgresql://${TARGET.owner}:private-password@${TARGET.host}/${TARGET.database}`});
const permission={can_select:true,can_insert:true,can_update:true,can_reference:true};
function baseTable(name){const cols=name==='hero_auction_wallets'?[['account_id','text'],['gold','integer']]:name==='hero_auction_commanders'?[['account_id','text'],['profile','jsonb']]:[['account_id','text'],['display_name','text']];return{name,kind:'r',persistence:'p',rls:false,force_rls:false,user_triggers:0,...permission,columns:cols.map(([name,type])=>({name,type,notnull:true,default:null})),constraints:[{type:'p',definition:'PRIMARY KEY (account_id)',validated:true,deferrable:false,enforced:true}],indexes:[]}}
const bases=['hero_auction_wallets','hero_auction_commanders','hero_auction_user_profiles'].map(baseTable);
function fixture({present=0,wrongOwner=false,busy=false,failDDL=false,mutateData=false,mutateSchema=false,nonempty=false,lostCommit=false,drift=false}={}){
 let state={tables:present,preserved:'1'.repeat(64),schemaChanged:false},snapshot=null,readOnly=false,ddl=0,commits=0;
 const calls=[];
 const catalog=()=>[...structuredClone(bases),...approved.tables.slice(0,state.tables).map(row=>({...structuredClone(row),...permission}))].map(row=>{if((drift||state.schemaChanged)&&row.name==='hero_auction_wallets')row.columns.push({name:'unexpected',type:'integer',notnull:false,default:null});return row});
 const client={async query(sql){calls.push(sql);
  if(sql.startsWith('BEGIN ')){snapshot=structuredClone(state);readOnly=sql.endsWith('READ ONLY');return{rows:[]}}
  if(sql.startsWith('SET LOCAL'))return{rows:[]};
  if(sql==='ROLLBACK'){if(snapshot)state=snapshot;snapshot=null;return{rows:[]}}
  if(sql==='COMMIT'){snapshot=null;commits++;if(lostCommit){lostCommit=false;throw Error('lost commit secret')}return{rows:[]}}
  if(sql===SQL.identity)return{rows:[{database:TARGET.database,role:wrongOwner?'wrong':TARGET.owner,session_role:TARGET.owner,owner:TARGET.owner,version:'180004',schema:'public',replica:false,schema_usage:true,schema_create:true,read_only:readOnly?'on':'off',isolation:'repeatable read'}]};
  if(sql===SQL.advisory)return{rows:[{locked:!busy}]};
  if(sql===SQL.catalog)return{rows:catalog()};
  if(sql.startsWith('/* admin-release:preserve */'))return{rows:[{count:'3',digest:state.preserved}]};
  if(sql.startsWith('/* admin-release:empty-new */'))return{rows:[{count:nonempty?'1':'0'}]};
  if(sql.startsWith('CREATE TABLE IF NOT EXISTS')){assert.equal(readOnly,false);ddl++;state.tables+=ddl===1?1:2;if(failDDL&&ddl===2)throw Object.assign(Error('private sql fault'),{code:'22012'});if(ddl===2){if(mutateData)state.preserved='2'.repeat(64);if(mutateSchema)state.schemaChanged=true}return{rows:[]}}
  throw Error('Unexpected SQL');
 }};
 return {client,calls,state:()=>state,ddl:()=>ddl,commits:()=>commits,catalog};
}
test('manifest reads exactly006/007 and approved catalog describes exactly three tables without IDs',()=>{
 assert.deepEqual(manifest.entries.map(row=>row.name),FILES);assert.deepEqual(manifest.entries.map(row=>row.statements.length),[2,4]);
 for(const row of manifest.entries)assert.equal(row.sha256,sha256(readFileSync(new URL('../migrations/'+row.name,import.meta.url))));
 assert.equal(approved.tables.length,3);assert.equal(schemaDigest(approved.tables),approved.schemaSha256);assert.doesNotMatch(JSON.stringify(approved),/"oid"|"conname"|"relowner"/);
 const named=structuredClone(approved.tables);for(const row of named){row.oid=123;for(const constraint of row.constraints)constraint.name='renamed';}assert.deepEqual(canonicalCatalog(named),canonicalCatalog(approved.tables));
});
test('runtime permits existing diamond/dust flags but pins owner and both new flags off',()=>{
 const env={...environment(),HERO_DIAMONDS_ENABLED:'1',HERO_MAGIC_DUST_ENABLED:'1'};assert.equal(validateRuntime(env,args()).connectionString,env.DATABASE_URL);
 for(const flag of FLAGS)for(const value of ['1','true',1])assert.throws(()=>validateRuntime({...env,[flag]:value},args()),/NEW_FLAGS_MUST_BE_OFF/);
});
test('ambient PostgreSQL host/port/TLS overrides are forbidden before connecting',()=>{for(const key of ['PGHOST','PGPORT','PGSSLMODE','PGPASSWORD'])assert.throws(()=>validateRuntime({...environment(),[key]:'unapproved'},args()),/AMBIENT_PG_OVERRIDES_FORBIDDEN/)});
for(const [label,patch]of [['not Render',{RENDER:undefined}],['wrong service',{RENDER_SERVICE_ID:'other'}],['wrong release',{RENDER_GIT_COMMIT:'b'.repeat(40)}],['preview',{IS_PULL_REQUEST:'true'}],['wrong repo',{RENDER_GIT_REPO_SLUG:'other/repo'}],['wrong owner',{DATABASE_URL:`postgresql://other:p@${TARGET.host}/${TARGET.database}`}],['external host',{DATABASE_URL:`postgresql://${TARGET.owner}:p@${TARGET.host}.example/${TARGET.database}`}],['database override',{DATABASE_URL:`postgresql://${TARGET.owner}:p@${TARGET.host}/other`}],['host option',{DATABASE_URL:`postgresql://${TARGET.owner}:p@${TARGET.host}/${TARGET.database}?host=other`}],['schema option',{DATABASE_URL:`postgresql://${TARGET.owner}:p@${TARGET.host}/${TARGET.database}?options=search_path%3Devil`}],['missing password',{DATABASE_URL:`postgresql://${TARGET.owner}@${TARGET.host}/${TARGET.database}`}]] )test('runtime refuses '+label,()=>assert.throws(()=>validateRuntime({...environment(),...patch},args())));
test('CLI requires exact reviewed target, SHA, owner, backup and explicit three-table confirmation',()=>{
 for(const patch of [{'expect-owner':'test'},{'expect-major':'17'},{'expect-service':'wrong'},{'expect-commit':'a'.repeat(40)+'\n'},{'expect-state':'complete'},{'manifest-sha256':'a'.repeat(64)+'\n'},{'schema-sha256':'bad'},{'backup-reference':'https://secret/url'},{confirm:'yes'}])assert.throws(()=>parseArgs(argv(true,patch),true));
 assert.throws(()=>parseArgs([...argv(),'--sql','SELECT 1']));assert.throws(()=>parseArgs([...argv(),'--expect-owner',TARGET.owner]));
});
for(const [label,sql]of [['fourth ledger','BEGIN; CREATE TABLE IF NOT EXISTS hero_auction_admin_migration_ledger(id INTEGER); COMMIT;'],['alter old schema','BEGIN; ALTER TABLE hero_auction_wallets ADD COLUMN x INTEGER; COMMIT;'],['DML','BEGIN; UPDATE hero_auction_wallets SET gold=0; COMMIT;'],['function default','BEGIN; CREATE TABLE IF NOT EXISTS hero_auction_player_activity(account_id TEXT DEFAULT pg_sleep(10)); COMMIT;'],['CTAS','BEGIN; CREATE TABLE IF NOT EXISTS hero_auction_player_activity(a INTEGER) AS SELECT 1; COMMIT;'],['nested transaction','BEGIN; BEGIN; COMMIT;'],['comment confusion','BEGIN; /*x*/ CREATE TABLE IF NOT EXISTS hero_auction_player_activity(a INTEGER); COMMIT;']])test('narrow SQL refuses '+label,()=>assert.throws(()=>migrationStatements(sql)));
test('preflight is read-only and returns aggregate snapshot proof, not backup/provenance claims',async()=>{
 const f=fixture(),report=await preflight(f.client,args(),manifest,approved);assert.equal(report.readOnly,true);assert.equal(report.schemaState,'absent');assert.equal(report.backupVerified,false);assert.equal(report.releaseProvenanceRecorded,false);assert.equal(report.preservation.scope,'same_transaction_snapshot');assert.equal(f.ddl(),0);assert.equal(f.calls.at(-1),'ROLLBACK');assert.ok(f.calls.every(sql=>!/^(CREATE|ALTER|INSERT|UPDATE|DELETE|DROP)/.test(sql)));
});
test('apply makes only reviewed three-table DDL in one transaction and preserves existing data/schema',async()=>{
 const f=fixture(),report=await applyMigrations(f.client,args(true),manifest,approved);assert.equal(report.status,'applied');assert.equal(report.flagsChanged,false);assert.equal(report.tablesCreated.length,3);assert.equal(f.state().tables,3);assert.equal(f.commits(),1);assert.equal(f.ddl(),2);assert.ok(f.calls.every(sql=>!/^ALTER|^INSERT|^UPDATE|^DELETE|^DROP/.test(sql)));assert.equal(f.calls.filter(sql=>sql.startsWith('BEGIN ')).length,1);
});
for(const [label,options,pattern]of [['partial',{present:1},/PARTIAL/],['wrong owner',{wrongOwner:true},/OWNER_MISMATCH/],['contention',{busy:true},/ANOTHER_ADMIN/],['DDL fault',{failDDL:true},/private sql fault/],['wallet mutation',{mutateData:true},/DATA_CHANGED/],['existing schema mutation',{mutateSchema:true},/SCHEMA_CHANGED/],['unexpected backfill',{nonempty:true},/NOT_EMPTY/]])test(label+' fails closed with rollback',async()=>{const f=fixture(options),before=structuredClone(f.state());await assert.rejects(applyMigrations(f.client,args(true),manifest,approved),pattern);assert.deepEqual(f.state(),before);assert.equal(f.commits(),0)});
test('digest mismatch fails before BEGIN; neither fourth table nor proof ledger is created',async()=>{
 const f=fixture();await assert.rejects(applyMigrations(f.client,args(true,{'schema-sha256':'0'.repeat(64)}),manifest,approved),/REVIEWED_DIGEST/);assert.equal(f.calls.length,0);
 for(const file of ['admin-analytics-release-common.mjs','apply-admin-analytics-migrations.mjs'])assert.doesNotMatch(readFileSync(new URL('../tools/'+file,import.meta.url),'utf8'),/CREATE TABLE public\.|INSERT INTO public\./);
});
test('lost COMMIT outcome is reconciled by exact catalog without repeated DDL or inferred provenance',async()=>{
 const f=fixture({lostCommit:true});await assert.rejects(applyMigrations(f.client,args(true),manifest,approved),/COMMIT_OUTCOME_UNKNOWN/);assert.equal(f.state().tables,3);const ddl=f.ddl();const report=await applyMigrations(f.client,args(true),manifest,approved);assert.equal(report.replayed,true);assert.equal(report.releaseProvenanceRecorded,false);assert.equal(f.ddl(),ddl);assert.equal((await preflight(f.client,args(false,{'expect-state':'complete'}),manifest,approved)).schemaState,'complete');
});
test('exact replay rejects altered check semantics even if all three table names exist',async()=>{
 const f=fixture({present:3}),client={async query(sql){const result=await f.client.query(sql);if(sql===SQL.catalog)result.rows.find(row=>row.name===NEW_TABLES[0]).constraints[0].definition='CHECK (true)';return result}};
 await assert.rejects(applyMigrations(client,args(true),manifest,approved),/APPROVED_SCHEMA_MISMATCH/);assert.equal(f.ddl(),0);
});
test('CLI errors redact credentials and do not connect without explicit args; startup unchanged',()=>{
 assert.equal(safeError(Error('secret password account-id')),'OPERATION_FAILED');
 for(const file of ['admin-analytics-preflight.mjs','apply-admin-analytics-migrations.mjs']){const result=spawnSync(process.execPath,[new URL('../tools/'+file,import.meta.url).pathname],{env:{DATABASE_URL:'postgresql://secret:password@external.invalid/db'},encoding:'utf8',timeout:5000});assert.equal(result.status,1);assert.match(result.stderr,/MISSING_EXPLICIT_ARGUMENTS/);assert.doesNotMatch(result.stderr,/secret|password|external.invalid|ENOTFOUND/)}
 for(const file of ['server.js','package.json'])assert.doesNotMatch(readFileSync(new URL('../'+file,import.meta.url),'utf8'),/admin-analytics-preflight|apply-admin-analytics-migrations|admin-analytics-release-common/);
});
