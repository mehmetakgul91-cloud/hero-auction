import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createCommanderProfile,validateCommanderProfile} from '../arena-commanders.js';
import {commanderSelectionClient} from '../commander-client-capability.js';
import {cancellationMatchId} from '../paid-match-cancellation.js';
import {resolveAccountRoom} from '../room-recovery.js';

const source=readFileSync(new URL('../server.js',import.meta.url),'utf8');
const helpers=source.slice(source.indexOf('function ensureBattlePreparation('),source.indexOf('function battlePreparationResponse('));
const cancellationGuard=source.split('\n').find(line=>line.startsWith('function requireBattleNotCancelled('));
const apiWrapper=source.slice(source.indexOf('async function api(url,b,requestContext)'),source.indexOf('async function apiInner(url,b,requestContext)'));
const legacy={headers:{'user-agent':'okhttp/4.12.0'}};
const modern={headers:{...legacy.headers,'x-hero-match-commander-selection':'1'}};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};};
const flush=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};

function fixture({mode='friend',profiles,lookup}={}){
 const room={code:'123',created:1,matchNumber:1,mode,players:[{accountId:'a',token:'token-a'},{accountId:'b',token:'token-b'}]};
 const formation={positions:[0],roles:['energy'],lanes:['back']};
 const sync={key:'1:1',ready:[structuredClone(formation),structuredClone(formation)],drafts:[structuredClone(formation),structuredClone(formation)],commanderChoices:[null,null],commanderChoiceSources:[null,null],result:null};room.battleSync=sync;
 const teams=[[{id:'a',role:'energy'}],[{id:'b',role:'energy'}]],state={remainingCreditsA:7,remainingCreditsB:3};
 const stored=profiles||new Map([['a',{commanderId:'magic',levels:{attack:31,defense:8,magic:37,support:4}}],['b',createCommanderProfile('support')]]);
 const queries=[],starts=[];let marks=0;
 const context=vm.createContext({
  structuredClone,commanderSelectionClient,cancellationMatchId,createCommanderProfile,validateCommanderProfile,rooms:new Map([[room.code,room]]),idleRoomJobs:new Map(),
  requireRoomOpen:r=>{if(r.closed)throw Object.assign(Error('Closed'),{status:409});},isCancellationReserved:r=>!!r.reserved,error:(message,status)=>{throw Object.assign(Error(message),{status});},
  markRoom:()=>marks++,databaseReady:true,previewGuestMode:false,previewCommanderProfiles:new Map(),
  database:{async query(sql,args){queries.push({sql,args});assert.equal(sql,'SELECT profile FROM hero_auction_commanders WHERE account_id=$1','legacy fallback is read-only');return lookup?lookup(args[0]):{rows:stored.has(args[0])?[{profile:stored.get(args[0])}]:[]};}},
  buildDefaultFormation:()=>structuredClone(formation),liveArenaMatchKeys:new Map(),prepareLiveArenaTeams:(a,b)=>[a,b],createLiveCommanderAbilities:()=>({}),createLiveCommanderCombat:input=>input,
  liveArenaLifecycle:{begin:input=>starts.push(input),snapshot:()=>({round:0,teams})},chooseBotFormation:()=>structuredClone(formation),assignBotCommander:r=>{r.botCommander=createCommanderProfile('defense');},
 });
 vm.runInContext(cancellationGuard+'\n'+helpers,context);
 const note=(seat,request=modern,input={})=>context.noteCommanderSelectionClient(room,seat,request,input);
 const choose=seat=>{
  const preparationId=cancellationMatchId(room);
  return context.serializeCommanderSelection(room,async()=>{
   await context.readLegacyMatchCommanderSelection(room,sync,seat,'legacy',preparationId);
   context.startSelectedCommanderBattle(room,sync,teams,state);
  });
 };
 return {room,sync,teams,state,stored,queries,starts,context,formation,note,choose,marks:()=>marks};
}

function recoveryFixture(f){
 const gate=deferred();let entered=0,returned=0;
 const pointer=seat=>({code:f.room.code,created:f.room.created,matchNumber:f.room.matchNumber,seat});
 Object.assign(f.context,{
  resolveAccountRoom,activeSeats:new Map([['a',pointer(0)],['b',pointer(1)]]),roomRequestFlights:new Map(),idleRoomJobs:new Map(),
  readLogin:token=>({ 'auth-a':{sub:'a'},'auth-b':{sub:'b'},'auth-other':{sub:'other'}})[token]||null,
  roomPresence:{touch:()=>{}},recordRoomAction:()=>false,
  apiInner:async(url,body)=>{
   assert.equal(url,'/api/room/current');entered++;
   const user=f.context.readLogin(body.authToken);if(!user)throw Object.assign(Error('Invalid login'),{status:401});
   // Models the awaited database/account checks before the real recovery route.
   await gate.promise;returned++;
   const found=resolveAccountRoom({accountId:user.sub,pointer:f.context.activeSeats.get(user.sub),rooms:f.context.rooms});
   return found?{room:found.room,token:found.room.players[found.seat].token}:{room:null};
  },
 });
 vm.runInContext(apiWrapper,f.context);
 return {gate,pointer,entered:()=>entered,returned:()=>returned,call:(body,request=modern)=>f.context.api('/api/room/current',body,request)};
}

test('only the exact old native transport without any browser or capability marker is legacy',()=>{
 assert.equal(commanderSelectionClient(legacy),'legacy');
 for(const request of [{},{headers:{}},{headers:{'user-agent':'okhttp/4.12.1'}},{headers:{'user-agent':'okhttp/4.12.0 '}},{headers:{'user-agent':'Mozilla/5.0'}},
  {headers:{...legacy.headers,origin:''}},{headers:{...legacy.headers,'sec-fetch-mode':''}},{headers:{...legacy.headers,'Sec-Fetch-Site':'same-site'}},
  ...['',0,'0','garbage',null].map(value=>({headers:{...legacy.headers,'x-hero-match-commander-selection':value}}))])assert.equal(commanderSelectionClient(request),'selection',JSON.stringify(request));
 for(const value of [undefined,null,false,0,'','0','invalid',1]){
  assert.equal(commanderSelectionClient(legacy,{body:{matchCommanderSelection:value}}),'selection');
  assert.equal(commanderSelectionClient(legacy,{searchParams:new URLSearchParams({matchCommanderSelection:String(value)})}),'selection');
 }
});

test('concurrent legacy confirmations read each saved profile once and begin exactly one battle with independent snapshots',async()=>{
 const f=fixture();
 await Promise.all(Array.from({length:12},(_,i)=>f.choose(i%2)));
 assert.equal(f.starts.length,1);assert.equal(f.queries.length,2);assert.deepEqual(f.queries.map(q=>q.args[0]),['a','b']);
 assert.deepEqual(f.sync.commanderChoiceSources,['legacy','legacy']);
 const saved=structuredClone(f.stored.get('a'));
 assert.deepEqual(structuredClone(f.sync.commanderChoices[0]),saved);assert.deepEqual(structuredClone(f.starts[0].combat.commanders[0]),saved);
 f.stored.get('a').levels.magic=1;f.sync.commanderChoices[0].levels.magic=2;
 assert.equal(f.starts[0].combat.commanders[0].levels.magic,37);assert.equal(f.sync.result.commanders[0].levels.magic,37,'earned progression is copied, never shared with account or mutable choice state');
});

test('a modern request arriving during the legacy profile lookup wins before battle starts',async()=>{
 const read=deferred(),f=fixture({lookup:()=>read.promise});
 f.sync.commanderChoices[1]=createCommanderProfile('support');f.sync.commanderChoiceSources[1]='explicit';
 const pending=f.choose(0);await flush();assert.equal(f.queries.length,1);
 f.note(0);read.resolve({rows:[{profile:f.stored.get('a')}]});await pending;
 assert.equal(f.room.players[0].matchCommanderSelection,1);assert.equal(f.sync.commanderChoices[0],null);assert.equal(f.sync.commanderChoiceSources[0],null);assert.equal(f.starts.length,0);
 assert.equal(f.sync.commanderChoices[1].commanderId,'support');
 await f.choose(0);assert.equal(f.queries.length,1,'late old requests cannot downgrade the capability or restart lookup');
});

test('authenticated account recovery latches capability before its awaited account checks and defeats an in-flight legacy read',async()=>{
 const read=deferred(),f=fixture({lookup:()=>read.promise}),recovery=recoveryFixture(f);
 f.sync.commanderChoices[1]=createCommanderProfile('support');f.sync.commanderChoiceSources[1]='explicit';
 const pendingLegacy=f.choose(0);await flush();assert.equal(f.queries.length,1);
 const pendingRecovery=recovery.call({authToken:'auth-a'});await flush();
 assert.equal(recovery.entered(),1);assert.equal(recovery.returned(),0,'the account/database check has not returned');
 assert.equal(f.room.players[0].matchCommanderSelection,1,'code/token-free authenticated recovery is latched before the first await');
 assert.equal(f.room.players[1].matchCommanderSelection,undefined);
 read.resolve({rows:[{profile:f.stored.get('a')}]});await pendingLegacy;
 assert.equal(f.sync.commanderChoices[0],null);assert.equal(f.sync.commanderChoiceSources[0],null);assert.equal(f.starts.length,0);
 recovery.gate.resolve();const result=await pendingRecovery;
 assert.equal(result.room,f.room);assert.equal(result.token,'token-a');assert.equal(recovery.returned(),1);
 await f.choose(0);assert.equal(f.queries.length,1,'legacy retry cannot undo the recovery capability');assert.equal(f.starts.length,0);
});

test('invalid login and another account recovery cannot latch or clear the target legacy seat',async()=>{
 for(const kind of ['invalid-login','other-account','forged-pointer','stale-pointer']){
  const f=fixture(),recovery=recoveryFixture(f);
  f.sync.commanderChoices[0]=createCommanderProfile('magic');f.sync.commanderChoiceSources[0]='legacy';
  const before=structuredClone(f.sync),body={authToken:kind==='invalid-login'?'invalid':'auth-other',accountId:'a'};
  if(kind==='forged-pointer')f.context.activeSeats.set('other',recovery.pointer(0));
  if(kind==='stale-pointer'){body.authToken='auth-a';f.context.activeSeats.set('a',{...recovery.pointer(0),created:f.room.created+1});}
  const pending=recovery.call(body);
  if(kind==='invalid-login')await assert.rejects(pending,error=>error.status===401);
  else{await flush();assert.equal(recovery.returned(),0);recovery.gate.resolve();assert.equal((await pending).room,null);}
  assert.equal(f.room.players[0].matchCommanderSelection,undefined,kind);assert.equal(f.room.players[1].matchCommanderSelection,undefined,kind);
  assert.deepEqual(structuredClone(f.sync),before,kind);
 }
});

test('the opponent account recovery upgrades only its own seat while another legacy profile is loading',async()=>{
 const read=deferred(),f=fixture({lookup:()=>read.promise}),recovery=recoveryFixture(f);
 f.sync.commanderChoices[1]=createCommanderProfile('support');f.sync.commanderChoiceSources[1]='legacy';
 const pendingLegacy=f.choose(0);await flush();
 const pendingRecovery=recovery.call({authToken:'auth-b',accountId:'a'});await flush();
 assert.equal(f.room.players[0].matchCommanderSelection,undefined);assert.equal(f.room.players[1].matchCommanderSelection,1);
 assert.equal(f.sync.commanderChoices[1],null);
 read.resolve({rows:[{profile:f.stored.get('a')}]});await pendingLegacy;
 assert.equal(f.sync.commanderChoices[0].commanderId,'magic');assert.equal(f.starts.length,0);
 recovery.gate.resolve();assert.equal((await pendingRecovery).token,'token-b');
});

test('an opponent upgrade during a legacy lookup clears only the opponent legacy lock',async()=>{
 const read=deferred(),f=fixture({lookup:()=>read.promise});
 f.sync.commanderChoices[1]=createCommanderProfile('support');f.sync.commanderChoiceSources[1]='legacy';
 const pending=f.choose(0);await flush();f.note(1);read.resolve({rows:[{profile:f.stored.get('a')}]});await pending;
 assert.equal(f.sync.commanderChoices[0].commanderId,'magic');assert.equal(f.sync.commanderChoices[1],null);assert.equal(f.starts.length,0);
 assert.equal(f.room.players[0].matchCommanderSelection,undefined);assert.equal(f.room.players[1].matchCommanderSelection,1);
});

for(const [flag,status] of [['cancelled',409],['disconnectForfeit',409],['reserved',503],['closed',409]])test(`${flag} during legacy profile lookup prevents a lock and combat`,async()=>{
 const read=deferred(),f=fixture({lookup:()=>read.promise}),pending=f.choose(0);await flush();
 f.room[flag]=true;read.resolve({rows:[{profile:f.stored.get('a')}]});await assert.rejects(pending,error=>error.status===status);
 assert.equal(f.sync.commanderChoices[0],null);assert.equal(f.starts.length,0);assert.equal(f.sync.result,null);
});

for(const change of ['preparation','match','room','player'])test(`a changed ${change} during legacy lookup cannot install the old profile`,async()=>{
 const read=deferred(),f=fixture({lookup:()=>read.promise}),pending=f.choose(0);await flush();
 if(change==='preparation')f.room.battleSync={...f.sync,commanderChoices:[null,null]};
 if(change==='match')f.room.matchNumber++;
 if(change==='room')f.context.rooms.set(f.room.code,{...f.room});
 if(change==='player')f.room.players[0]={...f.room.players[0],accountId:'replacement'};
 read.resolve({rows:[{profile:f.stored.get('a')}]});await assert.rejects(pending,error=>error.status===409);
 assert.equal(f.sync.commanderChoices[0],null);assert.equal(f.starts.length,0);
});

test('missing or invalid saved profiles never produce a default commander or create an account profile',async()=>{
 for(const profiles of [new Map(),new Map([['a',{commanderId:'unknown',levels:{attack:0,defense:0,magic:0,support:0}}]])]){
  const f=fixture({profiles});await assert.rejects(f.choose(0));assert.equal(f.sync.commanderChoices[0],null);assert.equal(f.starts.length,0);assert.equal(f.queries.length,1);assert.ok(f.queries.every(q=>q.sql.startsWith('SELECT')));
 }
});

test('unconfirmed, explicit, already-locked and already-started seats do not read legacy profiles',async()=>{
 for(const state of ['unconfirmed','explicit','locked','started']){
  const f=fixture();
  if(state==='unconfirmed')f.sync.ready[0]=null;
  if(state==='explicit')f.room.players[0].matchCommanderSelection=1;
  if(state==='locked'){f.sync.commanderChoices[0]=createCommanderProfile('attack');f.sync.commanderChoiceSources[0]='explicit';}
  if(state==='started')f.sync.result={live:true,commanders:[createCommanderProfile('defense'),createCommanderProfile('support')]};
  const before=structuredClone(f.sync);await f.choose(0);assert.equal(f.queries.length,0,state);assert.deepEqual(structuredClone(f.sync),before,state);assert.equal(f.starts.length,0);
 }
});

test('a started result appearing during lookup and later capability upgrades leave its commander authority untouched',async()=>{
 const read=deferred(),f=fixture({lookup:()=>read.promise}),pending=f.choose(0);await flush();
 const result={live:true,commanders:[createCommanderProfile('defense'),createCommanderProfile('support')]};f.sync.result=result;
 f.sync.commanderChoices=result.commanders.map(profile=>structuredClone(profile));f.sync.commanderChoiceSources=['legacy','legacy'];
 const before=structuredClone(f.sync);read.resolve({rows:[{profile:f.stored.get('a')}]});await pending;f.note(0);
 assert.deepEqual(structuredClone(f.sync),before);assert.equal(f.sync.result,result);assert.equal(f.starts.length,0);
});

test('pre-existing started battle hydration preserves profiles without requiring another selection',()=>{
 const f=fixture(),result={live:true,commanders:[createCommanderProfile('defense'),createCommanderProfile('support')]};
 delete f.sync.commanderChoices;delete f.sync.commanderChoiceSources;f.sync.result=result;
 f.context.ensureBattlePreparation(f.room,f.teams);f.note(0);
 assert.equal(f.sync.result,result);assert.deepEqual(structuredClone(f.sync.commanderChoices),result.commanders);assert.deepEqual(structuredClone(f.sync.commanderChoiceSources),['explicit','explicit']);assert.equal(f.queries.length,0);assert.equal(f.starts.length,0);
});

test('legacy human and server-controlled bot profiles stay separate and still require the human formation',async()=>{
 const f=fixture({mode:'bot'});f.sync.ready=[null,null];f.context.prepareBotCommanderSelection(f.room,f.sync,f.teams);
 assert.equal(f.sync.commanderChoices[1].commanderId,'defense');assert.equal(f.sync.commanderChoiceSources[1],'bot');
 await f.choose(0);assert.equal(f.queries.length,0);assert.equal(f.starts.length,0);
 f.sync.ready[0]=f.formation;await f.choose(0);
 assert.equal(f.starts.length,1);assert.deepEqual(structuredClone(f.sync.result.commanders).map(p=>p.commanderId),['magic','defense']);assert.deepEqual(f.queries.map(q=>q.args[0]),['a']);
});
