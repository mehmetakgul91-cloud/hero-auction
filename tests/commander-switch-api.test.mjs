import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {COMMANDER_CHANGE_COST} from '../public/commander-economy.js';
import {createCommanderProfile,validateCommanderProfile,resolveCommander,COMMANDER_STATS,commanderLevelCap,commanderUpgradeCost,previewCommanderUpgrade} from '../arena-commanders.js';

// Exercise the actual production handlers against isolated transactional SQL state.
// This models row locks and rollback; it is not a live PostgreSQL integration test.
const source=readFileSync(new URL('../server.js',import.meta.url),'utf8');
const begin=source.indexOf("if(previewGuestMode&&url==='/api/commander/get')");
const end=source.indexOf("if(url==='/api/profile')",begin);
assert.ok(begin>=0&&end>begin);
const handlers=source.slice(begin,end);
const account='isolated-commander-test';
const initialProfile=()=>({commanderId:'attack',levels:{attack:40,defense:3,magic:2,support:1}});
function fixture({gold=100,profile=initialProfile(),failSave=false,lostCommit=false,preview=false}={}){
 const durable={gold,profile:structuredClone(profile)};
 const queries=[];let releases=0,heldClients=0,lock=Promise.resolve();
 const database={
  async query(sql,args=[]){
   queries.push([sql,args]);assert.equal(args[0],account);
   if(sql.startsWith('INSERT INTO hero_auction_commanders')){
    assert.match(sql,/ON CONFLICT\(account_id\) DO NOTHING RETURNING profile/);
    if(durable.profile)return{rows:[]};
    durable.profile=JSON.parse(args[1]);return{rows:[{profile:structuredClone(durable.profile)}]};
   }
   if(sql==='SELECT profile FROM hero_auction_commanders WHERE account_id=$1')return{rows:durable.profile?[{profile:structuredClone(durable.profile)}]:[]};
   throw Error('Unexpected direct SQL: '+sql);
  },
  async connect(){
   heldClients++;let staged,unlock;
   return{release(){releases++;heldClients--;},async query(sql,args=[]){
    queries.push([sql,args]);
    if(sql==='BEGIN')return{};
    if(sql==='ROLLBACK'){staged=null;unlock?.();unlock=null;return{}};
    if(sql==='COMMIT'){
     assert.ok(staged);Object.assign(durable,staged);staged=null;unlock?.();unlock=null;
     if(lostCommit)throw Error('Lost COMMIT response');
     return{};
    }
    assert.equal(args[0],account);
    if(sql==='SELECT profile FROM hero_auction_commanders WHERE account_id=$1 FOR UPDATE'){
     const previous=lock;lock=new Promise(resolve=>{unlock=resolve});await previous;
     staged=structuredClone(durable);
     return{rows:staged.profile?[{profile:structuredClone(staged.profile)}]:[]};
    }
    assert.ok(staged,'wallet/profile writes must follow the profile row lock');
    if(sql==='INSERT INTO hero_auction_wallets(account_id,gold) VALUES($1,500) ON CONFLICT DO NOTHING'){if(staged.gold==null)staged.gold=500;return{rows:[]};}
    if(sql==='SELECT gold FROM hero_auction_wallets WHERE account_id=$1')return{rows:[{gold:String(staged.gold)}]};
    if(sql.startsWith('UPDATE hero_auction_wallets')){
     assert.match(sql,/SET gold=gold-\$2 WHERE account_id=\$1 AND gold\s*>=\s*\$2 RETURNING gold$/);
     const cost=args[1];assert.ok(Number.isSafeInteger(cost)&&cost>0);
     if(staged.gold==null||staged.gold<cost)return{rows:[]};
     staged.gold-=cost;return{rows:[{gold:String(staged.gold)}]};
    }
    if(sql.startsWith('UPDATE hero_auction_commanders')){
     if(failSave)throw Error('Profile save failed');
     staged.profile=JSON.parse(args[1]);return{rows:[]};
    }
    throw Error('Unexpected transaction SQL: '+sql);
   }};
  }
 };
 const context=vm.createContext({COMMANDER_CHANGE_COST,createCommanderProfile,validateCommanderProfile,resolveCommander,COMMANDER_STATS,commanderLevelCap,commanderUpgradeCost,previewCommanderUpgrade,
  diamondPolicy:{enabled:false},database,databaseReady:true,previewGuestMode:preview,previewCommanderProfiles:new Map(profile?[[account,structuredClone(profile)]]:[]),
  readLogin:()=>({sub:account}),goldBalance:async()=>{assert.equal(heldClients,0,'balance reads must not acquire another connection while a transaction client is held');return durable.gold;},error:(message,status)=>{throw Object.assign(Error(message),{status})}});
 vm.runInContext(`async function handle(url,b){${handlers}}`,context);
 return{durable,queries,context,releases:()=>releases,request:(action,body={})=>context.handle('/api/commander/'+action,{authToken:'isolated-test-token',...body})};
}
const plain=value=>JSON.parse(JSON.stringify(value));
const debitQueries=f=>f.queries.filter(([sql])=>sql.startsWith('UPDATE hero_auction_wallets'));

test('switching is free and preserves balance and all progression',async()=>{
 assert.equal(COMMANDER_CHANGE_COST,0);
 assert.match(source,/import \{COMMANDER_CHANGE_COST\} from '\.\/public\/commander-economy\.js'/);
 const f=fixture();const levels=structuredClone(f.durable.profile.levels);
 const result=await f.request('change',{commanderId:'defense',cost:0,gold:999999});
 assert.deepEqual(plain(result),{profile:{commanderId:'defense',levels},gold:100,cost:0});
 assert.deepEqual(f.durable,{gold:100,profile:{commanderId:'defense',levels}});
 assert.equal(debitQueries(f).length,0);
 assert.equal(f.queries.at(-1)[0],'COMMIT');assert.equal(f.releases(),1);
});
for(const gold of [99,50,0,null])test(`${gold} gold can switch without a wallet debit`,async()=>{
 const f=fixture({gold}),levels=structuredClone(f.durable.profile.levels);
 const result=await f.request('change',{commanderId:'magic'});
 assert.equal(result.cost,0);assert.equal(f.durable.gold,gold??500);assert.deepEqual(plain(result.profile.levels),levels);
 assert.equal(debitQueries(f).length,0);assert.equal(f.queries.at(-1)[0],'COMMIT');assert.equal(f.releases(),1);
});
test('first selection is free at zero gold; repeating selection cannot replace it',async()=>{
 const f=fixture({gold:0,profile:null});
 const result=await f.request('select',{commanderId:'support'});
 assert.deepEqual(plain(result),{profile:createCommanderProfile('support'),gold:0});
 await assert.rejects(f.request('select',{commanderId:'magic'}),e=>e.status===409);
 assert.equal(f.durable.profile.commanderId,'support');assert.equal(f.durable.gold,0);assert.equal(debitQueries(f).length,0);
});
test('same commander is rejected before any debit, even without sufficient gold',async()=>{
 const f=fixture({gold:0}),before=structuredClone(f.durable);
 await assert.rejects(f.request('change',{commanderId:'attack'}),e=>e.status===409&&/zaten seçili/.test(e.message));
 assert.deepEqual(f.durable,before);assert.equal(debitQueries(f).length,0);
});
test('retrying a completed request never debits twice, including a lost commit response',async()=>{
 for(const lostCommit of [false,true]){
  const f=fixture({gold:5000,lostCommit});
  const first=f.request('change',{commanderId:'magic'});
  if(lostCommit)await assert.rejects(first,/Lost COMMIT response/);else await first;
  await assert.rejects(f.request('change',{commanderId:'magic'}),e=>e.status===409);
  assert.equal(f.durable.gold,5000);assert.equal(f.durable.profile.commanderId,'magic');assert.equal(debitQueries(f).length,0);assert.equal(f.releases(),2);
 }
});
test('simultaneous identical requests lock the profile without any debit',async()=>{
 const f=fixture({gold:5000});
 const results=await Promise.allSettled([f.request('change',{commanderId:'support'}),f.request('change',{commanderId:'support'})]);
 assert.deepEqual(results.map(r=>r.status).sort(),['fulfilled','rejected']);
 assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
 assert.equal(f.durable.gold,5000);assert.equal(f.durable.profile.commanderId,'support');assert.equal(debitQueries(f).length,0);
});
test('distinct successful switches remain free; existing progression is retained',async()=>{
 const f=fixture({gold:5000}),levels=structuredClone(f.durable.profile.levels);
 for(const commanderId of ['support','magic','attack']){
  const result=await f.request('change',{commanderId});assert.equal(result.cost,0);assert.deepEqual(plain(result.profile.levels),levels);
 }
 assert.equal(f.durable.gold,5000);
});
test('invalid target and missing first selection cannot debit',async()=>{
 const invalid=fixture(),missing=fixture({profile:null});
 await assert.rejects(invalid.request('change',{commanderId:'unknown'}),e=>e.status===400);
 await assert.rejects(missing.request('change',{commanderId:'support'}),e=>e.status===409);
 for(const f of [invalid,missing]){assert.equal(f.durable.gold,100);assert.equal(debitQueries(f).length,0)}
});
test('profile persistence failure leaves the wallet unchanged and releases the client',async()=>{
 const f=fixture({failSave:true}),before=structuredClone(f.durable);
 await assert.rejects(f.request('change',{commanderId:'defense'}),/Profile save failed/);
 assert.deepEqual(f.durable,before);assert.equal(f.queries.at(-1)[0],'ROLLBACK');assert.equal(f.releases(),1);
});
test('first upgrade price and free preview switches are unchanged; later gold uses approved 1.2 curve',async()=>{
 const f=fixture({gold:500,profile:createCommanderProfile('attack')});
 const upgrade=await f.request('upgrade',{stat:'attack'});assert.equal(upgrade.cost,200);assert.equal(upgrade.gold,300);assert.equal(upgrade.profile.levels.attack,1);
 assert.equal(commanderUpgradeCost(1),240);assert.equal(commanderUpgradeCost(39),244962);
 const preview=fixture({gold:0,preview:true});
 const switched=await preview.request('change',{commanderId:'magic'});
 assert.equal(switched.cost,0);assert.equal(switched.gold,0);assert.equal(switched.profile.commanderId,'magic');assert.equal(preview.queries.length,0);
});

test('feature OFF expected-level guard rejects replay/new-key duplicate without second debit',async()=>{
 const f=fixture({gold:1000,profile:createCommanderProfile('attack')});
 const body={stat:'attack',commanderId:'attack',expectedCurrentLevel:0,requestId:'request-0000000001'};
 await f.request('upgrade',body);
 await assert.rejects(f.request('upgrade',{...body,requestId:'request-0000000002'}),e=>e.status===409&&/seviyesi değişti/.test(e.message));
 assert.equal(f.durable.gold,800);assert.equal(f.durable.profile.levels.attack,1);assert.equal(debitQueries(f).length,1);
});

test('account support 40 → attack → support persists every earned level with zero debit',async()=>{
 const levels={attack:12,defense:7,magic:9,support:40};
 const initial={commanderId:'support',levels};
 const f=fixture({gold:0,profile:initial});
 for(const commanderId of ['attack','support']){
  const changed=await f.request('change',{commanderId});
  assert.equal(changed.cost,0);assert.equal(changed.gold,0);
  assert.deepEqual(plain(changed.profile),{commanderId,levels});
  assert.deepEqual(f.durable,{gold:0,profile:{commanderId,levels}});
  // Re-read through the account menu endpoint, not only the change response.
  const loaded=await f.request('get');
  assert.deepEqual(plain(loaded.profile),{commanderId,levels});
  assert.equal(loaded.gold,0);
 }
 assert.deepEqual(f.durable.profile,initial);
 assert.equal(debitQueries(f).length,0);
 assert.equal(f.queries.filter(([sql])=>sql==='COMMIT').length,2);
 assert.equal(f.releases(),2);
});
