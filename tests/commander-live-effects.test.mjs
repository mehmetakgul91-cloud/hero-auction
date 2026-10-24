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
 const out=applyLiveCommanderEffect(teams(),{side:0,ability:'ultimate',commanderId:'magic',targetIds:['0','1']});
 assert.equal(out.teams[1].filter(u=>u.commanderWeaken>0).length,2);
});
test('rejects invalid commands and completed battles',()=>{
 assert.throws(()=>applyLiveCommanderEffect(teams(),{side:0,ability:'pass',commanderId:'attack'}),/Invalid ability/);
 const input=teams();for(const u of input[1])u.hp=0;
 assert.throws(()=>applyLiveCommanderEffect(input,{side:0,ability:'normal',commanderId:'attack'}),/finished/);
});

test('impact records report actual shield absorption and capped health loss',()=>{
 const input=teams();input[1][0].shield=50;input[1][1].hp=2;
 const out=applyLiveCommanderEffect(input,{side:0,ability:'normal',commanderId:'attack'}),impacts=out.log.at(-1).impacts;
 assert.deepEqual(impacts[0],{target:'0',kind:'damage',value:2,absorbed:4});
 assert.deepEqual(impacts[1],{target:'1',kind:'damage',value:2,absorbed:0});
 for(const effect of impacts)assert.equal(effect.value,input[1][Number(effect.target)].hp-out.teams[1][Number(effect.target)].hp);
});
test('healing impact records only the injured recipients actually healed',()=>{
 const input=teams();input[0][0].hp=20;input[0][1].hp=50;
 const out=applyLiveCommanderEffect(input,{side:0,ability:'ultimate',commanderId:'support'});
 assert.deepEqual(out.log.at(-1).impacts,[{target:'0',kind:'heal',value:39}]);
 assert.throws(()=>applyLiveCommanderEffect(teams(),{side:0,ability:'normal',commanderId:'support'}),/yaralı kahraman yok/);
});
test('shield impact records exclude dead heroes and report gained shield, not total shield',()=>{
 const input=teams();input[1][0].hp=0;input[1][1].shield=100;
 const out=applyLiveCommanderEffect(input,{side:1,ability:'ultimate',commanderId:'defense'});
 assert.equal(out.log.at(-1).impacts.length,4);
 for(const impact of out.log.at(-1).impacts){assert.equal(impact.kind,'shield');assert.equal(impact.value,20);assert.notEqual(impact.target,'0');}
 assert.equal(out.teams[1][1].shield,120);
});
test('magic impact records only chosen targets and preserve an existing stronger weakening',()=>{
 const input=teams();input[1][2].commanderWeaken=.4;
 const out=applyLiveCommanderEffect(input,{side:0,ability:'normal',commanderId:'magic',targetIds:['2']});
 assert.deepEqual(out.log.at(-1).impacts,[{target:'2',kind:'weaken',value:40}]);
});
