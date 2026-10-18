import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateBattle} from '../battle-engine.js';
import {COMMANDERS,applyCommanderSupport,resolveCommander} from '../arena-commanders.js';
const team=(prefix)=>Array.from({length:5},(_,i)=>({id:prefix+i,name:prefix+i,power:65+i*4,role:['tank','fighter','energy','assassin','support'][i],lane:i<2?'front':'back',laneModifiers:{front:.05,back:-.05}}));
test('four distinct commanders',()=>{assert.equal(COMMANDERS.length,4);assert.equal(new Set(COMMANDERS.map(c=>c.id)).size,4)});
test('each commander modifies the intended attribute without adding fighters',()=>{
 for(const c of COMMANDERS){
  const units=[{role:'energy',attack:100,defense:100,maxHp:200,hp:200,speed:100},{role:'tank',attack:100,defense:100,maxHp:200,hp:200,speed:100}];
  applyCommanderSupport(units,c.id);assert.equal(units.length,2);
  if(c.id==='attack')assert.equal(units[0].attack,105);
  if(c.id==='defense')assert.equal(units[0].defense,105);
  if(c.id==='magic'){assert.equal(units[0].attack,105);assert.equal(units[1].attack,100)}
  if(c.id==='support'){assert.equal(units[0].maxHp,210);assert.equal(units[0].hp,210)}
 }
});
test('missing commander preserves team',()=>{const units=[{attack:100}];applyCommanderSupport(units,null);assert.equal(units[0].attack,100);assert.equal(resolveCommander('invalid'),null)});
test('no commander preserves deterministic battle result',()=>{
 for(let i=0;i<100;i++){
  const args={seed:'commander-legacy-'+i,remainingCredits:[i%8,3]};
  assert.deepEqual(simulateBattle(team('A'),team('B'),args),simulateBattle(team('A'),team('B'),{...args,commanders:[null,null]}));
 }
});
test('all commanders keep 5 versus 5 and 15 round limit',()=>{
 for(const c of COMMANDERS){
  const result=simulateBattle(team('A'),team('B'),{seed:'commander-'+c.id,commanders:[c.id,null]});
  assert.equal(result.teams[0].length,5);assert.equal(result.teams[1].length,5);
  assert.ok(result.rounds<=15);
 }
});
