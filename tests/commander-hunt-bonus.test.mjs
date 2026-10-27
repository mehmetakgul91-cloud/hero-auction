import test from 'node:test';
import assert from 'node:assert/strict';
import {grantCommanderHunt,commanderHuntAttackBonus,consumeCommanderHunt,expireCommanderHunt} from '../commander-hunt-status.js';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat,castLiveCommanderCombat,applyServerHeroAction,beginServerCombatRound} from '../commander-live-combat.js';
import {createLiveArenaRegistry} from '../commander-live-arena-registry.js';
import {createLiveArenaSession,stepLiveArenaHero,viewLiveArenaSession} from '../commander-live-arena-session.js';
import {chooseBotCast} from '../bot-strategy.js';
import {stepParityBasicAttack} from '../commander-parity-basic-attack.js';
import {stepParityEnergySplash} from '../commander-parity-energy-splash.js';
import {stepParityDamageSpecial} from '../commander-parity-damage-special.js';
import {stepParityShieldDrain} from '../commander-parity-shield-drain.js';
import {stepParityStatSpecial} from '../commander-parity-stat-special.js';
import {stepParityExecute} from '../commander-parity-execute.js';
import {stepBasicHeroCombat} from '../commander-incremental-basic.js';
import {applyServerSpecialHeal} from '../commander-live-special-heal.js';
import {applyHeroDamage,grantLastStand} from '../battle-hp-damage.js';
import {grantArcaneSurge,reviveCommanderAlly} from '../commander-ultimate-status.js';
import {grantCommanderStun} from '../commander-stun-status.js';
import {grantCommanderWeaken} from '../commander-weaken-status.js';
import {calculateHeroRawDamage} from '../battle-damage-formula.js';
import {calculateSplashRawDamage} from '../battle-special-formulas.js';
import {applyLegacyStartPassives,applyLegacyRoundPassives} from '../commander-parity-passives.js';
import {applyCommanderSupport} from '../arena-commanders.js';
import {fighterFromCard,simulateBattle} from '../battle-engine.js';

const hero=(id,extra={})=>({id,power:100,hp:5000,maxHp:5000,attack:100,defense:20,speed:50,position:0,role:'fighter',lane:'front',shield:0,damage:0,kills:0,healing:0,...extra});
const make=(extra={},round=3)=>createLiveCommanderCombat({abilities:createLiveCommanderAbilities({matchKey:'hunt',energy:[100,100],now:0}),teams:[[hero('actor',extra),hero('ally',{position:1}),hero('dead',{hp:0,position:2})],[hero('b'),hero('c',{lane:'back',position:1})]],commanders:[{commanderId:'attack'},{commanderId:'defense'}],round});
const cast=(c,extra={})=>castLiveCommanderCombat(c,{side:0,ability:'ultimate',requestId:'hunt-first',matchKey:'hunt',now:10000,targetIds:['b'],...extra});
const primary=out=>(out.events||[out.event]).find(e=>e.damageType==='special'||e.action==='attack');

test('Hunt grants one JSON-safe fixed charge to each currently living ally, never an immediate stat or HP change',()=>{
 const c=make(),before=structuredClone(c.teams),out=cast(c),event=out.events.at(-1);
 assert.deepEqual(c.teams.map(t=>t.map(u=>[u.hp,u.attack,u.defense,u.speed,u.shield])),before.map(t=>t.map(u=>[u.hp,u.attack,u.defense,u.speed,u.shield])));
 assert.deepEqual(c.teams[0].map(u=>u.commanderHuntNextAttack),[true,true,undefined]);
 assert.ok(c.teams[1].every(u=>u.commanderHuntNextAttack===undefined));
 assert.deepEqual(event.impacts.filter(i=>i.kind==='hunt-buff'),['actor','ally'].map(target=>({target,kind:'hunt-buff',value:20,nextAttack:true})));
 assert.equal(c.teams[1][0].commanderFocusUntilDeath,true);assert.equal(out.ultimateEnergy,25);assert.equal(out.energy,100);
 const unit=JSON.parse(JSON.stringify(c.teams[0][0]));for(let i=0;i<10;i++)grantCommanderHunt(unit);
 assert.equal(commanderHuntAttackBonus(unit),20);assert.equal(unit.attack,100);assert.equal(consumeCommanderHunt(unit),true);assert.equal(consumeCommanderHunt(unit),false);
 assert.throws(()=>grantCommanderHunt(c.teams[0][2]),/living/);
});

for(const level of [0,20,40])test(`level ${level}: the attack charge stays fixed at 20%, with the same 75 ultimate cost`,()=>{
 const c=make();c.commanders[0].levels={attack:level,defense:0,magic:0,support:0};const out=cast(c);
 assert.equal(out.ultimateEnergy,25);assert.ok(out.events.at(-1).impacts.filter(i=>i.kind==='hunt-buff').every(i=>i.value===20));
 assert.equal(primary(stepParityBasicAttack(c,{side:0,actorId:'actor'})).rawDamage,70);
});

test('critical, guard, pierce and the 70% shield cap apply after the one-time attack increase',()=>{
 const unit=hero('actor'),target=hero('target',{defense:50,shield:1000});grantCommanderHunt(unit);
 const raw=calculateHeroRawDamage({unit,target,skill:{effect:'pierce',power:1.12,pierceRate:.3},special:true,critical:true,guarded:true,round:3});
 assert.equal(raw,Math.floor(120*1.12*.85*.7*100/135*1.3));
 const hit=applyHeroDamage(target,raw,{round:3});assert.equal(hit.absorbed,Math.floor(raw*.7));assert.equal(hit.damage,raw-hit.absorbed);
 assert.equal(unit.commanderHuntNextAttack,true,'pure damage calculation and per-target settlement never consume an action charge');
});

const cases=[['basic',{},c=>stepParityBasicAttack(c,{side:0,actorId:'actor'})],['energy AoE',{role:'energy'},c=>stepParityEnergySplash(c,{side:0,actorId:'actor'})],...['burst','pierce','splash','headshot'].map(effect=>[effect,{active:{effect,name:effect,power:1.12}},c=>stepParityDamageSpecial(c,{side:0,actorId:'actor'})]),...['shield','drain'].map(effect=>[effect,{role:'energy',active:{effect,name:effect,power:1.12}},c=>stepParityShieldDrain(c,{side:0,actorId:'actor'})]),...['sunder','weaken','haste'].map(effect=>[effect,{role:'energy',active:{effect,name:effect,power:1.12}},c=>stepParityStatSpecial(c,{side:0,actorId:'actor'})]),['execute',{role:'assassin',active:{effect:'execute',name:'execute',power:1.12}},c=>stepParityExecute(c,{side:0,actorId:'actor'})]];
for(const[name,extra,step]of cases)test(name+': next whole attack gets +20% attack once; all splash hits reuse its boosted raw damage',()=>{
 const c=make(extra);cast(c);const actor=c.teams[0][0],target=c.teams[1][0];
 const expected=calculateHeroRawDamage({unit:{...actor,attack:120,commanderHuntNextAttack:false},target,skill:extra.active,special:name!=='basic',round:3});
 const out=step(c),event=primary(out);assert.equal(event.rawDamage,expected);assert.equal(event.huntAttackConsumed,true);
 const events=out.events||[out.event];assert.equal(events.filter(e=>e.huntAttackConsumed).length,1);
 for(const e of events.filter(e=>e.damageType==='splash'))assert.equal(e.rawDamage,calculateSplashRawDamage(expected,{skill:extra.active,role:actor.role,special:true}));
 assert.equal(c.teams[0][0].commanderHuntNextAttack,undefined);assert.equal(c.teams[0][1].commanderHuntNextAttack,true);assert.equal(c.teams[0][0].attack,100);
 if(name==='headshot')assert.equal(expected,target.hp+target.shield,'existing fixed headshot formula remains unchanged');
 // The next invocation has no marker and therefore uses normal attack again.
 const next=step(c);assert.equal(primary(next).huntAttackConsumed,undefined);assert.equal(c.teams[0][0].attack,100);
});

test('prototype basic action applies the same one-use attack increase before its existing defense formula',()=>{
 const c=make();cast(c);const hp=c.teams[1][0].hp;
 const first=stepBasicHeroCombat(c,{side:0,actorId:'actor'});assert.equal(first.event.value,113);assert.equal(first.event.huntAttackConsumed,true);
 const second=stepBasicHeroCombat(c,{side:0,actorId:'actor'});assert.equal(second.event.value,93);assert.equal(hp-c.teams[1][0].hp,206);
});

for(const side of [0,1])for(const bot of [false,true])for(const alreadyActed of [false,true])test(`${bot?'bot':'PvP'} seat ${side}, already acted=${alreadyActed}: server cursor grants exactly one future empowered attack per living ally`,()=>{
 const c=make({},2);c.teams[0][0].speed=100;if(side===1){c.teams.reverse();c.commanders.reverse();}
 const registry=createLiveArenaRegistry(),token=side?'right':'left';registry.register({matchKey:'hunt',tokens:['left','right'],combat:c,options:{parity:true}});
 if(alreadyActed)assert.equal(registry.stepServerHero('hunt').result.event.actor,'actor');
 const choice=bot?chooseBotCast(registry.snapshot({matchKey:'hunt',token,now:10000}),'attack','hard',{side,now:10000,startedAt:0,lastCastAt:0}):{ability:'ultimate',targetIds:['b']};
 assert.deepEqual(choice,{ability:'ultimate',targetIds:['b']});registry.cast({matchKey:'hunt',token,requestId:'cursor-cast',now:10000,...choice});
 for(let round=2;round<=4;round++){
  while(registry.snapshot({matchKey:'hunt',token}).nextHero)registry.stepServerHero('hunt');
  const attacks=c.events.filter(e=>e.round===round&&e.side===side&&e.actor==='actor'&&Number.isFinite(e.rawDamage));
  assert.equal(attacks.length,1);assert.equal(attacks[0].huntAttackConsumed,round===(alreadyActed?3:2)?true:undefined);
  assert.equal(c.teams[1-side][0].commanderFocusUntilDeath,true,'focus survives after bonus is spent');
  if(round<4)registry.advanceServerRound('hunt');
 }
 assert.equal(c.events.filter(e=>e.side===side&&e.huntAttackConsumed).length,2);
});

test('heal-only, hybrid shield, commander normal and stun skip preserve the pending charge across round boundaries',()=>{
 const c=make({role:'support',hp:4000,active:{effect:'shield',name:'hybrid',supportHybrid:true,allyShieldRate:.15,healRate:.5}});cast(c);grantCommanderStun(c.teams[0][0]);
 const heal=applyServerSpecialHeal(c,{side:0,actorId:'actor'});assert.equal(c.teams[0][0].hp,4050,'healing uses unmodified attack');
 assert.ok((heal.events||[heal.event]).every(e=>!e.huntAttackConsumed));assert.equal(c.teams[0][0].commanderHuntNextAttack,true);
 applyServerHeroAction(c,{side:0,actorId:'actor',targetId:'actor',action:'shield',value:10});
 cast(c,{ability:'normal',requestId:'normal-after-hunt',now:12000,targetIds:undefined});assert.equal(c.teams[0][0].commanderHuntNextAttack,true);
 beginServerCombatRound(c,4);assert.equal(stepParityBasicAttack(c,{side:0,actorId:'actor',allowShieldDrainActive:true}).event.action,'stun-skip');assert.equal(c.teams[0][0].commanderHuntNextAttack,true);
 beginServerCombatRound(c,5);assert.equal(stepParityBasicAttack(c,{side:0,actorId:'actor',allowShieldDrainActive:true}).event.huntAttackConsumed,true);
});

test('full-health healing special fallback is a real attack and consumes the charge',()=>{
 const c=make({role:'support',active:{effect:'heal',name:'heal',power:1.12}});cast(c);
 const out=stepParityBasicAttack(c,{side:0,actorId:'actor',specialFallback:true,allowHealActive:true});
 assert.equal(out.event.damageType,'special');assert.equal(out.event.huntAttackConsumed,true);assert.equal(c.teams[0][0].commanderHuntNextAttack,undefined);
});

test('the final-round coordinator clears a pending bonus even when its bearer only heals',()=>{
 const c=make({role:'support',speed:1,active:{effect:'shield',name:'hybrid',supportHybrid:true,allyShieldRate:.15,healRate:.5}},15);cast(c);
 const session=createLiveArenaSession(c,{parity:true,specialHealing:true,shieldDrain:true});
 while(viewLiveArenaSession(session).nextHero)stepLiveArenaHero(session);
 assert.equal(c.finished,true);assert.ok(c.teams.flat().every(u=>u.commanderHuntNextAttack===undefined));
 assert.equal(c.events.some(e=>e.actor==='actor'&&e.huntAttackConsumed),false);
});

test('invalid targets, authorization, insufficient energy and duplicate/conflicting casts cannot grant or replenish charges',()=>{
 const c=make();c.teams[1].push(hero('fallen',{hp:0}));
 for(const targetIds of [undefined,[],['fallen'],['actor'],['missing'],['b','c']]){const before=structuredClone(c);assert.throws(()=>cast(c,{targetIds}));assert.deepEqual(c,before);}
 c.abilities.ultimateEnergy[0]=74;let before=structuredClone(c);assert.throws(()=>cast(c));assert.deepEqual(c,before);c.abilities.ultimateEnergy[0]=100;
 const registry=createLiveArenaRegistry();registry.register({matchKey:'hunt',tokens:['left','right'],combat:c});before=structuredClone(c);
 assert.throws(()=>registry.cast({matchKey:'hunt',token:'forged',ability:'ultimate',targetIds:['b'],requestId:'fake',now:10000}),/Unauthorized/);assert.deepEqual(c,before);
 cast(c);stepParityBasicAttack(c,{side:0,actorId:'actor'});before=structuredClone(c);
 assert.equal(cast(c).duplicate,true);assert.deepEqual(c,before);assert.equal(c.teams[0][0].commanderHuntNextAttack,undefined);
 assert.throws(()=>cast(c,{targetIds:['c']}),/conflict/);assert.deepEqual(c,before);
 assert.throws(()=>cast(c,{requestId:'hunt-second',now:20000}),/already used/);assert.deepEqual(c,before);
});

test('target death ends only focus; ally death removes unused bonus and revival never grants one',()=>{
 const c=make();cast(c);applyHeroDamage(c.teams[1][0],10000,{round:3,allies:c.teams[1]});
 assert.equal(c.teams[1][0].commanderFocusUntilDeath,undefined);assert.equal(c.teams[0][0].commanderHuntNextAttack,true);
 reviveCommanderAlly(c.teams[1][0],3);assert.equal(c.teams[1][0].commanderFocusUntilDeath,undefined);
 reviveCommanderAlly(c.teams[0][2],3);assert.equal(c.teams[0][2].commanderHuntNextAttack,undefined,'dead at cast is ineligible');
 grantLastStand(c.teams[0][0],3);applyHeroDamage(c.teams[0][0],10000,{round:3,allies:c.teams[0]});assert.equal(c.teams[0][0].commanderHuntNextAttack,true,'surviving at 1 HP is not death');
 applyHeroDamage(c.teams[0][0],10000,{round:6,allies:c.teams[0]});assert.equal(c.teams[0][0].commanderHuntNextAttack,undefined);
 reviveCommanderAlly(c.teams[0][0],6);assert.equal(c.teams[0][0].commanderHuntNextAttack,undefined);
});

test('computed commander/passive attack, later rage, fixed surge and weaken compose without permanent or exponential stat growth',()=>{
 let teams=[[hero('actor',{passive:{effect:'focus',value:.2}})],[hero('b')]];
 applyCommanderSupport(teams[0],{commanderId:'attack',levels:{attack:20,defense:0,magic:0,support:0}});teams=applyLegacyStartPassives(teams);
 const c=make();c.teams=teams;const base=c.teams[0][0].attack;assert.ok(base>100);cast(c);
 let actor=c.teams[0][0];assert.equal(commanderHuntAttackBonus(actor),base*.2);assert.equal(actor.attack,base);
 grantArcaneSurge(actor,3);actor.passive={effect:'rage',value:.2};actor.hp=1000;applyLegacyRoundPassives(c);actor=c.teams[0][0];const rage=actor.attack;
 grantCommanderWeaken(actor,.35,3);const expected=Math.floor((rage*1.2+base)*.65*.7*100/120);
 assert.equal(calculateHeroRawDamage({unit:actor,target:c.teams[1][0],weakened:.35,round:3}),expected);
 stepParityBasicAttack(c,{side:0,actorId:'actor',allowRoundPassives:true});assert.equal(c.teams[0][0].attack,rage);assert.equal(c.teams[0][0].arcaneSurgeBonusAttack,base);
 assert.equal(c.teams[0][0].commanderWeakenNextAttack,undefined);assert.equal(c.teams[0][0].commanderHuntNextAttack,undefined);
});

test('finished state and fresh hero preparation cannot leak pending charges into another match',()=>{
 const c=make();cast(c);for(const enemy of c.teams[1])enemy.hp=0;expireCommanderHunt(c.teams);assert.ok(c.teams.flat().every(u=>u.commanderHuntNextAttack===undefined));
 assert.equal(fighterFromCard({id:'forged',power:80,commanderHuntNextAttack:true}).commanderHuntNextAttack,undefined);
 const fresh=make();assert.ok(fresh.teams.flat().every(u=>u.commanderHuntNextAttack===undefined));
});

for(const side of [0,1])test(`legacy side ${side}: each eligible hero consumes once, later attacks and fixed battle stats stay unmodified`,()=>{
 const cards=p=>Array.from({length:5},(_,i)=>({id:p+i,power:100,role:'tank',lane:'front',passive:{effect:'regen',value:1}}));
 const a=cards('a'),b=cards('b'),commanders=[0,1].map(()=>({commanderId:'attack',levels:{attack:0,defense:0,magic:0,support:0}}));
 const out=simulateBattle(a,b,{seed:'hunt-legacy',maxRounds:7,commanders,commanderActions:[{round:5,side,ability:'ultimate',targetIds:[side?'a4':'b4']}],partial:true});
 const event=out.log.find(e=>e.action==='commander-attack-ultimate');assert.equal(event.impacts.filter(i=>i.kind==='hunt-buff').length,5);
 const empowered=out.log.filter(e=>e.side===side&&e.huntAttackConsumed);assert.equal(empowered.length,5);assert.ok(empowered.every(e=>e.round===5));
 for(const e of empowered){const actor=out.teams[side].find(u=>u.id===e.actor),target=out.teams[1-side].find(u=>u.id===e.target);assert.equal(e.rawDamage,calculateHeroRawDamage({unit:{...actor,commanderHuntNextAttack:true},target,critical:e.critical,round:5}));}
 assert.ok(out.teams[side].every(u=>u.commanderHuntNextAttack===undefined));
});
