import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat,castLiveCommanderCombat} from '../commander-live-combat.js';
import {simulateBattle} from '../battle-engine.js';

const profile=level=>({commanderId:'attack',levels:{attack:level,defense:0,magic:0,support:0}});
const teams=()=>[0,1].map(side=>Array.from({length:5},(_,i)=>({id:side+'-'+i,hp:1000,maxHp:1000,attack:50,shield:0})));
function combat(level=0){return createLiveCommanderCombat({abilities:createLiveCommanderAbilities({matchKey:'scaling',energy:[100,100],now:0}),teams:teams(),commanders:[profile(level),profile(level)]});}
function cast(state,ability,side=0){return castLiveCommanderCombat(state,{side,ability,requestId:'cast_'+ability,matchKey:'scaling',now:1000});}
const total=result=>result.events.filter(e=>e.action==='commander-hit').reduce((n,e)=>n+e.rawDamage,0);

test('focus ultimate marks surviving allies without immediate damage or an extra attack',()=>{
 const late=combat();for(let i=2;i<5;i++)late.teams[0][i].hp=0;
 const before=structuredClone(late.teams), result=cast(late,'ultimate');
 assert.equal(total(result),0);assert.equal(late.abilities.energy[0],25);
 assert.deepEqual(late.teams.map(t=>t.map(u=>u.hp)),before.map(t=>t.map(u=>u.hp)));
 assert.equal(result.events.at(-1).value,2);
 assert.ok(late.teams[0].slice(0,2).every(u=>u.commanderFocusTargetId==='1-0'));
 assert.ok(late.teams[0].slice(2).every(u=>u.commanderFocusTargetId===undefined));
});
test('normal damage still scales with initial power after casualties on both sides',()=>{
 for(const [level,expected] of [[0,30],[1,30],[10,33],[20,36],[40,42]]){
  for(const survivors of [5,2,1])for(const side of [0,1]){
   const state=combat(level);for(let i=survivors;i<5;i++)state.teams[side][i].hp=0;
   const result=cast(state,'normal',side);assert.equal(total(result),expected);
   assert.equal(result.events.at(-1).value,expected);
  }
 }
});
test('attack basis is fixed at battle start, not read from later buffs or cast payloads',()=>{
 const state=combat(10);state.teams[0][0].attack=5000;
 const result=castLiveCommanderCombat(state,{side:0,ability:'normal',requestId:'untrusted_base',matchKey:'scaling',now:1000,attackBasis:99999,commanderProfile:profile(40)});
 assert.equal(total(result),33);
});

test('normal commander damage retains shield and dead-target accounting',()=>{
 const state=combat(1);state.teams[1][0].shield=100;state.teams[1][1].hp=2;state.teams[1][4].hp=0;
 const result=cast(state,'normal'),hits=result.events.filter(e=>e.action==='commander-hit');
 assert.equal(total(result),30);assert.equal(hits.length,4);
 assert.equal(state.teams[1][0].hp,997);assert.equal(state.teams[1][0].shield,95);
 assert.equal(state.teams[1][1].hp,0);assert.equal(state.teams[1][4].hp,0);
 assert.equal(result.events.at(-1).value,19);
});
test('legacy normal preserves damage budget while ultimate only grants focus',()=>{
 const durable=prefix=>Array.from({length:5},(_,i)=>({id:prefix+i,power:100,role:'tank',lane:'front',passive:{effect:'regen',value:1}}));
 for(const [ability,expected] of [['normal',59],['ultimate',0]]){
  const result=simulateBattle(durable('a'),durable('b'),{seed:'attack-level-scaling',maxRounds:7,commanders:[profile(10),profile(0)],commanderActions:[{side:0,round:7,ability}]});
  assert.equal(result.log.filter(e=>e.action==='commander-hit').reduce((n,e)=>n+e.rawDamage,0),expected);
  if(ability==='ultimate')assert.ok(result.log.some(e=>e.action==='commander-attack-ultimate'&&e.value>0));
 }
});
