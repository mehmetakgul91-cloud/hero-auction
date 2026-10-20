import test from 'node:test';
import assert from 'node:assert/strict';
import {createMagicCastControls} from '../public/commander-magic-cast-controls.js';
class Node {
 constructor(){this.listeners=new Map();this.hidden=false;this.disabled=false;this.textContent='';this.dataset={};this.classList={toggle(){}};this.attributes={};}
 addEventListener(type,fn){this.listeners.set(type,[...(this.listeners.get(type)||[]),fn])}
 removeEventListener(type,fn){this.listeners.set(type,(this.listeners.get(type)||[]).filter(x=>x!==fn))}
 setAttribute(k,v){this.attributes[k]=v}
 removeAttribute(k){delete this.attributes[k]}
 querySelectorAll(){return this.cards||[]}
 contains(){return true}
 async fire(type,event={}){for(const fn of this.listeners.get(type)||[])await fn(event)}
 closest(){return this}
}
function fixture(onCast=async()=>{}){
 const root=new Node(),confirmButton=new Node(),cancelButton=new Node(),status=new Node();
 const cards=['a','b'].map(id=>{const card=new Node();card.dataset.heroId=id;return card});
 root.cards=cards;
 const controls=createMagicCastControls({enemyRoot:root,confirmButton,cancelButton,status,onCast});
 return {root,cards,confirmButton,cancelButton,status,controls};
}
test('normal magic selection requires confirmation and sends chosen target once',async()=>{
 const sent=[];const f=fixture(async x=>sent.push(x));
 assert.equal(f.controls.begin('normal',[{id:'a',hp:100},{id:'b',hp:100}]),true);
 assert.equal(f.confirmButton.disabled,true);
 await f.root.fire('click',{target:f.cards[1]});
 assert.equal(f.confirmButton.disabled,false);
 assert.equal(sent.length,0);
 await f.confirmButton.fire('click');
 assert.deepEqual(sent,[{ability:'normal',targetIds:['b']}]);
 assert.equal(f.confirmButton.hidden,true);
 f.controls.destroy();
});
test('cancellation and dead target never send a cast',async()=>{
 const sent=[];const f=fixture(async x=>sent.push(x));
 f.controls.begin('ultimate',[{id:'a',hp:100},{id:'b',hp:0}]);
 await f.root.fire('click',{target:f.cards[1]});
 assert.equal(f.confirmButton.disabled,true);
 await f.root.fire('click',{target:f.cards[0]});
 assert.equal(f.confirmButton.disabled,false);
 await f.cancelButton.fire('click');
 assert.equal(sent.length,0);
 assert.equal(f.confirmButton.hidden,true);
 f.controls.destroy();
});
test('server rejection leaves selection available and does not claim success',async()=>{
 const f=fixture(async()=>{throw Error('Server rejected')});
 f.controls.begin('normal',[{id:'a',hp:100}]);
 await f.root.fire('click',{target:f.cards[0]});
 await f.confirmButton.fire('click');
 assert.match(f.status.textContent,/Server rejected/);
 assert.equal(f.confirmButton.hidden,false);
 f.controls.destroy();
});
