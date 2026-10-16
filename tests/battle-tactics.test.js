import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateBattle} from '../battle-engine.js';
const team=(prefix,role='fighter')=>Array.from({length:5},(_,i)=>({id:prefix+i,name:prefix+i,power:65,role:i===0?'tank':role}));
test('identical seed produces identical tactical combat',()=>{const a=team('a'),b=team('b');assert.deepEqual(simulateBattle(a,b,{seed:'fixed'}),simulateBattle(a,b,{seed:'fixed'}))});
test('normal attackers hit living front line before rear line',()=>{const a=team('a'),b=team('b');const result=simulateBattle(a,b,{seed:'front',maxRounds:1});const first=result.log.find(e=>e.side===0&&e.target);assert.ok(first);assert.match(first.target,/^b[01]$/)});
test('all three rear positions become ranged energy specialists',()=>{const a=team('a'),b=team('b');const result=simulateBattle(a,b,{seed:'ranged',maxRounds:1});for(const side of result.teams){assert.deepEqual(side.map(u=>u.role),['tank','fighter','energy','energy','energy']);assert.ok(side[2].attack>side[1].attack)}});
test('five frontliners and five ranged units are both legal',()=>{for(const lane of ['front','back']){const a=team('a').map((u,i)=>({...u,lane,role:lane==='front'?(i%2?'fighter':'tank'):'energy'}));const b=team('b');const result=simulateBattle(a,b,{seed:lane,maxRounds:1});assert.equal(result.teams[0].length,5);assert.ok(result.teams[0].every(u=>u.lane===lane));assert.ok(result.teams[0].every(u=>lane==='back'?u.role==='energy':['tank','fighter'].includes(u.role)))}});
