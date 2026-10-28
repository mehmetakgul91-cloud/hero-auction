import test from 'node:test';
import assert from 'node:assert/strict';
import {grantArcaneSurge,arcaneDamageAttack,expireCommanderUltimateStatuses,reviveCommanderAlly} from '../commander-ultimate-status.js';
import {applyHeroDamage,grantLastStand} from '../battle-hp-damage.js';
const hero=(id,hp=100,attack=50)=>({id,hp,maxHp:1000,attack,shield:0});
function setup(){const original=hero('original',100,100),low=hero('low',150,80),high=hero('high',200,60);grantArcaneSurge(original,1);return {original,low,high,allies:[original,low,high]};}
test('actual death transfers to own highest absolute HP with recipient fixed ATK snapshot',()=>{
 const {original,high,low,allies}=setup();high.maxHp=2000;low.maxHp=150;
 const hit=applyHeroDamage(original,100,{round:1,allies});
 assert.deepEqual(hit.arcaneTransfer,{sourceId:'original',targetId:'high',fromRound:1,untilRound:3,bonusAttack:60});
 assert.equal(original.hp,0);assert.equal(original.arcaneSurgeUntilRound,undefined);
 assert.equal(arcaneDamageAttack(high,1),120);assert.equal(high.attack,60);assert.equal(high.arcaneSurgeUntilRound,3);assert.equal(low.arcaneSurgeUntilRound,undefined);
 high.attack=70;assert.equal(arcaneDamageAttack(high,2),130);
});
test('ties use deterministic hero id, not current array order',()=>{
 const original=hero('original'),b=hero('b',200),a=hero('a',200);grantArcaneSurge(original,1);
 applyHeroDamage(original,100,{round:1,allies:[original,b,a]});assert.equal(a.arcaneSurgeUntilRound,3);assert.equal(b.arcaneSurgeUntilRound,undefined);
});
for(const acted of ['original','recipient','both'])test(acted+' already acted blocks transfer bonus this round without extending expiry',()=>{
 const {original,high,allies}=setup();if(acted!=='recipient')original.lastActionRound=1;if(acted!=='original')high.lastActionRound=1;
 applyHeroDamage(original,100,{round:1,allies});assert.equal(high.arcaneSurgeFromRound,2);assert.equal(high.arcaneSurgeUntilRound,3);assert.equal(arcaneDamageAttack(high,1),60);assert.equal(arcaneDamageAttack(high,2),120);assert.equal(arcaneDamageAttack(high,4),60);
});
test('pending original start is preserved across successive AoE deaths',()=>{
 const {original,high,low,allies}=setup();delete original.arcaneSurgeUntilRound;original.lastActionRound=1;grantArcaneSurge(original,1);
 applyHeroDamage(original,100,{round:1,allies});applyHeroDamage(high,200,{round:1,allies});
 assert.equal(low.arcaneSurgeFromRound,2);assert.equal(low.arcaneSurgeUntilRound,4);assert.equal(low.arcaneSurgeBonusAttack,80);assert.equal(arcaneDamageAttack(low,1),80);assert.equal(arcaneDamageAttack(low,2),160);
});
test('repeated transfers keep original expiry and clear old bearers',()=>{
 const {original,high,low,allies}=setup();applyHeroDamage(original,100,{round:1,allies});applyHeroDamage(high,200,{round:2,allies});
 assert.equal(low.arcaneSurgeUntilRound,3);assert.equal(high.arcaneSurgeUntilRound,undefined);assert.equal(arcaneDamageAttack(low,3),160);
 expireCommanderUltimateStatuses([allies,[]],4);assert.equal(low.arcaneSurgeUntilRound,undefined);assert.equal(low.attack,80);
});
test('execute transfers but a last-stand lethal guard prevents transfer until actual death',()=>{
 const {original,high,allies}=setup();grantLastStand(original,1);
 const guarded=applyHeroDamage(original,1,{round:1,executeThreshold:.12,allies});assert.equal(guarded.guardTriggered,true);assert.equal(original.hp,1);assert.equal(high.arcaneSurgeUntilRound,undefined);
 const protectedHit=applyHeroDamage(original,0,{round:1,executeThreshold:.12,allies});assert.equal(protectedHit.executedDamage,0);assert.equal(original.hp,1);assert.equal(high.arcaneSurgeUntilRound,undefined);
 // The original surge expires while immortality protects its bearer. A later
 // independent surge may transfer only after true post-protection death.
 grantArcaneSurge(original,4);const death=applyHeroDamage(original,0,{round:4,executeThreshold:.12,allies});assert.equal(death.executedDamage,1);assert.equal(original.hp,0);assert.equal(high.arcaneSurgeUntilRound,6);
});
test('reviving original does not steal back transferred surge',()=>{
 const {original,high,allies}=setup();applyHeroDamage(original,100,{round:1,allies});reviveCommanderAlly(original,2);
 assert.equal(original.hp,400);assert.equal(original.arcaneSurgeUntilRound,undefined);assert.equal(high.arcaneSurgeUntilRound,3);
});
test('expired or consumed final-round surge grants no fresh duration',()=>{
 for(const round of [3,4]){const {original,high,allies}=setup();original.lastActionRound=round;applyHeroDamage(original,100,{round,allies});assert.equal(high.arcaneSurgeUntilRound,undefined);assert.equal(arcaneDamageAttack(high,round+1),60);}
});
test('last ally death and existing separate surge never create or stack bonus',()=>{
 const original=hero('original');grantArcaneSurge(original,1);applyHeroDamage(original,100,{round:1,allies:[original]});assert.equal(original.arcaneSurgeUntilRound,undefined);
 const {original:o,high,allies}=setup();grantArcaneSurge(high,2);const before=structuredClone(high);applyHeroDamage(o,100,{round:2,allies});assert.deepEqual(high,before);
});

import {createLiveCommanderCombat,applyServerHeroAction} from '../commander-live-combat.js';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {stepParityExecute} from '../commander-parity-execute.js';
import {stepParityEnergySplash} from '../commander-parity-energy-splash.js';
function liveScenario(role='fighter',active){
 const original={...hero('original',50,100),defense:0,lane:'front',position:0,role:'fighter'};
 const high={...hero('high',500,60),defense:0,lane:'back',position:1,role:'fighter'};
 grantArcaneSurge(original,3);
 const attacker={...hero('attacker',1000,1),defense:0,lane:'front',position:0,role,...(active?{active}:{})};
 return createLiveCommanderCombat({round:3,abilities:createLiveCommanderAbilities({matchKey:'transfer',energy:[0,0],now:0}),teams:[[attacker],[original,high]],commanders:[{commanderId:'attack'},{commanderId:'magic'}]});
}
test('authoritative basic hit includes transfer status and event metadata',()=>{
 const c=liveScenario();const out=applyServerHeroAction(c,{side:0,actorId:'attacker',targetId:'original',value:50});
 assert.equal(c.teams[1][1].arcaneSurgeUntilRound,5);assert.equal(out.event.arcaneTransfer.targetId,'high');assert.equal(c.abilities.energy[1],10);
});
test('authoritative execute settles transfer after execution and preserves kill reward once',()=>{
 const c=liveScenario('fighter',{effect:'execute',power:1,executeThreshold:.12});const out=stepParityExecute(c,{side:0,actorId:'attacker'});
 assert.ok(out.event.executedDamage>0);assert.equal(c.teams[1][0].hp,0);assert.equal(c.teams[1][1].arcaneSurgeBonusAttack,60);assert.equal(out.event.arcaneTransfer.targetId,'high');assert.equal(c.abilities.energy[1],10);
});
test('authoritative energy splash logs transfer once and damages new bearer without duration reset',()=>{
 const c=liveScenario('energy');c.teams[0][0].attack=200;
 const out=stepParityEnergySplash(c,{side:0,actorId:'attacker'});
 assert.equal(c.teams[1][0].hp,0);assert.ok(c.teams[1][1].hp<500);assert.equal(c.teams[1][1].arcaneSurgeUntilRound,5);assert.equal(out.events.filter(e=>e.arcaneTransfer).length,1);assert.equal(c.abilities.energy[1],10);
});

import {applyLiveCommanderEffect} from '../commander-live-effects.js';
test('commander damage also transfers surge on actual casualty with serializable hit metadata',()=>{
 const c=liveScenario();c.teams[1][0].hp=1;
 const result=applyLiveCommanderEffect(c.teams,{side:0,ability:'normal',commanderId:'attack',commanderProfile:{commanderId:'attack'},attackBasis:1000,round:3});
 assert.equal(result.teams[1][0].hp,0);assert.equal(result.teams[1][1].arcaneSurgeUntilRound,5);
 const transfer=result.log.find(e=>e.arcaneTransfer)?.arcaneTransfer;
 assert.equal(transfer?.targetId,'high');assert.deepEqual(JSON.parse(JSON.stringify(transfer)),transfer);
});
