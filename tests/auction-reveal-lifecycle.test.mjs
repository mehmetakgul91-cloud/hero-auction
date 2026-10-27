import test from 'node:test';
import assert from 'node:assert/strict';
import {mountTailReveal} from '../public/auction-tail-reveal.js';
import {flyAwardCard} from '../public/auction-card-flight.js';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function dom(){
 const animations=[];
 const doc={activeElement:null,defaultView:{innerWidth:390,innerHeight:844},documentElement:{clientWidth:390,clientHeight:844}};
 doc.createElement=tag=>{
  const classes=new Set();
  return {ownerDocument:doc,tag,get className(){return [...classes].join(" ");},set className(value){classes.clear();value.split(/\s+/).filter(Boolean).forEach(x=>classes.add(x));},children:[],style:{setProperty(){}},classList:{add:(...xs)=>xs.forEach(x=>classes.add(x)),remove:(...xs)=>xs.forEach(x=>classes.delete(x)),contains:x=>classes.has(x)},setAttribute(){},removeAttribute(){},focus(){doc.activeElement=this;},querySelectorAll:()=>[],getBoundingClientRect:()=>({left:80,top:150,width:220,height:300}),get isConnected(){return this===doc.body||!!this.parentNode?.isConnected;},remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(x=>x!==this);this.parentNode=null;},append(...nodes){nodes.forEach(node=>{this.children.push(node);node.parentNode=this;});},prepend(...nodes){nodes.forEach(node=>{this.children.unshift(node);node.parentNode=this;});},replaceChildren(...nodes){this.children.forEach(node=>node.parentNode=null);this.children=[];this.append(...nodes);},cloneNode(){return doc.createElement(tag);},animate(frames,options){let resolve;const animation={duration:options.duration,finished:new Promise(r=>resolve=r),resolve(){this.resolved=true;resolve();},cancelled:0,cancel(){this.cancelled++;resolve();}};animations.push(animation);return animation;}};
 };
 doc.body=doc.createElement('body');const root=doc.createElement('div'),destination=doc.createElement('div');doc.body.append(root,destination);return {doc,root,destination,animations};
}
for(const reducedMotion of [false,true])test(`mounted queue opens every card before results (reduced motion=${reducedMotion})`,async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const {root,destination,animations}=dom(),arrivals=[],completed=[];
 const items=[1,2,3,4].map(n=>({seat:n%2,card:{name:'Hero '+n,universe:'original',rarity:'rare'}}));
 const queue=mountTailReveal(root,null,items,{reducedMotion,onArrive:item=>arrivals.push(item),onComplete:result=>completed.push(result),resolveDestination:()=>destination});
 for(let i=0;i<items.length;i++){
  const panel=root.children[0],holder=panel.children[1],art=holder.children[0].children[1];
  assert.equal(art.children[0].textContent,items[i].card.name);assert.equal(completed.length,0);
  t.mock.timers.tick(reducedMotion?700:1800);await flush();
  if(!reducedMotion){assert.equal(arrivals.length,i);animations.find(a=>a.duration===1400&&!a.cancelled&&!a.resolved).resolve();await flush();}
  assert.equal(arrivals.length,i+1);assert.equal(queue.active,true);
  t.mock.timers.tick(reducedMotion?200:550);await flush();
 }
 assert.equal(queue.active,true);assert.equal(queue.reviewing,true);assert.equal(completed.length,0);assert.deepEqual(arrivals,items);
 const panel=root.children[0];assert.equal(panel.children[1].children[0].children.length,items.length);assert.equal(panel.children[2].hidden,true);t.mock.timers.tick(500);panel.children[3].onclick();
 assert.equal(queue.active,false);assert.equal(completed.length,1);assert.equal(root.children.length,0);
 if(reducedMotion)assert.equal(animations.length,0,'no flight or pulse motion');
});
test('Web Animation that never resolves has a bounded receipt and cleans up its ghost',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const {doc,root,destination,animations}=dom();
 const handle=flyAwardCard({element:root,rect:root.getBoundingClientRect()},destination,{duration:1400,doc});
 assert.equal(doc.body.children.length,3);t.mock.timers.tick(2149);assert.equal(doc.body.children.length,3);
 t.mock.timers.tick(1);assert.deepEqual(await handle.finished,{arrived:true});assert.equal(doc.body.children.length,2);assert.equal(animations[0].cancelled,1);
});
test('cancel before flight watchdog cannot produce a late receipt',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const {doc,root,destination,animations}=dom();
 const handle=flyAwardCard({element:root,rect:root.getBoundingClientRect()},destination,{doc});handle.cancel();
 assert.deepEqual(await handle.finished,{arrived:false});t.mock.timers.tick(10000);await flush();assert.equal(animations.length,1);assert.equal(doc.body.children.length,2);
});
test('skip restores focus intent and cancellation cannot complete an old mounted sequence',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const {doc,root}=dom(),ends=[];
 const item={seat:0,card:{name:'Hero',universe:'original'}};
 const old=mountTailReveal(root,null,[item],{onComplete:result=>ends.push(result)});old.cancel();t.mock.timers.tick(10000);await flush();assert.deepEqual(ends,[]);
 mountTailReveal(root,null,[item],{onComplete:result=>ends.push(result)});const skip=root.children[0].children[2];doc.activeElement=skip;skip.onclick();skip.onclick();assert.deepEqual(ends,[]);t.mock.timers.tick(500);assert.equal(doc.activeElement,root.children[0].children[3]);
 const proceed=root.children[0].children[3];proceed.onclick();proceed.onclick();assert.deepEqual(ends,[{restoreFocus:true}]);
});
test('SSE recovery fetch is applied; old connections cannot repaint or clear a replacement session',async()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),start=app.indexOf('async function syncRoomSnapshot('),end=app.indexOf('\nfunction cancelAwardFlights',start);
 const sources=[],timers=[],shown=[];let release;
 const current={code:'123',token:'seat'},done={code:'123',phase:'finished',revision:5};
 const context={session:current,room:{code:'123',phase:'auction',revision:4},stream:null,login:{authToken:'auth'},post:()=>new Promise(r=>release=r),show:room=>shown.push(room),setTimeout:fn=>timers.push(fn),EventSource:class{constructor(){sources.push(this)}close(){}},encodeURIComponent};
 vm.createContext(context);vm.runInContext(app.slice(start,end),context);context.connect();sources[0].onerror();const recovery=timers.shift()();release({room:done});await recovery;assert.deepEqual(shown,[done]);
 context.session={code:'456',token:'new'};context.connect();sources[0].onmessage({data:JSON.stringify(done)});sources[0].onerror();assert.deepEqual(shown,[done]);assert.equal(timers.length,0);
});

test('frozen CSS flip settles to a visible nonzero-width face before every tail flight',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const {doc,root,destination,animations}=dom(),create=doc.createElement;
 doc.createElement=tag=>{const node=create(tag),rect=node.getBoundingClientRect;node.getBoundingClientRect=()=>({...rect(),width:node.classList.contains('card-art')&&node.parentNode?.classList.contains('auction-drawing')?0:220});return node;};
 const arrivals=[],ends=[],items=[1,2,3,4].map(n=>({seat:n%2,card:{name:'Frozen '+n,universe:'original'}}));
 const queue=mountTailReveal(root,null,items,{resolveDestination:()=>destination,onArrive:item=>arrivals.push(item),onComplete:()=>ends.push(true)});
 for(let index=0;index<items.length;index++){
  const scene=root.children[0].children[1].children[0],art=scene.children[1];assert.equal(art.getBoundingClientRect().width,0);
  t.mock.timers.tick(999);assert.equal(art.getBoundingClientRect().width,0);t.mock.timers.tick(1);assert.equal(art.getBoundingClientRect().width,220);assert.equal(scene.classList.contains('auction-drawing'),false);
  t.mock.timers.tick(799);assert.equal(animations.filter(a=>a.duration===1400).length,index,'readable hold before flight');t.mock.timers.tick(1);
  const flight=animations.filter(a=>a.duration===1400).at(-1);assert.ok(flight);flight.resolve();await flush();assert.equal(arrivals.length,index+1);
  assert.equal(ends.length,0);t.mock.timers.tick(550);await flush();
 }
 assert.deepEqual(arrivals,items);assert.deepEqual(ends,[]);assert.equal(queue.reviewing,true);t.mock.timers.tick(500);root.children[0].children[3].onclick();assert.deepEqual(ends,[true]);assert.equal(queue.active,false);
});
test('cancelled flip fallback cannot settle a newer scene or complete an old queue',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const {root}=dom(),ends=[],item={seat:0,card:{name:'Hero',universe:'original'}};
 const old=mountTailReveal(root,null,[item],{onComplete:()=>ends.push(true)});t.mock.timers.tick(500);old.cancel();
 const next=mountTailReveal(root,null,[item],{onComplete:()=>ends.push(true)}),scene=root.children[0].children[1].children[0];
 t.mock.timers.tick(500);assert.equal(scene.classList.contains('auction-drawing'),true);t.mock.timers.tick(500);assert.equal(scene.classList.contains('auction-drawing'),false);next.cancel();t.mock.timers.tick(10000);assert.deepEqual(ends,[]);
});

for(const me of [0,1])test(`show all keeps every remaining hero and value visible until separate confirmation for seat ${me}`,async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const {root}=dom(),ends=[],reviews=[];
 const items=[{seat:0,card:{name:'First',power:77,cost:4}},{seat:1,card:{name:'Second',power:89,cost:5}}];
 let release;const startAfter=new Promise(resolve=>release=resolve);
 const queue=mountTailReveal(root,null,items,{me,startAfter,onReview:()=>reviews.push(true),onComplete:()=>ends.push(true)});
 const panel=root.children[0],skip=panel.children[2],proceed=panel.children[3];
 proceed.onclick();assert.deepEqual(ends,[],'hidden confirmation cannot skip the reveal');
 skip.onclick();skip.onclick();queue.skip();assert.equal(queue.reviewing,true);assert.equal(queue.active,true);assert.deepEqual(ends,[]);assert.deepEqual(reviews,[true]);proceed.onclick();assert.deepEqual(ends,[],'rapid second click must not confirm');
 const rows=panel.children[1].children[0].children;assert.equal(rows.length,2);
 assert.deepEqual(rows.map(row=>row.children[1].children[1].textContent),['First','Second']);
 assert.match(rows[0].children[1].children[2].textContent,/77 \/ 100.*4 kredi/);
 assert.match(rows[1].children[1].children[2].textContent,/89 \/ 100.*5 kredi/);
 release();await flush();t.mock.timers.tick(10000);await flush();assert.equal(panel.children[1].children[0].children.length,2);assert.deepEqual(ends,[]);
 proceed.onclick();proceed.onclick();assert.deepEqual(ends,[true]);assert.equal(queue.active,false);
});
test('cancelled review never confirms and late artwork cannot alter its replacement',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const {root}=dom(),ends=[],art=[];
 const items=[{seat:0,card:{name:'First',power:77,cost:4}}];
 const queue=mountTailReveal(root,null,items,{loadArt:()=>new Promise(resolve=>art.push(resolve)),onComplete:()=>ends.push(true)});
 queue.skip();const oldPanel=root.children[0],oldProceed=oldPanel.children[3];queue.cancel();
 const next=mountTailReveal(root,null,items,{onComplete:()=>ends.push(true)});oldProceed.onclick();art.forEach(resolve=>resolve('/old.png'));await flush();
 assert.deepEqual(ends,[]);assert.equal(root.children.length,1);assert.equal(root.children[0].children[1].children[0].children[1].children.length,2);next.cancel();
});
test('review confirmation rejects rapid double-clicks and repeated held-key activation',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const {root}=dom(),ends=[];
 const queue=mountTailReveal(root,null,[{seat:0,card:{name:'Hero',power:77,cost:4}}],{onComplete:()=>ends.push(true)});queue.skip();
 const proceed=root.children[0].children[3];assert.equal(proceed.disabled,true);proceed.onclick({detail:1});assert.deepEqual(ends,[]);
 t.mock.timers.tick(499);proceed.onclick({detail:1});assert.deepEqual(ends,[]);t.mock.timers.tick(1);assert.equal(proceed.disabled,false);
 proceed.onclick({detail:2});assert.deepEqual(ends,[]);let prevented=0;proceed.onkeydown({key:'Enter',repeat:true,preventDefault(){prevented++;}});proceed.onkeydown({key:' ',repeat:true,preventDefault(){prevented++;}});assert.equal(prevented,2);
 proceed.onclick({detail:1});assert.deepEqual(ends,[true]);
});
