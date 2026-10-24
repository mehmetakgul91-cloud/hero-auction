import test from 'node:test';
import assert from 'node:assert/strict';
import {replayCommanderTranscript} from '../commander-transcript.js';
import {createCommanderProfile} from '../arena-commanders.js';
const cards=p=>Array.from({length:5},(_,i)=>({id:p+i,name:p+i,power:75,role:i<2?'tank':'support',lane:i<2?'front':'back'}));
const commanders=[createCommanderProfile('attack'),createCommanderProfile('defense')];
const pass=()=>({command:'pass'});
test('replays synchronized two-player passes with deterministic result',()=>{
 const turns=Array.from({length:4},(_,i)=>[pass(),pass()]);
 const a=replayCommanderTranscript(cards('a'),cards('b'),{commanders,turns});
 const b=replayCommanderTranscript(cards('a'),cards('b'),{commanders,turns});
 assert.equal(a.winner,b.winner);
 assert.deepEqual(a.log,b.log);
});
test('rejects missing player commands',()=>{
 assert.throws(()=>replayCommanderTranscript(cards('a'),cards('b'),{commanders,turns:[[pass(12)]]}),/Both players/);
});
test('replays a round-four attack commander command',()=>{
 const turns=Array.from({length:4},(_,i)=>[pass(),pass()]);
 turns[3][0]={command:'normal'};
 const result=replayCommanderTranscript(cards('a'),cards('b'),{commanders,turns});
 assert.ok(result.log.some(e=>e.action==='commander-attack-normal'));
});
test('engine rejects ultimate before sufficient energy',()=>{
 const turns=Array.from({length:4},(_,i)=>[pass(),pass()]);
 turns[0][0]={command:'ultimate'};
 assert.throws(()=>replayCommanderTranscript(cards('a'),cards('b'),{commanders,turns}),/Insufficient commander energy/);
});

test('client-provided energy is ignored by transcript replay',()=>{
 const turns=[[{command:'ultimate',energy:1000},pass()]];
 assert.throws(()=>replayCommanderTranscript(cards('a'),cards('b'),{commanders,turns}),/Insufficient commander energy/);
});
