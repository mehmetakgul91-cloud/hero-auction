import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateShieldAbsorption} from '../battle-shield-absorption.js';
import {simulateBattle} from '../battle-engine.js';
import {createCommanderProfile} from '../arena-commanders.js';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat,applyServerHeroAction} from '../commander-live-combat.js';
import {applyLiveCommanderEffect} from '../commander-live-effects.js';
import {applyServerSplashAction} from '../commander-live-splash.js';
import {stepParityShieldDrain} from '../commander-parity-shield-drain.js';
import {stepParityDamageSpecial} from '../commander-parity-damage-special.js';
import {stepParityStatSpecial} from '../commander-parity-stat-special.js';
import {stepParityBasicAttack} from '../commander-parity-basic-attack.js';
import {stepParityExecute} from '../commander-parity-execute.js';
import {applyBattleLogHeroEvent} from '../commander-battle-log-bridge.js';

const hero=(id,extra={})=>({id,hp:1000,maxHp:1000,attack:100,defense:0,speed:50,shield:0,role:'fighter',lane:'front',position:0,...extra});
function combat({shield=50,hp=1000,round=1,actor={}}={}){
 return createLiveCommanderCombat({round,abilities:createLiveCommanderAbilities({matchKey:'shield:rule',energy:[0,0],now:1000}),teams:[[hero('a',actor)],[hero('b',{shield,hp})]],commanders:[{commanderId:'attack'},{commanderId:'defense'}]});
}
for(const [shield,damage,absorbed] of [[50,50,35],[20,50,20],[0,50,0],[100,1,0],[100,2,1],[100,3,2],[100,5,3],[100,90,63],[100,2.9,2],[1.5,50,1.5],[1000000,1000000,700000],[Number.MAX_VALUE,Number.MAX_VALUE,Math.floor(Number.MAX_VALUE*.7)]]){
 test(`shield ${shield} absorbs ${absorbed} from ${damage}`,()=>assert.equal(calculateShieldAbsorption(shield,damage),absorbed));
}
test('non-finite and negative inputs cannot create shield absorption',()=>{
 for(const invalid of [-10,NaN,Infinity,-Infinity,undefined,null,'50']){
  assert.equal(calculateShieldAbsorption(invalid,50),0);
  assert.equal(calculateShieldAbsorption(50,invalid),0);
 }
});
for(const [shield,absorbed,hpLoss,left] of [[50,35,15,15],[20,20,30,0],[0,0,50,0]]){
 test(`server attack conserves damage with ${shield} shield`,()=>{
  const c=combat({shield});
  const {event}=applyServerHeroAction(c,{side:0,actorId:'a',targetId:'b',value:50});
  assert.equal(event.absorbed,absorbed);assert.equal(event.value,hpLoss);
  assert.equal(c.teams[1][0].hp,1000-hpLoss);assert.equal(c.teams[1][0].shield,left);
  assert.equal(c.teams[0][0].damage,hpLoss);assert.equal(event.value+event.absorbed,50);
 });
}
test('lethal leakage preserves remaining shield and credits one casualty without overkill damage',()=>{
 const c=combat({hp:10});
 const {event}=applyServerHeroAction(c,{side:0,actorId:'a',targetId:'b',value:50});
 assert.equal(event.absorbed,35);assert.equal(event.value,10);
 assert.equal(c.teams[1][0].hp,0);assert.equal(c.teams[1][0].shield,15);
 assert.equal(c.teams[0][0].damage,10);assert.equal(c.teams[0][0].kills,1);
 assert.equal(c.abilities.energy[1],10);assert.equal(c.finished,true);
});
test('shield gains are uncapped and later hits apply the rule once',()=>{
 const c=combat();
 applyServerHeroAction(c,{side:1,actorId:'b',targetId:'b',action:'shield',value:10000});
 assert.equal(c.teams[1][0].shield,10050);
 const first=applyServerHeroAction(c,{side:0,actorId:'a',targetId:'b',value:50});
 const second=applyServerHeroAction(c,{side:0,actorId:'a',targetId:'b',value:50});
 assert.equal(first.event.value,15);assert.equal(second.event.value,15);
 assert.equal(c.teams[1][0].shield,9980);assert.equal(c.teams[1][0].hp,970);
});
test('commander area damage independently splits each shielded target',()=>{
 const c=combat({shield:10000});c.teams[1].push(hero('b2',{shield:10000}));
 const result=applyLiveCommanderEffect(c.teams,{side:0,ability:'normal',commanderId:'attack',attackBasis:500});
 const hits=result.log.filter(e=>e.action==='commander-hit');assert.equal(hits.length,2);
 for(const hit of hits){assert.equal(hit.absorbed,Math.floor(hit.rawDamage*7/10));assert.equal(hit.value,hit.rawDamage-hit.absorbed);}
});
test('standalone splash uses 70 percent after the splash multiplier, not twice',()=>{
 const c=combat({shield:10000,actor:{role:'energy'}});c.teams[1].push(hero('b2',{shield:10000}));
 const {events}=applyServerSplashAction(c,{side:0,actorId:'a',primaryTargetId:'b',primaryRaw:100});
 assert.equal(events.length,1);assert.equal(events[0].rawDamage,15);
 assert.equal(events[0].absorbed,10);assert.equal(events[0].value,5);
 assert.equal(c.teams[1][0].hp,1000);assert.equal(c.teams[1][1].shield,9990);
});
for(const [effect,step] of [['shield',stepParityShieldDrain],['drain',stepParityShieldDrain],['burst',stepParityDamageSpecial],['pierce',stepParityDamageSpecial],['splash',stepParityDamageSpecial],['sunder',stepParityStatSpecial],['weaken',stepParityStatSpecial],['haste',stepParityStatSpecial],['execute',stepParityExecute]]){
 test(`${effect} special uses shared shield rule and preserves HP damage statistics`,()=>{
  const c=combat({shield:10000,round:3,actor:{hp:500,active:{effect,name:'Skill',power:1}}});
  const result=step(c,{side:0,actorId:'a'});const hit=(result.events??[result.event]).find(e=>e.damageType==='special');
  assert.ok(hit);assert.equal(hit.absorbed,Math.floor(hit.rawDamage*7/10));assert.equal(hit.value,hit.rawDamage-hit.absorbed);
  assert.equal(c.teams[0][0].damage,hit.value);assert.equal(c.teams[1][0].hp,1000-hit.value);
  if(effect==='drain')assert.equal(c.teams[0][0].hp,500+Math.floor(hit.value*.15));
 });
}
test('thorns passive continues granting shield without changing incoming split',()=>{
 const c=combat({actor:{defense:50,passive:{effect:'thorns',value:.2}}});
 const result=applyServerHeroAction(c,{side:0,actorId:'a',targetId:'b',value:50,applyThorns:true});
 assert.equal(result.event.value,15);assert.equal(result.event.absorbed,35);assert.equal(c.teams[0][0].shield,10);
});
test('trusted log bridge validates new split and does not absorb a second time',()=>{
 const c=combat();
 applyBattleLogHeroEvent(c,{round:1,side:0,actor:'a',target:'b',action:'attack',damageType:'normal',rawDamage:50,absorbed:35,value:15});
 assert.equal(c.teams[1][0].hp,985);assert.equal(c.teams[1][0].shield,15);
 const before=structuredClone(c.teams);
 assert.throws(()=>applyBattleLogHeroEvent(c,{round:1,side:0,actor:'a',target:'b',action:'attack',rawDamage:10,absorbed:10,value:0}),/diverged/);
 assert.deepEqual(c.teams,before);
});
test('automatic engine uses rule for shielded normal, special and commander hits',()=>{
 const team=p=>Array.from({length:5},(_,i)=>({id:p+i,power:70,role:'tank',lane:'front',active:{effect:'shield',name:'Shield',power:1},passive:{effect:'thorns',value:.2}}));
 const result=simulateBattle(team('a'),team('b'),{seed:'shield-rule',maxRounds:9,commanders:[createCommanderProfile('defense'),createCommanderProfile('attack')],commanderActions:[{round:5,side:0,ability:'normal'},{round:5,side:1,ability:'normal'}]});
 const hits=result.log.filter(e=>e.rawDamage!==undefined);
 assert.ok(hits.some(e=>e.absorbed>0));assert.ok(hits.some(e=>e.damageType==='commander'));
 for(const hit of hits){assert.ok(hit.absorbed<=Math.floor(hit.rawDamage*7/10));assert.ok(hit.value>=0);assert.ok(hit.value+hit.absorbed<=hit.rawDamage);}
 assert.ok(result.teams.flat().every(u=>u.hp>=0&&u.shield>=0));
});
test('headshot keeps its existing guaranteed kill without bypassing shield accounting',()=>{
 for(const shield of [0,50,10000]){
  const c=combat({shield,round:3,actor:{active:{effect:'headshot',name:'Headshot'}}});
  const {events}=stepParityDamageSpecial(c,{side:0,actorId:'a'});
  const hit=events.find(e=>e.damageType==='special');
  assert.equal(hit.rawDamage,1000+shield);
  assert.equal(hit.absorbed,Math.min(shield,Math.floor(hit.rawDamage*7/10)));
  assert.equal(hit.value,1000);assert.equal(c.teams[1][0].hp,0);assert.equal(c.teams[0][0].kills,1);
 }
});
test('whole-point absorption matches exact integer 7/10 arithmetic at rounding boundaries',()=>{
 for(let damage=0;damage<=10000;damage++){
  const exact=Number(BigInt(damage)*7n/10n);
  assert.equal(calculateShieldAbsorption(10000,damage),exact,`damage=${damage}`);
 }
});

test('incremental live basic damage applies mitigation and critical roll before shield split',()=>{
 for(const [critical,weakened,raw,absorbed] of [[false,0,35,24],[true,0,45,31],[false,.3,24,16]]){
  const c=combat({shield:50,actor:{commanderWeaken:weakened,commanderWeakenUntilRound:3}});
  c.teams[1][0].defense=100;
  const {event}=stepParityBasicAttack(c,{side:0,actorId:'a',critical});
  assert.equal(event.rawDamage,raw);assert.equal(event.absorbed,absorbed);assert.equal(event.value,raw-absorbed);
  assert.equal(c.teams[1][0].hp,1000-raw+absorbed);
 }
});
