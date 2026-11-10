import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as capability from '../commander-client-capability.js';
import {createCommanderProfile,validateCommanderProfile} from '../arena-commanders.js';
import {
 assertCancellableRoom,cancellationCandidate,cancellationDigest,cancellationIdentity,
 cancellationMatchId,cancellationReceiptKey,normalizeCancellationSelections,
} from '../paid-match-cancellation.js';
import {disconnectForfeitIntent,idleNonBotClosure} from '../room-idle-cancellation.js';
import {resolveAccountRoom} from '../room-recovery.js';

// Exercise the real request wrapper, reservation validation, release paths and
// room writer together. Only external persistence and account reads are fakes.
const source=readFileSync(new URL('../server.js',import.meta.url),'utf8');
function section(start,end){
 const from=source.indexOf(start),to=source.indexOf(end,from);
 assert.ok(from>=0&&to>from,`Server section exists: ${start}`);
 return source.slice(from,to);
}
const serverCode=[
 section('function markRoom(r){','async function initializeDatabase('),
 section('async function flushRooms(){','function queueGoldAward('),
 section('function requireRoomOpen(room){','function initializeIdleRoom('),
 section('async function runIdleRoomJob(job){','async function cancellationPreview('),
 section('async function executeCancellations(body,user){','// Bot money is never handled'),
 section('async function api(url,b,requestContext){','async function apiInner('),
 section('function ensureBattlePreparation(','function battlePreparationResponse('),
].join('\n');
const modern={headers:{'user-agent':'okhttp/4.12.0','x-hero-match-commander-selection':'1'}};
const legacy={headers:{'user-agent':'okhttp/4.12.0'}};
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
const failure=(message='Persistence unavailable',extra={})=>Object.assign(Error(message),{status:503,...extra});

function fixture(){
 const formation={positions:[0],roles:['energy'],lanes:['back']};
 const room={
  code:'123',created:1,matchNumber:1,phase:'finished',mode:'friend',entryPaid:true,
  auctionStarted:true,matchSettled:false,battleSettlementPending:true,
  players:[
   {accountId:'a',token:'token-a',credits:7,team:[{id:'hero-a'}]},
   {accountId:'b',token:'token-b',credits:3,team:[{id:'hero-b'}]},
  ],
  playerActivity:{match:'123:1:1',at:1},series:[0,0],history:[],
  battleSync:{key:'1:1',ready:[structuredClone(formation),structuredClone(formation)],drafts:[structuredClone(formation),structuredClone(formation)],commanderChoices:[createCommanderProfile('magic'),createCommanderProfile('support')],commanderChoiceSources:['legacy','legacy'],result:null},
 };
 const writes=[],errors=[],starts=[],settlements=[],rooms=new Map([[room.code,room]]);
 const context=vm.createContext({
  ...capability,structuredClone,cancellationDigest,cancellationIdentity,cancellationMatchId,
  cancellationCandidate,cancellationReceiptKey,normalizeCancellationSelections,assertCancellableRoom,
  disconnectForfeitIntent,idleNonBotClosure,resolveAccountRoom,createCommanderProfile,validateCommanderProfile,
  console:{error:(...args)=>errors.push(args.join(' '))},error:(message,status)=>{throw Object.assign(Error(message),{status});},
  rooms,idleRoomJobs:new Map(),cancellationReservations:new Map(),cancellationPlans:new Map(),
  roomFlushes:new Map(),dirtyRooms:new Set(),roomRequestFlights:new Map(),auctionAdmissions:new Set(),
  pendingGold:new Map(),pendingVictoryChests:new Map(),victoryChestFlights:new Set(),battlePreparationFlights:new Map(),
  liveArenaMatchKeys:new Map(),isArenaRoom:()=>false,waiting:new Map(),socialSaveNeedsConfirmation:false,
  activeSeats:new Map(room.players.map((player,seat)=>[player.accountId,{code:room.code,created:room.created,matchNumber:room.matchNumber,seat}])),
  readLogin:token=>({'auth-a':{sub:'a'},'auth-b':{sub:'b'},'auth-other':{sub:'other'}})[token]||null,
  roomPresence:{touch(){}},recordRoomAction:()=>false,roomInvites:{items:new Map(),pending:()=>false},saveSocial:async()=>{},
  databaseReady:true,previewGuestMode:false,previewCommanderProfiles:new Map(),
  database:{async query(sql,args){
   assert.match(sql,/^INSERT INTO hero_auction_rooms/,'no unrelated database mutation or legacy profile read');
   writes.push(JSON.parse(args[1]));return {rows:[],rowCount:1};
  }},
  paidEntryMaintenance:{runPaused:async(_boot,_revision,run)=>run(),track:()=>()=>{}},
  publish:r=>context.markRoom(r),
  settleFinishedMatch:(r,winner)=>{settlements.push(winner);r.matchSettled=true;context.markRoom(r);},
  buildDefaultFormation:()=>structuredClone(formation),prepareLiveArenaTeams:(a,b)=>[a,b],
  createLiveCommanderAbilities:()=>({}),createLiveCommanderCombat:input=>input,
  liveArenaLifecycle:{status:()=>null,begin:input=>starts.push(input),snapshot:()=>({round:0,teams:[]})},
 });
 context.apiInner=async(url,body)=>{
  const user=context.readLogin(body.authToken);
  if(!user)throw failure('Invalid login',{status:401});
  if(url==='/api/room/current'){
   const found=resolveAccountRoom({accountId:user.sub,pointer:context.activeSeats.get(user.sub),rooms});
   return found?{room:found.room,token:found.room.players[found.seat].token}:{room:null};
  }
  assert.equal(url,'/api/state');
  const requested=rooms.get(body.code),seat=requested?.players.findIndex(player=>player.accountId===user.sub&&player.token===body.token);
  if(seat===undefined||seat<0)throw failure('Invalid room token',{status:403});
  return {room:requested};
 };
 vm.runInContext(serverCode,context);
 const request=(route='/api/room/current',seat=0,transport=modern)=>context.api(route,{authToken:seat===0?'auth-a':'auth-b',...(route==='/api/state'?{code:room.code,token:room.players[seat].token}:{})},transport);
 return {room,context,request,writes,errors,starts,settlements};
}

function idleJob(f,{forfeit=true}={}){
 const decision=forfeit?{winner:0,absentSeat:1,absentSince:1,presentSince:1,deadline:100001,presenceEpoch:'test-boot'}:null;
 if(decision)f.room.pendingDisconnectForfeit={version:1,matchId:cancellationMatchId(f.room),at:100001,decision:structuredClone(decision)};
 const snapshot=structuredClone(f.room),job={room:f.room,snapshot,decision,now:100001,snapshotDigest:cancellationDigest(snapshot),decisionDigest:cancellationDigest(decision),prepared:true,running:false,uncertain:false};
 f.context.idleRoomJobs.set(f.room.code,job);
 return job;
}

function delayIdlePersistence(f,job,{reject=null,replace}={}){
 const entered=deferred(),release=deferred();let calls=0,validations=0;
 const persist=async({room,decision,now,validateLive})=>{
  calls++;validateLive();validations++;entered.resolve();await release.promise;
  validateLive();validations++;
  if(reject)throw reject;
  const result=decision?disconnectForfeitIntent(room,decision,now):idleNonBotClosure(room,now);
  if(replace)replace(result.room);
  return result;
 };
 f.context.persistRoomDisconnectForfeit=persist;f.context.cancelIdleNonBotRoom=persist;
 return {entered:entered.promise,release:release.resolve,calls:()=>calls,validations:()=>validations};
}

function assertFrozen(f,job,before){
 assert.equal(cancellationDigest(f.room),job.snapshotDigest,'modern reads must not change frozen live evidence');
 assert.equal(cancellationDigest(job.snapshot),job.snapshotDigest,'snapshot digest remains strict');
 assert.equal(cancellationDigest(job.decision),job.decisionDigest,'decision digest remains strict');
 assert.deepEqual(f.room,before,'capability and legacy choices stay outside the reserved room');
}

async function assertPersistedUpgrade(f,seat=0){
 assert.equal(f.room.players[seat].matchCommanderSelection,1);
 assert.equal(f.room.players[1-seat].matchCommanderSelection,undefined);
 assert.equal(f.room.battleSync.commanderChoices[seat],null);
 assert.equal(f.room.battleSync.commanderChoiceSources[seat],null);
 assert.equal(f.room.battleSync.commanderChoiceSources[1-seat],'legacy');
 assert.ok(f.context.dirtyRooms.has(f.room.code),'applying a deferred capability must schedule persistence');
 await f.context.flushRooms();
 assert.equal(f.writes.at(-1)?.players[seat].matchCommanderSelection,1,'ordinary room flush persists the released upgrade');
 assert.equal(f.writes.at(-1)?.battleSync.commanderChoices[seat],null);
 assert.equal(f.context.dirtyRooms.size,0);
}

for(const route of ['/api/room/current','/api/state'])for(const seat of [0,1])test(`${route} seat ${seat} defers capability while earned forfeit is committing and settles once`,async()=>{
 const f=fixture(),job=idleJob(f),before=structuredClone(f.room),gate=delayIdlePersistence(f,job);
 const pending=f.context.runIdleRoomJob(job);await gate.entered;
 await f.request(route,seat);await f.request(route,seat);
 const stillFrozen=cancellationDigest(f.room),reservedLegacy=structuredClone(f.room.battleSync);
 // Concurrent scheduler passes must not start a second durable settlement.
 await f.context.runIdleRoomJob(job);
 gate.release();await pending;
 assert.equal(stillFrozen,job.snapshotDigest,'the authenticated read cannot invalidate validateLive');
 assert.deepEqual(reservedLegacy,before.battleSync,'do not clear a legacy choice until reservation release');
 assert.equal(gate.calls(),1);assert.equal(gate.validations(),2);
 assert.equal(job.blocked,undefined);assert.equal(job.running,false);assert.equal(f.context.idleRoomJobs.size,0);
 assert.deepEqual(f.settlements,[0]);assert.equal(f.room.pendingDisconnectForfeit,undefined);
 assert.equal(f.room.disconnectForfeit.winner,0);assert.equal(f.errors.length,0);
 await assertPersistedUpgrade(f,seat);
});

for(const uncertain of [false,true])test(`earned forfeit ${uncertain?'uncertain commit':'known rollback'} keeps deferred capability frozen until successful retry`,async()=>{
 const f=fixture(),job=idleJob(f),before=structuredClone(f.room),gate=delayIdlePersistence(f,job,{reject:failure('Connection lost',{uncertain})});
 const pending=f.context.runIdleRoomJob(job);await gate.entered;await f.request();gate.release();await pending;
 assertFrozen(f,job,before);assert.equal(f.context.idleRoomJobs.get(f.room.code),job);
 assert.equal(Boolean(job.uncertain),uncertain);assert.equal(job.blocked,undefined);assert.equal(f.settlements.length,0);
 await f.request('/api/state');assertFrozen(f,job,before);
 const retry=delayIdlePersistence(f,job),completion=f.context.runIdleRoomJob(job);await retry.entered;assertFrozen(f,job,before);retry.release();await completion;
 assert.equal(f.context.idleRoomJobs.size,0);assert.deepEqual(f.settlements,[0]);assert.equal(job.blocked,undefined);
 await assertPersistedUpgrade(f);
});

test('no-result idle rollback releases and persists capability before a legacy retry can bypass modern selection',async()=>{
 const f=fixture(),job=idleJob(f,{forfeit:false}),before=structuredClone(f.room),gate=delayIdlePersistence(f,job,{reject:failure()});
 const pending=f.context.runIdleRoomJob(job);await gate.entered;await f.request();
 const reservedDigest=cancellationDigest(f.room);gate.release();await pending;
 assert.equal(reservedDigest,job.snapshotDigest);assert.equal(f.context.idleRoomJobs.size,0);
 assert.deepEqual(f.room.battleSync.ready,before.battleSync.ready,'formation confirmation remains authoritative');
 await assertPersistedUpgrade(f);
 await f.context.readLegacyMatchCommanderSelection(f.room,f.room.battleSync,0,'legacy',cancellationMatchId(f.room));
 f.context.startSelectedCommanderBattle(f.room,f.room.battleSync,[[{id:'hero-a'}],[{id:'hero-b'}]],{remainingCreditsA:7,remainingCreditsB:3});
 assert.equal(f.room.battleSync.commanderChoices[0],null);assert.equal(f.room.battleSync.result,null);assert.equal(f.starts.length,0);
});

test('uncertain no-result idle closure holds the exact snapshot and applies capability after receipt replay',async()=>{
 const f=fixture(),job=idleJob(f,{forfeit:false}),before=structuredClone(f.room),gate=delayIdlePersistence(f,job,{reject:failure('Unknown commit',{uncertain:true})});
 const pending=f.context.runIdleRoomJob(job);await gate.entered;await f.request();gate.release();await pending;
 assertFrozen(f,job,before);assert.equal(job.uncertain,true);assert.equal(f.context.idleRoomJobs.size,1);
 const retry=delayIdlePersistence(f,job),completion=f.context.runIdleRoomJob(job);await retry.entered;await f.request('/api/state');assertFrozen(f,job,before);retry.release();await completion;
 assert.equal(f.context.idleRoomJobs.size,0);assert.equal(f.room.phase,'closed');assert.equal(f.settlements.length,0);
 await assertPersistedUpgrade(f);
});

function cancellation(f){
 const plan=cancellationCandidate(f.room,structuredClone(f.room));f.context.cancellationPlans.set(plan.id,plan);
 const body={candidates:[{id:plan.id,digest:plan.digest}],expectedBootId:'boot',expectedRevision:1};
 return {plan,body,run:()=>f.context.executeCancellations(body,{sub:'admin'})};
}

function delayCancellation(f,c,{reject=null}={}){
 const entered=deferred(),release=deferred();let validations=0,calls=0;
 f.context.cancelPaidMatches=async({validateLive,selections})=>{
  calls++;validateLive([c.plan]);validations++;entered.resolve();await release.promise;
  validateLive([c.plan]);validations++;if(reject)throw reject;
  const closed=structuredClone(c.plan.room);closed.matchSettled=true;closed.battleSettlementPending=false;
  closed.cancelled={receiptKey:cancellationReceiptKey(selections),matchId:cancellationMatchId(closed),refundGoldPerSeat:50};
  closed.goldRefunds=closed.players.map((player,seat)=>({id:`${closed.code}:refund:${seat}:1:1`,accountId:player.accountId,amount:50}));
  return {rooms:[closed],result:{ok:true,refundGold:100}};
 };
 return {entered:entered.promise,release:release.resolve,validations:()=>validations,calls:()=>calls};
}

for(const route of ['/api/room/current','/api/state'])test(`${route} does not change paid cancellation evidence and the released capability persists`,async()=>{
 const f=fixture(),c=cancellation(f),before=structuredClone(f.room),gate=delayCancellation(f,c),pending=c.run();
 await gate.entered;await f.request(route);const reserved=structuredClone(f.room);
 gate.release();const result=await pending;
 assert.deepEqual(reserved,before);assert.equal(cancellationDigest({snapshot:reserved,durableDigest:c.plan.durableDigest}),c.plan.digest);
 assert.equal(result.refundGold,100);assert.equal(gate.validations(),2);assert.equal(gate.calls(),1);
 assert.equal(f.context.cancellationReservations.size,0);assert.equal(f.room.cancelled.refundGoldPerSeat,50);
 assert.deepEqual(f.room.goldRefunds.map(award=>award.amount),[50,50]);assert.equal(f.settlements.length,0);
 await assertPersistedUpgrade(f);
});

test('known cancellation rollback applies the deferred marker only after releasing the reservation',async()=>{
 const f=fixture(),c=cancellation(f),before=structuredClone(f.room),gate=delayCancellation(f,c,{reject:failure()}),pending=c.run();
 await gate.entered;await f.request();const reserved=structuredClone(f.room);gate.release();await assert.rejects(pending,error=>error.status===503);
 assert.deepEqual(reserved,before);assert.equal(f.context.cancellationReservations.size,0);assert.equal(f.room.cancelled,undefined);
 await assertPersistedUpgrade(f);
 f.context.startSelectedCommanderBattle(f.room,f.room.battleSync,[[{id:'hero-a'}],[{id:'hero-b'}]],{remainingCreditsA:7,remainingCreditsB:3});
 assert.equal(f.room.battleSync.result,null);assert.equal(f.starts.length,0);
});

test('uncertain cancellation retains frozen legacy choices until the same cancellation succeeds',async()=>{
 const f=fixture(),c=cancellation(f),before=structuredClone(f.room),gate=delayCancellation(f,c,{reject:failure('Unknown commit',{uncertain:true})}),pending=c.run();
 await gate.entered;await f.request();gate.release();await assert.rejects(pending,error=>error.uncertain===true);
 assert.deepEqual(f.room,before);assert.equal(f.context.cancellationReservations.size,1);
 await f.request('/api/state');assert.deepEqual(f.room,before);
 const rollback=delayCancellation(f,c,{reject:failure('Replay temporarily unavailable')}),failedRetry=c.run();
 await rollback.entered;rollback.release();await assert.rejects(failedRetry,error=>error.status===503);
 assert.equal(f.context.cancellationReservations.size,1,'a later known failure must not release an earlier uncertain cancellation');
 assert.deepEqual(f.room,before);
 const retry=delayCancellation(f,c),completion=c.run();await retry.entered;assert.deepEqual(f.room,before);retry.release();await completion;
 assert.equal(f.context.cancellationReservations.size,0);await assertPersistedUpgrade(f);
});

test('already-installed cancellation receipt releases deferred capability without a cached preview plan',async()=>{
 const f=fixture(),c=cancellation(f),receiptKey=cancellationReceiptKey(c.body.candidates);
 f.room.cancelled={receiptKey,matchId:cancellationMatchId(f.room),refundGoldPerSeat:50};
 f.room.matchSettled=true;f.room.battleSettlementPending=false;
 f.context.cancellationReservations.set(c.plan.id,{receiptKey,digest:c.plan.digest});
 f.context.cancellationPlans.clear();
 const before=structuredClone(f.room),entered=deferred(),release=deferred();
 f.context.cancelPaidMatches=async()=>{entered.resolve();await release.promise;return {rooms:[structuredClone(before)],result:{ok:true,replayed:true,refundGold:100}};};
 const pending=c.run();await entered.promise;await f.request();
 assert.deepEqual(f.room,before);release.resolve();assert.equal((await pending).replayed,true);
 assert.equal(f.context.cancellationReservations.size,0);await assertPersistedUpgrade(f);
});

test('deferred capability belongs to the original room object rather than a reused room code',async()=>{
 const f=fixture(),job=idleJob(f),before=structuredClone(f.room);
 await f.request();assertFrozen(f,job,before);
 const replacement=structuredClone(f.room);f.context.rooms.set(f.room.code,replacement);f.context.idleRoomJobs.delete(f.room.code);
 f.context.flushDeferredCommanderSelections(f.room);f.context.flushDeferredCommanderSelections(replacement);
 assert.deepEqual(f.room,before);assert.deepEqual(replacement,before);assert.equal(f.context.dirtyRooms.size,0);
});

test('pending modern capability blocks a legacy profile read without touching the reserved room',async()=>{
 const f=fixture();f.room.battleSync.commanderChoices[0]=null;f.room.battleSync.commanderChoiceSources[0]=null;
 const job=idleJob(f),before=structuredClone(f.room);await f.request();
 await f.context.readLegacyMatchCommanderSelection(f.room,f.room.battleSync,0,'legacy',cancellationMatchId(f.room));
 assertFrozen(f,job,before);assert.equal(f.writes.length,0);assert.equal(f.context.dirtyRooms.size,0);
 assert.throws(()=>f.context.startSelectedCommanderBattle(f.room,f.room.battleSync,[],{}),error=>error.status===503);
 assert.equal(f.starts.length,0);
});

for(const target of ['live-room','snapshot','decision'])test(`genuine ${target} mutations still fail strict forfeit validation instead of being exempted from the digest`,async()=>{
 const f=fixture(),job=idleJob(f),gate=delayIdlePersistence(f,job),pending=f.context.runIdleRoomJob(job);
 await gate.entered;await f.request();
 if(target==='live-room')f.room.players[0].credits++;
 if(target==='snapshot')job.snapshot.battleSync.commanderChoices[0].levels.magic++;
 if(target==='decision')job.decision.winner=1;
 gate.release();await pending;
 assert.equal(job.blocked,true);assert.equal(f.context.idleRoomJobs.get(f.room.code),job);
 assert.equal(f.room.players[0].matchCommanderSelection,undefined,'a blocked proof stays frozen with capability external');
 assert.equal(f.room.battleSync.commanderChoiceSources[0],'legacy');assert.equal(f.settlements.length,0);
 assert.equal(f.writes.length,0);assert.equal(f.room.disconnectForfeit,undefined);
});

for(const mismatch of ['account','token','seat-moved'])test(`deferred capability cannot transfer to a ${mismatch} replacement on release`,async()=>{
 const f=fixture(),job=idleJob(f,{forfeit:false}),gate=delayIdlePersistence(f,job,{replace:replacement=>{
  if(mismatch==='account')replacement.players[0].accountId='other-account';
  if(mismatch==='token')replacement.players[0].token='other-token';
  if(mismatch==='seat-moved')replacement.players.reverse();
 }});
 const pending=f.context.runIdleRoomJob(job);await gate.entered;await f.request();const reservedDigest=cancellationDigest(f.room);gate.release();await pending;
 assert.equal(reservedDigest,job.snapshotDigest);assert.equal(f.context.idleRoomJobs.size,0);
 assert.deepEqual(f.room.players.map(player=>player.matchCommanderSelection),[undefined,undefined]);
 assert.deepEqual(f.room.battleSync.commanderChoiceSources,['legacy','legacy']);
 await f.context.flushRooms();assert.deepEqual(f.writes.at(-1).players.map(player=>player.matchCommanderSelection),[undefined,undefined]);
});

test('legacy and unauthenticated reads cannot queue a deferred modern capability',async()=>{
 const f=fixture(),job=idleJob(f),before=structuredClone(f.room),gate=delayIdlePersistence(f,job),pending=f.context.runIdleRoomJob(job);
 await gate.entered;
 await f.request('/api/room/current',0,legacy);await f.request('/api/state',1,legacy);
 await assert.rejects(f.context.api('/api/state',{authToken:'auth-other',code:'123',token:'token-a'},modern),error=>error.status===403);
 await assert.rejects(f.context.api('/api/room/current',{authToken:'invalid'},modern),error=>error.status===401);
 assertFrozen(f,job,before);gate.release();await pending;
 assert.equal(f.context.idleRoomJobs.size,0);assert.deepEqual(f.room.players.map(player=>player.matchCommanderSelection),[undefined,undefined]);
 assert.deepEqual(f.room.battleSync.commanderChoiceSources,['legacy','legacy']);assert.deepEqual(f.settlements,[0]);
});
