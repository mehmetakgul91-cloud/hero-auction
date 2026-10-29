// Actual server helper integration with deterministic injected persistence.
// These tests exercise orchestration, NOT PostgreSQL durability.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {BOT_ECONOMY,botMatchId} from '../bot-economy.js';
const source=readFileSync(new URL('../server.js',import.meta.url),'utf8');
const helpers=source.slice(source.indexOf('// Bot money is never'),source.indexOf('async function walletSummary('));
const request={authToken:'synthetic-auth',difficulty:'medium',botTermsVersion:BOT_ECONOMY.version,requestId:'12345678-1234-4234-8234-123456789abc'};
const offer=()=>({code:'123',created:1000,matchNumber:1,phase:'bot_offer',mode:'random',players:[{accountId:'synthetic-human',token:'seat-token',name:'Fixture',team:[],credits:20},null],cards:[],series:[0,0]});
function fixture({lost=false,gold=500,ready=true}={}){
 let saved=null,debits=0,settlements=0,sequence=0;
 const ctx={BOT_ECONOMY,structuredClone,console:{error(){}},databaseReady:true,previewGuestMode:false,magicDustPolicy:{enabled:true},database:{query:async()=>({rows:[]})},rooms:new Map(),activeSeats:new Map(),waiting:new Map(),roomFlushes:new Map(),auctionAdmissions:new WeakSet(),liveArenaMatchKeys:new Map(),dirtyRooms:new Set(),paidEntryMaintenance:{isPaused:()=>false},
  readLogin:()=>({sub:'synthetic-human'}),seatRoom:p=>ctx.rooms.get(p.code),saveSocial:async()=>{},victoryMatchId:botMatchId,error:(message,status)=>{throw Object.assign(Error(message),{status})},
  publicRoom:r=>structuredClone(r),publish:r=>ctx.dirtyRooms.add(r.code),markRoom:r=>ctx.dirtyRooms.add(r.code),recordMatch(){},chosenName:()=> 'Fixture',code:()=>String(200+sequence++),token:()=>`token-${sequence++}`,newCards:()=>[],assignBotCommander:r=>{r.botCommander={commanderId:'attack',levels:{attack:25,defense:20,magic:20,support:20}}},startRoomArenaTheme(){},refreshAuctionIdentity:async()=>{},refreshAuctionCommanders:async()=>{},previewCommanderProfiles:new Map(),liveArenaLifecycle:{endRoom(){}},
  findBotAdmission:async()=>saved?{room:structuredClone(saved),replayed:true}:null,
  admitBotMatch:async({room})=>{if(gold<50)throw Object.assign(Error('insufficient'),{status:400});gold-=50;debits++;saved={...structuredClone(room),entryPaid:true,botEconomyVersion:BOT_ECONOMY.version,botEntry:{matchId:botMatchId(room),requestId:request.requestId,entryGold:50}};if(lost){lost=false;throw Object.assign(Error('lost COMMIT'),{status:503,uncertain:true})}return{room:structuredClone(saved),replayed:false}},
  settleBotMatch:async({room,winner})=>{settlements++;return{room:{...structuredClone(room),matchSettled:true,botSettlementPending:false,botSettlementReceipt:{outcome:winner===0?'win':'loss'}}}},recoverBotMatches:async()=>[]};
 vm.createContext(ctx);vm.runInContext(helpers,ctx);vm.runInContext(`botEconomyReady=${ready}`,ctx);
 return{ctx,stats:()=>({gold,debits,settlements}),saved:()=>structuredClone(saved),seed:r=>{saved=structuredClone(r)}};
}
test('actual bot helper refuses missing consent, invalid difficulty and unavailable storage before debit',async()=>{
 for(const [body,options,status] of [[{...request,botTermsVersion:undefined},{},409],[{...request,difficulty:'extreme'},{},400],[request,{ready:false},503]]){
  const f=fixture(options);await assert.rejects(f.ctx.startPaidBot(body),e=>e.status===status);assert.equal(f.stats().debits,0);assert.equal(f.ctx.rooms.size,0);
 }
 const f=fixture();f.ctx.previewGuestMode=true;await assert.rejects(f.ctx.startPaidBot(request),e=>e.status===503);assert.equal(f.stats().debits,0);
});
test('insufficient funds leave fallback offer unchanged and do not install a paid room',async()=>{
 const f=fixture({gold:49}),r=offer();f.ctx.rooms.set(r.code,r);await assert.rejects(f.ctx.startPaidBot({...request,expectedMatchId:botMatchId(r)},r,'fallback'),e=>e.status===400);assert.equal(f.stats().gold,49);assert.equal(f.stats().debits,0);assert.equal(f.ctx.rooms.get(r.code).phase,'bot_offer');assert.equal(f.ctx.auctionAdmissions.has(r),false);
});
test('lost fallback admission COMMIT reconciles same receipt, never charges twice or leaves stale bot_offer',async()=>{
 const f=fixture({lost:true}),r=offer();f.ctx.rooms.set(r.code,r);const body={...request,expectedMatchId:botMatchId(r)};
 await assert.rejects(f.ctx.startPaidBot(body,r,'fallback'),e=>e.uncertain===true);assert.equal(f.ctx.auctionAdmissions.has(r),true,'uncertain debit keeps stale offer reserved');
 const result=await f.ctx.startPaidBot(body,r,'fallback');assert.equal(f.stats().debits,1);assert.equal(f.stats().gold,450);assert.equal(result.room.phase,'auction');assert.equal(result.room.botEntry.matchId,botMatchId(r));assert.equal(f.ctx.rooms.get(r.code).phase,'auction');
});
test('rematch requires current match identity and settled result before creating new entry',async()=>{
 const f=fixture(),r={...offer(),phase:'finished',mode:'bot',matchSettled:true};f.ctx.rooms.set(r.code,r);
 await assert.rejects(f.ctx.startPaidBot({...request,expectedMatchId:'stale'},r,'rematch'),e=>e.status===409);r.matchSettled=false;await assert.rejects(f.ctx.startPaidBot({...request,expectedMatchId:botMatchId(r)},r,'rematch'),e=>e.status===409);assert.equal(f.stats().debits,0);
 r.matchSettled=true;const out=await f.ctx.startPaidBot({...request,expectedMatchId:botMatchId(r)},r,'rematch');assert.equal(out.room.matchNumber,2);assert.equal(out.room.created,r.created);assert.equal(f.stats().debits,1);
});
test('receipt replay never replaces a newer room sharing the code',async()=>{
 const f=fixture();const first=await f.ctx.startPaidBot(request);const newer={...first.room,matchNumber:2};f.ctx.rooms.set(newer.code,newer);await assert.rejects(f.ctx.startPaidBot(request),e=>e.status===409);assert.equal(f.ctx.rooms.get(newer.code),newer);assert.equal(f.stats().debits,1);
});

test('lost rematch COMMIT repairs prior finished room through periodic reconciliation',async()=>{
 const f=fixture({lost:true}),r={...offer(),mode:'bot',phase:'finished',matchSettled:true};f.ctx.rooms.set(r.code,r);
 await assert.rejects(f.ctx.startPaidBot({...request,expectedMatchId:botMatchId(r)},r,'rematch'),e=>e.uncertain===true);assert.equal(f.ctx.auctionAdmissions.has(r),true);
 await f.ctx.reconcileBotAdmissions();const installed=f.ctx.rooms.get(r.code);assert.equal(installed.matchNumber,2);assert.equal(installed.phase,'auction');assert.equal(f.ctx.auctionAdmissions.has(r),false);assert.equal(f.stats().debits,1);assert.equal(f.ctx.activeSeats.get('synthetic-human').matchNumber,2);
});
test('same-entry replay preserves current paid auction progression over original receipt snapshot',async()=>{
 const f=fixture(),first=await f.ctx.startPaidBot(request),r=f.ctx.rooms.get(first.room.code);r.round=4;r.players[0].credits=9;r.players[0].team=[{name:'Earned hero'}];
 const replay=await f.ctx.startPaidBot(request);assert.equal(replay.room.round,4);assert.equal(replay.room.players[0].credits,9);assert.equal(replay.room.players[0].team.length,1);assert.equal(f.ctx.rooms.get(r.code),r);assert.equal(f.stats().debits,1);
});
test('old receipt cannot replace active newer match under a different room code',async()=>{
 const f=fixture(),first=await f.ctx.startPaidBot(request);const newer={...structuredClone(first.room),code:'999',created:first.room.created+1000};f.ctx.rooms.set(newer.code,newer);f.ctx.activeSeats.set('synthetic-human',{code:newer.code,created:newer.created,matchNumber:1,seat:0});
 await assert.rejects(f.ctx.startPaidBot(request),e=>e.status===409);assert.equal(f.ctx.activeSeats.get('synthetic-human').code,'999');assert.equal(f.stats().debits,1);
});
test('cancelled fallback rejects a fresh request without debit',async()=>{
 const f=fixture(),r={...offer(),phase:'cancelled'};f.ctx.rooms.set(r.code,r);await assert.rejects(f.ctx.startPaidBot({...request,expectedMatchId:botMatchId(r)},r,'fallback'),e=>e.status===409);assert.equal(f.stats().debits,0);
});
test('settlement queue locks the first server outcome and retries storage failure without accepting a new winner',async()=>{
 const f=fixture(),first=await f.ctx.startPaidBot(request),r=f.ctx.rooms.get(first.room.code),calls=[];let fail=true;
 f.ctx.settleBotMatch=async args=>{calls.push(args.winner);if(fail)throw Error('synthetic storage outage');return{room:{...structuredClone(args.room),matchSettled:true,botSettlementPending:false,botSettlementReceipt:{outcome:'win'}}}};
 f.ctx.queueBotSettlement(r,0);f.ctx.queueBotSettlement(r,1);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(r.matchSettled,undefined);assert.equal(r.botSettlementPending,true);assert.deepEqual(calls,[0]);
 fail=false;await f.ctx.flushBotSettlements();assert.deepEqual(calls,[0,0]);assert.equal(r.matchSettled,true);assert.equal(r.botSettlementReceipt.outcome,'win');f.ctx.queueBotSettlement(r,1);await f.ctx.flushBotSettlements();assert.deepEqual(calls,[0,0]);
});
test('restart recovery refunds only persisted interrupted live combat, not disconnected auction',async()=>{
 for(const live of [false,true]){
  const f=fixture(),first=await f.ctx.startPaidBot(request),r=f.ctx.rooms.get(first.room.code),calls=[];
  if(live){r.phase='finished';r.battleSync={result:{live:true,finished:false,winner:null}}}
  f.ctx.recoverBotMatches=async()=>[{room:structuredClone(r),match_id:botMatchId(r),settled:false}];
  f.ctx.settleBotMatch=async args=>{calls.push({winner:args.winner,serverFailure:args.serverFailure});return{room:{...structuredClone(args.room),matchSettled:true,botSettlementPending:false,botSettlementReceipt:{outcome:'server_failure'}}}};
  await f.ctx.initializeBotEconomy();await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(calls,live?[{winner:null,serverFailure:'server_restart'}]:[]);assert.equal(f.stats().debits,1);
 }
});

test('terminal recovery never resurrects expired rooms or replays bounded social history',async()=>{
 const f=fixture(),first=(await f.ctx.startPaidBot(request)).room;
 const terminal={...first,phase:'finished',matchSettled:true,botSettlementReceipt:{outcome:'win',rewards:{gold:125,magicDust:2,diamonds:0}},series:[1,0]};
 f.ctx.rooms.clear();let records=0;f.ctx.recordMatch=()=>records++;
 f.ctx.recoverBotMatches=async()=>[{room:terminal,match_id:botMatchId(terminal),settled:true}];
 await f.ctx.initializeBotEconomy();assert.equal(f.ctx.rooms.size,0);assert.equal(records,0);
 const current={...structuredClone(terminal),battleCompleted:[true,true],lastActivity:999999};f.ctx.rooms.set(current.code,current);
 await f.ctx.initializeBotEconomy();assert.equal(f.ctx.rooms.get(current.code),current);assert.deepEqual(current.battleCompleted,[true,true]);assert.equal(current.lastActivity,999999);assert.equal(records,0,'historical receipts do not replay counters after dedupe eviction');
});
