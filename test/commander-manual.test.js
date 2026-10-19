import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateBattle} from '../battle-engine.js';
const team=(prefix)=>Array.from({length:5},(_,i)=>({id:prefix+i,name:prefix+i,power:65,role:'tank',lane:'front',passive:{effect:'regen',value:.95}}));
const commanders=[{commanderId:'attack',levels:{attack:0,defense:0,magic:0,support:0}},null];
test('manual ability cannot fire before 40 energy',()=>{
 assert.throws(()=>simulateBattle(team('a'),team('b'),{commanders,commanderActions:[{side:0,round:3,ability:'normal'}]}),/Insufficient commander energy/);
});
test('normal ability at round 4 changes real damage and logs action',()=>{
 const opts={seed:'manual-test',maxRounds:4,commanders};
 const baseline=simulateBattle(team('a'),team('b'),opts);
 const powered=simulateBattle(team('a'),team('b'),{...opts,commanderActions:[{side:0,round:4,ability:'normal'}]});
 assert.ok(powered.log.some(e=>e.action==='commander-attack-normal'&&e.round===4&&e.value>0));
 assert.ok(powered.log.find(e=>e.action==='commander-attack-normal').value>0,'Commander damage must be applied to actual enemy HP');
 assert.notDeepEqual(powered.log,baseline.log,'Commander action must change authoritative combat log');
});
test('ultimate requires 100 energy and is available by round 9',()=>{
 const opts={seed:'ultimate-test',maxRounds:15,commanders};
 assert.throws(()=>simulateBattle(team('a'),team('b'),{...opts,commanderActions:[{side:0,round:8,ability:'ultimate'}]}),/Insufficient commander energy/);
 const powered=simulateBattle(team('a'),team('b'),{...opts,commanderActions:[{side:0,round:9,ability:'ultimate'}]});
 assert.ok(powered.log.some(e=>e.action==='commander-attack-ultimate'&&e.value>0));
});
test('cannot cast two abilities in same round',()=>{
 assert.throws(()=>simulateBattle(team('a'),team('b'),{commanders,commanderActions:[{side:0,round:4,ability:'normal'},{side:0,round:4,ability:'ultimate'}]}),/Only one commander action/);
});
