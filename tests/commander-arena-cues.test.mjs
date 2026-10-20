import test from 'node:test';
import assert from 'node:assert/strict';
import {commanderArenaCue,commanderArenaCues} from '../commander-arena-cues.js';
import {simulateBattle} from '../battle-engine.js';
import {createCommanderProfile} from '../arena-commanders.js';

test('converts normal and ultimate commander events without changing their order',()=>{
 const log=[{round:4,side:0,actor:'commander:0',action:'commander-attack-normal',value:18},{round:9,side:1,action:'commander-defense-ultimate',value:2}];
 assert.deepEqual(commanderArenaCues(log).map(c=>[c.round,c.side,c.ability]),[[4,0,'normal'],[9,1,'ultimate']]);
 assert.equal(commanderArenaCues(log)[0].impact,18);
});
test('ignores invalid and ordinary hero events',()=>{
 assert.deepEqual(commanderArenaCues([{round:1,side:0,action:'attack'},{round:0,side:0,action:'commander-attack-normal'},{round:2,side:9,action:'commander-attack-normal'}]),[]);
 assert.equal(commanderArenaCue(null),null);
});
test('real engine commander action yields a matching animation cue',()=>{
 const cards=p=>Array.from({length:5},(_,i)=>({id:p+i,name:p+i,power:75,role:i<2?'tank':'support',lane:i<2?'front':'back'}));
 const result=simulateBattle(cards('a'),cards('b'),{seed:'commander-cue',maxRounds:4,commanders:[createCommanderProfile('attack'),createCommanderProfile('defense')],commanderActions:[{round:4,side:0,ability:'normal'}]});
 const cues=commanderArenaCues(result.log);
 assert.ok(cues.some(c=>c.round===4&&c.side===0&&c.commanderId==='attack'&&c.ability==='normal'));
});
