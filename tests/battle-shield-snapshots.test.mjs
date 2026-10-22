import test from 'node:test';
import assert from 'node:assert/strict';
import {createCommanderProfile} from '../arena-commanders.js';
import {simulateBattle} from '../battle-engine.js';
const cards=(side,role='fighter')=>Array.from({length:5},(_,i)=>({id:side+i,power:70,role,lane:i<2?'front':'back',active:role==='tank'?{effect:'shield',name:'Shield'}:null}));
test('bot replay carries authoritative initial and event shields including final tank reinforcement',()=>{
 const result=simulateBattle(cards('a','tank'),cards('b','tank'),{maxRounds:3,seed:'shield-snapshots'});
 assert.deepEqual(result.initialShields,[[0,0,0,0,0],[0,0,0,0,0]]);
 for(const event of result.log){
  assert.equal(event.shieldSnapshot.length,2);
  for(const team of event.shieldSnapshot){assert.equal(team.length,5);assert.ok(team.every(n=>Number.isInteger(n)&&n>=0));}
 }
 assert.ok(result.log.some(event=>event.shieldSnapshot.flat().some(n=>n>0)));
 assert.deepEqual(result.log.at(-1).shieldSnapshot,result.teams.map(team=>team.map(u=>u.shield)));
 const before=structuredClone(result.log[0].shieldSnapshot);
 result.teams[0][0].shield=9999;
 assert.deepEqual(result.log[0].shieldSnapshot,before,'snapshots do not alias mutable combat state');
});
test('commander shield and absorption snapshots reflect exact server state without granting a cap',()=>{
 const result=simulateBattle(cards('a','tank'),cards('b'),{maxRounds:4,seed:'commander-shield',commanders:[createCommanderProfile('defense'),createCommanderProfile('defense')],commanderActions:[{round:4,side:0,ability:'normal'}]});
 const index=result.log.findIndex(event=>event.action==='commander-defense-normal');
 assert.ok(index>=0);
 const cast=result.log[index],previous=result.log[index-1];
 const gain=cast.shieldSnapshot[0].reduce((sum,n,i)=>sum+n-previous.shieldSnapshot[0][i],0);
 assert.equal(gain,cast.value);
 assert.ok(gain>0);
 assert.ok(result.log.some(event=>event.absorbed>0));
 assert.deepEqual(result.log.at(-1).shieldSnapshot,result.teams.map(team=>team.map(u=>u.shield)));
});
test('hero shield/heal/splash events carry an atomic action identity, unlike round and commander events',()=>{
 const result=simulateBattle(cards('a','tank'),cards('b','tank'),{maxRounds:3,seed:'shield-actions'});
 const shield=result.log.find(e=>e.action==='shield');assert.ok(shield?.actionId);
 const action=result.log.filter(e=>e.actionId===shield.actionId);
 assert.ok(action.some(e=>e.damageType==='special'));
 assert.ok(action.every(e=>e.actor===shield.actor&&e.round===shield.round));
});
