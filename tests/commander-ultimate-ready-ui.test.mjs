import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {createLiveArenaCommanderControls} from '../public/commander-live-arena-controls.js';
import {mountLiveArenaCommanderBridge} from '../public/commander-live-arena-bridge.js';
class Button{listeners=new Map();disabled=false;textContent='';classes=new Set();classList={toggle:(name,on)=>on?this.classes.add(name):this.classes.delete(name)};addEventListener(k,f){this.listeners.set(k,f)}removeEventListener(k){this.listeners.delete(k)}async click(){await this.listeners.get('click')?.()}}
const ui=()=>({normalButton:new Button(),ultimateButton:new Button(),energyLabel:new Button(),statusLabel:new Button()});
const ready=b=>b.classes.has('commander-ultimate-ready');
test('normal-only cooldown never suppresses legal ultimate glow or Hazır label',()=>{
 const elements=ui(),state={commanderId:'attack',ultimateTargetAvailable:true,energy:100,ultimateEnergy:75,normalCooldownMs:5000,cooldownMs:5000,canUseNormal:false,canUseUltimate:true};
 const controls=createLiveArenaCommanderControls({...elements,readState:()=>state,onCast:async()=>{}});
 assert.equal(elements.normalButton.disabled,true);assert.equal(elements.ultimateButton.disabled,false);assert.equal(ready(elements.ultimateButton),true);assert.match(elements.ultimateButton.textContent,/Hazır/);
 state.effectLockMs=1200;controls.refresh();assert.equal(ready(elements.ultimateButton),false);assert.equal(elements.ultimateButton.disabled,true);assert.doesNotMatch(elements.ultimateButton.textContent,/Hazır/);
 state.effectLockMs=0;state.ultimateUsed=true;controls.refresh();assert.equal(ready(elements.ultimateButton),false);assert.match(elements.ultimateButton.textContent,/Kullanıldı/);controls.destroy();
});
test('target selection/pending hides ready cue; cancel restores it only while still eligible',async()=>{
 const elements=ui(),state={commanderId:'magic',energy:0,ultimateEnergy:100,ultimateTargetAvailable:true};let select,sent=0;
 const controls=createLiveArenaCommanderControls({...elements,readState:()=>state,onMagicTarget:()=>new Promise(r=>select=r),onCast:async()=>sent++});
 const pending=elements.ultimateButton.click();assert.equal(ready(elements.ultimateButton),false);assert.doesNotMatch(elements.ultimateButton.textContent,/Hazır/);select(null);await pending;assert.equal(sent,0);assert.equal(ready(elements.ultimateButton),true);
 state.ultimateTargetAvailable=false;controls.refresh();assert.equal(ready(elements.ultimateButton),false);assert.equal(elements.ultimateButton.disabled,true);assert.match(elements.statusLabel.textContent,/uygun hedef yok/);controls.destroy();
});
test('full targeted ultimate with unknown eligibility is never presented as ready',()=>{
 for(const commanderId of ['magic','support']){const elements=ui();const controls=createLiveArenaCommanderControls({...elements,readState:()=>({commanderId,energy:100,ultimateEnergy:100}),onCast:async()=>{}});assert.equal(elements.ultimateButton.disabled,true);assert.equal(ready(elements.ultimateButton),false);controls.destroy();}
});
for(const commanderId of ['magic','support'])test(`${commanderId} bridge validates own eligibility before ready cue`,async()=>{
 const elements=ui(),ally={id:'a',hp:100,arcaneSurgeUntilRound:3},snapshot={round:2,teams:[[ally],[{id:'b',hp:0}]],abilities:[{energy:100,ultimateEnergy:100,normalCooldownMs:5000},{}]};
 const bridge=mountLiveArenaCommanderBridge({...elements,side:0,commanderId,transport:{snapshot:async()=>snapshot,cast:async()=>{},selectCommanderTargets:async()=>null}});await bridge.refresh();assert.equal(elements.ultimateButton.disabled,true);assert.equal(ready(elements.ultimateButton),false);
 if(commanderId==='magic')delete ally.arcaneSurgeUntilRound;else ally.hp=0;
 await bridge.refresh();assert.equal(elements.ultimateButton.disabled,false);assert.equal(ready(elements.ultimateButton),true);bridge.destroy();assert.equal(ready(elements.ultimateButton),false);
});
test('readiness CSS uses gentle pulse and static reduced-motion cue, only for enabled buttons',()=>{
 const css=readFileSync(new URL('../public/commander-ready.css',import.meta.url),'utf8');assert.match(css,/commander-ultimate-ready:not\(:disabled\)/);assert.match(css,/2\.4s/);assert.match(css,/prefers-reduced-motion:reduce/);assert.match(css,/animation:none/);assert.doesNotMatch(css,/visibility|opacity:\s*0(?:\D|$)/);
});

test('ready and normal-only cooldown messages translate to English without changing values',async()=>{
 const {translate}=await import('../public/crazygames-en.js');
 for(const [tr,en]of [['Av Emri · 75 · Hazır','Hunt Order · 75 · Ready'],['Ulti dolu · uygun hedef yok','Ultimate charged · no eligible target'],['Normal bekleme: 4 sn','Normal cooldown: 4 sec'],['Normal beceri bekleme süresi: 4 saniye','Normal ability cooldown: 4 seconds']])assert.equal(translate(tr),en);
});
