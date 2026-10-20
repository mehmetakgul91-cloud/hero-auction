import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateBattle} from '../battle-engine.js';
import {replayCommanderTranscript} from '../commander-transcript.js';
import {createCommanderProfile} from '../arena-commanders.js';

const cards=p=>Array.from({length:5},(_,i)=>({id:p+i,name:p+i,power:75,role:i<2?'tank':'support',lane:i<2?'front':'back'}));
const commanders=[createCommanderProfile('attack'),createCommanderProfile('defense')];
const pass=()=>({command:'pass'});
test('commander transcript and direct engine produce identical rounds and energy',()=>{
 const turns=Array.from({length:4},()=>[pass(),pass()]);
 const options={seed:'replay-check',commanders,remainingCredits:[2,3]};
 const replay=replayCommanderTranscript(cards('a'),cards('b'),{...options,turns});
 const direct=simulateBattle(cards('a'),cards('b'),{...options,maxRounds:4});
 assert.deepEqual(replay.log,direct.log);
 assert.deepEqual(replay.commanderEnergy,direct.commanderEnergy);
 assert.deepEqual(replay.survivors,direct.survivors);
});
test('round four normal commander skill consumes 40 energy',()=>{
 const turns=Array.from({length:4},()=>[pass(),pass()]);
 turns[3][0]={command:'normal'};
 const result=replayCommanderTranscript(cards('a'),cards('b'),{seed:'energy-spend',commanders,turns});
 assert.ok(result.log.some(entry=>entry.action==='commander-attack-normal'));
 const direct=simulateBattle(cards('a'),cards('b'),{seed:'energy-spend',commanders,maxRounds:4,commanderActions:[{round:4,side:0,ability:'normal'}]});
 assert.deepEqual(result.commanderEnergy,direct.commanderEnergy);
});
test('a transcript longer than 15 rounds is rejected',()=>{
 const turns=Array.from({length:16},()=>[pass(),pass()]);
 assert.throws(()=>replayCommanderTranscript(cards('a'),cards('b'),{commanders,turns}),/Invalid turn transcript/);
});
test('commander skill cannot be forged at first round',()=>{
 assert.throws(()=>replayCommanderTranscript(cards('a'),cards('b'),{commanders,turns:[[{command:'ultimate'},pass()]]}),/Insufficient commander energy/);
});
