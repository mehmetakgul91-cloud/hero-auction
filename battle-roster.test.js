import test from 'node:test';
import assert from 'node:assert/strict';
import {battleRoster,battlePool,battleCard,simulateRosterBattle} from './battle-roster.js';
test('active roster contains only 50 original heroes',()=>{
 assert.equal(battleRoster.length,50);
 assert.equal(new Set(battleRoster.map(c=>c.id)).size,50);
 assert.ok(battleRoster.every(c=>c.universe==='original')); 
 assert.ok(!battleRoster.some(c=>/mehmet-akgul|hakan-artun/.test(c.id))); 
});
test('pool filters by universe and available catalogue',()=>{
 const catalogue=new Map(battleRoster.map(c=>[c.id,{...c,power:70}]));
 assert.equal(battlePool(catalogue).length,50);
 assert.equal(battlePool(catalogue,'original').length,50);
 assert.throws(()=>battlePool(catalogue,'marvel')); 
});
test('battle card preserves existing power and uses roster role',()=>{
 const card=battleCard({id:battleRoster[0].id,power:87});
 assert.equal(card.power,87);assert.equal(card.role,'tank');
});
test('rejects characters outside initial roster',()=>assert.throws(()=>battleCard({id:'pokemon:pikachu',power:65})));
test('roster battle is repeatable',()=>{
 const teamA=battleRoster.slice(0,5).map(c=>({...c,power:70}));
 const teamB=battleRoster.slice(5,10).map(c=>({...c,power:70}));
 assert.deepEqual(simulateRosterBattle(teamA,teamB,{seed:'match-1'}),simulateRosterBattle(teamA,teamB,{seed:'match-1'}));
});

 test('ready expansion has valid portraits, powers and supported battle skills',async()=>{
 const fs=await import('node:fs');
 const heroes=battleRoster.filter(h=>h.id.startsWith('original:expansion-'));
 assert.equal(heroes.length,35);
 for(const h of heroes){
 assert.ok(fs.existsSync(new URL('./public'+h.portrait,import.meta.url)),h.name);
 assert.ok(Number.isInteger(h.proposedPower)&&h.proposedPower>=1&&h.proposedPower<=100);
 assert.equal(h.rarity,h.proposedPower>=90?'legendary':h.proposedPower>=70?'rare':h.proposedPower>=50?'advanced':'common');
 assert.ok(['burst','pierce','splash','heal','shield','sunder','weaken','haste','drain','execute'].includes(h.active.effect));
 const teamA=Array.from({length:5},()=>({...h,power:h.proposedPower}));
 const teamB=battleRoster.slice(0,5).map(c=>({...c,power:75}));
 const result=simulateRosterBattle(teamA,teamB,{seed:h.id});
 assert.ok(result.teams.flat().every(u=>Number.isFinite(u.hp)&&u.hp>=0));
 }
 });

test('balanced original roster has ten heroes and three legendaries per role',()=>{
 const custom=new Set(['original:mehmet-akgul','original:hakan-artun']);
 const originals=battleRoster.filter(h=>h.universe==='original'&&!custom.has(h.id));
 assert.equal(originals.length,50);
 for(const role of ['tank','fighter','energy','assassin','support']){
  const group=originals.filter(h=>h.role===role);
  assert.equal(group.length,10,role);
  assert.equal(group.filter(h=>h.rarity==='legendary').length,3,role);
  assert.equal(group.filter(h=>h.proposedPower>=90).length,3,role+' auction rarity');
 }
 for(const h of originals){
  assert.equal(h.specialty,h.role,h.name);
  assert.equal(h.rarity,h.proposedPower>=90?'legendary':h.proposedPower>=70?'rare':h.proposedPower>=50?'advanced':'common',h.name);
  for(const lane of ['front','back']){
   assert.ok(Number.isFinite(h.laneModifiers[lane])&&Math.abs(h.laneModifiers[lane])<=.1,h.name);
   const card=battleCard({...h,power:h.proposedPower,lane});
   assert.equal(card.role,h.role);
   assert.deepEqual(card.laneModifiers,h.laneModifiers);
  }
 }
 assert.ok(!originals.some(h=>h.id==='original:expansion-09'));
 assert.equal(battleRoster.filter(h=>custom.has(h.id)).length,0);
});
