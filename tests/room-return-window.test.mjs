import test from 'node:test';
import assert from 'node:assert/strict';
import {watchRoomDeparture} from '../public/room-return-window.js';

function device() {
 const states=new Map(),seat={code:'123',token:'player'},login='signed-in';
 states.set('hero-auction-session',JSON.stringify(seat));states.set('hero-auction-login',login);
 let clock=1000;
 const storage={getItem:key=>states.get(key)??null,setItem:(key,value)=>states.set(key,value),removeItem:key=>states.delete(key)};
 function tab() {
  const events=new Map(),listen=(event,callback)=>events.set(event,callback);
  const document={hidden:false,addEventListener:listen};
  let current=seat;
  const guard=watchRoomDeparture({window:{addEventListener:listen,setInterval:fn=>listen('heartbeat',fn)},document,storage,getSeat:()=>current,onExpire(){current=null;},now:()=>clock});
  return {guard,events,document,current:()=>current};
 }
 return {tab,seat,states,tick:ms=>clock+=ms};
}
for(const gap of [99_999,100_000,3_600_000])test('a hidden tab, cached page and cold reload share the boundary at '+gap+' ms',()=>{
 const d=device(),t=d.tab();t.document.hidden=true;t.events.get('visibilitychange')();
 d.tick(500);t.events.get('pagehide')();d.tick(gap-500);
 assert.equal(d.tab().guard.expired(d.seat),gap>=100_000);
 t.document.hidden=false;t.events.get('pageshow')();t.events.get('visibilitychange')();
 assert.equal(Boolean(t.current()),gap<100_000);
 assert.equal(d.states.has('hero-auction-session'),gap<100_000);
 assert.equal(d.states.get('hero-auction-login'),'signed-in');
 assert.equal(d.tab().guard.expired(d.seat),gap>=100_000,'a second opening cannot revive the expired seat');
});
test('expiry of an old tab leaves a new saved seat and login intact',()=>{
 const d=device(),t=d.tab();t.events.get('pagehide')();d.tick(100_000);
 const next={code:'456',token:'other'};
 d.states.set('hero-auction-session',JSON.stringify(next));t.events.get('pageshow')();
 assert.deepEqual(JSON.parse(d.states.get('hero-auction-session')),next);assert.equal(t.guard.expired(next),false);
});

for(const gap of [99_999,100_000,3_600_000])test('OS suspension without a departure event: '+gap+' ms',()=>{
 const d=device(),t=d.tab();t.guard.activate(d.seat);d.tick(12_000);t.events.get('heartbeat')();
 d.tick(gap);
 assert.equal(d.tab().guard.expired(d.seat),gap>=100_000,'cold launch reads the last foreground checkpoint');
 t.events.get('heartbeat')();
 assert.equal(Boolean(t.current()),gap<100_000,'a thawed timer checks expiry before refreshing it');
 assert.equal(d.states.get('hero-auction-login'),'signed-in');
});
test('delayed pagehide cannot renew a discarded seat, and background timers never renew it',()=>{
 const d=device(),t=d.tab();t.guard.activate(d.seat);d.tick(3_600_000);
 t.document.hidden=true;t.events.get('pagehide')();t.events.get('heartbeat')();
 assert.equal(d.tab().guard.expired(d.seat),true);
});
