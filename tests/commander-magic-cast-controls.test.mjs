import test from 'node:test';
import assert from 'node:assert/strict';
import {createMagicCastControls} from '../public/commander-magic-cast-controls.js';
import {readFileSync} from 'node:fs';
import {translate} from '../public/crazygames-en.js';
class Node {
 constructor(){this.listeners=new Map();this.hidden=false;this.disabled=false;this.textContent='';this.dataset={};this.classList={toggle(){}};this.attributes={};}
 addEventListener(type,fn){this.listeners.set(type,[...(this.listeners.get(type)||[]),fn])}
 removeEventListener(type,fn){this.listeners.set(type,(this.listeners.get(type)||[]).filter(x=>x!==fn))}
 setAttribute(k,v){this.attributes[k]=v}
 removeAttribute(k){delete this.attributes[k]}
 querySelectorAll(){return this.cards||[]}
 contains(card){return this.cards.includes(card)}
 async fire(type,event={}){for(const fn of this.listeners.get(type)||[])await fn(event)}
 closest(){return this}
}
function fixture(onCast=async()=>{},options={}){
 const root=new Node(),confirmButton=new Node(),cancelButton=new Node(),status=new Node();
 const cards=['a','b'].map(id=>{const card=new Node();card.dataset.heroId=id;return card});root.cards=cards;
 const controls=createMagicCastControls({enemyRoot:root,confirmButton,cancelButton,status,onCast,...options});
 return {root,cards,confirmButton,cancelButton,status,controls};
}
test('normal magic casts on the first card click, with no confirmation listener or visible button',async()=>{
 const sent=[],f=fixture(async value=>sent.push(value));
 assert.equal(f.controls.begin('normal',[{id:'a',hp:100},{id:'b',hp:100}]),true);
 assert.equal(f.confirmButton.hidden,true);assert.equal(f.confirmButton.disabled,true);assert.match(f.status.textContent,/Seçince hemen uygulanır/);
 await f.root.fire('click',{target:f.cards[1]});
 assert.deepEqual(sent,[{ability:'normal',targetIds:['b']}]);assert.equal(f.controls.isSelecting(),false);
 await f.confirmButton.fire('click');await f.root.fire('click',{target:f.cards[1]});assert.equal(sent.length,1);f.controls.destroy();
});
test('cancel before choosing a hero and ineligible cards never send a cast',async()=>{
 const sent=[],f=fixture(async value=>sent.push(value));
 f.controls.begin('ultimate',[{id:'a',hp:100},{id:'b',hp:0}]);await f.root.fire('click',{target:f.cards[1]});
 await f.cancelButton.fire('click');await f.root.fire('click',{target:f.cards[0]});
 assert.equal(sent.length,0);assert.equal(f.controls.isSelecting(),false);assert.equal(f.confirmButton.hidden,true);f.controls.destroy();
});
test('server rejection can retry the same hero with one new click and never asks for confirmation',async()=>{
 let count=0;const f=fixture(async()=>{if(++count===1)throw Error('Server rejected')});
 f.controls.begin('normal',[{id:'a',hp:100}]);await f.root.fire('click',{target:f.cards[0]});
 assert.match(f.status.textContent,/Server rejected/);assert.equal(f.confirmButton.hidden,true);assert.equal(f.controls.isSelecting(),true);
 await f.root.fire('click',{target:f.cards[0]});assert.equal(count,2);assert.equal(f.controls.isSelecting(),false);f.controls.destroy();
});
test('pending cast ignores repeated clicks, keydown, cancellation and a refreshed dead target',async()=>{
 let release;const sent=[],f=fixture(value=>{sent.push(value);return new Promise(resolve=>release=resolve)});
 f.controls.begin('normal',[{id:'a',hp:100},{id:'b',hp:100}]);const pending=f.root.fire('click',{target:f.cards[0]});
 await f.root.fire('click',{target:f.cards[1]});await f.root.fire('keydown',{target:f.cards[0],key:'Enter',preventDefault(){}});await f.cancelButton.fire('click');
 f.controls.refresh([{id:'a',hp:0},{id:'b',hp:0}]);assert.equal(f.controls.isSelecting(),true);assert.equal(f.cancelButton.disabled,true);
 assert.throws(()=>f.controls.begin('normal',[{id:'a',hp:100}]),/pending/);assert.equal(sent.length,1);
 release();await pending;assert.equal(f.controls.isSelecting(),false);f.controls.destroy();
});
test('only Enter and Space activate cards; held keys, other keys and unready actions do not',async()=>{
 let ready=false;const sent=[],f=fixture(async value=>sent.push(value),{canCast:()=>ready});
 f.controls.begin('normal',[{id:'a',hp:100}]);await f.root.fire('click',{target:f.cards[0]});assert.equal(sent.length,0);
 ready=true;f.controls.refresh([{id:'a',hp:100}]);
 for(const [key,repeat] of [['ArrowDown',false],['Enter',true],[' ',true]])await f.root.fire('keydown',{target:f.cards[0],key,repeat,preventDefault(){}});
 assert.equal(sent.length,0);await f.root.fire('keydown',{target:f.cards[0],key:' ',preventDefault(){}});assert.equal(sent.length,1);f.controls.destroy();
});
test('destroyed controls ignore late failure and later target clicks',async()=>{
 let reject;const f=fixture(()=>new Promise((_,fail)=>reject=fail));f.controls.begin('normal',[{id:'a',hp:100}]);
 const pending=f.root.fire('click',{target:f.cards[0]});f.controls.destroy();f.status.textContent='Finished';reject(Error('Late failure'));await pending;
 assert.equal(f.status.textContent,'Finished');assert.equal(f.controls.isSelecting(),false);await f.root.fire('click',{target:f.cards[0]});
});
test('live arena markup has no confirmation control and immediate-selection guidance translates',()=>{
 const html=readFileSync(new URL('../public/battle-preview.html',import.meta.url),'utf8');assert.doesNotMatch(html,/data-magic-confirm|magic-confirm|Büyüyü uygula/);
 assert.equal(translate('Aşırı Yük · Yaşayan müttefik kartına dokun · Seçince hemen uygulanır'),'Arcane Surge · Tap a living ally card · Applies immediately when selected');
});
