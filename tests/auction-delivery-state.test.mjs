import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {auctionMatchKey,isStaleAuctionSnapshot,createTailReceipts} from '../public/auction-delivery-state.js';
import {collectTailAwards} from '../public/auction-tail-reveal.js';
import {collectOfferedAwards,displaySeat} from '../public/auction-awards.js';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const card=n=>({name:'Hero '+n,universe:'original',cost:n%4+2,rarity:['common','advanced','rare','legendary'][n%4]});
function snapshots(receiver=1,count=2,me=0){
 const final=[0,1].map(seat=>({name:'Player '+seat,team:Array.from({length:5},(_,i)=>card(seat*5+i))}));
 const meta={code:'123',matchKey:'123:1:100',matchNumber:1,created:100,me};
 const before={...meta,revision:20,phase:'auction',round:9-count,card:final[1-receiver].team[4],players:final.map((p,seat)=>({...p,team:p.team.slice(0,seat===receiver?5-count:4)}))};
 const tailAwards=final[receiver].team.slice(5-count).map((card,i)=>({id:meta.matchKey+':'+(10-count+i)+':'+receiver,round:10-count+i,seat:receiver,card}));
 const done={...meta,revision:21,phase:'finished',round:10,final,players:final,tailAwards};return {before,done};
}
function harness(previous,{receipts=createTailReceipts(),reducedMotion=false}={}){
 const makeBox=()=>({count:{textContent:''},slot:{innerHTML:''},set innerHTML(html){this.count.textContent=html.match(/class="delivery-count">([^<]+)/)?.[1]||'';},querySelector(selector){return selector==='.delivery-count'?this.count:this.slot;}});
 const classes=new Set(),elements={stage:{children:[],querySelectorAll:()=>[]},game:{hidden:true,dataset:{phase:'auction'},classList:{remove:(...xs)=>xs.forEach(x=>classes.delete(x)),add:x=>classes.add(x)}},phase:{},'login-gate':{},home:{},'room-title':{},player0:makeBox(),player1:makeBox()};
 const queues=[];let cancels=0;
 const context={session:null,roomInvitesUI:{setRoom(){}},storefrontUI:{close(){}},friendsUI:{setRoom(){}},esc:String,displaySeat,auctionMatchKey,isStaleAuctionSnapshot,tailReceipts:receipts,room:previous,tailReveal:null,awardFlights:new Set(),collectTailAwards,collectOfferedAwards,cancelAwardFlights(){},animateWonAuctionCard:()=>Promise.resolve(),Promise,signedIn:()=>true,cancelAuctionReveal(){},renderChat(){},refreshGold(){},$:id=>elements[id],window:{matchMedia:()=>({matches:reducedMotion})},document:{documentElement:{lang:'en'},querySelector:()=>null},results:0,mountTailReveal(root,button,items,options){const queue={items,options,active:true,cancel(){this.active=false;cancels++;}};queues.push(queue);return queue;}};
 const start=app.indexOf('function show(r)'),end=app.indexOf(" window.HeroPlatform?.gameplay(r.phase==='auction')",start);
 vm.createContext(context);vm.runInContext(app.match(/const displayPlayerName=[^;]+;/)[0],context);vm.runInContext(app.slice(start,end)+" results++;room=r;$('game').dataset.phase=r.phase;}",context);
 return {context,elements,queues,get cancels(){return cancels;}};
}

test('regression: delayed HTTP auction response cannot cancel a final SSE reveal',()=>{
 const {before,done}=snapshots(),h=harness(before);h.context.show(done);h.context.show({...before,revision:19});
 assert.equal(h.queues.length,1);assert.equal(h.cancels,0);assert.equal(h.context.room,done);assert.equal(h.context.results,0);
 h.context.show({...done,revision:22,chat:[{message:'hello'}]});assert.equal(h.queues.length,1);assert.equal(h.cancels,0);
});
for(const me of [0,1])for(const receiver of [0,1])for(let count=1;count<=4;count++)test(`cold/reconnected client ${me} sees all ${count} tail cards for receiver ${receiver}`,async()=>{
 const {done}=snapshots(receiver,count,me),h=harness(null);h.context.show(done);assert.equal(h.elements.game.hidden,false);
 const queue=h.queues[0];assert.equal(queue.items.length,count);await queue.options.startAfter;
 const target=h.elements['player'+displaySeat(receiver,me)],other=h.elements['player'+displaySeat(1-receiver,me)];
 assert.equal(target.count.textContent,(5-count)+' / 5');assert.equal(other.count.textContent,'5 / 5');
 for(const [index,item] of queue.items.entries()){queue.options.onArrive(item);assert.equal(target.count.textContent,(6-count+index)+' / 5');assert.match(target.slot.innerHTML,new RegExp(item.card.name));assert.equal(h.context.results,0);}
 queue.options.onComplete();assert.equal(h.context.results,1);assert.equal(h.queues.length,1);
 h.context.show({...done});assert.equal(h.queues.length,1);
});
test('refresh resumes only unreceived cards, both players have independent receipts',async()=>{
 const memory=new Map(),storage={getItem:key=>memory.get(key),setItem:(key,value)=>memory.set(key,value)};
 const {done}=snapshots(1,4),first=harness(null,{receipts:createTailReceipts({storage:()=>storage})});first.context.show(done);await first.queues[0].options.startAfter;
 first.queues[0].options.onArrive(done.tailAwards[0]);first.queues[0].options.onArrive(done.tailAwards[1]);first.queues[0].cancel();
 const resumed=harness(null,{receipts:createTailReceipts({storage:()=>storage})});resumed.context.show(done);assert.deepEqual(resumed.queues[0].items,done.tailAwards.slice(2));await resumed.queues[0].options.startAfter;assert.equal(resumed.elements.player1.count.textContent,'3 / 5');
 const opponent=harness(null,{receipts:createTailReceipts({storage:()=>storage})});opponent.context.show({...done,me:1});assert.equal(opponent.queues[0].items.length,4);
 resumed.queues[0].options.onComplete();const complete=harness(null,{receipts:createTailReceipts({storage:()=>storage})});complete.context.show(done);assert.equal(complete.queues.length,0);
});
test('rematch resets receipts and rejects late previous-match snapshots even with greater revision',()=>{
 const {before,done}=snapshots(),h=harness(before);h.context.show(done);h.queues[0].options.onComplete();
 const rematch={...before,matchNumber:2,created:200,matchKey:'123:2:200',revision:1};h.context.show(rematch);h.context.show({...done,revision:999});assert.equal(h.context.room,rematch);
 const nextDone={...done,...{matchNumber:2,created:200,matchKey:'123:2:200',revision:21}};h.context.show(nextDone);assert.equal(h.queues.length,2,'identical roster is a new match, not a duplicate');
 assert.equal(isStaleAuctionSnapshot({...rematch,matchNumber:1},{...before,created:100,matchKey:'123:1:100'}),true);
});
test('reduced motion still opens cards; skip and storage denial retain in-memory dedupe',()=>{
 const {done}=snapshots(),receipts=createTailReceipts({storage(){throw Error('disabled');}}),h=harness(null,{receipts,reducedMotion:true});
 h.context.show(done);assert.equal(h.queues.length,1);assert.equal(h.queues[0].options.reducedMotion,true);assert.equal(h.context.results,0);h.queues[0].options.onComplete();assert.deepEqual(receipts.pending(done,done.tailAwards),[]);
 const normal=harness(null);normal.context.show(done);normal.queues[0].options.onComplete();normal.context.show(done);assert.equal(normal.queues.length,1);
});
test('same-match snapshots remain ordered, but new rooms and new matches may start at revision zero',()=>{
 const {done}=snapshots();assert.equal(isStaleAuctionSnapshot(done,{...done,revision:20}),true);assert.equal(isStaleAuctionSnapshot(done,done),false);
 assert.equal(isStaleAuctionSnapshot(done,{...done,code:'456',revision:0}),false);assert.equal(isStaleAuctionSnapshot(done,{...done,matchKey:'123:2:200',matchNumber:2,created:200,revision:0}),false);
});
test('authoritative tail order excludes already-known offered purchases and cannot be inferred from team order',()=>{
 const {before,done}=snapshots();const offered=collectOfferedAwards(before,done);assert.equal(offered.length,1);assert.ok(!done.tailAwards.some(a=>a.card.name===offered[0].card.name));
 const mixed={...done,tailAwards:[done.tailAwards[1],done.tailAwards[0]]};assert.deepEqual(collectTailAwards(before,mixed),mixed.tailAwards);assert.deepEqual(collectTailAwards(null,{...done,tailAwards:[]}),[]);
});
test('state recovery applies phase/revision changes without chat and ignores responses after switching session',async()=>{
 const start=app.indexOf('async function syncRoomSnapshot('),end=app.indexOf('\nfunction connect()',start),{before,done}=snapshots();
 let release;const updates=[],session={code:'123',token:'test'};const context={session,login:{authToken:'auth'},room:before,post:()=>new Promise(r=>release=r),show:r=>updates.push(r)};
 vm.createContext(context);vm.runInContext(app.slice(start,end),context);
 let pending=context.syncRoomSnapshot();release({room:done});await pending;assert.deepEqual(updates,[done]);
 pending=context.syncRoomSnapshot();context.session={code:'456',token:'other'};release({room:done});await pending;assert.equal(updates.length,1);
});

test('background final snapshot preserves unseen cards until visible instead of consuming receipts',async()=>{
 const {done}=snapshots(),h=harness(null);h.context.document.hidden=true;h.context.show(done);
 assert.equal(h.queues.length,0);assert.equal(h.context.results,0);assert.equal(h.context.room,done);
 h.context.document.hidden=false;h.context.show(h.context.room);assert.equal(h.queues.length,1);assert.equal(h.queues[0].items.length,2);
 await h.queues[0].options.startAfter;h.queues[0].options.onArrive(done.tailAwards[0]);
 const listeners={};h.context.document.addEventListener=(name,fn)=>listeners[name]=fn;h.context.syncRoomSnapshot=()=>Promise.resolve();
 const start=app.indexOf("document.addEventListener('visibilitychange'"),end=app.indexOf('\n// PokeAPI species',start);vm.runInContext(app.slice(start,end),h.context);
 h.context.document.hidden=true;listeners.visibilitychange();assert.equal(h.context.tailReveal,null);
 h.context.document.hidden=false;listeners.visibilitychange();assert.equal(h.queues.length,2);assert.deepEqual(h.queues[1].items,[done.tailAwards[1]]);
});
