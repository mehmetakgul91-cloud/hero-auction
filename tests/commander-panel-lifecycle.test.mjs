import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../public/commander-experimental.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
class Node extends EventTarget {
 hidden=false;disabled=false;textContent='';style={};
 setAttribute(){}
}
class DetailEvent extends Event {
 constructor(type,options){super(type);this.detail=options?.detail;}
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function harness(){
 const window=new EventTarget(),document=new Node(),panel=new Node(),nodes=new Map();
 for(const selector of ['normal','ultimate','pass'].map(command=>`[data-command="${command}"]`).concat(['[data-energy]','[data-energy-meter]','[data-energy-fill]','[data-status]']))nodes.set(selector,new Node());
 panel.querySelector=selector=>nodes.get(selector);
 document.getElementById=()=>panel;
 const requests=[],intervals=new Map();let intervalId=0;
 runInNewContext(source,{window,document,location:{search:'?commanderTest=1&auctionCode=test&auctionToken=test'},URLSearchParams,CustomEvent:DetailEvent,AbortSignal,
  fetch:(url,options)=>new Promise(resolve=>requests.push({url,options,resolve})),
  setInterval:fn=>{intervals.set(++intervalId,fn);return intervalId;},clearInterval:id=>intervals.delete(id)});
 return {window,document,panel,requests,intervals,normal:nodes.get('[data-command="normal"]'),ultimate:nodes.get('[data-command="ultimate"]'),energy:nodes.get('[data-energy]'),
  async respond(index,data,status=200){requests[index].resolve({ok:status===200,status,json:async()=>data});await flush();},
  tick(){for(const fn of [...intervals.values()])fn();}};
}
const snapshot=(finished=false)=>({version:1,side:0,round:3,commanderId:'support',finished,abilities:[{energy:100,cooldownMs:0}],teams:[[],[]]});

test('finished live battle hides controls and stops network polling and casts',async()=>{
 const h=harness();
 await h.respond(0,snapshot());
 assert.equal(h.panel.hidden,false);
 assert.equal(h.normal.disabled,false);
 h.tick();
 await h.respond(1,{...snapshot(true),version:2});
 assert.equal(h.panel.hidden,true);
 assert.equal(h.normal.disabled,true);
 assert.equal(h.ultimate.disabled,true);
 assert.equal(h.intervals.size,0);
 h.normal.dispatchEvent(new Event('click'));
 h.window.dispatchEvent(new Event('heroarena:commander-effect-lock'));
 h.document.dispatchEvent(new Event('visibilitychange'));
 h.tick();await flush();
 assert.equal(h.requests.length,2);
});

test('replay finish prevents a pending live response from reactivating controls',async()=>{
 const h=harness();let snapshots=0;
 h.window.addEventListener('heroarena:commander-state',()=>snapshots++);
 h.window.dispatchEvent(new Event('heroarena:battle-finished'));
 await h.respond(0,snapshot());
 assert.equal(h.panel.hidden,true);
 assert.equal(h.normal.disabled,true);
 assert.equal(h.ultimate.disabled,true);
 assert.equal(h.intervals.size,0);
 assert.equal(snapshots,0);
 h.normal.dispatchEvent(new Event('click'));
 h.document.dispatchEvent(new Event('visibilitychange'));
 await flush();
 assert.equal(h.requests.length,1);
});

test('unchanged polling snapshots refresh energy without rebuilding the arena or repeating effects',async()=>{
 const h=harness();let boards=0,effects=0,controls=0;
 h.window.addEventListener('heroarena:experimental-round-end',()=>boards++);
 h.window.addEventListener('heroarena:commander-round',()=>effects++);
 h.window.addEventListener('heroarena:commander-state',()=>controls++);
 await h.respond(0,snapshot());
 for(let index=1;index<=30;index++){h.tick();await h.respond(index,{...snapshot(),abilities:[{energy:60,cooldownMs:3000-index*100}]});}
 assert.equal(boards,1);assert.equal(effects,1);assert.equal(controls,31);assert.equal(h.energy.textContent,'60 / 100');
 h.tick();await h.respond(31,{...snapshot(),version:2});assert.equal(boards,2);assert.equal(effects,2);
 h.tick();await h.respond(32,{...snapshot(true),version:2});assert.equal(boards,3);assert.equal(h.panel.hidden,true);
});

test('an expired room stops repeated requests and reports a connection loss instead of silently freezing',async()=>{
 const h=harness();let lost=0;
 h.window.addEventListener('heroarena:connection-lost',()=>lost++);
 await h.respond(0,snapshot());h.tick();await h.respond(1,{error:'Oda veya oyuncu oturumu geçersiz'},403);
 assert.equal(lost,1);assert.equal(h.intervals.size,0);assert.equal(h.panel.hidden,true);
 h.tick();h.document.dispatchEvent(new Event('visibilitychange'));await flush();assert.equal(h.requests.length,2);
});
