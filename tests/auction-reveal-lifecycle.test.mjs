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
  return {ownerDocument:doc,tag,children:[],style:{setProperty(){}},classList:{add:(...xs)=>xs.forEach(x=>classes.add(x)),remove:(...xs)=>xs.forEach(x=>classes.delete(x)),contains:x=>classes.has(x)},setAttribute(){},removeAttribute(){},querySelectorAll:()=>[],getBoundingClientRect:()=>({left:80,top:150,width:220,height:300}),get isConnected(){return this===doc.body||!!this.parentNode?.isConnected;},remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(x=>x!==this);this.parentNode=null;},append(...nodes){nodes.forEach(node=>{this.children.push(node);node.parentNode=this;});},prepend(...nodes){nodes.forEach(node=>{this.children.unshift(node);node.parentNode=this;});},replaceChildren(...nodes){this.children.forEach(node=>node.parentNode=null);this.children=[];this.append(...nodes);},cloneNode(){return doc.createElement(tag);},animate(frames,options){let resolve;const animation={duration:options.duration,finished:new Promise(r=>resolve=r),resolve(){this.resolved=true;resolve();},cancelled:0,cancel(){this.cancelled++;resolve();}};animations.push(animation);return animation;}};
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
 assert.equal(queue.active,false);assert.equal(completed.length,1);assert.deepEqual(arrivals,items);assert.equal(root.children.length,0);
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
 mountTailReveal(root,null,[item],{onComplete:result=>ends.push(result)});const skip=root.children[0].children[2];doc.activeElement=skip;skip.onclick();assert.deepEqual(ends,[{restoreFocus:true}]);
});
test('SSE recovery fetch is applied; old connections cannot repaint or clear a replacement session',async()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),start=app.indexOf('async function syncRoomSnapshot('),end=app.indexOf('\nfunction cancelAwardFlights',start);
 const sources=[],timers=[],shown=[];let release;
 const current={code:'123',token:'seat'},done={code:'123',phase:'finished',revision:5};
 const context={session:current,room:{code:'123',phase:'auction',revision:4},stream:null,login:{authToken:'auth'},post:()=>new Promise(r=>release=r),show:room=>shown.push(room),setTimeout:fn=>timers.push(fn),EventSource:class{constructor(){sources.push(this)}close(){}},encodeURIComponent};
 vm.createContext(context);vm.runInContext(app.slice(start,end),context);context.connect();sources[0].onerror();const recovery=timers.shift()();release({room:done});await recovery;assert.deepEqual(shown,[done]);
 context.session={code:'456',token:'new'};context.connect();sources[0].onmessage({data:JSON.stringify(done)});sources[0].onerror();assert.deepEqual(shown,[done]);assert.equal(timers.length,0);
});
