import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
const routes=source.slice(source.indexOf("if(url==='/api/create')"),source.indexOf("if(url==='/api/chat')"));
const timerStart=source.indexOf('setInterval(()=>{for(const r of rooms.values()){');
const matchingTimer=source.slice(timerStart+'setInterval(()=>{'.length,source.indexOf('tickBotBattle(r);',timerStart))+'}';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}};
const flush=async()=>{for(let i=0;i<6;i++)await Promise.resolve()};
function fixture(mode){
 let now=59000,debits=0,botAssignments=0;
 const charge=deferred(),cosmetic=deferred(),snapshots=[];
 const room={code:'ABC',universe:'mixed',created:0,phase:mode==='random'?'matching':'waiting',mode,round:0,turn:0,deadline:null,topBid:0,topSeat:null,history:[],players:[{name:'Host',accountId:'host',token:'host-token',credits:20,team:[]},null]};
 const auctionAdmissions=new WeakSet();
 const context={Date:class extends Date{static now(){return now}},rooms:new Map([['ABC',room]]),waiting:new Map([['ABC',{code:'ABC',universe:'mixed',created:0}]]),auctionAdmissions,activeSeats:new Map([['host',{code:'ABC',created:0}]]),moderation:{blocked:()=>false},readLogin:()=>({sub:'guest'}),chosenName:()=> 'Guest',token:()=> 'guest-token',code:()=> 'NEW',newCards:()=>[],startRoomArenaTheme:()=>{},error:(message,status=400)=>{throw Object.assign(Error(message),{status})},markRoom:r=>snapshots.push(JSON.parse(JSON.stringify(r))),publish:r=>snapshots.push(JSON.parse(JSON.stringify(r))),publicRoom:r=>JSON.parse(JSON.stringify(r)),log:(r,m)=>r.history.push(m),chargeEntry:async ids=>{assert.deepEqual([...ids],['host','guest']);await charge.promise;debits++;},refreshAuctionCommanders:async()=>cosmetic.promise,refreshRoomAuctionCommanders:async()=>cosmetic.promise,assignBotCommander:()=>{botAssignments++}};
 vm.createContext(context);vm.runInContext('async function route(url,b){'+routes+'}',context);
 return {room,context,charge,cosmetic,snapshots,auctionAdmissions,setTime:value=>now=value,tick:()=>vm.runInContext(matchingTimer,context),call:()=>context.route(mode==='random'?'/api/match':'/api/join',{code:'ABC'}),debits:()=>debits,botAssignments:()=>botAssignments};
}
for(const mode of ['random','friend']){
 test(`${mode}: debit and cosmetic await retain human admission and persist complete auction`,async()=>{
  const f=fixture(mode),pending=f.call();await flush();
  assert.equal(f.auctionAdmissions.has(f.room),true,'reservation starts before debit');
  f.setTime(61000);f.tick();assert.equal(f.botAssignments(),0,'matching timeout cannot replace the admitted human');assert.equal(f.room.players[1],null);
  f.charge.resolve();await flush();
  assert.equal(f.debits(),1);assert.equal(f.room.entryPaid,true);assert.equal(f.room.phase,'auction');assert.equal(f.room.players[1].accountId,'guest');assert.equal(f.room.mode,mode);
  assert.equal(f.auctionAdmissions.has(f.room),true,'reservation covers cosmetic await');
  const durable=f.snapshots.at(-1);assert.ok(durable,'complete state is marked before cosmetic lookup');assert.equal(durable.phase,'auction');assert.equal(durable.players[1].token,'guest-token');assert.equal(durable.entryPaid,true);
  assert.equal(Object.hasOwn(durable,'auctionAdmissionPending'),false);assert.equal(Object.hasOwn(durable,'joinPending'),false,'process-local reservation never contaminates saved room');
  f.setTime(95000);f.tick();assert.equal(f.botAssignments(),0);assert.equal(f.room.players[1].accountId,'guest');
  f.cosmetic.resolve();const result=await pending;
  assert.equal(f.auctionAdmissions.has(f.room),false);assert.equal(f.room.deadline,115000,'fresh full turn after cosmetic lookup');assert.equal(result.room.players[1].accountId,'guest');assert.equal(f.debits(),1);
 });
 test(`${mode}: rejected debit releases reservation without installing a paid seat`,async()=>{
  const f=fixture(mode),pending=f.call();await flush();f.charge.reject(Error('insufficient funds'));await assert.rejects(pending,/insufficient funds/);
  assert.equal(f.auctionAdmissions.has(f.room),false);assert.equal(f.room.players[1],null);assert.equal(f.debits(),0);assert.notEqual(f.room.entryPaid,true);
 });
}
