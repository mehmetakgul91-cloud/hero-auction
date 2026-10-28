import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateBattle} from '../battle-engine.js';
const team=(prefix)=>Array.from({length:5},(_,i)=>({id:prefix+i,name:prefix+i,power:65,role:'tank',lane:'front',passive:{effect:'regen',value:.95}}));
const commanders=[{commanderId:'attack',levels:{attack:0,defense:0,magic:0,support:0}},null];
test('normal cannot fire with the initial 30 energy',()=>{
 assert.throws(()=>simulateBattle(team('a'),team('b'),{commanders,commanderActions:[{side:0,round:1,ability:'normal'}]}),/Insufficient commander energy/);
});
test('normal ability at round 4 changes real damage and logs action',()=>{
 const opts={seed:'manual-test',maxRounds:4,commanders};
 const baseline=simulateBattle(team('a'),team('b'),opts);
 const powered=simulateBattle(team('a'),team('b'),{...opts,commanderActions:[{side:0,round:4,ability:'normal'}]});
 assert.ok(powered.log.some(e=>e.action==='commander-attack-normal'&&e.round===4),'Normal ability must be recorded');
 assert.ok(powered.log.some(e=>e.action==='commander-hit'&&e.round===4&&e.value+e.absorbed>0),'Commander attack must reduce enemy HP or shield');
 assert.ok(powered.log.filter(e=>e.action==='commander-hit'&&e.round===4).every(e=>e.rawDamage>=e.value+e.absorbed),'Commander damage accounting must respect shields');
 assert.notDeepEqual(powered.log,baseline.log,'Commander action must change authoritative combat log');
});
test('attack ultimate requires 75 energy and is available by round 5 at level zero',()=>{
 const opts={seed:'ultimate-test',maxRounds:15,commanders};
 assert.throws(()=>simulateBattle(team('a'),team('b'),{...opts,commanderActions:[{side:0,round:4,ability:'ultimate',targetIds:['b0']}]}),/Insufficient commander energy/);
 const powered=simulateBattle(team('a'),team('b'),{...opts,commanderActions:[{side:0,round:5,ability:'ultimate',targetIds:['b0']}]});
 assert.ok(powered.log.some(e=>e.action==='commander-attack-ultimate'&&e.value>0));
});
test('cannot cast two abilities in same round',()=>{
 assert.throws(()=>simulateBattle(team('a'),team('b'),{commanders,commanderActions:[{side:0,round:4,ability:'normal'},{side:0,round:4,ability:'ultimate',targetIds:['b0']}]}),/Only one commander action/);
});
