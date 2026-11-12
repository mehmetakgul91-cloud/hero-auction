import test from 'node:test';
import assert from 'node:assert/strict';
import {grantCommanderStun,hasCommanderStun,consumeCommanderStun,expireCommanderStun,grantCommanderActionStun,hasCommanderActionStun,consumeCommanderActionStun} from '../commander-stun-status.js';
import {createLiveCommanderAbilities,grantLiveCommanderEnergy} from '../commander-live-abilities.js';
import {createLiveCommanderCombat,castLiveCommanderCombat,applyServerHeroAction,beginServerCombatRound} from '../commander-live-combat.js';
import {createLiveArenaRegistry} from '../commander-live-arena-registry.js';
import {createLiveArenaSession,stepLiveArenaHero,advanceLiveArenaRound,viewLiveArenaSession} from '../commander-live-arena-session.js';
import {chooseBotCast} from '../bot-strategy.js';
import {stepParityBasicAttack} from '../commander-parity-basic-attack.js';
import {stepParityEnergySplash} from '../commander-parity-energy-splash.js';
import {stepParityDamageSpecial} from '../commander-parity-damage-special.js';
import {stepParityShieldDrain} from '../commander-parity-shield-drain.js';
import {stepParityStatSpecial} from '../commander-parity-stat-special.js';
import {stepParityExecute} from '../commander-parity-execute.js';
import {stepBasicHeroCombat} from '../commander-incremental-basic.js';
import {applyServerSpecialHeal} from '../commander-live-special-heal.js';
import {applyHeroDamage} from '../battle-hp-damage.js';
import {grantArcaneSurge,reviveCommanderAlly} from '../commander-ultimate-status.js';
const hero=(id,extra={})=>({id,hp:5000,maxHp:5000,attack:100,defense:20,speed:50,position:0,role:'fighter',lane:'front',shield:0,damage:0,kills:0,healing:0,...extra});
function make(extra={},round=3,magicSide=1){
 const teams=[[hero('actor',extra)],[hero('b'),hero('c',{lane:'back',position:1})]],commanders=[{commanderId:'defense'},{commanderId:'magic'}];
 if(magicSide===0){teams.reverse();commanders.reverse();}
 return createLiveCommanderCombat({abilities:createLiveCommanderAbilities({matchKey:'stun',energy:[100,100],now:0}),teams,commanders,round});
}
const cast=(c,extra={})=>castLiveCommanderCombat(c,{side:1,ability:'normal',requestId:'stun-first',matchKey:'stun',now:10000,targetIds:['actor'],...extra});
test('one persistent stun charge survives JSON, already-acted and later round boundaries; never stacks',()=>{
 const unit=hero('a',{lastActionRound:2,delayDueRound:5});grantCommanderStun(unit);grantCommanderStun(unit);expireCommanderStun([[unit]]);
 const copy=JSON.parse(JSON.stringify(unit));assert.equal(hasCommanderStun(copy),true);assert.equal(consumeCommanderStun(copy),true);assert.equal(consumeCommanderStun(copy),false);
 assert.throws(()=>grantCommanderStun(hero('dead',{hp:0})),/living/);
});
const cases=[['basic',{},c=>stepParityBasicAttack(c,{side:0,actorId:'actor',critical:false})],['prototype basic',{},c=>stepBasicHeroCombat(c,{side:0,actorId:'actor'})],['energy AoE',{role:'energy'},c=>stepParityEnergySplash(c,{side:0,actorId:'actor',critical:false})],...['burst','pierce','splash','headshot'].map(effect=>[effect,{active:{effect,name:effect,power:1.12}},c=>stepParityDamageSpecial(c,{side:0,actorId:'actor',critical:false})]),...['shield','drain'].map(effect=>[effect,{active:{effect,name:effect,power:1.12}},c=>stepParityShieldDrain(c,{side:0,actorId:'actor',critical:false})]),...['sunder','weaken','haste'].map(effect=>[effect,{active:{effect,name:effect,power:1.12}},c=>stepParityStatSpecial(c,{side:0,actorId:'actor',critical:false})]),['execute',{role:'assassin',active:{effect:'execute',name:'execute',power:1.12}},c=>stepParityExecute(c,{side:0,actorId:'actor',critical:false})]];
for(const[name,extra,step]of cases)test(name+': entire next attack is skipped with no damage, AoE, stat, healing, shield, execute or energy side effects',()=>{
 const c=make(extra);cast(c);const before=structuredClone(c.teams),energy=[...c.abilities.energy],ultimate=[...c.abilities.ultimateEnergy],n=c.events.length;
 const out=step(c),event=out.event;assert.equal(event.action,'stun-skip');assert.equal(event.stunScope,'action');assert.equal(event.value,0);assert.equal(event.rawDamage,undefined);assert.equal(event.damageType,undefined);assert.equal(c.events.length,n+1);
 assert.deepEqual(c.teams[1],before[1]);assert.deepEqual(c.abilities.energy,energy);assert.deepEqual(c.abilities.ultimateEnergy,ultimate);
 delete before[0][0].commanderStunNextAction;before[0][0].lastActionRound=3;assert.deepEqual(c.teams[0],before[0]);
 const start=c.events.length;step(c);assert.ok(c.events.slice(start).some(e=>e.rawDamage>0||e.action==='attack'&&e.value>0));assert.equal(c.events.slice(start).some(e=>e.action==='stun-skip'),false);
});
for(const side of [0,1])for(const bot of [false,true])for(const alreadyActed of [false,true])test(`${bot?'bot':'PvP'} seat ${side}, already acted=${alreadyActed}: authenticated cast skips exactly the next cursor attack`,()=>{
 const c=make({},2,side);
 c.abilities.commanderIds=Object.freeze(c.commanders.map(x=>x.commanderId));c.teams[1-side][0].speed=100;c.abilities.ultimateEnergy[side]=0;
 const registry=createLiveArenaRegistry(),token=side?'right':'left';registry.register({matchKey:'stun',tokens:['left','right'],combat:c,options:{parity:true}});
 if(alreadyActed)assert.equal(registry.stepServerHero('stun').result.event.actor,'actor');
 const snap=registry.snapshot({matchKey:'stun',token,now:10000});
 const choice=bot?chooseBotCast(snap,'magic','hard',{side,now:10000,startedAt:0,lastCastAt:0}):{ability:'normal',targetIds:['actor']};assert.deepEqual(choice,{ability:'normal',targetIds:['actor']});
 registry.cast({matchKey:'stun',token,requestId:'cursor-cast',now:10000,...choice});
 assert.equal(c.teams[1-side][0].commanderStunNextAction,true);assert.equal(c.teams[1-side][0].commanderWeaken,undefined);
 const skipRound=alreadyActed?3:2;
 for(let round=2;round<=skipRound+1;round++){
  while(registry.snapshot({matchKey:'stun',token}).nextHero)registry.stepServerHero('stun');
  const events=c.events.filter(e=>e.round===round&&e.actor==='actor');
  assert.equal(events.filter(e=>e.action==='stun-skip').length,round===skipRound?1:0);
  assert.equal(events.filter(e=>Number.isFinite(e.rawDamage)).length,round===skipRound?0:1);
  if(round<=skipRound)registry.advanceServerRound('stun');
 }
 assert.equal(c.teams[1-side][0].commanderStunNextAction,undefined);
});
test('historical next-attack stun permits hybrid healing and direct shield until the next attack',()=>{
 const c=make({role:'support',hp:4000,active:{effect:'shield',name:'hybrid',supportHybrid:true,allyShieldRate:.15,healRate:.5}});grantCommanderStun(c.teams[0][0]);
 const before=c.teams[0][0].hp;applyServerSpecialHeal(c,{side:0,actorId:'actor'});assert.ok(c.teams[0][0].hp>before);assert.equal(hasCommanderStun(c.teams[0][0]),true);
 applyServerHeroAction(c,{side:0,actorId:'actor',targetId:'actor',action:'shield',value:10});assert.equal(hasCommanderStun(c.teams[0][0]),true);
 beginServerCombatRound(c,4);const out=stepParityBasicAttack(c,{side:0,actorId:'actor',allowShieldDrainActive:true});assert.equal(out.event.action,'stun-skip');
});
test('historical next-attack stun allows actual hybrid healing cursor and skips its next attack',()=>{
 const c=make({role:'support',speed:100,hp:4000,active:{effect:'shield',name:'hybrid',supportHybrid:true,allyShieldRate:.15,healRate:.5}});grantCommanderStun(c.teams[0][0]);
 const arena=createLiveArenaSession(c,{parity:true,specialHealing:true,shieldDrain:true});stepLiveArenaHero(arena);assert.equal(hasCommanderStun(c.teams[0][0]),true);
 while(viewLiveArenaSession(arena).nextHero)stepLiveArenaHero(arena);advanceLiveArenaRound(arena);
 assert.equal(stepLiveArenaHero(arena).result.event.action,'stun-skip');
});
test('invalid/dead/friendly/multiple targets and unauthorized token cannot spend energy or mutate state',()=>{
 const c=make();c.teams[0].push(hero('fallen',{hp:0,position:1}));
 for(const targetIds of [undefined,[],['fallen'],['b'],['missing'],['actor','fallen']]){const before=structuredClone(c);assert.throws(()=>cast(c,{targetIds}));assert.deepEqual(c,before);}
 const registry=createLiveArenaRegistry();registry.register({matchKey:'stun',tokens:['left','right'],combat:c});const before=structuredClone(c);
 assert.throws(()=>registry.cast({matchKey:'stun',token:'forged',ability:'normal',targetIds:['actor'],requestId:'fake',now:10000}),/Unauthorized/);assert.deepEqual(c,before);
});
test('duplicate retry, conflicting retry and deliberate recast never create more than one skipped attack',()=>{
 const c=make();cast(c);const after=structuredClone(c);assert.equal(cast(c).duplicate,true);assert.deepEqual(c,after);
 assert.throws(()=>cast(c,{targetIds:['missing']}),/conflict/);assert.deepEqual(c,after);
 grantLiveCommanderEnergy(c.abilities,1,20);
 cast(c,{requestId:'stun-second',now:15000});assert.equal(c.abilities.energy[1],0);
 assert.equal(stepParityBasicAttack(c,{side:0,actorId:'actor'}).event.action,'stun-skip');assert.notEqual(stepParityBasicAttack(c,{side:0,actorId:'actor'}).event.action,'stun-skip');
});
test('actual death and revival remove pending stun; last-stand survival does not',()=>{
 const c=make();cast(c);let actor=c.teams[0][0];actor.lastStandReady=true;actor.lastStandPersistent=true;
 applyHeroDamage(actor,10000,{round:3,allies:c.teams[0]});assert.equal(actor.hp,1);assert.equal(hasCommanderActionStun(actor),true);
 applyHeroDamage(actor,1,{round:3,allies:c.teams[0]});assert.equal(actor.hp,0);assert.equal(actor.commanderStunNextAction,undefined);
 actor.commanderStunNextAttack=true;actor.commanderStunNextAction=true;reviveCommanderAlly(actor,3);assert.equal(actor.commanderStunNextAction,undefined);assert.equal(actor.commanderStunNextAttack,undefined);
});
test('stunned ultimate bearer consumes an action round without refreshing or moving original expiry',()=>{
 const c=make({},2);grantArcaneSurge(c.teams[0][0],2);cast(c);const session=createLiveArenaSession(c,{parity:true});
 const until=c.teams[0][0].arcaneSurgeUntilRound;while(viewLiveArenaSession(session).nextHero)stepLiveArenaHero(session);assert.equal(c.teams[0][0].arcaneSurgeUntilRound,until);assert.equal(c.teams[0][0].lastActionRound,2);
 for(let r=3;r<=5;r++){advanceLiveArenaRound(session);while(viewLiveArenaSession(session).nextHero)stepLiveArenaHero(session);}
 assert.equal(c.teams[0][0].arcaneSurgeUntilRound,undefined);assert.equal(c.teams[0][0].attack,100);
});
test('new action stun survives JSON and round boundaries, replaces historical stun and never stacks',()=>{
 const actor=hero('actor',{lastActionRound:2,delayDueRound:5});grantCommanderStun(actor);
 grantCommanderActionStun(actor);grantCommanderActionStun(actor);expireCommanderStun([[actor]]);
 assert.equal(hasCommanderStun(actor),false);
 const copy=JSON.parse(JSON.stringify(actor));
 assert.equal(hasCommanderActionStun(copy),true);assert.equal(consumeCommanderActionStun(copy),true);assert.equal(consumeCommanderActionStun(copy),false);
 assert.throws(()=>grantCommanderActionStun(hero('dead',{hp:0})),/living/);
});
for(const [label,active] of [['hybrid',{effect:'shield',name:'hybrid',supportHybrid:true,allyShieldRate:.15,healRate:.5}],['pure healer',{effect:'heal',name:'heal',healRate:.5}],['no-skill healer',null]])test(label+': new cast skips the scheduled healing action with no healing, shields or energy changes',()=>{
 const c=make({role:'support',speed:100,hp:4000,active});cast(c);
 const arena=createLiveArenaSession(c,{parity:true,specialHealing:true,shieldDrain:true});
 const before=structuredClone(c.teams),energy=[...c.abilities.energy],ultimate=[...c.abilities.ultimateEnergy],n=c.events.length;
 const out=stepLiveArenaHero(arena);
 assert.equal(out.result.event.action,'stun-skip');assert.equal(out.result.event.stunScope,'action');
 assert.equal(c.events.length,n+1);assert.equal(hasCommanderActionStun(c.teams[0][0]),false);
 delete before[0][0].commanderStunNextAction;before[0][0].lastActionRound=3;
 assert.deepEqual(c.teams,before);assert.deepEqual(c.abilities.energy,energy);assert.deepEqual(c.abilities.ultimateEnergy,ultimate);
 while(viewLiveArenaSession(arena).nextHero)stepLiveArenaHero(arena);advanceLiveArenaRound(arena);
 assert.notEqual(stepLiveArenaHero(arena).result.event.action,'stun-skip');
});
for(const action of ['heal','shield'])test('new cast prevents direct '+action+' and consumes only one action',()=>{
 const c=make({hp:4000});cast(c);const before=structuredClone(c.teams),energy=[...c.abilities.energy];
 const out=applyServerHeroAction(c,{side:0,actorId:'actor',targetId:'actor',action,value:10});
 assert.equal(out.event.action,'stun-skip');assert.equal(out.event.stunScope,'action');
 delete before[0][0].commanderStunNextAction;before[0][0].lastActionRound=3;
 assert.deepEqual(c.teams,before);assert.deepEqual(c.abilities.energy,energy);
 assert.equal(applyServerHeroAction(c,{side:0,actorId:'actor',targetId:'actor',action,value:10}).event.action,action);
});
test('new cast also skips standalone hybrid special-heal resolution',()=>{
 const c=make({role:'support',hp:4000,active:{effect:'shield',supportHybrid:true,allyShieldRate:.15,healRate:.5}});cast(c);
 const before=structuredClone(c.teams);
 assert.equal(applyServerSpecialHeal(c,{side:0,actorId:'actor'}).event.action,'stun-skip');
 delete before[0][0].commanderStunNextAction;before[0][0].lastActionRound=3;
 assert.deepEqual(c.teams,before);
});
test('automatic regeneration still runs before a stunned scheduled action and does not consume it',()=>{
 const c=make({hp:4000,speed:100,passive:{effect:'regen',value:.05}});cast(c);
 const arena=createLiveArenaSession(c,{parity:true,roundPassives:true});
 assert.equal(c.teams[0][0].hp,4250);assert.equal(hasCommanderActionStun(c.teams[0][0]),true);
 assert.equal(stepLiveArenaHero(arena).result.event.action,'stun-skip');
 assert.equal(c.teams[0][0].hp,4250);assert.equal(hasCommanderActionStun(c.teams[0][0]),false);
});
test('terminal death clears both new and historical pending stun on survivors',()=>{
 const c=make();grantCommanderActionStun(c.teams[1][0]);grantCommanderStun(c.teams[1][1]);
 applyServerHeroAction(c,{side:1,actorId:'b',targetId:'actor',action:'attack',value:10000});
 // The stunned actor first loses its action, then its next action can end combat.
 assert.equal(c.finished,false);
 grantCommanderActionStun(c.teams[1][1]);grantCommanderStun(c.teams[1][1]);
 applyServerHeroAction(c,{side:1,actorId:'b',targetId:'actor',action:'attack',value:10000});
 assert.equal(c.finished,true);
 for(const unit of c.teams.flat()){assert.equal(unit.commanderStunNextAction,undefined);assert.equal(unit.commanderStunNextAttack,undefined);}
});
test('final round completion clears a new stun cast after its target has already acted',()=>{
 const c=make({speed:100},15),arena=createLiveArenaSession(c,{parity:true});
 assert.equal(stepLiveArenaHero(arena).result.event.actor,'actor');cast(c);
 assert.equal(hasCommanderActionStun(c.teams[0][0]),true);
 while(viewLiveArenaSession(arena).nextHero)stepLiveArenaHero(arena);
 assert.equal(c.finished,true);assert.equal(c.teams[0][0].commanderStunNextAction,undefined);
});
