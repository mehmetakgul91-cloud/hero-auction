import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const path=new URL('../tools/test-postgres-bot-economy.mjs',import.meta.url).pathname;
for(const [name,url,ambient] of [['unset','',''],['remote','postgresql://test:test@example.invalid:5432/hero_bot_economy_test',''],['wrong DB','postgresql://test:test@127.0.0.1:5432/postgres',''],['ambient production','postgresql://test:test@127.0.0.1:5432/hero_bot_economy_test','postgresql://unused.invalid/never-connect']])test(`bot PostgreSQL harness refuses ${name} before connect`,()=>{const result=spawnSync(process.execPath,[path],{env:{...process.env,HERO_BOT_ECONOMY_TEST_DB:url,DATABASE_URL:ambient},encoding:'utf8',timeout:5000});assert.equal(result.status,1);assert.match(result.stderr,/REFUSED.*No connection attempted/);assert.doesNotMatch(result.stderr,/ECONN|ENOTFOUND|authentication|password/i)});
const livePath=new URL('../tools/test-postgres-bot-live.mjs',import.meta.url).pathname;
for(const [name,url,ambient] of [['unset','',''],['remote','postgresql://test:test@example.invalid:5432/hero_bot_live_test',''],['wrong DB','postgresql://test:test@127.0.0.1:5432/postgres',''],['ambient production','postgresql://test:test@127.0.0.1:5432/hero_bot_live_test','postgresql://unused.invalid/never-connect']])test(`paid live bot PostgreSQL harness refuses ${name} before connect or spawn`,()=>{const result=spawnSync(process.execPath,[livePath],{env:{...process.env,HERO_BOT_LIVE_TEST_DB:url,DATABASE_URL:ambient},encoding:'utf8',timeout:5000});assert.equal(result.status,1);assert.match(result.stderr,/REFUSED.*No connection attempted/);assert.doesNotMatch(result.stderr,/ECONN|ENOTFOUND|authentication|password/i)});

const browserPath=new URL('../tools/test-postgres-bot-browser.mjs',import.meta.url).pathname;
for(const [name,url,ambient,ci] of [
 ['unset','','',true],['remote','postgresql://test:test@example.invalid:5432/hero_bot_browser_test','',true],
 ['wrong DB','postgresql://test:test@127.0.0.1:5432/postgres','',true],
 ['ambient production','postgresql://test:test@127.0.0.1:5432/hero_bot_browser_test','postgresql://unused.invalid/never-connect',true],
 ['local execution','postgresql://test:test@127.0.0.1:5432/hero_bot_browser_test','',false]
])test(`browser PostgreSQL harness refuses ${name} before connect or browser import`,()=>{
 const result=spawnSync(process.execPath,[browserPath],{env:{...process.env,HERO_BOT_BROWSER_TEST_DB:url,DATABASE_URL:ambient,CI:String(ci),GITHUB_ACTIONS:String(ci)},encoding:'utf8',timeout:5000});
 assert.equal(result.status,1);assert.match(result.stderr,/REFUSED.*No connection or browser launch attempted/);assert.doesNotMatch(result.stderr,/ECONN|ENOTFOUND|ERR_MODULE_NOT_FOUND|authentication|password/i);
});
