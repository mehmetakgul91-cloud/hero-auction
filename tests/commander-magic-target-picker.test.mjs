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

test('standalone picker also applies a target immediately, has no confirm button and blocks repeated clicks',async()=>{
 const {createMagicTargetPicker}=await import('../public/commander-magic-target-picker.js');
 const oldDocument=globalThis.document;
 class Node {children=[];dataset={};style={};listeners=new Map();append(node){this.children.push(node)}replaceChildren(){this.children=[]}setAttribute(){}addEventListener(type,fn){this.listeners.set(type,fn)}click(){return this.listeners.get('click')?.()}}
 globalThis.document={createElement:()=>new Node()};
 try{
  const root=new Node(),sent=[];let release;const picker=createMagicTargetPicker(root,{onConfirm:cast=>{sent.push(cast);return new Promise(resolve=>release=resolve)}});
  picker.show('normal',heroes);assert.equal(root.children.length,heroes.length+1);const target=root.children[1];const pending=target.click();await target.click();await root.children[3].click();
  assert.deepEqual(sent,[{ability:'normal',targetIds:['a']}]);assert.ok(root.children.slice(1).every(button=>button.disabled));release();await pending;
  await root.children[1].click();assert.equal(sent.length,1);assert.ok(root.children.slice(1).every(button=>button.disabled));
 }finally{globalThis.document=oldDocument}
});
