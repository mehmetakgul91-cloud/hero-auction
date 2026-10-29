import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {BOT_ECONOMY} from '../bot-economy.js';
import {createServer} from 'node:net';
import {battleOutcome} from '../battle-result.js';
import {applyHeroDamage,grantLastStand} from '../battle-hp-damage.js';

// Guard before importing PostgreSQL, opening sockets or spawning the app.
const APPROVED='postgresql://test:test@127.0.0.1:5432/hero_bot_live_test';
if(process.env.HERO_BOT_LIVE_TEST_DB!==APPROVED||process.env.DATABASE_URL){console.error('REFUSED: exact disposable loopback HERO_BOT_LIVE_TEST_DB required; remove DATABASE_URL. No connection attempted.');process.exit(1)}
const {default:pg}=await import('pg');
const pool=new pg.Pool({host:'127.0.0.1',port:5432,database:'hero_bot_live_test',user:'test',password:'test',ssl:false,max:10,connectionTimeoutMillis:5000,idleTimeoutMillis:1000,options:'-c statement_timeout=10000 -c lock_timeout=5000',application_name:'hero-disposable-paid-bot-live'});
try{
 assert.equal((await pool.query('SELECT current_database() AS db')).rows[0].db,'hero_bot_live_test');
 assert.equal(Number((await pool.query("SELECT count(*) AS n FROM pg_tables WHERE schemaname='public'")).rows[0].n),0,'Use a fresh empty disposable database; never reset an existing DB.');
 await pool.query('CREATE TABLE hero_auction_wallets(account_id TEXT PRIMARY KEY,gold INTEGER NOT NULL DEFAULT 500 CHECK(gold>=0)); CREATE TABLE hero_auction_magic_dust_wallets(account_id TEXT PRIMARY KEY REFERENCES hero_auction_wallets(account_id),magic_dust INTEGER NOT NULL DEFAULT 0 CHECK(magic_dust>=0)); CREATE TABLE hero_auction_diamond_wallets(account_id TEXT PRIMARY KEY REFERENCES hero_auction_wallets(account_id),diamonds INTEGER NOT NULL DEFAULT 0 CHECK(diamonds>=0)); CREATE TABLE hero_auction_rooms(code VARCHAR(3) PRIMARY KEY,state JSONB NOT NULL,updated_at TIMESTAMPTZ DEFAULT NOW());');
 await pool.query(await readFile(new URL('../migrations/009-bot-fixed-economy.sql',import.meta.url),'utf8'));
}finally{await pool.end()}
const consent=difficulty=>({difficulty,botTermsVersion:BOT_ECONOMY.version,requestId:randomUUID()});

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function assertShieldDamageEvent(event){
 assert.ok(Number.isSafeInteger(event.absorbed)&&event.absorbed>=0,'absorption is whole-point and nonnegative');
 assert.ok(event.absorbed<=Math.floor(event.rawDamage*7/10),'bot/live shield cannot absorb more than 70%');
 // Son Kale already protects a living target at 1 HP for one lethal hit. That
 // explicit guard is not full shield absorption; ordinary zero damage is invalid.
 assert.ok(event.value>0||(event.value===0&&event.guardTriggered===true),'positive damage must reach the target unless Son Kale protects 1 HP: '+JSON.stringify(event));
 assert.ok(event.value+event.absorbed<=event.rawDamage,'HP damage excludes absorbed and overkill damage');
}

test('live shield event invariant permits the explicit 1 HP Last Stand guard, never ordinary zero damage',()=>{
 const target={hp:1,maxHp:100,shield:1000};grantLastStand(target,1);
 const hit=applyHeroDamage(target,100,{round:1}),event={...hit,value:hit.damage};
 assert.equal(target.hp,1);assert.equal(event.value,0);assert.equal(event.guardTriggered,true);assertShieldDamageEvent(event);
 assert.throws(()=>assertShieldDamageEvent({...event,guardTriggered:false}),/positive damage/);
 assert.throws(()=>assertShieldDamageEvent({...event,guardTriggered:'true'}),/positive damage/);
 assert.throws(()=>assertShieldDamageEvent({...event,value:-1}),/positive damage/);
 assert.throws(()=>assertShieldDamageEvent({...event,absorbed:71}),/more than 70%/);
 assertShieldDamageEvent({rawDamage:100,absorbed:70,value:30});
});

test('paid bot matches run authoritative live combat, accept human casts, settle fixed rewards, and rotate on rematch',{timeout:120000},async()=>{
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));
 const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 const base='http://127.0.0.1:'+port;
 // Test-only deterministic deck, commander choices and bidding. Keep cryptographic
 // tokens/auth untouched; room IDs advance so fresh-room checks remain realistic.
 // Preserve bot/hero timer ratios under the existing 30x test clock.
 const botClock='data:text/javascript,'+encodeURIComponent(`
  import crypto from 'node:crypto';
  let roomCode=100;
  crypto.randomInt=(min,max)=>max===undefined?0:(min===100&&max===1000?roomCode++:min);
  Math.random=()=>0;
  const interval=globalThis.setInterval;
  globalThis.setInterval=(fn,ms,...args)=>interval(fn,ms===500?17:ms,...args);
 `);
 const child=spawn(process.execPath,['--import','./tests/fixtures/fast-live-clock.mjs','--import',botClock,'server.js'],{cwd:new URL('..',import.meta.url),env:{PATH:process.env.PATH,PORT:String(port),DATABASE_URL:APPROVED,AUTH_SIGNING_SECRET:'11'.repeat(32),COMMANDER_TEST_GUEST_MODE:'0',HERO_DIAMONDS_ENABLED:'1',HERO_MAGIC_DUST_ENABLED:'1',HERO_VICTORY_CHESTS_ENABLED:'0'},stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
 async function request(path,body){
  const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  return {status:response.status,body:await response.json()};
 }
 async function post(path,body){const response=await request(path,body);assert.equal(response.status,200,JSON.stringify(response.body));return response.body;}
 async function liveGet(code,token){const response=await fetch(base+'/api/experimental/commander-live?'+new URLSearchParams({code,token}));assert.equal(response.status,200);return response.json();}
 try{
  let ready=false;
  for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error(logs);try{const response=await fetch(base+'/api/info');if(response.ok&&(await response.json()).botEconomy?.available){ready=true;break}}catch{}await delay(40)}
  assert.ok(ready,'server did not start: '+logs);
  const auth=await post('/api/auth/guest',{name:'Bot Live Test'});
  let player={authToken:auth.authToken};
  await post('/api/commander/select',{...player,commanderId:'defense'});
  const before=await post('/api/wallet',player);
  const created=await post('/api/bot',{...player,...consent('hard')});
  let expectedGold=before.gold-50,expectedDust=before.magicDust;const expectedDiamonds=before.diamonds;
  assert.equal((await post('/api/wallet',player)).gold,expectedGold,'entry debits exactly 50');
  let code=created.room.code;player.token=created.token;
  assert.deepEqual(created.room.players.map(p=>[p.credits,p.team.length]),[[20,0],[20,0]]);
  assert.equal(created.room.difficulty,'hard');
  const expectedSeries=[0,0];let previousCommander;let shieldedHits=0;
  for(let match=0;match<4;match++){
   let room=(await post('/api/state',{code,...player})).room;
   for(let i=0;room.phase==='auction'&&i<400;i++){
    if(room.turn===0)room=(await post('/api/pass',{code,...player})).room;
    else{await delay(40);room=(await post('/api/state',{code,...player})).room;}
   }
   assert.equal(room.phase,'finished','bot auction must reach formation');
   assert.deepEqual(room.final.map(p=>p.team.length),[5,5]);
   assert.equal(new Set(room.final.flatMap(p=>p.team.map(c=>c.name))).size,10,'only the ten purchased auction heroes enter combat');
   for(const p of room.final)assert.equal(p.credits,20-p.team.reduce((sum,c)=>sum+c.cost,0),'both seats pay the recorded auction prices');
   const teamResponse=await fetch(base+'/api/battle-auction-team?'+new URLSearchParams({code,token:player.token}));
   assert.equal(teamResponse.status,200);const {teams}=await teamResponse.json();
   const formation={code,token:player.token,positions:[0,1,2,3,4],lanes:['front','front','back','back','back'],roles:teams[0].map(h=>h.role)};
   const started=await post('/api/battle-auction-preview',formation);
   assert.deepEqual(started.ready,[true,true]);assert.equal(started.result.live,true);assert.equal(started.result.winner,null);
   const commander=started.result.commanders[1];assert.ok(['attack','defense','magic','support'].includes(commander.commanderId));
   const level={easy:15,medium:25,hard:40}[room.difficulty];
   assert.deepEqual(commander.levels,Object.fromEntries(['attack','defense','magic','support'].map(stat=>[stat,stat===commander.commanderId?level:Math.min(level,20)])),'selected branch follows difficulty; off-branches retain cap20');
   if(match<3)assert.deepEqual(started.result.commanders[0],{commanderId:'defense',levels:{attack:0,defense:0,magic:0,support:0}},'human progression is unchanged');
   if(previousCommander)assert.notEqual(commander.commanderId,previousCommander,'rematches and new bot rooms select a different commander');
   if(match===3)assert.deepEqual(started.result.commanders[0],{commanderId:'attack',levels:{attack:0,defense:0,magic:0,support:0}},'a durable guest without a saved commander can play a paid bot game');
   previousCommander=commander.commanderId;
   assert.equal((await request('/api/battle-auction-complete',{code,token:player.token})).status,409,'cannot acknowledge an unfinished live battle');
   assert.notEqual((await request('/api/rematch',{code,...player})).status,200,'cannot skip live combat with rematch');
   const denied=await fetch(base+'/api/experimental/commander-live?'+new URLSearchParams({code,token:'invalid'}));assert.equal(denied.status,403);
   assert.equal((await request('/api/experimental/commander-live',{code,token:'invalid',ability:'normal',requestId:'bot-test-denied'})).status,403);
   const rejoined=await post('/api/battle-auction-preview',{...formation,positions:[4,3,2,1,0]});
   assert.deepEqual(rejoined.result.commanders,started.result.commanders,'rejoining does not reroll commanders');
   assert.deepEqual(rejoined.result.teams,started.result.teams,'repeated formation confirmation cannot reset live initial state');
   let live,humanCast=false;
   for(let i=0;i<500;i++){
    live=await liveGet(code,player.token);
    if(live.finished)break;
    if(!humanCast&&live.abilities[0].canUseNormal){
     const cast=await request('/api/experimental/commander-live',{code,token:player.token,ability:'normal',requestId:'human-bot-match-'+match});
     if(cast.status===200){humanCast=true;assert.ok(cast.body.cast.events.some(e=>e.actor==='commander:0'));}
     else assert.equal(cast.status,422,'only a concurrent effect lock can reject an otherwise ready cast');
    }
    await delay(25);
   }
   assert.equal(live.finished,true,'live battle must finish');assert.ok(humanCast,'human commander actions are enabled against bots');
   if(match===3){
    assert.equal(commander.commanderId,'attack','the deterministic easy scenario uses the attack commander');
    assert.ok(live.events.some(e=>e.actor==='commander:1'&&e.action==='commander-attack-normal'),'the easy bot autonomously casts a normal attack through the live engine');
   }
   const damageEvents=live.events.filter(e=>Number.isFinite(e.rawDamage)&&e.rawDamage>0);
   assert.ok(damageEvents.length>0,'bot match must expose authoritative damage events');
   for(const event of damageEvents){
    assertShieldDamageEvent(event);
    if(event.absorbed>0)shieldedHits++;
   }
   assert.equal(live.winner,battleOutcome(live.teams).winner);
   assert.ok(live.summary.actionCount>0);
   if(live.winner!==null)expectedSeries[live.winner]++;
   for(let retry=0;retry<200;retry++){room=(await post('/api/state',{code,...player})).room;if(room.botSettlement&&!room.botSettlementPending)break;await delay(25)}
   assert.ok(room.botSettlement&&!room.botSettlementPending,'durable bot settlement must complete');
   const reward=live.winner===0?BOT_ECONOMY.difficulties[room.difficulty]:{gold:live.winner===null?50:0,magicDust:0};
   expectedGold+=reward.gold;expectedDust+=reward.magicDust;
   assert.deepEqual(room.botSettlement.rewards,{gold:reward.gold,magicDust:reward.magicDust,diamonds:0});
   for(let repeat=0;repeat<2;repeat++)assert.deepEqual((await post('/api/battle-auction-complete',{code,token:player.token})).series,expectedSeries,'completion is idempotent');
   room=(await post('/api/state',{code,...player})).room;
   assert.deepEqual(room.series,expectedSeries);assert.deepEqual(room.rankChange,[0,0]);
   const balance=await post('/api/wallet',player);assert.equal(balance.gold,expectedGold);assert.equal(balance.magicDust,expectedDust);assert.equal(balance.diamonds,expectedDiamonds,'bot cannot award diamonds');
   if(match===0){
    const next=(await post('/api/rematch',{code,...player,...consent(room.difficulty),expectedMatchId:room.matchId})).room;expectedGold-=50;
    assert.equal(next.phase,'auction');assert.deepEqual(next.series,expectedSeries);
    assert.deepEqual(next.players.map(p=>[p.credits,p.team.length]),[[20,0],[20,0]]);
    const expired=await fetch(base+'/api/experimental/commander-live?'+new URLSearchParams({code,token:player.token}));assert.equal(expired.status,409,'old live session is inaccessible after rematch');
   }else if(match<3){
    if(match===2){
     const fresh=await post('/api/auth/guest',{name:'No Commander Bot Test'});
     player={authToken:fresh.authToken};previousCommander=null;const freshWallet=await post('/api/wallet',player);expectedGold=freshWallet.gold;expectedDust=freshWallet.magicDust;assert.equal(freshWallet.diamonds,expectedDiamonds);
    }
    const next=await post('/api/bot',{...player,...consent(match===2?'easy':'medium')});expectedGold-=50;
    code=next.room.code;player.token=next.token;expectedSeries[0]=0;expectedSeries[1]=0;
    assert.deepEqual(next.room.players.map(p=>[p.credits,p.team.length]),[[20,0],[20,0]]);
   }
  }
  assert.ok(shieldedHits>0,'the bot/live shield check must exercise real shield absorption');
  assert.equal((await post('/api/wallet',player)).gold,expectedGold,'all entries and terminal receipts reconcile exactly');
  assert.equal((await post('/api/commander/get',player)).profile,null,'bot commander fallback does not create a persistent human commander');
  assert.doesNotMatch(logs,/Live arena stopped:|Bot commander action:/,'the bot must not throw or stop the live runner');
 }finally{child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(resolve,2000).unref()})}
});

test('real process restart retains paid auction and refunds a persisted interrupted live battle exactly once',{timeout:60000},async()=>{
 const fixtureDb=new pg.Pool({host:'127.0.0.1',port:5432,database:'hero_bot_live_test',user:'test',password:'test',ssl:false,max:3,connectionTimeoutMillis:5000,idleTimeoutMillis:1000,options:'-c statement_timeout=10000 -c lock_timeout=5000',application_name:'hero-synthetic-bot-restart-proof'});
 const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));
 const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 const base='http://127.0.0.1:'+port;
 // Fixture-only scheduling: auction decisions are accelerated; live hero ticks
 // are held so a real unfinished simulation remains available until SIGKILL.
 // Room flushes still run and their actual PostgreSQL state is checked below.
 const restartClock='data:text/javascript,'+encodeURIComponent(`
  import crypto from 'node:crypto';
  let roomCode=700;
  crypto.randomInt=(min,max)=>max===undefined?0:(min===100&&max===1000?roomCode++:min);
  Math.random=()=>0;
  const interval=globalThis.setInterval;
  globalThis.setInterval=(fn,ms,...args)=>interval(fn,ms===50?60000:ms===500?17:ms===1000?25:ms,...args);
 `);
 const appEnv={PATH:process.env.PATH,PORT:String(port),DATABASE_URL:APPROVED,AUTH_SIGNING_SECRET:'11'.repeat(32),COMMANDER_TEST_GUEST_MODE:'0',HERO_DIAMONDS_ENABLED:'1',HERO_MAGIC_DUST_ENABLED:'1',HERO_VICTORY_CHESTS_ENABLED:'0'};
 let child=null,logs='';
 async function start(){
  child=spawn(process.execPath,['--import','./tests/fixtures/fast-live-clock.mjs','--import',restartClock,'server.js'],{cwd:new URL('..',import.meta.url),env:appEnv,stdio:['ignore','pipe','pipe']});
  logs+='\n--- restart fixture boot ---\n';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
  for(let retry=0;retry<150;retry++){
   if(child.exitCode!==null||child.signalCode!==null)throw Error('Restart fixture exited: '+logs);
   try{const response=await fetch(base+'/api/info');if(response.ok&&(await response.json()).botEconomy?.available)return}catch{}
   await delay(40);
  }
  throw Error('Restart fixture failed to start: '+logs);
 }
 async function stop(signal){
  if(!child||child.exitCode!==null||child.signalCode!==null)return;
  const processToStop=child;
  await new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>{processToStop.kill('SIGKILL');reject(Error('Fixture process did not exit after '+signal))},5000);
   processToStop.once('exit',(_code,actualSignal)=>{clearTimeout(timeout);if(signal==='SIGKILL'&&actualSignal!=='SIGKILL')reject(Error('Crash fixture did not receive SIGKILL'));else resolve()});
   processToStop.kill(signal);
  });
 }
 async function post(path,body){const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const json=await response.json();assert.equal(response.status,200,JSON.stringify(json));return json}
 async function durableRoom(code){return(await fixtureDb.query('SELECT state FROM hero_auction_rooms WHERE code=$1',[code])).rows[0]?.state}
 async function proof(matchId){
  return(await fixtureDb.query(`SELECT e.account_id,e.entry_gold,w.gold,
    COALESCE(d.diamonds,0) AS diamonds,COALESCE(m.magic_dust,0) AS magic_dust,
    (SELECT count(*)::int FROM hero_auction_bot_entries x WHERE x.account_id=e.account_id) AS entries,
    (SELECT count(*)::int FROM hero_auction_bot_settlements x WHERE x.match_id=e.match_id) AS settlements,
    s.outcome,s.gold_amount,s.magic_dust_amount
    FROM hero_auction_bot_entries e JOIN hero_auction_wallets w USING(account_id)
    LEFT JOIN hero_auction_diamond_wallets d USING(account_id)
    LEFT JOIN hero_auction_magic_dust_wallets m USING(account_id)
    LEFT JOIN hero_auction_bot_settlements s ON s.match_id=e.match_id
    WHERE e.match_id=$1`,[matchId])).rows[0];
 }
 try{
  await start();
  const auth=await post('/api/auth/guest',{name:'Synthetic Restart Proof'}),terms=consent('medium');
  const created=await post('/api/bot',{authToken:auth.authToken,...terms});
  const identity={code:created.room.code,token:created.token,authToken:auth.authToken},matchId=created.room.matchId;
  const admitted=await durableRoom(identity.code);
  assert.equal(admitted.phase,'auction');assert.equal(admitted.botEntry.matchId,matchId);assert.equal(admitted.battleSync?.result,undefined);
  const paid=await proof(matchId);assert.equal(paid.gold,450);assert.equal(paid.entries,1);assert.equal(paid.settlements,0);
  // Actual abrupt process loss before live combat must NOT create a refund.
  await stop('SIGKILL');await start();
  let room=(await post('/api/state',identity)).room;
  assert.equal(room.matchId,matchId);assert.equal(room.phase,'auction');assert.equal(room.botSettlement,null);
  const replay=await post('/api/bot',{authToken:auth.authToken,...terms});
  assert.equal(replay.room.matchId,matchId);assert.equal(replay.token,identity.token);
  assert.deepEqual(await proof(matchId),paid,'auction restart/reconnect and request replay do not charge or refund');
  for(let retry=0;room.phase==='auction'&&retry<400;retry++){
   if(room.turn===0)room=(await post('/api/pass',identity)).room;
   else{await delay(40);room=(await post('/api/state',identity)).room;}
  }
  assert.equal(room.phase,'finished');assert.equal(room.botSettlement,null);
  const teamResponse=await fetch(base+'/api/battle-auction-team?'+new URLSearchParams({code:identity.code,token:identity.token}));assert.equal(teamResponse.status,200);
  const {teams}=await teamResponse.json();
  const started=await post('/api/battle-auction-preview',{code:identity.code,token:identity.token,positions:[0,1,2,3,4],lanes:['front','front','back','back','back'],roles:teams[0].map(hero=>hero.role)});
  assert.equal(started.result.live,true);assert.notEqual(started.result.finished,true);
  let persisted;
  for(let retry=0;retry<200;retry++){
   persisted=await durableRoom(identity.code);
   if(persisted?.battleSync?.result?.live&&persisted.battleSync.result.finished!==true)break;
   await delay(25);
  }
  assert.equal(persisted.botEntry.matchId,matchId);
  assert.equal(persisted.battleSync?.result?.live,true,'must prove unfinished live state is durably stored BEFORE killing the app');
  assert.notEqual(persisted.battleSync.result.finished,true);assert.notEqual(persisted.matchSettled,true);
  assert.equal((await proof(matchId)).settlements,0,'no outcome existed before actual process loss');
  await stop('SIGKILL');await start();
  for(let retry=0;retry<200;retry++){
   room=(await post('/api/state',identity)).room;
   if(room.botSettlement&&!room.botSettlementPending)break;
   await delay(25);
  }
  assert.equal(room.matchId,matchId);assert.equal(room.botSettlement?.outcome,'server_failure');
  assert.deepEqual(room.botSettlement.rewards,{gold:50,magicDust:0,diamonds:0});assert.equal(room.victoryChest,null);assert.deepEqual(room.series,[0,0]);
  const receipt=room.botSettlement,refunded=await proof(matchId);
  assert.equal(refunded.gold,500);assert.equal(refunded.entry_gold,50);assert.equal(refunded.entries,1);assert.equal(refunded.settlements,1);
  assert.equal(refunded.outcome,'server_failure');assert.equal(refunded.gold_amount,50);assert.equal(refunded.magic_dust_amount,0);assert.equal(refunded.diamonds,0);assert.equal(refunded.magic_dust,0);
  for(let repeat=0;repeat<3;repeat++){
   assert.deepEqual((await post('/api/state',identity)).room.botSettlement,receipt);
   assert.equal((await post('/api/wallet',{authToken:auth.authToken})).gold,500);
  }
  // A further real restart must recover the SAME terminal receipt, not refund again.
  await stop('SIGKILL');await start();
  assert.deepEqual((await post('/api/state',identity)).room.botSettlement,receipt);
  assert.deepEqual(await proof(matchId),refunded);
  assert.equal((await post('/api/bot',{authToken:auth.authToken,...terms})).room.matchId,matchId);
  assert.deepEqual(await proof(matchId),refunded);
 }finally{try{await stop('SIGTERM')}finally{await fixtureDb.end()}}
});
