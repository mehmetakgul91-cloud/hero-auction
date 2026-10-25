import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCommanderProfile} from '../arena-commanders.js';
import {createDiamondPolicy,upgradeCommanderWithDiamonds} from '../paid-diamonds.js';
import {createDiamondExchangePolicy,exchangeDiamondsForGold} from '../paid-diamond-exchange.js';
import {createLoginRewardPolicy,isGoogleRewardMember,loginRewardView,readLoginRewardStatus,claimLoginReward} from '../login-rewards.js';

const flags={HERO_DIAMONDS_ENABLED:'1',HERO_LOGIN_REWARDS_ENABLED:'1'};
const policy=createLoginRewardPolicy(flags);
const identity={sub:'isolated-google-member',provider:'google'};
const rewards=[{day:1,gold:100,diamonds:0},{day:2,gold:150,diamonds:0},{day:3,gold:200,diamonds:0},{day:4,gold:250,diamonds:0},{day:5,gold:300,diamonds:0},{day:6,gold:400,diamonds:0},{day:7,gold:0,diamonds:5}];
const copy=value=>structuredClone(value);
const istanbulDay=now=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));

// This is an isolated in-memory SQL/row-lock/transaction fault model, NOT a real
// PostgreSQL test. It runs the production service functions with independent
// transaction buffers and per-row locks. It never accesses a production database.
function fixture({gold=500,diamonds=0,profile=true,now='2026-10-25T20:59:59.999Z',lostCommit=false,missingTable=null,failAt=null}={}){
 const state={gold,diamonds,profile,commander:{...createCommanderProfile('attack'),levels:{attack:20,defense:0,magic:0,support:0}},streak:null,receipts:new Map(),upgrades:new Map(),exchanges:new Map(),diamondLedger:[]};
 const queries=[];const locks=new Map();let clock=now,loseCommit=lostCommit,released=0;
 const database={async query(sql,args=[]){
  queries.push({sql,args:copy(args)});
  assert.equal(args[0],identity.sub);assert.match(sql,/clock_timestamp\(\).*Europe\/Istanbul/s);
  assert.match(sql,/LEFT JOIN hero_auction_login_reward_streaks/);
  if(missingTable&&sql.includes(missingTable))throw Object.assign(Error('Missing relation'),{code:'42P01'});
  const streak=state.streak,receipt=[...state.receipts.values()].sort((a,b)=>b.reward_date.localeCompare(a.reward_date))[0]||null;
  return {rows:[{server_day:istanbulDay(clock),...copy(streak),...copy(receipt),day_index:streak?.day_index,receipt_day:receipt?.day_index}]};
 },async connect(){
  const held=new Map(),writes=new Map();let active=false;
  const read=key=>copy(writes.has(key)?writes.get(key):state[key]);
  const put=(key,value)=>writes.set(key,copy(value));
  const lock=async key=>{if(held.has(key))return;const previous=locks.get(key)||Promise.resolve();let release;const next=new Promise(resolve=>release=resolve);locks.set(key,next);await previous;held.set(key,release);};
  const unlock=()=>{for(const release of held.values())release();held.clear();};
  const rows=value=>({rows:value===null?[]:[copy(value)],rowCount:value===null?0:1});
  return {release(){assert.equal(active,false,'released transaction must be committed or rolled back');released++;unlock();},async query(sql,args=[]){
   queries.push({sql,args:copy(args)});
   if(sql==='BEGIN'){active=true;return{rows:[]}};
   if(sql==='ROLLBACK'){writes.clear();active=false;unlock();return{rows:[]}};
   if(sql==='COMMIT'){for(const [key,value] of writes)state[key]=copy(value);writes.clear();active=false;unlock();if(loseCommit){loseCommit=false;throw Error('Lost COMMIT response')}return{rows:[]}};
   assert.ok(active,'service operations belong to a transaction');
   if(missingTable&&sql.includes(missingTable))throw Object.assign(Error('Missing relation'),{code:'42P01'});
   if(failAt&&sql.startsWith(failAt))throw Error('Injected storage failure');
   if(sql.startsWith('SELECT (clock_timestamp()')){
    assert.ok(held.has('profile'),'fresh server clock is read after per-member profile serialization');
    assert.match(sql,/Europe\/Istanbul/);
    return rows({server_day:istanbulDay(clock),today:istanbulDay(clock),server_now:clock,now:clock});
   }
   assert.equal(args[0],identity.sub,'all reads/writes are scoped to trusted authenticated subject');
   if(sql.includes('FROM hero_auction_user_profiles')){if(sql.includes('FOR UPDATE'))await lock('profile');return rows(read('profile')?{account_id:identity.sub}:null)}
   if(sql.startsWith('SELECT profile FROM hero_auction_commanders')){if(sql.includes('FOR UPDATE'))await lock('commander');return rows({profile:read('commander')})}
   if(sql.startsWith('SELECT gold FROM hero_auction_wallets')){if(sql.includes('FOR UPDATE'))await lock('gold');return rows(read('gold')===null?null:{gold:read('gold')})}
   if(sql.startsWith('INSERT INTO hero_auction_diamond_wallets')){await lock('diamond');if(read('diamonds')===null){put('diamonds',0);return rows({diamonds:0})}return{rows:[],rowCount:0}}
   if(sql.startsWith('SELECT diamonds FROM hero_auction_diamond_wallets')){if(sql.includes('FOR UPDATE'))await lock('diamond');return rows(read('diamonds')===null?null:{diamonds:read('diamonds')})}
   if(sql.startsWith('UPDATE hero_auction_wallets')){
    await lock('gold');const value=read('gold'),amount=args[1];
    const credit=/gold=gold\+\$2/.test(sql);assert.match(sql,credit?/gold<=\$3/:/gold>=\$2/);
    if(value===null||(credit?value>args[2]:value<amount))return rows(null);
    put('gold',value+(credit?amount:-amount));return rows({gold:read('gold')});
   }
   if(sql.startsWith('UPDATE hero_auction_diamond_wallets')){
    await lock('diamond');const value=read('diamonds'),amount=args[1];
    const credit=/diamonds=diamonds\+\$2/.test(sql);assert.match(sql,credit?/diamonds<=\$3/:/diamonds>=\$2/);
    if(value===null||(credit?value>args[2]:value<amount))return rows(null);
    put('diamonds',value+(credit?amount:-amount));return rows({diamonds:read('diamonds')});
   }
   if(sql.startsWith('SELECT provider,last_reward_date')){assert.ok(held.has('profile'));return rows(read('streak'))}
   if(sql.startsWith('SELECT reward_date::text,day_index')){assert.ok(held.has('profile'));return rows(sql.includes('ORDER BY reward_date DESC')?[...read('receipts').values()].sort((a,b)=>b.reward_date.localeCompare(a.reward_date))[0]||null:read('receipts').get(args[1])||null)}
   if(sql.startsWith('INSERT INTO hero_auction_login_reward_receipts')){
    assert.ok(held.has('profile')&&held.has('gold')&&held.has('diamond'));
    const receipts=read('receipts');assert.equal(receipts.has(args[1]),false);
    assert.deepEqual(rewards[args[2]-1],{day:args[2],gold:args[3],diamonds:args[4]});
    assert.equal(args[6],args[5]+args[3]);assert.equal(args[8],args[7]+args[4]);
    receipts.set(args[1],{reward_date:args[1],day_index:args[2],gold_amount:args[3],diamond_amount:args[4],gold_before:args[5],gold_after:args[6],diamonds_before:args[7],diamonds_after:args[8]});put('receipts',receipts);return{rows:[]};
   }
   if(sql.startsWith('INSERT INTO hero_auction_login_reward_streaks')){
    assert.ok(held.has('profile'));assert.match(sql,/VALUES\(\$1,'google',\$2::date,\$3\)/);
    assert.ok(read('receipts').has(args[1]));put('streak',{provider:'google',last_reward_date:args[1],day_index:args[2]});return{rows:[]};
   }
   if(sql.startsWith('SELECT commander_id,stat'))return rows(read('upgrades').get(args[1])||null);
   if(sql.startsWith('INSERT INTO hero_auction_upgrade_receipts')){const map=read('upgrades');assert.equal(map.has(args[1]),false);map.set(args[1],{commander_id:args[2],stat:args[3],from_level:args[4],gold_cost:args[6],diamond_cost:args[7],pricing_version:args[8]});put('upgrades',map);return{rows:[]}}
   if(sql.startsWith('INSERT INTO hero_auction_diamond_ledger')){const list=read('diamondLedger');assert.ok(args[2]<0);assert.equal(args[3]+args[2],args[4]);list.push(args);put('diamondLedger',list);return{rows:[]}}
   if(sql.startsWith('UPDATE hero_auction_commanders')){put('commander',JSON.parse(args[1]));return{rows:[]}}
   if(sql.startsWith('SELECT diamonds_spent'))return rows(read('exchanges').get(args[1])||null);
   if(sql.startsWith('INSERT INTO hero_auction_diamond_exchanges')){const map=read('exchanges');assert.equal(map.has(args[1]),false);map.set(args[1],{diamonds_spent:args[2],gold_granted:args[3],exchange_rate:args[4],pricing_version:args[5]});put('exchanges',map);return{rows:[]}}
   throw Error('Unexpected SQL: '+sql);
  }};
 }};
 return {database,state,queries,setNow:next=>clock=next,setFailure:next=>failAt=next,setLostCommit:next=>loseCommit=next,released:()=>released,
  run:(request={rewardDate:istanbulDay(clock)},extra={})=>claimLoginReward({database,identity,policy,request,...extra}),
  status:(extra={})=>readLoginRewardStatus({database,identity,policy,...extra})};
}

test('campaign requires both explicit flags; a week never starts while day7 diamonds are disabled',()=>{
 for(const env of [{},{HERO_DIAMONDS_ENABLED:'1'},{HERO_LOGIN_REWARDS_ENABLED:'1'},{...flags,HERO_DIAMONDS_ENABLED:1},{...flags,HERO_LOGIN_REWARDS_ENABLED:true},{...flags,HERO_LOGIN_REWARDS_ENABLED:'true'}])assert.equal(createLoginRewardPolicy(env).enabled,false);
 assert.equal(policy.enabled,true);
});
test('reward schedule is six increasing gold awards and exactly five diamonds on day7',()=>{
 const view=loginRewardView({policy,identity,serverDay:'2026-10-25',state:null,receipt:null});
 assert.deepEqual(view.rewards,rewards);assert.equal(view.timezone,'Europe/Istanbul');assert.equal(view.nextDay,1);assert.equal(view.completedDay,0);assert.equal(view.claimedToday,false);
});
test('eligibility accepts only normalized trusted Google identity, not email or forged prefixes',()=>{
 assert.equal(isGoogleRewardMember(identity),true);
 for(const member of [null,{}, {sub:identity.sub}, {sub:identity.sub,email:'member@example.test'}, {sub:identity.sub,provider:'apple'},{sub:identity.sub,provider:'crazygames'},{sub:'guest:abc',provider:'google'},{sub:'crazygames:game:member',provider:'google'},{sub:'',provider:'google'},{sub:'id with spaces',provider:'google'}])assert.equal(isGoogleRewardMember(member),false,JSON.stringify(member));
});
const dayClock=offset=>new Date(Date.UTC(2026,9,25+offset,18)).toISOString();
async function claimDays(f,count){let result;for(let index=0;index<count;index++){f.setNow(dayClock(index));result=await f.run()}return result;}
const snapshot=f=>copy(f.state);

test('status is read-only; disabled, ineligible and unavailable status never promise a grant',async()=>{
 const f=fixture(),before=snapshot(f),view=await f.status();
 assert.equal(view.available,true);assert.equal(view.serverDay,'2026-10-25');assert.deepEqual(f.state,before);assert.equal(f.queries.length,1);assert.match(f.queries[0].sql,/^SELECT /);
 for(const args of [{policy:createLoginRewardPolicy()},{identity:{sub:'guest:abc',provider:'guest'}},{database:null}]){
  const guarded=fixture();const status=await guarded.status(args);assert.equal(status.available,false);assert.equal(guarded.queries.length,0);
 }
 const missing=fixture({missingTable:'hero_auction_login_reward_streaks'});assert.equal((await missing.status()).reason,'storage_unavailable');assert.equal(missing.state.gold,500);
});
test('first claim credits exactly approved100 gold; browser account, day, amount and provider are ignored',async()=>{
 const f=fixture({diamonds:10});
 const result=await f.run({rewardDate:'2026-10-25',accountId:'someone-else',sub:'other',provider:'google',day:7,day_index:7,amount:999999,gold:999999,diamonds:999999,now:'2030-01-01'});
 assert.deepEqual(result.receipt,{day:1,gold:100,diamonds:0,rewardDate:'2026-10-25'});assert.equal(result.replayed,false);assert.equal(result.gold,600);assert.equal(result.diamonds,10);
 assert.equal(f.state.receipts.size,1);assert.equal(f.state.gold,600);assert.equal(f.state.diamonds,10);assert.equal(result.loginRewards.claimedToday,true);assert.equal(result.loginRewards.available,false);
 assert.equal(f.queries.at(-1).sql,'COMMIT');assert.equal(f.released(),1);
});
test('same-day repeated claim returns same receipt with current balances and does not advance',async()=>{
 const f=fixture();const original=await f.run();f.state.gold=123;
 const result=await f.run();assert.deepEqual(result.receipt,original.receipt);assert.equal(result.replayed,true);assert.equal(result.gold,123);assert.equal(f.state.streak.day_index,1);assert.equal(f.state.receipts.size,1);
 const status=await f.status();assert.equal(status.claimedToday,true);assert.equal(status.nextDay,2);assert.equal(status.completedDay,1);
});
test('concurrent sessions serialize a calendar day to exactly one credit and one durable receipt',async()=>{
 const f=fixture();const results=await Promise.all(Array.from({length:12},()=>f.run()));
 assert.equal(results.filter(result=>!result.replayed).length,1);assert.equal(results.filter(result=>result.replayed).length,11);assert.equal(f.state.gold,600);assert.equal(f.state.receipts.size,1);assert.equal(f.released(),12);
});
test('fourteen consecutive days repeat the six-gold-plus-five-diamond campaign without extra day7 gold',async()=>{
 const f=fixture({diamonds:null});
 for(let index=0;index<14;index++){
  f.setNow(dayClock(index));const previousGold=f.state.gold,result=await f.run();
  assert.equal(result.receipt.day,index%7+1);assert.equal(result.gold,previousGold+rewards[index%7].gold);
  if(index%7===6){assert.equal(result.receipt.gold,0);assert.equal(result.receipt.diamonds,5)}
 }
 assert.equal(f.state.gold,3300);assert.equal(f.state.diamonds,10);assert.equal(f.state.receipts.size,14);assert.equal(f.state.streak.day_index,7);
 f.setNow(dayClock(14));const next=await f.run();assert.equal(next.receipt.day,1);assert.equal(next.gold,3400);assert.equal(next.diamonds,10);
});
test('missing even one Istanbul calendar day resets to day1; no retroactive catchup',async()=>{
 for(const gap of [2,3,30,370]){
  const f=fixture();await claimDays(f,6);f.setNow(dayClock(5+gap));
  const status=await f.status();assert.equal(status.nextDay,1);assert.equal(status.completedDay,0);
  const result=await f.run();assert.equal(result.receipt.day,1);assert.equal(result.receipt.gold,100);assert.equal(result.receipt.diamonds,0);assert.equal(f.state.receipts.size,7);
 }
});
test('Istanbul midnight is UTC21:00: consecutive days may be only one millisecond apart',async()=>{
 const f=fixture({now:'2026-10-25T20:59:59.999Z'});const before=await f.run();assert.equal(before.receipt.rewardDate,'2026-10-25');
 f.setNow('2026-10-25T21:00:00.000Z');const after=await f.run();assert.equal(after.receipt.rewardDate,'2026-10-26');assert.equal(after.receipt.day,2);assert.equal(after.gold,750);
 f.setNow('2026-10-26T00:00:00.000Z');const utcMidnight=await f.run();assert.equal(utcMidnight.replayed,true);assert.equal(utcMidnight.gold,750);assert.equal(f.state.receipts.size,2);
});
test('actual timezone conversion remains correct across month/year boundary and leap-day gap',async()=>{
 for(const [before,after] of [['2026-12-31T20:59:59.999Z','2026-12-31T21:00:00.000Z'],['2028-02-28T20:59:59.999Z','2028-02-28T21:00:00.000Z'],['2028-02-29T20:59:59.999Z','2028-02-29T21:00:00.000Z']]){
  const f=fixture({now:before});await f.run();f.setNow(after);assert.equal((await f.run()).receipt.day,2);
 }
});
test('clock regression fails closed even if an older valid receipt exists',async()=>{
 const f=fixture();await claimDays(f,2);const before=snapshot(f);f.setNow(dayClock(0));
 const status=await f.status();assert.equal(status.available,false);assert.equal(status.reason,'clock_regression');
 await assert.rejects(f.run({rewardDate:'2026-10-25'}),error=>error.status===503);assert.deepEqual(f.state,before);
 f.setNow(dayClock(1));assert.equal((await f.run()).replayed,true);assert.deepEqual(f.state,before);
});
test('invalid dates, client-future dates and unclaimed past dates cannot create awards',async()=>{
 for(const date of [undefined,null,123,'2026-2-1','2026-02-30','2026-13-01','2026-10-25T00:00:00Z','2026-10-25\n']){
  const f=fixture();await assert.rejects(f.run({rewardDate:date}),error=>error.status===400);assert.equal(f.queries.length,0);
 }
 for(const date of ['2026-10-24','2026-10-26','2099-01-01']){const f=fixture(),before=snapshot(f);await assert.rejects(f.run({rewardDate:date}),error=>error.status===409);assert.deepEqual(f.state,before)}
});
test('old receipt recovery after midnight does not accidentally claim the new day',async()=>{
 const f=fixture();await f.run();f.setNow('2026-10-25T21:00:00Z');const replay=await f.run({rewardDate:'2026-10-25'});
 assert.equal(replay.replayed,true);assert.equal(replay.gold,600);assert.equal(replay.receipt.rewardDate,'2026-10-25');assert.equal(replay.loginRewards.claimedToday,false);assert.equal(replay.loginRewards.nextDay,2);assert.equal(f.state.receipts.size,1);
 assert.equal((await f.run()).receipt.day,2);assert.equal(f.state.receipts.size,2);
});
test('fresh DB clock is sampled after a profile-lock wait crossing Istanbul midnight',async()=>{
 const f=fixture();const holder=await f.database.connect();await holder.query('BEGIN');await holder.query('SELECT account_id FROM hero_auction_user_profiles WHERE account_id=$1 FOR UPDATE',[identity.sub]);
 const pending=f.run({rewardDate:'2026-10-25'});f.setNow('2026-10-25T21:00:00Z');await holder.query('COMMIT');holder.release();
 await assert.rejects(pending,error=>error.status===409);assert.equal(f.state.gold,500);assert.equal(f.state.receipts.size,0);
 const result=await f.run();assert.equal(result.receipt.rewardDate,'2026-10-26');assert.equal(result.receipt.day,1);
});
test('disabled or non-Google identities cannot touch storage despite forged request provider',async()=>{
 for(const extra of [{policy:createLoginRewardPolicy()},{identity:{sub:'guest:abc',provider:'guest'}},{identity:{sub:'crazygames:game:user',provider:'crazygames'}},{identity:{sub:identity.sub,provider:'apple'}},{identity:{sub:identity.sub,email:'member@example.test'}},{identity:null},{database:null}]){
  const f=fixture();await assert.rejects(f.run({rewardDate:'2026-10-25',provider:'google',email:'member@example.test',verified:true},extra),error=>[403,503].includes(error.status));assert.equal(f.queries.length,0);
 }
});
for(const missingTable of ['hero_auction_login_reward_streaks','hero_auction_login_reward_receipts','hero_auction_diamond_wallets'])test(`unapplied ${missingTable} fails before wallet writes`,async()=>{
 const f=fixture({missingTable}),before=snapshot(f);await assert.rejects(f.run(),error=>error.status===503);assert.deepEqual(f.state,before);assert.equal(f.queries.some(({sql})=>/^(UPDATE|INSERT)/.test(sql)),false);assert.equal(f.released(),1);
});
for(const options of [{profile:false},{gold:null}])test(`missing required member/wallet ${JSON.stringify(options)} is unavailable, never auto-created`,async()=>{
 const f=fixture(options),before=snapshot(f);await assert.rejects(f.run(),error=>error.status===503);assert.deepEqual(f.state,before);assert.equal(f.released(),1);
});
for(const step of ['UPDATE hero_auction_wallets','INSERT INTO hero_auction_login_reward_receipts','INSERT INTO hero_auction_login_reward_streaks'])test(`day1 failure at ${step} rolls back award, ledger and streak together`,async()=>{
 const f=fixture({failAt:step}),before=snapshot(f);await assert.rejects(f.run(),/Injected storage/);assert.deepEqual(f.state,before);assert.equal(f.queries.at(-1).sql,'ROLLBACK');assert.equal(f.released(),1);
 f.setFailure(null);assert.equal((await f.run()).receipt.day,1);assert.equal(f.state.gold,600);
});
for(const step of ['INSERT INTO hero_auction_diamond_wallets','UPDATE hero_auction_diamond_wallets','INSERT INTO hero_auction_login_reward_receipts','INSERT INTO hero_auction_login_reward_streaks'])test(`day7 failure at ${step} does not lose day6 or mint diamonds`,async()=>{
 const f=fixture({diamonds:null});await claimDays(f,6);const before=snapshot(f);f.setNow(dayClock(6));f.setFailure(step);
 await assert.rejects(f.run(),/Injected storage/);assert.deepEqual(f.state,before);f.setFailure(null);
 const result=await f.run();assert.equal(result.receipt.day,7);assert.equal(result.diamonds,5);assert.equal(result.gold,1900);
});
test('unknown COMMIT, process restart and account/date retry recover without double credit',async()=>{
 const f=fixture({lostCommit:true});await assert.rejects(f.run(),/Lost COMMIT/);assert.equal(f.state.gold,600);assert.equal(f.state.receipts.size,1);
 const restarted=fixture({now:'2026-10-25T21:00:00Z'});Object.assign(restarted.state,snapshot(f));
 const result=await restarted.run({rewardDate:'2026-10-25'});assert.equal(result.replayed,true);assert.equal(result.gold,600);assert.equal(restarted.state.receipts.size,1);
 await claimDays(restarted,6);restarted.setNow(dayClock(6));restarted.setLostCommit(true);await assert.rejects(restarted.run(),/Lost COMMIT/);assert.equal(restarted.state.diamonds,5);
 const replay=await restarted.run();assert.equal(replay.replayed,true);assert.equal(replay.receipt.day,7);assert.equal(replay.diamonds,5);assert.equal(restarted.state.receipts.size,7);
});
test('missing or corrupt latest receipt/streak never becomes permission to recover by minting',async()=>{
 const corruptions=[s=>s.receipts.clear(),s=>s.streak=null,s=>s.streak.provider='crazygames',s=>s.streak.day_index=8,s=>s.streak.day_index=2,s=>s.streak.last_reward_date='2026-02-30',s=>s.receipts.get('2026-10-25').gold_amount=999,s=>s.receipts.get('2026-10-25').diamond_amount=5,s=>s.receipts.get('2026-10-25').reward_date='2026-10-24'];
 for(const corrupt of corruptions){const f=fixture();await f.run();corrupt(f.state);const before=snapshot(f);await assert.rejects(f.run(),error=>error.status===503);assert.deepEqual(f.state,before)}
});
test('integer wallet limits do not consume reward eligibility; exact maximum is accepted',async()=>{
 const overflow=fixture({gold:2147483548}),before=snapshot(overflow);await assert.rejects(overflow.run(),error=>error.status===409);assert.deepEqual(overflow.state,before);
 const exact=fixture({gold:2147483547});assert.equal((await exact.run()).gold,2147483647);
 const diamonds=fixture();await claimDays(diamonds,6);diamonds.state.diamonds=2147483643;diamonds.setNow(dayClock(6));const before7=snapshot(diamonds);await assert.rejects(diamonds.run(),error=>error.status===409);assert.deepEqual(diamonds.state,before7);
 diamonds.state.diamonds=2147483642;const result=await diamonds.run();assert.equal(result.receipt.day,7);assert.equal(result.diamonds,2147483647);
});
test('malformed wallet values fail closed before new receipts or state advances',async()=>{
 for(const value of [-1,1.5,NaN,Infinity,2147483648,'',null]){
  const f=fixture({gold:value}),before=snapshot(f);await assert.rejects(f.run(),error=>error.status===503);assert.deepEqual(f.state,before);
 }
 for(const value of [-1,1.5,NaN,Infinity,2147483648,'']){
  const f=fixture({diamonds:value}),before=snapshot(f);await assert.rejects(f.run(),error=>error.status===503);assert.deepEqual(f.state,before);
 }
});
test('concurrent upgrade, exchange and daily claim share gold→diamond order without losing any wallet delta',{timeout:3000},async()=>{
 for(const order of [[0,1,2],[2,1,0],[1,0,2]]){
  const f=fixture({gold:20000,diamonds:20});
  const actions=[()=>f.run(),()=>upgradeCommanderWithDiamonds({database:f.database,accountId:identity.sub,policy:createDiamondPolicy({HERO_DIAMONDS_ENABLED:'1'}),request:{stat:'attack',commanderId:'attack',expectedCurrentLevel:20,requestId:'isolated-upgrade-0001'}}),()=>exchangeDiamondsForGold({database:f.database,accountId:identity.sub,policy:createDiamondExchangePolicy({HERO_DIAMONDS_ENABLED:'1',HERO_DIAMOND_EXCHANGE_ENABLED:'1'}),request:{requestId:'isolated-exchange-0001',diamondsToSpend:3,expectedRate:500,pricingVersion:'diamonds-to-gold-500-v1'}})];
  await Promise.all(order.map(index=>actions[index]()));assert.equal(f.state.gold,13932);assert.equal(f.state.diamonds,7);assert.equal(f.state.commander.levels.attack,21);assert.equal(f.state.receipts.size,1);assert.equal(f.state.upgrades.size,1);assert.equal(f.state.exchanges.size,1);
  assert.equal((await f.run()).gold,13932);
 }
});
test('day7 and an exchange cannot spend an uncredited grant or double-spend existing diamonds',{timeout:3000},async()=>{
 const f=fixture({gold:1000,diamonds:5});await claimDays(f,6);f.setNow(dayClock(6));
 await Promise.all([f.run(),exchangeDiamondsForGold({database:f.database,accountId:identity.sub,policy:createDiamondExchangePolicy({HERO_DIAMONDS_ENABLED:'1',HERO_DIAMOND_EXCHANGE_ENABLED:'1'}),request:{requestId:'isolated-exchange-day7',diamondsToSpend:5,expectedRate:500,pricingVersion:'diamonds-to-gold-500-v1'}})]);
 assert.equal(f.state.gold,4900);assert.equal(f.state.diamonds,5);assert.equal(f.state.receipts.size,7);assert.equal((await f.run()).diamonds,5);
});
test('new migration is opt-in, constrained to exact approved rewards and contains no account backfill',()=>{
 const schema=readFileSync(new URL('../migrations/004-login-rewards.sql',import.meta.url),'utf8');
 const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 assert.match(schema,/PRIMARY KEY\(account_id,reward_date\)/);assert.match(schema,/day_index=7 AND gold_amount=0 AND diamond_amount=5/);assert.match(schema,/FOREIGN KEY\(account_id,last_reward_date,day_index\)/);
 assert.match(schema,/gold_after::bigint=gold_before::bigint\+gold_amount::bigint/);assert.match(schema,/diamonds_after::bigint=diamonds_before::bigint\+diamond_amount::bigint/);
 assert.doesNotMatch(schema,/\b(?:INSERT INTO|UPDATE|DELETE FROM)\b/);assert.doesNotMatch(server,/CREATE TABLE[^\n]*hero_auction_login_reward|migrations\/004-login-rewards/);
});
test('older orphan ledger and stale streak pointer block both status and a new-day claim',async()=>{
 for(const corrupt of [state=>{state.streak=null},state=>{state.streak.last_reward_date='2026-10-25';state.streak.day_index=1}]){
  const f=fixture();await claimDays(f,2);corrupt(f.state);f.setNow(dayClock(2));const before=snapshot(f);
  await assert.rejects(f.status(),error=>error.status===503);await assert.rejects(f.run(),error=>error.status===503);assert.deepEqual(f.state,before);
 }
});
test('an old receipt may be recovered after a gap but cannot retroactively keep a streak alive',async()=>{
 const f=fixture();await claimDays(f,3);f.setNow(dayClock(8));const before=snapshot(f);
 const old=await f.run({rewardDate:'2026-10-25'});assert.equal(old.replayed,true);assert.equal(old.receipt.day,1);assert.equal(old.loginRewards.nextDay,1);assert.deepEqual(f.state,before);
 const today=await f.run();assert.equal(today.receipt.day,1);assert.equal(today.receipt.gold,100);assert.equal(f.state.receipts.size,4);
});
test('provider change or ineligible session does not consume the legitimate member’s next day',async()=>{
 const f=fixture();await f.run();f.setNow(dayClock(1));const before=snapshot(f);
 await assert.rejects(f.run(undefined,{identity:{sub:identity.sub,provider:'apple'}}),error=>error.status===403);assert.deepEqual(f.state,before);
 const continued=await f.run();assert.equal(continued.receipt.day,2);assert.equal(continued.gold,750);
});
test('public receipt/status expose neither account ID nor historical wallet snapshots',async()=>{
 const f=fixture({gold:1000,diamonds:10});const result=await f.run();
 assert.deepEqual(Object.keys(result.receipt).sort(),['day','diamonds','gold','rewardDate']);
 const status=await f.status();assert.deepEqual(status.receipt,result.receipt);
 assert.doesNotMatch(JSON.stringify(status),/isolated-google-member|account_id|gold_before|gold_after|diamonds_before|diamonds_after|email/);
});
