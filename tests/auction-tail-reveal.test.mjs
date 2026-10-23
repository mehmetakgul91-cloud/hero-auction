import test from 'node:test';
import assert from 'node:assert/strict';
import {collectOfferedAwards} from '../public/auction-awards.js';
import {collectTailAwards,createTailQueue} from '../public/auction-tail-reveal.js';
import {readFileSync} from 'node:fs';
const card=n=>({name:'Hero '+n,universe:'original',cost:4,rarity:'rare'});
for(let count=1;count<=5;count++)for(const seat of [0,1])test(`${count} missing cards reveal individually for seat ${seat}`,()=>{
 const full=Array.from({length:5},(_,i)=>card(i)),short=Array.from({length:5-count},(_,i)=>card(5+i));
 const previous={code:'123',phase:'auction',card:card(4),players:seat===0?[{team:short},{team:full.slice(0,4)}]:[{team:full.slice(0,4)},{team:short}]};
 const final=seat===0?[{team:Array.from({length:5},(_,i)=>card(5+i))},{team:full}]:[{team:full},{team:Array.from({length:5},(_,i)=>card(5+i))}];
 const next={code:'123',phase:'finished',final};const before=JSON.stringify({previous,next});
 const items=collectTailAwards(previous,next);assert.equal(items.length,count);assert.ok(items.every(item=>item.seat===seat));
 assert.equal(JSON.stringify({previous,next}),before);
 const shown=[],tasks=[];let finishes=0;
 const queue=createTailQueue({show:(item,index,total)=>shown.push([item.card.name,index,total]),finish:()=>finishes++,schedule:fn=>(tasks.push(fn),tasks.length),unschedule:()=>{}});
 queue.start(items);assert.equal(shown.length,1);assert.equal(queue.active,true);
 while(tasks.length)tasks.shift()();
 assert.equal(shown.length,count);assert.equal(new Set(shown.map(x=>x[0])).size,count);assert.ok(shown.every(x=>x[2]===count));assert.equal(finishes,1);assert.equal(queue.active,false);
});
test('repeated final states, foreign rooms and cold restores do not replay awards',()=>{
 const next={code:'123',phase:'finished',final:[{team:[card(1)]},{team:[]}]};
 assert.deepEqual(collectTailAwards(next,next),[]);assert.deepEqual(collectTailAwards(null,next),[]);
 assert.deepEqual(collectTailAwards({code:'456',phase:'auction'},next),[]);
});
test('cancel, skip, reduced motion and replacement invalidate stale timers',()=>{
 const shown=[],tasks=[];let finished=0;
 const queue=createTailQueue({show:item=>shown.push(item),finish:()=>finished++,schedule:fn=>(tasks.push(fn),tasks.length),unschedule:()=>{}});
 queue.start([1,2,3]);queue.cancel();tasks.shift()();assert.deepEqual(shown,[1]);assert.equal(queue.active,false);
 queue.start([4,5]);queue.skip();tasks.shift()();assert.deepEqual(shown,[1,4]);
 queue.start([6,7],{reducedMotion:true});assert.deepEqual(shown,[1,4]);assert.equal(queue.active,false);
 queue.start([8,9]);queue.start([10]);while(tasks.length)tasks.shift()();assert.deepEqual(shown,[1,4,8,10]);assert.equal(finished,4);
});
test('entry waits for queue and repeated snapshots do not restart it; deck reveals have no gameplay writes',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const module=readFileSync(new URL('../public/auction-tail-reveal.js',import.meta.url),'utf8');
 assert.match(app,/tailReveal.signature===JSON.stringify\(r.final\)/);
 assert.match(app,/entryButton.onclick=\(\)=>\{if\(tailReveal\?\.active\)return/);
 assert.match(app,/pagehide.*tailReveal\?\.cancel/);
 assert.match(module,/button.disabled=true/);assert.match(module,/button.disabled=false/);
 assert.doesNotMatch(module,/credits\s*[-+]=|\/api\/(bid|pass|rematch)|deadline\s*=/);
});

test('slower queue gives every card 1800ms before arrival and only completion or skip opens results',()=>{
 const timers=[],completed=[];
 const queue=createTailQueue({show:()=>{},finish:value=>completed.push(value),schedule:(fn,ms)=>(timers.push({fn,ms}),timers.length),unschedule:()=>{}});
 queue.start([1,2]);assert.equal(timers[0].ms,1800);assert.deepEqual(completed,[]);
 timers.shift().fn();assert.deepEqual(completed,[]);assert.equal(timers[0].ms,1800);
 timers.shift().fn();assert.deepEqual(completed,[true]);
 queue.start([3,4]);queue.cancel();assert.deepEqual(completed,[true,false]);
 timers.shift().fn();assert.deepEqual(completed,[true,false]);
 queue.start([5]);queue.skip();assert.deepEqual(completed,[true,false,true]);
});

import vm from 'node:vm';
test('actual show transition keeps auction visible through all tails and deduplicates snapshots',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const start=app.indexOf('function show(r)');
 const end=app.indexOf(" window.HeroPlatform?.gameplay(r.phase==='auction')",start);
 assert.ok(end>start);
 for(let count=0;count<=5;count++)for(const seat of [0,1]){
  const full=Array.from({length:5},(_,i)=>card(i));
  const final=seat===0?[{team:Array.from({length:5},(_,i)=>card(5+i))},{team:full}]:[{team:full},{team:Array.from({length:5},(_,i)=>card(5+i))}];
  const previous={code:'123',phase:'auction',card:card(4),players:final.map((p,i)=>({team:p.team.slice(0,i===seat?5-count:4)}))};
  const elements={stage:{replaceChildren(){},querySelectorAll:()=>[],children:[]},game:{dataset:{phase:'auction'},classList:{remove(){},add(){},contains:()=>false}},player0:{},player1:{},phase:{}};
  let mounts=0,options;
  const context={esc:String,displaySeat:(seat,me)=>seat===me?0:1,room:previous,tailReveal:null,awardFlights:new Set(),collectTailAwards,collectOfferedAwards,cancelAwardFlights:()=>{},animateWonAuctionCard:()=>Promise.resolve(),Promise,signedIn:()=>true,cancelAuctionReveal:()=>{},renderChat:()=>{},refreshGold:()=>{},$:id=>elements[id],window:{matchMedia:()=>({matches:false})},document:{documentElement:{lang:'en'},querySelector:()=>null},results:0,mountTailReveal:(root,button,items,opts)=>{
   mounts++;assert.equal(items.length,count);options=opts;return {active:true,cancel:()=>{}};
  }};
  vm.createContext(context);vm.runInContext(app.match(/const displayPlayerName=[^;]+;/)[0],context);vm.runInContext(app.slice(start,end)+" results++;room=r;$('game').dataset.phase=r.phase;}",context);
  const next={code:'123',phase:'finished',final,me:seat};context.show(next);
  assert.equal(context.results,0);assert.equal(elements.game.dataset.phase,'auction');assert.equal(context.room,next);
  context.show({...next});assert.equal(mounts,1);assert.equal(context.results,0);
  options.onComplete();assert.equal(context.results,1);assert.equal(elements.game.dataset.phase,'finished');
  context.show(next);assert.equal(mounts,1);
 }
});


test('next card and results wait for actual flight completion',async()=>{
 const shown=[],tasks=[],flights=[],finished=[];
 const queue=createTailQueue({show:x=>shown.push(x),finish:x=>finished.push(x),schedule:fn=>(tasks.push(fn),tasks.length),unschedule:()=>{},arrive:()=>{let done;const finished=new Promise(resolve=>done=resolve);const flight={finished,done,cancel(){done()}};flights.push(flight);return flight;}});
 queue.start([1,2]);assert.deepEqual(shown,[1]);tasks.shift()();assert.deepEqual(shown,[1]);assert.equal(queue.active,true);
 flights[0].done();await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(shown,[1,2]);assert.deepEqual(finished,[]);
 tasks.shift()();assert.deepEqual(finished,[]);flights[1].done();await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(finished,[true]);
});
test('cancel during flight never advances stale queue or opens results',async()=>{
 let cancelCount=0,done;const tasks=[],shown=[],ends=[];
 const queue=createTailQueue({show:x=>shown.push(x),finish:x=>ends.push(x),schedule:fn=>(tasks.push(fn),tasks.length),unschedule:()=>{},arrive:()=>({finished:new Promise(r=>done=r),cancel(){cancelCount++;done()}})});
 queue.start([1,2]);tasks.shift()();queue.cancel();await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(shown,[1]);assert.deepEqual(ends,[false]);assert.equal(cancelCount,1);
});
test('prior offered-card flight completes before tail starts, including skip/cancel while waiting',async()=>{
 for(const mode of ['complete','skip','cancel']){
  let release;const before=new Promise(r=>release=r),shown=[],ends=[];
  const queue=createTailQueue({show:x=>shown.push(x),finish:x=>ends.push(x),schedule:()=>1,unschedule:()=>{}});
  queue.start([1],{startAfter:before});assert.equal(queue.active,true);assert.deepEqual(shown,[]);
  if(mode!=='complete')queue[mode]();release();await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(shown,mode==='complete'?[1]:[]);assert.deepEqual(ends,mode==='complete'?[]:[mode==='skip']);queue.cancel();
 }
});
import {awardFlightGeometry,flyAwardCard} from '../public/auction-card-flight.js';
test('flight fits actual receiver interior without viewport-clamping its endpoint',()=>{
 const source={left:140,top:200,width:240,height:320};
 for(const left of [-200,0,350,900])for(const top of [-400,30,1800])for(const width of [12,60,120]){
  const target={left,top,width,height:40};
  const g=awardFlightGeometry(source,target,{width:390,height:844});
  assert.equal(g.left+g.width/2+g.dx,target.left+target.width/2);
  assert.equal(g.top+g.height/2+g.dy,target.top+target.height/2);
  assert.ok(g.width*g.scale<=target.width-8+.00001);
  assert.ok(g.height*g.scale<=target.height-8+.00001);
  assert.ok(g.scale<=1);
 }
});
test('flight without visual target and reduced motion finish safely',async()=>{
 await flyAwardCard(null,null).finished;
 await flyAwardCard({element:{}},{},{reducedMotion:true}).finished;
});

test('flight cleans up ghost and resolves on arrival or cancellation',async()=>{
 for(const cancel of [false,true]){
  let resolveAnimation,cancelled=0,removed=0,ghost;
  const doc={defaultView:{innerWidth:390,innerHeight:844},body:{append(node){ghost=node}},createElement:()=>({})};
  const source={ownerDocument:doc,cloneNode(){return {style:{},classList:{add(){}},removeAttribute(){},querySelectorAll:()=>[],setAttribute(){},remove(){removed++},animate(){return {finished:new Promise(r=>resolveAnimation=r),cancel(){cancelled++;resolveAnimation()}}}}}};
  const handle=flyAwardCard({element:source,rect:{left:60,top:120,width:200,height:280}},{getBoundingClientRect:()=>({left:300,top:60,width:80,height:50})});
  assert.ok(ghost);assert.equal(removed,0);
  if(cancel)handle.cancel();else resolveAnimation();
  assert.deepEqual(await handle.finished,{arrived:!cancel});assert.equal(removed,1);assert.equal(cancelled,cancel?1:0);
  handle.cancel();assert.equal(removed,1);
 }
});

test('empty tail waits for final offered flight and cancel invalidates pending completion',async()=>{
 for(const mode of ['arrive','cancel','skip']){
  let release;const startAfter=new Promise(r=>release=r),ends=[],shown=[];
  const queue=createTailQueue({show:item=>shown.push(item),finish:x=>ends.push(x)});
  queue.start([],{startAfter});assert.equal(queue.active,true);assert.deepEqual(ends,[]);
  if(mode!=='arrive')queue[mode]();release();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(queue.active,false);assert.deepEqual(shown,[]);assert.deepEqual(ends,[mode!=='cancel']);
 }
});
test('results wait for all outstanding purchase flights, not just the final one',async()=>{
 let first,second;const one=new Promise(r=>first=r),two=new Promise(r=>second=r),ends=[];
 const queue=createTailQueue({show:()=>assert.fail('no tail'),finish:x=>ends.push(x)});
 queue.start([],{startAfter:Promise.all([one,two])});first();await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(ends,[]);assert.equal(queue.active,true);
 second();await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(ends,[true]);assert.equal(queue.active,false);
});

test('actual flight arrival pulses real receiver and reports each landed tail only once',async()=>{
 const targets=[0,1].map(()=>({pulses:0,isConnected:true,getBoundingClientRect:()=>({left:300,top:60,width:58,height:44}),animate(){this.pulses++;return {finished:Promise.resolve(),cancel(){}}}}));
 const flightEnds=[],frames=[],tasks=[],landed=[],ends=[];
 const doc={defaultView:{innerWidth:390,innerHeight:844},body:{append(){}},createElement:()=>({})};
 const source={ownerDocument:doc,cloneNode(){return {style:{},classList:{add(){}},removeAttribute(){},querySelectorAll:()=>[],setAttribute(){},remove(){},animate(keyframes){frames.push(keyframes);let done;const finished=new Promise(r=>done=r);flightEnds.push(done);return {finished,cancel(){done()}}}}}};
 const items=[{card:card(1),seat:0},{card:card(2),seat:1}];
 const queue=createTailQueue({show(){},finish:x=>ends.push(x),schedule:fn=>(tasks.push(fn),tasks.length),unschedule(){},onArrive:item=>landed.push(item),arrive:item=>flyAwardCard({element:source,rect:{left:60,top:120,width:200,height:280}},targets[item.seat])});
 queue.start(items);tasks.shift()();assert.deepEqual(landed,[]);assert.equal(frames[0].at(-1).opacity,1);
 flightEnds.shift()();await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(landed,[items[0]]);assert.equal(targets[0].pulses,1);
 tasks.shift()();tasks.shift()();flightEnds.shift()();await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(landed,items);assert.equal(targets[1].pulses,1);assert.deepEqual(ends,[]);assert.equal(queue.active,true);tasks.shift()();assert.deepEqual(ends,[true]);
});
test('failed, skipped, cancelled and replaced flights cannot report stale arrivals',async()=>{
 for(const mode of ['skip','cancel','replace','failed']){
  const tasks=[],landed=[];let resolve;
  const queue=createTailQueue({show(){},finish(){},schedule:fn=>(tasks.push(fn),tasks.length),unschedule(){},onArrive:item=>landed.push(item),arrive:()=>({finished:new Promise(r=>resolve=r),cancel(){}})});
  queue.start([{card:card(1),seat:0}]);tasks.shift()();
  if(mode==='replace')queue.start([]);else if(mode!=='failed')queue[mode]();
  resolve({arrived:mode!=='failed'});await new Promise(done=>setImmediate(done));assert.deepEqual(landed,[]);
 }
});

test('last receiver arrival is painted during cancellable 550ms dwell before results',async()=>{
 for(const mode of ['complete','cancel','skip','replace']){
  const tasks=[],ends=[],landed=[];let resolve;
  const queue=createTailQueue({show(){},finish:x=>ends.push(x),onArrive:item=>landed.push(item),schedule:(fn,ms)=>(tasks.push({fn,ms}),tasks.length),unschedule(){},arrive:()=>({finished:new Promise(r=>resolve=r),cancel(){}})});
  queue.start([{card:card(1),seat:0}]);tasks.shift().fn();resolve({arrived:true});await new Promise(done=>setImmediate(done));
  assert.equal(landed.length,1);assert.deepEqual(ends,[]);assert.equal(queue.active,true);
  const dwell=tasks.shift();assert.equal(dwell.ms,550);
  if(mode==='replace')queue.start([]);else if(mode!=='complete')queue[mode]();
  dwell.fn();assert.deepEqual(ends,[mode!=='cancel']);assert.equal(queue.active,false);assert.equal(landed.length,1);
 }
});

test('actual app arrival inserts each of 1–5 receipts into correct receiver box for either local seat',async()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const start=app.indexOf('function show(r)'),end=app.indexOf(" window.HeroPlatform?.gameplay(r.phase==='auction')",start);
 for(const me of [0,1])for(const receiver of [0,1])for(let count=1;count<=5;count++){
  const final=[0,1].map(seat=>({name:'Player '+seat,team:Array.from({length:5},(_,i)=>card(seat*5+i))}));
  const offered=final[1-receiver].team[4];
  const previous={code:'receipts',me,phase:'auction',card:offered,players:final.map((p,seat)=>({...p,team:p.team.slice(0,seat===receiver?5-count:4)}))};
  const makeBox=()=>({markup:'',count:{textContent:''},slot:{innerHTML:''},set innerHTML(html){this.markup=html;this.count.textContent=html.match(/class="delivery-count">([^<]+)/)?.[1]||'';this.slot.innerHTML='Receiving cards'},get innerHTML(){return this.markup},querySelector(selector){return selector==='.delivery-count'?this.count:this.slot}});
  const classes=new Set(),elements={stage:{children:[],querySelectorAll:()=>[]},game:{dataset:{phase:'auction'},classList:{remove:(...xs)=>xs.forEach(x=>classes.delete(x)),add:x=>classes.add(x),contains:x=>classes.has(x)}},phase:{},player0:makeBox(),player1:makeBox()};
  let options,items;
  const context={esc:String,displaySeat:(seat,local)=>seat===local?0:1,room:previous,tailReveal:null,awardFlights:new Set(),collectTailAwards,collectOfferedAwards,cancelAwardFlights(){},animateWonAuctionCard:()=>Promise.resolve(),Promise,signedIn:()=>true,cancelAuctionReveal(){},renderChat(){},refreshGold(){},$:id=>elements[id],window:{matchMedia:()=>({matches:false})},document:{documentElement:{lang:'en'},querySelector:()=>null},results:0,mountTailReveal(root,button,awards,opts){items=awards;options=opts;return {active:true,cancel(){}}}};
  vm.createContext(context);vm.runInContext(app.match(/const displayPlayerName=[^;]+;/)[0],context);vm.runInContext(app.slice(start,end)+" results++;room=r;$('game').dataset.phase=r.phase;}",context);
  context.show({code:'receipts',me,phase:'finished',final});
  await options.startAfter;
  assert.equal(classes.has('auction-delivery-active'),true);
  assert.equal(items.length,count);
  const target=elements['player'+(receiver===me?0:1)],other=elements['player'+(receiver===me?1:0)];
  assert.equal(target.count.textContent,(5-count)+' / 5');assert.equal(other.count.textContent,'5 / 5');
  const otherMarkup=other.slot.innerHTML;
  assert.equal(options.resolveDestination(receiver),target.slot);
  for(let index=0;index<items.length;index++){
   options.onArrive(items[index]);
   assert.equal(target.count.textContent,(6-count+index)+' / 5');
   assert.ok(target.slot.innerHTML.includes('✓ '+items[index].card.name));
   assert.equal(other.count.textContent,'5 / 5');assert.equal(other.slot.innerHTML,otherMarkup);
   assert.equal(context.results,0);assert.equal(elements.game.dataset.phase,'auction');
  }
  assert.equal(target.count.textContent,'5 / 5');
  options.onComplete();assert.equal(context.results,1);assert.equal(elements.game.dataset.phase,'finished');
 }
});
