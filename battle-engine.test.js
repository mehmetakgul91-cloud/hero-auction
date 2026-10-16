import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateBattle,fighterFromCard} from './battle-engine.js';
const team=(prefix,power)=>Array.from({length:5},(_,i)=>({id:prefix+i,name:prefix+i,power}));
test('deterministic simulation',()=>{const a=simulateBattle(team('a',70),team('b',65),{seed:'fixed'});const b=simulateBattle(team('a',70),team('b',65),{seed:'fixed'});assert.deepEqual(a,b)});
test('health never goes negative',()=>{const result=simulateBattle(team('a',99),team('b',20));assert.ok(result.teams.flat().every(x=>x.hp>=0&&x.hp<=x.maxHp))});
test('exactly five cards per team required',()=>assert.throws(()=>simulateBattle([],team('b',50))));
test('stats bounded',()=>{const f=fighterFromCard({id:'x',power:999});assert.ok(f.attack<=120&&f.maxHp<=250)});

test('named hero abilities emit observable shield and debuff events',()=>{
 const make=(id,active,power=80)=>({id,name:id,power,role:'fighter',lane:'front',active});
 // Test each ability separately so a particular hero cannot die before its turn.
 for(const effect of ['shield','sunder','weaken','haste']){
  const active={name:'Ability '+effect,effect,power:1.1};
  const teamA=Array.from({length:5},(_,i)=>make(effect+'-'+i,active));
  const teamB=Array.from({length:5},(_,i)=>make('opponent-'+i,null));
  const result=simulateBattle(teamA,teamB,{seed:'ability-event-'+effect,maxRounds:3});
  const action={shield:'shield',sunder:'armor-break',weaken:'weaken',haste:'haste'}[effect];
  assert.ok(result.log.some(e=>e.action===action),action+' event missing');
 }
});
