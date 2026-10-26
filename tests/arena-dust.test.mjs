import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DUST_TIMING,DUST_ENVELOPE,DUST_LAYERS,FOREGROUND_LAYERS,DUST_TEXTURE_URL,dustIntervalMs,sampleDustLayer,mountSavannaDust} from '../public/arena-dust.js';

class Events{
 listeners=new Map();
 addEventListener(name,fn){const set=this.listeners.get(name)||new Set();set.add(fn);this.listeners.set(name,set);}
 removeEventListener(name,fn){this.listeners.get(name)?.delete(fn);}
 dispatch(name){for(const fn of [...(this.listeners.get(name)||[])])fn();}
 count(){return [...this.listeners.values()].reduce((sum,set)=>sum+set.size,0);}
}
class Element extends Events{
 constructor(){super();}
 getBoundingClientRect(){return {left:0,top:0,width:378,height:530};}
 querySelectorAll(){return [];}
 contains(node){return node===this||this.children.some(child=>child.contains(node));}
 closest(){return null;}
 replaceChildren(...nodes){for(const child of this.children)child.parent=null;this.children=[];for(const node of nodes)this.append(node);}
 children=[];parent=null;attributes={};properties={};classes=new Set();
 style={setProperty:(key,value)=>this.properties[key]=value};
 classList={add:name=>this.classes.add(name),remove:name=>this.classes.delete(name),contains:name=>this.classes.has(name)};
 get firstChild(){return this.children[0]||null;}
 setAttribute(key,value){this.attributes[key]=value;}
 append(child){child.remove();child.parent=this;this.children.push(child);}
 insertBefore(child,reference){child.remove();child.parent=this;const index=reference?this.children.indexOf(reference):this.children.length;this.children.splice(index,0,child);}
 remove(){if(this.parent){this.parent.children=this.parent.children.filter(child=>child!==this);this.parent=null;}}
}
class Clock{
 now=0;id=0;pending=new Map();maxPending=0;history=[];
 setTimeout=(fn,delay)=>{const id=this.id++;this.pending.set(id,{fn,delay,at:this.now+delay});this.history.push({id,delay,at:this.now+delay});this.maxPending=Math.max(this.maxPending,this.pending.size);return id;};
 clearTimeout=id=>this.pending.delete(id);
 tick(ms){const target=this.now+ms;let count=0;while(true){const next=[...this.pending.entries()].filter(([,item])=>item.at<=target).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];if(!next)break;assert.ok(count++<10000,'bounded fake-clock advancement');this.now=next[1].at;this.pending.delete(next[0]);next[1].fn();}this.now=target;}
}
function fixture({hidden=false,reduced=false,random=()=>0,legacyMedia=false,onPassStart,onPassEnd}={}){
 const document=new Events();document.hidden=hidden;document.defaultView={CSS:{supports:()=>true}};document.createElement=document.createElementNS=()=>new Element();
 const media=new Events();media.matches=reduced;
 if(legacyMedia){media.addListener=fn=>Events.prototype.addEventListener.call(media,'change',fn);media.removeListener=fn=>Events.prototype.removeEventListener.call(media,'change',fn);media.addEventListener=undefined;media.removeEventListener=undefined;}
 const root=new Element(),hero=new Element();root.ownerDocument=document;root.append(hero);
 const clock=new Clock(),options={document,motionQuery:media,clock,random,onPassStart,onPassEnd,textureUrl:'dust-wisp.webp'};
 const controller=mountSavannaDust(root,options),overlay=root.firstChild;
 return {document,media,root,hero,clock,options,controller,overlay,
  hide(value){document.hidden=value;document.dispatch('visibilitychange');},
  reduce(value){media.matches=value;media.dispatch('change');}};
}

test('shared wider, flatter lead, trailing and haze geometry and scale sampler match the fourteen-second event',()=>{
 assert.equal(DUST_LAYERS.length,3);assert.deepEqual(DUST_ENVELOPE,[0,.18,.7,1]);
 assert.equal(DUST_TIMING.durationMs,14000);assert.deepEqual(DUST_LAYERS.map(layer=>layer.role),['lead','trailing','haze']);
 assert.deepEqual(DUST_LAYERS.map(layer=>layer.peakOpacity),[.30,.24,.07]);assert.deepEqual(DUST_LAYERS.map(layer=>layer.tailOpacity),[.22,.16,.08]);
 assert.ok(DUST_TIMING.durationMs<DUST_TIMING.minIntervalMs,'even minimum cadence has a quiet gap');
 const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-12,`${actual} != ${expected}`);
 for(const layer of DUST_LAYERS){
  assert.ok(layer.delayMs>=0&&layer.durationMs>0&&layer.delayMs+layer.durationMs<=DUST_TIMING.durationMs);
  assert.ok(layer.widthPct>=170&&layer.heightPct>0&&layer.heightPct<=40,'very wide and vertically flatter layer boxes');
  assert.ok(layer.peakOpacity>0&&layer.peakOpacity<=.30&&layer.tailOpacity>0&&layer.tailOpacity<=.22);
  assert.ok(layer.startScale>0&&layer.startScale<layer.endScale,'each cloud expands during its finite pass');
  assert.deepEqual(sampleDustLayer(layer,0),{translatePct:0,translateYPct:0,opacity:0,scale:layer.startScale});
  const atLocal=t=>sampleDustLayer(layer,(layer.delayMs+layer.durationMs*t)/DUST_TIMING.durationMs);
  close(atLocal(.18).opacity,layer.peakOpacity);close(atLocal(.7).opacity,layer.tailOpacity);
  close(atLocal(.5).translatePct,layer.endTranslatePct*.5);close(atLocal(.5).translateYPct,layer.endTranslateYPct*.5);
  close(atLocal(.5).scale,(layer.startScale+layer.endScale)/2);
  assert.deepEqual(sampleDustLayer(layer,1),{translatePct:layer.endTranslatePct,translateYPct:layer.endTranslateYPct,opacity:0,scale:layer.endScale});
  assert.deepEqual(sampleDustLayer(layer,-3),sampleDustLayer(layer,0));assert.deepEqual(sampleDustLayer(layer,2),sampleDustLayer(layer,1));
  let previousScale=layer.startScale;
  for(let frame=0;frame<=300;frame++){
   const sample=sampleDustLayer(layer,frame/300);
   assert.ok(sample.opacity>=-1e-12&&sample.opacity<=Math.max(layer.peakOpacity,layer.tailOpacity)+1e-12);
   assert.ok(sample.scale>=previousScale&&sample.scale<=layer.endScale);previousScale=sample.scale;
  }
  if(layer.delayMs)assert.equal(sampleDustLayer(layer,layer.delayMs/2/DUST_TIMING.durationMs).opacity,0,'trailing cloud stays invisible until its own start');
 }
});
test('378×530 dust centers catch on screen near 5.65 seconds: slow lead then faster trailing cloud',()=>{
 const W=378,H=530,[lead,trailing]=DUST_LAYERS;
 const startCenter=layer=>W*(layer.leftPct+layer.widthPct/2)/100;
 const speed=layer=>W*layer.widthPct/100*layer.endTranslatePct/100/(layer.durationMs/1000);
 const leadSpeed=speed(lead),trailingSpeed=speed(trailing);
 assert.ok(leadSpeed>78&&leadSpeed<80,'lead travels approximately 79 px/s');
 assert.ok(trailingSpeed>185&&trailingSpeed<188,'trailing dust travels approximately 186 px/s');
 assert.ok(trailingSpeed>leadSpeed*2.3);assert.equal(trailing.delayMs,3000);
 const catchSeconds=(startCenter(lead)-startCenter(trailing)+trailingSpeed*trailing.delayMs/1000)/(trailingSpeed-leadSpeed);
 assert.ok(catchSeconds>5.6&&catchSeconds<5.7,'later dust wave catches the lead around 5.65 seconds');
 const center=(layer,seconds)=>{
  const sample=sampleDustLayer(layer,seconds*1000/DUST_TIMING.durationMs);
  return {x:startCenter(layer)+W*layer.widthPct/100*sample.translatePct/100,
   y:H*(layer.topPct+layer.heightPct/2)/100+H*layer.heightPct/100*sample.translateYPct/100,
   halfHeight:H*layer.heightPct/100*sample.scale/2,...sample};
 };
 const a=center(lead,catchSeconds),b=center(trailing,catchSeconds);
 assert.ok(Math.abs(a.x-b.x)<1e-9);assert.ok(a.x>124&&a.x<127,'catch occurs inside the central visible arena, not beyond its edge');
 assert.ok(a.opacity>.25&&b.opacity>.19,'both thinner waves remain nonzero but translucent at their center catch');
 assert.ok(Math.abs(a.y-b.y)<a.halfHeight+b.halfHeight,'cloud boxes overlap vertically at the catch');
 for(const offset of [-.6,.6]){
  const l=center(lead,catchSeconds+offset),t=center(trailing,catchSeconds+offset);
  assert.ok(l.x>0&&l.x<W&&t.x>0&&t.x<W,'both centers remain on screen before and after overtaking');
  assert.ok(offset<0?t.x<l.x:t.x>l.x,'trailing cloud changes from behind to ahead');
 }
});
test('three clouds overlap while the faint haze lingers after the faster trailing cloud has passed',()=>{
 const [lead,trailing,haze]=DUST_LAYERS;
 const overlap=DUST_LAYERS.map(layer=>sampleDustLayer(layer,5.5/14));assert.equal(overlap.filter(sample=>sample.opacity>.05).length,3);
 assert.equal(trailing.delayMs+trailing.durationMs,9000);assert.equal(haze.durationMs,14000);
 const W=378,hazeSpeed=W*haze.widthPct/100*haze.endTranslatePct/100/(haze.durationMs/1000);
 assert.ok(hazeSpeed>50&&hazeSpeed<52,'lingering haze drifts at approximately 51 px/s');
 assert.equal(haze.leftPct+haze.widthPct*haze.endTranslatePct/100,-10,'haze ends with its unscaled left edge at -10% rather than exiting the arena');
 for(const seconds of [10,11,12]){
  const sample=sampleDustLayer(haze,seconds/14);
  const centerX=W*(haze.leftPct+haze.widthPct/2)/100+W*haze.widthPct/100*sample.translatePct/100;
  assert.ok(centerX>0&&centerX<W,'haze center stays inside the arena after the trailing cloud exits');
 }

 for(const seconds of [9,10,12]){assert.ok(Math.abs(sampleDustLayer(trailing,seconds/14).opacity)<1e-12);assert.ok(sampleDustLayer(haze,seconds/14).opacity>.03,'fainter haze remains after follower disappears');}
 assert.ok(sampleDustLayer(haze,13.5/14).opacity>0);assert.equal(sampleDustLayer(lead,13.5/14).opacity,0);
 assert.ok(Math.max(haze.peakOpacity,haze.tailOpacity)<Math.min(lead.peakOpacity,trailing.peakOpacity),'haze is deliberately weaker than the passing clouds');
 assert.ok(DUST_LAYERS.every(layer=>sampleDustLayer(layer,1).opacity===0));
 for(const layer of DUST_LAYERS){const finished=(layer.delayMs+layer.durationMs)/DUST_TIMING.durationMs;assert.ok(Math.abs(sampleDustLayer(layer,finished).opacity)<1e-12);}
});
test('cadence clamps injected cosmetic entropy to 15–25 seconds without invalid timer delays',()=>{
 assert.equal(dustIntervalMs(()=>0),15000);assert.equal(dustIntervalMs(()=>.5),20000);assert.equal(dustIntervalMs(()=>1),25000);
 for(const value of [-20,20,NaN,Infinity,undefined,'bad']){const interval=dustIntervalMs(()=>value);assert.ok(interval>=15000&&interval<=25000);}
 assert.equal(dustIntervalMs(()=>{throw Error('unavailable entropy')}),20000);
});
test('mount creates exactly three decorative noninteractive layers before unchanged hero UI and is idempotent',()=>{
 const f=fixture();assert.equal(f.root.children.length,4);assert.equal(f.root.children[1],f.hero);assert.equal(f.overlay.children.length,3);
 assert.equal(f.overlay.attributes['aria-hidden'],'true');assert.equal(f.overlay.attributes['data-savanna-dust'],'');assert.equal(f.overlay.properties['--dust-duration'],'14000ms');
 for(const [index,image] of f.overlay.children.entries()){assert.equal(image.alt,'');assert.equal(image.draggable,false);assert.equal(image.src,'dust-wisp.webp');assert.equal(image.properties['--dust-top'],DUST_LAYERS[index].topPct+'%');assert.equal(image.properties['--dust-layer-duration'],DUST_LAYERS[index].durationMs+'ms');assert.equal(image.properties['--dust-layer-delay'],DUST_LAYERS[index].delayMs+'ms');assert.equal(image.properties['--dust-end-y'],DUST_LAYERS[index].endTranslateYPct+'%');assert.equal(image.properties['--dust-rotation'],DUST_LAYERS[index].rotationDeg+'deg');assert.equal(image.properties['--dust-start-scale'],String(DUST_LAYERS[index].startScale));assert.equal(image.properties['--dust-end-scale'],String(DUST_LAYERS[index].endScale));}
 for(let n=0;n<20;n++)assert.equal(mountSavannaDust(f.root,f.options),f.controller);
 assert.equal(f.document.count(),1);assert.equal(f.media.count(),1);assert.equal(f.clock.pending.size,1);assert.equal(f.root.children.length,4);
 f.controller.dispose();
});
test('one timeout alternates finite passes and bounded quiet gaps, with no overlap over 100 passes',()=>{
 const f=fixture();assert.deepEqual(f.controller.state(),{phase:'waiting',disposed:false,timerPending:true,nextDelayMs:15000,layerCount:3});
 f.clock.tick(14999);assert.equal(f.overlay.classList.contains('is-running'),false);
 f.clock.tick(1);assert.equal(f.controller.state().phase,'playing');assert.equal(f.overlay.classList.contains('is-running'),true);assert.equal(f.controller.state().nextDelayMs,14000);
 f.clock.tick(13999);assert.equal(f.controller.state().phase,'playing');
 f.clock.tick(1);assert.equal(f.controller.state().phase,'waiting');assert.equal(f.overlay.classList.contains('is-running'),false);assert.equal(f.overlay.hidden,true);assert.equal(f.controller.state().nextDelayMs,1000);
 f.clock.tick(1000);assert.equal(f.controller.state().phase,'playing');
 f.clock.tick(15000*100);assert.equal(f.clock.maxPending,1);assert.equal(f.clock.pending.size,1);
 for(const {delay} of f.clock.history)assert.ok(delay===14000||delay===1000||delay===15000);
 f.controller.dispose();assert.equal(f.clock.pending.size,0);
});
test('maximum cadence keeps start-to-start spacing at 25 seconds, not 39 seconds',()=>{
 const f=fixture({random:()=>1});f.clock.tick(25000);assert.equal(f.controller.state().phase,'playing');
 f.clock.tick(14000);assert.equal(f.controller.state().nextDelayMs,11000);f.clock.tick(11000);assert.equal(f.clock.now,50000);assert.equal(f.controller.state().phase,'playing');
 assert.equal(f.clock.maxPending,1);f.controller.dispose();
});
test('hidden document hard-stops and resets an active pass; resume waits a completely new interval',()=>{
 const f=fixture();f.clock.tick(15000);const stale=[...f.clock.pending.values()][0].fn;
 f.hide(true);assert.equal(f.controller.state().phase,'paused');assert.equal(f.clock.pending.size,0);assert.equal(f.overlay.hidden,true);assert.equal(f.overlay.classList.contains('is-running'),false);
 stale();assert.equal(f.clock.pending.size,0);f.clock.tick(100000);assert.equal(f.controller.state().phase,'paused');
 f.hide(false);assert.equal(f.controller.state().phase,'waiting');assert.equal(f.controller.state().nextDelayMs,15000);assert.equal(f.overlay.hidden,false);
 f.document.dispatch('visibilitychange');assert.equal(f.clock.pending.size,1);assert.equal(f.clock.maxPending,1);
 stale();assert.equal(f.controller.state().phase,'waiting');f.clock.tick(15000);assert.equal(f.controller.state().phase,'playing');f.controller.dispose();
});
test('reduced motion and initial hidden state create no timer; both restrictions must clear before resume',()=>{
 const f=fixture({hidden:true,reduced:true});assert.equal(f.clock.pending.size,0);assert.equal(f.overlay.hidden,true);
 f.hide(false);assert.equal(f.clock.pending.size,0);f.reduce(false);assert.equal(f.controller.state().phase,'waiting');
 f.clock.tick(15000);f.reduce(true);assert.equal(f.clock.pending.size,0);assert.equal(f.overlay.classList.contains('is-running'),false);assert.equal(f.overlay.hidden,true);
 f.hide(true);f.reduce(false);assert.equal(f.clock.pending.size,0);f.hide(false);assert.equal(f.controller.state().nextDelayMs,15000);f.controller.dispose();
});
test('late callback rechecks hidden/reduced state even when their events have not yet dispatched',()=>{
 for(const blocked of ['hidden','reduced']){const f=fixture();if(blocked==='hidden')f.document.hidden=true;else f.media.matches=true;f.clock.tick(15000);assert.equal(f.controller.state().phase,'paused');assert.equal(f.clock.pending.size,0);assert.equal(f.overlay.hidden,true);f.controller.dispose();}
});
test('dispose is idempotent, removes all timers/listeners, ignores stale callbacks and allows a clean remount',()=>{
 const f=fixture({legacyMedia:true});const stale=[...f.clock.pending.values()][0].fn;
 f.controller.dispose();f.controller.dispose();assert.equal(f.controller.state().phase,'disposed');assert.equal(f.clock.pending.size,0);assert.equal(f.document.count(),0);assert.equal(f.media.count(),0);assert.deepEqual(f.root.children,[f.hero]);
 stale();f.hide(false);f.reduce(false);assert.equal(f.clock.pending.size,0);
 const again=mountSavannaDust(f.root,f.options);assert.notEqual(again,f.controller);assert.equal(f.root.children.length,4);assert.equal(f.document.count(),1);assert.equal(f.media.count(),1);assert.equal(f.clock.pending.size,1);again.dispose();assert.equal(f.clock.pending.size,0);assert.equal(f.document.count(),0);assert.equal(f.media.count(),0);
});
test('optional companion hooks share the finite event clock and reset on end, pause and disposal',()=>{
 const events=[];const f=fixture({onPassStart:()=>events.push('start'),onPassEnd:()=>events.push('end')});
 assert.deepEqual(events,[]);f.clock.tick(15000);assert.deepEqual(events,['start']);f.clock.tick(14000);assert.deepEqual(events,['start','end']);
 f.clock.tick(1000);assert.deepEqual(events,['start','end','start']);f.hide(true);assert.equal(events.at(-1),'end');
 f.hide(false);f.clock.tick(15000);assert.equal(events.at(-1),'start');f.reduce(true);assert.equal(events.at(-1),'end');
 f.reduce(false);f.clock.tick(15000);assert.equal(events.at(-1),'start');f.controller.dispose();assert.equal(events.at(-1),'end');
 const count=events.length;f.controller.dispose();f.clock.tick(100000);assert.equal(events.length,count);assert.equal(f.clock.pending.size,0);
});
test('hook errors and reentrant disposal never leak timers or preference/document listeners',()=>{
 const broken=fixture({onPassStart:()=>{throw Error('start failed')},onPassEnd:()=>{throw Error('end failed')}});
 broken.clock.tick(29000);assert.equal(broken.controller.state().phase,'waiting');assert.equal(broken.clock.pending.size,1);broken.controller.dispose();assert.equal(broken.clock.pending.size,0);
 for(const where of ['start','end']){
  let f;const hooks=where==='start'?{onPassStart:()=>f.controller.dispose()}:{onPassEnd:()=>f.controller.dispose()};
  f=fixture(hooks);f.clock.tick(where==='start'?15000:29000);
  assert.equal(f.controller.state().phase,'disposed');assert.equal(f.clock.pending.size,0);assert.equal(f.document.count(),0);assert.equal(f.media.count(),0);
 }
});
test('production module has prefix-safe assets and no combat or per-frame dependency',()=>{
 const controller=readFileSync(new URL('../public/arena-dust.js',import.meta.url),'utf8');
 assert.doesNotMatch(controller,/\bsetInterval\s*\(|\brequestAnimationFrame\s*\(|\bfetch\s*\(|Math\.random\s*\(/);
 assert.match(controller,/new URL\('\.\/images\/arena-themes\/savanna-dust\.webp',import\.meta\.url\)/);
 assert.doesNotMatch(controller,/battle-engine|battle-roster|battle-preview|seed\s*:/);
 assert.ok(DUST_TEXTURE_URL.endsWith('/public/images/arena-themes/savanna-dust.webp'));
 for(const prefix of ['/','/crazygames/'])assert.equal(new URL('./images/arena-themes/savanna-dust.webp','https://example.test'+prefix+'arena-dust.js').pathname,prefix+'images/arena-themes/savanna-dust.webp');
});
test('foreground exactly copies the v4 lead and follower with bounded partial-portrait opacity',()=>{
 assert.deepEqual(FOREGROUND_LAYERS.map(l=>l.peakOpacity),[.08,.07]);
 for(let i=0;i<2;i++)for(const key of Object.keys(DUST_LAYERS[i]))if(!['peakOpacity','tailOpacity'].includes(key))assert.equal(FOREGROUND_LAYERS[i][key],DUST_LAYERS[i][key]);
 for(let frame=0;frame<=500;frame++){
  const coverage=1-FOREGROUND_LAYERS.reduce((alpha,layer)=>alpha*(1-sampleDustLayer(layer,frame/500).opacity),1);
  assert.ok(coverage>=0&&coverage<.145,'at least 85.5% portrait remains visible, even ignoring texture alpha');
 }
});
test('foreground uses the one event timer and always hides on pause, preference and dispose',()=>{
 const f=fixture(),fg=f.root.children.find(n=>'data-savanna-foreground' in n.attributes);
 assert.equal(fg.hidden,true);assert.equal(fg.children.length,2);assert.match(fg.properties['clip-path'],/^url\(#arena-weather-portraits-\d+\)$/);
 f.clock.tick(15000);assert.equal(fg.hidden,false);assert.equal(fg.classList.contains('is-running'),true);assert.equal(f.clock.pending.size,1);
 f.clock.tick(14000);assert.equal(fg.hidden,true);f.clock.tick(1000);assert.equal(fg.hidden,false);
 f.hide(true);assert.equal(fg.hidden,true);assert.equal(f.clock.pending.size,0);
 f.hide(false);f.clock.tick(15000);f.reduce(true);assert.equal(fg.hidden,true);assert.equal(f.clock.pending.size,0);
 f.controller.dispose();assert.equal(f.root.count(),0);assert.deepEqual(f.root.children,[f.hero]);
});
test('initial hidden/reduced state does not fetch the selected dust texture until eligible',()=>{
 for(const restrictions of [{hidden:true},{reduced:true},{hidden:true,reduced:true}]){
  const f=fixture(restrictions),images=f.root.children.flatMap(n=>n.children).filter(n=>n.className==='savanna-dust__layer');
  assert.equal(images.length,5);assert.ok(images.every(n=>!n.src));assert.equal(f.clock.pending.size,0);
  f.hide(false);f.reduce(false);assert.ok(images.every(n=>n.src==='dust-wisp.webp'));assert.equal(f.clock.pending.size,1);f.controller.dispose();
 }
});
test('detachment/root hiding stops at refresh or callback and reconnect waits a fresh full interval',()=>{
 for(const property of ['isConnected','hidden']){
  const f=fixture();f.clock.tick(15000);f.root[property]=property==='hidden';f.controller.refresh();
  assert.equal(f.controller.state().phase,'paused');assert.equal(f.clock.pending.size,0);assert.equal(f.overlay.hidden,true);
  f.root[property]=property!=='hidden';f.controller.refresh();assert.equal(f.controller.state().nextDelayMs,15000);
  f.root[property]=property==='hidden';f.clock.tick(15000);assert.equal(f.controller.state().phase,'paused');assert.equal(f.clock.pending.size,0);f.controller.dispose();
 }
});
test('unsupported clip-path disables foreground while finite background remains available',()=>{
 const f=fixture();f.controller.dispose();f.document.defaultView={CSS:{supports:()=>false}};
 const control=mountSavannaDust(f.root,f.options),fg=f.root.children.find(n=>'data-savanna-foreground' in n.attributes);
 f.clock.tick(15000);assert.equal(control.state().phase,'playing');assert.equal(fg.hidden,true);assert.equal(fg.classList.contains('is-running'),false);control.dispose();
});
test('production dust CSS stays noninteractive, clipped and finite with transform/opacity-only frames',()=>{
 const all=readFileSync(new URL('../public/theme.css',import.meta.url),'utf8');
 const css=all.slice(all.indexOf('[data-savanna-dust]{'),all.indexOf('/* Forest wind:'));
 assert.match(css,/\[data-savanna-dust\]\{[^}]*z-index:-1;[^}]*pointer-events:none/);
 assert.match(css,/\[data-savanna-dust\]\[data-savanna-foreground\]\{z-index:20\}/);
 assert.match(css,/object-fit:contain/);assert.match(css,/transform-origin:center/);
 assert.match(css,/animation:savanna-dust-pass var\(--dust-layer-duration\) linear var\(--dust-layer-delay\) 1 both/);
 assert.match(css,/prefers-reduced-motion:reduce/);assert.match(css,/\[data-savanna-dust\]\[hidden\]\{display:none!important\}/);
 assert.doesNotMatch(css,/\b(?:filter|backdrop-filter|blur|canvas|infinite|will-change)\b/);
 const frames=css.slice(css.indexOf('@keyframes'),css.indexOf('/* CSS is a second'));
 const names=[...frames.matchAll(/([a-z-]+):[^;}]+/g)].map(match=>match[1]);assert.ok(names.length>=6);assert.ok(names.every(name=>['transform','opacity'].includes(name)));
});
