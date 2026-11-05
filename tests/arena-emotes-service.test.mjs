import test from 'node:test';
import assert from 'node:assert/strict';
import {ARENA_EMOTE_IDS,ARENA_EMOTE_COOLDOWN_MS,ARENA_EMOTE_LIFETIME_MS,arenaEmoteMatchKey,arenaEmotePlatformAllowed,createArenaEmotesService} from '../arena-emotes-service.js';
import {requireModerationForInteraction} from '../moderation-availability.js';

function fixture(options={}){
 let time=10000,sequence=0;
 const room={code:'ABC',created:1234,matchNumber:1,mode:'friend',phase:'finished',players:[{token:'seat-a',accountId:'a',credits:12,team:[]},{token:'seat-b',accountId:'b',credits:8,team:[]}],battleSync:{result:{live:true,finished:false,teams:[[{hp:10}],[{hp:12}]],winner:null},commanderInput:{commanders:[{commanderId:'attack'},{commanderId:'support'}]}}};
 const service=createArenaEmotesService({now:()=>time,makeId:()=>`event-${++sequence}`,...options});
 const context=(seat=0,extra={})=>({room,token:room.players[seat].token,activeMatchKey:arenaEmoteMatchKey(room),liveRunning:true,moderationReady:true,blocked:false,platformAllowed:true,...extra});
 const input=(extra={},seat=0)=>({code:room.code,token:room.players[seat].token,matchKey:arenaEmoteMatchKey(room),emoteId:'laugh',requestId:'request-0001',...extra});
 return {room,service,context,input,advance:ms=>{time+=ms}};
}
const status=expected=>error=>error.status===expected;

test('six fixed IDs, authoritative time, exact public schema and receiver-relative sides',()=>{
 assert.deepEqual(ARENA_EMOTE_IDS,['laugh','slow_clap','fake_cry','yawn','sunglasses','nanik']);
 const h=fixture();
 for(const [i,emoteId] of ARENA_EMOTE_IDS.entries()){
  const own=h.service.send(h.context(),h.input({emoteId,requestId:`request-${i}`}));
  assert.equal(own.enabled,true);assert.equal(own.matchKey,'ABC:1:1234');assert.equal(own.cooldownMs,ARENA_EMOTE_COOLDOWN_MS);
  assert.deepEqual(Object.keys(own).sort(),['cooldownMs','enabled','events','matchKey','serverTime']);
  const event=own.events[0];assert.equal(event.side,0);assert.equal(event.emoteId,emoteId);assert.equal(event.at,own.serverTime);assert.equal(event.expiresAt-event.at,ARENA_EMOTE_LIFETIME_MS);
  assert.deepEqual(Object.keys(event).sort(),['at','emoteId','expiresAt','id','side']);
  const other=h.service.snapshot(h.context(1));assert.equal(other.events[0].side,1);assert.equal(other.cooldownMs,0);
  h.advance(ARENA_EMOTE_COOLDOWN_MS);
 }
});

test('authentication is room scoped and invalid IDs, sender claims, text and URLs are rejected',()=>{
 const h=fixture();
 for(const token of [undefined,null,'','spectator-token',42]){
  assert.throws(()=>h.service.snapshot(h.context(0,{token})),status(403));
  assert.throws(()=>h.service.send(h.context(0,{token}),h.input()),status(403));
 }
 assert.throws(()=>h.service.snapshot(h.context(0,{room:null})),status(403));
 assert.throws(()=>h.service.send(h.context(),h.input({code:'OTHER'})),status(403));
 assert.throws(()=>h.service.send(h.context(),h.input({token:'seat-b'})),status(403));
 for(const emoteId of ['chicken','commander_attack','Laugh','https://site.test/x.png','<script>',{},null,1])assert.throws(()=>h.service.send(h.context(),h.input({emoteId})),status(422));
 for(const extra of [{side:1},{seat:1},{sender:'a'},{text:'hello'},{message:'hello'},{url:'https://site.test/x'},{at:0},{expiresAt:999999},{events:[]}])assert.throws(()=>h.service.send(h.context(),h.input(extra)),status(422));
 for(const requestId of ['',7,'short','a'.repeat(81),'hello world','https://a.test'])assert.throws(()=>h.service.send(h.context(),h.input({requestId})),status(422));
 for(const invalid of [null,[],{},'laugh'])assert.throws(()=>h.service.send(h.context(),invalid));
 assert.deepEqual(h.service.snapshot(h.context()).events,[]);
});

test('cooldown is per seat, exact at five seconds, and retries never duplicate or extend it',()=>{
 const h=fixture(),first=h.service.send(h.context(),h.input());
 h.advance(1000);
 const duplicate=h.service.send(h.context(),h.input());
 assert.deepEqual(duplicate.events,first.events);assert.equal(duplicate.cooldownMs,4000);
 assert.throws(()=>h.service.send(h.context(),h.input({emoteId:'yawn'})),status(409));
 assert.throws(()=>h.service.send(h.context(),h.input({requestId:'request-0002'})),status(429));
 const opponent=h.service.send(h.context(1),h.input({emoteId:'nanik'},1));
 assert.equal(opponent.events.length,2);assert.deepEqual(opponent.events.map(e=>e.side),[1,0]);
 h.advance(1800);
 assert.equal(h.service.snapshot(h.context()).events.length,1,'expires at exactly 2800ms');
 h.advance(2199);
 assert.equal(h.service.snapshot(h.context()).cooldownMs,1);
 assert.throws(()=>h.service.send(h.context(),h.input({requestId:'request-0002'})),status(429));
 h.advance(1);
 const expiredRetry=h.service.send(h.context(),h.input());assert.equal(expiredRetry.cooldownMs,0);assert.deepEqual(expiredRetry.events,[]);
 const next=h.service.send(h.context(),h.input({requestId:'request-0002'}));assert.equal(next.events.length,1);assert.notEqual(next.events[0].id,first.events[0].id);
 h.advance(500);
 const oldRetry=h.service.send(h.context(),h.input());assert.equal(oldRetry.cooldownMs,4500);assert.deepEqual(oldRetry.events,next.events);
});

test('old matches and stale seat tokens cannot enter a rematch or a recycled room',()=>{
 const h=fixture(),oldInput=h.input(),old=h.service.send(h.context(),oldInput);
 h.room.matchNumber=2;h.room.created=2234;
 assert.throws(()=>h.service.send(h.context(),oldInput),status(409));
 const fresh=h.service.snapshot(h.context());assert.equal(fresh.matchKey,'ABC:2:2234');assert.equal(fresh.cooldownMs,0);assert.deepEqual(fresh.events,[]);
 const next=h.service.send(h.context(),h.input());assert.notEqual(next.events[0].id,old.events[0].id);
 h.room.players[0].token='replacement-seat';
 assert.throws(()=>h.service.snapshot(h.context(0,{token:oldInput.token})),status(403));
 assert.deepEqual(h.service.snapshot(h.context()).events,[]);
 const replacement=structuredClone(h.room);
 assert.deepEqual(h.service.snapshot(h.context(0,{room:replacement})).events,[]);
});

test('preparation, terminal rooms, bots, inactive engines and missing safety state fail closed',()=>{
 const changes=[r=>{r.phase='waiting'},r=>{r.phase='cancelled'},r=>{r.battleSync=null},r=>{r.battleSync.result.live=false},r=>{r.battleSync.result.finished=true},r=>{r.matchSettled=true},r=>{r.idleClosed={at:1}},r=>{r.cancelled={}},r=>{r.disconnectForfeit={}},r=>{r.rematchPending=true},r=>{r.mode='bot'}];
 for(const change of changes){const h=fixture();change(h.room);assert.equal(h.service.snapshot(h.context()).enabled,false);assert.throws(()=>h.service.send(h.context(),h.input()),status(409))}
 for(const [extra,expected] of [[{activeMatchKey:'ABC:0:1'},409],[{liveRunning:false},409],[{moderationReady:false},503],[{moderationReady:undefined},503],[{blocked:true},403],[{blocked:undefined},403],[{platformAllowed:false},403],[{platformAllowed:undefined},403]]){
  const h=fixture();assert.equal(h.service.snapshot(h.context(0,extra)).enabled,false);assert.throws(()=>h.service.send(h.context(0,extra),h.input()),status(expected));
 }
 assert.throws(()=>requireModerationForInteraction(false,'/api/arena-emotes'),status(503));
});

test('auction and live arena share match, events and cooldown across preparation; waiting is disabled',()=>{
 const h=fixture(),battleSync=h.room.battleSync;
 h.room.phase='waiting';h.room.battleSync=null;
 const other=h.room.players[1];h.room.players[1]=null;
 assert.equal(h.service.snapshot(h.context()).enabled,false);
 assert.throws(()=>h.service.send(h.context(),h.input()),status(409));
 h.room.players[1]=other;h.room.phase='auction';
 const event=h.service.send(h.context(0,{activeMatchKey:null,liveRunning:false}),h.input());assert.equal(event.enabled,true);
 h.advance(1000);h.room.phase='finished';
 const preparation=h.service.snapshot(h.context(0,{activeMatchKey:null,liveRunning:false}));assert.equal(preparation.enabled,false);assert.deepEqual(preparation.events,[]);
 h.room.battleSync=battleSync;
 const arena=h.service.snapshot(h.context());assert.equal(arena.matchKey,event.matchKey);assert.deepEqual(arena.events,event.events);assert.equal(arena.cooldownMs,4000);
 assert.throws(()=>h.service.send(h.context(),h.input({requestId:'arena-request'})),status(429));
});

test('new blocks discard both directions immediately without resetting cooldown or retry receipts',()=>{
 const h=fixture();h.service.send(h.context(),h.input());h.service.send(h.context(1),h.input({},1));
 const blocked=h.context(1,{blocked:true});
 assert.deepEqual(h.service.snapshot(blocked).events,[]);assert.equal(h.service.snapshot(blocked).enabled,false);
 assert.throws(()=>h.service.send(blocked,h.input({requestId:'request-block'},1)),status(403));
 assert.deepEqual(h.service.snapshot(h.context()).events,[]);
 const duplicate=h.service.send(h.context(),h.input());assert.deepEqual(duplicate.events,[]);assert.equal(duplicate.cooldownMs,5000);
});

test('a safety restriction during preparation cannot revive an auction event in arena',()=>{
 const h=fixture(),battleSync=h.room.battleSync;
 h.room.phase='auction';h.room.battleSync=null;h.service.send(h.context(),h.input());
 h.room.phase='finished';h.service.snapshot(h.context(0,{blocked:true,liveRunning:false}));
 h.room.battleSync=battleSync;
 assert.deepEqual(h.service.snapshot(h.context()).events,[]);
 assert.equal(h.service.snapshot(h.context()).cooldownMs,5000);
});

test('platform restrictions use verified identities and portal origins without changing other clients',()=>{
 const h=fixture();assert.equal(arenaEmotePlatformAllowed(h.room,{}),true);
 for(const referer of ['https://game.test/crazygames/','https://game.test/crazygames/battle-preview.html','https://www.crazygames.com/game/x','https://games.crazygames.com/x'])assert.equal(arenaEmotePlatformAllowed(h.room,{referer}),false);
 assert.equal(arenaEmotePlatformAllowed(h.room,{origin:'https://www.crazygames.com'}),false);
 assert.equal(arenaEmotePlatformAllowed(h.room,{referer:'invalid'}),false);
 assert.equal(arenaEmotePlatformAllowed(h.room,{origin:'https://native.example',referer:'https://game.test/battle-preview.html'}),true);
 assert.equal(arenaEmotePlatformAllowed(h.room,{origin:'https://notcrazygames.com'}),true);
 h.room.players[1].accountId='crazygames:game:player';assert.equal(arenaEmotePlatformAllowed(h.room,{}),false);
});

test('bounded receipts fail closed instead of dropping idempotency; returned events are detached copies',()=>{
 let broadcasts=0;
 const h=fixture({maxRequestsPerSeat:2,onEvent:()=>broadcasts++});
 const first=h.service.send(h.context(),h.input());first.events[0].emoteId='not-real';
 h.service.send(h.context(),h.input());assert.equal(broadcasts,1,'an idempotent retry does not re-broadcast');
 assert.equal(h.service.snapshot(h.context()).events[0].emoteId,'laugh');
 h.advance(5000);h.service.send(h.context(),h.input({requestId:'request-0002'}));h.advance(5000);
 assert.throws(()=>h.service.send(h.context(),h.input({requestId:'request-0003'})),status(429));
 const old=h.service.send(h.context(),h.input());assert.deepEqual(old.events,[]);assert.equal(old.cooldownMs,0);
 const other=h.service.send(h.context(1),h.input({},1));assert.equal(other.events.length,1);
});

test('sending and reading emotes never mutates room, teams, outcomes, abilities, or persistence data',()=>{
 const h=fixture(),before=structuredClone(h.room);
 const freeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);for(const v of Object.values(value))freeze(v)}};
 freeze(h.room);
 h.service.send(h.context(),h.input());h.service.snapshot(h.context(1));h.advance(5000);h.service.send(h.context(),h.input({requestId:'request-0002'}));
 assert.deepEqual(h.room,before);assert.equal(JSON.stringify(h.room).includes('emote'),false);
});
