import test from 'node:test';
import {grantArcaneSurge} from '../commander-ultimate-status.js';
import assert from 'node:assert/strict';
import {applyHeroDamage,grantLastStand,expireLastStandGuards} from '../battle-hp-damage.js';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat,applyServerHeroAction,beginServerCombatRound} from '../commander-live-combat.js';
import {stepParityShieldDrain} from '../commander-parity-shield-drain.js';
import {stepParityStatSpecial} from '../commander-parity-stat-special.js';
import {stepParityExecute} from '../commander-parity-execute.js';
import {stepParityDamageSpecial} from '../commander-parity-damage-special.js';
import {stepParityEnergySplash} from '../commander-parity-energy-splash.js';
import {applyServerSplashAction} from '../commander-live-splash.js';
const hero=(id,extra={})=>({id,name:id,hp:100,maxHp:100,attack:100,defense:0,speed:100,shield:0,role:'fighter',lane:'front',position:0,damage:0,kills:0,healing:0,...extra});
function make(actorExtra={},targetExtra={}){
 const actor=hero('actor',actorExtra),target=hero('target',{hp:10,...targetExtra});grantLastStand(target,2);
 return createLiveCommanderCombat({round:3,teams:[[actor],[target]],abilities:createLiveCommanderAbilities({matchKey:'laststand:damage',energy:[0,0]}),commanders:[{commanderId:'attack'},{commanderId:'defense'}]});
}
test('guard caps lethal damage at HP−1 without healing until the two full following rounds expire',()=>{
 const target=hero('t',{hp:10});assert.equal(grantLastStand(target,2),true);
 const first=applyHeroDamage(target,50,{round:3});assert.deepEqual(first,{damage:9,executedDamage:0,absorbed:0,rawDamage:50,guardTriggered:true,lastStandTriggeredRound:3,lastStandImmortalUntilRound:5});assert.equal(target.hp,1);assert.equal(Object.hasOwn(target,'lastStandReady'),false);
 for(const round of [3,4,5]){assert.equal(applyHeroDamage(target,1,{round}).damage,0);assert.equal(target.hp,1);}
 assert.equal(applyHeroDamage(target,1,{round:6}).damage,1);assert.equal(target.hp,0);
 assert.equal(grantLastStand(target,6),false);assert.equal(applyHeroDamage(target,100,{round:6}).damage,0);assert.equal(target.hp,0);
});
test('shield absorption and guard are independent budgets, including 1HP and integer small hits',()=>{
 for(const raw of [1,2,3,5,10,50]){const t=hero('t',{hp:1,shield:100});grantLastStand(t,1);const r=applyHeroDamage(t,raw,{round:2});assert.equal(r.absorbed,Math.floor(raw*7/10));assert.equal(r.damage,0);assert.equal(t.hp,1);assert.equal(r.guardTriggered,true);assert.equal(t.shield,100-r.absorbed);}
 const healthy=hero('t',{hp:100,shield:100});grantLastStand(healthy,1);const r=applyHeroDamage(healthy,50,{round:1});assert.equal(r.damage,15);assert.equal(r.guardTriggered,false);assert.equal(healthy.lastStandReady,true);
});
test('execute is atomic with ordinary hit: guard prevents final death, not just initial hit',()=>{
 const t=hero('t',{hp:14,shield:100});grantLastStand(t,2);
 const r=applyHeroDamage(t,10,{round:3,executeThreshold:.12});assert.equal(r.damage,3);assert.equal(r.executedDamage,10);assert.equal(r.absorbed,7);assert.equal(r.guardTriggered,true);assert.equal(t.hp,1);
 const plain=hero('p',{hp:14,shield:100});const normal=applyHeroDamage(plain,10,{round:3,executeThreshold:.12});assert.equal(normal.executedDamage,11);assert.equal(plain.hp,0);
});
test('legacy timed guard preserves its original expiry and cannot stack or refresh',()=>{
 const target=hero('t',{hp:5,lastStandReady:true,lastStandUntilRound:3});assert.equal(grantLastStand(target,2),false);assert.equal(target.lastStandUntilRound,3);
 assert.equal(grantLastStand(target,3),false);assert.equal(target.lastStandUntilRound,3);
 expireLastStandGuards([[target]],3);assert.equal(target.lastStandReady,true);
 expireLastStandGuards([[target]],4);assert.equal(Object.hasOwn(target,'lastStandReady'),false);
 assert.equal(applyHeroDamage(target,5,{round:4}).guardTriggered,false);assert.equal(target.hp,0);
 const expired=hero('e',{hp:5,lastStandReady:true,lastStandUntilRound:2});assert.equal(applyHeroDamage(expired,5,{round:3}).guardTriggered,false);
});
const primaryCases=[
 ['generic basic',{},c=>applyServerHeroAction(c,{side:0,actorId:'actor',targetId:'target',value:100})],
 ['shield special',{active:{effect:'shield',name:'shield',power:1.12}},c=>stepParityShieldDrain(c,{side:0,actorId:'actor'})],
 ['drain special',{active:{effect:'drain',name:'drain',power:1.12}},c=>stepParityShieldDrain(c,{side:0,actorId:'actor'})],
 ['sunder',{active:{effect:'sunder',name:'sunder',power:1.12}},c=>stepParityStatSpecial(c,{side:0,actorId:'actor'})],
 ['weaken',{active:{effect:'weaken',name:'weaken',power:1.12}},c=>stepParityStatSpecial(c,{side:0,actorId:'actor'})],
 ['haste',{active:{effect:'haste',name:'haste',power:1.12}},c=>stepParityStatSpecial(c,{side:0,actorId:'actor'})],
 ['burst',{active:{effect:'burst',name:'burst',power:1.12}},c=>stepParityDamageSpecial(c,{side:0,actorId:'actor'})],
 ['pierce',{active:{effect:'pierce',name:'pierce',power:1.12}},c=>stepParityDamageSpecial(c,{side:0,actorId:'actor'})],
 ['splash primary',{active:{effect:'splash',name:'splash',power:1.12}},c=>stepParityDamageSpecial(c,{side:0,actorId:'actor'})],
 ['energy primary',{role:'energy'},c=>stepParityEnergySplash(c,{side:0,actorId:'actor'})]
];
for(const[name,extra,step]of primaryCases)test(name+' honors guard and does not award premature kill/casualty energy',()=>{
 const c=make(extra);step(c);assert.equal(c.teams[1][0].hp,1);assert.equal(c.teams[0][0].damage,9);assert.equal(c.teams[0][0].kills,0);assert.equal(c.abilities.energy[1],0);assert.equal(c.finished,false);assert.equal(c.events.filter(e=>e.guardTriggered).length,1);
 applyServerHeroAction(c,{side:0,actorId:'actor',targetId:'target',value:1});assert.equal(c.teams[1][0].hp,1);assert.equal(c.teams[0][0].kills,0);assert.equal(c.abilities.energy[1],0);
 for(let round=4;round<=6;round++)beginServerCombatRound(c,round);const energy=c.abilities.energy[1];
 applyServerHeroAction(c,{side:0,actorId:'actor',targetId:'target',value:1});assert.equal(c.teams[1][0].hp,0);assert.equal(c.teams[0][0].kills,1);assert.equal(c.abilities.energy[1],energy+10);
});
test('live execute credits only actual ordinary+execution HP loss, then one later kill',()=>{
 const c=make({attack:13,role:'assassin',active:{effect:'execute',name:'execute',power:1.12}},{hp:14,shield:100});
 const r=stepParityExecute(c,{side:0,actorId:'actor'});assert.equal(r.event.rawDamage,10);assert.equal(r.event.value,3);assert.equal(r.event.executedDamage,10);assert.equal(r.event.guardTriggered,true);assert.equal(c.teams[0][0].damage,13);assert.equal(c.teams[0][0].kills,0);assert.equal(c.abilities.energy[1],0);assert.equal(c.teams[1][0].hp,1);
 applyServerHeroAction(c,{side:0,actorId:'actor',targetId:'target',value:1});assert.equal(c.teams[0][0].damage,13);assert.equal(c.teams[0][0].kills,0);
 for(let round=4;round<=6;round++)beginServerCombatRound(c,round);const energy=c.abilities.energy[1];
 applyServerHeroAction(c,{side:0,actorId:'actor',targetId:'target',value:1});assert.equal(c.teams[0][0].damage,14);assert.equal(c.teams[0][0].kills,1);assert.equal(c.abilities.energy[1],energy+10);
});
for(const [name,extra,step]of [
 ['splash skill',{active:{effect:'splash',name:'splash',power:1.12}},c=>stepParityDamageSpecial(c,{side:0,actorId:'actor'})],
 ['energy role', {role:'energy'},c=>stepParityEnergySplash(c,{side:0,actorId:'actor'})],
 ['energy weaken',{role:'energy',active:{effect:'weaken',name:'weaken',power:1.12}},c=>stepParityStatSpecial(c,{side:0,actorId:'actor'})],
 ['energy drain',{role:'energy',active:{effect:'drain',name:'drain',power:1.12}},c=>stepParityShieldDrain(c,{side:0,actorId:'actor'})],
 ['generic secondary',{role:'energy'},c=>applyServerSplashAction(c,{side:0,actorId:'actor',primaryTargetId:'target',primaryRaw:100})]
])test(name+' independently protects a splash recipient',()=>{
 const c=make(extra,{hp:100,maxHp:100});delete c.teams[1][0].lastStandReady;delete c.teams[1][0].lastStandUntilRound;
 const secondary=hero('secondary',{hp:5,lane:'back',position:1});grantLastStand(secondary,2);c.teams[1].push(secondary);step(c);
 assert.equal(c.teams[1][1].hp,1);const event=c.events.find(e=>e.target==='secondary');assert.equal(event.value,4);assert.equal(event.guardTriggered,true);assert.equal(c.teams[0][0].kills,0);assert.equal(c.abilities.energy[1],0);
});
test('normal live round transition removes expired guard without HP changes',()=>{
 const c=make();delete c.teams[1][0].lastStandPersistent;c.teams[1][0].lastStandUntilRound=3;beginServerCombatRound(c,4);assert.equal(c.teams[1][0].hp,10);assert.equal(Object.hasOwn(c.teams[1][0],'lastStandReady'),false);
});

test('surged special damage passes its round through every live family and guard still stops death',()=>{
 for(const [name,extra,step]of primaryCases.filter(([name])=>name!=='generic basic')){
  const c=make(extra);grantArcaneSurge(c.teams[0][0],3);step(c);
  const event=c.events.find(e=>e.rawDamage!==undefined);assert.ok(event.rawDamage>100,name+' must receive active cast-time surge');assert.equal(c.teams[1][0].hp,1);assert.equal(event.guardTriggered,true);assert.equal(c.teams[0][0].kills,0);
 }
 const execute=make({attack:100,role:'assassin',active:{effect:'execute',name:'execute',power:1.12}});grantArcaneSurge(execute.teams[0][0],3);const result=stepParityExecute(execute,{side:0,actorId:'actor'});assert.ok(result.event.rawDamage>100);assert.equal(execute.teams[1][0].hp,1);
});
test('live round cleanup expires mage and last-stand statuses together without stat mutation',()=>{
 const c=make();delete c.teams[1][0].lastStandPersistent;c.teams[1][0].lastStandUntilRound=3;c.teams[0][0].arcaneSurgeBonusAttack=100;c.teams[0][0].arcaneSurgeFromRound=1;c.teams[0][0].arcaneSurgeUntilRound=3;c.teams[0][0].commanderFocusTargetId='target';c.teams[0][0].commanderFocusUntilRound=3;
 beginServerCombatRound(c,4);assert.equal(c.teams[0][0].attack,100);assert.equal(Object.hasOwn(c.teams[0][0],'arcaneSurgeBonusAttack'),false);assert.equal(Object.hasOwn(c.teams[1][0],'lastStandReady'),false);assert.equal(Object.hasOwn(c.teams[0][0],'commanderFocusTargetId'),false);
});
