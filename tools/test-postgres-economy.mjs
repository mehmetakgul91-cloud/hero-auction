// Real PostgreSQL integration tests. ONLY the empty disposable Actions service
// is supported. Never falls back to DATABASE_URL, PGHOST, credentials or secrets.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import pg from 'pg';
import {createCommanderProfile} from '../arena-commanders.js';
import {createDiamondPolicy,upgradeCommanderWithDiamonds} from '../paid-diamonds.js';
import {createDiamondExchangePolicy,exchangeDiamondsForGold} from '../paid-diamond-exchange.js';
import {createDiamondSignupPolicy,registerDiamondMember} from '../diamond-signup-bonus.js';
import {createLoginRewardPolicy,claimLoginReward,readLoginRewardStatus} from '../login-rewards.js';

const APPROVED_TEST_TARGET='postgresql://test:test@127.0.0.1:5432/hero_economy_test';
if(process.env.HERO_ECONOMY_TEST_DB!==APPROVED_TEST_TARGET||process.env.DATABASE_URL){
 console.error('REFUSED: set the exact dedicated loopback HERO_ECONOMY_TEST_DB and remove DATABASE_URL. No connection attempted.');
 process.exit(1);
}
const pool=new pg.Pool({host:'127.0.0.1',port:5432,database:'hero_economy_test',user:'test',password:'test',ssl:false,max:20,
 connectionTimeoutMillis:5000,idleTimeoutMillis:1000,application_name:'hero-disposable-economy-integration',
 options:'-c search_path=public -c statement_timeout=10000 -c lock_timeout=5000'});
const flags={HERO_DIAMONDS_ENABLED:'1',HERO_DIAMOND_EXCHANGE_ENABLED:'1',HERO_DIAMOND_SIGNUP_BONUS_ENABLED:'1',HERO_LOGIN_REWARDS_ENABLED:'1'};
const rewardPolicy=createLoginRewardPolicy(flags),signupPolicy=createDiamondSignupPolicy(flags),diamondPolicy=createDiamondPolicy(flags),exchangePolicy=createDiamondExchangePolicy(flags);
const identity=sub=>({sub,provider:'google'});
let today,passed=0;
const dayAt=offset=>new Date(Date.parse(today+'T00:00:00Z')+offset*86400000).toISOString().slice(0,10);
const sql=(query,args=[])=>pool.query(query,args);
const claim=(sub,{rewardDate=today,database=pool,member=identity(sub),policy=rewardPolicy}={})=>claimLoginReward({database,identity:member,policy,request:{rewardDate}});
async function check(name,fn){await fn();passed++;console.log('PASS '+name)}
async function member(sub,{gold=500,diamonds=0,commander=false}={}){
 await sql('INSERT INTO hero_auction_user_profiles(account_id,display_name) VALUES($1,$2)',[sub,'Isolated fixture']);
 await sql('INSERT INTO hero_auction_wallets(account_id,gold) VALUES($1,$2)',[sub,gold]);
 if(diamonds!==null)await sql('INSERT INTO hero_auction_diamond_wallets(account_id,diamonds) VALUES($1,$2)',[sub,diamonds]);
 if(commander){const profile=createCommanderProfile('attack');profile.levels.attack=20;await sql('INSERT INTO hero_auction_commanders(account_id,profile) VALUES($1,$2::jsonb)',[sub,JSON.stringify(profile)])}
}
async function snapshot(sub){
 const {rows}=await sql(`SELECT w.gold,d.diamonds,
  (SELECT count(*)::int FROM hero_auction_login_reward_receipts r WHERE r.account_id=w.account_id) AS receipts,
  (SELECT jsonb_build_object('date',s.last_reward_date::text,'day',s.day_index,'provider',s.provider)
   FROM hero_auction_login_reward_streaks s WHERE s.account_id=w.account_id) AS streak
  FROM hero_auction_wallets w LEFT JOIN hero_auction_diamond_wallets d USING(account_id) WHERE w.account_id=$1`,[sub]);
 return rows[0]||null;
}
async function seedPast(sub,day,offset=-1){
 const reward=rewardPolicy.enabled&&[{gold:100,diamonds:0},{gold:150,diamonds:0},{gold:200,diamonds:0},{gold:250,diamonds:0},{gold:300,diamonds:0},{gold:400,diamonds:0},{gold:0,diamonds:5}][day-1];
 const {gold,diamonds}=await snapshot(sub),date=dayAt(offset),d=diamonds??0;
 await sql('INSERT INTO hero_auction_login_reward_receipts(account_id,reward_date,day_index,gold_amount,diamond_amount,gold_before,gold_after,diamonds_before,diamonds_after) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[sub,date,day,reward.gold,reward.diamonds,gold-reward.gold,gold,d-reward.diamonds,d]);
 await sql("INSERT INTO hero_auction_login_reward_streaks(account_id,provider,last_reward_date,day_index) VALUES($1,'google',$2,$3)",[sub,date,day]);
}
async function rejectedSQL(code,query,args=[]){
 const client=await pool.connect();
 try{await client.query('BEGIN');await assert.rejects(client.query(query,args),error=>error.code===code,query)}
 finally{await client.query('ROLLBACK');client.release()}
}
function loseCommitResponse(){
 let armed=true;
 return {async connect(){const client=await pool.connect();return {async query(...args){const result=await client.query(...args);if(args[0]==='COMMIT'&&armed){armed=false;throw Error('Injected lost COMMIT response')}return result},release:()=>client.release()}}};
}
async function applyMigrations(files){
 for(const [name,source] of files){const client=await pool.connect();try{await client.query(source)}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}}
}
async function schema(){
 const {rows}=await sql(`SELECT c.relname,c.relkind,c.relpersistence,
  (SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
   FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns,
  (SELECT jsonb_agg(jsonb_build_object('type',k.contype,'definition',pg_get_constraintdef(k.oid),'validated',k.convalidated,'deferrable',k.condeferrable,'enforced',coalesce((to_jsonb(k)->>'conenforced')::boolean,true)) ORDER BY k.contype,k.conname)
   FROM pg_constraint k WHERE k.conrelid=c.oid) AS constraints
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname`);
 return rows;
}
try{
 const target=(await sql("SELECT current_database() AS db,current_user AS role,inet_server_port() AS port,current_setting('server_version_num') AS version,current_schema() AS schema")).rows[0];
 assert.equal(target.db,'hero_economy_test');assert.equal(target.role,'test');assert.equal(target.port,5432);assert.equal(target.schema,'public');assert.ok(Number(target.version)>=180000&&Number(target.version)<190000);
 const existing=(await sql("SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%' AND c.relkind IN ('r','p','v','m','f','S')")).rows[0].count;
 assert.equal(existing,0,'REFUSED: test database is not empty; no reset/drop will be attempted');
 console.log('Dedicated disposable PostgreSQL '+target.version+' verified; no production connection or credentials used.');
 await sql(`CREATE TABLE hero_auction_wallets (account_id TEXT PRIMARY KEY,gold INTEGER NOT NULL DEFAULT 500 CHECK(gold>=0));
 CREATE TABLE hero_auction_user_profiles(account_id TEXT PRIMARY KEY,display_name TEXT NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
 CREATE TABLE hero_auction_commanders(account_id TEXT PRIMARY KEY,profile JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
 CREATE TABLE hero_auction_admin_accounts(account_id TEXT PRIMARY KEY,banned BOOLEAN NOT NULL DEFAULT false);`);
 const files=await Promise.all(['001-paid-diamonds-foundation.sql','002-diamond-exchange.sql','003-diamond-signup-bonus.sql','004-login-rewards.sql'].map(async name=>[name,await readFile(new URL('../migrations/'+name,import.meta.url),'utf8')]));
 for(const [name,source] of files)console.log('MIGRATION '+name+' sha256='+createHash('sha256').update(source).digest('hex'));
 await check('exact migrations apply and reapply without schema/data changes',async()=>{
  await applyMigrations(files);const first=await schema();assert.equal(first.length,12);await applyMigrations(files);assert.deepEqual(await schema(),first);
  for(const relation of first){assert.equal(relation.relkind,'r');assert.equal(relation.relpersistence,'p');for(const constraint of relation.constraints||[]){assert.equal(constraint.validated,true);assert.equal(constraint.enforced,true);assert.equal(constraint.deferrable,false)}}
  const streak=first.find(row=>row.relname==='hero_auction_login_reward_streaks');assert.ok(streak.constraints.some(c=>c.type==='f'&&/FOREIGN KEY \(account_id, last_reward_date, day_index\)/.test(c.definition)));
  const receipt=first.find(row=>row.relname==='hero_auction_login_reward_receipts');assert.ok(receipt.constraints.some(c=>c.type==='p'&&/account_id, reward_date/.test(c.definition)));assert.ok(receipt.constraints.some(c=>c.type==='c'&&/diamond_amount = 5/.test(c.definition)));
  assert.equal((await sql("SELECT has_sequence_privilege(pg_get_serial_sequence('hero_auction_diamond_ledger','id'),'USAGE') AS permitted")).rows[0].permitted,true);
  for(const row of first){const count=(await sql('SELECT count(*)::int AS n FROM '+row.relname)).rows[0].n;assert.equal(count,0)}
 });
 today=(await sql("SELECT (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date::text AS day")).rows[0].day;
 await check('real SQL Istanbul UTC21 boundary and leap/year dates',async()=>{
  const values=[['2026-10-25T20:59:59.999Z','2026-10-25'],['2026-10-25T21:00:00.000Z','2026-10-26'],['2026-12-31T21:00:00Z','2027-01-01'],['2028-02-28T21:00:00Z','2028-02-29'],['2028-02-29T21:00:00Z','2028-03-01']];
  for(const [time,expected] of values)assert.equal((await sql("SELECT ($1::timestamptz AT TIME ZONE 'Europe/Istanbul')::date::text AS day",[time])).rows[0].day,expected);
 });
 await check('12 concurrent same-day sessions grant exactly once and isolate accounts',async()=>{
  await member('pgtest-parallel');await member('pgtest-other');const results=await Promise.all(Array.from({length:12},()=>claim('pgtest-parallel')));assert.equal(results.filter(r=>!r.replayed).length,1);
  assert.deepEqual(await snapshot('pgtest-parallel'),{gold:600,diamonds:0,receipts:1,streak:{date:today,day:1,provider:'google'}});assert.equal((await snapshot('pgtest-other')).gold,500);
  const other=await readLoginRewardStatus({database:pool,identity:identity('pgtest-other'),policy:rewardPolicy});assert.equal(other.receipt,null);assert.equal(other.completedDay,0);
 });
 await check('day6→7 awards five diamonds without extra gold; cycle/gap reset',async()=>{
  await member('pgtest-day7',{diamonds:null});await seedPast('pgtest-day7',6);const seventh=await claim('pgtest-day7');assert.equal(seventh.gold,500);assert.equal(seventh.diamonds,5);assert.deepEqual(seventh.receipt,{day:7,gold:0,diamonds:5,rewardDate:today});
  await member('pgtest-cycle',{diamonds:10});await seedPast('pgtest-cycle',7);assert.equal((await claim('pgtest-cycle')).receipt.day,1);
  await member('pgtest-gap');await seedPast('pgtest-gap',6,-2);assert.equal((await claim('pgtest-gap')).receipt.day,1);
 });
 await check('old date receipt and lost-COMMIT retry cannot mint a second reward',async()=>{
  await member('pgtest-old');await seedPast('pgtest-old',1,-3);const before=await snapshot('pgtest-old'),old=await claim('pgtest-old',{rewardDate:dayAt(-3)});assert.equal(old.replayed,true);assert.deepEqual(await snapshot('pgtest-old'),before);assert.equal(old.loginRewards.nextDay,1);
  await member('pgtest-uncertain');await assert.rejects(claim('pgtest-uncertain',{database:loseCommitResponse()}),/lost COMMIT/);assert.equal((await snapshot('pgtest-uncertain')).gold,600);
  const retry=await claim('pgtest-uncertain');assert.equal(retry.replayed,true);assert.equal(retry.gold,600);assert.equal((await snapshot('pgtest-uncertain')).receipts,1);
 });
 await check('real trigger failure rolls back credited gold, receipt and streak',async()=>{
  await member('pgtest-rollback');const before=await snapshot('pgtest-rollback');
  await sql("CREATE FUNCTION pgtest_reject_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'isolated receipt fault'; END $$; CREATE TRIGGER pgtest_receipt_failure BEFORE INSERT ON hero_auction_login_reward_receipts FOR EACH ROW WHEN (NEW.account_id='pgtest-rollback') EXECUTE FUNCTION pgtest_reject_receipt();");
  try{await assert.rejects(claim('pgtest-rollback'),/isolated receipt fault/);assert.deepEqual(await snapshot('pgtest-rollback'),before)}finally{await sql('DROP TRIGGER pgtest_receipt_failure ON hero_auction_login_reward_receipts; DROP FUNCTION pgtest_reject_receipt();')}
  assert.equal((await claim('pgtest-rollback')).gold,600);
 });
 await check('actual PK/FK/CHECK/date constraints reject incompatible data',async()=>{
  const insert='INSERT INTO hero_auction_login_reward_receipts(account_id,reward_date,day_index,gold_amount,diamond_amount,gold_before,gold_after,diamonds_before,diamonds_after) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)';
  await rejectedSQL('23505',insert,['pgtest-parallel',today,1,100,0,500,600,0,0]);
  await rejectedSQL('23514',insert,['pgtest-other',today,7,0,10,500,500,0,10]);
  await rejectedSQL('23514',insert,['pgtest-other',today,7,100,5,500,600,0,5]);
  await rejectedSQL('23514',insert,['pgtest-other',today,1,100,0,500,601,0,0]);
  await rejectedSQL('23503',insert,['pgtest-no-parent',today,1,100,0,500,600,0,0]);
  await rejectedSQL('22008',insert,['pgtest-other','2026-02-30',1,100,0,500,600,0,0]);
  await rejectedSQL('23503','UPDATE hero_auction_login_reward_streaks SET day_index=2 WHERE account_id=$1',['pgtest-parallel']);
  await rejectedSQL('23514',"UPDATE hero_auction_login_reward_streaks SET provider='apple' WHERE account_id=$1",['pgtest-parallel']);
  await rejectedSQL('23514','UPDATE hero_auction_diamond_wallets SET diamonds=-1 WHERE account_id=$1',['pgtest-other']);
 });
 await check('real profile lock blocks claim; DB clock is queried only after lock returns',async()=>{
  await member('pgtest-lock');const holder=await pool.connect();let profileSentResolve;const profileSent=new Promise(resolve=>profileSentResolve=resolve);let observedClock=false,settled=false;
  const traced={async connect(){const client=await pool.connect();return{async query(query,args){if(query.startsWith('SELECT account_id FROM hero_auction_user_profiles'))profileSentResolve();if(query.startsWith('SELECT (clock_timestamp()'))observedClock=true;return client.query(query,args)},release:()=>client.release()}}};
  let pending;
  try{await holder.query('BEGIN');await holder.query('SELECT account_id FROM hero_auction_user_profiles WHERE account_id=$1 FOR UPDATE',['pgtest-lock']);pending=claim('pgtest-lock',{database:traced}).finally(()=>settled=true);await profileSent;await new Promise(resolve=>setTimeout(resolve,40));assert.equal(settled,false);assert.equal(observedClock,false);await holder.query('COMMIT');assert.equal((await pending).gold,600);assert.equal(observedClock,true)}
  finally{await holder.query('ROLLBACK');holder.release();if(pending)await pending.catch(()=>{})}
 });
 await check('actual upgrade/exchange/claim concurrent wallet locks preserve net balances',async()=>{
  for(const order of [[0,1,2],[2,1,0],[1,0,2]]){const sub='pgtest-cross-'+order.join('');await member(sub,{gold:20000,diamonds:20,commander:true});const actions=[()=>claim(sub),()=>upgradeCommanderWithDiamonds({database:pool,accountId:sub,policy:diamondPolicy,request:{stat:'attack',commanderId:'attack',expectedCurrentLevel:20,requestId:'pgtest-upgrade-0001'}}),()=>exchangeDiamondsForGold({database:pool,accountId:sub,policy:exchangePolicy,request:{requestId:'pgtest-exchange-0001',diamondsToSpend:3,expectedRate:500,pricingVersion:'diamonds-to-gold-500-v1'}})];await Promise.all(order.map(index=>actions[index]()));const wallet=await snapshot(sub);assert.equal(wallet.gold,13932);assert.equal(wallet.diamonds,7);assert.equal(wallet.receipts,1);assert.equal((await sql('SELECT profile FROM hero_auction_commanders WHERE account_id=$1',[sub])).rows[0].profile.levels.attack,21)}
 });
 await check('new Google welcome10 is once-only and separate from day1gold; existing accounts excluded',async()=>{
  const sub='pgtest-new-google';const results=await Promise.all(Array.from({length:6},()=>registerDiamondMember({database:pool,accountId:sub,provider:'google',policy:signupPolicy})));assert.equal(results.filter(r=>r.awarded===10).length,1);assert.equal((await snapshot(sub)).diamonds,10);const daily=await claim(sub);assert.equal(daily.gold,600);assert.equal(daily.diamonds,10);
  const old=await registerDiamondMember({database:pool,accountId:'pgtest-other',provider:'google',policy:signupPolicy});assert.equal(old.eligible,false);assert.equal(old.awarded,0);assert.equal((await claim('pgtest-other')).gold,600);
 });
 await check('ineligible identity, old/future date, flags-off and overflow do not consume a reward',async()=>{
  await member('pgtest-refused');const before=await snapshot('pgtest-refused');for(const provider of ['guest','crazygames','apple'])await assert.rejects(claim('pgtest-refused',{member:{sub:'pgtest-refused',provider}}),e=>e.status===403);
  for(const date of [dayAt(-1),dayAt(1)])await assert.rejects(claim('pgtest-refused',{rewardDate:date}),e=>e.status===409);await assert.rejects(claim('pgtest-refused',{policy:createLoginRewardPolicy()}),e=>e.status===503);assert.deepEqual(await snapshot('pgtest-refused'),before);
  await member('pgtest-overflow',{gold:2147483647});await assert.rejects(claim('pgtest-overflow'),e=>e.status===409);assert.equal((await snapshot('pgtest-overflow')).receipts,0);
  await member('pgtest-diamond-overflow',{diamonds:2147483643});await seedPast('pgtest-diamond-overflow',6);await assert.rejects(claim('pgtest-diamond-overflow'),e=>e.status===409);assert.equal((await snapshot('pgtest-diamond-overflow')).streak.day,6);
 });
 await check('future stored date and inconsistent receipt/streak fail closed without recovery grants',async()=>{
  await member('pgtest-clock-regression');await seedPast('pgtest-clock-regression',1,1);const before=await snapshot('pgtest-clock-regression');await assert.rejects(claim('pgtest-clock-regression'),e=>e.status===503);assert.deepEqual(await snapshot('pgtest-clock-regression'),before);
  assert.equal((await readLoginRewardStatus({database:pool,identity:identity('pgtest-clock-regression'),policy:rewardPolicy})).reason,'clock_regression');
  await member('pgtest-orphan');await sql('INSERT INTO hero_auction_login_reward_receipts(account_id,reward_date,day_index,gold_amount,diamond_amount,gold_before,gold_after,diamonds_before,diamonds_after) VALUES($1,$2,1,100,0,400,500,0,0)',['pgtest-orphan',dayAt(-1)]);const orphan=await snapshot('pgtest-orphan');await assert.rejects(claim('pgtest-orphan'),e=>e.status===503);assert.deepEqual(await snapshot('pgtest-orphan'),orphan);
 });
 const endingDay=(await sql("SELECT (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date::text AS day")).rows[0].day;
 assert.equal(endingDay,today,'Test crossed actual Istanbul midnight; retry the disposable job with fresh fixtures, never reinterpret the dates');
 console.log(`PASS ${passed} real PostgreSQL integration groups; official PostgreSQL ${target.version}; synthetic accounts only.`);
 console.log('Not tested here: production schema/permissions/backups, physical cluster restart, provider integration, or real-time midnight passage. No activation performed.');
}catch(error){console.error('FAIL disposable PostgreSQL integration:',error.stack||error.message);process.exitCode=1}
finally{await pool.end()}
