import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat,castLiveCommanderCombat,beginServerCombatRound} from '../commander-live-combat.js';
import {stepParityBasicAttack} from '../commander-parity-basic-attack.js';
import {simulateBattle} from '../battle-engine.js';

const profile=(commanderId,level=0)=>({commanderId,levels:{attack:0,defense:0,magic:0,support:0,[commanderId]:level}});
function combat(kind,level=0){
 const teams=[0,1].map(side=>Array.from({length:5},(_,i)=>({id:side+'-'+i,role:['fighter','assassin','tank','support','energy'][i],hp:400,maxHp:1000,attack:100,defense:100,shield:0,lane:'front',position:i})));
 return createLiveCommanderCombat({teams,commanders:[profile(kind,level),profile(kind,level)],abilities:createLiveCommanderAbilities({matchKey:'roles',energy:[100,100],now:0})});
}
const cast=(c,ability,side=0,targetIds)=>castLiveCommanderCombat(c,{side,ability,targetIds,requestId:'roles_'+ability,matchKey:'roles',now:2000});

for(const kind of ['defense','support','magic'])test(kind+' normal preserves its declared magnitude on either seat and after casualties',()=>{
 for(const level of [0,1,10,20,40])for(const side of [0,1])for(const survivors of [5,2,1]){
  const c=combat(kind,level);for(let i=survivors;i<5;i++){c.teams[side][i].hp=0;c.teams[1-side][i].hp=0;}
  const target=c.teams[1-side].find(u=>u.hp>0).id,before=structuredClone(c.teams);
  const result=cast(c,'normal',side,kind==='magic'?[target]:undefined),summary=result.events.at(-1);
  assert.equal(c.abilities.energy[side],kind==='magic'?40:60);assert.deepEqual(c.teams[side].filter(u=>u.hp===0),before[side].filter(u=>u.hp===0));
  if(kind==='magic'){
   assert.deepEqual(c.teams[side],before[side]);const main=level+5,area=Math.round(main*.25);assert.equal(summary.value,main+(survivors>1?area:0));
   for(const u of c.teams[1-side]){assert.equal(u.commanderStunNextAction,u.id===target?true:undefined);assert.equal(u.commanderWeaken,undefined);}
   assert.deepEqual(summary.impacts.filter(i=>i.kind==='stun'),[{target,kind:'stun',value:1,nextAction:true}]);assert.deepEqual(result.events.filter(e=>e.action==='commander-hit').map(e=>e.rawDamage),survivors>1?[main,area]:[main]);
  }else{
   assert.deepEqual(c.teams[1-side],before[1-side]);const expected=Math.round(level+(kind==='defense'?100*.2:100*.52*.05));
   assert.equal(summary.value,expected);assert.equal(summary.impacts.reduce((sum,u)=>sum+u.value,0),expected);for(const u of c.teams[side])assert.ok(u.hp<=u.maxHp);
  }
 }
});
test('defense ultimate preserves shield scaling plus one guard at every level and survivor count',()=>{
 for(const level of [0,1,10,20,40])for(const side of [0,1])for(const survivors of [5,2,1]){
  const c=combat('defense',level);for(let i=survivors;i<5;i++)c.teams[side][i].hp=0;const before=structuredClone(c.teams),rate=Number((.2*(1+level*.01)).toFixed(4));const result=cast(c,'ultimate',side,[side+'-0']),summary=result.events.at(-1),expected=Math.round(survivors*1000*rate);
  assert.equal(c.abilities.ultimateEnergy[side],15);assert.equal(summary.value,expected);assert.equal(summary.impacts.filter(u=>u.kind==='shield').reduce((sum,u)=>sum+u.value,0),expected);assert.equal(summary.impacts.filter(u=>u.kind==='guard').length,1);assert.deepEqual(c.teams[side].filter(u=>u.hp===0),before[side].filter(u=>u.hp===0));assert.deepEqual(c.teams[1-side],before[1-side]);assert.equal(c.teams[side][0].lastStandPersistent,true);assert.equal(c.teams[side][0].lastStandUntilRound,undefined);
 }
});
test('magic ultimate is a fixed cast-time attack snapshot, not a level-scaled enemy debuff',()=>{
 for(const level of [0,1,10,20,40])for(const side of [0,1]){
  const c=combat('magic',level),target=c.teams[side][0],before=structuredClone(c.teams);const result=cast(c,'ultimate',side,[target.id]);
  assert.equal(c.abilities.ultimateEnergy[side],0);assert.equal(result.events.at(-1).value,100);assert.equal(c.teams[side][0].attack,100);assert.equal(c.teams[side][0].arcaneSurgeBonusAttack,100);assert.equal(c.teams[side][0].arcaneSurgeUntilRound,3);assert.deepEqual(c.teams[1-side],before[1-side]);
 }
});
test('support ultimate revives one chosen casualty at fixed55 percent without level amplification',()=>{
 for(const level of [0,1,10,20,40])for(const side of [0,1])for(const survivors of [4,2,1]){
  const c=combat('support',level);for(let i=survivors;i<5;i++)c.teams[side][i].hp=0;const targetId=c.teams[side][4].id,before=structuredClone(c.teams);const result=cast(c,'ultimate',side,[targetId]);
  assert.equal(c.abilities.ultimateEnergy[side],10);assert.equal(result.events.at(-1).value,550);assert.equal(c.teams[side][4].hp,550);assert.equal(c.teams[side][4].shield,0);assert.equal(c.teams[side][4].canActFromRound,2);assert.equal(c.revivalUsed[side],true);assert.deepEqual(c.teams[1-side],before[1-side]);for(let i=0;i<4;i++)assert.deepEqual(c.teams[side][i],before[side][i]);
 }
});
test('level-one defense ultimate keeps its extra shield points instead of dropping the remainder',()=>{
 const c=combat('defense',1);for(const u of c.teams[0]){u.maxHp=100;u.hp=50;u.shield=7;}const result=cast(c,'ultimate',0,['0-0']);assert.equal(result.events.at(-1).value,101);assert.deepEqual(c.teams[0].map(u=>u.shield),[28,27,27,27,27]);
});
test('support normal heals a one-point wound, but rejects healthy/fallen-only targets without charging',()=>{
 for(const level of [0,1,10,20,40]){
  const c=combat('support',level);for(const u of c.teams[0])u.hp=u.maxHp;c.teams[0][0].hp--;c.teams[0][4].hp=0;
  assert.equal(cast(c,'normal').events.at(-1).value,1);assert.equal(c.teams[0][0].hp,1000);assert.equal(c.teams[0][4].hp,0);
  const healthy=combat('support',level);for(const u of healthy.teams[0])u.hp=u.maxHp;healthy.teams[0][4].hp=0;const before=structuredClone(healthy);assert.throws(()=>cast(healthy,'normal'),/yaralı kahraman yok/);assert.deepEqual(healthy,before);
 }
});
test('magic normal skips one attack at every level, without stacking level-based weakening',()=>{
 for(const level of [0,1,10,20,40]){
  const c=combat('magic',level);for(const u of c.teams[0])u.defense=0;cast(c,'normal',0,['1-0']);
  for(let round=1;round<=4;round++){
   if(round>1)beginServerCombatRound(c,round);
   const before=c.teams[0].map(u=>u.hp),hit=stepParityBasicAttack(c,{side:1,actorId:'1-0'});
   if(round===1){assert.equal(hit.event.action,'stun-skip');assert.equal(hit.event.value,0);assert.deepEqual(c.teams[0].map(u=>u.hp),before);}
   else assert.equal(hit.event.rawDamage,70);
   assert.equal(c.teams[1][0].commanderStunNextAction,undefined);
   assert.equal(c.teams[1][0].commanderWeaken,undefined);
  }
 }
});
test('magic ultimate doubles selected ally damage for three rounds at all levels then restores base',()=>{
 for(const level of [0,1,10,20,40]){
  const c=combat('magic',level);for(const u of c.teams[1])u.defense=0;cast(c,'ultimate',0,['0-0']);
  for(let round=1;round<=4;round++){if(round>1)beginServerCombatRound(c,round);const hit=stepParityBasicAttack(c,{side:0,actorId:'0-0'});assert.equal(hit.event.rawDamage,round<=3?140:70);assert.equal(c.teams[0][0].attack,100);}
 }
});
test('legacy defense preserves the full shield budget too',()=>{
 const team=prefix=>Array.from({length:5},(_,i)=>({id:prefix+i,power:100,role:'tank',lane:'front',passive:{effect:'regen',value:1}}));
 const result=simulateBattle(team('a'),team('b'),{seed:'shield-scaling',maxRounds:7,commanders:[profile('defense',1),profile('defense')],commanderActions:[{side:0,round:7,ability:'ultimate',targetIds:['a0']}]});
 assert.equal(result.log.find(e=>e.action==='commander-defense-ultimate').value,182);
});
