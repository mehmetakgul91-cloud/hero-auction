import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../.github/workflows/bot-economy-postgres-tests.yml',import.meta.url),'utf8');
const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
test('bot CI uses isolated PostgreSQL17, repository Node target and read-only checkout',()=>{
 assert.equal(pkg.engines.node,'26.12.1');assert.match(source,/node-version-file: package\.json/);assert.match(source,/image: postgres:17\n/);assert.match(source,/127\.0\.0\.1:5432:5432/);assert.match(source,/contents: read/);assert.match(source,/persist-credentials: false/);assert.match(source,/npm ci --ignore-scripts --no-audit --no-fund/);
 assert.doesNotMatch(source,/secrets\.|pull_request_target|write-all|contents: write|DROP\s+(DATABASE|SCHEMA)|TRUNCATE/i);
});
test('bot CI full tests and both guarded harnesses run without DATABASE_URL using separate empty databases',()=>{
 assert.match(source,/env -u DATABASE_URL npm test/);assert.match(source,/CREATE DATABASE hero_bot_live_test/);assert.match(source,/assert\.equal\(Number\(.*pg_tables.*\),0\)/);
 for(const [name,variable] of [['economy','HERO_BOT_ECONOMY_TEST_DB'],['live','HERO_BOT_LIVE_TEST_DB']]){
  assert.ok(source.includes(`${variable}: postgresql://test:test@127.0.0.1:5432/hero_bot_${name}_test`));
  assert.ok(source.includes(`env -u DATABASE_URL node tools/test-postgres-bot-${name}.mjs`));
 }
 assert.match(source,/POSTGRES_DB: hero_bot_economy_test/);
});
