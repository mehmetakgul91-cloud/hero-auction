// Disposable PG18 network tests only. Runtime production-identity checks are
// separately unit-tested; this adapter substitutes only identity fields after
// asserting the actual loopback fixture, leaving every schema/data SQL real.
import assert from 'node:assert/strict';
import pg from 'pg';
import {TARGET,SQL,TABLE,CONFIRMATION,loadRelease,operate,readCatalog,schemaDigest} from './campaign-release-common.mjs';
const url='postgresql://test:test@127.0.0.1:55432/hero_campaign_test';
if(Object.keys(process.env).some(k=>k==='DATABASE_URL'||/^PG[A-Z_]*$/.test(k))||process.env.HERO_CAMPAIGN_TEST_DB!==url)throw Error('Refusing non-disposable campaign operator fixture.');
const c=new pg.Client({connectionString:url,ssl:false,connectionTimeoutMillis:5000});let fixture=false;
try{
 await c.connect();const who=(await c.query("SELECT current_database() AS db,current_user AS role,current_setting('server_version_num') AS version")).rows[0];
 assert.equal(who.db,'hero_campaign_test');assert.equal(who.role,'test');assert.ok(Number(who.version)>=180000&&Number(who.version)<190000);
 assert.equal((await readCatalog(c)).length,0,'fixture public schema must be empty');
 await c.query("CREATE TABLE hero_auction_wallets(account_id TEXT PRIMARY KEY,gold INTEGER NOT NULL DEFAULT 500 CHECK(gold>=0)); INSERT INTO hero_auction_wallets VALUES('guest:fixture',777)");fixture=true;
 const client={query:async(sql,...args)=>{const result=await c.query(sql,...args);if(sql===SQL.identity){const row=result.rows[0];assert.equal(row.database,'hero_campaign_test');assert.equal(row.role,'test');return {rows:[{...row,database:TARGET.database,role:TARGET.owner,session_role:TARGET.owner,owner:TARGET.owner}]};}return result;}};
 const release=await loadRelease(),args={'expect-service':TARGET.service,'expect-database':TARGET.database,'expect-owner':TARGET.owner,'expect-major':'18','expect-commit':'a'.repeat(40),'expect-state':'absent'};
 const apply={...args,'manifest-sha256':release.manifestSha256,'schema-sha256':release.approved.schemaSha256,'backup-reference':'fixture-backup-only',confirm:CONFIRMATION};
 assert.equal((await operate(client,args,release)).schemaState,'absent');
 const baseline=schemaDigest(await readCatalog(c));
 // A post-DDL verification failure must roll back the entire new schema.
 const corrupt={...release,approved:{...release.approved,schemaSha256:'0'.repeat(64)}};
 await assert.rejects(operate(client,{...apply,'schema-sha256':'0'.repeat(64)},corrupt,true));assert.equal(schemaDigest(await readCatalog(c)),baseline);
 const blocker=new pg.Client({connectionString:url,ssl:false,connectionTimeoutMillis:5000});
 await blocker.connect();try{await blocker.query('BEGIN; SELECT pg_advisory_xact_lock(724910,12)');await assert.rejects(operate(client,apply,release,true));assert.equal(schemaDigest(await readCatalog(c)),baseline);}finally{await blocker.query('ROLLBACK');await blocker.end();}
 const applied=await operate(client,apply,release,true);assert.equal(applied.status,'applied');assert.equal(applied.tablesCreated.length,1);
 assert.equal((await c.query('SELECT gold FROM hero_auction_wallets')).rows[0].gold,777);
 assert.equal((await operate(client,{...args,'expect-state':'complete'},release)).schemaState,'complete');
 assert.equal((await operate(client,apply,release,true)).status,'already_present_exact_schema_verified');
 await c.query('ALTER TABLE '+TABLE+' ADD COLUMN unexpected TEXT');await assert.rejects(operate(client,{...args,'expect-state':'complete'},release));await assert.rejects(operate(client,apply,release,true));await c.query('ALTER TABLE '+TABLE+' DROP COLUMN unexpected');
 assert.equal((await operate(client,{...args,'expect-state':'complete'},release)).schemaState,'complete');
 console.log('PASS PG18 campaign012 operator: read-only preflight, atomic apply, advisory contention refusal, forced rollback, exact replay, mismatch refusal, unchanged wallet/schema proof.');
}finally{if(fixture){await c.query('ROLLBACK').catch(()=>{});await c.query('DROP TABLE IF EXISTS '+TABLE+'; DROP TABLE hero_auction_wallets').catch(()=>{});}await c.end();}
