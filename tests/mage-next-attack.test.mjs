import test from 'node:test';import assert from 'node:assert/strict';
import {grantCommanderWeaken,commanderWeakenRate,consumeCommanderWeaken,expireCommanderWeaken} from '../commander-weaken-status.js';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat,applyServerHeroAction} from '../commander-live-combat.js';
import {applyLiveCommanderEffect} from '../commander-live-effects.js';
import {applyServerSpecialHeal} from '../commander-live-special-heal.js';
import {stepParityBasicAttack} from '../commander-parity-basic-attack.js';
import {stepParityEnergySplash} from '../commander-parity-energy-splash.js';
import {stepParityDamageSpecial} from '../commander-parity-damage-special.js';
import {stepParityShieldDrain} from '../commander-parity-shield-drain.js';
import {stepParityStatSpecial} from '../commander-parity-stat-special.js';
import {stepParityExecute} from '../commander-parity-execute.js';
import {stepBasicHeroCombat} from '../commander-incremental-basic.js';
import {reviveCommanderAlly} from '../commander-ultimate-status.js';
const hero=(id,extra={})=>({id,hp:5000,maxHp:5000,attack:100,defense:20,speed:50,position:0,role:'fighter',lane:'front',shield:0,damage:0,kills:0,healing:0,...extra});
const make=extra=>createLiveCommanderCombat({abilities:createLiveCommanderAbilities({matchKey:'weaken',now:0}),teams:[[hero('actor',extra)],[hero('b'),hero('c',{lane:'back',position:1})]],commanders:[{commanderId:'defense'},{commanderId:'magic'}],round:3});
test('next attack charge survives already-acted/delay/round boundaries, JSON roundtrip, and recasts use max not stack',()=>{
 const unit=hero('a',{lastActionRound:2,delayDueRound:5});grantCommanderWeaken(unit,.35,2);expireCommanderWeaken([[unit]],15);assert.equal(commanderWeakenRate(unit,15),.35);assert.equal(unit.commanderWeakenUntilRound,undefined);
 grantCommanderWeaken(unit,.2,15);assert.equal(commanderWeakenRate(unit,15),.35);grantCommanderWeaken(unit,.49,15);assert.equal(commanderWeakenRate(unit,15),.49);assert.equal(JSON.parse(JSON.stringify(unit)).commanderWeakenNextAttack,true);
 assert.equal(consumeCommanderWeaken(unit),true);assert.equal(consumeCommanderWeaken(unit),false);assert.equal(commanderWeakenRate(unit,15),0);
});
const cases=[['basic',{},c=>stepParityBasicAttack(c,{side:0,actorId:'actor',critical:false})],['prototype-basic',{},c=>stepBasicHeroCombat(c,{side:0,actorId:'actor'})],['energy AoE',{role:'energy'},c=>stepParityEnergySplash(c,{side:0,actorId:'actor',critical:false})],...['burst','pierce','splash'].map(effect=>[effect,{active:{effect,name:effect,power:1.12}},c=>stepParityDamageSpecial(c,{side:0,actorId:'actor',critical:false})]),...['shield','drain'].map(effect=>[effect,{active:{effect,name:effect,power:1.12}},c=>stepParityShieldDrain(c,{side:0,actorId:'actor',critical:false})]),...['sunder','weaken','haste'].map(effect=>[effect,{active:{effect,name:effect,power:1.12}},c=>stepParityStatSpecial(c,{side:0,actorId:'actor',critical:false})]),['execute',{role:'assassin',active:{effect:'execute',name:'execute',power:1.12}},c=>stepParityExecute(c,{side:0,actorId:'actor',critical:false})]];
for(const [name,extra,step] of cases)test(name+' consumes one charge after whole attack including every splash hit',()=>{
 const weak=make(extra),plain=make(extra);grantCommanderWeaken(weak.teams[0][0],.35,1);step(weak);step(plain);
 const wa=weak.events.filter(e=>e.target&&e.value>0&&e.action!=='heal'&&e.action!=='shield'),pa=plain.events.filter(e=>e.target&&e.value>0&&e.action!=='heal'&&e.action!=='shield');assert.equal(wa.length,pa.length);
 for(let i=0;i<wa.length;i++)if(wa[i].rawDamage!==undefined)assert.ok(wa[i].rawDamage<pa[i].rawDamage,name+': '+wa[i].action);
 assert.equal(weak.teams[0][0].commanderWeakenNextAttack,undefined);assert.equal(weak.teams[0][0].commanderWeaken,undefined);
 const wn=weak.events.length,pn=plain.events.length;step(weak);step(plain);assert.deepEqual(weak.events.slice(wn).map(e=>e.rawDamage??e.value),plain.events.slice(pn).map(e=>e.rawDamage??e.value));
});
test('heal/shield-only hero actions and commander effects preserve pending attack charge',()=>{
 const c=make({role:'support',hp:4000,active:{effect:'shield',name:'hybrid',supportHybrid:true,allyShieldRate:.15,healRate:.5}});grantCommanderWeaken(c.teams[0][0],.35,1);applyServerSpecialHeal(c,{side:0,actorId:'actor'});assert.equal(c.teams[0][0].commanderWeakenNextAttack,true);
 applyServerHeroAction(c,{side:0,actorId:'actor',targetId:'actor',action:'shield',value:10});assert.equal(c.teams[0][0].commanderWeakenNextAttack,true);
 const result=applyLiveCommanderEffect(c.teams,{side:0,ability:'normal',commanderId:'defense',round:3});assert.equal(result.teams[0][0].commanderWeakenNextAttack,true);
});
test('old timed snapshots stay timed while resurrection clears new charge',()=>{
 const old=hero('old',{commanderWeaken:.3,commanderWeakenUntilRound:4});assert.equal(consumeCommanderWeaken(old),false);assert.equal(commanderWeakenRate(old,4),.3);expireCommanderWeaken([[old]],5);assert.equal(old.commanderWeaken,undefined);
 const dead=hero('dead',{hp:0,commanderWeaken:.49,commanderWeakenNextAttack:true});reviveCommanderAlly(dead,5);assert.equal(dead.commanderWeakenNextAttack,undefined);assert.equal(dead.commanderWeaken,undefined);
});
