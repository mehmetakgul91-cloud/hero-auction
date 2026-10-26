// Real PostgreSQL18 integration, restricted to a fresh disposable local CI DB.
// No production URL, credential fallback, database drop/reset or activation.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash,createHmac} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {battleRoster} from '../battle-roster.js';
import pg from 'pg';
import {createCommanderProfile,commanderUpgradeCost} from '../arena-commanders.js';
import {createDiamondPolicy,upgradeCommanderWithDiamonds} from '../paid-diamonds.js';
import {createMagicDustPolicy} from '../magic-dust.js';
import {createDiamondExchangePolicy,exchangeDiamondsForGold} from '../paid-diamond-exchange.js';
import {createLoginRewardPolicy,claimLoginReward} from '../login-rewards.js';
import {createVictoryChestPolicy,persistVictoryChestIntent,creditVictoryChest,victoryMatchId,readVictoryChestRecovery} from '../victory-chests.js';

const APPROVED='postgresql://test:test@127.0.0.1:5432/hero_victory_chests_test';
if(process.env.HERO_VICTORY_CHEST_TEST_DB!==APPROVED||process.env.DATABASE_URL){
 console.error('REFUSED: exact disposable loopback HERO_VICTORY_CHEST_TEST_DB required; remove DATABASE_URL. No connection attempted.');
 process.exit(1);
}
const pool=new pg.Pool({host:'127.0.0.1',port:5432,database:'hero_victory_chests_test',user:'test',password:'test',ssl:false,max:20,
 connectionTimeoutMillis:5000,idleTimeoutMillis:1000,application_name:'hero-disposable-victory-integration',
 options:'-c search_path=public -c statement_timeout=10000 -c lock_timeout=5000'});
const sql=(query,args=[])=>pool.query(query,args);
const flags={HERO_DIAMONDS_ENABLED:'1',HERO_MAGIC_DUST_ENABLED:'1',HERO_VICTORY_CHESTS_ENABLED:'1',HERO_DIAMOND_EXCHANGE_ENABLED:'1',HERO_LOGIN_REWARDS_ENABLED:'1'};
const diamondPolicy=createDiamondPolicy(flags),magicDustPolicy=createMagicDustPolicy(flags),chestPolicy=createVictoryChestPolicy(flags),exchangePolicy=createDiamondExchangePolicy(flags),dailyPolicy=createLoginRewardPolicy(flags);
let passed=0,sequence=0,today;
async function check(name,run){await run();console.log('PASS '+name);passed++}
function rng(values=[4,0,2,0]){let calls=0;const randomInt=max=>{const value=values[calls++%values.length];assert.ok(value>=0&&value<max);return value};randomInt.calls=()=>calls;return randomInt}
function room(sub,extra={}){return{code:'123',created:1000000+(++sequence),matchNumber:1,phase:'finished',mode:'friend',entryPaid:true,players:[{accountId:sub,name:'Fixture winner'},{accountId:'fixture-opponent',name:'Fixture opponent'}],...extra}}
async function member(sub,{gold=20000,diamonds=20,magicDust=20,level=20}={}){
 await sql('INSERT INTO hero_auction_user_profiles(account_id,display_name) VALUES($1,$2)',[sub,'Disposable fixture']);
 await sql('INSERT INTO hero_auction_wallets(account_id,gold) VALUES($1,$2)',[sub,gold]);
 if(diamonds!==null)await sql('INSERT INTO hero_auction_diamond_wallets(account_id,diamonds) VALUES($1,$2)',[sub,diamonds]);
 if(magicDust!==null)await sql('INSERT INTO hero_auction_magic_dust_wallets(account_id,magic_dust) VALUES($1,$2)',[sub,magicDust]);
 const profile=createCommanderProfile('attack');profile.levels.attack=level;
 await sql('INSERT INTO hero_auction_commanders(account_id,profile) VALUES($1,$2::jsonb)',[sub,JSON.stringify(profile)]);
}
async function snapshot(sub){
 return(await sql(`SELECT w.gold,d.diamonds,m.magic_dust AS "magicDust",c.profile,
  (SELECT count(*)::int FROM hero_auction_victory_chest_intents x WHERE x.account_id=w.account_id) AS intents,
  (SELECT count(*)::int FROM hero_auction_victory_chest_receipts x WHERE x.account_id=w.account_id) AS chests,
  (SELECT count(*)::int FROM hero_auction_gold_awards x WHERE x.account_id=w.account_id) AS awards,
  (SELECT count(*)::int FROM hero_auction_upgrade_receipts x WHERE x.account_id=w.account_id) AS upgrades,
  (SELECT count(*)::int FROM hero_auction_diamond_ledger x WHERE x.account_id=w.account_id) AS diamond_debits,
  (SELECT count(*)::int FROM hero_auction_magic_dust_upgrade_ledger x WHERE x.account_id=w.account_id) AS dust_debits,
  (SELECT count(*)::int FROM hero_auction_login_reward_receipts x WHERE x.account_id=w.account_id) AS daily,
  (SELECT count(*)::int FROM hero_auction_diamond_exchanges x WHERE x.account_id=w.account_id) AS exchanges
  FROM hero_auction_wallets w LEFT JOIN hero_auction_diamond_wallets d USING(account_id)
  LEFT JOIN hero_auction_magic_dust_wallets m USING(account_id) LEFT JOIN hero_auction_commanders c USING(account_id) WHERE w.account_id=$1`,[sub])).rows[0];
}
const intent=(r,{database=pool,randomInt=rng(),policy=chestPolicy,winner=0}={})=>persistVictoryChestIntent({database,room:r,winner,policy,randomInt});
const credit=(r,database=pool)=>creditVictoryChest({database,matchId:victoryMatchId(r)});
const upgrade=(sub,{level=20,database=pool,requestId='pgdust-upgrade-000001'}={})=>upgradeCommanderWithDiamonds({database,accountId:sub,policy:diamondPolicy,magicDustPolicy,request:{stat:'attack',commanderId:'attack',expectedCurrentLevel:level,requestId}});
const exchange=sub=>exchangeDiamondsForGold({database:pool,accountId:sub,policy:exchangePolicy,request:{requestId:'pgdust-exchange-00001',diamondsToSpend:3,expectedRate:500,pricingVersion:'diamonds-to-gold-500-v1'}});
const claim=sub=>claimLoginReward({database:pool,identity:{sub,provider:'google'},policy:dailyPolicy,request:{rewardDate:today}});
function lostCommit(){let armed=true;return{async connect(){const client=await pool.connect();return{async query(...args){const value=await client.query(...args);if(args[0]==='COMMIT'&&armed){armed=false;throw Error('Injected lost COMMIT response')}return value},release:()=>client.release()}}}}
async function rejectSQL(code,query,args=[]){const client=await pool.connect();try{await client.query('BEGIN');await assert.rejects(client.query(query,args),error=>error.code===code,query)}finally{await client.query('ROLLBACK');client.release()}}
async function migration(source){const client=await pool.connect();try{await client.query(source)}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}}
async function schema(){return(await sql(`SELECT c.relname,
 (SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns,
 (SELECT jsonb_agg(jsonb_build_object('type',k.contype,'definition',pg_get_constraintdef(k.oid),'validated',k.convalidated,'enforced',coalesce((to_jsonb(k)->>'conenforced')::boolean,true)) ORDER BY k.contype,k.conname) FROM pg_constraint k WHERE k.conrelid=c.oid) AS constraints
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname`)).rows}
async function withFailure(table,event,sub,run){
 assert.match(table,/^hero_auction_[a-z_]+$/);assert.ok(['INSERT','UPDATE'].includes(event));assert.match(sub,/^[a-z0-9-]+$/);
 await sql(`CREATE FUNCTION pgchest_reject_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'isolated chest write fault'; END $$;
 CREATE TRIGGER pgchest_write_failure BEFORE ${event} ON ${table} FOR EACH ROW WHEN (NEW.account_id='${sub}') EXECUTE FUNCTION pgchest_reject_write();`);
 try{await run()}finally{await sql(`DROP TRIGGER pgchest_write_failure ON ${table}; DROP FUNCTION pgchest_reject_write();`)}
}


const FIXTURE_SIGNING_SECRET='51'.repeat(32); // Known synthetic fixture only; never a production signing key.
function fixtureAuth(sub,name){
 const data=Buffer.from(JSON.stringify({sub,name,provider:'google',expires:Date.now()+3600000})).toString('base64url');
 return data+'.'+createHmac('sha256',Buffer.from(FIXTURE_SIGNING_SECRET,'hex')).update(data).digest('base64url');
}
async function startFixtureServer(){
 // Admission above already verified the exact isolated empty PG18 database.
 // Deliberately do not inherit ambient provider credentials or application flags.
 const socket=createServer();await new Promise((resolve,reject)=>{socket.once('error',reject);socket.listen(0,'127.0.0.1',resolve)});
 const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{
  PORT:String(port),DATABASE_URL:APPROVED,AUTH_SIGNING_SECRET:FIXTURE_SIGNING_SECRET,NODE_ENV:'test',
  HERO_DIAMONDS_ENABLED:'1',HERO_MAGIC_DUST_ENABLED:'1',HERO_VICTORY_CHESTS_ENABLED:'1',
  HERO_DIAMOND_EXCHANGE_ENABLED:'0',HERO_DIAMOND_SIGNUP_BONUS_ENABLED:'0',HERO_LOGIN_REWARDS_ENABLED:'0',
  COMMANDER_TEST_GUEST_MODE:'0',EXPERIMENTAL_COMMANDER_TURNS:'0'
 },stdio:['ignore','pipe','pipe']});
 let logs='',launchError=null;child.once('error',error=>{launchError=error});child.stdout.on('data',value=>logs+=value);child.stderr.on('data',value=>logs+=value);
 const stopped=()=>child.exitCode!==null||child.signalCode!==null;
 const stop=async()=>{if(stopped()||!child.pid)return;const exited=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');const force=setTimeout(()=>child.kill('SIGKILL'),2000);force.unref();try{await exited}finally{clearTimeout(force)}};
 const base='http://127.0.0.1:'+port;
 try{
  const deadline=Date.now()+20000;let info;
  while(Date.now()<deadline){
   if(launchError)throw launchError;if(stopped())throw Error('Fixture server exited: '+logs);
   try{const response=await fetch(base+'/api/info',{signal:AbortSignal.timeout(1000)});if(response.ok){info=await response.json();break}}catch{}
   await new Promise(resolve=>setTimeout(resolve,50));
  }
  assert.ok(info,'Fixture server startup timed out: '+logs);assert.equal(info.victoryChests.enabled,true);assert.equal(info.victoryChests.available,true,logs);
  return{stop,async post(path,body,status=200){const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(5000)});const result=await response.json();assert.equal(response.status,status,JSON.stringify(result)+'\n'+logs);return result}};
 }catch(error){await stop();throw error}
}

try{
 const target=(await sql("SELECT current_database() AS db,current_user AS role,inet_server_port() AS port,current_setting('server_version_num') AS version,current_schema() AS schema")).rows[0];
 assert.equal(target.db,'hero_victory_chests_test');assert.equal(target.role,'test');assert.equal(target.port,5432);assert.equal(target.schema,'public');assert.ok(Number(target.version)>=180000&&Number(target.version)<190000);
 const existing=(await sql("SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%' AND c.relkind IN ('r','p','v','m','f','S')")).rows[0].count;
 assert.equal(existing,0,'REFUSED: dedicated database must be empty; no drop/reset attempted');
 console.log('Dedicated empty disposable PostgreSQL '+target.version+' verified.');
 await sql(`CREATE TABLE hero_auction_wallets(account_id TEXT PRIMARY KEY,gold INTEGER NOT NULL DEFAULT 500 CHECK(gold>=0));
 CREATE TABLE hero_auction_user_profiles(account_id TEXT PRIMARY KEY,display_name TEXT NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
 CREATE TABLE hero_auction_commanders(account_id TEXT PRIMARY KEY,profile JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
 CREATE TABLE hero_auction_gold_awards(award_id TEXT PRIMARY KEY,account_id TEXT NOT NULL,amount INTEGER NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`);
 const names=['001-paid-diamonds-foundation.sql','002-diamond-exchange.sql','003-diamond-signup-bonus.sql','004-login-rewards.sql','005-victory-chests-magic-dust.sql'];
 const files=await Promise.all(names.map(async name=>[name,await readFile(new URL('../migrations/'+name,import.meta.url),'utf8')]));
 for(const [name,source] of files)console.log('MIGRATION '+name+' sha256='+createHash('sha256').update(source).digest('hex'));
 await check('exact migrations apply/reapply and preserve historical upgrade receipts and levels',async()=>{
  for(const [,source] of files.slice(0,4))await migration(source);
  await sql("INSERT INTO hero_auction_wallets(account_id,gold) VALUES('pgchest-grandfather',12345); INSERT INTO hero_auction_commanders(account_id,profile) VALUES('pgchest-grandfather','{\"version\":1,\"commanderId\":\"attack\",\"levels\":{\"attack\":16,\"defense\":0,\"magic\":0,\"support\":0}}'::jsonb);");
  await sql("INSERT INTO hero_auction_upgrade_receipts(account_id,request_id,commander_id,stat,from_level,to_level,gold_cost,diamond_cost,pricing_version) VALUES('pgchest-grandfather','pgchest-old-receipt-0001','attack','attack',15,16,$1,0,'gold-only')",[commanderUpgradeCost(15)]);
  await migration(files[4][1]);const first=await schema();
  for(const [,source] of files)await migration(source);assert.deepEqual(await schema(),first);
  for(const relation of first)for(const constraint of relation.constraints||[]){assert.equal(constraint.validated,true);assert.equal(constraint.enforced,true)}
  const old=(await sql("SELECT gold,profile,magic_dust_cost FROM hero_auction_wallets JOIN hero_auction_commanders USING(account_id) JOIN hero_auction_upgrade_receipts USING(account_id) WHERE account_id='pgchest-grandfather'")).rows[0];assert.equal(old.gold,12345);assert.equal(old.profile.levels.attack,16);assert.equal(old.magic_dust_cost,0);
  assert.equal((await sql('SELECT count(*)::int AS n FROM hero_auction_magic_dust_wallets')).rows[0].n,0,'migration must not backfill balances');
  const replay=await upgradeCommanderWithDiamonds({database:pool,accountId:'pgchest-grandfather',policy:diamondPolicy,magicDustPolicy,request:{stat:'attack',commanderId:'attack',expectedCurrentLevel:15,requestId:'pgchest-old-receipt-0001'}});assert.equal(replay.replayed,true);assert.equal(replay.magicDustCost,0);assert.equal(replay.gold,12345);assert.equal(replay.profile.levels.attack,16);
 });

 await check('actual server restart recovers pre-intent pending match once, isolates winner receipt and permits rematch',async()=>{
  const owner='pgchest-restart-owner',loser='pgchest-restart-loser';await member(owner);await member(loser);
  const cards=battleRoster.slice(0,10).map(hero=>({id:hero.id,name:hero.name,universe:hero.universe,role:hero.role,power:hero.proposedPower,cost:2}));
  assert.equal(cards.length,10);assert.ok(cards.every(card=>Number.isFinite(card.power)));
  const pending={code:'987',created:Date.now(),lastActivity:Date.now(),matchNumber:1,universe:'mixed',phase:'finished',mode:'friend',entryPaid:true,
   cards,round:10,turn:null,deadline:null,topBid:0,topSeat:null,history:[],chat:[],series:[0,0],rematch:[false,false],
   matchSettled:false,battleSettlementPending:false,battleCompleted:[true,true],victoryChestWinner:0,victoryChestPending:true,
   players:[{accountId:owner,name:'Restart winner',token:'restart-owner-seat-token',credits:10,team:cards.slice(0,5)},
    {accountId:loser,name:'Restart loser',token:'restart-loser-seat-token',credits:10,team:cards.slice(5,10)}]};
  const ownerAuth={code:pending.code,token:pending.players[0].token,authToken:fixtureAuth(owner,'Restart winner')};
  const loserAuth={code:pending.code,token:pending.players[1].token,authToken:fixtureAuth(loser,'Restart loser')};
  await sql('CREATE TABLE IF NOT EXISTS hero_auction_rooms(code VARCHAR(3) PRIMARY KEY,state JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
  await sql('INSERT INTO hero_auction_rooms(code,state) VALUES($1,$2::jsonb)',[pending.code,JSON.stringify(pending)]);
  assert.equal((await sql('SELECT count(*)::int AS n FROM hero_auction_victory_chest_intents WHERE match_id=$1',[victoryMatchId(pending)])).rows[0].n,0);
  let app,receipt,creditedOwner,unchangedLoser;
  try{
   app=await startFixtureServer();
   const winner=(await app.post('/api/state',ownerAuth)).room,other=(await app.post('/api/state',loserAuth)).room;
   receipt=winner.victoryChest;assert.equal(receipt.matchId,victoryMatchId(pending));assert.equal(winner.victoryChestPending,false);assert.deepEqual(winner.series,[1,0]);
   assert.equal(other.victoryChest,null);assert.equal(other.victoryChestPending,false);
   await app.post('/api/state',{...ownerAuth,authToken:loserAuth.authToken},403);
   creditedOwner=await snapshot(owner);unchangedLoser=await snapshot(loser);
   assert.equal(creditedOwner.gold,20000+receipt.rewards.gold);assert.equal(creditedOwner.diamonds,20+receipt.rewards.diamonds);assert.equal(creditedOwner.magicDust,20+receipt.rewards.magicDust);
   assert.equal(creditedOwner.intents,1);assert.equal(creditedOwner.chests,1);assert.equal(creditedOwner.awards,1);
   assert.equal(unchangedLoser.gold,20000);assert.equal(unchangedLoser.diamonds,20);assert.equal(unchangedLoser.magicDust,20);assert.equal(unchangedLoser.chests,0);
  }finally{await app?.stop()}
  // Simulate the precise crash window: durable receipt committed, but room JSON
  // still has its original pending marker. Only this synthetic fixture is reset.
  await sql('UPDATE hero_auction_rooms SET state=$2::jsonb WHERE code=$1',[pending.code,JSON.stringify(pending)]);
  app=null;
  try{
   app=await startFixtureServer();
   const again=(await app.post('/api/state',ownerAuth)).room,other=(await app.post('/api/state',loserAuth)).room;
   assert.deepEqual(again.victoryChest,receipt);assert.equal(again.victoryChestPending,false);assert.deepEqual(again.series,[1,0]);assert.equal(other.victoryChest,null);
   assert.deepEqual(await snapshot(owner),creditedOwner);assert.deepEqual(await snapshot(loser),unchangedLoser);
   // Both real HTTP approvals prove recovery no longer blocks the room. Only
   // the normal synthetic 50-gold entry fee is charged; no reward is rerolled.
   assert.equal((await app.post('/api/rematch',ownerAuth)).room.rematch[0],true);
   const next=(await app.post('/api/rematch',loserAuth)).room;assert.equal(next.phase,'auction');assert.equal(next.matchNumber,2);assert.equal(next.victoryChest,null);assert.equal(next.victoryChestPending,false);
   const afterOwner=await snapshot(owner),afterLoser=await snapshot(loser);
   assert.equal(afterOwner.gold,creditedOwner.gold-50);assert.equal(afterLoser.gold,unchangedLoser.gold-50);
   for(const key of ['diamonds','magicDust','intents','chests','awards']){assert.equal(afterOwner[key],creditedOwner[key]);assert.equal(afterLoser[key],unchangedLoser[key])}
  }finally{await app?.stop()}
 });

 today=(await sql("SELECT (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date::text AS day")).rows[0].day;
 await check('12 concurrent intent deliveries roll once, persist before credit and reject a changed winner',async()=>{
  const sub='pgchest-parallel';await member(sub);const r=room(sub),randomInt=rng();const before=await snapshot(sub);
  const intents=await Promise.all(Array.from({length:12},()=>intent(r,{randomInt})));assert.equal(randomInt.calls(),4);assert.ok(intents.every(x=>x.match_id===victoryMatchId(r)&&x.gold_amount===120&&x.magic_dust_amount===5&&x.diamond_amount===1));
  const held=await snapshot(sub);assert.equal(held.intents,1);assert.equal(held.chests,0);assert.equal(held.gold,before.gold);assert.equal(held.diamonds,before.diamonds);assert.equal(held.magicDust,before.magicDust);
  const changed={...r,players:[r.players[1],r.players[0]]};await assert.rejects(intent(changed,{winner:1}),/kazananı farklı/);
  const credits=await Promise.all(Array.from({length:12},()=>credit(r)));assert.equal(credits.filter(x=>!x.replayed).length,1);const after=await snapshot(sub);assert.equal(after.gold,20120);assert.equal(after.diamonds,21);assert.equal(after.magicDust,25);assert.equal(after.chests,1);assert.equal(after.awards,1);
 });
 await check('lost intent/credit COMMIT responses recover the same rewards without reroll or double credit',async()=>{
  const sub='pgchest-uncertain';await member(sub);const r=room(sub),randomInt=rng();await assert.rejects(intent(r,{database:lostCommit(),randomInt}),/lost COMMIT/);assert.equal(randomInt.calls(),4);
  const restored=await intent(r,{randomInt:()=>{throw Error('must not reroll')}});assert.equal(restored.magic_dust_amount,5);assert.equal((await snapshot(sub)).gold,20000);
  await assert.rejects(credit(r,lostCommit()),/lost COMMIT/);const committed=await snapshot(sub);assert.equal(committed.gold,20120);assert.equal((await credit(r)).replayed,true);assert.deepEqual(await snapshot(sub),committed);
  const recovery=await readVictoryChestRecovery(pool,[victoryMatchId(r)]);assert.ok(recovery.some(x=>x.match_id===victoryMatchId(r)&&x.credited_match_id===victoryMatchId(r)));
 });
 await check('actual trigger failures roll back every credit write, receipt and legacy reservation; intent remains retryable',async()=>{
  const writes=[['hero_auction_wallets','UPDATE'],['hero_auction_diamond_wallets','UPDATE'],['hero_auction_magic_dust_wallets','UPDATE'],['hero_auction_victory_chest_receipts','INSERT'],['hero_auction_gold_awards','INSERT']];
  for(const [i,[table,event]] of writes.entries()){
   const sub='pgchest-rollback-'+i;await member(sub);const r=room(sub);await intent(r);const before=await snapshot(sub);
   await withFailure(table,event,sub,async()=>{await assert.rejects(credit(r),/isolated chest write fault/);assert.deepEqual(await snapshot(sub),before)});
   const result=await credit(r);assert.deepEqual(result.receipt.rewards,{gold:120,magicDust:5,diamonds:1});assert.equal((await snapshot(sub)).chests,1);
  }
 });
 await check('parallel different-match wins share wallet locks without lost updates',async()=>{
  const sub='pgchest-many-matches';await member(sub,{diamonds:null,magicDust:null});const rooms=Array.from({length:10},()=>room(sub));await Promise.all(rooms.map(r=>intent(r)));await Promise.all(rooms.map(r=>credit(r)));
  const after=await snapshot(sub);assert.equal(after.gold,21200);assert.equal(after.diamonds,10);assert.equal(after.magicDust,50);assert.equal(after.chests,10);assert.equal(after.awards,10);
 });
 await check('legacy award before intent, after intent or after chest cannot double-award win gold',async()=>{
  const sub='pgchest-legacy';await member(sub);const beforeRoom=room(sub);await sql('INSERT INTO hero_auction_gold_awards(award_id,account_id,amount) VALUES($1,$2,120)',[victoryMatchId(beforeRoom),sub]);await assert.rejects(intent(beforeRoom),/zaten kaydedilmiş/);
  const afterRoom=room(sub);await intent(afterRoom);await sql('INSERT INTO hero_auction_gold_awards(award_id,account_id,amount) VALUES($1,$2,120)',[victoryMatchId(afterRoom),sub]);const before=await snapshot(sub);await assert.rejects(credit(afterRoom),/başka işlemde kaydedilmiş/);assert.deepEqual(await snapshot(sub),before);
  const finishedRoom=room(sub);await intent(finishedRoom);await credit(finishedRoom);const after=await snapshot(sub);const client=await pool.connect();
  try{await client.query('BEGIN');const inserted=await client.query('INSERT INTO hero_auction_gold_awards(award_id,account_id,amount) VALUES($1,$2,120) ON CONFLICT DO NOTHING RETURNING award_id',[victoryMatchId(finishedRoom),sub]);assert.equal(inserted.rowCount,0);if(inserted.rowCount)await client.query('UPDATE hero_auction_wallets SET gold=gold+120 WHERE account_id=$1',[sub]);await client.query('COMMIT')}finally{client.release()}
  assert.deepEqual(await snapshot(sub),after);
 });
 await check('bot, draw, unpaid and unfinished matches or OFF policy cannot create any intent',async()=>{
  const sub='pgchest-ineligible';await member(sub);const before=await snapshot(sub);
  for(const extra of [{mode:'bot'},{entryPaid:false},{phase:'auction'}])await assert.rejects(intent(room(sub,extra)),e=>e.status===503);
  await assert.rejects(intent(room(sub),{winner:null}),e=>e.status===503);await assert.rejects(intent(room(sub),{policy:createVictoryChestPolicy()}),e=>e.status===503);assert.deepEqual(await snapshot(sub),before);
 });
 await check('integer wallet overflow on any currency rejects whole chest without losing intent',async()=>{
  for(const key of ['gold','diamonds','magicDust']){const sub='pgchest-overflow-'+key.toLowerCase();await member(sub,{[key]:2147483647});const r=room(sub);await intent(r);const before=await snapshot(sub);await assert.rejects(credit(r),/sınırını aşıyor/);assert.deepEqual(await snapshot(sub),before)}
 });
 await check('real PK/FK/CHECK constraints protect chest quantities, receipt arithmetic and debit ledgers',async()=>{
  const sub='pgchest-constraints';await member(sub);const r=room(sub);await intent(r);await credit(r);
  await rejectSQL('23514','UPDATE hero_auction_magic_dust_wallets SET magic_dust=-1 WHERE account_id=$1',[sub]);
  for(const [column,value] of [['gold_amount',101],['magic_dust_amount',2],['diamond_amount',2],['winner_seat',2]])await rejectSQL('23514',`UPDATE hero_auction_victory_chest_intents SET ${column}=$2 WHERE match_id=$1`,[victoryMatchId(r),value]);
  await rejectSQL('23514','UPDATE hero_auction_victory_chest_receipts SET gold_after=gold_after+1 WHERE match_id=$1',[victoryMatchId(r)]);
  await rejectSQL('23503','UPDATE hero_auction_victory_chest_receipts SET config_version=$2 WHERE match_id=$1',[victoryMatchId(r),'not-the-intent']);
  await rejectSQL('23505','INSERT INTO hero_auction_victory_chest_receipts SELECT * FROM hero_auction_victory_chest_receipts WHERE match_id=$1',[victoryMatchId(r)]);
  await rejectSQL('23514','INSERT INTO hero_auction_magic_dust_upgrade_ledger(account_id,request_id,delta,balance_before,balance_after) VALUES($1,$2,1,0,1)',[sub,'pgchest-positive-0001']);
  await rejectSQL('23503','INSERT INTO hero_auction_magic_dust_upgrade_ledger(account_id,request_id,delta,balance_before,balance_after) VALUES($1,$2,-1,1,0)',[sub,'pgchest-missing-0001']);
 });
 await check('dust upgrade threshold15→16 and three-currency20→21 are atomic, duplicate-safe and recover lost COMMIT',async()=>{
  const sub='pgdust-threshold';await member(sub,{level:15,gold:commanderUpgradeCost(15),diamonds:0,magicDust:5});const results=await Promise.all(Array.from({length:8},()=>upgrade(sub,{level:15})));assert.equal(results.filter(x=>!x.replayed).length,1);const after=await snapshot(sub);assert.equal(after.gold,0);assert.equal(after.diamonds,0);assert.equal(after.magicDust,0);assert.equal(after.profile.levels.attack,16);assert.equal(after.dust_debits,1);assert.equal(after.diamond_debits,0);
  const lost='pgdust-uncertain';await member(lost);await assert.rejects(upgrade(lost,{database:lostCommit()}),/lost COMMIT/);const replay=await upgrade(lost);assert.equal(replay.replayed,true);assert.equal(replay.cost,7668);assert.equal(replay.diamondCost,10);assert.equal(replay.magicDustCost,13);assert.equal((await snapshot(lost)).dust_debits,1);
 });
 await check('actual upgrade trigger failures roll back every currency, ledger and commander level',async()=>{
  for(const [i,table] of ['hero_auction_magic_dust_wallets','hero_auction_upgrade_receipts','hero_auction_diamond_ledger','hero_auction_magic_dust_upgrade_ledger','hero_auction_commanders'].entries()){
   const sub='pgdust-rollback-'+i;await member(sub);const before=await snapshot(sub),event=table.endsWith('wallets')||table.endsWith('commanders')?'UPDATE':'INSERT';
   await withFailure(table,event,sub,async()=>{await assert.rejects(upgrade(sub),/isolated chest write fault/);assert.deepEqual(await snapshot(sub),before)});assert.equal((await upgrade(sub)).magicDustCost,13);
  }
 });
 await check('real chest/daily/exchange/dust-upgrade concurrent locks conserve all balances in each arrival order',async()=>{
  for(const order of [[0,1,2,3],[3,2,1,0],[1,3,0,2],[2,0,3,1]]){
   const sub='pgchest-cross-'+order.join('');await member(sub);const r=room(sub);await intent(r);const actions=[()=>credit(r),()=>claim(sub),()=>exchange(sub),()=>upgrade(sub)];await Promise.all(order.map(i=>actions[i]()));const after=await snapshot(sub);
   assert.equal(after.gold,14052);assert.equal(after.diamonds,8);assert.equal(after.magicDust,12);assert.equal(after.profile.levels.attack,21);assert.equal(after.chests,1);assert.equal(after.daily,1);assert.equal(after.exchanges,1);assert.equal(after.upgrades,1);
  }
 });
 const endingDay=(await sql("SELECT (clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date::text AS day")).rows[0].day;assert.equal(endingDay,today,'Crossed actual Istanbul midnight: rerun only in a fresh disposable DB');
 console.log(`PASS ${passed} real PostgreSQL victory/dust integration groups; PostgreSQL ${target.version}; synthetic accounts only.`);
 console.log('Not production preflight, cluster-restart proof or activation. No purchases/providers, production flags or production data touched.');
}catch(error){console.error('FAIL disposable victory integration:',error.stack||error.message);process.exitCode=1}
finally{await pool.end()}
