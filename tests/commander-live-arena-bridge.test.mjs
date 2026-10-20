import test from 'node:test';
import assert from 'node:assert/strict';
import {mountLiveArenaCommanderBridge} from '../public/commander-live-arena-bridge.js';
class Node{
 constructor(){this.listeners=new Map();this.disabled=false;this.textContent=''}
 addEventListener(k,f){this.listeners.set(k,f)}
 removeEventListener(k){this.listeners.delete(k)}
 async click(){await this.listeners.get('click')?.()}
}
function elements(){return {normalButton:new Node(),ultimateButton:new Node(),energyLabel:new Node(),statusLabel:new Node()}}
test('bridge requires authoritative transport, never local replay',()=>{
 assert.throws(()=>mountLiveArenaCommanderBridge({...elements(),side:0}),/Authoritative/);
});
test('bridge refreshes energy and sends cast to server transport',async()=>{
 const ui=elements(),sent=[];
 let energy=100;
 const transport={snapshot:async()=>({teams:[[{id:'a',hp:100}],[{id:'b',hp:100}]],abilities:[{energy,cooldownMs:0,finished:false},{energy:0,cooldownMs:0,finished:false}],finished:false}),cast:async cast=>{sent.push(cast);energy=60}};
 const bridge=mountLiveArenaCommanderBridge({...ui,transport,side:0,commanderId:'attack'});
 assert.equal(ui.normalButton.disabled,true);
 await bridge.refresh();
 assert.equal(ui.normalButton.disabled,false);
 await ui.normalButton.click();
 assert.deepEqual(sent,[{ability:'normal',side:0}]);
 assert.equal(ui.ultimateButton.disabled,true);
 assert.match(ui.energyLabel.textContent,/60\/100/);
 bridge.destroy();
});
