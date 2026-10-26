import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

const script=new URL('../tools/test-postgres-victory-chests.mjs',import.meta.url);
for(const [name,values] of [
 ['unset',{HERO_VICTORY_CHEST_TEST_DB:'',DATABASE_URL:''}],
 ['remote',{HERO_VICTORY_CHEST_TEST_DB:'postgresql://test:test@example.invalid:5432/hero_victory_chests_test',DATABASE_URL:''}],
 ['wrong database',{HERO_VICTORY_CHEST_TEST_DB:'postgresql://test:test@127.0.0.1:5432/postgres',DATABASE_URL:''}],
 ['ambient production-style URL',{HERO_VICTORY_CHEST_TEST_DB:'postgresql://test:test@127.0.0.1:5432/hero_victory_chests_test',DATABASE_URL:'postgresql://unused.invalid/never-connect'}]
])test(`disposable victory PostgreSQL harness refuses ${name} before connecting`,()=>{
 const result=spawnSync(process.execPath,[script.pathname],{env:{...process.env,...values},encoding:'utf8',timeout:5000});
 assert.equal(result.status,1,result.stderr);assert.match(result.stderr,/REFUSED.*No connection attempted/);assert.doesNotMatch(result.stderr,/ECONN|ENOTFOUND|authentication|password/i);
});
test('harness hardcodes loopback fixtures, checks empty PG18 and never drops/reset databases',()=>{
 const source=readFileSync(script,'utf8');
 assert.match(source,/host:'127\.0\.0\.1',port:5432,database:'hero_victory_chests_test',user:'test',password:'test'/);
 assert.match(source,/assert\.equal\(existing,0/);assert.match(source,/Number\(target\.version\)>=180000&&Number\(target\.version\)<190000/);
 assert.doesNotMatch(source,/DROP\s+(?:DATABASE|SCHEMA)|TRUNCATE|connectionString\s*:/i);
 assert.match(source,/005-victory-chests-magic-dust\.sql/);assert.match(source,/createVictoryChestPolicy\(flags\)/);
});

test('22 integration groups include real bounded server restart and explicit synthetic-only environment',()=>{
 const source=readFileSync(script,'utf8');assert.equal((source.match(/await check\(/g)||[]).length,22);
 assert.match(source,/actual server restart recovers pre-intent pending match once/);assert.match(source,/DATABASE_URL:APPROVED,AUTH_SIGNING_SECRET:FIXTURE_SIGNING_SECRET/);
 assert.match(source,/child\.kill\('SIGTERM'\)/);assert.match(source,/child\.kill\('SIGKILL'\)/);assert.match(source,/Date\.now\(\)\+20000/);
 assert.match(source,/assert\.deepEqual\(again\.victoryChest,receipt\)/);assert.match(source,/app\.post\('\/api\/rematch',loserAuth\)/);
 const spawn=source.slice(source.indexOf("const child=spawn(process.execPath"),source.indexOf("let logs=''"));assert.doesNotMatch(spawn,/\.\.\.process\.env/);
});
test('cancellation groups exercise real SQL faults, paired refunds, audit, replay, room identity and running-server pause guards',()=>{
 const source=readFileSync(script,'utf8');
 assert.match(source,/cancelPaidMatches\(\{database:pool/);assert.match(source,/for\(let index=0;index<3;index\+\+\)/);
 assert.match(source,/CREATE TRIGGER pgcancel_write_failure BEFORE INSERT OR UPDATE/);
 for(const table of ['hero_auction_wallets','hero_auction_gold_awards','hero_auction_admin_audit','hero_auction_rooms','hero_auction_social'])assert.ok(source.includes(table));
 assert.match(source,/database:lostCommit\(\)/);assert.match(source,/error\.status===503&&error\.uncertain===true/);
 assert.match(source,/plans:new Map\(\)/);assert.match(source,/missing paid wallet or integer overflow/);assert.match(source,/late live validation failure/);
 assert.match(source,/expectedBootId:'old-fixture-boot'/);assert.match(source,/expectedRevision:preview\.revision-1/);assert.match(source,/digest:'0'\.repeat\(64\)/);
 assert.match(source,/assert\.equal\(held\.pendingMatchCancellations,3\)/);assert.match(source,/app\.post\('\/api\/battle-auction-preview',[\s\S]*?\},503\)/);
 assert.match(source,/await app\.publicInfo\(\)\)\.paidMatches,\{paused:true\}/);assert.match(source,/const newer=\{[\s\S]*?matchNumber:2/);
 assert.match(source,/assert\.deepEqual\(await cancellationProof\(batch\),committed\)/);
});
