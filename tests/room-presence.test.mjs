import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoomPresence} from '../room-presence.js';
const room = extra => ({code:'123',created:1,matchNumber:1,phase:'auction',auctionStarted:true,players:[{accountId:'a'},{accountId:'b'}],...extra});
const setup = extra => {const r=room(extra),p=createRoomPresence({now:()=>1000});const a=p.connect(r,0),b=p.connect(r,1);return {r,p,a,b};};
test('disconnect grace exact boundary and continuously remaining player wins',()=>{
 const {r,p,a}=setup();p.disconnect(r,a,2000);
 assert.equal(p.snapshot(r,{at:101999}).winner,null);assert.equal(p.snapshot(r,{at:102000}).winner,1);
 assert.equal(p.snapshot(r,{at:102000}).remainingMs,0);
});
test('both leave before deadline: never award absent player',()=>{
 const {r,p,a,b}=setup();p.disconnect(r,a,2000);p.disconnect(r,b,100000);
 const value=p.snapshot(r,{at:102000});assert.equal(value.winner,null);assert.equal(value.deadline,null);assert.equal(value.bothAbsent,true);
});
test('return before deadline cancels absence and countdown',()=>{
 const {r,p,a}=setup();p.disconnect(r,a,2000);p.connect(r,0,101999);
 assert.equal(p.snapshot(r,{at:102000}).winner,null);assert.equal(p.snapshot(r,{at:102000}).deadline,null);
});
test('candidate leaving and returning must stay a fresh full grace',()=>{
 const {r,p,a,b}=setup();p.disconnect(r,a,2000);p.disconnect(r,b,3000);p.connect(r,1,4000);
 assert.equal(p.snapshot(r,{at:102000}).winner,null);assert.equal(p.snapshot(r,{at:104000}).winner,1);
});
test('multi-tab close does not disconnect player with another live session',()=>{
 const {r,p,a}=setup();const a2=p.connect(r,0,2000);p.disconnect(r,a,3000);
 assert.equal(p.snapshot(r,{at:500000}).seats[0].connected,true);p.disconnect(r,a2,500001);
 assert.equal(p.snapshot(r,{at:500001}).seats[0].absentSince,500001);
});
test('authenticated polling fallback lease expires at known expiry, not delayed tick',()=>{
 const r=room(),p=createRoomPresence();p.initialize(r,1000);p.touch(r,0,2000);p.connect(r,1,2000);
 assert.equal(p.snapshot(r,{at:46999}).seats[0].connected,true);
 const s=p.snapshot(r,{at:100000});assert.equal(s.seats[0].absentSince,47000);assert.equal(s.deadline,147000);
});
test('old SSE-only clients never require a new heartbeat',()=>{
 const {r,p}=setup();const s=p.snapshot(r,{at:999999999});assert.equal(s.winner,null);assert.equal(s.seats.every(seat=>seat.connected),true);
});
test('transport closure ignores stale poll lease when already expired',()=>{
 const {r,p,a}=setup();p.touch(r,0,2000);p.disconnect(r,a,100000);
 assert.equal(p.snapshot(r,{at:100000}).seats[0].absentSince,100000);
});
test('new worker boot starts fresh grace rather than using old wall-clock absence',()=>{
 const r=room(),p=createRoomPresence();p.initialize(r,1000000);p.connect(r,1,1000000);
 assert.equal(p.snapshot(r,{at:1099999}).winner,null);assert.equal(p.snapshot(r,{at:1100000}).winner,1);
});
test('stale connection callback cannot affect rematch identity',()=>{
 const {r,p,a}=setup();r.matchNumber++;const next=p.connect(r,0,2000);
 assert.equal(p.disconnect(r,a,3000),false);assert.equal(p.snapshot(r,{at:3000}).seats[0].connected,true);assert.equal(p.disconnect(r,next,4000),true);
});
test('arena/settled/cancelled/preauction phases never forfeit',()=>{
 for(const extra of [{battleSync:{result:{live:true}}},{battleSync:{result:{live:false}}},{battleCompleted:[true,false]},{matchSettled:true},{idleClosed:{}},{cancelled:{}},{phase:'waiting',auctionStarted:false},{phase:'cancelled'}]){
  const {r,p,a}=setup(extra);p.disconnect(r,a,2000);assert.equal(p.snapshot(r,{at:999999}).winner,null);
 }
 const {r,p,a}=setup();p.disconnect(r,a,2000);assert.equal(p.snapshot(r,{at:999999,liveArena:true}).winner,null);
});
test('formation after auction is eligible, bot opponent never wins',()=>{
 const {r,p,a}=setup({phase:'finished',battleSync:{ready:[null,null]}});p.disconnect(r,a,2000);assert.equal(p.snapshot(r,{at:102000}).winner,1);
 const bot=setup({mode:'bot'});assert.equal(bot.b,null);bot.p.disconnect(bot.r,bot.a,2000);const s=bot.p.snapshot(bot.r,{at:102000});assert.equal(s.winner,null);assert.equal(s.bothAbsent,true);
});
test('presence never mutates meaningful activity or persistent room state',()=>{
 const r=room({playerActivity:{match:'123:1:1',at:1000}}),before=JSON.stringify(r),p=createRoomPresence();const h=p.connect(r,0,1000);p.touch(r,0,2000);p.disconnect(r,h,3000);p.snapshot(r,{at:999999});assert.equal(JSON.stringify(r),before);
});
test('invalid seats and duplicate disconnects fail safely',()=>{
 const {r,p,a}=setup();assert.equal(p.connect(r,2,2000),null);assert.equal(p.touch(r,-1,2000),false);assert.equal(p.disconnect(r,a,2000),true);assert.equal(p.disconnect(r,a,3000),false);assert.throws(()=>p.snapshot(r,{at:NaN}));
});
test('clock rollback cannot resurrect a lease',()=>{
 const r=room(),p=createRoomPresence();p.touch(r,0,1000);p.snapshot(r,{at:50000});assert.equal(p.snapshot(r,{at:1000}).seats[0].connected,false);
});

test('explicit leave revokes all old tabs and leases; fresh authentication may return',()=>{
 const {r,p,a}=setup();const a2=p.connect(r,0,2000);p.touch(r,0,3000);p.leave(r,0,4000);
 assert.equal(p.snapshot(r,{at:4000}).seats[0].connected,false);assert.equal(p.disconnect(r,a,5000),false);assert.equal(p.disconnect(r,a2,5000),false);
 p.touch(r,0,6000);assert.equal(p.snapshot(r,{at:6000}).seats[0].connected,true);
});
test('last SSE close starts grace immediately even after a recent authenticated poll',()=>{
 const room={code:'123',created:1,phase:'auction',auctionStarted:true,players:[{},{}]},p=createRoomPresence({now:()=>0});
 p.connect(room,0,1000);const leaving=p.connect(room,1,1000);p.touch(room,1,5000);
 p.disconnect(room,leaving,6000);const state=p.snapshot(room,{at:6000});
 assert.equal(state.seats[1].absentSince,6000);assert.equal(state.deadline,106000);
 assert.equal(p.snapshot(room,{at:105999}).winner,null);assert.equal(p.snapshot(room,{at:106000}).winner,0);
});

test('automatic return uses the absent seat’s last contact across all match stages',()=>{
 for(const extra of [{},{mode:'bot'},{phase:'finished'},{battleSync:{result:{live:true}}},{matchSettled:true,battleSync:{result:{finished:true}}},{idleClosed:{}}]){
  const {r,p,a}=setup(extra);p.touch(r,0,5000);p.disconnect(r,a,5000);
  p.touch(r,1,104000);
  assert.equal(p.canAutoReturn(r,0,104999),true);
  for(const at of [105000,3605000])assert.equal(p.canAutoReturn(r,0,at),false);
 }
});
test('automatic return reads do not renew a polling lease or an old stored room after restart',()=>{
 const r=room({playerActivity:{at:1000},lastActivity:8_000_000}),p=createRoomPresence();
 p.initialize(r,1_000_000);assert.equal(p.canAutoReturn(r,0,1_000_000),false);
 p.touch(r,0,2_000_000);
 assert.equal(p.canAutoReturn(r,0,2_099_999),true);assert.equal(p.canAutoReturn(r,0,2_100_000),false);
});

test('an open or recently closed stream and background polling cannot reopen an old seat',()=>{
 const {r,p,a}=setup();p.touch(r,0,2000);
 p.touch(r,0,101999,false);assert.equal(p.canAutoReturn(r,0,101999),true);
 assert.equal(p.canAutoReturn(r,0,102000),false,'socket is still open');
 p.disconnect(r,a,3_602_000);p.connect(r,0,3_603_000);p.touch(r,0,3_603_001,false);
 assert.equal(p.canAutoReturn(r,0,3_603_002),false,'transport reconnect or legacy polling is not a foreground visit');
});
test('restarted server uses the seat’s own action, including when another player is still active',()=>{
 const r=room({playerActivity:{match:'123:1:1',at:3_600_000,seats:[2000,3_600_000]}});
 const p=createRoomPresence();assert.equal(p.canAutoReturn(r,0,3_600_001),false);assert.equal(p.canAutoReturn(r,1,3_600_001),true);
 delete r.playerActivity.seats;assert.equal(p.canAutoReturn(r,0,3_600_001),false,'legacy room-wide activity cannot revive the abandoned seat');
});
