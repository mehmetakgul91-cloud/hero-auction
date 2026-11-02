import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {cancellationDigest} from '../paid-match-cancellation.js';
const source=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
const run=source.slice(source.indexOf('async function runIdleRoomJob(job){'),source.indexOf('\nfunction isCancellationReserved('));
test('server reservation preserves earned forfeit when survivor departs during COMMIT',async()=>{
 const room={code:'123',created:1,matchNumber:1,phase:'auction',players:[{accountId:'a'},{accountId:'b'}]},decision={winner:0,absentSeat:1,absentSince:1,presentSince:1,deadline:120001,presenceEpoch:'boot'};
 const job={room,snapshot:structuredClone(room),decision,now:120001,snapshotDigest:cancellationDigest(room),decisionDigest:cancellationDigest(decision),prepared:true,running:false,uncertain:false};
 const jobs=new Map([['123',job]]),rooms=new Map([['123',room]]);let commit,entered,settled=0,departed=false;
 const enteredPromise=new Promise(resolve=>entered=resolve),commitPromise=new Promise(resolve=>commit=resolve);
 const context={console,rooms,idleRoomJobs:jobs,cancellationDigest,isArenaRoom:()=>false,liveArenaMatchKeys:new Map(),database:{},databaseReady:true,previewGuestMode:false,waiting:new Map(),publish:()=>{},settleFinishedMatch:(_,winner)=>{assert.equal(winner,0);settled++;},error:(message,status)=>{throw Object.assign(Error(message),{status});},persistRoomDisconnectForfeit:async({validateLive})=>{validateLive();entered();await commitPromise;assert.equal(departed,true);validateLive();return{room:{...room,phase:'finished',disconnectForfeit:decision}};}};
 vm.createContext(context);vm.runInContext(run+'\nthis.runIdleRoomJob=runIdleRoomJob;',context);
 const work=context.runIdleRoomJob(job);await enteredPromise;departed=true;commit();await work;
 assert.equal(settled,1);assert.equal(room.disconnectForfeit.winner,0);assert.equal(jobs.size,0);
});
test('server reservation refuses mutated frozen decision before commit',async()=>{
 const room={code:'123'},decision={winner:0},snapshot=structuredClone(room),job={room,decision,snapshot,snapshotDigest:cancellationDigest(snapshot),decisionDigest:cancellationDigest(decision),prepared:true};
 decision.winner=1;let attempted=false;const jobs=new Map([['123',job]]),context={console:{error(){}},rooms:new Map([['123',room]]),idleRoomJobs:jobs,cancellationDigest,isArenaRoom:()=>false,liveArenaMatchKeys:new Map(),error:(message,status)=>{throw Object.assign(Error(message),{status});},persistRoomDisconnectForfeit:()=>{attempted=true;}};
 vm.createContext(context);vm.runInContext(run+'\nthis.runIdleRoomJob=runIdleRoomJob;',context);await context.runIdleRoomJob(job);assert.equal(attempted,false);assert.equal(jobs.size,1);assert.equal(job.blocked,true);
});

test('earned forfeit retries a known rollback without reconsidering departed survivor',async()=>{
 const room={code:'123',created:1},decision={winner:0},job={room,snapshot:structuredClone(room),decision,now:120001,snapshotDigest:cancellationDigest(room),decisionDigest:cancellationDigest(decision),prepared:true};
 const jobs=new Map([['123',job]]);let attempts=0,settled=0;
 const context={console:{error(){}},rooms:new Map([['123',room]]),idleRoomJobs:jobs,cancellationDigest,isArenaRoom:()=>false,liveArenaMatchKeys:new Map(),database:{},databaseReady:true,waiting:new Map(),publish(){},error:(message,status)=>{throw Object.assign(Error(message),{status});},settleFinishedMatch:()=>settled++,persistRoomDisconnectForfeit:async({validateLive})=>{validateLive();if(++attempts===1)throw Object.assign(Error('connection unavailable'),{status:503});return{room:{...room,phase:'finished',disconnectForfeit:decision}};}};
 vm.createContext(context);vm.runInContext(run+'\nthis.runIdleRoomJob=runIdleRoomJob;',context);await context.runIdleRoomJob(job);assert.equal(jobs.size,1);assert.equal(settled,0);await context.runIdleRoomJob(job);assert.equal(settled,1);assert.equal(jobs.size,0);assert.equal(attempts,2);
});

test('boot resumes durable prepared proof after crash before forfeit intent without new presence',async()=>{
 const {disconnectForfeitIntent}=await import('../room-idle-cancellation.js');
 const {cancellationMatchId}=await import('../paid-match-cancellation.js');
 const decision={winner:0,absentSeat:1,absentSince:1000,presentSince:1000,deadline:121000,presenceEpoch:'previous-boot'};
 const room={code:'123',created:1,matchNumber:1,mode:'friend',auctionStarted:true,phase:'auction',players:[{accountId:'a'},{accountId:'b'}]};
 room.pendingDisconnectForfeit={version:1,matchId:cancellationMatchId(room),at:121000,decision};
 const restored=JSON.parse(JSON.stringify(room)),jobs=new Map();let resumed;
 const context={console,rooms:new Map([['123',restored]]),idleRoomJobs:jobs,initializeIdleRoom(){},structuredClone,cancellationDigest,cancellationMatchId,disconnectForfeitIntent,runIdleRoomJob:async job=>resumed=job,error:(message,status)=>{throw Object.assign(Error(message),{status});},database:null,databaseReady:false};
 vm.createContext(context);const initialize=source.slice(source.indexOf('async function initializeIdleRooms(){'),source.indexOf('\nfunction idleRoomBusy('));vm.runInContext(initialize+'\nthis.initializeIdleRooms=initializeIdleRooms;',context);await context.initializeIdleRooms();
 assert.equal(resumed.now,121000);assert.equal(resumed.prepared,true);assert.equal(resumed.decision.presenceEpoch,'previous-boot');assert.equal(resumed.decision.winner,0);assert.equal(jobs.size,1);
});

test('expired queued invite is not an activity lease but actual join flight is protected',()=>{
 const room={code:'123',created:1},empty=()=>new Map();
 const context={cancellationMatchId:()=> '123:1:1',roomInvites:{items:new Map([['expired',{code:'123',created:1,status:'queued',expiresAt:0}]])},auctionAdmissions:new Set(),isCancellationReserved:()=>false,roomRequestFlights:empty(),battlePreparationFlights:empty(),pendingVictoryChests:empty(),victoryChestFlights:new Set(),botSettlementFlights:new Set(),botSettlementJobs:empty()};
 vm.createContext(context);const fn=source.slice(source.indexOf('function idleRoomBusy(room){'),source.indexOf('\nfunction presenceDecision('));vm.runInContext(fn+'\nthis.idleRoomBusy=idleRoomBusy;',context);assert.equal(Boolean(context.idleRoomBusy(room)),false);room.inviteJoining=true;assert.equal(Boolean(context.idleRoomBusy(room)),true);delete room.inviteJoining;room.inviteUncertain=true;assert.equal(Boolean(context.idleRoomBusy(room)),true);
});
