import test from 'node:test';
import assert from 'node:assert/strict';
import {applyAttackThorns} from '../commander-parity-thorns.js';
test('thorns adds floored shield and stacks with existing shield',()=>{
 const actor={hp:40,defense:53,shield:7,passive:{effect:'thorns',value:.2}};
 assert.equal(applyAttackThorns(actor,{enabled:true}),10);
 assert.equal(actor.shield,17);
});
test('disabled thorns leaves actor unchanged',()=>{
 const actor={hp:40,defense:53,shield:7,passive:{effect:'thorns',value:.2}};
 assert.equal(applyAttackThorns(actor),0);
 assert.equal(actor.shield,7);
});
test('invalid thorns stats reject without changing shield',()=>{
 for(const value of [NaN,Infinity,-1]){
  const actor={hp:40,defense:53,shield:7,passive:{effect:'thorns',value}};
  assert.throws(()=>applyAttackThorns(actor,{enabled:true}),/Invalid thorns/);
  assert.equal(actor.shield,7);
 }
});
test('dead actor cannot generate thorns shield',()=>{
 const actor={hp:0,defense:53,shield:7,passive:{effect:'thorns',value:.2}};
 assert.equal(applyAttackThorns(actor,{enabled:true}),0);
 assert.equal(actor.shield,7);
});
