// Genuine operator SQL/transaction tests. ONLY an empty disposable PostgreSQL18
// at the exact loopback fixture below. Never calls the production CLI/connect()
// or relaxes its Render/internal-host identity checks. No DROP DATABASE/SCHEMA.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {preflight} from './economy-preflight.mjs';
import {applyMigrations} from './apply-economy-migrations.mjs';
import {TARGET,CONFIRMATION,LEDGER,FLAGS,BASE_TABLES,NEW_TABLES,SQL,loadManifest,parseArgs,readCatalog,schemaDigest,preservation,safeError} from './economy-release-common.mjs';

export const DISPOSABLE_URL='postgresql://test:test@127.0.0.1:5432/hero_auction_db';
export const DISPOSABLE_CONFIRMATION='CREATE_DISPOSABLE_OPERATOR_FIXTURE';
export function guardDisposableEnvironment(env){
 if(env.HERO_ECONOMY_RELEASE_TEST_DB!==DISPOSABLE_URL||env.HERO_ECONOMY_RELEASE_TEST_CONFIRM!==DISPOSABLE_CONFIRMATION||
    !['normal','lost-commit'].includes(env.HERO_ECONOMY_RELEASE_TEST_COMMIT_RESPONSE)||
    Object.keys(env).some(key=>key==='DATABASE_URL'||/^RENDER(?:_|$)/.test(key)||/^PG[A-Z_]*$/.test(key))||
    FLAGS.some(key=>env[key]!==undefined&&env[key]!==''&&env[key]!=='0')){
  throw Object.assign(Error('EXACT_DISPOSABLE_LOOPBACK_ENVIRONMENT_REQUIRED'),{safeCode:'EXACT_DISPOSABLE_LOOPBACK_ENVIRONMENT_REQUIRED'});
 }
 return env.HERO_ECONOMY_RELEASE_TEST_COMMIT_RESPONSE;
}

export async function main(env=process.env){
 // Guard BEFORE importing pg, opening a socket, creating a pool, or reading any
 // ambient connection credentials. The fixed config does not use the URL parser.
 let responseMode;try{responseMode=guardDisposableEnvironment(env);}catch(error){console.error('REFUSED: '+safeError(error)+'. No connection attempted.');return 1;}
 const {default:pg}=await import('pg');
 const config={host:'127.0.0.1',port:5432,database:'hero_auction_db',user:'test',password:'test',ssl:false,
  connectionTimeoutMillis:5000,query_timeout:15000,application_name:'hero-disposable-operator-integration',
  options:'-c search_path=public -c statement_timeout=10000 -c lock_timeout=2000 -c idle_in_transaction_session_timeout=15000 -c transaction_timeout=60000'};
 const client=new pg.Client(config),locker=new pg.Client(config);
 client.on('notice',()=>{});client.on('error',()=>{});locker.on('error',()=>{});
 const deadline=setTimeout(()=>{console.error('FAIL: DISPOSABLE_INTEGRATION_DEADLINE');process.exit(1);},120000);deadline.unref();
 let passed=0;
 const check=async(name,run)=>{await run();console.log('PASS '+name);passed++;};
 const sql=(text,values=[])=>client.query(text,values);
 // Each adapter delegates every database operation to real PostgreSQL. Faults
 // are actual SQL failures or a deliberately lost reply AFTER real COMMIT.
 const observe=(hook=async()=>{})=>({calls:[],async query(text,values){this.calls.push(text);const result=await client.query(text,values);await hook(text,result);return result;}});
 try{
  await client.connect();
  const identity=(await sql("SELECT current_database() AS database,current_user AS role,current_schema() AS schema,inet_server_port() AS port,current_setting('server_version_num') AS version,pg_is_in_recovery() AS replica")).rows[0];
  assert.equal(identity.database,'hero_auction_db');assert.equal(identity.role,'test');assert.equal(identity.schema,'public');assert.equal(identity.port,5432);assert.equal(identity.replica,false);
  assert.ok(Number(identity.version)>=180000&&Number(identity.version)<190000,'REFUSED: PostgreSQL18 required');
  const objects=(await sql("SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%' AND c.relkind IN ('r','p','v','m','f','S')")).rows[0].count;
  assert.equal(objects,0,'REFUSED: dedicated database must be empty; no drop/reset attempted');
  console.log('Verified empty disposable PostgreSQL '+identity.version+'; response scenario '+responseMode+'.');
  await sql(`CREATE TABLE hero_auction_wallets(account_id TEXT PRIMARY KEY,gold INTEGER NOT NULL DEFAULT 500 CHECK(gold>=0));
   CREATE TABLE hero_auction_user_profiles(account_id TEXT PRIMARY KEY,display_name TEXT NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
   CREATE TABLE hero_auction_commanders(account_id TEXT PRIMARY KEY,profile JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
   CREATE TABLE hero_auction_gold_awards(award_id TEXT PRIMARY KEY,account_id TEXT NOT NULL,amount INTEGER NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
   CREATE TABLE hero_auction_rooms(code VARCHAR(3) PRIMARY KEY,state JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
   INSERT INTO hero_auction_wallets(account_id,gold) VALUES('operator-fixture-zero',0),('operator-fixture-grandfather',12345),('operator-fixture-max',2147483647);
   INSERT INTO hero_auction_user_profiles(account_id,display_name) SELECT account_id,'Synthetic operator fixture' FROM hero_auction_wallets;
   INSERT INTO hero_auction_commanders(account_id,profile) VALUES('operator-fixture-grandfather','{"version":1,"commanderId":"attack","levels":{"attack":16,"magic":30},"fixture":"preserve exactly"}'),('operator-fixture-zero','{"version":1,"commanderId":"defense","levels":{"defense":0}}');
   INSERT INTO hero_auction_gold_awards(award_id,account_id,amount) VALUES('operator-fixture-old-award','operator-fixture-grandfather',120);
   INSERT INTO hero_auction_rooms(code,state) VALUES('101','{"entryPaid":true,"phase":"auction","mode":"friend"}'),('102','{"entryPaid":true,"phase":"finished","matchSettled":false,"victoryChestPending":true}'),('103','{"entryPaid":true,"phase":"auction","mode":"bot"}'),('104','{"entryPaid":true,"phase":"finished","matchSettled":true}');`);
  const manifest=await loadManifest(),commit='a'.repeat(40),backup='disposable-export-fixture-20261026';
  const args=(apply=false,version='0')=>parseArgs(Object.entries({'expect-service':TARGET.service,'expect-database':TARGET.database,'expect-major':'18','expect-commit':commit,'expect-version':version,target:'005',...(apply?{'manifest-sha256':manifest.manifestSha256,'backup-reference':backup,confirm:CONFIRMATION}:{})}).flatMap(([key,value])=>['--'+key,value]),apply);
  const bodies=manifest.entries.map(entry=>entry.statements.join(';\n')+';');
  const baseline=await preservation(client),baseSchema=schemaDigest(await readCatalog(client));
  // Includes non-wallet baseline data as an independent extra preservation check.
  const baseRows=async()=>{const rows={};for(const name of BASE_TABLES)rows[name]=(await sql('SELECT to_jsonb(t) AS row FROM public.'+name+' t ORDER BY to_jsonb(t)::text')).rows;return rows;};
  const originalRows=await baseRows();
  const assertClean=async()=>{assert.equal(schemaDigest(await readCatalog(client)),baseSchema);assert.deepEqual(await preservation(client),baseline);assert.deepEqual(await baseRows(),originalRows);assert.equal((await sql("SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname=ANY($1::text[])",[NEW_TABLES.concat(LEDGER)])).rows[0].count,0);};

  await check('schema0 read-only preflight executes real catalog/hash/activity SQL without writes',async()=>{
   const db=observe(),report=await preflight(db,args(),manifest);assert.equal(report.readOnly,true);assert.equal(report.schemaVersion,0);assert.equal(report.backupVerified,false);assert.deepEqual(report.preservation,baseline);assert.deepEqual(report.activity,{unsettled_paid_rooms:'2',pending_chest_rooms:'1'});
   assert.equal(report.preservation.gold.count,'3');assert.equal(report.preservation.commanders.count,'2');assert.ok(db.calls.every(text=>!/^(?:CREATE|ALTER|INSERT|UPDATE|DELETE|DROP)/.test(text)));assert.equal(db.calls.at(-1),'ROLLBACK');await assertClean();
  });
  await check('PostgreSQL itself enforces the preflight read-only transaction',async()=>{
   const db=observe(async text=>{if(text===SQL.identity)await sql("UPDATE hero_auction_wallets SET gold=gold WHERE account_id='operator-fixture-zero'");});
   await assert.rejects(preflight(db,args(),manifest),error=>error.code==='25006');await assertClean();
  });
  await check('wrong baseline column type is refused by both operator functions',async()=>{
   await sql('ALTER TABLE hero_auction_wallets ALTER COLUMN gold TYPE BIGINT');
   try{await assert.rejects(preflight(client,args(),manifest),/BASE_COLUMNS_INCOMPATIBLE/);await assert.rejects(applyMigrations(client,args(true),manifest),/BASE_COLUMNS_INCOMPATIBLE/);}finally{await sql('ALTER TABLE hero_auction_wallets ALTER COLUMN gold TYPE INTEGER');}
   await assertClean();
  });
  await check('untracked partial economy schema is refused, never adopted or overwritten',async()=>{
   // This is the only table DROP: this exact empty table was created by this
   // test after the empty-database guard, and has no dependants or user data.
   await sql('CREATE TABLE hero_auction_diamond_wallets(account_id TEXT PRIMARY KEY)');
   try{await assert.rejects(preflight(client,args(),manifest),/UNTRACKED_OR_PARTIAL/);await assert.rejects(applyMigrations(client,args(true),manifest),/UNTRACKED_OR_PARTIAL/);}finally{await sql('DROP TABLE hero_auction_diamond_wallets');}
   await assertClean();
  });
  await check('unvalidated real constraint is refused before migration',async()=>{
   await sql('ALTER TABLE hero_auction_wallets ADD CONSTRAINT operator_fixture_not_valid CHECK(gold>=0) NOT VALID');
   try{await assert.rejects(applyMigrations(client,args(true),manifest),/UNVALIDATED_CONSTRAINT_OR_INDEX/);}finally{await sql('ALTER TABLE hero_auction_wallets DROP CONSTRAINT operator_fixture_not_valid');}
   await assertClean();
  });
  await check('real competing transaction advisory lock refuses without DDL',async()=>{
   await locker.connect();await locker.query('BEGIN');await locker.query('SELECT pg_advisory_xact_lock(724910,5)');
   try{const db=observe();await assert.rejects(applyMigrations(db,args(true),manifest),/ANOTHER_ECONOMY_MIGRATION/);assert.ok(!db.calls.some(text=>text.includes('CREATE TABLE')));}finally{await locker.query('ROLLBACK');}
   await assertClean();
  });
  await check('actual SQL failure after migration003 rolls back all preceding DDL and ledger',async()=>{
   const db=observe(async text=>{if(text===bodies[2])await sql('SELECT 1/0');});await assert.rejects(applyMigrations(db,args(true),manifest),error=>error.code==='22012');assert.equal(db.calls.at(-1),'ROLLBACK');await assertClean();
  });
  await check('changed existing gold/profile triggers preservation refusal and real rollback',async()=>{
   const db=observe(async text=>{if(text===bodies[4])await sql("UPDATE hero_auction_wallets SET gold=gold+1 WHERE account_id='operator-fixture-grandfather'; UPDATE hero_auction_commanders SET profile=jsonb_set(profile,'{levels,attack}','17') WHERE account_id='operator-fixture-grandfather';");});
   await assert.rejects(applyMigrations(db,args(true),manifest),/EXISTING_WALLET_OR_PROFILE_CHANGED/);await assertClean();
  });
  await check('actual SQL failure while recording the manifest rolls back all five migrations',async()=>{
   let records=0;const db=observe(async text=>{if(text.startsWith('/* economy-release:record */')&&++records===2)await sql('SELECT 1/0');});await assert.rejects(applyMigrations(db,args(true),manifest),error=>error.code==='22012');assert.equal(records,2);await assertClean();
  });
  await check('all001–005 and five proof rows commit once with original balances and levels unchanged',async()=>{
   const db=observe(async text=>{if(text==='COMMIT'&&responseMode==='lost-commit')throw Error('Injected lost reply after durable fixture COMMIT');});
   if(responseMode==='lost-commit')await assert.rejects(applyMigrations(db,args(true),manifest),/COMMIT_OUTCOME_UNKNOWN_RUN_READ_ONLY_PREFLIGHT/);
   else{const result=await applyMigrations(db,args(true),manifest);assert.equal(result.status,'applied');assert.equal(result.preservedExistingData,true);assert.deepEqual(result.preservation,baseline);}
   assert.equal(db.calls.filter(text=>text.startsWith('BEGIN ')).length,1);assert.equal(db.calls.filter(text=>text==='COMMIT').length,1);for(const body of bodies)assert.equal(db.calls.filter(text=>text===body).length,1);
   assert.equal((await sql('SELECT count(*)::int AS count FROM '+LEDGER)).rows[0].count,5);for(const name of NEW_TABLES)assert.equal((await sql('SELECT count(*)::int AS count FROM '+name)).rows[0].count,0);
   assert.deepEqual(await preservation(client),baseline);assert.deepEqual(await baseRows(),originalRows);
  });
  await check('postflight and exact ledger replay verify durable schema without any DDL or new credit',async()=>{
   const report=await preflight(client,args(false,'5'),manifest);assert.equal(report.schemaVersion,5);assert.deepEqual(report.preservation,baseline);
   const db=observe(),replay=await applyMigrations(db,args(true),manifest);assert.equal(replay.status,'already_applied_verified');assert.equal(replay.replayed,true);assert.ok(!db.calls.some(text=>/CREATE TABLE|ALTER TABLE|INSERT INTO/.test(text)));assert.equal(db.calls.at(-1),'ROLLBACK');assert.equal((await sql('SELECT count(*)::int AS count FROM '+LEDGER)).rows[0].count,5);assert.deepEqual(await baseRows(),originalRows);
  });
  await check('tracked schema drift and changed ledger hashes both fail closed',async()=>{
   await sql('ALTER TABLE hero_auction_magic_dust_wallets ADD COLUMN operator_fixture_extra INTEGER');
   try{await assert.rejects(preflight(client,args(false,'5'),manifest),/NEW_COLUMNS_INCOMPATIBLE/);await assert.rejects(applyMigrations(client,args(true),manifest),/NEW_COLUMNS_INCOMPATIBLE/);}finally{await sql('ALTER TABLE hero_auction_magic_dust_wallets DROP COLUMN operator_fixture_extra');}
   await sql('UPDATE '+LEDGER+' SET sha256=$1 WHERE version=3',['0'.repeat(64)]);
   try{await assert.rejects(preflight(client,args(false,'5'),manifest),/MIGRATION_LEDGER_MISMATCH/);await assert.rejects(applyMigrations(client,args(true),manifest),/MIGRATION_LEDGER_MISMATCH/);}finally{await sql('UPDATE '+LEDGER+' SET sha256=$1 WHERE version=3',[manifest.entries[2].sha256]);}
   assert.equal((await preflight(client,args(false,'5'),manifest)).schemaVersion,5);assert.deepEqual(await baseRows(),originalRows);
  });
  console.log(`PASS ${passed} real PostgreSQL18 operator groups (${responseMode}); manifest ${manifest.manifestSha256}.`);
  console.log('Synthetic fixture only. Not production preflight, backup verification, release approval or activation.');
  return 0;
 }catch(error){console.error('FAIL disposable operator integration:',error.stack||safeError(error));return 1;}
 finally{await Promise.allSettled([client.end(),locker.end()]);clearTimeout(deadline);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)process.exitCode=await main();
