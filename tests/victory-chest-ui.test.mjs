import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createVictoryChestPresentation,victoryChestReceipt} from '../public/victory-chest.js';

class Element{
 constructor(tag='div'){this.tag=tag;this.children=[];this.parent=null;this.root=false;this.attributes={};this.dataset={};this.hidden=false;this.className='';this.copy='';this.style={setProperty(){}};}
 get isConnected(){return this.root||Boolean(this.parent?.isConnected)}
 set textContent(value){this.copy=String(value);this.children=[]}get textContent(){return this.copy+this.children.map(c=>c.textContent).join(' ')}
 append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node)}}
 replaceChildren(...nodes){for(const node of this.children)node.parent=null;this.children=[];this.copy='';this.append(...nodes)}
 setAttribute(name,value){this.attributes[name]=String(value)}
}
const all=root=>[root,...root.children.flatMap(all)];
const kind=(root,name)=>all(root).filter(node=>node.className===name);
const matchId='123:1:1900000000000';
const receipt=(rewards={gold:115,magicDust:4,diamonds:1},patch={})=>({matchId,receiptId:matchId,configVersion:'arena-victory-v1',rewards,...patch});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(options={}){
 const root=new Element('section');root.root=true;
 const documentEvents=new Map(),windowEvents=new Map(),tasks=new Map(),memory=options.memory||new Map();let id=0,now=0;
 const document={hidden:false,createElement:tag=>new Element(tag),addEventListener:(key,fn)=>documentEvents.set(key,fn),removeEventListener:key=>documentEvents.delete(key)};
 const window={navigator:{onLine:true},matchMedia:()=>({matches:options.reduced||false}),addEventListener:(key,fn)=>windowEvents.set(key,fn),removeEventListener:key=>windowEvents.delete(key)};
 const storage={getItem:key=>memory.get(key),setItem:(key,value)=>{if(options.blockStorage)throw Error('denied');memory.set(key,value)}};
 const setTimer=(fn,delay)=>{tasks.set(++id,{fn,at:now+delay});return id},clearTimer=id=>tasks.delete(id);
 const run=(time=Infinity)=>{now=time;for(const [id,task] of [...tasks])if(task.at<=now){tasks.delete(id);task.fn()}};
 const view=createVictoryChestPresentation({root,matchId,accountScope:options.scope||'web:member1',winner:Object.hasOwn(options,'winner')?options.winner:0,document,window,storage,setTimer,clearTimer,load:options.load,isCurrent:options.isCurrent});
 return{root,view,document,window,tasks,memory,run,documentEvents,windowEvents};
}

test('receipt schema rejects stale matches, malformed currencies and absent provenance',()=>{
 assert.deepEqual(victoryChestReceipt(receipt(),matchId),receipt());
 for(const wrong of [null,{},receipt(undefined,{matchId:'other'}),receipt(undefined,{receiptId:''}),receipt(undefined,{configVersion:''}),receipt({gold:119,magicDust:4,diamonds:1}),receipt({gold:100,magicDust:2,diamonds:1}),receipt({gold:100,magicDust:3,diamonds:2}),receipt({gold:'100',magicDust:0,diamonds:0}),receipt({gold:100,magicDust:null,diamonds:0})])assert.equal(victoryChestReceipt(wrong,matchId),null);
});
test('flags-off, loser, draw and bot/no-receipt results never show a chest or invent prizes',()=>{
 for(const winner of [0,1,null]){
  const f=fixture({winner});
  f.view.update({});assert.equal(f.root.hidden,true);assert.equal(f.tasks.size,0);
  if(winner!==0){f.view.update({victoryChest:receipt(),victoryChestPending:true});assert.equal(f.root.hidden,true);assert.equal(f.tasks.size,0)}
  f.view.destroy();
 }
});
test('opening reveals only earned gold, then dust and diamonds from one committed receipt',()=>{
 const f=fixture();f.view.update({victoryChest:receipt()});
 assert.equal(f.root.hidden,false);assert.equal(f.root.dataset.state,'opening');
 const rewards=kind(f.root,'victory-chest-reward');assert.equal(rewards.length,3);
 assert.deepEqual(rewards.map(node=>node.dataset.currency),['gold','magicDust','diamonds']);
 assert.deepEqual(rewards.map(node=>node.dataset.visible),['false','false','false']);
 f.run(650);assert.deepEqual(rewards.map(node=>node.dataset.visible),['true','false','false']);
 f.run(970);assert.deepEqual(rewards.map(node=>node.dataset.visible),['true','true','false']);
 f.run(1290);assert.deepEqual(rewards.map(node=>node.dataset.visible),['true','true','true']);
 f.run(2000);assert.equal(f.root.dataset.state,'complete');assert.match(f.root.textContent,/Hesabına eklendi: 115 Altın · 4 Büyü tozu · 1 Elmas/);
 assert.equal(f.tasks.size,0);
 assert.equal(f.root.attributes['aria-busy'],'false');
 const stored=JSON.stringify([...f.memory]);assert.ok(stored.includes(matchId));assert.doesNotMatch(stored,/115|magicDust|diamonds|authToken/);
});
test('gold-only receipt omits unearned items instead of showing placeholders or fake rolls',()=>{
 const f=fixture();f.view.update({victoryChest:receipt({gold:105,magicDust:0,diamonds:0})});f.run();
 assert.equal(kind(f.root,'victory-chest-reward').length,1);assert.match(f.root.textContent,/105 Altın/);assert.doesNotMatch(f.root.textContent,/Büyü tozu|Elmas/);
});
test('same receipt and inconsistent subsequent payload cannot reroll, repaint or repeat animation',()=>{
 const f=fixture(),notifications=[];f.window.dispatchEvent=event=>notifications.push(event);f.view.update({victoryChest:receipt()});const children=f.root.children.slice(),count=f.tasks.size;
 f.view.update({victoryChest:receipt()});f.view.update({victoryChest:receipt({gold:100,magicDust:0,diamonds:0})});
 assert.equal(notifications.length,1);assert.equal(notifications[0].type,'hero:wallet-refresh');assert.equal(notifications[0].detail,undefined);assert.equal(f.tasks.size,count);assert.deepEqual(f.root.children,children);f.run();assert.match(f.root.textContent,/115 Altın/);
});
test('refresh/replay restores already seen receipt immediately, with account and portal isolation',()=>{
 const memory=new Map(),first=fixture({memory});first.view.update({victoryChest:receipt()});first.view.destroy();
 const restored=fixture({memory});restored.view.update({victoryChest:receipt()});assert.equal(restored.root.dataset.state,'complete');assert.equal(restored.tasks.size,0);
 for(const scope of ['web:member2','crazygames:member1']){const separate=fixture({memory,scope});separate.view.update({victoryChest:receipt()});assert.equal(separate.root.dataset.state,'opening');separate.view.destroy()}
});
test('reduced motion, hidden page and unavailable animation journal show all real rewards immediately',()=>{
 for(const options of [{reduced:true},{blockStorage:true},{hidden:true},{memory:new Map([['hero-auction-victory-chest-seen:web%3Amember1','bad json']])}]){
  const f=fixture(options);if(options.hidden)f.document.hidden=true;
  f.view.update({victoryChest:receipt()});assert.equal(f.root.dataset.state,'complete');assert.equal(f.tasks.size,0);assert.equal(kind(f.root,'victory-chest-reward').every(row=>row.dataset.visible==='true'),true);
 }
});
test('pending shows no quantities, recovers via read only and stops polling once committed',async()=>{
 let reads=0;const f=fixture({load:async()=>{reads++;return{victoryChest:receipt()}}});
 f.view.update({victoryChestPending:true});assert.equal(f.root.dataset.state,'pending');assert.equal(kind(f.root,'victory-chest-reward').length,0);assert.doesNotMatch(f.root.textContent,/100|115|120|Hesabına eklendi/);
 assert.equal(f.tasks.size,1);f.run(1800);await tick();assert.equal(reads,1);assert.equal(f.root.dataset.state,'opening');f.run(10000);assert.equal(f.tasks.size,0);assert.match(f.root.textContent,/Hesabına eklendi/);
});
test('temporary network errors retain pending state and retry, never claim a zero or duplicate credit',async()=>{
 let reads=0;const f=fixture({load:async()=>{reads++;if(reads===1)throw Error('offline');return{victoryChest:receipt()}}});
 f.view.update({victoryChestPending:true});f.run(1800);await tick();assert.equal(f.root.dataset.state,'pending');assert.match(f.root.textContent,/Bağlantı/);assert.equal(f.tasks.size,1);
 f.run(5400);await tick();assert.equal(reads,2);assert.equal(f.root.dataset.state,'opening');f.view.destroy();assert.equal(f.tasks.size,0);
});
test('a stalled receipt read is aborted after eight seconds and remains safely pending',async()=>{
 let aborted=false;const f=fixture({load:({signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(Error('timeout'))}))});
 f.view.update({victoryChestPending:true});f.run(1800);assert.equal(aborted,false);f.run(9799);assert.equal(aborted,false);f.run(9800);await tick();assert.equal(aborted,true);assert.equal(f.root.dataset.state,'pending');assert.equal(kind(f.root,'victory-chest-reward').length,0);assert.equal(f.tasks.size,1);f.view.destroy();assert.equal(f.tasks.size,0);
});
test('auth and rematch errors stop old-match recovery without asserting a missing reward',async()=>{
 for(const status of [401,403,409,410]){const f=fixture({load:async()=>{throw Object.assign(Error('expired'),{status})}});f.view.update({victoryChestPending:true});f.run(1800);await tick();assert.equal(f.tasks.size,0);assert.equal(f.root.dataset.state,'pending');assert.equal(kind(f.root,'victory-chest-reward').length,0);f.view.destroy()}
});
test('leaving during polling aborts request and ignores late result; listeners and timers released',async()=>{
 let resolve,signal;const f=fixture({load:async args=>{signal=args.signal;return new Promise(done=>resolve=done)}});
 f.view.update({victoryChestPending:true});f.run(1800);f.view.destroy();assert.equal(signal.aborted,true);resolve({victoryChest:receipt()});await tick();assert.equal(f.root.hidden,true);assert.equal(f.root.children.length,0);assert.equal(f.tasks.size,0);assert.equal(f.documentEvents.size,0);assert.equal(f.windowEvents.size,0);
});
test('leaving during animation prevents delayed updates and does not repeat on return',()=>{
 const f=fixture();f.view.update({victoryChest:receipt()});f.view.destroy();assert.equal(f.tasks.size,0);f.run();assert.equal(f.root.hidden,true);assert.equal(f.root.children.length,0);
});
test('hidden/offline tabs do not poll; visible/online resumes one read without a second loop',async()=>{
 let reads=0;const f=fixture({load:async()=>{reads++;return{victoryChest:receipt()}}});f.document.hidden=true;
 f.view.update({victoryChestPending:true});assert.equal(f.tasks.size,0);f.document.hidden=false;f.window.navigator.onLine=false;f.documentEvents.get('visibilitychange')();assert.equal(reads,0);
 f.window.navigator.onLine=true;f.windowEvents.get('online')();f.documentEvents.get('visibilitychange')();await tick();assert.equal(reads,1);f.view.destroy();
});
test('late or detached contexts cannot mount an old winner receipt',()=>{
 let current=true;const f=fixture({isCurrent:()=>current});f.view.update({victoryChestPending:true});current=false;f.view.update({victoryChest:receipt()});assert.equal(kind(f.root,'victory-chest-reward').length,0);f.view.destroy();
 const detached=fixture();detached.root.root=false;detached.view.update({victoryChest:receipt()});assert.equal(detached.root.hidden,true);assert.equal(detached.tasks.size,0);detached.view.destroy();
});
test('arena integration is receipt-only, match-bound, reset on build and does not alter combat',()=>{
 const source=readFileSync(new URL('../public/battle-preview.js',import.meta.url),'utf8');
 const component=readFileSync(new URL('../public/victory-chest.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/victory-chest.css',import.meta.url),'utf8');
 assert.match(source,/async function build\(overrideResult\)\{\n resetVictoryChestPresentation\(\)/);
 assert.match(source,/finalResult\?\.winner!==0/);assert.match(source,/showVictoryChest\(data\)/);assert.match(source,/showVictoryChest\(finalResult\)/);
 assert.match(source,/completedMatchKey=preparationMatchKey/);assert.match(source,/preparationMatchKey!==completedMatchKey/);
 assert.doesNotMatch(component,/Math\.random|crypto\.random|\/api\/.*(?:claim|grant)|localStorage|requestAnimationFrame|setInterval/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);assert.doesNotMatch(css,/animation:[^;}]*infinite/);assert.match(css,/html:has\(link\[href\*="theme.css"\]\)/);
});
