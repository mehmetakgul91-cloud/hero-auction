import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {portraitWeatherRects,createPortraitWeatherClip} from '../public/arena-portrait-weather.js';

class Node {
 constructor(name='div',className='',rect={left:0,top:0,width:0,height:0}){Object.assign(this,{name,className,rect,children:[],attributes:{},properties:{},listeners:new Map(),isConnected:true,writes:0});this.style={setProperty:(k,v)=>this.properties[k]=v};}
 setAttribute(k,v){this.attributes[k]=String(v);}
 append(node){node.remove();node.parent=this;this.children.push(node);}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);this.parent=null;}
 replaceChildren(...nodes){this.writes++;for(const n of this.children)n.parent=null;this.children=[];for(const n of nodes)this.append(n);}
 contains(node){return this===node||this.children.some(n=>n.contains(node));}
 matches(selector){return selector.split(',').some(s=>{s=s.trim();return s==='[hidden]'?!!this.hidden:s==='[role="button"]'?this.attributes.role==='button':s.startsWith('.')?this.className.split(' ').includes(s.slice(1)):this.name===s;});}
 closest(selector){return this.matches(selector)?this:this.parent?.closest(selector)||null;}
 querySelectorAll(selector){return this.children.flatMap(n=>[...(n.matches(selector)?[n]:[]),...n.querySelectorAll(selector)]);}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 getBoundingClientRect(){return this.rect;}
 getClientRects(){return this.noRects?[]:[this.rect];}
 addEventListener(name,fn){const set=this.listeners.get(name)||new Set();set.add(fn);this.listeners.set(name,set);}
 removeEventListener(name,fn){this.listeners.get(name)?.delete(fn);}
 emit(type,target=this,extra={}){for(const fn of [...this.listeners.get(type)||[]])fn({type,target,...extra});}
 count(){return [...this.listeners.values()].reduce((n,set)=>n+set.size,0);}
}
function fixture({cssSupport=true,observers=true}={}){
 const document={defaultView:{CSS:{supports:()=>cssSupport}},createElementNS:(_ns,name)=>new Node(name)};
 const root=new Node('div','battle-arena',{left:40,top:70,width:378,height:530});root.ownerDocument=document;root.clientLeft=root.clientTop=2;
 const hero=new Node('div','hero arena-hero'),portrait=new Node('div','arena-portrait',{left:80,top:120,width:70,height:70});root.append(hero);hero.append(portrait);
 const resized=[],mutated=[];
 class Resize {constructor(fn){this.fn=fn;this.observed=new Set();this.removed=[];resized.push(this);}observe(n){this.observed.add(n);}unobserve(n){this.observed.delete(n);this.removed.push(n);}disconnect(){this.disconnected=true;this.observed.clear();}}
 class Mutation {constructor(fn){this.fn=fn;mutated.push(this);}observe(n,opts){this.root=n;this.options=opts;}disconnect(){this.disconnected=true;}}
 const options={document,...(observers?{ResizeObserver:Resize,MutationObserver:Mutation}:{})};
 const controller=createPortraitWeatherClip(root,options),svg=root.children.find(n=>'data-arena-weather-clip'in n.attributes),clip=svg?.children[0]?.children[0];
 return {root,hero,portrait,document,options,controller,svg,clip,resized,mutated};
}
const overlap=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;

test('actual portrait interior geometry respects arena border, leaving label and bar areas outside',()=>{
 const f=fixture();assert.deepEqual(portraitWeatherRects(f.root),[{x:41,y:51,width:64,height:62,rx:5}]);
 assert.equal(f.clip.attributes.clipPathUnits,'userSpaceOnUse');assert.equal(f.clip.children[0].attributes.width,'64');
 assert.match(f.controller.styleValue,/^url\(#arena-weather-portraits-\d+\)$/);assert.equal(f.svg.attributes['aria-hidden'],'true');assert.equal(f.svg.properties.position,'absolute');assert.equal(f.svg.properties['pointer-events'],'none');f.controller.dispose();
});
test('transformed root coordinates are converted back into local CSS pixels',()=>{
 const f=fixture();f.root.offsetWidth=378;f.root.offsetHeight=530;f.root.rect={left:40,top:70,width:756,height:1060};f.portrait.rect={left:120,top:170,width:140,height:140};
 assert.deepEqual(portraitWeatherRects(f.root),[{x:41,y:51,width:64,height:62,rx:5}]);f.controller.dispose();
});
test('overlapping labels, HP, shields, links and all interactive controls are subtracted from dust',()=>{
 const f=fixture();const protectedBoxes=[];
 for(const [i,[name,className,role]]of [['div','arena-hero-label'],['div','hp'],['div','arena-shield'],['button',''],['a',''],['input',''],['select',''],['textarea',''],['div','','button']].entries()){
  const node=new Node(name,className,{left:83+i*6,top:131,width:5,height:30});if(role)node.setAttribute('role',role);f.root.append(node);protectedBoxes.push({x:node.rect.left-42,y:node.rect.top-72,width:5,height:30});
 }
 const rects=portraitWeatherRects(f.root);assert.ok(rects.length>1);for(const rect of rects)for(const box of protectedBoxes)assert.equal(overlap(rect,box),false);
 f.controller.dispose();
});
test('fully protected or absent portraits produce an empty clip rather than unmasked foreground',()=>{
 const f=fixture();const button=new Node('button','',{...f.portrait.rect});f.root.append(button);f.controller.refresh();assert.equal(f.clip.children.length,0);
 button.remove();f.portrait.remove();f.controller.refresh();assert.equal(f.clip.children.length,0);f.controller.dispose();
});
test('hidden, disconnected, zero, NaN and tiny portraits cannot expose unrelated pixels',()=>{
 for(const mutate of [f=>f.root.hidden=true,f=>f.hero.hidden=true,f=>f.portrait.isConnected=false,f=>f.portrait.noRects=true,f=>f.root.rect.width=0,f=>f.portrait.rect.left=NaN,f=>f.portrait.rect.width=4,f=>f.portrait.rect.height=4]){
  const f=fixture();mutate(f);f.controller.refresh();assert.equal(f.clip.children.length,0);f.controller.dispose();
 }
});
test('portrait clipping is bounded by the arena interior',()=>{
 const f=fixture();f.portrait.rect={left:0,top:0,width:600,height:800};const rects=portraitWeatherRects(f.root);
 assert.deepEqual(rects,[{x:0,y:0,width:374,height:526,rx:5}]);f.controller.dispose();
});
test('unexpected DOM sizes and thrown geometry fail closed',()=>{
 const f=fixture();for(let i=0;i<32;i++)f.root.append(new Node('div','arena-portrait',{...f.portrait.rect}));assert.deepEqual(portraitWeatherRects(f.root),[]);f.controller.refresh();assert.equal(f.clip.children.length,0);f.controller.dispose();
 const g=fixture();for(let i=0;i<161;i++)g.root.append(new Node('button','',{left:0,top:0,width:1,height:1}));assert.deepEqual(portraitWeatherRects(g.root),[]);g.controller.dispose();
 const h=fixture();h.portrait.getBoundingClientRect=()=>{throw Error('detached renderer')};assert.doesNotThrow(()=>h.controller.refresh());assert.equal(h.clip.children.length,0);h.controller.dispose();
});
test('geometry signatures prevent unnecessary writes and the SVG ignores its own mutation records',()=>{
 const f=fixture(),writes=f.clip.writes;f.controller.refresh();f.resized[0].fn();assert.equal(f.clip.writes,writes);
 f.mutated[0].fn([{target:f.clip,addedNodes:f.clip.children,removedNodes:[]}]);assert.equal(f.clip.writes,writes);
 f.portrait.rect.width=80;f.resized[0].fn();assert.equal(f.clip.writes,writes+1);assert.equal(f.clip.children[0].attributes.width,'74');f.controller.dispose();
});
test('hero replacement and async art insertion refresh masks and resize observation without per-frame work',()=>{
 const f=fixture(),old=f.portrait;old.remove();const replacement=new Node('div','arena-portrait',{left:180,top:120,width:70,height:70});f.hero.append(replacement);
 f.mutated[0].fn([{target:f.hero,addedNodes:[replacement],removedNodes:[old]}]);assert.ok(f.resized[0].removed.includes(old));assert.ok(f.resized[0].observed.has(replacement));assert.equal(f.clip.children[0].attributes.x,'141');
 replacement.rect.left=190;const art=new Node('img');replacement.append(art);f.mutated[0].fn([{target:replacement,addedNodes:[art],removedNodes:[]}]);assert.equal(f.clip.children[0].attributes.x,'151');f.controller.dispose();
});
test('hero animations and transitions temporarily empty the clip; decorative animations do not',()=>{
 const f=fixture();for(const [start,end,name]of [['animationstart','animationend','animationName'],['transitionrun','transitioncancel','propertyName']]){
  f.root.emit(start,f.portrait,{[name]:'hit'});assert.equal(f.clip.children.length,0);f.controller.refresh();assert.equal(f.clip.children.length,0);
  f.root.emit(end,f.portrait,{[name]:'hit'});assert.equal(f.clip.children.length,1);
 }
 const weather=new Node('img','savanna-dust__layer');f.root.append(weather);f.root.emit('animationstart',weather,{animationName:'savanna-dust-pass'});assert.equal(f.clip.children.length,1);f.controller.dispose();
});
test('overlapping motion names and disconnected heroes do not restore unsafe or stale masks',()=>{
 const f=fixture();f.root.emit('animationstart',f.hero,{animationName:'lunge'});f.root.emit('animationstart',f.hero,{animationName:'hit'});f.root.emit('animationend',f.hero,{animationName:'hit'});assert.equal(f.clip.children.length,0);
 f.root.emit('animationcancel',f.hero,{animationName:'lunge'});assert.equal(f.clip.children.length,1);
 f.root.emit('animationstart',f.hero,{animationName:'removed'});f.hero.remove();f.controller.refresh();assert.equal(f.clip.children.length,0);
 const hero=new Node('div','arena-hero');hero.append(new Node('div','arena-portrait',{left:80,top:120,width:70,height:70}));f.root.append(hero);f.controller.refresh();assert.equal(f.clip.children.length,1);f.controller.dispose();
});
test('native animation introspection clears stale event bookkeeping and blocks active card animation',()=>{
 const f=fixture();let animations=[];f.root.getAnimations=()=>animations;f.root.emit('animationstart',f.hero,{animationName:'stale'});f.controller.refresh();assert.equal(f.clip.children.length,1);
 animations=[{playState:'running',effect:{target:f.portrait}}];f.controller.refresh();assert.equal(f.clip.children.length,0);
 animations=[{playState:'finished',effect:{target:f.portrait}}];f.controller.refresh();assert.equal(f.clip.children.length,1);f.controller.dispose();
});
test('dispose disconnects both observers, removes all motion listeners and releases SVG exactly once',()=>{
 const f=fixture();assert.equal(f.root.count(),6);f.controller.dispose();f.controller.dispose();assert.equal(f.root.count(),0);assert.equal(f.resized[0].disconnected,true);assert.equal(f.mutated[0].disconnected,true);assert.deepEqual(f.root.children,[f.hero]);
 const writes=f.clip.writes;f.resized[0].fn();f.mutated[0].fn([{target:f.hero,addedNodes:[f.portrait],removedNodes:[]}]);f.controller.refresh();assert.equal(f.clip.writes,writes);
});
test('unsupported clip CSS fails closed and missing or throwing observers are optional',()=>{
 const f=fixture({cssSupport:false});assert.equal(f.controller.enabled,false);assert.equal(f.svg,undefined);f.controller.dispose();
 const g=fixture({observers:false});assert.equal(g.clip.children.length,1);g.controller.dispose();
 const root=g.root;class BrokenObserver{constructor(){throw Error('unsupported')}}const clip=createPortraitWeatherClip(root,{...g.options,ResizeObserver:BrokenObserver,MutationObserver:BrokenObserver});assert.equal(clip.enabled,true);clip.dispose();
});
test('shared helper has no timers, frame loop, injected HTML, external assets or gameplay dependencies',()=>{
 const js=readFileSync(new URL('../public/arena-portrait-weather.js',import.meta.url),'utf8');assert.doesNotMatch(js,/setTimeout|setInterval|requestAnimationFrame|innerHTML|outerHTML|insertAdjacentHTML|fetch\(|battle-engine|Math\.random/);assert.match(js,/createElementNS/);assert.match(js,/clipPathUnits','userSpaceOnUse/);
});

test('missing or throwing CSS capability checks fail closed before adding any SVG or observer',()=>{
 for(const css of [undefined,{}, {supports:()=>{throw Error('unavailable CSS check')}}, {supports:()=>1}]){
  const f=fixture();f.controller.dispose();f.document.defaultView.CSS=css;
  const clip=createPortraitWeatherClip(f.root,f.options);
  assert.equal(clip.enabled,false);assert.equal(clip.styleValue,'inset(50%)');assert.deepEqual(f.root.children,[f.hero]);assert.equal(f.root.count(),0);
  assert.doesNotThrow(()=>{clip.refresh();clip.dispose();clip.dispose();});assert.deepEqual(f.root.children,[f.hero]);
 }
});
test('new overlapping controls invalidate the mask even when the portrait size does not change',()=>{
 const f=fixture(),button=new Node('button','',{...f.portrait.rect});f.root.append(button);
 f.mutated[0].fn([{target:f.root,addedNodes:[button],removedNodes:[]}]);assert.equal(f.clip.children.length,0);
 button.remove();f.mutated[0].fn([{target:f.root,addedNodes:[],removedNodes:[button]}]);assert.equal(f.clip.children.length,1);f.controller.dispose();
});
