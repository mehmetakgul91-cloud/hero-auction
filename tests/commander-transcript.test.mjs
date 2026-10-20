import test from 'node:test';
import assert from 'node:assert/strict';
import {replayCommanderTranscript} from '../commander-transcript.js';
import {createCommanderProfile} from '../arena-commanders.js';
const cards=p=>Array.from({length:5},(_,i)=>({id:p+i,name:p+i,power:75,role:i<2?'tank':'support',lane:i<2?'front':'back'}));
const commanders=[createCommanderProfile('attack'),createCommanderProfile('defense')];
const pass=energy=>({command:'pass',energy});
test('replays synchronized two-player passes with deterministic result',()=>{
 const turns=Array.from({length:4},(_,i)=>[pass((i+1)*12),pass((i+1)*12)]);
 const a=replayCommanderTranscript(cards('a'),cards('b'),{commanders,turns});
 const b=replayCommanderTranscript(cards('a'),cards('b'),{commanders,turns});
 assert.equal(a.winner,b.winner);
 assert.deepEqual(a.log,b.log);
});
test('rejects missing player commands',()=>{
 assert.throws(()=>replayCommanderTranscript(cards('a'),cards('b'),{commanders,turns:[[pass(12)]]}),/Both players/);
});
test('replays a round-four attack commander command',()=>{
 const turns=Array.from({length:4},(_,i)=>[pass((i+1)*12),pass((i+1)*12)]);
 turns[3][0]={command:'normal',energy:48};
 const result=replayCommanderTranscript(cards('a'),cards('b'),{commanders,turns});
 assert.ok(result.log.some(e=>e.action==='commander-attack-normal'));
});
test('engine rejects forged energy snapshots',()=>{
 const turns=Array.from({length:4},(_,i)=>[pass((i+1)*12),pass((i+1)*12)]);
 turns[0][0]={command:'normal',energy:100};
 assert.throws(()=>replayCommanderTranscript(cards('a'),cards('b'),{commanders,turns}),/Insufficient commander energy/);
});
