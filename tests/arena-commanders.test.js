import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateBattle} from '../battle-engine.js';
import {COMMANDERS,applyCommanderSupport,resolveCommander,createCommanderProfile} from '../arena-commanders.js';
const team=prefix=>Array.from({length:5},(_,i)=>({id:prefix+i,name:prefix+i,power:65+i*4,role:['tank','fighter','energy','assassin','support'][i],lane:i<2?'front':'back',laneModifiers:{front:.05,back:-.05}}));
test('four distinct commanders',()=>{assert.equal(COMMANDERS.length,4);assert.equal(new Set(COMMANDERS.map(c=>c.id)).size,4)});
test('unupgraded commander has no free bonus',()=>{
 for(const c of COMMANDERS){
  const units=['energy','tank','fighter','assassin','support'].map(role=>({role,attack:100,defense:100,maxHp:200,hp:200,speed:100}));
  applyCommanderSupport(units,createCommanderProfile(c.id));
  for(const u of units)assert.deepEqual([u.attack,u.defense,u.maxHp,u.hp,u.speed],[100,100,200,200,100]);
 }
});
test('no commander preserves deterministic battle result',()=>{
 for(let i=0;i<100;i++){
  const args={seed:'commander-legacy-'+i,remainingCredits:[i%8,3]};
  assert.deepEqual(simulateBattle(team('A'),team('B'),args),simulateBattle(team('A'),team('B'),{...args,commanders:[null,null]}));
 }
});
test('commander profile keeps 5 versus 5 and maximum 15 rounds',()=>{
 const profile={commanderId:'magic',levels:{attack:1,defense:1,magic:20,support:1}};
 const result=simulateBattle(team('A'),team('B'),{seed:'commander-classes',commanders:[profile,null]});
 assert.equal(result.teams[0].length,5);assert.equal(result.teams[1].length,5);
 assert.ok(result.rounds<=15);
 assert.equal(resolveCommander('speed'),null);
});
