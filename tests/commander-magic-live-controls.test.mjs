import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
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
function harness(side=0){
 const window=new Node(),document=new Node(),panel=new Node(),enemyRoot=new Node(),nodes=new Map();
 for(const selector of ['normal','ultimate','pass'].map(x=>`[data-command="${x}"]`).concat(['[data-magic-confirm]','[data-magic-cancel]','[data-energy]','[data-energy-meter]','[data-energy-fill]','[data-status]']))nodes.set(selector,new Node());
 nodes.get('[data-magic-confirm]').hidden=nodes.get('[data-magic-cancel]').hidden=true;
 panel.querySelector=selector=>nodes.get(selector);
 document.getElementById=id=>id==='experimental-commander-controls'?panel:id===(side===0?'team-b':'team-a')?enemyRoot:null;
 const requests=[],intervals=new Map(),visuals=[];let intervalId=0,uuid=0;
 const c=createLiveCommanderCombat({teams:[0,1].map(s=>['a','b','c'].map(id=>({id:s+id,hp:100,maxHp:100,attack:50}))),commanders:[{commanderId:'magic'},{commanderId:'magic'}],abilities:createLiveCommanderAbilities({matchKey:'ui',energy:[100,100],now:0})});
 const snapshot=(extra={})=>({version:c.version,round:1,side,commanderId:'magic',teams:structuredClone(c.teams),abilities:c.abilities.energy.map(energy=>({energy,cooldownMs:0,effectLockMs:0})),finished:c.finished,events:[],...extra});
 window.addEventListener('heroarena:experimental-round-end',event=>{
  enemyRoot.cards=event.detail.teams[1-side].map(hero=>{const card=new Node();card.dataset.heroId=hero.id;return card});
 });
 window.addEventListener('heroarena:commander-round',event=>visuals.push(...event.detail.events));
 runInNewContext(source,{createMagicCastControls,window,document,location:{search:'?commanderTest=1&auctionCode=ui&auctionToken=test'},URLSearchParams,CustomEvent:DetailEvent,AbortSignal,crypto:{randomUUID:()=>`magic_request_${++uuid}`},
  fetch:(url,options)=>new Promise(resolve=>requests.push({url,options,resolve})),setInterval:fn=>{intervals.set(++intervalId,fn);return intervalId},clearInterval:id=>intervals.delete(id)});
 const respond=async(index,data,ok=true)=>{requests[index].resolve({ok,json:async()=>data});await flush()};
 return {window,panel,enemyRoot,nodes,requests,visuals,c,snapshot,respond,
  normal:nodes.get('[data-command="normal"]'),ultimate:nodes.get('[data-command="ultimate"]'),confirm:nodes.get('[data-magic-confirm]'),cancel:nodes.get('[data-magic-cancel]'),energy:nodes.get('[data-energy]'),status:nodes.get('[data-status]'),
  click:node=>node.dispatchEvent({type:'click'}),
  target:(index,key)=>enemyRoot.dispatchEvent({type:key?'keydown':'click',key:key||undefined,preventDefault(){},target:enemyRoot.cards[index]}),
  tick:()=>{for(const fn of [...intervals.values()])fn()},
  async accept(index){const payload=JSON.parse(requests[index].options.body);const out=castLiveCommanderCombat(c,{...payload,side,matchKey:'ui',now:2000});await respond(index,snapshot({events:out.events}));}
 };
}

for(const side of [0,1])test('live magic seat '+side+' selects a card, confirms once, then receives energy change and effect from server',async()=>{
 const h=harness(side);await h.respond(0,h.snapshot());
 h.click(h.normal);assert.equal(h.normal.hidden,true);assert.equal(h.confirm.hidden,false);assert.equal(h.confirm.disabled,true);
 h.target(1);assert.equal(h.confirm.disabled,false);assert.equal(h.requests.length,1);assert.equal(h.visuals.length,0);assert.equal(h.energy.textContent,'100 / 100');
 h.click(h.confirm);h.click(h.confirm);h.click(h.cancel);await flush();
 assert.equal(h.requests.length,2);assert.equal(h.cancel.disabled,true);assert.equal(h.visuals.length,0);assert.equal(h.energy.textContent,'100 / 100');
 assert.deepEqual(JSON.parse(h.requests[1].options.body).targetIds,[(1-side)+'b']);
 await h.accept(1);
 assert.equal(h.energy.textContent,'60 / 100');assert.equal(h.visuals.length,1);assert.equal(h.visuals[0].action,'commander-magic-normal');
 assert.deepEqual(h.visuals[0].impacts.map(e=>e.target),[(1-side)+'b']);assert.equal(h.confirm.hidden,true);assert.equal(h.normal.hidden,false);
});

test('ultimate requires two choices and keeps them on replacement cards after a polling render',async()=>{
 const h=harness();await h.respond(0,h.snapshot());h.click(h.ultimate);h.target(0,'Enter');
 assert.equal(h.confirm.disabled,true);h.target(2,' ');assert.equal(h.confirm.disabled,false);
 const previous=h.enemyRoot.cards;h.tick();await h.respond(1,h.snapshot({version:1}));
 assert.notEqual(h.enemyRoot.cards,previous);assert.ok(h.enemyRoot.cards[0].classes.has('magic-target-selected'));assert.ok(h.enemyRoot.cards[2].classes.has('magic-target-selected'));assert.equal(h.confirm.disabled,false);
 h.click(h.confirm);assert.deepEqual(JSON.parse(h.requests[2].options.body).targetIds,['1a','1c']);assert.equal(h.visuals.length,0);
});

test('a dead selected target is removed; sole surviving enemy becomes a valid ultimate target',async()=>{
 const h=harness();await h.respond(0,h.snapshot());h.click(h.ultimate);h.target(0);h.target(1);
 h.c.teams[1][0].hp=0;h.tick();await h.respond(1,h.snapshot({version:1}));
 assert.equal(h.confirm.disabled,true);assert.ok(!h.enemyRoot.cards[0].classes.has('magic-target-selected'));
 h.target(0);assert.equal(h.confirm.disabled,true);
 h.c.teams[1][2].hp=0;h.tick();await h.respond(2,h.snapshot({version:2}));
 assert.equal(h.confirm.disabled,false);h.click(h.confirm);assert.deepEqual(JSON.parse(h.requests[3].options.body).targetIds,['1b']);
});

test('cancel and battle finish clear selection without a cast or an effect',async()=>{
 const h=harness();await h.respond(0,h.snapshot());h.click(h.normal);h.target(0);h.click(h.cancel);
 assert.equal(h.requests.length,1);assert.equal(h.energy.textContent,'100 / 100');assert.equal(h.normal.hidden,false);assert.ok(h.enemyRoot.cards.every(c=>!c.classes.has('magic-target-selected')));
 h.click(h.ultimate);h.target(0);h.target(1);h.window.dispatchEvent({type:'heroarena:battle-finished'});h.click(h.confirm);h.tick();await flush();
 assert.equal(h.panel.hidden,true);assert.equal(h.confirm.hidden,true);assert.equal(h.requests.length,1);assert.equal(h.visuals.length,0);
});

test('server rejection never displays a successful effect and leaves target selection retryable',async()=>{
 const h=harness();await h.respond(0,h.snapshot());h.click(h.normal);h.target(1);h.click(h.confirm);
 await h.respond(1,{error:'Hedef artık hayatta değil'},false);
 assert.equal(h.visuals.length,0);assert.equal(h.energy.textContent,'100 / 100');assert.equal(h.confirm.hidden,false);assert.match(h.status.textContent,/Hedef artık hayatta değil/);
});

test('insufficient energy and opponent effect lock cannot submit a magic cast',async()=>{
 const h=harness();await h.respond(0,h.snapshot({abilities:[{energy:30,cooldownMs:0}]}));
 h.click(h.normal);assert.equal(h.confirm.hidden,true);assert.equal(h.requests.length,1);
 h.tick();await h.respond(1,h.snapshot({version:1}));h.click(h.normal);h.target(1);
 h.window.heroCommanderEffectUntil=Date.now()+1200;h.window.dispatchEvent({type:'heroarena:commander-effect-lock'});
 assert.equal(h.confirm.disabled,true);h.click(h.confirm);assert.equal(h.requests.length,2);assert.equal(h.visuals.length,0);
});
