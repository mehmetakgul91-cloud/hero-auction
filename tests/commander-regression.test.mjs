import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateBattle} from '../battle-engine.js';
import {createCommanderProfile} from '../arena-commanders.js';

const cards=(prefix)=>Array.from({length:5},(_,i)=>({
 id:prefix+i,name:prefix+i,power:55,role:i<2?'tank':'support',lane:i<2?'front':'back'
}));
const run=(id,actions=[])=>simulateBattle(cards('alpha'),cards('beta'),{
 seed:'commander-regression',maxRounds:15,
 commanders:[createCommanderProfile(id),createCommanderProfile('defense')],
 commanderActions:actions
});

for(const id of ['attack','defense','magic','support']){
 test(id+' commander is accepted and passive battle completes',()=>{
  const result=run(id);
  assert.ok(result.rounds>=1);
  assert.equal(result.commanders[0].commanderId,id);
  assert.equal(result.log.some(x=>String(x.action).startsWith('commander-'+id+'-')),false);
 });
 test(id+' cannot use ultimate before reaching 100 energy',()=>{
  assert.throws(()=>run(id,[{side:0,round:2,ability:'ultimate'}]),/Insufficient commander energy/);
 });
 test(id+' cannot use ultimate at round one',()=>{
  assert.throws(()=>run(id,[{side:0,round:1,ability:'ultimate'}]),/Insufficient commander energy/);
 });
 test(id+' executes normal skill after accumulating energy',()=>{
  const result=run(id,[{side:0,round:4,ability:'normal'}]);
  assert.ok(result.log.some(x=>x.action==='commander-'+id+'-normal'));
 });
}
test('rejects two skills by the same commander in the same round',()=>{
 assert.throws(()=>run('attack',[
  {side:0,round:4,ability:'normal'},
  {side:0,round:4,ability:'ultimate'}
 ]),/Only one commander action/);
});
test('allows one manual action for each player in a round',()=>{
 const result=run('attack',[
  {side:0,round:4,ability:'normal'},
  {side:1,round:4,ability:'normal'}
 ]);
 assert.ok(result.log.some(x=>x.action==='commander-attack-normal'));
 assert.ok(result.log.some(x=>x.action==='commander-defense-normal'));
});
test('rejects commands with an invalid side',()=>{
 assert.throws(()=>run('attack',[{side:2,round:4,ability:'normal'}]),/Invalid commander action/);
});


test('ultimate ability becomes available by the seventh round at level zero',()=>{
 // High HP and full regeneration prevent early elimination before round seven.
 const durable=(prefix)=>Array.from({length:5},(_,i)=>({
  id:prefix+i,name:prefix+i,power:100,role:'tank',lane:'front',
  passive:{effect:'regen',value:1}
 }));
 const result=simulateBattle(durable('alpha'),durable('beta'),{
  seed:'commander-ultimate-long-match',maxRounds:15,
  commanders:[createCommanderProfile('attack'),createCommanderProfile('defense')],
  commanderActions:[{side:0,round:7,ability:'ultimate'}]
 });
 assert.ok(result.log.some(x=>x.action==='commander-attack-ultimate'),
  'Expected ultimate in round seven; battle ended at round '+result.rounds);
});
test('energy cannot be spent twice before recharging',()=>{
 assert.throws(()=>run('attack',[
  {side:0,round:2,ability:'normal'},
  {side:0,round:3,ability:'normal'}
 ]),/Insufficient commander energy/);
});
test('energy cannot exceed 100 even with no ability use',()=>{
 const result=run('attack');
 assert.ok(result.commanderEnergy.every(x=>x>=0&&x<=100));
});
test('same seed and manual commands produce the same outcome',()=>{
 const actions=[{side:0,round:4,ability:'normal'}];
 const a=run('attack',actions),b=run('attack',actions);
 assert.deepEqual({winner:a.winner,log:a.log},{winner:b.winner,log:b.log});
});
