import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveArenaCommanderControls} from '../public/commander-live-arena-controls.js';
class Button {
 constructor(){this.listeners=new Map();this.disabled=false;this.textContent='';}
 addEventListener(name,fn){this.listeners.set(name,fn)}
 removeEventListener(name){this.listeners.delete(name)}
 async click(){await this.listeners.get('click')?.()}
}
function setup(onCast=async()=>{}){
 const normalButton=new Button(),ultimateButton=new Button(),energyLabel=new Button(),statusLabel=new Button();
 let state={energy:100,cooldownMs:0,finished:false};
 const controls=createLiveArenaCommanderControls({normalButton,ultimateButton,energyLabel,statusLabel,readState:()=>state,onCast});
 return {normalButton,ultimateButton,energyLabel,statusLabel,controls,setState:s=>{state=s;controls.refresh()}};
}
test('energy and cooldown disable only unaffordable casts',()=>{
 const f=setup();f.setState({energy:60,cooldownMs:0,finished:false});
 assert.equal(f.normalButton.disabled,false);assert.equal(f.ultimateButton.disabled,true);
 f.setState({energy:100,cooldownMs:3500,finished:false});
 assert.equal(f.normalButton.disabled,true);assert.match(f.statusLabel.textContent,/4 sn/);
});
test('button sends a cast without a pass turn',async()=>{
 const sent=[];const f=setup(async c=>sent.push(c));
 await f.normalButton.click();
 assert.deepEqual(sent,[{ability:'normal'}]);
});
test('server rejection does not claim acceptance',async()=>{
 const f=setup(async()=>{throw Error('Server rejected')});
 await f.normalButton.click();
 // Refresh may overwrite the transient status, but no success is claimed.
 assert.doesNotMatch(f.statusLabel.textContent,/kabul edildi/);
});

for(const commanderId of ['attack','defense','magic','support'])test(commanderId+' used flag disables ultimate but not normal',async()=>{
 const sent=[];const f=setup(async c=>sent.push(c));f.setState({commanderId,side:1,energy:100,ultimateUsed:[false,true]});
 assert.equal(f.ultimateButton.disabled,true);assert.match(f.ultimateButton.textContent,/Kullanıldı/);assert.equal(f.normalButton.disabled,false);
 await f.ultimateButton.click();await f.normalButton.click();assert.deepEqual(sent,[{ability:'normal'}]);
});
