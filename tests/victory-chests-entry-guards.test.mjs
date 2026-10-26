import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {eligibleVictory,victoryMatchId} from '../victory-chests.js';

// Actual server functions, with isolated persistence/identity doubles. These
// guard and lifecycle regressions complement, not replace, PostgreSQL tests.
const source=readFileSync(new URL('../server.js',import.meta.url),'utf8');
function section(start,end){
 const a=source.indexOf(start),b=source.indexOf(end,a);
 assert.ok(a>=0&&b>a,`server section exists: ${start}`);
 return source.slice(a,b);
}
const functions=[
 section('function requireVictoryChestStorage(){','async function flushGold(){'),
 section('async function initializeVictoryChests(){','async function rewardedAdStatus('),
 section('async function commitInvitationJoin(','async function invitationApi('),
 section('async function api(url,b){','async function apiAction(url,b){')
].join('\n');
const pendingRoom=(extra={})=>({code:'123',created:1000,matchNumber:1,phase:'finished',mode:'friend',entryPaid:true,matchSettled:false,victoryChestPending:true,victoryChestWinner:0,players:[{accountId:'winner',name:'Winner'},{accountId:'loser',name:'Loser'}],...extra});
const routes=['/api/create','/api/join','/api/match','/api/bot','/api/rematch'];
const status=expected=>error=>error.status===expected;
function fixture({enabled=true,requested=enabled,healthy=true,ready=true,restored=[],recovery=[]}={}){
 const counters={connections:0,persist:0,credit:0},actions=[],queries=[],failCredit=new Set(),failIntent=new Set(),credited=new Set();
 const balances=new Map(['winner','loser','unrelated','opponent'].map(id=>[id,500]));
 const ctx={paidEntryMaintenance:{isPaused:()=>false,beginAdmission:()=>()=>{},latchLegacyUncertainty:async()=>{}},Map,Set,structuredClone,console:{error(){}},eligibleVictory,victoryMatchId,
  victoryChestPolicy:{enabled,requested},victoryChestStorageReady:ready,victoryChestCreditHealthy:healthy,databaseReady:true,previewGuestMode:false,
  rooms:new Map(restored.map(r=>[r.code,r])),pendingVictoryChests:new Map(),victoryChestFlights:new Set(),activeSeats:new Map(),roomFlushes:new Map(),
  roomInvites:{items:new Map()},readLogin:authToken=>({sub:authToken,name:authToken}),friends:{register:async()=>{},afterMutations:fn=>fn()},
  moderationReady:true,requireModerationForInteraction(){},moderation:{blocked:()=>false},
  authorize:()=>({r:restored[0]||pendingRoom({victoryChestPending:false}),seat:0}),saveSocial:async()=>{},
  error:(message,httpStatus=400)=>{throw Object.assign(Error(message),{status:httpStatus})},
  apiAction:async(route,body)=>{actions.push({route,account:body.authToken});return{ok:true}},
  markRoom(){},publish(){},settleFinishedMatch:r=>{r.matchSettled=true},
  database:{
   query:async sql=>{queries.push(sql);return{rows:[]}},
   connect:async()=>{counters.connections++;return{release(){},async query(sql,args){
    queries.push(sql);
    if(sql.startsWith('UPDATE hero_auction_wallets')){const id=args[0],gold=balances.get(id)??500;balances.set(id,gold-50);return{rowCount:1,rows:[{gold:gold-50}]}}
    return{rowCount:1,rows:[]};
   }}}
  },
  readVictoryChestRecovery:async()=>structuredClone(recovery),
  persistVictoryChestIntent:async({room})=>{counters.persist++;if(failIntent.has(victoryMatchId(room)))throw Error('intent write unavailable')},
  creditVictoryChest:async({matchId})=>{counters.credit++;if(failCredit.has(matchId))throw Error('credit unavailable');credited.add(matchId);return{receipt:{matchId,rewards:{gold:100,diamonds:0,magicDust:0}}}}
 };
 vm.createContext(ctx);vm.runInContext(functions,ctx);
 const queue=(r,{room=r,intentSaved=true}={})=>ctx.pendingVictoryChests.set(victoryMatchId(r),{room,winner:0,intentSaved,accountIds:r.players.map(p=>p?.accountId).filter(Boolean)});
 return{ctx,counters,actions,queries,balances,failCredit,failIntent,credited,queue};
}

for(const pointer of ['missing','stale'])test(`pending room blocks both accounts on all direct entry routes with ${pointer} active-seat pointers`,async()=>{
 const r=pendingRoom(),f=fixture({restored:[r]});
 if(pointer==='stale')for(const account of ['winner','loser'])f.ctx.activeSeats.set(account,{code:'987',created:1,seat:0});
 for(const account of ['winner','loser'])for(const route of routes)await assert.rejects(f.ctx.api(route,{authToken:account}),status(409));
 assert.equal(f.actions.length,0);assert.equal(f.counters.connections,0);
 assert.deepEqual([...f.balances.values()],[500,500,500,500]);
});

test('orphan durable job blocks both prior players even when no room or active-seat pointer remains',async()=>{
 const f=fixture();f.queue(pendingRoom(),{room:null});
 for(const account of ['winner','loser'])for(const route of routes)await assert.rejects(f.ctx.api(route,{authToken:account}),status(409));
 assert.equal(f.actions.length,0);assert.equal(f.ctx.rooms.size,0);
});

test('recovery retains both intent account IDs when a newer match already owns the room code',async()=>{
 const old=pendingRoom(),newer=pendingRoom({created:2000,phase:'auction',victoryChestPending:false,players:[{accountId:'new-a'},{accountId:'new-b'}]}),id=victoryMatchId(old);
 const f=fixture({restored:[newer],recovery:[{match_id:id,winner_seat:0,room_state:old,credited_match_id:null}]});f.failCredit.add(id);
 await f.ctx.initializeVictoryChests();
 assert.equal(f.ctx.rooms.get('123'),newer);assert.equal(f.ctx.pendingVictoryChests.get(id).room,null);
 assert.deepEqual([...f.ctx.pendingVictoryChests.get(id).accountIds],['winner','loser']);
 for(const account of ['winner','loser'])await assert.rejects(f.ctx.api('/api/bot',{authToken:account}),status(409));
 assert.equal(f.ctx.victoryChestStorageReady,true);assert.equal(f.ctx.victoryChestCreditHealthy,false);
});

test('unrelated free bot and read-only state are not globally blocked by credit failure',async()=>{
 const f=fixture({healthy:false,restored:[pendingRoom()]});
 await f.ctx.api('/api/bot',{authToken:'unrelated'});
 await f.ctx.api('/api/state',{authToken:'winner'});
 assert.deepEqual(f.actions.map(x=>x.route),['/api/bot','/api/state']);
 assert.equal(f.counters.connections,0);assert.deepEqual([...f.balances.values()],[500,500,500,500]);
});

for(const settings of [{healthy:false},{ready:false},{enabled:false,requested:true}])test(`paid entry rejects before connection/debit when chest infrastructure is unavailable ${JSON.stringify(settings)}`,async()=>{
 const f=fixture(settings);
 await assert.rejects(f.ctx.chargeEntry(['unrelated','opponent'],'456'),status(503));
 assert.equal(f.counters.connections,0);assert.deepEqual([...f.balances.values()],[500,500,500,500]);
});

for(const account of ['winner','loser'])test(`chargeEntry independently blocks pending ${account}, including an unrelated caller matching that host`,async()=>{
 const f=fixture();f.queue(pendingRoom(),{room:null});
 await assert.rejects(f.ctx.chargeEntry(['unrelated',account],'456'),status(409));
 assert.equal(f.counters.connections,0);assert.equal(f.queries.length,0);
});

for(const blocked of ['host','guest','health'])test(`queued invitation commit checks ${blocked} before room reservation, receipt creation, or debit`,async()=>{
 const f=fixture({healthy:blocked!=='health'}),host=blocked==='host'?'winner':'unrelated',guest=blocked==='guest'?'loser':'opponent';
 if(blocked!=='health')f.queue(pendingRoom(),{room:null});
 const r={code:'456',created:2000,phase:'waiting',players:[{accountId:host},null]},invite={id:'invite',from:host,to:guest,status:'queued'};
 await assert.rejects(f.ctx.commitInvitationJoin(invite,r,{sub:guest}),status(blocked==='health'?503:409));
 assert.equal(r.joinPending,undefined);assert.equal(r.inviteJoining,undefined);assert.equal(r.players[1],null);assert.equal(invite.status,'queued');
 assert.equal(f.ctx.activeSeats.size,0);assert.equal(f.counters.connections,0);assert.equal(f.queries.length,0);
});

test('flags OFF preserve ordinary progression and paid entry despite stale chest markers or unhealthy runtime flag',async()=>{
 const f=fixture({enabled:false,healthy:false,ready:false,restored:[pendingRoom()]});f.queue(pendingRoom(),{room:null});
 for(const route of routes)await f.ctx.api(route,{authToken:'winner'});
 assert.deepEqual(f.actions.map(x=>x.route),routes);
 await f.ctx.chargeEntry(['winner','loser'],'456');
 assert.equal(f.counters.connections,1);assert.equal(f.balances.get('winner'),450);assert.equal(f.balances.get('loser'),450);
});

for(const fault of ['intent','credit'])test(`${fault} failure closes new paid entry but retry still settles and reopens it`,async()=>{
 const r=pendingRoom(),f=fixture({restored:[r]}),id=victoryMatchId(r);f.queue(r,{intentSaved:fault!=='intent'});
 const failures=fault==='intent'?f.failIntent:f.failCredit;failures.add(id);
 await f.ctx.flushVictoryChests();
 assert.equal(f.ctx.victoryChestCreditHealthy,false);assert.equal(f.ctx.victoryChestStorageReady,true);assert.equal(r.victoryChestPending,true);
 assert.equal(f.ctx.pendingVictoryChests.size,1);assert.equal(f.ctx.victoryChestFlights.size,0);
 await assert.rejects(f.ctx.chargeEntry(['unrelated','opponent'],'456'),status(503));assert.equal(f.counters.connections,0);
 failures.delete(id);await f.ctx.flushVictoryChests();
 assert.equal(f.ctx.victoryChestCreditHealthy,true);assert.equal(f.ctx.pendingVictoryChests.size,0);assert.equal(f.ctx.victoryChestFlights.size,0);
 assert.equal(r.victoryChestPending,false);assert.equal(r.matchSettled,true);assert.equal(r.victoryChestReceipt.matchId,id);assert.equal(f.credited.size,1);
 await f.ctx.api('/api/bot',{authToken:'winner'});await f.ctx.chargeEntry(['winner','loser'],'456');
 assert.equal(f.balances.get('winner'),450);assert.equal(f.balances.get('loser'),450);
});

test('credit health remains closed while any failed job survives, and only reopens after the full queue drains',async()=>{
 const a=pendingRoom(),b=pendingRoom({code:'456',created:2000,players:[{accountId:'other-a'},{accountId:'other-b'}]}),f=fixture({restored:[a,b]});
 f.queue(a);f.queue(b);f.failCredit.add(victoryMatchId(a));
 await f.ctx.flushVictoryChests();
 assert.equal(b.matchSettled,true);assert.equal(f.ctx.pendingVictoryChests.size,1);assert.equal(f.ctx.victoryChestCreditHealthy,false);
 await assert.rejects(f.ctx.chargeEntry(['unrelated','opponent'],'789'),status(503));
 f.failCredit.clear();await f.ctx.flushVictoryChests();
 assert.equal(f.ctx.pendingVictoryChests.size,0);assert.equal(f.ctx.victoryChestCreditHealthy,true);assert.equal(f.credited.size,2);
});

test('overlapping retry passes do not treat an in-flight pending job as an empty healthy queue',async()=>{
 const r=pendingRoom(),f=fixture({healthy:false,restored:[r]}),id=victoryMatchId(r);f.queue(r);
 let finish;f.ctx.creditVictoryChest=()=>new Promise(resolve=>{finish=()=>resolve({receipt:{matchId:id}})});
 const first=f.ctx.flushVictoryChests();
 assert.equal(f.ctx.victoryChestFlights.has(id),true);
 await f.ctx.flushVictoryChests();
 assert.equal(f.ctx.victoryChestCreditHealthy,false);assert.equal(f.ctx.pendingVictoryChests.size,1);
 await assert.rejects(f.ctx.chargeEntry(['unrelated','opponent'],'456'),status(503));
 finish();await first;assert.equal(f.ctx.pendingVictoryChests.size,0);assert.equal(f.ctx.victoryChestCreditHealthy,true);
});
