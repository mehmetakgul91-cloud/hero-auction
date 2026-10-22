import test from 'node:test';
import assert from 'node:assert/strict';
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
