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

for(const kind of ['defense','support','magic'])test(kind+' normal and ultimate scale at all milestone levels, on either seat and after casualties',()=>{
 const base={defense:[.08,.20],support:[.12,.30],magic:[.30,.40]}[kind];
 for(const level of [0,1,10,20,40])for(const side of [0,1])for(const survivors of [5,2,1])for(const [index,ability] of ['normal','ultimate'].entries()){
  const c=combat(kind,level);
  for(let i=survivors;i<5;i++){c.teams[side][i].hp=0;c.teams[1-side][i].hp=0;}
  const targets=c.teams[1-side].filter(u=>u.hp>0).slice(0,index?2:1).map(u=>u.id);
  const before=structuredClone(c.teams),rate=Number((base[index]*(1+level*.01)).toFixed(4));
  const result=cast(c,ability,side,kind==='magic'?targets:undefined),summary=result.events.at(-1);
  assert.equal(c.abilities.energy[side],index?0:60);
  assert.deepEqual(c.teams[side].filter(u=>u.hp===0),before[side].filter(u=>u.hp===0));
  if(kind==='magic'){
   assert.deepEqual(c.teams[side],before[side]);
   assert.equal(summary.value,targets.length);
   for(const u of c.teams[1-side])assert.equal(u.commanderWeaken,targets.includes(u.id)?rate:undefined);
   for(const impact of summary.impacts)assert.equal(impact.value,Number((rate*100).toFixed(1)));
  }else{
   assert.deepEqual(c.teams[1-side],before[1-side]);
   const expected=Math.round(survivors*(kind==='defense'?1000:600)*rate);
   assert.equal(summary.value,expected,`${kind}, ${ability}, level ${level}, ${survivors} survivors`);
   assert.equal(summary.impacts.reduce((sum,u)=>sum+u.value,0),expected);
   for(const u of c.teams[side])assert.ok(u.hp<=u.maxHp);
  }
 }
});

test('level-one defense ultimate keeps its extra shield points instead of dropping the remainder',()=>{
 const c=combat('defense',1);for(const u of c.teams[0]){u.maxHp=100;u.hp=50;u.shield=7;}
 const result=cast(c,'ultimate');
 assert.equal(result.events.at(-1).value,101);
 assert.deepEqual(c.teams[0].map(u=>u.shield),[28,27,27,27,27]);
});

test('support heals a one-point wound, but rejects healthy or fallen allies without charging energy',()=>{
 for(const level of [0,1,10,20,40])for(const ability of ['normal','ultimate']){
  const c=combat('support',level);for(const u of c.teams[0])u.hp=u.maxHp;
  c.teams[0][0].hp--;c.teams[0][4].hp=0;
  assert.equal(cast(c,ability).events.at(-1).value,1);
  assert.equal(c.teams[0][0].hp,1000);assert.equal(c.teams[0][4].hp,0);
  const healthy=combat('support',level);for(const u of healthy.teams[0])u.hp=u.maxHp;healthy.teams[0][4].hp=0;
  const before=structuredClone(healthy);
  assert.throws(()=>cast(healthy,ability),/yaralı kahraman yok/);
  assert.deepEqual(healthy,before);
 }
});

test('magic lowers actual enemy attack damage, scales both abilities and expires after three rounds',()=>{
 for(const level of [0,1,10,20,40])for(const ability of ['normal','ultimate']){
  const c=combat('magic',level),targets=ability==='ultimate'?['1-0','1-1']:['1-0'];
  cast(c,ability,0,targets);
  const rate=Number(((ability==='ultimate'?.4:.3)*(1+level*.01)).toFixed(4));
  for(let round=1;round<=4;round++){
   if(round>1)beginServerCombatRound(c,round);
   const hit=stepParityBasicAttack(c,{side:1,actorId:'1-0'});
   assert.equal(hit.event.rawDamage,Math.floor(100*(round<=3?1-rate:1)*.7));
  }
 }
});

test('legacy defense preserves the full shield budget too',()=>{
 const team=prefix=>Array.from({length:5},(_,i)=>({id:prefix+i,power:100,role:'tank',lane:'front',passive:{effect:'regen',value:1}}));
 const result=simulateBattle(team('a'),team('b'),{seed:'shield-scaling',maxRounds:7,commanders:[profile('defense',1),profile('defense')],commanderActions:[{side:0,round:7,ability:'ultimate'}]});
 const shield=result.log.find(e=>e.action==='commander-defense-ultimate');
 // Five identical-role heroes: 200 base HP with the capped 10% formation penalty.
 assert.equal(shield.value,182);
});
