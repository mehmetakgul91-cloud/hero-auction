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

test('waiting for ultimate does not erase its advantage when three allies die',()=>{
 const normal=cast(combat(),'normal');
 const late=combat();for(let i=2;i<5;i++)late.teams[0][i].hp=0;
 const ultimate=cast(late,'ultimate');
 assert.equal(total(normal),30);
 assert.equal(total(ultimate),75);
 assert.equal(late.abilities.energy[0],0);
 assert.deepEqual(late.teams[0].map(u=>u.hp),[1000,1000,0,0,0]);
});

test('normal and ultimate both scale at realistic team power, including after casualties',()=>{
 for(const [level,normalDamage,ultimateDamage] of [[0,30,75],[1,30,76],[10,33,83],[20,36,90],[40,42,105]]){
  for(const survivors of [5,2,1])for(const side of [0,1]){
   for(const [ability,expected] of [['normal',normalDamage],['ultimate',ultimateDamage]]){
    const state=combat(level);for(let i=survivors;i<5;i++)state.teams[side][i].hp=0;
    const result=cast(state,ability,side);
    assert.equal(total(result),expected,`${ability}, level ${level}, ${survivors} survivors, side ${side}`);
    assert.equal(result.events.at(-1).value,expected);
   }
  }
 }
});

test('splitting ultimate damage keeps every point of the level-one increase',()=>{
 const result=cast(combat(1),'ultimate');
 assert.deepEqual(result.events.filter(e=>e.action==='commander-hit').map(e=>e.rawDamage),[16,15,15,15,15]);
 assert.equal(result.events.at(-1).value,76);
});

test('attack basis is fixed at battle start, not read from later buffs or cast payloads',()=>{
 const state=combat(10);state.teams[0][0].attack=5000;
 const result=castLiveCommanderCombat(state,{side:0,ability:'ultimate',requestId:'untrusted_base',matchKey:'scaling',now:1000,attackBasis:99999,commanderProfile:profile(40)});
 assert.equal(total(result),83);
});

test('stronger raw ultimate still respects shields, remaining health and dead targets',()=>{
 const state=combat(1);state.teams[1][0].shield=100;state.teams[1][1].hp=2;state.teams[1][4].hp=0;
 const result=cast(state,'ultimate'),hits=result.events.filter(e=>e.action==='commander-hit');
 assert.equal(total(result),76);
 assert.equal(hits.length,4);
 assert.equal(state.teams[1][0].hp,994);assert.equal(state.teams[1][0].shield,87);
 assert.equal(state.teams[1][1].hp,0);assert.equal(state.teams[1][4].hp,0);
 assert.equal(result.events.at(-1).value,46);
});

test('legacy battle uses the same complete damage budget for normal and ultimate',()=>{
 const durable=prefix=>Array.from({length:5},(_,i)=>({id:prefix+i,power:100,role:'tank',lane:'front',passive:{effect:'regen',value:1}}));
 for(const [ability,expected] of [['normal',59],['ultimate',149]]){
  const result=simulateBattle(durable('a'),durable('b'),{seed:'attack-level-scaling',maxRounds:7,commanders:[profile(10),profile(0)],commanderActions:[{side:0,round:7,ability}]});
  assert.equal(result.log.filter(e=>e.action==='commander-hit').reduce((n,e)=>n+e.rawDamage,0),expected);
 }
});
