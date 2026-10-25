import vm from 'node:vm';
import {createWalletOperations} from '../public/wallet-operations.js';
import {commanderExchangeQuote} from '../public/commander-exchange-view.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createStorefront} from '../public/storefront.js';
import {crazyGamesSource} from '../crazygames-build.js';
class Element{
 constructor(tag='div'){this.tag=tag;this.children=[];this.hidden=false;this.disabled=false;this.open=false;this.value='';this.text='';this.attributes={};this.classList={add(){},remove(){}};}
 set textContent(value){this.text=String(value);this.children=[]}get textContent(){return this.text+this.children.map(c=>c.textContent).join(' ')}
 append(...children){this.children.push(...children)}replaceChildren(...children){this.text='';this.children=children}setAttribute(key,value){this.attributes[key]=value}focus(){this.focused=true}scrollIntoView(){}
}
const ids=['store-panel','home-store-tab','store-gold','store-diamonds','store-diamond-status','store-message','store-refresh','store-purchase','store-ad','store-purchase-note','store-ad-note','store-reward-days','store-claim','store-reward-status','store-exchange','store-exchange-availability','store-exchange-controls','store-close'];
const rewards=[100,150,200,250,300,400,0].map((gold,index)=>({day:index+1,gold,diamonds:index===6?5:0}));
const status={gold:1000,diamonds:10,diamondsEnabled:true,purchase:{available:false},rewardedAds:{enabled:false},exchange:{enabled:true,available:true,rate:500,pricingVersion:'diamonds-to-gold-500-v1'},loginRewards:{enabled:true,available:true,eligible:true,serverDay:'2026-10-25',timezone:'Europe/Istanbul',claimedToday:false,completedDay:0,nextDay:1,rewards,receipt:null}};
const user=(sub='member-1')=>({type:'google',authToken:'signed-'+sub,user:{sub,provider:'google'}});
const ok=value=>({ok:true,json:async()=>structuredClone(value)}),fail=(status,message)=>({ok:false,status,json:async()=>({error:message})});
const elements=node=>[node,...node.children.flatMap(elements)];
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({fetcher,confirmed=true,memory=new Map(),storageDisabled=false,walletOperations}={}){
 const nodes=Object.fromEntries(ids.map(id=>[id,new Element()]));nodes['store-panel'].hidden=true;
 const calls=[],balances=[],prompts=[],events={},docEvents={};let counter=0;
 const win={confirm:message=>{prompts.push(message);return confirmed},crypto:{randomUUID:()=>`store-request-id-${++counter}`},sessionStorage:{getItem:key=>memory.get(key),setItem:(key,value)=>{if(storageDisabled)throw Error('Storage blocked');memory.set(key,value)}},fetch:async(path,options)=>{const body=JSON.parse(options.body);calls.push({path,body});return fetcher?fetcher(path,body):ok(status)},addEventListener:(key,fn)=>events[key]=fn,removeEventListener:key=>delete events[key]};
 const doc={documentElement:{lang:'tr'},hidden:false,createElement:tag=>new Element(tag),getElementById:id=>nodes[id],addEventListener:(key,fn)=>docEvents[key]=fn,removeEventListener:key=>delete docEvents[key]};
 const ui=createStorefront({document:doc,window:win,walletOperations,onBalance:value=>balances.push(value)});
 return {ui,nodes,calls,balances,prompts,events,docEvents,win,doc,memory};
}
async function opened(options){const f=fixture(options);f.ui.setLogin(user());f.ui.open();await tick();return f}
const exchangeButton=f=>elements(f.nodes['store-exchange-controls']).find(e=>e.tag==='button');
const exchangeInput=f=>elements(f.nodes['store-exchange-controls']).find(e=>e.tag==='input');

test('opening only reads authenticated status and displays approved seven days, never grants',async()=>{
 const f=await opened();assert.deepEqual(f.calls.map(c=>c.path),['/api/store/status']);assert.equal(f.calls[0].body.authToken,user().authToken);assert.equal(f.nodes['store-reward-days'].children.length,7);assert.match(f.nodes['store-reward-days'].children[6].textContent,/5 elmas/);assert.doesNotMatch(f.nodes['store-reward-days'].children[6].textContent,/10 elmas/);assert.equal(f.nodes['store-claim'].disabled,false);assert.equal(f.nodes['store-purchase'].disabled,true);assert.equal(f.nodes['store-ad'].disabled,true);
});
test('disabled infrastructure never displays a fabricated zero or enables a provider button',async()=>{
 const f=await opened({fetcher:()=>ok({...status,gold:null,diamonds:null,diamondsEnabled:false,purchase:{available:true},rewardedAds:{enabled:true},exchange:{available:false},loginRewards:{...status.loginRewards,enabled:false,available:false}})});
 assert.equal(f.nodes['store-gold'].textContent,'—');assert.equal(f.nodes['store-diamonds'].textContent,'—');assert.equal(f.nodes['store-claim'].disabled,true);assert.equal(f.nodes['store-purchase'].disabled,true);assert.equal(f.nodes['store-ad'].disabled,true);assert.equal(exchangeButton(f),undefined);assert.match(f.nodes['store-reward-status'].textContent,/henüz etkin değil/);
});
test('guest ineligibility comes from server, no rewards from forged local provider',async()=>{
 const f=await opened({fetcher:()=>ok({...status,loginRewards:{...status.loginRewards,eligible:false,available:false}})});f.nodes['store-claim'].onclick();await tick();assert.equal(f.calls.length,1);assert.match(f.nodes['store-reward-status'].textContent,/doğrulanmış Google/);
});
test('explicit claim sends only server date and auth, locks double click and applies receipt balances',async()=>{
 let resolve;const f=await opened({fetcher:path=>path.endsWith('/claim')?new Promise(r=>resolve=r):ok(status)});
 const button=f.nodes['store-claim'];button.onclick();button.onclick();assert.equal(f.calls.length,2);assert.deepEqual(f.calls[1].body,{rewardDate:'2026-10-25',authToken:user().authToken});assert.equal(button.disabled,true);
 resolve(ok({gold:1100,diamonds:10,receipt:{day:1,gold:100,diamonds:0,rewardDate:'2026-10-25'},loginRewards:{...status.loginRewards,claimedToday:true,available:false,completedDay:1}}));await tick();assert.equal(f.balances.at(-1).gold,1100);assert.match(f.nodes['store-message'].textContent,/100 altın ödülü doğrulandı/);assert.equal(button.disabled,true);assert.equal(JSON.parse([...f.memory.values()][0]).claim,undefined);
});
test('lost claim survives reload and retries the same date after Istanbul midnight',async()=>{
 const memory=new Map();const first=await opened({memory,fetcher:path=>path.endsWith('/claim')?Promise.reject(Error('Lost response')):ok(status)});first.nodes['store-claim'].onclick();await tick();first.ui.destroy();
 const next=await opened({memory,fetcher:path=>path.endsWith('/claim')?ok({gold:1100,diamonds:10,receipt:{day:1,gold:100,diamonds:0,rewardDate:'2026-10-25'},replayed:true,loginRewards:{...status.loginRewards,serverDay:'2026-10-26',nextDay:2}}):ok({...status,loginRewards:{...status.loginRewards,serverDay:'2026-10-26',nextDay:2}})});
 assert.match(next.nodes['store-claim'].textContent,/KONTROL/);next.nodes['store-claim'].onclick();await tick();assert.equal(next.calls[1].body.rewardDate,'2026-10-25');assert.equal(next.calls.filter(c=>c.path.endsWith('/claim')).length,1);assert.equal(JSON.parse([...memory.values()][0]).claim,undefined);
});
test('a rejected stale reward date clears recovery; a 503 preserves it',async()=>{
 for(const code of [409,503]){const f=await opened({fetcher:path=>path.endsWith('/claim')?fail(code,'Rejected'):ok(status)});f.nodes['store-claim'].onclick();await tick();assert.equal(Boolean(JSON.parse([...f.memory.values()][0]).claim),code===503)}
});
test('account switch and closed navigation ignore delayed balances, receipts and stale controls',async()=>{
 for(const action of ['switch','close']){let resolve;const f=await opened({fetcher:path=>path.endsWith('/claim')?new Promise(r=>resolve=r):ok(status)});const old=f.nodes['store-claim'].onclick;old();if(action==='switch')f.ui.setLogin(user('other'));else f.ui.close();const count=f.balances.length;resolve(ok({gold:1100,diamonds:10,receipt:{gold:100,diamonds:0}}));await tick();old();await tick();assert.equal(f.balances.length,count);assert.equal(f.calls.filter(c=>c.path.endsWith('/claim')).length,1);assert.equal(f.nodes['store-message'].textContent,'');assert.equal(f.nodes['store-panel'].hidden,true)}
});
test('closing and reopening while a claim is in flight cannot send a second operation',async()=>{
 let resolve;const f=await opened({fetcher:path=>path.endsWith('/claim')?new Promise(r=>resolve=r):ok(status)});f.nodes['store-claim'].onclick();f.ui.close();f.ui.open();f.nodes['store-claim'].onclick();assert.equal(f.calls.filter(c=>c.path.endsWith('/claim')).length,1);assert.equal(f.nodes['store-claim'].disabled,true);resolve(ok({gold:1100,diamonds:10,receipt:{gold:100,diamonds:0}}));await tick();assert.equal(f.calls.filter(c=>c.path.endsWith('/status')).length,2);
});
test('exchange cancel sends no mutation; accepted quote prompts once and uses exact server rate',async()=>{
 const cancelled=await opened({confirmed:false});exchangeButton(cancelled).onclick();await tick();assert.equal(cancelled.calls.length,1);assert.equal(cancelled.memory.size,0);
 const f=await opened({fetcher:path=>path.endsWith('/exchange')?ok({gold:2000,diamonds:8,diamondsSpent:2,goldGranted:1000,exchange:status.exchange}):ok(status)});exchangeInput(f).value='2';exchangeInput(f).oninput();exchangeButton(f).onclick();await tick();assert.equal(f.prompts.length,1);assert.match(f.prompts[0],/2 elmas harcayıp 1.000 altın/);assert.deepEqual(f.calls[1].body,{requestId:'store-request-id-1',diamondsToSpend:2,expectedRate:500,pricingVersion:status.exchange.pricingVersion,authToken:user().authToken});assert.equal(f.balances.at(-1).gold,2000);
});
test('unknown exchange survives navigation/reload and retains identical key and accepted quote',async()=>{
 const memory=new Map();const first=await opened({memory,fetcher:path=>path.endsWith('/exchange')?Promise.reject(Error('Lost commit')):ok(status)});exchangeInput(first).value='10';exchangeInput(first).oninput();exchangeButton(first).onclick();await tick();first.ui.destroy();
 const next=await opened({memory,fetcher:path=>path.endsWith('/exchange')?ok({gold:6000,diamonds:0,diamondsSpent:10,goldGranted:5000,replayed:true}):ok({...status,gold:6000,diamonds:0})});exchangeButton(next).onclick();await tick();assert.equal(next.prompts.length,0);assert.deepEqual(next.calls[1].body,first.calls[1].body);assert.equal(JSON.parse([...memory.values()][0]).exchange,undefined);
});
test('account scope never exposes another account pending receipt or exchange',async()=>{
 const f=await opened({fetcher:path=>path.endsWith('/exchange')?Promise.reject(Error('Lost')):ok(status)});exchangeButton(f).onclick();await tick();f.ui.setLogin(user('other'));f.ui.open();await tick();assert.ok(exchangeInput(f));assert.doesNotMatch(f.nodes['store-exchange-controls'].textContent,/Önceki dönüşüm/);assert.equal(f.nodes['store-message'].textContent,'');
});
test('blocked storage prevents all writes, preserving safe retry contract',async()=>{
 const f=await opened({storageDisabled:true});f.nodes['store-claim'].onclick();await tick();exchangeButton(f).onclick();await tick();assert.equal(f.calls.length,1);assert.match(f.nodes['store-message'].textContent,/İşlem gönderilmedi/);
});
test('status response after logout or newer navigation cannot repaint',async()=>{
 let resolve;const f=fixture({fetcher:()=>new Promise(r=>resolve=r)});f.ui.setLogin(user());f.ui.open();f.ui.setLogin(null);resolve(ok(status));await tick();assert.equal(f.nodes['store-gold'].textContent,'—');assert.equal(f.balances.length,0);assert.equal(f.nodes['store-panel'].hidden,true);
});
test('BFCache, visibility and online refresh read only; cross-tab auth invalidates controls',async()=>{
 const f=await opened();f.events.pagehide();f.nodes['store-claim'].onclick();await tick();assert.equal(f.calls.length,1);f.events.pageshow();await tick();f.docEvents.visibilitychange();await tick();f.events.online();await tick();assert.ok(f.calls.every(c=>c.path.endsWith('/status')));f.events.storage({key:'hero-auction-login'});f.ui.open();assert.equal(f.nodes['store-panel'].hidden,true);
});
test('store replaces only Leagues in the six-slot nav; Contact and native home/back remain',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8'),css=readFileSync(new URL('../public/storefront.css',import.meta.url),'utf8'),app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const nav=html.slice(html.indexOf('<nav class="home-quick-nav"'),html.indexOf('</nav>',html.indexOf('<nav class="home-quick-nav"')));
 assert.equal((nav.match(/class="quick-nav-item /g)||[]).length,6);
 assert.deepEqual([...nav.matchAll(/<span class="nav-label">([^<]+)<\/span>/g)].map(match=>match[1]),['Oyna','Komutan','Kahramanlar','Arkadaşlar','Mağaza','İletişim']);
 assert.equal((html.match(/id="home-store-tab"/g)||[]).length,1);assert.equal((html.match(/id="store-panel"/g)||[]).length,1);
 assert.doesNotMatch(nav,/Ligler|quick-nav-leagues|ligler\.html/);assert.match(nav,/<a href="mailto:destek@heroauction\.com\.tr\?subject=[^"]+" class="quick-nav-item quick-nav-contact">/);
 assert.match(html,/<footer>[\s\S]*mailto:destek/);assert.match(html,/id="store-close" class="outline">← ANA MENÜ/);assert.doesNotMatch(html,/LİGLERE DÖN|Liglere dön/);
 assert.match(css,/repeat\(7,minmax\(0,1fr\)\)/);assert.match(css,/@media\(max-width:350px\)/);assert.match(app,/homePlayTab.onclick=\(\)=>\{storefrontUI.close\(\)/);assert.match(app,/commander-open-profile'\).onclick=\(\)=>\{storefrontUI.close\(\)/);
 const league=readFileSync(new URL('../public/ligler.html',import.meta.url),'utf8');assert.doesNotMatch(league,/id="store-panel"|id="home-store-tab"|storefront\.js/);assert.match(league,/Ligler|LİGLER/);
});
test('CrazyGames Basic Launch hides store and contact, leaves four compact entries and cannot start store actions',async()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8'),cg=crazyGamesSource(html,'.html'),css=readFileSync(new URL('../public/friends.css',import.meta.url),'utf8');
 assert.match(cg,/#home-store-tab,#store-panel,[^}]*a\[href\^="mailto:"\][^}]*\{display:none!important\}/);
 assert.match(css,/html\[lang="en"\] #home \.home-quick-nav\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important\}/);
 assert.match(css,/@media\(max-width:620px\)\{[^}]+\}html\[lang="en"\] #home \.home-quick-nav\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important\}/);
 const nav=cg.slice(cg.indexOf('<nav class="home-quick-nav"'),cg.indexOf('</nav>',cg.indexOf('<nav class="home-quick-nav"')));
 const items=[...nav.matchAll(/<(button|a)\b([^>]+)class="quick-nav-item ([^"]+)"([\s\S]*?)<\/\1>/g)];
 const visible=items.filter(match=>!match[2].includes('id="home-store-tab"')&&!match[2].includes('href="mailto:'));
 assert.equal(visible.length,4);assert.doesNotMatch(cg,/src="https:\/\/(?:pagead2\.googlesyndication\.com|accounts\.google\.com)/);
 const f=fixture();f.win.HeroPlatform={};f.ui.setLogin(user());f.ui.open();await tick();assert.equal(f.nodes['store-panel'].hidden,true);assert.equal(f.calls.length,0);assert.equal(f.nodes['store-purchase'].disabled,true);assert.equal(f.nodes['store-ad'].disabled,true);
});

const appSource=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const commanderSource=appSource.slice(appSource.indexOf('async function exchangeCommanderDiamonds(amount){'),appSource.indexOf('async function upgradeCommander(stat){'));
function commanderFixture(walletOperations,handler){
 const calls=[],prompts=[];const ctx={walletOperations,commanderProfile:{commanderId:'attack',levels:{}},commanderBusy:false,commanderExchangeRequest:null,commanderExchange:status.exchange,commanderDiamonds:10,walletGold:1000,login:user(),document:{documentElement:{lang:'tr'}},signedIn:()=>true,commanderExchangeQuote,crypto:{randomUUID:()=> 'commander-request-id-001'},window:{confirm:value=>{prompts.push(value);return true}},renderCommanderProfile(){},showGold(value){ctx.walletGold=value},$:()=>({textContent:''}),post:async(path,body)=>{calls.push({path,body:structuredClone(body)});return handler(path,body)}};
 vm.createContext(ctx);vm.runInContext(commanderSource,ctx);return {ctx,calls,prompts,run:value=>ctx.exchangeCommanderDiamonds(value)};
}
const operationStore=memory=>createWalletOperations({storage:()=>({getItem:key=>memory.get(key),setItem:(key,value)=>memory.set(key,value)})});
test('store unknown exchange -> commander recovers identical accepted key without a second confirmation',async()=>{
 const memory=new Map(),ops=operationStore(memory);const f=await opened({memory,walletOperations:ops,fetcher:path=>path.endsWith('/exchange')?Promise.reject(Error('Unknown commit')):ok(status)});exchangeInput(f).value='2';exchangeInput(f).oninput();exchangeButton(f).onclick();await tick();f.ui.close();
 const commander=commanderFixture(ops,()=>({gold:2000,diamonds:8,exchange:status.exchange}));await commander.run(5);assert.equal(commander.prompts.length,0);const {authToken,...accepted}=f.calls[1].body;assert.deepEqual(commander.calls[0].body,accepted);
});
test('commander unknown exchange -> reload -> store retries same key and quote; active cross-entry request is locked',async()=>{
 const memory=new Map(),ops=operationStore(memory);let reject;const commander=commanderFixture(ops,()=>new Promise((_,r)=>reject=r));const first=commander.run(3);
 const f=await opened({memory,walletOperations:ops});assert.equal(f.calls.length,0);assert.equal(exchangeButton(f).disabled,true);exchangeButton(f).onclick();assert.equal(commander.calls.length,1);
 reject(Object.assign(Error('Expired session'),{status:401}));await tick();reject(Error('Reconcile failed'));await first;f.ui.destroy();
 const restored=await opened({memory,walletOperations:operationStore(memory),fetcher:path=>path.endsWith('/exchange')?ok({gold:2500,diamonds:7,diamondsSpent:3,goldGranted:1500}):ok(status)});exchangeButton(restored).onclick();await tick();assert.equal(restored.prompts.length,0);const {authToken,...body}=restored.calls[1].body;assert.deepEqual(body,commander.calls[0].body);assert.equal(operationStore(memory).read(user()).exchange,null);
});
test('401 and403 retain claim/exchange keys across reauthentication rather than assuming no prior commit',async()=>{
 for(const code of [401,403])for(const kind of ['claim','exchange']){
  const memory=new Map();const f=await opened({memory,fetcher:path=>path.endsWith('/'+kind)?fail(code,'Auth lost'):ok(status)});if(kind==='claim')f.nodes['store-claim'].onclick();else exchangeButton(f).onclick();await tick();const prior=operationStore(memory).read(user())[kind];assert.ok(prior);
  f.ui.setLogin(null);f.ui.setLogin({...user(),authToken:'renewed-auth'});f.ui.open();await tick();if(kind==='claim')f.nodes['store-claim'].onclick();else exchangeButton(f).onclick();await tick();const sent=f.calls.filter(c=>c.path.endsWith('/'+kind));assert.equal(sent.length,2);const {authToken:first,...a}=sent[0].body,{authToken:second,...b}=sent[1].body;assert.deepEqual(a,b);assert.equal(second,'renewed-auth');
 }
});

test('store completion wakes open commander with current wallet; old auth/navigation/newer profiles are never painted',async()=>{
 const source=appSource.slice(appSource.indexOf('async function refreshCommanderAfterWalletOperation(key){'),appSource.indexOf('const commanderOptions=['));
 for(const change of ['none','auth','close','profile','busy']){
  const memory=new Map(),ops=operationStore(memory);let resolve;const original={commanderId:'attack',levels:{}};let renders=0,reads=0;
  const ctx={walletOperations:ops,login:user(),commanderProfileOpen:true,commanderBusy:false,signedIn:()=>true,commanderProfile:original,commanderProgression:null,commanderDiamonds:10,commanderExchange:status.exchange,renderCommanderProfile:()=>renders++,showGold:value=>ctx.walletGold=value,post:()=>{reads++;return new Promise(r=>resolve=r)}};
  vm.createContext(ctx);vm.runInContext(source,ctx);ops.subscribe(({key,busy})=>{if(!busy)void ctx.refreshCommanderAfterWalletOperation(key)});
  const key=ops.keyFor(user());ops.begin(key);ops.finish(key);assert.equal(reads,1);
  if(change==='auth')ctx.login=user('other');if(change==='close')ctx.commanderProfileOpen=false;if(change==='profile')ctx.commanderProfile={...original};if(change==='busy')ctx.commanderBusy=true;
  resolve({profile:original,gold:1500,diamonds:9,exchange:status.exchange});await tick();assert.equal(renders,change==='none'?1:0);assert.equal(ctx.commanderDiamonds,change==='none'?9:10);assert.equal(ctx.commanderProfileOpen,change!=='close');
 }
});
test('commander completion wakes the open store after cross-entry in-flight lock',async()=>{
 const memory=new Map(),ops=operationStore(memory);const key=ops.keyFor(user());ops.begin(key);
 const f=await opened({memory,walletOperations:ops});assert.equal(f.calls.length,0);assert.equal(f.nodes['store-claim'].disabled,true);ops.finish(key);await tick();assert.equal(f.calls.length,1);assert.equal(f.nodes['store-claim'].disabled,false);assert.equal(f.nodes['store-gold'].textContent,'1.000');
});

test('corrupt persisted operation journal blocks claims and exchanges without overwriting the uncertain record',async()=>{
 for(const raw of ['{broken-json','null','[]','{"exchange":{"requestId":"lost-operation"}}','{"claim":{"rewardDate":"bad-date"}}','{"unrecognized":{"requestId":"lost-operation"}}']){
  const memory=new Map(),ops=operationStore(memory),key=ops.keyFor(user());memory.set(key,raw);
  const f=await opened({memory,walletOperations:ops});f.nodes['store-claim'].onclick();await tick();exchangeButton(f).onclick();await tick();assert.equal(f.calls.length,1);assert.equal(memory.get(key),raw);assert.match(f.nodes['store-message'].textContent,/İşlem gönderilmedi/);
  const commander=commanderFixture(ops,()=>{throw Error('Must not send')});await commander.run(1);assert.equal(commander.calls.length,0);assert.equal(memory.get(key),raw);
 }
});
test('failed journal read with a working writer still blocks all new operation keys',async()=>{
 const memory=new Map();let writes=0;const ops=createWalletOperations({storage:()=>({getItem(){throw Error('Read temporarily unavailable')},setItem(){writes++}})});
 const f=await opened({memory,walletOperations:ops});f.nodes['store-claim'].onclick();await tick();exchangeButton(f).onclick();await tick();assert.equal(f.calls.length,1);assert.equal(writes,0);assert.equal(ops.read(user()).valid,false);
 const commander=commanderFixture(ops,()=>{throw Error('Must not send')});await commander.run(1);assert.equal(commander.calls.length,0);assert.equal(writes,0);
});
