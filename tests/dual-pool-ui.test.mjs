import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createLiveArenaCommanderControls} from '../public/commander-live-arena-controls.js';
import {mountLiveArenaCommanderBridge} from '../public/commander-live-arena-bridge.js';
class Button{listeners=new Map();disabled=false;textContent='';addEventListener(k,f){this.listeners.set(k,f)}removeEventListener(k){this.listeners.delete(k)}async click(){await this.listeners.get('click')?.()}}
const elements=()=>({normalButton:new Button(),ultimateButton:new Button(),energyLabel:new Button(),statusLabel:new Button()});
for(const [commanderId,cost]of Object.entries({attack:75,defense:85,magic:100,support:90}))test(`${commanderId}: ultimate readiness depends only on its authoritative charge`,()=>{
 const ui=elements(),state={commanderId,energy:100,ultimateEnergy:cost-1};
 const controls=createLiveArenaCommanderControls({...ui,readState:()=>state,onCast:async()=>{}});
 assert.equal(ui.normalButton.disabled,false);assert.equal(ui.ultimateButton.disabled,true);
 state.energy=0;state.ultimateEnergy=cost;controls.refresh();
 assert.equal(ui.normalButton.disabled,true);assert.equal(ui.ultimateButton.disabled,false);assert.match(ui.energyLabel.textContent,new RegExp(`Normal: 0/100 · Ulti: ${cost}/100`));
 state.ultimateUsed=true;state.energy=40;controls.refresh();assert.equal(ui.normalButton.disabled,false);assert.equal(ui.ultimateButton.disabled,true);assert.match(ui.energyLabel.textContent,/Ulti: Kullanıldı/);controls.destroy();
});
test('cancel/rejected ultimate does not locally debit either authoritative pool',async()=>{
 const ui=elements(),state={commanderId:'magic',energy:17,ultimateEnergy:100};let cancel=true,sent=0;
 const controls=createLiveArenaCommanderControls({...ui,readState:()=>state,onMagicTarget:async()=>cancel?null:['ally'],onCast:async()=>{sent++;throw Error('target no longer valid')}});
 await ui.ultimateButton.click();assert.equal(sent,0);assert.equal(state.energy,17);assert.equal(state.ultimateEnergy,100);
 cancel=false;await ui.ultimateButton.click();assert.equal(sent,1);assert.equal(state.energy,17);assert.equal(state.ultimateEnergy,100);assert.equal(ui.ultimateButton.disabled,false);controls.destroy();
});
test('destroy while selecting prevents late target confirmation from casting',async()=>{
 const ui=elements();let resolve,sent=0;const controls=createLiveArenaCommanderControls({...ui,readState:()=>({commanderId:'magic',energy:100,ultimateEnergy:100}),onMagicTarget:()=>new Promise(r=>resolve=r),onCast:async()=>sent++});
 const pending=ui.ultimateButton.click();controls.destroy();resolve(['ally']);await pending;assert.equal(sent,0);
});
for(const side of [0,1])test(`bridge seat ${side} preserves independent pools, class cost and used flag`,async()=>{
 const ui=elements(),sent=[],teams=[[{id:'a',hp:100}],[{id:'b',hp:100}]];let selected;
 const abilities=[{energy:100,ultimateEnergy:0},{energy:100,ultimateEnergy:0}];abilities[side]={energy:0,ultimateEnergy:100};
 const used=[false,false];let snapshot={teams,abilities,ultimateUsed:used,finished:false};
 const transport={snapshot:async()=>snapshot,selectMagicTargets:async(ability,t)=>{selected=t;return[t[0].id]},cast:async c=>{sent.push(c);used[side]=true}};
 const bridge=mountLiveArenaCommanderBridge({...ui,transport,side,commanderId:'magic'});await bridge.refresh();
 assert.equal(ui.normalButton.disabled,true);assert.equal(ui.ultimateButton.disabled,false);
 await ui.ultimateButton.click();assert.deepEqual(selected,teams[side]);assert.deepEqual(sent,[{ability:'ultimate',targetIds:[teams[side][0].id],side}]);assert.equal(ui.ultimateButton.disabled,true);assert.match(ui.energyLabel.textContent,/Kullanıldı/);bridge.destroy();
});
test('late bridge refresh cannot overwrite newer pool state',async()=>{
 const ui=elements(),pending=[];const bridge=mountLiveArenaCommanderBridge({...ui,side:0,commanderId:'attack',transport:{snapshot:()=>new Promise(r=>pending.push(r)),cast:async()=>{}}});
 const first=bridge.refresh(),second=bridge.refresh();const data=(energy,ultimateEnergy)=>({teams:[[],[]],abilities:[{energy,ultimateEnergy},{energy:0,ultimateEnergy:0}],finished:false});
 pending[1](data(0,75));await second;pending[0](data(100,0));await first;
 assert.equal(ui.normalButton.disabled,true);assert.equal(ui.ultimateButton.disabled,false);assert.match(ui.energyLabel.textContent,/Normal: 0\/100 · Ulti: 75\/100/);bridge.destroy();
});
test('production arena markup exposes two labeled accessible meters',()=>{
 const html=readFileSync(new URL('../public/battle-preview.html',import.meta.url),'utf8');
 assert.match(html,/data-energy-meter role="progressbar" aria-label="Normal beceri enerjisi"/);assert.match(html,/data-ultimate-energy-meter role="progressbar" aria-label="Ulti dolumu"/);assert.match(html,/Normal: <strong data-energy/);assert.match(html,/Ulti: <strong data-ultimate-energy/);
});

test('both controls honor shared effect lock and explicit authoritative readiness flags',async()=>{
 const ui=elements(),sent=[],state={commanderId:'attack',energy:100,ultimateEnergy:100,effectLockMs:1200};const controls=createLiveArenaCommanderControls({...ui,readState:()=>state,onCast:async c=>sent.push(c)});
 await ui.normalButton.click();await ui.ultimateButton.click();assert.deepEqual(sent,[]);assert.match(ui.statusLabel.textContent,/efekti/);
 state.effectLockMs=0;state.canUseNormal=false;state.canUseUltimate=false;controls.refresh();assert.equal(ui.normalButton.disabled,true);assert.equal(ui.ultimateButton.disabled,true);
 state.canUseNormal=true;state.canUseUltimate=true;controls.refresh();assert.equal(ui.normalButton.disabled,false);assert.equal(ui.ultimateButton.disabled,false);controls.destroy();
});
for(const side of [0,1])test(`support bridge seat ${side} requests dead friendly target only, normal stays untargeted`,async()=>{
 const ui=elements(),sent=[],selected=[],teams=[[{id:'a',hp:100},{id:'a-dead',hp:0}],[{id:'b',hp:100},{id:'b-dead',hp:0}]],snapshot={teams,abilities:[{energy:100,ultimateEnergy:90},{energy:100,ultimateEnergy:90}],finished:false};let cancel=true;
 const bridge=mountLiveArenaCommanderBridge({...ui,side,commanderId:'support',transport:{snapshot:async()=>snapshot,cast:async c=>sent.push(c),selectCommanderTargets:async(ability,heroes,context)=>{selected.push({ability,heroes,context});return cancel?null:[heroes[0].id]}}});await bridge.refresh();
 await ui.ultimateButton.click();assert.equal(sent.length,0);assert.deepEqual(selected[0].heroes,[teams[side][1]]);assert.equal(selected[0].context.mode,'ally-dead');
 cancel=false;await ui.ultimateButton.click();assert.deepEqual(sent[0],{side,ability:'ultimate',targetIds:[teams[side][1].id]});await ui.normalButton.click();assert.deepEqual(sent[1],{side,ability:'normal'});bridge.destroy();
});
test('support bridge without selector never submits a targetless ultimate',async()=>{
 const ui=elements(),sent=[];const bridge=mountLiveArenaCommanderBridge({...ui,side:0,commanderId:'support',transport:{snapshot:async()=>({teams:[[{id:'dead',hp:0}],[{id:'enemy',hp:100}]],abilities:[{energy:100,ultimateEnergy:100},{}]}),cast:async c=>sent.push(c)}});await bridge.refresh();await ui.ultimateButton.click();assert.equal(sent.length,0);bridge.destroy();
});
