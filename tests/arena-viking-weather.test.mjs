import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {VIKING_WEATHER_TIMING,VIKING_SNOW_LAYERS,VIKING_FOREGROUND_INDICES,VIKING_POWDER_LAYERS,VIKING_TEXTURE_URLS,vikingWeatherInterval,mountVikingWeather} from '../public/arena-viking-weather.js';
class Events{
 listeners=new Map();
 addEventListener(name,fn){const set=this.listeners.get(name)||new Set();set.add(fn);this.listeners.set(name,set);}
 removeEventListener(name,fn){this.listeners.get(name)?.delete(fn);}
 emit(name){for(const fn of [...(this.listeners.get(name)||[])])fn();}
 count(){return [...this.listeners.values()].reduce((sum,set)=>sum+set.size,0);}
}
class Element{
 children=[];parent=null;attrs={};properties={};classes=new Set();isConnected=true;writes={};
 style={setProperty:(key,value)=>{this.properties[key]=value;this.writes[key]=(this.writes[key]||0)+1;}};
 classList={add:name=>this.classes.add(name),remove:name=>this.classes.delete(name)};
 get firstChild(){return this.children[0]||null;}setAttribute(k,v){this.attrs[k]=v;}
 append(n){n.remove();n.parent=this;this.children.push(n);}remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);this.parent=null;}
 insertBefore(n,r){n.remove();n.parent=this;this.children.splice(r?this.children.indexOf(r):this.children.length,0,n);}
 closest(){return this.ancestorHidden?{}:null;}
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
 const options={document,motionQuery:media,clock,random,ResizeObserver:Observer,createClip:()=>{if(clipThrows)throw Error('clip construction');return clip;},textureUrls:{far:'/far.svg',middle:'/middle.svg',near:'/near.svg',gust:'/gust.svg'}};
 const controller=mountVikingWeather(root,options),background=root.children[0],foreground=root.children[2];
 return {root,hero,document,media,clock,options,controller,background,foreground,clip,
  sheets:()=>[...background.children.slice(0,5),...foreground.children],
  resize(){resize();},clipRefreshes:()=>clipRefreshes,clipDisposals:()=>clipDisposals,observerDisposals:()=>observerDisposals,
  hide(on){document.hidden=on;document.emit('visibilitychange');},reduce(on){media.matches=on;media.emit('change');}};
}
test('three depths and two approved down-right gust windows fit within one finite eight-second pass',()=>{
 assert.deepEqual(VIKING_WEATHER_TIMING,{durationMs:8000,initialDelayMs:2500,minIntervalMs:20000,maxIntervalMs:30000});
 assert.equal(VIKING_SNOW_LAYERS.length,5);assert.deepEqual(VIKING_FOREGROUND_INDICES,[2,3,4]);
 assert.deepEqual(VIKING_SNOW_LAYERS.slice(3).map(l=>[l.delayMs,l.durationMs]),[[1600,2300],[5000,2300]]);
 for(const layer of VIKING_SNOW_LAYERS){assert.ok(layer.dx>0&&layer.dy>0);assert.ok(layer.durationMs+layer.delayMs<=8000);assert.ok(layer.opacity>.5&&layer.opacity<1);}
 assert.equal(VIKING_POWDER_LAYERS.length,4);for(const layer of VIKING_POWDER_LAYERS)assert.ok(layer.durationMs+layer.delayMs<=8000&&layer.opacity<=.30);
});
test('cosmetic cadence bounds invalid and throwing entropy without combat randomness',()=>{
 assert.equal(vikingWeatherInterval(()=>0),20000);assert.equal(vikingWeatherInterval(()=>.5),25000);assert.equal(vikingWeatherInterval(()=>1),30000);
 for(const x of [-1,2,Infinity,NaN,undefined,'bad'])assert.ok(vikingWeatherInterval(()=>x)>=20000&&vikingWeatherInterval(()=>x)<=30000);
 assert.equal(vikingWeatherInterval(()=>{throw Error('entropy');}),25000);
});
test('mount is idempotent, decorative, lazy and leaves root geometry and hero nodes intact',()=>{
 const f=fixture();assert.equal(f.root.children.length,3);assert.equal(f.root.children[1],f.hero);assert.deepEqual(f.root.properties,{});
 assert.equal(f.background.children.length,7);assert.equal(f.foreground.children.length,3);assert.equal(f.foreground.properties['clip-path'],'url(#test-portrait-clip)');
 for(const node of [f.background,f.foreground]){assert.equal(node.attrs['aria-hidden'],'true');assert.equal(node.hidden,true);}
 assert.ok(f.sheets().every(n=>!n.properties['background-image']));assert.equal(f.background.children[5].children.length,4);assert.equal(f.background.children[6].children.length,2);
 for(let i=0;i<20;i++)assert.equal(mountVikingWeather(f.root,f.options),f.controller);
 assert.equal(f.document.count(),1);assert.equal(f.media.count(),1);assert.equal(f.clock.pending.size,1);f.controller.dispose();
});
test('one timer reuses all fourteen layers across 100 passes without reloading texture properties',()=>{
 const f=fixture(),nodes=f.sheets();f.clock.tick(2499);assert.equal(f.controller.state().phase,'waiting');f.clock.tick(1);assert.equal(f.controller.state().phase,'playing');
 assert.ok(nodes.every(n=>n.writes['background-image']===1));assert.equal(f.foreground.hidden,false);
 f.clock.tick(8000);assert.equal(f.controller.state().phase,'waiting');assert.equal(f.controller.state().nextDelayMs,12000);assert.ok(f.background.hidden&&f.foreground.hidden);
 f.clock.tick(20000*100);assert.equal(f.clock.maximum,1);assert.equal(f.root.children.length,3);assert.deepEqual(f.sheets(),nodes);assert.ok(nodes.every(n=>n.writes['background-image']===1));
 assert.ok(f.clock.history.every(n=>[2500,8000,12000].includes(n)));f.controller.dispose();assert.equal(f.clock.pending.size,0);
});
test('maximum cadence is start-to-start thirty seconds excluding the one initial short delay',()=>{
 const f=fixture({random:()=>1});f.clock.tick(2500);f.clock.tick(8000);assert.equal(f.controller.state().nextDelayMs,22000);f.clock.tick(22000);assert.equal(f.clock.now,32500);assert.equal(f.controller.state().phase,'playing');f.controller.dispose();
});
test('hidden/reduced preferences never load textures and immediately stop all visible weather',()=>{
 const f=fixture({hidden:true,reduced:true});assert.equal(f.clock.pending.size,0);assert.ok(f.sheets().every(n=>!n.properties['background-image']));
 f.hide(false);assert.equal(f.clock.pending.size,0);f.reduce(false);assert.equal(f.controller.state().nextDelayMs,2500);f.clock.tick(2500);const stale=[...f.clock.pending.values()][0].fn;
 f.hide(true);assert.equal(f.clock.pending.size,0);assert.ok(f.background.hidden&&f.foreground.hidden);assert.ok(!f.background.classes.has('is-running'));stale();assert.equal(f.clock.pending.size,0);
 f.hide(false);assert.equal(f.controller.state().nextDelayMs,20000);f.clock.tick(20000);f.reduce(true);assert.equal(f.clock.pending.size,0);assert.ok(f.foreground.hidden);f.controller.dispose();
});
test('late callbacks recheck document, reduced preference, root and ancestor visibility',()=>{
 for(const mutate of [f=>f.document.hidden=true,f=>f.media.matches=true,f=>f.root.hidden=true,f=>f.root.ancestorHidden=true,f=>f.root.isConnected=false]){
  const f=fixture();mutate(f);f.clock.tick(2500);assert.equal(f.controller.state().phase,'paused');assert.equal(f.clock.pending.size,0);assert.ok(f.sheets().every(n=>!n.properties['background-image']));f.controller.dispose();
 }
});
test('zero-size, empty client rects and thrown geometry pause rather than leak an effect',()=>{
 const f=fixture({width:0,height:0});assert.equal(f.clock.pending.size,0);f.root.clientWidth=378;f.root.clientHeight=530;f.controller.refresh();assert.equal(f.controller.state().nextDelayMs,2500);
 f.root.getClientRects=()=>[];f.clock.tick(2500);assert.equal(f.clock.pending.size,0);f.root.getClientRects=()=>[{}];f.controller.refresh();assert.equal(f.clock.pending.size,1);
 f.root.getBoundingClientRect=()=>{throw Error('detached geometry');};f.clock.tick(2500);assert.equal(f.clock.pending.size,0);assert.ok(f.background.hidden&&f.foreground.hidden);f.controller.dispose();
});
test('resize refreshes clipping without restarting a playing pass or changing approved geometry',()=>{
 const f=fixture();f.clock.tick(2500);const delay=f.controller.state().nextDelayMs,refreshes=f.clipRefreshes();f.root.clientWidth=800;f.root.clientHeight=400;f.resize();
 assert.ok(f.clipRefreshes()>refreshes);assert.equal(f.controller.state().phase,'playing');assert.equal(f.controller.state().nextDelayMs,delay);assert.equal(f.clock.maximum,1);assert.deepEqual(f.root.properties,{});f.controller.dispose();
});
test('a clip refresh error stops both planes and leaks no timer',()=>{
 const f=fixture();f.clip.refresh=()=>{throw Error('unavailable clip');};f.clock.tick(2500);assert.equal(f.clock.pending.size,0);assert.ok(f.background.hidden&&f.foreground.hidden);f.controller.dispose();
});
test('unsupported, missing or failed portrait clipping never exposes full-field foreground',()=>{
 for(const options of [{clipEnabled:false},{clipEnabled:undefined},{clipThrows:true}]){
  const f=fixture(options);if(Object.hasOwn(options,'clipEnabled')&&options.clipEnabled===undefined)f.clip.enabled=undefined;
  f.clock.tick(2500);assert.equal(f.controller.state().phase,'playing');assert.equal(f.background.hidden,false);assert.equal(f.foreground.hidden,true);assert.equal(f.foreground.classes.has('is-running'),false);
  f.controller.dispose();assert.equal(f.clock.pending.size,0);assert.equal(f.document.count(),0);assert.equal(f.media.count(),0);assert.deepEqual(f.root.children,[f.hero]);
 }
});
test('optional observer construction or registration failure does not leak mounted resources',()=>{
 for(const failure of ['constructor','observe']){const f=fixture({observerFailure:failure});assert.equal(f.clock.pending.size,1);assert.equal(f.observerDisposals(),failure==='observe'?1:0);
  f.clock.tick(2500);f.controller.dispose();assert.equal(f.clock.pending.size,0);assert.equal(f.document.count(),0);assert.equal(f.media.count(),0);assert.equal(f.clipDisposals(),1);assert.deepEqual(f.root.children,[f.hero]);
 }
});
test('dispose is idempotent and stale callbacks cannot resurrect weather; clean remount works',()=>{
 for(const playing of [false,true]){const f=fixture({legacy:true});if(playing)f.clock.tick(2500);const stale=[...f.clock.pending.values()][0].fn;f.controller.dispose();f.controller.dispose();stale();f.resize();f.hide(false);f.reduce(false);
  assert.equal(f.clock.pending.size,0);assert.equal(f.document.count(),0);assert.equal(f.media.count(),0);assert.equal(f.clipDisposals(),1);assert.equal(f.observerDisposals(),1);assert.deepEqual(f.root.children,[f.hero]);assert.equal(f.controller.state().phase,'disposed');
  const next=mountVikingWeather(f.root,f.options);assert.notEqual(next,f.controller);assert.equal(f.root.children.length,3);next.dispose();assert.equal(f.clock.pending.size,0);}
});
test('bad roots are rejected without importing gameplay dependencies',()=>{
 assert.throws(()=>mountVikingWeather(null),TypeError);assert.throws(()=>mountVikingWeather({}),TypeError);
});
test('four tiny local SVG sheets preserve source depth counts without scripts, opaque veils or animations',()=>{
 let total=0;
 for(const [name,count]of [['far',140],['middle',130],['near',50],['gust',200]]){
  const path=new URL('../public/images/arena-themes/viking-snow-'+name+'.svg',import.meta.url),svg=readFileSync(path,'utf8');total+=statSync(path).size;
  assert.ok(VIKING_TEXTURE_URLS[name].endsWith('/images/arena-themes/viking-snow-'+name+'.svg'));assert.equal((svg.match(/M[0-9]/g)||[]).length,count);
  assert.match(svg,/viewBox="0 0 720 1080"/);assert.doesNotMatch(svg,/<rect|<image|<script|<filter|<foreignObject|<animate|(?:href|src)=/);
 }
 assert.ok(total<12000,'All source-derived sheets together should remain below 12 KB');
});
test('CSS stays pointer-transparent, finite, portrait-clipped and geometry-aware; no moving scenery',()=>{
 const css=readFileSync(new URL('../public/theme.css',import.meta.url),'utf8').split('/* Viking snow:')[1];
 assert.match(css,/\[data-viking-weather\]\{[^}]*pointer-events:none;z-index:-1/);assert.match(css,/\[data-viking-weather="foreground"\]\{z-index:20/);
 assert.match(css,/top:var\(--arena-viking-mist-top,100%\);bottom:0;overflow:hidden/);
 for(const name of ['left','top','right','bottom'])assert.ok(css.includes('--arena-viking-floor-'+name));
 assert.match(css,/clip-path:inset\(var\(--arena-viking-floor-top,100%\)/);assert.match(css,/viking-snow-pass var\(--snow-duration\) linear var\(--snow-delay\) 1 both/);
 assert.match(css,/prefers-reduced-motion:reduce/);assert.doesNotMatch(css,/\b(?:filter|backdrop-filter|blur|infinite|will-change)\b/);
 assert.doesNotMatch(css,/\.battle-arena|\.arena-hero|\.hp\b|\.arena-shield|background-image:/);
 const script=readFileSync(new URL('../public/arena-viking-weather.js',import.meta.url),'utf8');assert.doesNotMatch(script,/setInterval\s*\(|requestAnimationFrame\s*\(|Math\.random\s*\(|fetch\s*\(|battle-engine|innerHTML|createElement\(['"]canvas/);
});

test('short battles start the first environmental pass at 2.5 seconds without consuming cadence entropy early',()=>{
 let calls=0;const f=fixture({random:()=>{calls++;return 1;}});
 assert.equal(VIKING_WEATHER_TIMING.initialDelayMs,2500);assert.equal(f.controller.state().nextDelayMs,2500);assert.equal(calls,0);
 f.clock.tick(2499);assert.equal(f.controller.state().phase,'waiting');
 for(let i=0;i<20;i++)f.controller.refresh();assert.equal(f.clock.pending.size,1);assert.equal(calls,0);
 f.clock.tick(1);assert.equal(f.clock.now,2500);assert.equal(f.controller.state().phase,'playing');assert.equal(calls,1);
 f.clock.tick(750);assert.equal(f.controller.state().phase,'playing','a 3.25-second battle reaches the first pass');
 f.controller.dispose();f.clock.tick(100000);assert.equal(f.clock.pending.size,0);assert.equal(f.controller.state().phase,'disposed');
});
test('hiding or reducing motion before the first pass resets its short wait; later resume retains full cadence',()=>{
 for(const toggle of ['hide','reduce']){
  const f=fixture();f.clock.tick(1000);const stale=[...f.clock.pending.values()][0].fn;
  f[toggle](true);assert.equal(f.clock.pending.size,0);f.clock.tick(10000);assert.equal(f.controller.state().phase,'paused');
  f[toggle](false);assert.equal(f.controller.state().nextDelayMs,2500);stale();assert.equal(f.controller.state().phase,'waiting');
  f.clock.tick(2499);assert.equal(f.controller.state().phase,'waiting');f.clock.tick(1);assert.equal(f.controller.state().phase,'playing');
  f[toggle](true);assert.equal(f.clock.pending.size,0);f[toggle](false);assert.equal(f.controller.state().nextDelayMs,20000);
  f.clock.tick(2500);assert.equal(f.controller.state().phase,'waiting','only the first pass uses the short delay');f.controller.dispose();
 }
});
test('battle completion before 2.5 seconds cancels the initial pass and rematch receives its own short wait',()=>{
 const f=fixture();f.clock.tick(2499);const stale=[...f.clock.pending.values()][0].fn;
 f.controller.dispose();f.clock.tick(10001);stale();assert.equal(f.controller.state().phase,'disposed');assert.equal(f.clock.pending.size,0);
 const next=mountVikingWeather(f.root,f.options);assert.equal(next.state().nextDelayMs,2500);f.clock.tick(2499);assert.equal(next.state().phase,'waiting');f.clock.tick(1);assert.equal(next.state().phase,'playing');next.dispose();assert.equal(f.clock.pending.size,0);
});
