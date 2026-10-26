import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {DISPOSABLE_URL,DISPOSABLE_CONFIRMATION,guardDisposableEnvironment} from '../tools/test-postgres-economy-release.mjs';
import {FLAGS,TARGET,validateRuntime} from '../tools/economy-release-common.mjs';
const file=new URL('../tools/test-postgres-economy-release.mjs',import.meta.url);
const source=readFileSync(file,'utf8');
const workflow=readFileSync(new URL('../.github/workflows/economy-release-postgres-tests.yml',import.meta.url),'utf8');
const environment=()=>({HERO_ECONOMY_RELEASE_TEST_DB:DISPOSABLE_URL,HERO_ECONOMY_RELEASE_TEST_CONFIRM:DISPOSABLE_CONFIRMATION,HERO_ECONOMY_RELEASE_TEST_COMMIT_RESPONSE:'normal'});

test('operator integration accepts only explicit disposable normal/lost-COMMIT scenarios',()=>{
 assert.equal(guardDisposableEnvironment(environment()),'normal');assert.equal(guardDisposableEnvironment({...environment(),HERO_ECONOMY_RELEASE_TEST_COMMIT_RESPONSE:'lost-commit'}),'lost-commit');
 assert.equal(DISPOSABLE_URL,'postgresql://test:test@127.0.0.1:5432/hero_auction_db');
});
for(const [name,patch] of [
 ['missing confirmation',{HERO_ECONOMY_RELEASE_TEST_CONFIRM:undefined}],['missing scenario',{HERO_ECONOMY_RELEASE_TEST_COMMIT_RESPONSE:undefined}],['unknown scenario',{HERO_ECONOMY_RELEASE_TEST_COMMIT_RESPONSE:'reset'}],
 ['remote URL',{HERO_ECONOMY_RELEASE_TEST_DB:'postgresql://test:test@external.invalid/hero_auction_db'}],['localhost alias',{HERO_ECONOMY_RELEASE_TEST_DB:DISPOSABLE_URL.replace('127.0.0.1','localhost')}],['alternate port',{HERO_ECONOMY_RELEASE_TEST_DB:DISPOSABLE_URL.replace('5432','5433')}],['different database',{HERO_ECONOMY_RELEASE_TEST_DB:DISPOSABLE_URL.replace('hero_auction_db','postgres')}],['appended options',{HERO_ECONOMY_RELEASE_TEST_DB:DISPOSABLE_URL+'?host=external.invalid'}],
 ['production URL present',{DATABASE_URL:'postgresql://unprinted:secret@private.invalid/private'}],['empty production URL present',{DATABASE_URL:''}],['Render runtime',{RENDER:'true'}],['Render service',{RENDER_SERVICE_ID:TARGET.service}],['PGHOST override',{PGHOST:'private.invalid'}],['PGOPTIONS override',{PGOPTIONS:'private-options'}],['PGSERVICE override',{PGSERVICE:'private-service'}]
])test('disposable guard rejects '+name+' before importing pg or connecting',()=>assert.throws(()=>guardDisposableEnvironment({...environment(),...patch}),/EXACT_DISPOSABLE_LOOPBACK_ENVIRONMENT_REQUIRED/));
for(const flag of FLAGS)test('disposable guard rejects enabled '+flag,()=>assert.throws(()=>guardDisposableEnvironment({...environment(),[flag]:'1'})));

test('harness guard does not weaken the production Render/internal-host guard',()=>{
 const args={'expect-service':TARGET.service,'expect-commit':'a'.repeat(40)};
 assert.throws(()=>validateRuntime({RENDER:'true',RENDER_SERVICE_ID:TARGET.service,RENDER_SERVICE_TYPE:'web',RENDER_GIT_COMMIT:args['expect-commit'],RENDER_GIT_REPO_SLUG:TARGET.repo,DATABASE_URL:DISPOSABLE_URL},args),/NOT_APPROVED_INTERNAL_DATABASE/);
 assert.doesNotMatch(source,/validateRuntime\(|\bconnect\(config\)|\.\.\.process\.env/);
 assert.ok(source.indexOf('responseMode=guardDisposableEnvironment(env)')<source.indexOf("await import('pg')"));
 assert.match(source,/host:'127\.0\.0\.1',port:5432,database:'hero_auction_db',user:'test',password:'test',ssl:false/);
});
test('unapproved harness CLI stops without network attempt and does not print credentials',()=>{
 const child=spawnSync(process.execPath,[file.pathname],{env:{...environment(),DATABASE_URL:'postgresql://unprinted:secret@private.invalid/private'},encoding:'utf8',timeout:5000});
 assert.equal(child.status,1);assert.match(child.stderr,/EXACT_DISPOSABLE_LOOPBACK_ENVIRONMENT_REQUIRED.*No connection attempted/);assert.doesNotMatch(child.stderr+child.stdout,/unprinted|secret|private\.invalid|ECONN|ENOTFOUND/);
});
test('real harness checks fresh PG18 before creating bounded synthetic fixture and never resets a database',()=>{
 assert.ok(source.indexOf('assert.equal(objects,0')<source.indexOf('await sql(`CREATE TABLE'));
 assert.match(source,/Number\(identity.version\)>=180000&&Number\(identity.version\)<190000/);
 assert.match(source,/assert\.equal\(identity.role,'test'\)/);assert.match(source,/120000/);
 assert.doesNotMatch(source,/sql\(['"`]\s*(?:DROP DATABASE|DROP SCHEMA|TRUNCATE)/i);
 assert.match(source,/SELECT 1\/0/);assert.match(source,/SQL\.identity/);assert.match(source,/pg_advisory_xact_lock\(724910,5\)/);
 assert.match(source,/preflight\(client,args\(false,'5'\),manifest\)/);assert.match(source,/COMMIT_OUTCOME_UNKNOWN_RUN_READ_ONLY_PREFLIGHT/);
});
test('CI gives both scenarios their own official PG18 service without production secrets or publication',()=>{
 assert.match(workflow,/permissions:\n  contents: read/);assert.match(workflow,/commit-response: \[normal, lost-commit\]/);
 assert.match(workflow,/image: postgres:18@sha256:[a-f0-9]{64}/);assert.match(workflow,/'127\.0\.0\.1:5432:5432'/);
 assert.match(workflow,/persist-credentials: false/);assert.match(workflow,/node-version: '22'/);assert.match(workflow,/npm ci --ignore-scripts --no-audit --no-fund/);
 assert.match(workflow,/node tools\/test-postgres-economy-release.mjs/);assert.match(workflow,/timeout-minutes: 10/);
 assert.doesNotMatch(workflow,/\bsecrets\.|DATABASE_URL:|render\.com|git push|workflow_dispatch|pull_request_target/);
});
