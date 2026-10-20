import test from 'node:test';
import assert from 'node:assert/strict';
import {battleRoster,battlePool,battleCard,simulateRosterBattle} from './battle-roster.js';
test('expanded roster preserves 50 classic heroes and adds original heroes',()=>{
 assert.equal(battleRoster.length,103);
 assert.equal(new Set(battleRoster.map(c=>c.id)).size,103);
 assert.equal(battleRoster.filter(c=>c.universe==='marvel').length,28);
 assert.equal(battleRoster.filter(c=>c.universe==='dc').length,22);
});
test('pool filters by universe and available catalogue',()=>{
 const catalogue=new Map(battleRoster.map(c=>[c.id,{...c,power:70}]));
 assert.equal(battlePool(catalogue).length,103);
 assert.equal(battlePool(catalogue,'dc').length,22);
 assert.equal(battlePool(catalogue,'marvel').length,28);
});
test('battle card preserves existing power and uses roster role',()=>{
 const card=battleCard({id:'marvel:hulk',power:87});
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
 assert.equal(heroes.length,36);
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
