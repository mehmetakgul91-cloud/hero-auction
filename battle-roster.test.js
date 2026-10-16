import test from 'node:test';
import assert from 'node:assert/strict';
import {battleRoster,battlePool,battleCard,simulateRosterBattle} from './battle-roster.js';
test('initial roster contains 50 unique characters',()=>{
 assert.equal(battleRoster.length,50);
 assert.equal(new Set(battleRoster.map(c=>c.id)).size,50);
 assert.equal(battleRoster.filter(c=>c.universe==='marvel').length,28);
 assert.equal(battleRoster.filter(c=>c.universe==='dc').length,22);
});
test('pool filters by universe and available catalogue',()=>{
 const catalogue=new Map(battleRoster.map(c=>[c.id,{...c,power:70}]));
 assert.equal(battlePool(catalogue).length,50);
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
