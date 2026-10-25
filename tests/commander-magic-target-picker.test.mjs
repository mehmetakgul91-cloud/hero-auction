import test from 'node:test';
import assert from 'node:assert/strict';
import {requiredMagicTargets,validateMagicTargetSelection} from '../public/commander-magic-target-picker.js';
const heroes=[{id:'a',hp:100},{id:'b',hp:0},{id:'c',hp:25}];
test('normal requires one living enemy',()=>{
 assert.equal(requiredMagicTargets('normal',heroes),1);
 assert.equal(validateMagicTargetSelection('normal',heroes,['a']),true);
 assert.equal(validateMagicTargetSelection('normal',heroes,['b']),false);
});
test('mage ultimate requires one living ally',()=>{
 assert.equal(requiredMagicTargets('ultimate',heroes),1);
 assert.equal(validateMagicTargetSelection('ultimate',heroes,['a','c']),false);
 assert.equal(validateMagicTargetSelection('ultimate',heroes,['a']),true);
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

test('support revival selects one dead ally, never a living ally',()=>{
 const options={commanderId:'support'};
 assert.equal(requiredMagicTargets('ultimate',heroes,options),1);
 assert.equal(validateMagicTargetSelection('ultimate',heroes,['b'],options),true);
 assert.equal(validateMagicTargetSelection('ultimate',heroes,['a'],options),false);
});
test('a buffed ally is excluded rather than refreshing or stacking',()=>{
 const options={commanderId:'magic',excludedTargetIds:['a','c']};
 assert.equal(requiredMagicTargets('ultimate',heroes,options),0);
 assert.equal(validateMagicTargetSelection('ultimate',heroes,['a'],options),false);
});
