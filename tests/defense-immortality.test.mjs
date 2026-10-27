import test from 'node:test';
import assert from 'node:assert/strict';
import {applyHeroDamage,grantLastStand,isLastStandActive,isLastStandImmortal,expireLastStandGuards} from '../battle-hp-damage.js';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat,castLiveCommanderCombat,applyServerHeroAction,beginServerCombatRound,viewLiveCommanderCombat} from '../commander-live-combat.js';
import {createLiveArenaRegistry} from '../commander-live-arena-registry.js';
import {createLiveArenaLifecycle} from '../commander-live-arena-lifecycle.js';
import {createLiveArenaSession,stepLiveArenaHero,viewLiveArenaSession,advanceLiveArenaRound} from '../commander-live-arena-session.js';
import {createCommanderSnapshotSync,acceptCommanderSnapshot} from '../commander-snapshot-sync.js';
import {grantCommanderStun} from '../commander-stun-status.js';
import {reviveCommanderAlly,grantArcaneSurge} from '../commander-ultimate-status.js';
import {chooseBotCast} from '../bot-strategy.js';
import {prepareLiveArenaTeams} from '../commander-live-team-preparation.js';
import {battleRoster} from '../battle-roster.js';
import {stepParityBasicAttack} from '../commander-parity-basic-attack.js';
import {stepParityEnergySplash} from '../commander-parity-energy-splash.js';
import {stepParityDamageSpecial} from '../commander-parity-damage-special.js';
import {stepParityShieldDrain} from '../commander-parity-shield-drain.js';
import {stepParityStatSpecial} from '../commander-parity-stat-special.js';
import {stepParityExecute} from '../commander-parity-execute.js';
const fields=['lastStandReady','lastStandPersistent','lastStandUntilRound','lastStandImmortalRounds','lastStandTriggeredRound','lastStandImmortalUntilRound'];
const hero=(id,extra={})=>({id,name:id,hp:10000,maxHp:10000,attack:100,defense:0,speed:50,position:0,role:'fighter',lane:'front',shield:0,damage:0,kills:0,healing:0,...extra});
function make(side=0,round=3){const teams=[[hero('chosen',{hp:10}),hero('lower',{hp:5,position:1,lane:'back'})],[hero('attacker',{attack:1000,speed:90})]],commanders=[{commanderId:'defense'},{commanderId:'attack'}];if(side===1){teams.reverse();commanders.reverse();}return createLiveCommanderCombat({round,teams,commanders,abilities:createLiveCommanderAbilities({matchKey:'defense-new',energy:[100,100],ultimateEnergy:[100,100],now:0})});}
const cast=(c,side=0,extra={})=>castLiveCommanderCombat(c,{side,ability:'ultimate',targetIds:['chosen'],requestId:'defense-first',matchKey:'defense-new',now:10000,...extra});
for(const triggerRound of [1,3,14,15])test(`lethal hit in round ${triggerRound} protects its remainder plus two full rounds, never refreshes`,()=>{
 const unit=hero('chosen',{hp:10});grantLastStand(unit,1);for(let round=1;round<=triggerRound;round++)expireLastStandGuards([[unit]],round);
 const first=applyHeroDamage(unit,100,{round:triggerRound});assert.equal(first.damage,9);assert.equal(first.guardTriggered,true);assert.equal(first.lastStandTriggeredRound,triggerRound);assert.equal(first.lastStandImmortalUntilRound,triggerRound+2);
 assert.equal(unit.hp,1);assert.equal(unit.lastStandReady,undefined);assert.equal(unit.lastStandPersistent,undefined);assert.equal(unit.lastStandImmortalRounds,undefined);
 const copy=JSON.parse(JSON.stringify(unit));
 for(let round=triggerRound;round<=triggerRound+2;round++){expireLastStandGuards([[copy]],round);assert.equal(grantLastStand(copy,round),false);for(let i=0;i<4;i++){const hit=applyHeroDamage(copy,100,{round});assert.equal(hit.damage,0);assert.equal(hit.lastStandImmortalUntilRound,triggerRound+2);assert.equal(copy.hp,1);}}
 expireLastStandGuards([[copy]],triggerRound+3);for(const field of fields)assert.equal(copy[field],undefined);assert.equal(applyHeroDamage(copy,1,{round:triggerRound+3}).damage,1);assert.equal(copy.hp,0);
});
test('no early clock starts on cast or nonlethal damage; shields, healing and atomic execute retain their rules',()=>{
 const u=hero('a',{hp:100,shield:100});grantLastStand(u,1);const nonlethal=applyHeroDamage(u,50,{round:9});assert.equal(nonlethal.absorbed,35);assert.equal(u.hp,85);assert.equal(u.lastStandTriggeredRound,undefined);
 u.hp=14;u.maxHp=100;u.shield=100;const hit=applyHeroDamage(u,10,{round:11,executeThreshold:.12});assert.deepEqual([hit.damage,hit.executedDamage,hit.absorbed],[3,10,7]);assert.equal(u.hp,1);assert.equal(u.lastStandImmortalUntilRound,13);
 u.hp=50;u.shield=100;assert.equal(applyHeroDamage(u,10,{round:12}).damage,3);assert.equal(u.hp,47);assert.equal(u.shield,93);assert.equal(applyHeroDamage(u,1000,{round:13}).damage,46);assert.equal(u.hp,1);
 assert.equal(applyHeroDamage(u,1,{round:14}).guardTriggered,false);assert.equal(u.hp,0);assert.equal(grantLastStand(u,14),false);assert.equal(applyHeroDamage(u,100,{round:14}).damage,0);
});
for(const side of [0,1])test(`seat ${side}: manual ally selection, shield budget, one-use and no-cost invalid/retry cases`,()=>{
 const c=make(side),before=structuredClone(c),own=c.teams[side],enemy=c.teams[1-side];own.push(hero('fallen',{hp:0,position:2}));
 for(const targetIds of [undefined,[],['fallen'],['missing'],['attacker'],['chosen','lower']]){const snapshot=structuredClone(c);assert.throws(()=>cast(c,side,{targetIds}));assert.deepEqual(c,snapshot);}
 const result=cast(c,side);assert.equal(c.teams[side][0].lastStandReady,true);assert.equal(c.teams[side][1].lastStandReady,undefined);assert.deepEqual(c.teams[1-side],enemy);assert.equal(c.teams[side][2].hp,0);
 const guards=result.events.at(-1).impacts.filter(i=>i.kind==='guard');assert.deepEqual(guards,[{target:'chosen',kind:'guard',value:1,immortalRounds:2}]);assert.equal(result.events.at(-1).value,c.teams[side][0].shield+c.teams[side][1].shield);assert.ok(c.teams[side][0].shield>0);assert.ok(c.teams[side][1].shield>0);
 assert.deepEqual([c.abilities.energy[side],c.abilities.ultimateEnergy[side],c.abilities.ultimateUsed[side]],[100,15,true]);
 const after=structuredClone(c);assert.equal(cast(c,side).duplicate,true);assert.deepEqual(c,after);assert.throws(()=>cast(c,side,{targetIds:['lower']}),/conflict/);assert.deepEqual(c,after);assert.throws(()=>cast(c,side,{requestId:'new-cast',now:20000}),/already used/);assert.deepEqual(c,after);
});
for(const side of [0,1])for(const bot of [false,true])for(const triggerLate of [false,true])test(`${bot?'bot':'PvP'} seat ${side}: ${triggerLate?'late':'early'} round lethal trigger survives two complete scheduled rounds`,()=>{
 const c=make(side);c.teams[side][1].hp=5000;c.teams[side][0].speed=triggerLate?100:10;c.teams[1-side][0].speed=50;
 const registry=createLiveArenaRegistry();registry.register({matchKey:'defense-new',tokens:['left','right'],combat:c,options:{parity:true}});const token=side?'right':'left';
 const request=bot?chooseBotCast(registry.snapshot({matchKey:'defense-new',token,now:10000}),'defense','hard',{side,now:10000}):{ability:'ultimate',targetIds:['chosen']};assert.deepEqual(request,{ability:'ultimate',targetIds:['chosen']});registry.cast({matchKey:'defense-new',token,requestId:'cursor-cast',now:10000,...request});
 if(triggerLate){assert.equal(registry.stepServerHero('defense-new').result.event.actor,'chosen');assert.equal(c.teams[side][0].lastStandTriggeredRound,undefined);}
 while(registry.snapshot({matchKey:'defense-new',token}).nextHero)registry.stepServerHero('defense-new');assert.equal(c.teams[side][0].hp,1);assert.equal(c.teams[side][0].lastStandTriggeredRound,3);assert.equal(c.teams[side][0].lastStandImmortalUntilRound,5);
 for(const round of [4,5]){registry.advanceServerRound('defense-new');while(registry.snapshot({matchKey:'defense-new',token}).nextHero)registry.stepServerHero('defense-new');assert.equal(c.teams[side][0].hp,1);assert.equal(c.teams[side][0].lastActionRound,round);assert.equal(c.teams[1-side][0].kills,0);}
 registry.advanceServerRound('defense-new');assert.equal(c.teams[side][0].lastStandImmortalUntilRound,undefined);while(registry.snapshot({matchKey:'defense-new',token}).nextHero)registry.stepServerHero('defense-new');assert.equal(c.teams[side][0].hp,0);assert.equal(c.teams[1-side][0].kills,1);
});
const attackFamilies=[['basic',{},c=>stepParityBasicAttack(c,{side:1,actorId:'attacker'})],...['burst','pierce','splash','headshot'].map(effect=>[effect,{active:{effect,name:effect,power:1.12}},c=>stepParityDamageSpecial(c,{side:1,actorId:'attacker'})]),...['shield','drain'].map(effect=>[effect,{active:{effect,name:effect,power:1.12}},c=>stepParityShieldDrain(c,{side:1,actorId:'attacker'})]),...['sunder','weaken','haste'].map(effect=>[effect,{active:{effect,name:effect,power:1.12}},c=>stepParityStatSpecial(c,{side:1,actorId:'attacker'})]),['execute',{role:'fighter',active:{effect:'execute',name:'execute',power:1.12}},c=>stepParityExecute(c,{side:1,actorId:'attacker'})],['energy AoE',{role:'energy'},c=>stepParityEnergySplash(c,{side:1,actorId:'attacker'})]];
for(const [name,extra,attack]of attackFamilies)test(name+' repeated lethal hits preserve 1 HP and explicit event expiry without kill rewards',()=>{
 const c=make();c.teams[0][1].hp=10000;Object.assign(c.teams[1][0],extra);grantLastStand(c.teams[0][0],1);
 for(let i=0;i<3;i++){const out=attack(c),events=out.events??[out.event],event=events.find(e=>e.target==='chosen'&&e.rawDamage!==undefined);assert.equal(c.teams[0][0].hp,1);assert.equal(event.lastStandTriggeredRound,3);assert.equal(event.lastStandImmortalUntilRound,5);assert.equal(event.guardTriggered,true);assert.equal(c.teams[1][0].kills,0);assert.equal(c.finished,false);}
});
test('selected secondary AoE recipient and commander damage use the same persistent floor',()=>{
 const c=make();c.teams[0][0].hp=10000;c.teams[0][1].hp=5;c.teams[1][0].role='energy';grantLastStand(c.teams[0][1],1);
 for(let i=0;i<3;i++){const out=stepParityEnergySplash(c,{side:1,actorId:'attacker'});const hit=out.events.find(e=>e.target==='lower');assert.equal(c.teams[0][1].hp,1);assert.equal(hit.lastStandImmortalUntilRound,5);assert.equal(c.teams[1][0].kills,0);}
 const out=castLiveCommanderCombat(c,{side:1,ability:'normal',requestId:'commander-hit',matchKey:'defense-new',now:20000});const hit=out.events.find(e=>e.target==='lower');assert.equal(hit.lastStandImmortalUntilRound,5);assert.equal(c.teams[0][1].hp,1);
});
test('stun does not consume, postpone or extend immortality and protected hero can still be healed',()=>{
 const c=make();cast(c);applyServerHeroAction(c,{side:1,actorId:'attacker',targetId:'chosen',value:1000});grantCommanderStun(c.teams[0][0]);
 assert.equal(stepParityBasicAttack(c,{side:0,actorId:'chosen'}).event.action,'stun-skip');assert.equal(c.teams[0][0].lastStandImmortalUntilRound,5);
 applyServerHeroAction(c,{side:0,actorId:'lower',targetId:'chosen',action:'heal',value:40});assert.equal(c.teams[0][0].hp,41);assert.equal(c.teams[0][0].lastStandImmortalUntilRound,5);
 for(let round=4;round<=6;round++)beginServerCombatRound(c,round);assert.equal(isLastStandActive(c.teams[0][0],6),false);applyServerHeroAction(c,{side:1,actorId:'attacker',targetId:'chosen',value:1000});assert.equal(c.teams[0][0].hp,0);assert.equal(c.teams[1][0].kills,1);
});
test('actual death/revival clears every guard field, and no mage transfer occurs before real death',()=>{
 const ally=hero('chosen',{hp:10}),other=hero('other');grantLastStand(ally,1);grantArcaneSurge(ally,4);const team=[ally,other];
 assert.equal(applyHeroDamage(ally,100,{round:4,allies:team}).arcaneTransfer,undefined);assert.equal(applyHeroDamage(ally,100,{round:5,allies:team}).arcaneTransfer,undefined);assert.equal(ally.hp,1);
 const dead=applyHeroDamage(ally,100,{round:7,allies:team});assert.equal(ally.hp,0);assert.equal(dead.arcaneTransfer,undefined,'surge expired while protected; no fresh duration on death');for(const field of fields)assert.equal(ally[field],undefined);
 Object.assign(ally,{lastStandReady:true,lastStandPersistent:true,lastStandImmortalRounds:2,lastStandTriggeredRound:7,lastStandImmortalUntilRound:9});reviveCommanderAlly(ally,7);assert.equal(ally.hp,4000);for(const field of fields)assert.equal(ally[field],undefined);assert.equal(applyHeroDamage(ally,10000,{round:8}).guardTriggered,false);assert.equal(ally.hp,0);
});
test('old snapshots keep their original one-hit protection and malformed/future/expired immortality never protects',()=>{
 const old=hero('old',{hp:10,lastStandReady:true,lastStandPersistent:true});assert.equal(applyHeroDamage(old,100,{round:3}).lastStandImmortalUntilRound,undefined);assert.equal(old.hp,1);applyHeroDamage(old,1,{round:3});assert.equal(old.hp,0);
 for(const state of [{lastStandTriggeredRound:4,lastStandImmortalUntilRound:6},{lastStandTriggeredRound:1,lastStandImmortalUntilRound:2},{lastStandTriggeredRound:1,lastStandImmortalUntilRound:999},{lastStandTriggeredRound:'1',lastStandImmortalUntilRound:3}]){const u=hero('bad',{hp:1,...state});assert.equal(isLastStandImmortal(u,3),false);applyHeroDamage(u,1,{round:3});assert.equal(u.hp,0);}
});
test('reconnect versioning, cancellation, and rematch cannot restore consumed or old protection',()=>{
 const c=make(),sync=createCommanderSnapshotSync();cast(c);const armed=viewLiveCommanderCombat(c);assert.equal(acceptCommanderSnapshot(sync,armed).accepted,true);applyServerHeroAction(c,{side:1,actorId:'attacker',targetId:'chosen',value:1000});const active=viewLiveCommanderCombat(c);assert.equal(acceptCommanderSnapshot(sync,active).accepted,true);assert.equal(acceptCommanderSnapshot(sync,armed).accepted,false);assert.equal(sync.teams[0][0].lastStandImmortalUntilRound,5);
 let canceled=0;const lifecycle=createLiveArenaLifecycle({scheduler:()=>7,canceller:()=>canceled++});lifecycle.begin({matchKey:'cancel:1',tokens:['left','right'],combat:c,options:{parity:true}});assert.equal(lifecycle.end('cancel:1'),true);assert.equal(canceled,1);const before=structuredClone(c);assert.throws(()=>lifecycle.cast({matchKey:'cancel:1',token:'left',ability:'ultimate',targetIds:['chosen'],requestId:'after-end'}),/Unknown active/);assert.deepEqual(c,before);
 const cards=battleRoster.slice(0,5).map(u=>({id:u.id,power:u.proposedPower,...Object.fromEntries(fields.map(f=>[f, f.includes('Ready')||f.includes('Persistent')?true:999]))}));const teams=prepareLiveArenaTeams(cards,cards,{cardAdapter:'auction'});for(const u of teams.flat())for(const field of fields)assert.equal(u[field],undefined);
});
test('battle ends at round15 even if immortality has remaining duration',()=>{
 const c=make(0,15);c.teams[0][1].hp=10000;grantLastStand(c.teams[0][0],1);const session=createLiveArenaSession(c,{parity:true});while(!c.finished)stepLiveArenaHero(session);assert.equal(c.teams[0][0].hp,1);assert.equal(c.teams[0][0].lastStandImmortalUntilRound,17);assert.equal(viewLiveArenaSession(session).finished,true);assert.equal(viewLiveArenaSession(session).nextHero,null);assert.throws(()=>advanceLiveArenaRound(session));assert.throws(()=>cast(c),/finished/);
});
