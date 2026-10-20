import test from 'node:test';
import assert from 'node:assert/strict';
import {applyLiveCommanderEffect} from '../commander-live-effects.js';
const team=()=>Array.from({length:5},(_,i)=>({id:String(i),hp:100,maxHp:100,attack:50,shield:0}));
const teams=()=>[team(),team()];
test('attack deals damage to enemy only, preserving input',()=>{
 const initial=teams();
 const out=applyLiveCommanderEffect(initial,{side:0,ability:'normal',commanderId:'attack'});
 assert.ok(out.teams[1].every(u=>u.hp<100));
 assert.ok(out.teams[0].every(u=>u.hp===100));
 assert.equal(initial[1][0].hp,100);
 assert.ok(out.log.some(e=>e.action==='commander-hit'));
});
test('defense adds shields only to allies',()=>{
 const out=applyLiveCommanderEffect(teams(),{side:0,ability:'ultimate',commanderId:'defense'});
 assert.ok(out.teams[0].every(u=>u.shield>0));
 assert.ok(out.teams[1].every(u=>u.shield===0));
});
test('support heals injured units without exceeding max HP',()=>{
 const input=teams();input[0][0].hp=20;input[0][1].hp=50;
 const out=applyLiveCommanderEffect(input,{side:0,ability:'ultimate',commanderId:'support'});
 assert.ok(out.teams[0][0].hp>20);
 assert.ok(out.teams[0].every(u=>u.hp<=u.maxHp));
});
test('magic weakens at most two opponents',()=>{
 const out=applyLiveCommanderEffect(teams(),{side:0,ability:'ultimate',commanderId:'magic'});
 assert.equal(out.teams[1].filter(u=>u.commanderWeaken>0).length,2);
});
test('rejects invalid commands and completed battles',()=>{
 assert.throws(()=>applyLiveCommanderEffect(teams(),{side:0,ability:'pass',commanderId:'attack'}),/Invalid ability/);
 const input=teams();for(const u of input[1])u.hp=0;
 assert.throws(()=>applyLiveCommanderEffect(input,{side:0,ability:'normal',commanderId:'attack'}),/finished/);
});
