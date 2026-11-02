import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeRoomActivity,recordRoomAction,roomIdleDue,isArenaRoom,createRoomIdleReservations} from '../room-inactivity.js';
const make = (extra={}) => ({code:'123',created:10,matchNumber:1,phase:'auction',players:[{accountId:'a'},{accountId:'b'}],...extra});
const initialized = extra => {const room=make(extra);initializeRoomActivity(room,1000);return room;};
test('exact 120-second boundary; either human resets the room clock',()=>{
 const room=initialized();assert.equal(roomIdleDue(room,{now:120999}),false);assert.equal(roomIdleDue(room,{now:121000}),true);
 for(const seat of [0,1]){recordRoomAction(room,{action:'bid',seat,now:121000+seat});assert.equal(roomIdleDue(room,{now:121001}),false);}
});
test('reads, reconnect, heartbeat, rejected and automated actions do not count',()=>{
 const room=initialized();for(const action of ['state','heartbeat','online','sse','reconnect','automatic-pass','bot-turn','invalid-bid'])assert.equal(recordRoomAction(room,{action,seat:0,now:120000}),false);
 assert.equal(room.playerActivity.at,1000);assert.equal(roomIdleDue(room,{now:121000}),true);
 const bot=initialized({mode:'bot'});assert.equal(recordRoomAction(bot,{action:'bid',seat:1,now:120000}),false);
});
test('invalid identities cannot record an action',()=>{
 const room=initialized();for(const seat of [-1,2,null,0.5])assert.equal(recordRoomAction(room,{action:'pass',seat,now:2000}),false);
 room.players[1]=null;assert.equal(recordRoomAction(room,{action:'chat',seat:1,now:2000}),false);
});
test('arena and completed arena are excluded without offline exceptions',()=>{
 for(const extra of [{battleSync:{result:{live:true}}},{battleSync:{result:{live:false}}},{battleCompleted:[true,false]}]){
  const room=initialized({phase:'finished',...extra});assert.equal(isArenaRoom(room),true);assert.equal(roomIdleDue(room,{now:999999999}),false);
 }
 assert.equal(roomIdleDue(initialized(),{now:999999999,liveArena:true}),false);
});
test('formation is distinct from actual arena',()=>{
 const room=initialized({phase:'finished',battleSync:{ready:[null,null],drafts:[{},{}]}});assert.equal(isArenaRoom(room),false);assert.equal(roomIdleDue(room,{now:121000}),true);
});
test('all non-arena room phases use same idle rule',()=>{
 for(const phase of ['waiting','matching','bot_offer','auction','finished'])assert.equal(roomIdleDue(initialized({phase}),{now:121000}),true);
 for(const phase of ['cancelled','unknown'])assert.equal(roomIdleDue(initialized({phase}),{now:121000}),false);
});
test('in-flight admission, preparation, cancellation and economic writes defer closure',()=>{
 assert.equal(roomIdleDue(initialized(),{now:121000,busy:true}),false);
 for(const flag of ['inviteJoining','inviteUncertain','joinPending','rematchPending','botSettlementPending','victoryChestPending','idleClosed','cancelled'])assert.equal(roomIdleDue(initialized({[flag]:true}),{now:121000}),false);
});
test('persisted activity survives worker restart; legacy gets one grace period',()=>{
 const room=make({lastActivity:1});assert.equal(roomIdleDue(room,{now:999999}),false);assert.equal(initializeRoomActivity(room,999999),true);
 const loaded=JSON.parse(JSON.stringify(room));assert.equal(initializeRoomActivity(loaded,1099999),false);assert.equal(roomIdleDue(loaded,{now:1119999}),true);
});
test('new rematch cannot inherit old timestamp or reservation',()=>{
 const room=initialized(),locks=createRoomIdleReservations(),lock=locks.reserve(room,{now:121000});assert.ok(lock);
 room.matchNumber++;assert.equal(locks.current(room,lock),false);assert.equal(roomIdleDue(room,{now:999999}),false);initializeRoomActivity(room,999999);assert.equal(room.playerActivity.at,999999);
});
test('reservation is synchronous, single-owner and identity/activity checked',()=>{
 const room=initialized(),locks=createRoomIdleReservations(),lock=locks.reserve(room,{now:121000});assert.ok(lock);assert.equal(locks.has(room),true);assert.equal(locks.reserve(room,{now:121000}),null);assert.equal(locks.current(room,lock),true);assert.equal(locks.release(room,{}),false);
 recordRoomAction(room,{action:'pass',seat:0,now:121000});assert.equal(locks.current(room,lock),false);assert.equal(locks.release(room,lock),true);assert.equal(locks.has(room),false);
});
test('policy never mutates match outcomes, fees, wallet or arena',()=>{
 const room=initialized({entryPaid:true,botEntry:{entryGold:50},series:[0,0]});const before=JSON.stringify(room);roomIdleDue(room,{now:121000});createRoomIdleReservations().reserve(room,{now:121000});assert.equal(JSON.stringify(room),before);
});
test('clock rollback and corrupt timestamp fail safely',()=>{
 const room=initialized();recordRoomAction(room,{action:'pass',seat:0,now:500});assert.equal(room.playerActivity.at,1000);assert.equal(roomIdleDue(room,{now:0}),false);room.playerActivity.at=NaN;assert.equal(roomIdleDue(room,{now:121000}),false);assert.throws(()=>initializeRoomActivity(room,NaN));
});
