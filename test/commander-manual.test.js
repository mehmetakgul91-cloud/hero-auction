import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateBattle} from '../battle-engine.js';
const team=(prefix)=>Array.from({length:5},(_,i)=>({id:prefix+i,name:prefix+i,power:65,role:i<2?'tank':'fighter',lane:i<2?'front':'back'}));
const commanders=[{commanderId:'attack',levels:{attack:0,defense:0,magic:0,support:0}},null];
test('manual ability cannot fire before 40 energy',()=>{
 assert.throws(()=>simulateBattle(team('a'),team('b'),{commanders,commanderActions:[{side:0,round:3,ability:'normal'}]}),/Insufficient commander energy/);
});
test('normal ability at round 4 changes real damage and logs action',()=>{
 const opts={seed:'manual-test',maxRounds:8,commanders};
 const baseline=simulateBattle(team('a'),team('b'),opts);
 const powered=simulateBattle(team('a'),team('b'),{...opts,commanderActions:[{side:0,round:4,ability:'normal'}]});
 assert.ok(powered.log.some(e=>e.action==='commander-attack-normal'&&e.round===4&&e.value>0));
 assert.notDeepEqual(powered.teams[1].map(x=>x.hp),baseline.teams[1].map(x=>x.hp));
});
test('ultimate requires 100 energy and is available by round 9',()=>{
 const opts={seed:'ultimate-test',maxRounds:15,commanders};
 assert.throws(()=>simulateBattle(team('a'),team('b'),{...opts,commanderActions:[{side:0,round:8,ability:'ultimate'}]}),/Insufficient commander energy/);
 const powered=simulateBattle(team('a'),team('b'),{...opts,commanderActions:[{side:0,round:9,ability:'ultimate'}]});
 assert.ok(powered.log.some(e=>e.action==='commander-attack-ultimate'));
});
test('cannot cast two abilities in same round',()=>{
 assert.throws(()=>simulateBattle(team('a'),team('b'),{commanders,commanderActions:[{side:0,round:4,ability:'normal'},{side:0,round:4,ability:'ultimate'}]}),/Only one commander action/);
});
