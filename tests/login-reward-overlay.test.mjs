import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createLoginRewardOverlay} from '../public/login-reward-overlay.js';
import {createWalletOperations} from '../public/wallet-operations.js';
class Element{
 constructor(tag,doc){this.tag=tag;this.doc=doc;this.children=[];this.events={};this.attributes={};this.open=false;this.disabled=false;this.isConnected=true;this._text='';}
 set textContent(value){this._text=String(value);this.children=[]}get textContent(){return this._text+this.children.map(c=>c.textContent).join(' ')}
 append(...children){this.children.push(...children)}replaceChildren(...children){this._text='';this.children=children}setAttribute(k,v){this.attributes[k]=v;if(k==='open')this.open=true}removeAttribute(k){delete this.attributes[k];if(k==='open')this.open=false}addEventListener(k,fn){this.events[k]=fn}removeEventListener(k){delete this.events[k]}showModal(){this.open=true}close(){this.open=false}focus(){this.doc.activeElement=this}remove(){this.isConnected=false}
}
const user=(id='member')=>({type:'google',authToken:'auth-'+id,user:{sub:id,provider:'google'}});
const rewards=[100,150,200,250,300,400,0].map((gold,i)=>({day:i+1,gold,diamonds:i===6?5:0}));
const state={enabled:true,available:true,eligible:true,serverDay:'2026-11-02',resetHour:2,timezone:'Europe/Istanbul',claimedToday:false,nextDay:1,completedDay:0,rewards,receipt:null};
const status=patch=>({gold:500,diamonds:0,loginRewards:{...state,...patch}});
const ok=value=>({ok:true,json:async()=>structuredClone(value)});
const failure=(code,error)=>({ok:false,status:code,json:async()=>({error})});
const tick=()=>new Promise(r=>setImmediate(r));
function fixture({fetcher,memory=new Map(),local=new Map(),walletOperations,safe=true,storageBroken=false}={}){
 const calls=[],balances=[],notices=[],events={},docEvents={},timers=new Map();let id=0;
 const doc={documentElement:{lang:'tr'},hidden:false,activeElement:null,createElement:tag=>new Element(tag,doc),addEventListener:(k,fn)=>docEvents[k]=fn,removeEventListener:k=>delete docEvents[k]};doc.body=new Element('body',doc);const focus=new Element('button',doc);doc.activeElement=focus;
 const storage={getItem:k=>{if(storageBroken)throw Error('Blocked');return memory.get(k)||null},setItem:(k,v)=>{if(storageBroken)throw Error('Blocked');memory.set(k,v)}};
 const win={sessionStorage:storage,localStorage:{getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,v)},setTimeout:(fn,ms)=>{const key=++id;timers.set(key,{fn,ms});return key},clearTimeout:key=>timers.delete(key),addEventListener:(k,fn)=>events[k]=fn,removeEventListener:k=>delete events[k],fetch:async(path,options)=>{const body=JSON.parse(options.body);calls.push({path,body});return fetcher?fetcher(path,body):ok(status())}};
 const ops=walletOperations||createWalletOperations({storage:()=>storage});let safeNow=safe;
 const ui=createLoginRewardOverlay({document:doc,window:win,walletOperations:ops,canShow:()=>safeNow,onBalance:r=>balances.push(r),onNotice:m=>notices.push(m)});
 const dialog=doc.body.children[0],content=dialog.children[0],[heading,description,days,message,actions]=content.children,[claim,dismiss]=actions.children;
 return {ui,doc,win,events,docEvents,ops,dialog,days,claim,dismiss,message,description,heading,calls,balances,notices,memory,local,timers,focus,setSafe:v=>safeNow=v};
}
async function opened(options){const f=fixture(options);f.ui.setLogin(user());await tick();return f}
const done={...state,available:false,claimedToday:true,completedDay:1,nextDay:2,receipt:{day:1,gold:100,diamonds:0,rewardDate:state.serverDay}};

test('first eligible login shows seven-day dialog over current screen, explicit claim only',async()=>{
 const f=await opened();assert.equal(f.ui.open,true);assert.equal(f.days.children.length,7);assert.equal(f.days.children[0].attributes['aria-current'],'step');assert.match(f.description.textContent,/02.00/);assert.equal(f.dialog.attributes['aria-labelledby'],'login-reward-title');assert.equal(f.doc.activeElement,f.claim);assert.deepEqual(f.calls.map(c=>c.path),['/api/store/status']);f.ui.destroy();
});
test('claim sends only server day and signed auth, double click is locked, success closes for that day',async()=>{
 let resolve,claimed=false;const f=await opened({fetcher:path=>path.endsWith('/claim')?new Promise(r=>resolve=r):ok(status(claimed?done:{}))});
 f.claim.onclick();f.claim.onclick();assert.equal(f.calls.length,2);assert.equal(f.claim.disabled,true);assert.deepEqual(f.calls[1].body,{rewardDate:state.serverDay,authToken:user().authToken});
 claimed=true;resolve(ok({gold:600,diamonds:0,receipt:done.receipt,loginRewards:done}));await tick();assert.equal(f.ui.open,false);assert.equal(f.balances.at(-1).gold,600);assert.equal(f.notices.length,1);assert.ok(f.local.has('hero-login-reward-updated'));
 f.events.focus();await tick();f.ui.setLogin(null);f.ui.setLogin(user());await tick();assert.equal(f.ui.open,false);assert.equal(f.calls.filter(c=>c.path.endsWith('/claim')).length,1);f.ui.destroy();
});
test('reload and other device use server claimed state, never show claimed day',async()=>{
 for(const memory of [new Map(),new Map([['irrelevant','1']])]){const f=await opened({memory,fetcher:()=>ok(status(done))});assert.equal(f.ui.open,false);assert.equal(f.calls.length,1);f.ui.destroy();}
});
test('guest, unavailable storage backend, flags off, already-claimed and platform sessions do not pop up',async()=>{
 for(const patch of [{enabled:false},{eligible:false},{available:false,reason:'storage_unavailable'},done]){const f=await opened({fetcher:()=>ok(status(patch))});assert.equal(f.ui.open,false);f.ui.destroy();}
 const guest=fixture();guest.ui.setLogin({type:'guest',authToken:'auth',user:{sub:'guest:1',provider:'guest'}});await tick();assert.equal(guest.calls.length,0);assert.equal(guest.ui.open,false);guest.ui.destroy();
 const platform=fixture();platform.win.HeroPlatform={};platform.ui.setLogin(user());await tick();assert.equal(platform.calls.length,0);platform.ui.destroy();
});
test('battle/restore/navigation safe guard defers popup, then opens on return without claiming',async()=>{
 const f=await opened({safe:false});assert.equal(f.calls.length,0);assert.equal(f.ui.open,false);f.setSafe(true);f.ui.sync();await tick();assert.equal(f.ui.open,true);
 f.setSafe(false);f.ui.sync();assert.equal(f.ui.open,false);f.setSafe(true);f.ui.sync();await tick();assert.equal(f.ui.open,true);assert.ok(f.calls.every(c=>c.path.endsWith('/status')));f.ui.destroy();
});
test('late status cannot open on active battle or changed account',async()=>{
 for(const change of ['battle','account','logout']){const resolvers=[];const f=fixture({fetcher:()=>new Promise(r=>resolvers.push(r))});f.ui.setLogin(user());if(change==='battle'){f.setSafe(false);f.ui.sync();}else if(change==='account')f.ui.setLogin(user('other'));else f.ui.setLogin(null);resolvers[0](ok(status()));await tick();assert.equal(f.ui.open,false);if(change==='account'){assert.equal(f.calls.at(-1).body.authToken,'auth-other');resolvers[1](ok(status()));await tick();assert.equal(f.ui.open,true);}f.ui.destroy();}
});
test('dismiss by button, Escape, cancel and backdrop stays dismissed until new server reward day',async()=>{
 for(const action of ['button','escape','cancel','backdrop']){let day=state.serverDay;const f=await opened({fetcher:()=>ok(status({serverDay:day}))});let prevented=false;const event={preventDefault:()=>prevented=true};if(action==='button')f.dismiss.onclick();if(action==='escape')f.dialog.events.keydown({...event,key:'Escape'});if(action==='cancel')f.dialog.events.cancel(event);if(action==='backdrop')f.dialog.events.click({target:f.dialog});assert.equal(f.ui.open,false);assert.equal(f.doc.activeElement,f.focus);await f.ui.refresh();assert.equal(f.ui.open,false);day='2026-11-03';await f.ui.refresh();assert.equal(f.ui.open,true);assert.ok(f.calls.every(c=>c.path.endsWith('/status')));f.ui.destroy();}
});
test('persisted dismissal survives reload, but never grants or blocks store claims',async()=>{
 const memory=new Map();const a=await opened({memory});a.dismiss.onclick();a.ui.destroy();const b=await opened({memory});assert.equal(b.ui.open,false);assert.equal(b.ops.read(user()).claim,null);b.ui.destroy();
});
test('visible session timer refreshes server day without client-clock based award',async()=>{
 let next=false;const f=await opened({fetcher:()=>ok(status(next?{serverDay:'2026-11-03',nextDay:2}:done))});assert.equal(f.ui.open,false);const timer=[...f.timers.values()][0];assert.equal(timer.ms,60000);next=true;timer.fn();await tick();assert.equal(f.ui.open,true);assert.equal(f.days.children[1].attributes['aria-current'],'step');assert.ok(f.calls.every(c=>c.path.endsWith('/status')));f.ui.destroy();
});
test('lost response retains exact reward date across day boundary and does not auto-grant new day',async()=>{
 const memory=new Map();const a=await opened({memory,fetcher:path=>path.endsWith('/claim')?failure(503,'Unknown outcome'):ok(status())});a.claim.onclick();await tick();assert.equal(a.ops.read(user()).claim.rewardDate,state.serverDay);a.ui.destroy();
 const b=await opened({memory,fetcher:path=>path.endsWith('/claim')?ok({gold:600,diamonds:0,receipt:done.receipt,loginRewards:{...state,serverDay:'2026-11-03',nextDay:2}}):ok(status({serverDay:'2026-11-03',nextDay:2}))});assert.match(b.claim.textContent,/KONTROL/);b.claim.onclick();await tick();assert.equal(b.calls.find(c=>c.path.endsWith('/claim')).body.rewardDate,state.serverDay);assert.equal(b.calls.filter(c=>c.path.endsWith('/claim')).length,1);b.ui.destroy();
});
test('stale date rejection clears pending key; auth and ambiguous failures retain it',async()=>{
 for(const code of [400,409,401,403,503]){const f=await opened({fetcher:path=>path.endsWith('/claim')?failure(code,'Rejected'):ok(status())});f.claim.onclick();await tick();assert.equal(!!f.ops.read(user()).claim,![400,409].includes(code));f.ui.destroy();}
});
test('account change during claim never paints old balance or closes new account reward',async()=>{
 let resolve;const f=await opened({fetcher:path=>path.endsWith('/claim')?new Promise(r=>resolve=r):ok(status())});f.claim.onclick();f.ui.setLogin(user('other'));await tick();resolve(ok({gold:600,diamonds:0,receipt:done.receipt,loginRewards:done}));await tick();assert.equal(f.balances.length,0);assert.equal(f.notices.length,0);assert.equal(f.ui.open,true);assert.equal(f.ops.read(user()).claim,null);f.ui.destroy();
});
test('shared store operation locks claim and refreshes after grant; cross-tab signal reads authoritative state',async()=>{
 let claimed=false;const f=await opened({fetcher:()=>ok(status(claimed?done:{}))});const key=f.ops.keyFor(user());f.ops.begin(key);assert.equal(f.claim.disabled,true);f.claim.onclick();assert.equal(f.calls.filter(c=>c.path.endsWith('/claim')).length,0);claimed=true;f.ops.finish(key);await tick();assert.equal(f.ui.open,false);
 claimed=false;const g=await opened({fetcher:()=>ok(status(claimed?done:{}))});claimed=true;g.events.storage({key:'hero-login-reward-updated'});await tick();assert.equal(g.ui.open,false);assert.ok(g.calls.every(c=>c.path.endsWith('/status')));f.ui.destroy();g.ui.destroy();
});
test('blocked journal never sends claim; visibility/hide/destroy cancels work and focus stays accessible',async()=>{
 const f=await opened({storageBroken:true});assert.equal(f.claim.disabled,true);f.claim.onclick();await tick();assert.equal(f.calls.filter(c=>c.path.endsWith('/claim')).length,0);f.ui.destroy();
 const g=await opened();g.doc.activeElement=g.dismiss;let prevented=false;g.dialog.events.keydown({key:'Tab',preventDefault:()=>prevented=true});assert.equal(g.doc.activeElement,g.claim);assert.equal(prevented,true);g.doc.hidden=true;g.docEvents.visibilitychange();assert.equal(g.ui.open,false);assert.equal(g.timers.size,0);g.doc.hidden=false;g.docEvents.visibilitychange();await tick();assert.equal(g.ui.open,true);g.ui.destroy();assert.equal(g.timers.size,0);
});
test('app integration defers for live room, restore and navigation; modal CSS adapts to small screens',()=>{
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),css=readFileSync(new URL('../public/login-reward-overlay.css',import.meta.url),'utf8'),html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(app,/createLoginRewardOverlay/);assert.match(app,/canShow:\(\)=>!room&&!session&&!roomEntryPending&&!restorePending/);assert.match(app,/dailyRewardOverlay\.setLogin\(login\)/);assert.match(app,/restorePending=null;dailyRewardOverlay\.sync\(\)/);assert.match(app,/dailyRewardOverlay\.defer\(\);auctionCommanderDialog\.sync\(r\)/);assert.match(html,/login-reward-overlay\.css/);assert.match(css,/max-width:540px/);assert.match(css,/::backdrop/);assert.match(css,/focus-visible/);
});


test('newer claimed status beats delayed earlier available status and broadcasts never authorize a grant',async()=>{
 const waiting=[];const f=fixture({fetcher:()=>new Promise(resolve=>waiting.push(resolve))});f.ui.setLogin(user());
 f.events.storage({key:'hero-login-reward-updated',newValue:'forged-client-claim'});assert.equal(waiting.length,2);
 waiting[1](ok(status(done)));await tick();waiting[0](ok(status()));await tick();assert.equal(f.ui.open,false);assert.equal(f.calls.filter(c=>c.path.endsWith('/claim')).length,0);f.ui.destroy();
});
test('confirmed same-day status clears matching uncertain receipt without another claim',async()=>{
 const memory=new Map();const ops=createWalletOperations({storage:()=>({getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value)})});
 ops.write(ops.keyFor(user()),'claim',{rewardDate:state.serverDay});const f=await opened({memory,walletOperations:ops,fetcher:()=>ok(status(done))});
 assert.equal(f.ui.open,false);assert.equal(ops.read(user()).claim,null);assert.equal(f.calls.length,1);f.ui.destroy();
});
