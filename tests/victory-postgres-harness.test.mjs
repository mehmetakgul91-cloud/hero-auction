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

test('13th integration group uses a real bounded server restart and explicit synthetic-only environment',()=>{
 const source=readFileSync(script,'utf8');assert.equal((source.match(/await check\(/g)||[]).length,13);
 assert.match(source,/actual server restart recovers pre-intent pending match once/);assert.match(source,/DATABASE_URL:APPROVED,AUTH_SIGNING_SECRET:FIXTURE_SIGNING_SECRET/);
 assert.match(source,/child\.kill\('SIGTERM'\)/);assert.match(source,/child\.kill\('SIGKILL'\)/);assert.match(source,/Date\.now\(\)\+20000/);
 assert.match(source,/assert\.deepEqual\(again\.victoryChest,receipt\)/);assert.match(source,/app\.post\('\/api\/rematch',loserAuth\)/);
 const spawn=source.slice(source.indexOf("const child=spawn(process.execPath"),source.indexOf("let logs=''"));assert.doesNotMatch(spawn,/\.\.\.process\.env/);
});
