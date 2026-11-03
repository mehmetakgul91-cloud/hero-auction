import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {cancellationMatchId} from '../paid-match-cancellation.js';
const source=readFileSync(new URL('../server.js',import.meta.url),'utf8');
const start=source.indexOf('function expireRetainedRooms(');
const body=source.slice(start,source.indexOf('\nsetInterval(()=>{for(const r of rooms.values()){',start));
const day=24*3600_000;
const terminal=extra=>({code:'123',created:1000,matchNumber:1,phase:'finished',matchSettled:true,players:[{accountId:'a'},{accountId:'b'}],battleSync:{result:{live:true,finished:true}},battleCompleted:[true,true],...extra});
function setup(room=terminal()){
 const ended=[],closed=[];
 const context={rooms:new Map([[room.code,room]]),database:null,databaseReady:true,socialSaveNeedsConfirmation:false,cancellationMatchId,liveArenaMatchKeys:new Map([[room.code,'arena-key']]),liveArenaLifecycle:{status:()=>({finished:true}),endRoom:id=>ended.push(id)},auctionAdmissions:new Set(),idleRoomJobs:new Map(),isCancellationReserved:()=>false,roomRequestFlights:new Map(),roomFlushes:new Map(),battlePreparationFlights:new Map(),pendingVictoryChests:new Map(),victoryChestFlights:new Set(),botSettlementFlights:new Set(),botSettlementJobs:new Map(),pendingGold:new Map(),dirtyRooms:new Set(),waiting:new Map([[room.code,{}]]),listeners:new Map([[room.code,new Set([{res:{end:()=>closed.push(room.code)}}])]])};
 vm.createContext(context);vm.runInContext(body+'\nthis.retire=expireRetainedRooms;',context);
 return{room,context,ended,closed,run:()=>context.retire(room.created+day+1)};
}
test('settled Arena expires only after 24 hours, releasing room code, runner and listeners',()=>{
 const s=setup();s.context.retire(s.room.created+day);assert.equal(s.context.rooms.size,1);
 s.run();assert.equal(s.context.rooms.size,0);assert.equal(s.context.liveArenaMatchKeys.size,0);assert.deepEqual(s.ended,['123']);assert.deepEqual(s.closed,['123']);assert.equal(s.context.waiting.size,0);assert.equal(s.context.listeners.size,0);assert.equal(s.context.dirtyRooms.has('123'),true);
 s.run();assert.equal(s.ended.length,1);
});
test('active or unresolved Arena is never removed, even beyond terminal retention',()=>{
 for(const extra of [{matchSettled:false},{battleSync:{result:{live:true,finished:false}}},{battleSettlementPending:true},{victoryChestPending:true},{botSettlementPending:true},{pendingDisconnectForfeit:{}}]){
  const s=setup(terminal(extra));s.run();assert.equal(s.context.rooms.size,1,JSON.stringify(extra));assert.equal(s.ended.length,0);
 }
 const s=setup();s.context.liveArenaLifecycle.status=()=>({finished:false});s.run();assert.equal(s.context.rooms.size,1);
});
test('persistence and reward operations retain terminal evidence until confirmed',()=>{
 const blocked=[s=>s.context.socialSaveNeedsConfirmation=true,s=>{s.context.database={};s.context.databaseReady=false;},s=>s.context.auctionAdmissions.add(s.room),s=>s.context.idleRoomJobs.set('123',{}),s=>s.context.isCancellationReserved=()=>true,s=>s.context.roomRequestFlights.set(s.room,1),s=>s.context.roomFlushes.set('123',{}),s=>s.context.battlePreparationFlights.set(cancellationMatchId(s.room),{}),s=>s.context.pendingVictoryChests.set(cancellationMatchId(s.room),{}),s=>s.context.victoryChestFlights.add(cancellationMatchId(s.room)),s=>s.context.botSettlementFlights.add(cancellationMatchId(s.room)),s=>s.context.botSettlementJobs.set(cancellationMatchId(s.room),{}),s=>s.context.pendingGold.set(cancellationMatchId(s.room),{}),s=>s.context.pendingGold.set('123:refund:0:1:1000',{})];
 for(const block of blocked){const s=setup();block(s);s.run();assert.equal(s.context.rooms.size,1);assert.equal(s.ended.length,0);}
});
test('ordinary settled and unpaid-cancelled rooms retain existing cleanup semantics',()=>{
 for(const extra of [{battleSync:undefined,battleCompleted:undefined},{battleSync:{result:{live:false}}},{phase:'cancelled',matchSettled:false,entryPaid:false,battleSync:undefined,battleCompleted:undefined}]){const s=setup(terminal(extra));s.run();assert.equal(s.context.rooms.size,0);}
 for(const phase of ['waiting','matching','auction','finished']){const s=setup(terminal({phase,matchSettled:false,battleSync:undefined,battleCompleted:undefined}));s.run();assert.equal(s.context.rooms.size,1);}
 const s=setup(terminal({idleClosed:{at:2000}}));s.context.retire(1000+day+1);assert.equal(s.context.rooms.size,1);s.context.retire(2000+day+1);assert.equal(s.context.rooms.size,0);
});
test('completed Arena rooms cannot permanently consume all 900 room codes',()=>{
 const s=setup();s.context.rooms=new Map(Array.from({length:900},(_,n)=>{const code=String(100+n);return[code,terminal({code})]}));
 s.run();assert.equal(s.context.rooms.size,0);assert.equal(s.context.dirtyRooms.size,900);assert.equal(s.ended.length,900);
 assert.match(source,/\}expireRetainedRooms\(\);for\(const \[id,w\]of waiting\)/);
});
