import test from 'node:test';
import assert from 'node:assert/strict';
import {createCommanderProfile,commanderUpgradeCost} from '../arena-commanders.js';
import {createDiamondPolicy,upgradeCommanderWithDiamonds} from '../paid-diamonds.js';
import {createDiamondExchangePolicy,exchangeDiamondsForGold} from '../paid-diamond-exchange.js';

// Shared-wallet, per-row transaction model: unlike each service's unit fixture,
// profiles and balances are read at their OWN lock acquisition, not one global
// snapshot. This models a conversion committing while an upgrade waits on gold.
// It is not a substitute for an isolated real PostgreSQL concurrency check.
function sharedWallet(){
 const profile=createCommanderProfile('attack');profile.levels.attack=20;
 const state={profile,gold:7668,diamonds:10,upgrades:new Map(),exchanges:new Map(),diamondLedger:[]};
 const locks=new Map(),order=[];let goldAttempts=0,releases=0;
 let firstGold,secondAttempt,openGate;
 const firstGoldAcquired=new Promise(resolve=>{firstGold=resolve});
 const secondGoldAttempt=new Promise(resolve=>{secondAttempt=resolve});
 const gate=new Promise(resolve=>{openGate=resolve});
 const database={async connect(){
  const held=new Map(),staged={},dirty=new Set(),receipts=[],ledger=[];
  const id=order.length;order.push([]);
  async function acquire(key){
   if(held.has(key))return;
   if(key==='gold'&&++goldAttempts===2)secondAttempt();
   const previous=locks.get(key)||Promise.resolve();let unlock;
   locks.set(key,new Promise(resolve=>{unlock=resolve}));await previous;
   held.set(key,unlock);order[id].push(key);staged[key]=structuredClone(state[key]);
   if(key==='gold'&&goldAttempts===1){firstGold();await gate;}
  }
  function releaseLocks(){for(const unlock of [...held.values()].reverse())unlock();held.clear();}
  return{release(){releases++},async query(sql,args=[]){
   if(sql==='BEGIN')return{};
   if(sql==='ROLLBACK'){releaseLocks();return{}};
   if(sql==='COMMIT'){
    for(const key of dirty)state[key]=structuredClone(staged[key]);
    for(const [collection,key,value] of receipts)state[collection].set(key,value);
    state.diamondLedger.push(...ledger);releaseLocks();return{};
   }
   assert.equal(args[0],'shared-account');
   if(sql.startsWith('SELECT profile FROM')){await acquire('profile');return{rows:[{profile:structuredClone(staged.profile)}]};}
   if(sql.startsWith('SELECT gold FROM')){await acquire('gold');return{rows:[{gold:staged.gold}]};}
   if(sql.startsWith('SELECT diamonds FROM')){assert.ok(held.has('gold'));await acquire('diamonds');return{rows:[{diamonds:staged.diamonds}]};}
   if(sql.startsWith('INSERT INTO hero_auction_diamond_wallets')){assert.ok(held.has('gold'));assert.match(sql,/VALUES\(\$1,0\) ON CONFLICT DO NOTHING/);return{};}
   if(sql.startsWith('SELECT commander_id,stat')){assert.ok(held.has('profile'));const found=state.upgrades.get(args[1]);return{rows:found?[found]:[]};}
   if(sql.startsWith('SELECT diamonds_spent')){assert.ok(held.has('gold'));const found=state.exchanges.get(args[1]);return{rows:found?[found]:[]};}
   if(sql.startsWith('UPDATE hero_auction_wallets')){
    assert.ok(held.has('gold'));assert.ok(held.has('diamonds'));
    if(sql.includes('gold=gold-$2')){if(staged.gold<args[1])return{rows:[]};staged.gold-=args[1];}
    else{assert.match(sql,/gold=gold\+\$2/);if(staged.gold>args[2])return{rows:[]};staged.gold+=args[1];}
    dirty.add('gold');return{rows:[{gold:staged.gold}]};
   }
   if(sql.startsWith('UPDATE hero_auction_diamond_wallets')){
    assert.ok(held.has('gold'));assert.ok(held.has('diamonds'));assert.match(sql,/diamonds=diamonds-\$2/);
    if(staged.diamonds<args[1])return{rows:[]};staged.diamonds-=args[1];dirty.add('diamonds');return{rows:[{diamonds:staged.diamonds}]};
   }
   if(sql.startsWith('INSERT INTO hero_auction_upgrade_receipts')){
    assert.ok(held.has('profile'));assert.equal(state.upgrades.has(args[1]),false);
    receipts.push(['upgrades',args[1],{commander_id:args[2],stat:args[3],from_level:args[4],gold_cost:args[6],diamond_cost:args[7],pricing_version:args[8]}]);return{};
   }
   if(sql.startsWith('INSERT INTO hero_auction_diamond_exchanges')){
    assert.ok(held.has('gold'));assert.equal(state.exchanges.has(args[1]),false);
    receipts.push(['exchanges',args[1],{diamonds_spent:args[2],gold_granted:args[3],exchange_rate:args[4],pricing_version:args[5]}]);return{};
   }
   if(sql.startsWith('INSERT INTO hero_auction_diamond_ledger')){ledger.push([...args]);return{};}
   if(sql.startsWith('UPDATE hero_auction_commanders')){assert.ok(held.has('profile'));staged.profile=JSON.parse(args[1]);dirty.add('profile');return{};}
   throw Error('Unexpected SQL: '+sql);
  }};
 }};
 const accountId='shared-account';
 return{state,order,firstGoldAcquired,secondGoldAttempt,openGate:()=>openGate(),releases:()=>releases,
  upgrade:()=>upgradeCommanderWithDiamonds({database,accountId,policy:createDiamondPolicy({HERO_DIAMONDS_ENABLED:'1'}),request:{stat:'attack',commanderId:'attack',expectedCurrentLevel:20,requestId:'shared-upgrade-0001'}}),
  exchange:()=>exchangeDiamondsForGold({database,accountId,policy:createDiamondExchangePolicy({HERO_DIAMONDS_ENABLED:'1',HERO_DIAMOND_EXCHANGE_ENABLED:'1'}),request:{diamondsToSpend:10,expectedRate:500,pricingVersion:'diamonds-to-gold-500-v1',requestId:'shared-exchange-0001'}})
 };
}

for(const first of ['upgrade','exchange'])test(`${first} wins the shared gold lock: competing 10-diamond actions spend only once`,{timeout:1500},async()=>{
 assert.equal(commanderUpgradeCost(20),7668);
 const f=sharedWallet(),second=first==='upgrade'?'exchange':'upgrade';
 const firstRequest=f[first]();await f.firstGoldAcquired;
 const secondRequest=f[second]();const settled=Promise.allSettled([firstRequest,secondRequest]);
 // Both services are active, and the second is waiting for the SAME gold row.
 await f.secondGoldAttempt;f.openGate();
 const outcomes=await settled;
 assert.equal(outcomes[0].status,'fulfilled');assert.equal(outcomes[1].status,'rejected');assert.equal(outcomes[1].reason.status,409);assert.equal(outcomes[1].reason.message,'Yetersiz elmas.');
 assert.equal(f.state.diamonds,0);assert.ok(f.state.gold>=0);
 assert.equal(f.state.upgrades.size+f.state.exchanges.size,1);assert.equal(f.releases(),2);
 for(const keys of f.order){assert.ok(keys.indexOf('gold')<keys.indexOf('diamonds'));}
 if(first==='upgrade'){
  assert.equal(f.state.profile.levels.attack,21);assert.equal(f.state.gold,0);assert.equal(f.state.diamondLedger.length,1);assert.equal(f.state.upgrades.size,1);
 }else{
  assert.equal(f.state.profile.levels.attack,20);assert.equal(f.state.gold,12668);assert.equal(f.state.diamondLedger.length,0);assert.equal(f.state.exchanges.size,1);
 }
 const before=structuredClone(f.state),replayed=await f[first]();assert.equal(replayed.replayed,true);assert.deepEqual(f.state,before);
});
