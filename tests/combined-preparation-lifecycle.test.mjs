import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {validateFormation} from '../public/preparation-formation.js';
const source=readFileSync(new URL('../server.js',import.meta.url),'utf8');
const route=source.slice(source.indexOf("if(url.pathname==='/api/battle-auction-commander'&&req.method==='POST'){"),source.indexOf("if(req.method==='POST'&&url.pathname==='/api/battle-auction-formation'){"));
const helpers=source.slice(source.indexOf('function copyPreparationFormation('),source.indexOf('function orderedPreparationTeams('));
const serialization=source.slice(source.indexOf('const commanderSelectionFlights='),source.indexOf('async function readMatchCommanderProfile('));
function fixture(){
 const formation={positions:[0,1,2,3,4],lanes:Array(5).fill('back'),roles:Array(5).fill('energy')};
 const team=formation.positions.map(i=>({id:String(i),role:'energy'}));
 const sync={key:'1:1',ready:[null,null],drafts:[formation,formation],commanderChoices:[null,null],commanderChoiceSources:[null,null]};
 const room={code:'X',phase:'finished',matchNumber:1,created:1,players:[{accountId:'a'},{accountId:'b'}],battleSync:sync};
 let release,entered,fail=false;const gate=new Promise(r=>release=r),entry=new Promise(r=>entered=r);
 const context=vm.createContext({validateFormation,rooms:new Map([['X',room]]),battlePreparationFlights:new Map(),resolveCommander:id=>id==='magic',authorize:()=>({r:room,seat:0}),cancellationMatchId:r=>`${r.code}:${r.matchNumber}:${r.created}`,requireBattleNotCancelled:r=>{if(r.reserved||r.closed)throw Object.assign(Error('Blocked'),{status:503});},error:(message,status)=>{throw Object.assign(Error(message),{status});},noteCommanderSelectionClient:()=>{},auctionRoomToBattleState:()=>({}),prepareBattleTeams:()=>[team,team],preparationTeams:x=>x,ensureBattlePreparation:()=>sync,readMatchCommanderProfile:async()=>{entered();await gate;if(fail)throw Object.assign(Error('Uncertain profile persistence'),{status:503,uncertain:true});return {levels:{magic:7}};},recordRoomAction:()=>{},roomPresence:{touch(){}},prepareBotCommanderSelection:()=>{},startSelectedCommanderBattle:()=>{},markRoom:()=>{},preparationView:()=>sync.ready[0],battlePreparationResponse:()=>({ready:sync.ready.map(Boolean)})});
 vm.runInContext(helpers+serialization+'\nasync function invoke(req,url,send){'+route+'}',context);
 const run=()=>context.invoke({method:'POST',async *[Symbol.asyncIterator](){yield JSON.stringify({code:'X',matchKey:'1:1',commanderId:'magic',formation});}},{pathname:'/api/battle-auction-commander'},(status,body)=>({status,body}));
 return {context,room,sync,run,entry,release,fail:()=>fail=true};
}
for(const reason of ['read failure','room replaced','seat replaced','rematch','reserved','closed'])test(`atomic formation remains unlocked after ${reason} during profile read`,async()=>{
 const f=fixture(),pending=f.run();await f.entry;
 assert.equal(f.context.battlePreparationFlights.size,1,'in-flight work protects cancellation and idle scheduling');
 assert.equal(f.sync.ready[0],null);assert.equal(f.sync.commanderChoices[0],null);
 if(reason==='read failure')f.fail();
 if(reason==='room replaced')f.context.rooms.set('X',{...f.room});
 if(reason==='seat replaced')f.room.players[0]={accountId:'a'};
 if(reason==='rematch')f.room.matchNumber++;
 if(reason==='reserved')f.room.reserved=true;
 if(reason==='closed')f.room.closed=true;
 f.release();const result=await pending;assert.ok([409,503].includes(result.status));
 assert.equal(f.sync.ready[0],null);assert.equal(f.sync.commanderChoices[0],null);assert.equal(f.context.battlePreparationFlights.size,0);
});
test('atomic commit follows profile read and an uncertain response can be retried unchanged',async()=>{
 const f=fixture(),first=f.run(),second=f.run();await f.entry;f.release();
 assert.equal((await first).status,200);assert.equal((await second).status,200);
 assert.ok(f.sync.ready[0]);assert.equal(f.sync.commanderChoices[0].levels.magic,7);assert.equal(f.context.battlePreparationFlights.size,0);
});
