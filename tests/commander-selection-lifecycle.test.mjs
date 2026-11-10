import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createCommanderProfile,validateCommanderProfile} from '../arena-commanders.js';
const source=readFileSync(new URL('../server.js',import.meta.url),'utf8');
const helperSource=source.slice(source.indexOf('function orderedPreparationTeams('),source.indexOf('function battlePreparationResponse('));
const cancellationGuard=source.split('\n').find(line=>line.startsWith('function requireBattleNotCancelled('));
function fixture({bot=false}={}){
 const room={code:'choice',created:1,matchNumber:1,mode:bot?'bot':'pvp',players:[{token:'a'},{token:'b'}]};
 const formation={positions:[0],roles:['mage'],lanes:['back']},sync={key:'1:1',ready:[null,null],drafts:[formation,formation],commanderChoices:[null,null]};room.battleSync=sync;
 const teams=[[{id:'a',role:'mage'}],[{id:'b',role:'mage'}]],state={remainingCreditsA:12,remainingCreditsB:8};let begins=0,combat;
 const context=vm.createContext({structuredClone,validateCommanderProfile,createCommanderProfile,requireRoomOpen:r=>{if(r.closed)throw Object.assign(Error('Closed'),{status:409});},isCancellationReserved:r=>!!r.reserved,error:(message,status)=>{throw Object.assign(Error(message),{status});},markRoom:()=>{},liveArenaMatchKeys:new Map(),prepareLiveArenaTeams:(a,b)=>[a,b],createLiveCommanderAbilities:()=>({}),createLiveCommanderCombat:input=>input,liveArenaLifecycle:{begin:input=>{begins++;combat=input.combat;},snapshot:()=>({round:0,teams})},chooseBotFormation:()=>structuredClone(formation),assignBotCommander:r=>{r.botCommander=createCommanderProfile('defense');}});
 vm.runInContext(cancellationGuard+'\n'+helperSource,context);
 return{room,sync,teams,state,formation,context,begins:()=>begins,combat:()=>combat,start:()=>context.startSelectedCommanderBattle(room,sync,teams,state),choose:(seat,profile)=>context.serializeCommanderSelection(room,async()=>{await Promise.resolve();if(!sync.commanderChoices[seat])sync.commanderChoices[seat]=structuredClone(profile);context.startSelectedCommanderBattle(room,sync,teams,state);})};
}
test('concurrent players and repeated requests create exactly one combat and clone earned progression',async()=>{
 const f=fixture();f.sync.ready=[f.formation,f.formation];f.start();assert.equal(f.begins(),0);
 const a={commanderId:'magic',levels:{attack:40,defense:17,magic:20,support:2}},b=createCommanderProfile('attack');
 await Promise.all([f.choose(0,a),f.choose(1,b),f.choose(0,a),f.choose(1,b)]);
 assert.equal(f.begins(),1);assert.equal(f.sync.result.live,true);assert.deepEqual(structuredClone(f.sync.commanderInput.commanders[0]),a);
 a.levels.magic=0;f.sync.commanderChoices[0].levels.magic=1;
 assert.equal(f.combat().commanders[0].levels.magic,20);assert.equal(f.sync.result.commanders[0].levels.magic,20);
});
test('bot is server-selected but cannot start until the human confirms formation and commander',async()=>{
 const f=fixture({bot:true});f.context.prepareBotCommanderSelection(f.room,f.sync,f.teams);
 assert.equal(f.sync.commanderChoices[1].commanderId,'defense');f.start();assert.equal(f.begins(),0);
 f.sync.ready[0]=f.formation;f.start();assert.equal(f.begins(),0);
 await f.choose(0,createCommanderProfile('support'));assert.equal(f.begins(),1);assert.ok(f.room.botBattle.startedAt);
});
for(const [flag,status] of [['cancelled',409],['disconnectForfeit',409],['reserved',503],['closed',409]])test(`${flag} prevents a fully ready selection from creating combat`,()=>{
 const f=fixture();f.sync.ready=[f.formation,f.formation];f.sync.commanderChoices=[createCommanderProfile('attack'),createCommanderProfile('magic')];f.room[flag]=true;
 assert.throws(f.start,error=>error.status===status);assert.equal(f.begins(),0);assert.equal(f.sync.result,undefined);
});
test('async choice rechecks cancellation and match identity after loading account progression',()=>{
 const route=source.slice(source.indexOf("if(url.pathname==='/api/battle-auction-commander'"),source.indexOf("if(req.method==='POST'&&url.pathname==='/api/battle-auction-formation'"));
 assert.match(route,/await serializeCommanderSelection\(room/);
 assert.match(route,/const profile=await readMatchCommanderProfile[\s\S]*?requireBattleNotCancelled\(room\);[\s\S]*?room.battleSync!==sync\|\|cancellationMatchId\(room\)!==preparationId[\s\S]*?sync.commanderChoices\[seat\]=/);
 assert.match(route,/finally\{const remaining=\(battlePreparationFlights.get\(preparationId\)/);
});
