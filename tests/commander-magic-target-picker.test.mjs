import test from 'node:test';
import assert from 'node:assert/strict';
import {requiredMagicTargets,validateMagicTargetSelection} from '../public/commander-magic-target-picker.js';
const heroes=[{id:'a',hp:100},{id:'b',hp:0},{id:'c',hp:25}];
test('normal requires one living enemy',()=>{
 assert.equal(requiredMagicTargets('normal',heroes),1);
 assert.equal(validateMagicTargetSelection('normal',heroes,['a']),true);
 assert.equal(validateMagicTargetSelection('normal',heroes,['b']),false);
});
test('ultimate requires two targets when two survive',()=>{
 assert.equal(requiredMagicTargets('ultimate',heroes),2);
 assert.equal(validateMagicTargetSelection('ultimate',heroes,['a','c']),true);
 assert.equal(validateMagicTargetSelection('ultimate',heroes,['a']),false);
 assert.equal(validateMagicTargetSelection('ultimate',heroes,['a','a']),false);
});
test('ultimate accepts sole survivor',()=>{
 const remaining=[{id:'a',hp:0},{id:'b',hp:10}];
 assert.equal(requiredMagicTargets('ultimate',remaining),1);
 assert.equal(validateMagicTargetSelection('ultimate',remaining,['b']),true);
 assert.equal(validateMagicTargetSelection('ultimate',remaining,['a']),false);
});
test('no living targets cannot confirm',()=>{
 assert.equal(requiredMagicTargets('ultimate',[{id:'a',hp:0}]),0);
 assert.equal(validateMagicTargetSelection('ultimate',[{id:'a',hp:0}],[]),false);
});
