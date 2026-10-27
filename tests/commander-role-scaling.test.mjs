import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat,castLiveCommanderCombat,beginServerCombatRound} from '../commander-live-combat.js';
import {stepParityBasicAttack} from '../commander-parity-basic-attack.js';
import {simulateBattle} from '../battle-engine.js';

const profile=(commanderId,level=0)=>({commanderId,levels:{attack:0,defense:0,magic:0,support:0,[commanderId]:level}});
function combat(kind,level=0){
 const teams=[0,1].map(side=>Array.from({length:5},(_,i)=>({id:side+'-'+i,hp:400,maxHp:1000,attack:100,defense:0,shield:0,lane:'front',position:i})));
 return createLiveCommanderCombat({teams,commanders:[profile(kind,level),profile(kind,level)],abilities:createLiveCommanderAbilities({matchKey:'roles',energy:[100,100],now:0})});
}
const cast=(c,ability,side=0,targetIds)=>castLiveCommanderCombat(c,{side,ability,targetIds,requestId:'roles_'+ability,matchKey:'roles',now:2000});

for(const kind of ['defense','support','magic'])test(kind+' normal preserves its declared magnitude on either seat and after casualties',()=>{
 const base={defense:.08,support:.12,magic:.35}[kind];
 for(const level of [0,1,10,20,40])for(const side of [0,1])for(const survivors of [5,2,1]){
  const c=combat(kind,level);for(let i=survivors;i<5;i++){c.teams[side][i].hp=0;c.teams[1-side][i].hp=0;}
  const target=c.teams[1-side].find(u=>u.hp>0).id,before=structuredClone(c.teams),rate=Number((base*(1+level*.01)).toFixed(4));
  const result=cast(c,'normal',side,kind==='magic'?[target]:undefined),summary=result.events.at(-1);
  assert.equal(c.abilities.energy[side],60);assert.deepEqual(c.teams[side].filter(u=>u.hp===0),before[side].filter(u=>u.hp===0));
  if(kind==='magic'){
   assert.deepEqual(c.teams[side],before[side]);assert.equal(summary.value,1);
   for(const u of c.teams[1-side]){assert.equal(u.commanderStunNextAttack,u.id===target?true:undefined);assert.equal(u.commanderWeaken,undefined);}
   assert.deepEqual(summary.impacts,[{target,kind:'stun',value:1,nextAttack:true}]);
  }else{
   assert.deepEqual(c.teams[1-side],before[1-side]);const expected=Math.round(survivors*(kind==='defense'?1000:600)*rate);
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
test('support ultimate revives one chosen casualty at fixed40 percent without level amplification',()=>{
 for(const level of [0,1,10,20,40])for(const side of [0,1])for(const survivors of [4,2,1]){
  const c=combat('support',level);for(let i=survivors;i<5;i++)c.teams[side][i].hp=0;const targetId=c.teams[side][4].id,before=structuredClone(c.teams);const result=cast(c,'ultimate',side,[targetId]);
  assert.equal(c.abilities.ultimateEnergy[side],10);assert.equal(result.events.at(-1).value,400);assert.equal(c.teams[side][4].hp,400);assert.equal(c.teams[side][4].shield,0);assert.equal(c.teams[side][4].canActFromRound,2);assert.equal(c.revivalUsed[side],true);assert.deepEqual(c.teams[1-side],before[1-side]);for(let i=0;i<4;i++)assert.deepEqual(c.teams[side][i],before[side][i]);
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
  const c=combat('magic',level);cast(c,'normal',0,['1-0']);
  for(let round=1;round<=4;round++){
   if(round>1)beginServerCombatRound(c,round);
   const before=c.teams[0].map(u=>u.hp),hit=stepParityBasicAttack(c,{side:1,actorId:'1-0'});
   if(round===1){assert.equal(hit.event.action,'stun-skip');assert.equal(hit.event.value,0);assert.deepEqual(c.teams[0].map(u=>u.hp),before);}
   else assert.equal(hit.event.rawDamage,70);
   assert.equal(c.teams[1][0].commanderStunNextAttack,undefined);
   assert.equal(c.teams[1][0].commanderWeaken,undefined);
  }
 }
});
test('magic ultimate doubles selected ally damage for three rounds at all levels then restores base',()=>{
 for(const level of [0,1,10,20,40]){
  const c=combat('magic',level);cast(c,'ultimate',0,['0-0']);
  for(let round=1;round<=4;round++){if(round>1)beginServerCombatRound(c,round);const hit=stepParityBasicAttack(c,{side:0,actorId:'0-0'});assert.equal(hit.event.rawDamage,round<=3?140:70);assert.equal(c.teams[0][0].attack,100);}
 }
});
test('legacy defense preserves the full shield budget too',()=>{
 const team=prefix=>Array.from({length:5},(_,i)=>({id:prefix+i,power:100,role:'tank',lane:'front',passive:{effect:'regen',value:1}}));
 const result=simulateBattle(team('a'),team('b'),{seed:'shield-scaling',maxRounds:7,commanders:[profile('defense',1),profile('defense')],commanderActions:[{side:0,round:7,ability:'ultimate',targetIds:['a0']}]});
 assert.equal(result.log.find(e=>e.action==='commander-defense-ultimate').value,182);
});
