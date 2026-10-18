import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateBattle} from '../battle-engine.js';
import {COMMANDERS,applyCommanderSupport,resolveCommander} from '../arena-commanders.js';
const team=(prefix)=>Array.from({length:5},(_,i)=>({id:prefix+i,name:prefix+i,power:65+i*4,role:['tank','fighter','energy','assassin','support'][i],lane:i<2?'front':'back',laneModifiers:{front:.05,back:-.05}}));
test('commander roster contains four unique support commanders',()=>{assert.equal(COMMANDERS.length,4);assert.equal(new Set(COMMANDERS.map(c=>c.id)).size,4)});
test('support changes only selected statistic and keeps exactly five heroes',()=>{
 for(const commander of COMMANDERS){
  const units=Array.from({length:5},(_,i)=>({id:String(i),attack:100,defense:100,maxHp:200,hp:200,speed:100}));
  applyCommanderSupport(units,commander.id);
  assert.equal(units.length,5);
  const stat=commander.bonus.stat;
  assert.equal(units[0][stat],Math.round((stat==='maxHp'?200:100)*1.05));
  assert.equal(units[0].hp,stat==='maxHp'?210:200);
 }
});
test('unknown or missing commander does not modify heroes',()=>{const units=[{attack:100}];applyCommanderSupport(units,'invalid');assert.equal(units[0].attack,100);assert.equal(resolveCommander('invalid'),null)});
test('no commander preserves legacy deterministic battle outcome',()=>{
 for(let i=0;i<100;i++){
  const args={seed:'commander-legacy-'+i,remainingCredits:[i%8,3]};
  const old=simulateBattle(team('A'),team('B'),args);
  const noCommander=simulateBattle(team('A'),team('B'),{...args,commanders:[null,null]});
  assert.deepEqual(old,noCommander);
 }
});
test('each support commander changes the actual battle stat for five heroes',()=>{
 const baseline=simulateBattle(team('A'),team('B'),{seed:'commander-stats'});
 for(const c of COMMANDERS){
  const withCommander=simulateBattle(team('A'),team('B'),{seed:'commander-stats',commanders:[c.id,null]});
  assert.equal(withCommander.teams[0].length,5);
  assert.equal(withCommander.teams[1].length,5);
  assert.deepEqual(withCommander.teams[1],baseline.teams[1]);
  for(let i=0;i<5;i++){
   const stat=c.bonus.stat;
   assert.equal(withCommander.teams[0][i][stat],Math.round(baseline.teams[0][i][stat]*1.05));
  }
 }
});
