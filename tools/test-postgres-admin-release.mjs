// Real PostgreSQL18 operator tests. Exact empty loopback fixture only. The
// production CLI runtime guard is never bypassed or relaxed for testing.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {preflight} from './admin-analytics-preflight.mjs';
import {applyMigrations} from './apply-admin-analytics-migrations.mjs';
import {TARGET,FLAGS,NEW_TABLES,CONFIRMATION,SQL,parseArgs,loadManifest,loadApprovedSchema,readCatalog,schemaDigest,preservation,safeError} from './admin-analytics-release-common.mjs';
export const DISPOSABLE_URL='postgresql://hero_auction_db_user:test@127.0.0.1:55433/hero_auction_db';
export const DISPOSABLE_CONFIRMATION='CREATE_DISPOSABLE_ADMIN_OPERATOR_FIXTURE';
export function guardDisposableEnvironment(env){
 if(env.HERO_ADMIN_RELEASE_TEST_DB!==DISPOSABLE_URL||env.HERO_ADMIN_RELEASE_TEST_CONFIRM!==DISPOSABLE_CONFIRMATION||!['normal','lost-commit'].includes(env.HERO_ADMIN_RELEASE_TEST_COMMIT_RESPONSE)||
 Object.keys(env).some(key=>key==='DATABASE_URL'||/^RENDER(?:_|$)/.test(key)||/^PG[A-Z_]*$/.test(key))||FLAGS.some(key=>env[key]!==undefined&&env[key]!==''&&env[key]!=='0'))throw Object.assign(Error('EXACT_DISPOSABLE_LOOPBACK_ENVIRONMENT_REQUIRED'),{safeCode:'EXACT_DISPOSABLE_LOOPBACK_ENVIRONMENT_REQUIRED'});
 return env.HERO_ADMIN_RELEASE_TEST_COMMIT_RESPONSE;
}
export async function main(env=process.env){
 let mode;try{mode=guardDisposableEnvironment(env)}catch(error){console.error('REFUSED: '+safeError(error)+'. No connection attempted.');return 1}
 const {default:pg}=await import('pg');
 const config={host:'127.0.0.1',port:55433,database:TARGET.database,user:TARGET.owner,password:'test',ssl:false,connectionTimeoutMillis:5000,query_timeout:15000,
 application_name:'hero-disposable-admin-operator-test',options:'-c search_path=public -c statement_timeout=10000 -c lock_timeout=2000 -c idle_in_transaction_session_timeout=15000 -c transaction_timeout=60000'};
 const client=new pg.Client(config),locker=new pg.Client(config);for(const connection of [client,locker]){connection.on('notice',()=>{});connection.on('error',()=>{})}
 const deadline=setTimeout(()=>{console.error('FAIL disposable operator deadline');process.exit(1)},120000);deadline.unref();
 let passed=0;const check=async(name,run)=>{await run();passed++;console.log('PASS '+name)};
 const observe=(hook=async()=>{})=>({calls:[],async query(sql,values){this.calls.push(sql);const result=await client.query(sql,values);await hook(sql,result);return result}});
 try{
  await client.connect();
  const identity=(await client.query("SELECT current_database() AS database,current_user AS role,current_schema() AS schema,inet_server_port() AS port,current_setting('server_version_num') AS version,(SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) AS owner")).rows[0];
  assert.equal(identity.database,TARGET.database);assert.equal(identity.role,TARGET.owner);assert.equal(identity.owner,TARGET.owner);assert.equal(identity.schema,'public');assert.ok([5432,55433].includes(identity.port),'Exact loopback client port55433 may map to PostgreSQL internal5432 in CI');assert.ok(Number(identity.version)>=180000&&Number(identity.version)<190000);
  const count=(await client.query("SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%' AND c.relkind IN ('r','p','v','m','f','S')")).rows[0].count;
  assert.equal(count,0,'REFUSED: dedicated fixture database is not empty; no reset/drop attempted');
  console.log('Verified empty disposable PostgreSQL '+identity.version+'; mode '+mode+'.');
  await client.query(`CREATE TABLE hero_auction_wallets(account_id TEXT PRIMARY KEY,gold INTEGER NOT NULL DEFAULT 500 CHECK(gold>=0));
   CREATE TABLE hero_auction_user_profiles(account_id TEXT PRIMARY KEY,display_name TEXT NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
   CREATE TABLE hero_auction_commanders(account_id TEXT PRIMARY KEY,profile JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
   CREATE TABLE hero_auction_rooms(code VARCHAR(3) PRIMARY KEY,state JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`);
  for(const name of ['001-paid-diamonds-foundation.sql','002-diamond-exchange.sql','003-diamond-signup-bonus.sql','004-login-rewards.sql','005-victory-chests-magic-dust.sql'])await client.query(await readFile(new URL('../migrations/'+name,import.meta.url),'utf8'));
  await client.query(`INSERT INTO hero_auction_wallets(account_id,gold) VALUES('admin-operator-fixture',12345),('admin-zero-fixture',0);
   INSERT INTO hero_auction_user_profiles(account_id,display_name) SELECT account_id,'Synthetic fixture' FROM hero_auction_wallets;
   INSERT INTO hero_auction_commanders(account_id,profile) VALUES('admin-operator-fixture','{"version":1,"fixture":"unchanged","level":20}');
   INSERT INTO hero_auction_diamond_wallets(account_id,diamonds) VALUES('admin-operator-fixture',25);
   INSERT INTO hero_auction_magic_dust_wallets(account_id,magic_dust) VALUES('admin-operator-fixture',40);
   INSERT INTO hero_auction_rooms(code,state) VALUES('101','{"phase":"waiting","fixture":true}');`);
  const manifest=await loadManifest(),approved=await loadApprovedSchema(),commit='a'.repeat(40);
  const args=(apply=false,state='absent')=>parseArgs(Object.entries({'expect-service':TARGET.service,'expect-database':TARGET.database,'expect-owner':TARGET.owner,'expect-major':'18','expect-commit':commit,'expect-state':state,...(apply?{'manifest-sha256':manifest.manifestSha256,'schema-sha256':approved.schemaSha256,'backup-reference':'disposable-admin-backup-reference',confirm:CONFIRMATION}:{})}).flatMap(([key,value])=>['--'+key,value]),apply);
  const original=await readCatalog(client),originalSchema=schemaDigest(original),originalData=await preservation(client,original),bodies=manifest.entries.map(entry=>entry.statements.join(';\n')+';');
  const assertClean=async()=>{assert.equal(schemaDigest(await readCatalog(client)),originalSchema);assert.deepEqual(await preservation(client,await readCatalog(client)),originalData);assert.ok((await readCatalog(client)).every(row=>!NEW_TABLES.includes(row.name)))};
  await check('read-only preflight executes actual owner/catalog/preservation SQL without writes',async()=>{
   const db=observe(),report=await preflight(db,args(),manifest,approved);assert.equal(report.readOnly,true);assert.equal(report.schemaState,'absent');assert.equal(report.backupVerified,false);assert.deepEqual(report.preservation,originalData);assert.ok(db.calls.every(sql=>!/^(CREATE|ALTER|INSERT|UPDATE|DELETE|DROP)/.test(sql)));await assertClean();
  });
  await check('PostgreSQL enforces read-only preflight itself',async()=>{
   const db=observe(async sql=>{if(sql===SQL.identity)await client.query("UPDATE hero_auction_wallets SET gold=gold WHERE account_id='admin-operator-fixture'")});await assert.rejects(preflight(db,args(),manifest,approved),error=>error.code==='25006');await assertClean();
  });
  await check('partial untracked schema is refused, never completed automatically',async()=>{
   await client.query('CREATE TABLE hero_auction_admin_wallet_credits(request_id TEXT PRIMARY KEY)');
   try{await assert.rejects(applyMigrations(client,args(true),manifest,approved),/PARTIAL_ADMIN_ANALYTICS_SCHEMA/)}finally{await client.query('DROP TABLE hero_auction_admin_wallet_credits')}
   await assertClean();
  });
  await check('competing advisory lock refuses without DDL',async()=>{
   await locker.connect();await locker.query('BEGIN');await locker.query('SELECT pg_advisory_xact_lock(724910,7)');
   try{const db=observe();await assert.rejects(applyMigrations(db,args(true),manifest,approved),/ANOTHER_ADMIN_ANALYTICS/);assert.ok(!db.calls.some(sql=>sql.startsWith('CREATE')))}finally{await locker.query('ROLLBACK')}
   await assertClean();
  });
  await check('real SQL fault after006 rolls back all preceding DDL and indexes',async()=>{
   const db=observe(async sql=>{if(sql===bodies[0])await client.query('SELECT 1/0')});await assert.rejects(applyMigrations(db,args(true),manifest,approved),error=>error.code==='22012');await assertClean();
  });
  await check('wallet/profile/dust mutation in migration transaction is detected and rolled back',async()=>{
   const db=observe(async sql=>{if(sql===bodies[1])await client.query("UPDATE hero_auction_wallets SET gold=gold+1 WHERE account_id='admin-operator-fixture'; UPDATE hero_auction_magic_dust_wallets SET magic_dust=magic_dust+1; UPDATE hero_auction_commanders SET profile=jsonb_set(profile,'{level}','21');")});
   await assert.rejects(applyMigrations(db,args(true),manifest,approved),/PREEXISTING_DATA_CHANGED/);await assertClean();
  });
  await check('preexisting schema alteration is detected and rolled back',async()=>{
   const db=observe(async sql=>{if(sql===bodies[1])await client.query('ALTER TABLE hero_auction_wallets ADD COLUMN fixture_bad INTEGER')});await assert.rejects(applyMigrations(db,args(true),manifest,approved),/PREEXISTING_SCHEMA_CHANGED/);await assertClean();
  });
  await check('exact006/007 creates only three empty tables and preserves every old table',async()=>{
   const db=observe(async sql=>{if(sql==='COMMIT'&&mode==='lost-commit')throw Error('Injected reply loss after durable COMMIT')});
   if(mode==='lost-commit')await assert.rejects(applyMigrations(db,args(true),manifest,approved),/COMMIT_OUTCOME_UNKNOWN_RUN_READ_ONLY_PREFLIGHT/);
   else{const result=await applyMigrations(db,args(true),manifest,approved);assert.equal(result.status,'applied');assert.deepEqual(result.preservation,originalData);assert.equal(result.flagsChanged,false)}
   const catalog=await readCatalog(client);assert.equal(catalog.length,original.length+3);assert.equal(schemaDigest(catalog.filter(row=>NEW_TABLES.includes(row.name))),approved.schemaSha256);assert.equal(schemaDigest(catalog.filter(row=>!NEW_TABLES.includes(row.name))),originalSchema);assert.deepEqual(await preservation(client,catalog),originalData);
   for(const name of NEW_TABLES)assert.equal((await client.query('SELECT count(*)::int AS count FROM public.'+name)).rows[0].count,0);
   assert.equal(db.calls.filter(sql=>sql==='COMMIT').length,1);assert.ok(!db.calls.some(sql=>/CREATE TABLE.*migration|ALTER TABLE|INSERT INTO/i.test(sql)));
  });
  await check('postflight and lost-response replay validate exact catalog without new DDL or ledger',async()=>{
   const report=await preflight(client,args(false,'complete'),manifest,approved);assert.equal(report.schemaState,'complete');assert.equal(report.releaseProvenanceRecorded,false);
   const db=observe(),replay=await applyMigrations(db,args(true),manifest,approved);assert.equal(replay.replayed,true);assert.ok(db.calls.every(sql=>!/^CREATE|^ALTER|^INSERT/.test(sql)));assert.deepEqual(await preservation(client,await readCatalog(client)),originalData);
  });
  await check('all-three-names schema drift is rejected instead of adopted',async()=>{
   await client.query('ALTER TABLE hero_auction_player_sessions ADD COLUMN fixture_unapproved INTEGER');
   try{await assert.rejects(preflight(client,args(false,'complete'),manifest,approved),/APPROVED_SCHEMA_MISMATCH/);await assert.rejects(applyMigrations(client,args(true),manifest,approved),/APPROVED_SCHEMA_MISMATCH/)}finally{await client.query('ALTER TABLE hero_auction_player_sessions DROP COLUMN fixture_unapproved')}
   assert.equal((await preflight(client,args(false,'complete'),manifest,approved)).schemaState,'complete');
  });
  console.log(`PASS ${passed} real PostgreSQL admin release groups (${mode}); manifest ${manifest.manifestSha256}; schema ${approved.schemaSha256}.`);
  console.log('Synthetic fixture only; not production backup verification, migration or activation.');return 0;
 }catch(error){console.error('FAIL disposable admin operator:',error.stack||safeError(error));return 1}finally{await Promise.allSettled([client.end(),locker.end()]);clearTimeout(deadline)}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)process.exitCode=await main();
