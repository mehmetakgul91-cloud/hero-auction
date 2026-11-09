import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {getCommanderAbilityCost} from '../public/commander-ability-rules.js';
import {commanderTargetMode,requiredMagicTargets} from '../public/commander-magic-target-picker.js';
import {commanderUltimateName,commanderUltimateDescription} from '../public/commander-ultimate-presentation.js';
import {createMagicCastControls} from '../public/commander-magic-cast-controls.js';
import {createLiveCommanderAbilities} from '../commander-live-abilities.js';
import {createLiveCommanderCombat,castLiveCommanderCombat} from '../commander-live-combat.js';

// Execute the shipped controller with the real picker modules and server combat.
const source=readFileSync(new URL('../public/commander-experimental.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
class Node {
 constructor(){this.listeners=new Map();this.hidden=false;this.disabled=false;this.textContent='';this.style={};this.dataset={};this.attributes={};this.classes=new Set();this.classList={toggle:(name,on)=>on?this.classes.add(name):this.classes.delete(name)};}
 addEventListener(name,fn){this.listeners.set(name,[...(this.listeners.get(name)||[]),fn])}
 removeEventListener(name,fn){this.listeners.set(name,(this.listeners.get(name)||[]).filter(x=>x!==fn))}
 dispatchEvent(event){for(const fn of this.listeners.get(event.type)||[])fn(event)}
 setAttribute(name,value){this.attributes[name]=value}
 removeAttribute(name){delete this.attributes[name]}
 querySelectorAll(){return this.cards||[]}
 contains(card){return this.cards.includes(card)}
 closest(){return this}
}
class DetailEvent {constructor(type,options){this.type=type;this.detail=options?.detail}}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function harness(side=0,commanderId='magic'){
 const window=new Node(),document=new Node(),panel=new Node(),enemyRoot=new Node(),allyRoot=new Node(),nodes=new Map();
 for(const selector of ['normal','ultimate','pass'].map(x=>`[data-command="${x}"]`).concat(['[data-magic-confirm]','[data-magic-cancel]','[data-energy]','[data-energy-meter]','[data-energy-fill]','[data-ultimate-energy]','[data-ultimate-energy-meter]','[data-ultimate-energy-fill]','[data-status]']))nodes.set(selector,new Node());
 nodes.get('[data-magic-confirm]').hidden=nodes.get('[data-magic-cancel]').hidden=true;
 panel.querySelector=selector=>nodes.get(selector);
 document.getElementById=id=>id==='experimental-commander-controls'?panel:id===(side===0?'team-b':'team-a')?enemyRoot:id===(side===0?'team-a':'team-b')?allyRoot:null;
 const requests=[],intervals=new Map(),visuals=[];let intervalId=0,uuid=0;
 const c=createLiveCommanderCombat({teams:[0,1].map(s=>['a','b','c'].map(id=>({id:s+id,hp:100,maxHp:100,attack:50}))),commanders:[{commanderId},{commanderId}],abilities:createLiveCommanderAbilities({matchKey:'ui',energy:[100,100],ultimateEnergy:[100,100],now:0})});
 const snapshot=(extra={})=>({version:c.version,round:1,side,commanderId,revivalUsed:[...c.revivalUsed],ultimateUsed:[...c.abilities.ultimateUsed],teams:structuredClone(c.teams),abilities:c.abilities.energy.map((energy,side)=>({energy,ultimateEnergy:c.abilities.ultimateEnergy[side],cooldownMs:0,effectLockMs:0})),finished:c.finished,events:[],...extra});
 window.addEventListener('heroarena:experimental-round-end',event=>{
  allyRoot.cards=event.detail.teams[side].map(hero=>{const card=new Node();card.dataset.heroId=hero.id;return card});
  enemyRoot.cards=event.detail.teams[1-side].map(hero=>{const card=new Node();card.dataset.heroId=hero.id;return card});
 });
 window.addEventListener('heroarena:commander-round',event=>visuals.push(...event.detail.events));
 runInNewContext(source,{getCommanderAbilityCost,commanderTargetMode,requiredMagicTargets,commanderUltimateName,commanderUltimateDescription,createMagicCastControls,window,document,location:{search:'?commanderTest=1&auctionCode=ui&auctionToken=test'},URLSearchParams,CustomEvent:DetailEvent,AbortSignal,crypto:{randomUUID:()=>`magic_request_${++uuid}`},
  fetch:(url,options)=>new Promise(resolve=>requests.push({url,options,resolve})),setInterval:fn=>{intervals.set(++intervalId,fn);return intervalId},clearInterval:id=>intervals.delete(id)});
 const respond=async(index,data,ok=true)=>{requests[index].resolve({ok,json:async()=>data});await flush()};
 return {window,panel,enemyRoot,allyRoot,nodes,requests,visuals,c,snapshot,respond,
  normal:nodes.get('[data-command="normal"]'),ultimate:nodes.get('[data-command="ultimate"]'),confirm:nodes.get('[data-magic-confirm]'),cancel:nodes.get('[data-magic-cancel]'),energy:nodes.get('[data-energy]'),status:nodes.get('[data-status]'),
  click:node=>node.dispatchEvent({type:'click'}),
  target:(index,key)=>enemyRoot.dispatchEvent({type:key?'keydown':'click',key:key||undefined,preventDefault(){},target:enemyRoot.cards[index]}),
  allyTarget:(index,key)=>allyRoot.dispatchEvent({type:key?'keydown':'click',key:key||undefined,preventDefault(){},target:allyRoot.cards[index]}),
  tick:()=>{for(const fn of [...intervals.values()])fn()},
  async accept(index){const payload=JSON.parse(requests[index].options.body);const out=castLiveCommanderCombat(c,{...payload,side,matchKey:'ui',now:2000});await respond(index,snapshot({events:out.events}));}
 };
}

const targetedAbilities=[['magic','normal','enemy'],['magic','ultimate','ally'],['defense','ultimate','ally'],['attack','ultimate','enemy'],['support','ultimate','fallen']];
for(const side of [0,1])for(const [id,ability,mode] of targetedAbilities)test(`${id} ${ability} seat ${side}: first valid target activation submits once, without confirmation`,async()=>{
 const h=harness(side,id),targetSide=mode==='enemy'?1-side:side;
 if(mode==='fallen')h.c.teams[side][1].hp=0;else h.c.teams[targetSide][0].hp=0;
 await h.respond(0,h.snapshot());h.click(h[ability]);
 assert.equal(h.normal.hidden,true);assert.equal(h.confirm.hidden,true);assert.equal(h.requests.length,1);assert.match(h.status.textContent,/Seçince hemen uygulanır/);
 const target=mode==='enemy'?h.target:h.allyTarget,wrongTarget=mode==='enemy'?h.allyTarget:h.target;
 wrongTarget(1);target(0);assert.equal(h.requests.length,1,'wrong side and ineligible life state never submit');
 target(1,side===1?'Enter':undefined);target(1);target(2);h.click(h.confirm);h.click(h.cancel);
 assert.equal(h.requests.length,2);assert.equal(h.cancel.disabled,true);assert.equal(h.energy.textContent,'100 / 100');assert.equal(h.visuals.length,0);
 const payload=JSON.parse(h.requests[1].options.body);assert.equal(payload.ability,ability);assert.deepEqual(payload.targetIds,[targetSide+'b']);
 await h.accept(1);
 assert.equal(h.confirm.hidden,true);assert.equal(h.normal.hidden,false);assert.equal(h.visuals.filter(event=>event.action===`commander-${id}-${ability}`).length,1);
 assert.equal(h.c.abilities.energy[side],ability==='normal'?60:100);assert.equal(h.c.abilities.ultimateEnergy[side],ability==='ultimate'?100-getCommanderAbilityCost(id,ability):100);
 if(ability==='ultimate')assert.equal(h.c.abilities.ultimateUsed[side],true);
 if(id==='attack')assert.equal(h.c.teams[targetSide][1].commanderFocusUntilDeath,true);
 if(id==='defense')assert.equal(h.c.teams[side][1].lastStandReady,true);
 if(id==='support')assert.equal(h.c.teams[side][1].hp,40);
});

for(const side of [0,1])for(const [id,ability,mode] of targetedAbilities)test(`${id} ${ability} seat ${side}: cancel before choosing leaves both pools and usage intact`,async()=>{
 const h=harness(side,id);if(mode==='fallen')h.c.teams[side][0].hp=0;await h.respond(0,h.snapshot());h.click(h[ability]);h.click(h.cancel);
 (mode==='enemy'?h.target:h.allyTarget)(0);assert.equal(h.requests.length,1);assert.equal(h.energy.textContent,'100 / 100');assert.equal(h.nodes.get('[data-ultimate-energy]').textContent,'100 / 100');
 assert.equal(h.c.abilities.ultimateUsed[side],false);assert.equal(h.normal.hidden,false);assert.equal(h.confirm.hidden,true);
});

test('replacement snapshots update eligibility before a click, including ally death and an active mage buff',async()=>{
 const h=harness();await h.respond(0,h.snapshot());h.click(h.ultimate);const previous=h.allyRoot.cards;
 h.c.teams[0][0].hp=0;h.c.teams[0][1].arcaneSurgeUntilRound=3;h.tick();await h.respond(1,h.snapshot({version:1}));
 assert.notEqual(h.allyRoot.cards,previous);h.allyTarget(0);h.allyTarget(1);h.target(2);assert.equal(h.requests.length,2);
 h.allyTarget(2,' ');assert.equal(h.requests.length,3);assert.deepEqual(JSON.parse(h.requests[2].options.body).targetIds,['0c']);await h.accept(2);
 assert.equal(h.c.abilities.ultimateUsed[0],true);
});

test('a revived support target disappears from selection without sending a cast',async()=>{
 const h=harness(1,'support');h.c.teams[1][0].hp=0;await h.respond(0,h.snapshot());h.click(h.ultimate);
 h.c.teams[1][0].hp=40;h.tick();await h.respond(1,h.snapshot({version:1}));h.allyTarget(0);
 assert.equal(h.requests.length,2);assert.equal(h.normal.hidden,false);assert.equal(h.confirm.hidden,true);assert.equal(h.c.abilities.ultimateUsed[1],false);
});

test('a pending cast stays locked when an older in-flight refresh loses every target',async()=>{
 const h=harness();await h.respond(0,h.snapshot());h.click(h.ultimate);h.tick();h.allyTarget(0);
 assert.equal(h.requests.length,3);const teams=structuredClone(h.c.teams);teams[0].forEach(hero=>hero.hp=0);
 await h.respond(1,h.snapshot({version:1,teams}));h.allyTarget(1);h.click(h.cancel);
 assert.equal(h.requests.length,3);assert.equal(h.cancel.disabled,true);assert.equal(h.normal.hidden,true);
 await h.respond(2,{error:'Hedef artık hayatta değil'},false);assert.equal(h.visuals.length,0);assert.equal(h.energy.textContent,'100 / 100');assert.equal(h.confirm.hidden,true);
});

test('server rejection has no success effect or charge and the same target retries on its next click',async()=>{
 const h=harness();await h.respond(0,h.snapshot());h.click(h.normal);h.target(1);
 await h.respond(1,{error:'Hedef artık hayatta değil'},false);
 assert.equal(h.visuals.length,0);assert.equal(h.energy.textContent,'100 / 100');assert.equal(h.confirm.hidden,true);assert.match(h.status.textContent,/Hedef artık hayatta değil/);
 await h.respond(2,h.snapshot());h.target(1);assert.equal(h.requests.length,4);await h.accept(3);assert.equal(h.c.abilities.energy[0],60);assert.equal(h.visuals.length,1);
});

test('finish while selecting or submitting prevents later clicks and late responses from reactivating controls',async()=>{
 for(const pending of [false,true]){
  const h=harness();await h.respond(0,h.snapshot());h.click(h.normal);if(pending)h.target(0);
  h.window.dispatchEvent({type:'heroarena:battle-finished'});h.target(1);h.click(h.cancel);h.tick();
  assert.equal(h.requests.length,pending?2:1);if(pending)await h.respond(1,h.snapshot({version:2,events:[{action:'commander-magic-normal',side:0}]}));
  assert.equal(h.panel.hidden,true);assert.equal(h.confirm.hidden,true);assert.equal(h.visuals.length,0);assert.equal(h.normal.disabled,true);
 }
});

test('insufficient energy and opponent effect lock block a card activation until readiness returns',async()=>{
 const h=harness();await h.respond(0,h.snapshot({abilities:[{energy:30,ultimateEnergy:100,cooldownMs:0}]}));h.click(h.normal);assert.equal(h.requests.length,1);
 h.tick();await h.respond(1,h.snapshot({version:1}));h.click(h.normal);
 h.window.heroCommanderEffectUntil=Date.now()+1200;h.window.dispatchEvent({type:'heroarena:commander-effect-lock'});h.target(1);
 assert.equal(h.requests.length,2);assert.equal(h.visuals.length,0);assert.equal(h.confirm.hidden,true);
 h.window.heroCommanderEffectUntil=0;h.window.dispatchEvent({type:'heroarena:commander-effect-lock'});h.target(1);
 assert.equal(h.requests.filter(request=>request.options.method==='POST').length,1);
});

for(const id of ['attack','defense','magic','support'])for(const side of [0,1])test(`${id} used ultimate snapshot disables only ultimate for seat ${side}`,async()=>{
 const h=harness(side,id);if(id==='support')h.c.teams[side][0].hp=0;
 const used=[false,false];used[side]=true;await h.respond(0,h.snapshot({ultimateUsed:used}));
 assert.equal(h.ultimate.disabled,true);assert.match(h.ultimate.textContent,/Kullanıldı/);assert.equal(h.normal.disabled,false);
 h.click(h.ultimate);assert.equal(h.requests.length,1);assert.equal(h.confirm.hidden,true);assert.equal(h.energy.textContent,'100 / 100');
});
test('authoritative used snapshot cancels an unsubmitted ultimate selection without charging',async()=>{
 const h=harness();await h.respond(0,h.snapshot());h.click(h.ultimate);h.tick();await h.respond(1,h.snapshot({version:1,ultimateUsed:[true,false]}));h.allyTarget(0);
 assert.equal(h.normal.hidden,false);assert.equal(h.confirm.hidden,true);assert.match(h.ultimate.textContent,/Kullanıldı/);assert.equal(h.requests.length,2);assert.equal(h.energy.textContent,'100 / 100');
});
test('per-archetype charge thresholds and already-used support revival disable unavailable casts',async()=>{
 const h=harness(0,'support');h.c.teams[0][0].hp=0;await h.respond(0,h.snapshot({revivalUsed:[true,false]}));h.click(h.ultimate);assert.equal(h.requests.length,1);
 for(const [id,energy,ready]of [['attack',74,false],['attack',75,true],['defense',84,false],['defense',85,true],['magic',99,false],['magic',100,true],['support',89,false],['support',90,true]]){
  const f=harness(0,id);f.c.teams[0][0].hp=id==='support'?0:100;await f.respond(0,f.snapshot({abilities:[{energy:0,ultimateEnergy:energy,cooldownMs:0,effectLockMs:0}]}));assert.equal(f.ultimate.disabled,!ready,id+' '+energy);
 }
});
for(const side of [0,1])test(`seat ${side}: normal cooldown keeps ultimate visibly ready and a stale snapshot cannot restore usage`,async()=>{
 const h=harness(side),abilities=h.snapshot().abilities;abilities[side]={...abilities[side],energy:0,normalCooldownMs:5000,cooldownMs:5000,canUseNormal:false,canUseUltimate:true};await h.respond(0,h.snapshot({abilities}));
 assert.equal(h.normal.disabled,true);assert.equal(h.ultimate.disabled,false);assert.equal(h.ultimate.classes.has('commander-ultimate-ready'),true);assert.match(h.ultimate.textContent,/Hazır/);
 h.click(h.ultimate);assert.equal(h.ultimate.classes.has('commander-ultimate-ready'),false);h.click(h.cancel);assert.equal(h.ultimate.classes.has('commander-ultimate-ready'),true);assert.equal(h.requests.length,1);
 const used=[false,false];used[side]=true;h.tick();await h.respond(1,h.snapshot({version:2,ultimateUsed:used}));
 assert.equal(h.ultimate.disabled,true);assert.equal(h.nodes.get('[data-ultimate-energy]').textContent,'Kullanıldı');assert.equal(h.nodes.get('[data-ultimate-energy-fill]').style.width,'0%');assert.equal(h.nodes.get('[data-ultimate-energy-meter]').attributes['aria-valuetext'],'Kullanıldı');
 h.tick();await h.respond(2,h.snapshot({version:1}));assert.equal(h.nodes.get('[data-ultimate-energy]').textContent,'Kullanıldı');
});
for(const side of [0,1])test(`seat ${side}: charged support has no ready cue until own fallen hero exists`,async()=>{
 const h=harness(side,'support');await h.respond(0,h.snapshot());assert.equal(h.ultimate.disabled,true);assert.equal(h.ultimate.classes.has('commander-ultimate-ready'),false);assert.match(h.status.textContent,/Ulti dolu · uygun hedef yok/);
 h.c.teams[side][0].hp=0;h.tick();await h.respond(1,h.snapshot({version:1}));assert.equal(h.ultimate.disabled,false);assert.equal(h.ultimate.classes.has('commander-ultimate-ready'),true);
 assert.equal(h.ultimate.textContent,'Diriliş · 90 · Hazır');assert.equal(h.normal.textContent,'Normal · 40');
 h.window.dispatchEvent({type:'heroarena:battle-finished'});assert.equal(h.ultimate.classes.has('commander-ultimate-ready'),false);assert.equal(h.ultimate.disabled,true);
});
test('readiness observes explicit authoritative canUseUltimate=false despite full meter',async()=>{
 const h=harness(0,'attack');await h.respond(0,h.snapshot({abilities:[{energy:100,ultimateEnergy:100,canUseUltimate:false,cooldownMs:0}]}));assert.equal(h.ultimate.disabled,true);assert.equal(h.ultimate.classes.has('commander-ultimate-ready'),false);assert.doesNotMatch(h.ultimate.textContent,/Hazır/);
});
