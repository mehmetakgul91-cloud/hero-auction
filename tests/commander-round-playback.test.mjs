import test from 'node:test';
import {heroActionDuration} from '../public/hero-battle-timing.js';
import {runInNewContext} from 'node:vm';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
test('queued playback deduplicates events and never overwrites authoritative health',async()=>{
 const received=[],handlers=new Map(),tasks=[];
 const window={addEventListener:(name,fn)=>handlers.set(name,fn),dispatchEvent:event=>received.push(event)};
 runInNewContext(read('commander-round-playback.js'),{heroActionDuration,window,document:{hidden:false},
 CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail}},
 setTimeout:resolve=>{tasks.push(resolve);return tasks.length;},clearTimeout(){}});
 const teams=[[{id:'a',hp:100}],[{id:'b',hp:80}]];
 const emit=events=>handlers.get('heroarena:commander-round')({detail:{round:1,events,teams}});
 emit([{actor:'a',target:'b',version:1,value:20},{actor:'a',target:'b',version:2,value:10}]);
 emit([{actor:'a',target:'b',version:2,value:10},{actor:'commander:0',version:3},{actor:'b',target:'a',version:4,value:5}]);
 while(tasks.length)tasks.shift()();
 assert.deepEqual(received.map(e=>e.detail.event.version),[1,2,4]);
 assert.ok(received.every(e=>e.type==='heroarena:experimental-move'));
 assert.equal(window.heroArenaTeams,undefined);
 assert.equal(teams[0][0].hp,100);assert.equal(teams[1][0].hp,80);
});

test('large reconnect backlogs are bounded and stop immediately on hide, completion, and rematch',()=>{
 const handlers=new Map(),timers=new Map(),received=[];let id=0;
 const document={hidden:false,addEventListener:(name,fn)=>handlers.set(name,fn)};
 const window={addEventListener:(name,fn)=>handlers.set(name,fn),dispatchEvent:event=>received.push(event.detail.event.version)};
 runInNewContext(read('commander-round-playback.js'),{heroActionDuration,window,document,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail}},setTimeout:fn=>{timers.set(++id,fn);return id;},clearTimeout:id=>timers.delete(id)});
 const emit=(start,count)=>handlers.get('heroarena:commander-round')({detail:{round:1,teams:[[],[]],events:Array.from({length:count},(_,i)=>({actor:'a',target:'b',version:start+i}))}});
 const drain=()=>{for(let i=0;timers.size&&i<50;i++){const [id,fn]=timers.entries().next().value;timers.delete(id);fn();}};
 emit(1,10000);drain();assert.equal(received.length,1);assert.equal(received.at(-1),10000);assert.equal(timers.size,0);
 emit(10001,10);document.hidden=true;handlers.get('visibilitychange')();const count=received.length;drain();assert.equal(received.length,count);assert.equal(timers.size,0);
 document.hidden=false;emit(10011,10);handlers.get('heroarena:battle-finished')();const final=received.length;emit(10021,10);drain();assert.equal(received.length,final);assert.equal(timers.size,0);
 handlers.get('heroarena:ready')();emit(1,2);drain();assert.deepEqual(received.slice(-2),[1,2]);
});
test('active arena consumes committed round snapshots',()=>{
 assert.match(read('battle-preview.js'),/heroarena:experimental-round-end/);
 assert.match(read('battle-preview.js'),/addEventListener\('heroarena:experimental-move'/);
 assert.match(read('battle-preview.js'),/animateMove\(\{\.\.\.move,actorId:move\.actor,targetId:move\.target\}\)/);
 assert.match(read('battle-preview.js'),/if\(auctionMode\)void showAuctionRematch\(\)/);
 assert.match(read('battle-preview.html'),/commander-round-playback\.js/);
});

test('one committed multi-target cast dispatches together and duplicates do not replay it',()=>{
 const handlers=new Map(),timers=new Map(),received=[];let id=0,tick=0;
 const document={hidden:false,addEventListener:(name,fn)=>handlers.set(name,fn)};
 const window={addEventListener:(name,fn)=>handlers.set(name,fn),dispatchEvent:event=>received.push({entry:event.detail.event,tick})};
 runInNewContext(read('commander-round-playback.js'),{heroActionDuration,window,document,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail}},setTimeout:fn=>{timers.set(++id,fn);return id;},clearTimeout:id=>timers.delete(id)});
 const emit=events=>handlers.get('heroarena:commander-round')({detail:{round:3,teams:[[],[]],events}});
 const cast=[
  {actor:'mage',target:'one',version:10,damageType:'special'},
  {actor:'mage',target:'two',version:10,damageType:'splash'},
  {actor:'mage',target:'three',version:10,damageType:'splash'},
  {actor:'mage',target:'mage',version:10,action:'shield'},
 ];
 emit([...cast,{actor:'next',target:'one',version:11}]);
 assert.deepEqual(received.map(x=>x.entry),cast);
 assert.ok(received.every(x=>x.tick===0));assert.equal(timers.size,1);
 emit(cast);assert.equal(received.length,4);
 const [timer,fn]=timers.entries().next().value;timers.delete(timer);tick++;fn();
 assert.equal(received.length,5);assert.equal(received.at(-1).tick,1);
 assert.equal(received.at(-1).entry.actor,'next');
});

test('reconnect limits evict complete casts, including oversized malformed cosmetic groups',()=>{
 const handlers=new Map(),timers=new Map(),received=[];let id=0;
 const document={hidden:false,addEventListener:(name,fn)=>handlers.set(name,fn)};
 const window={addEventListener:(name,fn)=>handlers.set(name,fn),dispatchEvent:event=>received.push(event.detail.event)};
 runInNewContext(read('commander-round-playback.js'),{heroActionDuration,window,document,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail}},setTimeout:fn=>{timers.set(++id,fn);return id;},clearTimeout:id=>timers.delete(id)});
 const emit=events=>handlers.get('heroarena:commander-round')({detail:{round:3,teams:[[],[]],events}});
 const drain=()=>{while(timers.size){const [timer,fn]=timers.entries().next().value;timers.delete(timer);fn();}};
 emit(Array.from({length:20},(_,cast)=>Array.from({length:5},(_,target)=>({actor:'mage',target:String(target),version:cast+1,damageType:target?'splash':'special'}))).flat());
 drain();assert.equal(received.length,5);
 assert.deepEqual([...new Set(received.map(x=>x.version))],[20]);
 for(let version=20;version<=20;version++)assert.equal(received.filter(x=>x.version===version).length,5);
 emit([...Array.from({length:1000},(_,i)=>({actor:'mage',target:String(i),version:21})),{actor:'mage',target:'valid',version:22}]);
 drain();assert.equal(received.length,6);assert.equal(received.at(-1).target,'valid');
 assert.equal(timers.size,0);
});
test('live presentation uses shorter committed normal/special cadence and terminal catch-up never queues stale attacks',()=>{
 const handlers=new Map(),tasks=new Map(),received=[];let id=0;
 const window={addEventListener:(name,fn)=>handlers.set(name,fn),dispatchEvent:e=>received.push(e.detail.event)};
 runInNewContext(read('commander-round-playback.js'),{heroActionDuration,window,document:{hidden:false},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail}},setTimeout:(fn,ms)=>{tasks.set(++id,{fn,ms});return id},clearTimeout:id=>tasks.delete(id)});
 const emit=(events,finished=false)=>handlers.get('heroarena:commander-round')({detail:{round:3,teams:[[],[]],events,finished}});
 emit([{actor:'a',version:1,damageType:'normal'}]);assert.equal([...tasks.values()][0].ms,1100);
 const [key,t]=tasks.entries().next().value;tasks.delete(key);t.fn();
 emit([{actor:'a',version:2,damageType:'special'}]);assert.equal([...tasks.values()][0].ms,1500);
 emit([{actor:'a',version:3},{actor:'b',version:4}],true);
 assert.deepEqual(received.map(e=>e.version),[1,2,4]);assert.equal(tasks.size,1);
});
