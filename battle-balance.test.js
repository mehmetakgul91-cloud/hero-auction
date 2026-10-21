import test from 'node:test';
import assert from 'node:assert/strict';
import {battleRoster,simulateRosterBattle} from './battle-roster.js';
const cards=battleRoster.map((c,i)=>({...c,power:55+(i%40)}));
test('all 50 heroes define named active and passive abilities',()=>{
 assert.equal(cards.length,50);
 assert.ok(cards.every(c=>typeof c.active.name==='string'&&c.active.name.length>0));
 assert.ok(cards.every(c=>typeof c.passive.name==='string'&&c.passive.name.length>0));
});
test('1000 deterministic roster battles maintain health and winner invariants',()=>{
 for(let i=0;i<1000;i++){
  const a=Array.from({length:5},(_,j)=>cards[(i+j*3)%50]);
  const b=Array.from({length:5},(_,j)=>cards[(i+11+j*7)%50]);
  const r=simulateRosterBattle(a,b,{seed:'balance-'+i});
  assert.ok(r.rounds>=1&&r.rounds<=15);
  assert.ok([0,1,null].includes(r.winner));
  assert.ok(r.teams.flat().every(u=>u.hp>=0&&u.hp<=u.maxHp&&u.damage>=0&&u.healing>=0));
 }
});
test('named skills are visible in battle log',()=>{
 const r=simulateRosterBattle(cards.slice(0,5),cards.slice(10,15),{seed:'skills'});
 assert.ok(r.log.some(event=>cards.some(c=>c.active.name===event.action)));
});
test('round limit is validated',()=>{
 assert.throws(()=>simulateRosterBattle(cards.slice(0,5),cards.slice(5,10),{maxRounds:-1}));
});
