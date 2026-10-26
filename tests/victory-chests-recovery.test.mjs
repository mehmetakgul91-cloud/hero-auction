import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {eligibleVictory,victoryMatchId} from '../victory-chests.js';

// Exercise actual server lifecycle functions with durable intent/receipt doubles.
// This complements, not replaces, real PostgreSQL transaction/integration tests.
const source=readFileSync(new URL('../server.js',import.meta.url),'utf8');
const recoverySource=source.slice(source.indexOf('async function initializeVictoryChests(){'),source.indexOf('async function rewardedAdStatus('));
const settlementSource=source.slice(source.indexOf('function settleFinishedMatch('),source.indexOf('function endGame('));
const room=(extra={})=>({code:'123',created:1000,matchNumber:1,phase:'finished',mode:'friend',entryPaid:true,players:[{accountId:'fixture-winner',name:'A'},{accountId:'fixture-loser',name:'B'}],history:[],series:[0,0],...extra});
const durable=()=>({intents:new Map(),receipts:new Map(),credits:0,rolls:0});
const wait=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({restored=[],storage=durable(),enabled=true,ready=true,failPreflight=false,failIntent=null,failCredit=null}={}){
 const counters={persist:0,credit:0,recovery:0},published=[],marked=[],legacy=[],records=new Set(),queries=[];let intentFault=failIntent,creditFault=failCredit;
 const ctx={console:{error(){}},structuredClone,Map,Set,victoryMatchId,eligibleVictory,rooms:new Map(restored.map(r=>[r.code,r])),databaseReady:ready,victoryChestStorageReady:false,victoryChestPolicy:{enabled},pendingVictoryChests:new Map(),victoryChestFlights:new Set(),pendingGold:new Map(),MATCH_WIN_GOLD:120,
  database:{query:async query=>{queries.push(query);if(failPreflight)throw Error('missing schema');return{rows:[]}}},
  markRoom:r=>marked.push(victoryMatchId(r)),publish:r=>published.push(victoryMatchId(r)),queueGoldAward:r=>legacy.push(r.goldAward),log:(r,text)=>r.history.push(text),recordMatch:r=>records.add(victoryMatchId(r)),
  readVictoryChestRecovery:async(_database,ids)=>{counters.recovery++;return[...storage.intents.values()].filter(i=>!storage.receipts.has(i.match_id)||ids.some(id=>id.split(':')[0]===i.room_state.code)).map(i=>({...structuredClone(i),credited_match_id:storage.receipts.has(i.match_id)?i.match_id:null}))},
  persistVictoryChestIntent:async({room:r,winner})=>{
   counters.persist++;const matchId=victoryMatchId(r);
   if(intentFault==='before'){intentFault=null;throw Error('intent write failed')}
   if(!storage.intents.has(matchId)){storage.rolls++;storage.intents.set(matchId,{match_id:matchId,winner_seat:winner,account_id:r.players[winner].accountId,room_state:structuredClone(r)})}
   if(intentFault==='after'){intentFault=null;throw Error('lost intent COMMIT')}
   return storage.intents.get(matchId);
  },
  creditVictoryChest:async({matchId})=>{
   counters.credit++;assert.ok(storage.intents.has(matchId),'credit must follow durable intent');
   if(creditFault==='before'){creditFault=null;throw Error('credit write failed')}
   const replayed=storage.receipts.has(matchId);
   if(!replayed){storage.credits++;storage.receipts.set(matchId,{matchId,receiptId:matchId,configVersion:'fixture',rewards:{gold:115,magicDust:4,diamonds:1}})}
   if(creditFault==='after'){creditFault=null;throw Error('lost receipt COMMIT')}
   return{receipt:structuredClone(storage.receipts.get(matchId)),replayed};
  }
 };
 vm.createContext(ctx);vm.runInContext(recoverySource+'\n'+settlementSource,ctx);
 return{ctx,storage,counters,published,marked,legacy,records,queries};
}
function seedIntent(storage,r,{credited=false}={}){
 const id=victoryMatchId(r);storage.intents.set(id,{match_id:id,winner_seat:0,account_id:r.players[0].accountId,room_state:structuredClone(r)});
 if(credited){storage.credits++;storage.receipts.set(id,{matchId:id,receiptId:id,configVersion:'fixture',rewards:{gold:115,magicDust:4,diamonds:1}})}
}

test('OFF or unavailable DB performs no chest preflight, replay or grant',async()=>{
 for(const settings of [{enabled:false},{ready:false}]){const f=fixture(settings);await f.ctx.initializeVictoryChests();assert.equal(f.queries.length,0);assert.equal(f.counters.recovery,0);assert.equal(f.storage.credits,0);assert.equal(f.ctx.victoryChestStorageReady,false)}
});
test('schema preflight failure closes readiness without changing a pending room or issuing credit',async()=>{
 const pending=room({victoryChestPending:true,victoryChestWinner:0}),f=fixture({restored:[pending],failPreflight:true});await f.ctx.initializeVictoryChests();assert.equal(f.ctx.victoryChestStorageReady,false);assert.equal(pending.matchSettled,undefined);assert.equal(f.storage.credits,0);
});
test('persisted pending room without intent is recovered after crash before intent COMMIT',async()=>{
 const pending=room({victoryChestPending:true,victoryChestWinner:0}),f=fixture({restored:[pending]});await f.ctx.initializeVictoryChests();
 assert.equal(f.storage.rolls,1);assert.equal(f.storage.credits,1);assert.equal(f.ctx.rooms.get('123').matchSettled,true);assert.equal(f.ctx.rooms.get('123').victoryChestPending,false);assert.equal(f.ctx.pendingVictoryChests.size,0);assert.equal(f.legacy.length,0);
});
test('durable uncredited intent replaces the same old unfinished room and finishes exactly once',async()=>{
 const state=durable(),intentRoom=room({victoryChestPending:true,victoryChestWinner:0}),old=room({phase:'auction'});seedIntent(state,intentRoom);
 const f=fixture({storage:state,restored:[old]});await f.ctx.initializeVictoryChests();const restored=f.ctx.rooms.get('123');assert.notEqual(restored,old);assert.equal(restored.phase,'finished');assert.equal(restored.matchSettled,true);assert.equal(restored.series[0],1);assert.equal(state.credits,1);assert.equal(f.counters.persist,0);assert.equal(f.legacy.length,0);
 await f.ctx.initializeVictoryChests();assert.equal(state.credits,1);assert.equal(f.ctx.rooms.get('123').series[0],1);
});
test('committed receipt with stale unfinished room replays rather than credits twice after restart',async()=>{
 const state=durable(),r=room({victoryChestPending:true,victoryChestWinner:0});seedIntent(state,r,{credited:true});const f=fixture({storage:state,restored:[structuredClone(r)]});await f.ctx.initializeVictoryChests();
 assert.equal(state.credits,1);assert.equal(f.ctx.rooms.get('123').victoryChestReceipt.matchId,victoryMatchId(r));assert.equal(f.ctx.rooms.get('123').matchSettled,true);assert.equal(f.legacy.length,0);assert.equal(f.counters.persist,0);
});
test('uncredited orphan intent restores its room, while credited old history does not resurrect deleted rooms',async()=>{
 const state=durable(),pending=room({victoryChestPending:true,victoryChestWinner:0}),history=room({code:'456',created:2000});seedIntent(state,pending);seedIntent(state,history,{credited:true});const f=fixture({storage:state});await f.ctx.initializeVictoryChests();
 assert.equal(f.ctx.rooms.has('123'),true);assert.equal(f.ctx.rooms.get('123').matchSettled,true);assert.equal(f.ctx.rooms.has('456'),false);assert.equal(state.credits,2);
});
test('an old pending intent is credited without overwriting a newer match reusing its room code',async()=>{
 const state=durable(),old=room({victoryChestPending:true,victoryChestWinner:0}),newer=room({created:2000,phase:'auction'});seedIntent(state,old);const f=fixture({storage:state,restored:[newer]});await f.ctx.initializeVictoryChests();assert.equal(state.credits,1);assert.equal(f.ctx.rooms.get('123'),newer);assert.equal(newer.phase,'auction');assert.equal(newer.victoryChestReceipt,undefined);assert.equal(f.published.length,0);
});
for(const failIntent of ['before','after'])test(`live failed intent ${failIntent} durable commit keeps pending and retries without duplicate rolls`,async()=>{
 const r=room(),f=fixture({restored:[r],failIntent});f.ctx.victoryChestStorageReady=true;f.ctx.settleFinishedMatch(r,0);await wait();
 assert.equal(r.matchSettled,undefined);assert.equal(r.victoryChestPending,true);assert.equal(f.ctx.pendingVictoryChests.size,1);assert.equal(f.storage.credits,0);
 await f.ctx.flushVictoryChests();assert.equal(r.matchSettled,true);assert.equal(f.storage.rolls,1);assert.equal(f.storage.credits,1);assert.equal(f.legacy.length,0);
});
for(const failCredit of ['before','after'])test(`live failed credit ${failCredit} durable commit keeps pending and retries one receipt`,async()=>{
 const r=room(),f=fixture({restored:[r],failCredit});f.ctx.victoryChestStorageReady=true;f.ctx.settleFinishedMatch(r,0);await wait();assert.equal(r.matchSettled,undefined);assert.equal(r.victoryChestPending,true);assert.equal(f.ctx.pendingVictoryChests.size,1);
 await f.ctx.flushVictoryChests();assert.equal(r.matchSettled,true);assert.equal(f.storage.credits,1);assert.equal(f.storage.rolls,1);assert.equal(r.series[0],1);assert.equal(f.ctx.pendingVictoryChests.size,0);
 f.ctx.settleFinishedMatch(r,0);await f.ctx.flushVictoryChests();assert.equal(r.series[0],1);assert.equal(f.storage.credits,1);
});
test('draw refunds and bot no-economy behavior remain unchanged',async()=>{
 const draw=room(),bot=room({mode:'bot',entryPaid:false}),f=fixture();f.ctx.victoryChestStorageReady=true;f.ctx.settleFinishedMatch(draw,null);assert.equal(f.ctx.pendingGold.size,2);assert.ok([...f.ctx.pendingGold.values()].every(x=>x.amount===50));assert.equal(f.ctx.pendingVictoryChests.size,0);
 f.ctx.settleFinishedMatch(bot,0);assert.equal(f.storage.credits,0);assert.equal(f.legacy.length,0);assert.equal(bot.matchSettled,true);
});

for(const credited of [false,true])for(const next of [{created:2000,matchNumber:1},{created:1000,matchNumber:2}])test(`newer durable ${credited?'credited':'pending'} intent (${next.created}:${next.matchNumber}) replaces an older persisted match`,async()=>{
 const state=durable(),old=room({phase:'auction'}),newer=room({...next,victoryChestPending:true,victoryChestWinner:0});seedIntent(state,newer,{credited});const f=fixture({storage:state,restored:[old]});await f.ctx.initializeVictoryChests();
 const active=f.ctx.rooms.get('123');assert.equal(victoryMatchId(active),victoryMatchId(newer));assert.equal(active.matchSettled,true);assert.equal(active.victoryChestReceipt.matchId,victoryMatchId(newer));assert.equal(state.credits,1);assert.equal(f.legacy.length,0);
});
test('already-settled room with committed receipt stays untouched after recovery',async()=>{
 const state=durable(),r=room({matchSettled:true,series:[1,0],victoryChestWinner:0,victoryChestPending:false});seedIntent(state,r,{credited:true});r.victoryChestReceipt=structuredClone(state.receipts.get(victoryMatchId(r)));const before=structuredClone(r),f=fixture({storage:state,restored:[r]});await f.ctx.initializeVictoryChests();
 assert.equal(f.ctx.rooms.get('123'),r);assert.deepEqual(r,before);assert.equal(f.counters.credit,0);assert.equal(f.published.length,0);assert.equal(state.credits,1);
});
