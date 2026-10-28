import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {FOREST_GUST_TIMING,FOREST_LEAVES,FOREST_FOREGROUND_INDICES,forestGustInterval,mountForestGust} from '../public/arena-forest-gust.js';
class Events{
 listeners=new Map();
 addEventListener(name,fn){const set=this.listeners.get(name)||new Set();set.add(fn);this.listeners.set(name,set);}
 removeEventListener(name,fn){this.listeners.get(name)?.delete(fn);}
 emit(name){for(const fn of [...(this.listeners.get(name)||[])])fn();}
 count(){return [...this.listeners.values()].reduce((sum,set)=>sum+set.size,0);}
}
class Element{
 children=[];parent=null;attrs={};properties={};classes=new Set();isConnected=true;srcAssignments=0;
 style={setProperty:(key,value)=>this.properties[key]=value};classList={add:name=>this.classes.add(name),remove:name=>this.classes.delete(name)};
 get firstChild(){return this.children[0]||null;}setAttribute(k,v){this.attrs[k]=v;}
 append(n){n.remove();n.parent=this;this.children.push(n);}remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);this.parent=null;}
 insertBefore(n,r){n.remove();n.parent=this;this.children.splice(r?this.children.indexOf(r):this.children.length,0,n);}
 set src(v){this.source=v;this.srcAssignments++;}get src(){return this.source;}
}
class Clock{
 now=0;id=0;pending=new Map();maximum=0;history=[];
 setTimeout=(fn,delay)=>{const id=++this.id;this.pending.set(id,{fn,delay,at:this.now+delay});this.maximum=Math.max(this.maximum,this.pending.size);this.history.push(delay);return id;};clearTimeout=id=>this.pending.delete(id);
 tick(ms){const end=this.now+ms;let guard=0;for(;;){const next=[...this.pending.entries()].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;assert.ok(guard++<1000);this.now=next[1].at;this.pending.delete(next[0]);next[1].fn();}this.now=end;}
}
function fixture({hidden=false,reduced=false,random=()=>0,legacy=false,width=378,height=530,clipEnabled=true,clipThrows=false,observerFailure=''}={}){
 const document=new Events();document.hidden=hidden;document.createElement=()=>new Element();const media=new Events();media.matches=reduced;
 if(legacy){media.addListener=fn=>Events.prototype.addEventListener.call(media,'change',fn);media.removeListener=fn=>Events.prototype.removeEventListener.call(media,'change',fn);media.addEventListener=media.removeEventListener=undefined;}
 const root=new Element(),hero=new Element();root.ownerDocument=document;root.clientWidth=width;root.clientHeight=height;root.getBoundingClientRect=()=>({width:root.clientWidth,height:root.clientHeight});root.append(hero);
 const clock=new Clock();let clipRefreshes=0,clipDisposals=0,observerDisposals=0,resize;
 class Observer{constructor(fn){if(observerFailure==='constructor')throw Error('observer construction');resize=fn;}observe(r){if(observerFailure==='observe')throw Error('observer setup');assert.equal(r,root);}disconnect(){observerDisposals++;}}
 const clip={enabled:clipEnabled,styleValue:'url(#test-portrait-clip)',refresh(){clipRefreshes++;},dispose(){clipDisposals++;}};
 const options={document,motionQuery:media,clock,random,ResizeObserver:Observer,createClip:()=>{if(clipThrows)throw Error('clip construction');return clip;},leafUrl:'/images/arena-themes/forest-leaf.svg'};
 const controller=mountForestGust(root,options),background=root.children[0],foreground=root.children[2];
 return {root,hero,document,media,clock,options,controller,background,foreground,clip,
  leaves:()=>[...background.children.slice(0,4),...foreground.children],
  resize(){resize();},clipRefreshes:()=>clipRefreshes,clipDisposals:()=>clipDisposals,observerDisposals:()=>observerDisposals,
  hide(on){document.hidden=on;document.emit('visibilitychange');},reduce(on){media.matches=on;media.emit('change');}};
}
test('forest uses four background paths and two portrait copies, all finite within seven seconds',()=>{
 assert.deepEqual(FOREST_GUST_TIMING,{durationMs:7000,initialDelayMs:1500,minIntervalMs:12000,maxIntervalMs:18000});assert.equal(FOREST_LEAVES.length,4);assert.deepEqual(FOREST_FOREGROUND_INDICES,[0,2]);
 for(const l of FOREST_LEAVES){assert.ok(l.startX<0&&l.endX>100);assert.ok(l.durationMs+l.delayMs<=7000);assert.ok(l.size>=17&&l.size<=25);assert.ok(l.opacity>=.7&&l.opacity<=.85);assert.notEqual(l.startRotation,l.endRotation);}
 assert.equal(new Set(FOREST_LEAVES.map(l=>l.durationMs)).size,4);
 assert.deepEqual(FOREST_LEAVES.map(l=>l.size),[22,19,25,17]);
 assert.ok(FOREST_GUST_TIMING.minIntervalMs-FOREST_GUST_TIMING.durationMs>=5000,'finite gusts retain quiet gaps');
});
test('cosmetic cadence stays within 12–18 seconds, including invalid/throwing entropy',()=>{
 assert.equal(forestGustInterval(()=>0),12000);assert.equal(forestGustInterval(()=>.5),15000);assert.equal(forestGustInterval(()=>1),18000);
 for(const x of [-1,2,Infinity,NaN,undefined,'bad'])assert.ok(forestGustInterval(()=>x)>=12000&&forestGustInterval(()=>x)<=18000);
 assert.equal(forestGustInterval(()=>{throw Error('entropy');}),15000);
});
test('mount is idempotent and preserves hero DOM and root geometry; leaves are decorative and lazy',()=>{
 const f=fixture();assert.equal(f.root.children.length,3);assert.equal(f.root.children[1],f.hero);assert.deepEqual(f.root.properties,{});
 assert.equal(f.background.children.length,6);assert.equal(f.foreground.children.length,2);assert.equal(f.foreground.properties['clip-path'],'url(#test-portrait-clip)');
 for(const leaf of f.foreground.children)assert.equal(leaf.properties['--leaf-opacity'],'0.58');
 for(let i=0;i<4;i++)assert.equal(f.background.children[i].properties['--leaf-opacity'],String(FOREST_LEAVES[i].opacity));
 for(const node of [f.background,f.foreground]){assert.equal(node.attrs['aria-hidden'],'true');assert.equal(node.hidden,true);}
 for(const l of f.leaves()){assert.equal(l.alt,'');assert.equal(l.draggable,false);assert.equal(l.src,undefined);}
 for(let i=0;i<20;i++)assert.equal(mountForestGust(f.root,f.options),f.controller);
 assert.equal(f.document.count(),1);assert.equal(f.media.count(),1);assert.equal(f.clock.pending.size,1);f.controller.dispose();
});
test('one timer drives 100 gusts without accumulating nodes or repeatedly loading the leaf asset',()=>{
 const f=fixture();const nodes=f.leaves();f.clock.tick(1499);assert.equal(f.controller.state().phase,'waiting');f.clock.tick(1);assert.equal(f.controller.state().phase,'playing');
 assert.ok(nodes.every(n=>n.src==='/images/arena-themes/forest-leaf.svg'&&n.srcAssignments===1));
 f.clock.tick(7000);assert.equal(f.controller.state().phase,'waiting');assert.equal(f.controller.state().nextDelayMs,5000);assert.ok(f.background.hidden&&f.foreground.hidden);
 f.clock.tick(12000*100);assert.equal(f.clock.maximum,1);assert.equal(f.root.children.length,3);assert.deepEqual(f.leaves(),nodes);assert.ok(nodes.every(n=>n.srcAssignments===1));
 assert.ok(f.clock.history.every(n=>[1500,7000,5000].includes(n)));f.controller.dispose();assert.equal(f.clock.pending.size,0);
});
test('maximum cadence is start-to-start eighteen seconds, not twenty-five',()=>{
 const f=fixture({random:()=>1});f.clock.tick(1500);assert.equal(f.controller.state().phase,'playing');f.clock.tick(7000);assert.equal(f.controller.state().nextDelayMs,11000);f.clock.tick(11000);assert.equal(f.clock.now,19500);assert.equal(f.controller.state().phase,'playing');f.controller.dispose();
});
test('hidden/reduced states never schedule or load leaves, and stop both planes immediately',()=>{
 const f=fixture({hidden:true,reduced:true});assert.equal(f.clock.pending.size,0);assert.ok(f.leaves().every(n=>n.src===undefined));
 f.hide(false);assert.equal(f.clock.pending.size,0);f.reduce(false);assert.equal(f.controller.state().nextDelayMs,1500);f.clock.tick(1500);const stale=[...f.clock.pending.values()][0].fn;
 f.hide(true);assert.equal(f.clock.pending.size,0);assert.ok(f.background.hidden&&f.foreground.hidden);assert.ok(!f.background.classes.has('is-running'));stale();assert.equal(f.clock.pending.size,0);
 f.hide(false);assert.equal(f.controller.state().nextDelayMs,12000);f.clock.tick(12000);f.reduce(true);assert.equal(f.clock.pending.size,0);assert.ok(f.foreground.hidden);f.controller.dispose();
});
test('late callback rechecks a hidden document or reduced preference without waiting for events',()=>{
 for(const state of ['hidden','reduced']){const f=fixture();if(state==='hidden')f.document.hidden=true;else f.media.matches=true;f.clock.tick(1500);assert.equal(f.controller.state().phase,'paused');assert.equal(f.clock.pending.size,0);assert.ok(f.leaves().every(n=>!n.src));f.controller.dispose();}
});
test('zero-size or detached arenas pause; first visible refresh starts the initial wait',()=>{
 const f=fixture({width:0,height:0});assert.equal(f.clock.pending.size,0);f.root.clientWidth=378;f.root.clientHeight=530;f.controller.refresh();assert.equal(f.controller.state().nextDelayMs,1500);
 f.root.isConnected=false;f.clock.tick(1500);assert.equal(f.clock.pending.size,0);f.root.isConnected=true;f.controller.refresh();assert.equal(f.clock.pending.size,1);f.controller.dispose();
});
test('resize updates coordinates and the clip without restarting a playing gust',()=>{
 const f=fixture();f.clock.tick(1500);const pending=f.controller.state().nextDelayMs,refreshes=f.clipRefreshes();f.root.clientWidth=800;f.root.clientHeight=400;f.resize();
 assert.equal(f.leaves()[0].properties['--leaf-mid-x'],'384px');assert.equal(f.leaves()[0].properties['--leaf-mid-y'],'152px');assert.ok(f.clipRefreshes()>refreshes);assert.equal(f.controller.state().phase,'playing');assert.equal(f.controller.state().nextDelayMs,pending);assert.equal(f.clock.maximum,1);f.controller.dispose();
});
test('measurement failure is cosmetic-only, stops the event and does not leak a timer',()=>{
 const f=fixture();f.clip.refresh=()=>{throw Error('unavailable clip');};f.clock.tick(1500);assert.equal(f.clock.pending.size,0);assert.ok(f.background.hidden&&f.foreground.hidden);f.controller.dispose();
});
test('unsupported or failed clipping leaves foreground hidden while background gust stays usable',()=>{
 for(const options of [{clipEnabled:false},{clipEnabled:undefined},{clipThrows:true}]){
  const f=fixture(options);if(Object.hasOwn(options,'clipEnabled')&&options.clipEnabled===undefined)f.clip.enabled=undefined;
  f.clock.tick(1500);assert.equal(f.controller.state().phase,'playing');assert.equal(f.background.hidden,false);assert.equal(f.foreground.hidden,true);assert.equal(f.foreground.classes.has('is-running'),false);
  f.controller.dispose();assert.equal(f.clock.pending.size,0);assert.equal(f.document.count(),0);assert.equal(f.media.count(),0);assert.deepEqual(f.root.children,[f.hero]);
 }
});
test('observer construction or observe failure cannot leak partially mounted effect resources',()=>{
 for(const failure of ['constructor','observe']){const f=fixture({observerFailure:failure});assert.equal(f.clock.pending.size,1);assert.equal(f.observerDisposals(),failure==='observe'?1:0);
  f.clock.tick(1500);assert.equal(f.controller.state().phase,'playing');f.controller.dispose();assert.equal(f.clock.pending.size,0);assert.equal(f.document.count(),0);assert.equal(f.media.count(),0);assert.equal(f.clipDisposals(),1);assert.deepEqual(f.root.children,[f.hero]);
 }
});
test('dispose is idempotent in waiting/playing phases and removes every listener, observer, clip and node',()=>{
 for(const playing of [false,true]){const f=fixture({legacy:true});if(playing)f.clock.tick(1500);const stale=[...f.clock.pending.values()][0].fn;f.controller.dispose();f.controller.dispose();stale();f.resize();f.hide(false);f.reduce(false);
  assert.equal(f.clock.pending.size,0);assert.equal(f.document.count(),0);assert.equal(f.media.count(),0);assert.equal(f.clipDisposals(),1);assert.equal(f.observerDisposals(),1);assert.deepEqual(f.root.children,[f.hero]);assert.equal(f.controller.state().phase,'disposed');
  const next=mountForestGust(f.root,f.options);assert.notEqual(next,f.controller);assert.equal(f.root.children.length,3);next.dispose();assert.equal(f.clock.pending.size,0);}
});
test('leaf art is local, tiny and transparent outside its organic shape',()=>{
 const path=new URL('../public/images/arena-themes/forest-leaf.svg',import.meta.url),svg=readFileSync(path,'utf8');assert.ok(statSync(path).size<2048);assert.match(svg,/<svg[^>]*viewBox="0 0 64 32"/);assert.match(svg,/linearGradient/);assert.doesNotMatch(svg,/<rect|<image|<script|<filter|<foreignObject/);
 assert.doesNotMatch(svg,/(?:href|src)=|<animate|<filter|<script/);
 assert.match(svg,/stroke="#344323" stroke-width="1.4"/);assert.match(svg,/stroke-opacity=".85" stroke-width="1.6"/);
});
test('production CSS keeps leaves pointer-transparent, finite and behind/inside portraits; only local light changes',()=>{
 const css=readFileSync(new URL('../public/theme.css',import.meta.url),'utf8'),start=css.indexOf('/* Forest wind:');assert.ok(start>=0,'parent must append the supplied forest CSS');const source=css.slice(start);
 assert.match(source,/\[data-forest-gust\]\{[^}]*pointer-events:none;z-index:-1/);assert.match(source,/\[data-forest-gust="foreground"\]\{z-index:20/);assert.match(source,/prefers-reduced-motion:reduce/);
 assert.match(source,/forest-leaf-drift var\(--leaf-duration\) linear var\(--leaf-delay\) 1 both/);assert.match(source,/opacity:\.035/);assert.match(source,/width:34%;height:30%/);
 assert.doesNotMatch(source,/\b(?:filter|backdrop-filter|blur|infinite|will-change)\b/);
 const script=readFileSync(new URL('../public/arena-forest-gust.js',import.meta.url),'utf8');assert.doesNotMatch(script,/setInterval\s*\(|requestAnimationFrame\s*\(|Math\.random\s*\(|fetch\s*\(|battle-engine/);
});

test('short battles start the first environmental pass at 1.5 seconds without consuming cadence entropy early',()=>{
 let calls=0;const f=fixture({random:()=>{calls++;return 1;}});
 assert.equal(FOREST_GUST_TIMING.initialDelayMs,1500);assert.equal(f.controller.state().nextDelayMs,1500);assert.equal(calls,0);
 f.clock.tick(1499);assert.equal(f.controller.state().phase,'waiting');
 for(let i=0;i<20;i++)f.controller.refresh();assert.equal(f.clock.pending.size,1);assert.equal(calls,0);
 f.clock.tick(1);assert.equal(f.clock.now,1500);assert.equal(f.controller.state().phase,'playing');assert.equal(calls,1);
 f.clock.tick(750);assert.equal(f.controller.state().phase,'playing','a 2.25-second battle reaches the first pass');
 f.controller.dispose();f.clock.tick(100000);assert.equal(f.clock.pending.size,0);assert.equal(f.controller.state().phase,'disposed');
});
test('hiding or reducing motion before the first pass resets its short wait; later resume retains full cadence',()=>{
 for(const toggle of ['hide','reduce']){
  const f=fixture();f.clock.tick(1000);const stale=[...f.clock.pending.values()][0].fn;
  f[toggle](true);assert.equal(f.clock.pending.size,0);f.clock.tick(10000);assert.equal(f.controller.state().phase,'paused');
  f[toggle](false);assert.equal(f.controller.state().nextDelayMs,1500);stale();assert.equal(f.controller.state().phase,'waiting');
  f.clock.tick(1499);assert.equal(f.controller.state().phase,'waiting');f.clock.tick(1);assert.equal(f.controller.state().phase,'playing');
  f[toggle](true);assert.equal(f.clock.pending.size,0);f[toggle](false);assert.equal(f.controller.state().nextDelayMs,12000);
  f.clock.tick(1500);assert.equal(f.controller.state().phase,'waiting','only the first pass uses the short delay');f.controller.dispose();
 }
});
test('battle completion before 1.5 seconds cancels the initial pass and rematch receives its own short wait',()=>{
 const f=fixture();f.clock.tick(1499);const stale=[...f.clock.pending.values()][0].fn;
 f.controller.dispose();f.clock.tick(10001);stale();assert.equal(f.controller.state().phase,'disposed');assert.equal(f.clock.pending.size,0);
 const next=mountForestGust(f.root,f.options);assert.equal(next.state().nextDelayMs,1500);f.clock.tick(1499);assert.equal(next.state().phase,'waiting');f.clock.tick(1);assert.equal(next.state().phase,'playing');next.dispose();assert.equal(f.clock.pending.size,0);
});
