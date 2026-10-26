import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {TARGET,CONFIRMATION,LEDGER,FLAGS,FILES,BASE_TABLES,NEW_TABLES,COLUMNS,SQL,parseArgs,validateRuntime,migrationStatements,loadManifest,schemaDigest,sha256,safeError} from '../tools/economy-release-common.mjs';
import {preflight} from '../tools/economy-preflight.mjs';
import {applyMigrations,CREATE_LEDGER} from '../tools/apply-economy-migrations.mjs';
const manifest=await loadManifest(),commit='a'.repeat(40),backup='render-export-20261026T103000Z';
const argv=(apply=false,extra={})=>Object.entries({'expect-service':TARGET.service,'expect-database':TARGET.database,'expect-major':'18','expect-commit':commit,'expect-version':'0',target:'005',...(apply?{'manifest-sha256':manifest.manifestSha256,'backup-reference':backup,confirm:CONFIRMATION}:{}),...extra}).flatMap(([key,value])=>['--'+key,value]);
const args=(apply=false,extra={})=>parseArgs(argv(apply,extra),apply);
const environment=()=>({RENDER:'true',RENDER_SERVICE_ID:TARGET.service,RENDER_SERVICE_TYPE:'web',RENDER_GIT_COMMIT:commit,RENDER_GIT_REPO_SLUG:TARGET.repo,IS_PULL_REQUEST:'false',DATABASE_URL:`postgresql://private-user:private-password@${TARGET.host}/${TARGET.database}`});
const goodConstraint=type=>({name:'constraint-'+type,type,definition:type,validated:true,deferrable:false,enforced:true});
function relation(name){
 const names=COLUMNS[name]?.split(' ')||(name==='hero_auction_wallets'?['account_id','gold']:name==='hero_auction_commanders'?['account_id','profile']:['account_id']);
 return {name,kind:'r',persistence:'p',rls:false,force_rls:false,can_select:true,can_insert:true,can_update:true,can_reference:true,user_triggers:0,
  columns:names.map(name=>({name,type:name==='account_id'?'text':name==='profile'?'jsonb':'integer',notnull:true,default:name==='magic_dust_cost'?'0':null})),
  constraints:[goodConstraint('p'),goodConstraint('f'),goodConstraint('c')],indexes:[{name:name==='hero_auction_victory_chest_intents'?'hero_auction_victory_chest_intents_room':name+'_pkey',valid:true,ready:true,definition:'local fixture index'}]};
}
function fixture({partial=false,completed=false,failDDL=0,lostCommit=false,mutatePreservation=false,permission=false,badConstraint=false,busy=false,wrongIdentity=false,nonempty=false}={}){
 let state={complete:completed,ledger:[],gold:{count:'3',digest:'1'.repeat(64)},commanders:{count:'2',digest:'2'.repeat(64)}},transaction=null,readOnly=false,ddl=0,committed=false;
 const calls=[];
 const catalog=()=>[...BASE_TABLES.map(relation),...(state.complete?NEW_TABLES.concat(LEDGER).map(relation):partial?[relation(NEW_TABLES[0])]:[])].sort((a,b)=>a.name.localeCompare(b.name));
 if(completed){const schema=schemaDigest(catalog());state.ledger=manifest.entries.map(e=>({version:e.version,filename:e.name,sha256:e.sha256,manifest_sha256:manifest.manifestSha256,release_commit:commit,backup_reference:backup,schema_sha256:schema,preservation_sha256:'3'.repeat(64)}));}
 const client={async query(query,values=[]){
  calls.push({query,values});
  if(query.startsWith('BEGIN ')){assert.equal(transaction,null);transaction=structuredClone(state);readOnly=query.endsWith('READ ONLY');return {rows:[]};}
  if(query.startsWith('SET LOCAL '))return {rows:[]};
  if(query==='ROLLBACK'){if(transaction){state=transaction;transaction=null;}return {rows:[]};}
  if(query==='COMMIT'){transaction=null;committed=true;if(lostCommit){lostCommit=false;throw Error('private-password unknown commit');}return {rows:[]};}
  if(query===SQL.identity)return {rows:[{database:wrongIdentity?'other':TARGET.database,version:'180001',schema:'public',replica:false,schema_usage:true,schema_create:true,read_only:readOnly?'on':'off',isolation:'repeatable read'}]};
  if(query===SQL.advisory)return {rows:[{locked:!busy}]};
  if(query===SQL.catalog){const rows=catalog();if(permission)rows[0].can_reference=false;if(badConstraint&&state.complete)rows.find(r=>r.name===NEW_TABLES[0]).constraints[0].validated=false;return {rows};}
  if(query===SQL.ledger)return {rows:structuredClone(state.ledger)};
  if(query===SQL.sequence)return {rows:[{permitted:true}]};
  if(query===SQL.activity)return {rows:[{unsettled_paid_rooms:'2',pending_chest_rooms:'0'}]};
  if(query.includes('economy-release:preserve-')){const key=query.includes('preserve-gold')?'gold':'commanders';return {rows:[structuredClone(state[key])]};}
  if(query===CREATE_LEDGER){assert.equal(readOnly,false);return {rows:[]};}
  if(query.startsWith('CREATE TABLE IF NOT EXISTS')||query.startsWith('ALTER TABLE')){
   assert.equal(readOnly,false);ddl++;if(ddl===failDDL)throw Object.assign(Error('private account query detail'),{code:'42501'});if(ddl===FILES.length){state.complete=true;if(mutatePreservation)state.gold.digest='9'.repeat(64);}return {rows:[]};
  }
  if(query.startsWith('/* economy-release:empty-new-table */'))return {rows:[{count:nonempty?'1':'0'}]};
  if(query.startsWith('/* economy-release:record */')){const [version,filename,hash,manifestHash,releaseCommit,backupReference,schemaHash,preservationHash]=values;state.ledger.push({version,filename,sha256:hash,manifest_sha256:manifestHash,release_commit:releaseCommit,backup_reference:backupReference,schema_sha256:schemaHash,preservation_sha256:preservationHash});return {rows:[]};}
  throw Error('Unexpected fixture query');
 }};
 return {client,calls,state:()=>structuredClone(state),get ddl(){return ddl},get committed(){return committed},setLedger(fn){fn(state.ledger)},catalog};
}

test('manifest pins five actual reviewed files and strips only their outer transactions',()=>{
 assert.equal(manifest.entries.length,5);assert.match(manifest.manifestSha256,/^[a-f0-9]{64}$/);
 assert.deepEqual(manifest.entries.map(e=>e.statements.length),[3,1,2,2,6]);
 for(const entry of manifest.entries){assert.equal(entry.sha256,sha256(readFileSync(new URL('../migrations/'+entry.name,import.meta.url))));assert.ok(entry.statements.every(s=>!/^BEGIN|^COMMIT/.test(s)));}
});
test('narrow lexer handles comments and SQL string semicolons without deleting inner text',()=>{
 const sql="-- BEGIN; comment\nBEGIN;\nCREATE TABLE IF NOT EXISTS hero_auction_diamond_wallets (account_id TEXT DEFAULT 'COMMIT; -- literal', diamonds INTEGER);\nCOMMIT; -- trailing";
 assert.equal(migrationStatements(sql).length,1);assert.match(migrationStatements(sql)[0],/'COMMIT; -- literal'/);
});
for(const [name,source] of [
 ['nested transaction','BEGIN; BEGIN; CREATE TABLE IF NOT EXISTS hero_auction_diamond_wallets(a INTEGER); COMMIT;'],
 ['early commit','BEGIN; CREATE TABLE IF NOT EXISTS hero_auction_diamond_wallets(a INTEGER); COMMIT; COMMIT;'],
 ['unwrapped SQL','CREATE TABLE IF NOT EXISTS hero_auction_diamond_wallets(a INTEGER);'],
 ['DML','BEGIN; UPDATE hero_auction_wallets SET gold=0; COMMIT;'],
 ['drop','BEGIN; DROP TABLE hero_auction_wallets; COMMIT;'],
 ['wrong create target','BEGIN; CREATE TABLE IF NOT EXISTS other_table(a INTEGER); COMMIT;'],
 ['CTAS','BEGIN; CREATE TABLE IF NOT EXISTS hero_auction_diamond_wallets(a INTEGER) AS SELECT 1; COMMIT;'],
 ['function body','BEGIN; DO $$ BEGIN END $$; COMMIT;'],
 ['block comment','BEGIN; /* COMMIT; */ CREATE TABLE IF NOT EXISTS hero_auction_diamond_wallets(a INTEGER); COMMIT;'],
 ['quote confusion',"BEGIN; CREATE TABLE IF NOT EXISTS hero_auction_diamond_wallets(a TEXT DEFAULT 'missing); COMMIT;"]
])test('migration lexer refuses '+name,()=>assert.throws(()=>migrationStatements(source)));

test('correct explicit Render runtime uses existing internal URL without ambient PG fallbacks',()=>{
 const env=environment(),config=validateRuntime({...env,PGHOST:'external.invalid',PGDATABASE:'other'},args());assert.equal(config.connectionString,env.DATABASE_URL);assert.match(config.options,/transaction_timeout=60000/);assert.equal(config.connectionTimeoutMillis,5000);
});
for(const [name,patch] of [
 ['outside Render',{RENDER:undefined}],['other service',{RENDER_SERVICE_ID:'srv-other'}],['other build',{RENDER_GIT_COMMIT:'b'.repeat(40)}],['preview',{IS_PULL_REQUEST:'true'}],['other repo',{RENDER_GIT_REPO_SLUG:'other/repo'}],
 ['external URL',{DATABASE_URL:`postgresql://u:p@${TARGET.host}.frankfurt-postgres.render.com/${TARGET.database}`}],['different database',{DATABASE_URL:`postgresql://u:p@${TARGET.host}/other`}],['query host override',{DATABASE_URL:`postgresql://u:p@${TARGET.host}/${TARGET.database}?host=external.invalid`}],['query options override',{DATABASE_URL:`postgresql://u:p@${TARGET.host}/${TARGET.database}?options=secret`}],['missing credentials',{DATABASE_URL:`postgresql://${TARGET.host}/${TARGET.database}`}]
])test('runtime refuses '+name+' before any connection',()=>assert.throws(()=>validateRuntime({...environment(),...patch},args())));
for(const flag of FLAGS)test('runtime refuses enabled '+flag,()=>assert.throws(()=>validateRuntime({...environment(),[flag]:'1'},args()),/FLAGS_MUST_BE_OFF/));
test('apply requires exact target, release commit, version, confirmation, digest and non-secret backup reference',()=>{
 for(const patch of [{'expect-service':'srv-other'},{'expect-database':'postgres'},{'expect-commit':'HEAD'},{'expect-major':'17'},{'expect-version':'5'},{target:'006'},{confirm:'yes'},{'manifest-sha256':'bad'},{'backup-reference':'https://secret-download-url'}])assert.throws(()=>parseArgs(argv(true,patch),true));
 assert.throws(()=>parseArgs([...argv(true),'--unknown','x'],true));assert.throws(()=>parseArgs([...argv(true),'--target','005'],true));
});
test('preflight only reads in a bounded repeatable-read/read-only transaction and emits aggregate proof',async()=>{
 const f=fixture(),result=await preflight(f.client,args(),manifest);assert.equal(result.readOnly,true);assert.equal(result.schemaVersion,0);assert.equal(result.backupVerified,false);assert.equal(result.activity.unsettled_paid_rooms,'2');assert.equal(result.preservation.gold.count,'3');assert.equal(f.ddl,0);assert.equal(f.calls.at(-1).query,'ROLLBACK');assert.ok(f.calls.every(c=>!/^(?:CREATE|ALTER|INSERT|UPDATE|DELETE|DROP)/.test(c.query)));assert.doesNotMatch(JSON.stringify(result),/private-password|account_id|connectionString/);
});
test('single outer transaction creates schema+ledger, proves no existing wallet or level changes',async()=>{
 const f=fixture(),result=await applyMigrations(f.client,args(true),manifest);assert.equal(result.status,'applied');assert.equal(result.preservedExistingData,true);assert.equal(result.flagsChanged,false);assert.equal(f.committed,true);assert.equal(f.state().ledger.length,5);assert.equal(f.ddl,5);assert.equal(f.calls.filter(c=>c.query.startsWith('BEGIN')).length,1);assert.equal(f.calls.filter(c=>c.query==='COMMIT').length,1);assert.ok(f.calls.filter(c=>c.query.startsWith('CREATE TABLE IF')).every(c=>!/^BEGIN;|\nCOMMIT;/m.test(c.query)));
});
test('lock contention refuses without writing',async()=>{const f=fixture({busy:true});await assert.rejects(applyMigrations(f.client,args(true),manifest),/ANOTHER_ECONOMY/);assert.equal(f.ddl,0);assert.equal(f.committed,false);});
for(const [name,options,pattern] of [
 ['untracked partial schema',{partial:true},/PARTIAL/],['missing REFERENCES privilege',{permission:true},/PERMISSION/],['wrong database',{wrongIdentity:true},/TARGET_MISMATCH/],['unvalidated constraint',{badConstraint:true},/UNVALIDATED/],['new table unexpectedly populated',{nonempty:true},/NOT_EMPTY/],['existing gold/profile changed',{mutatePreservation:true},/CHANGED/],['DDL error',{failDDL:3},/private account query detail/]
])test(name+' rolls back and never commits',async()=>{const f=fixture(options);await assert.rejects(applyMigrations(f.client,args(true),manifest),pattern);assert.equal(f.committed,false);assert.equal(f.state().complete,false);assert.equal(f.state().ledger.length,0);assert.equal(f.state().gold.digest,'1'.repeat(64));assert.equal(f.calls.at(-1).query,'ROLLBACK');});
test('reviewed digest mismatch fails before BEGIN',async()=>{const f=fixture();await assert.rejects(applyMigrations(f.client,args(true,{'manifest-sha256':'0'.repeat(64)}),manifest),/MANIFEST_MISMATCH/);assert.equal(f.calls.length,0);});
test('lost COMMIT reconciles exact durable ledger/schema without rerunning DDL',async()=>{
 const f=fixture({lostCommit:true});await assert.rejects(applyMigrations(f.client,args(true),manifest),/COMMIT_OUTCOME_UNKNOWN/);assert.equal(f.state().complete,true);assert.equal(f.state().ledger.length,5);const before=f.ddl;
 const result=await applyMigrations(f.client,args(true),manifest);assert.equal(result.status,'already_applied_verified');assert.equal(result.replayed,true);assert.equal(f.ddl,before);assert.equal(f.state().ledger.length,5);
 const checked=await preflight(f.client,args(false,{'expect-version':'5'}),manifest);assert.equal(checked.schemaVersion,5);
});
for(const field of ['sha256','schema_sha256','manifest_sha256','backup_reference','release_commit','preservation_sha256'])test('replay refuses altered '+field,async()=>{
 const f=fixture({completed:true});f.setLedger(rows=>rows[0][field]='0'.repeat(field==='release_commit'?40:64));await assert.rejects(applyMigrations(f.client,args(true),manifest));assert.equal(f.ddl,0);
});
test('read-only preflight refuses a different expected version',async()=>{const f=fixture({completed:true});await assert.rejects(preflight(f.client,args(),manifest),/EXPECTED_SCHEMA_VERSION/);assert.equal(f.ddl,0);});
test('CLI failures redact raw database/credential/account errors',()=>{
 assert.equal(safeError(Error('postgres://user:password@private account_id=42')),'OPERATION_FAILED');assert.equal(safeError({code:'42501',message:'private account detail'}),'DATABASE_ERROR_42501');
 for(const file of ['economy-preflight.mjs','apply-economy-migrations.mjs']){
  const child=spawnSync(process.execPath,[new URL('../tools/'+file,import.meta.url).pathname],{env:{...process.env,DATABASE_URL:'postgresql://unprinted:secret@example.invalid/private'},encoding:'utf8',timeout:5000});assert.equal(child.status,1);assert.match(child.stderr,/MISSING_EXPLICIT_ARGUMENTS/);assert.doesNotMatch(child.stderr,/secret|example.invalid|ENOTFOUND|ECONN|password/);
 }
});
test('operator tools are not wired to startup, npm or Render deploy configuration',()=>{
 for(const file of ['server.js','package.json'])assert.doesNotMatch(readFileSync(new URL('../'+file,import.meta.url),'utf8'),/economy-preflight|apply-economy-migrations|economy-release-common/);
});
