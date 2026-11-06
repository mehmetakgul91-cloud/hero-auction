import test from 'node:test';
import assert from 'node:assert/strict';
import {createArenaEmotes,ARENA_EMOTES} from '../public/arena-emotes.js';
import {createAuctionEmotes} from '../public/auction-emotes.js';

class Element extends EventTarget{
 constructor(tag,document){super();this.tagName=tag.toUpperCase();this.document=document;this.children=[];this.dataset={};this.attrs={};this.className='';this.hidden=false;this.disabled=false;this.parentNode=null;
  this.classList={toggle:(name,force)=>{const set=new Set(this.className.split(' '));if(force)set.add(name);else set.delete(name);this.className=[...set].join(' ');},remove:name=>{this.className=this.className.split(' ').filter(x=>x!==name).join(' ');}};
 }
 append(...nodes){for(const node of nodes){node.remove();this.children.push(node);node.parentNode=this;}}
 remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(node=>node!==this);this.parentNode=null;}
 replaceChildren(...nodes){for(const child of [...this.children])child.remove();this.append(...nodes);}
 setAttribute(key,value){this.attrs[key]=String(value);}
 removeAttribute(key){delete this.attrs[key];}
 getAttribute(key){return this.attrs[key];}
 contains(node){return this===node||this.children.some(child=>child.contains(node));}
 focus(){this.document.activeElement=this;}
 click(){if(!this.disabled)this.dispatchEvent(new Event('click'));}
}
const walk=node=>[node,...node.children.flatMap(walk)];
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({external=false,battlefield=false}={}){
 const document=new EventTarget();document.documentElement={lang:'tr'};document.hidden=false;document.createElement=tag=>new Element(tag,document);document.body=document.createElement('body');
 const nav=document.createElement('nav');document.body.append(nav);
 const reactionHost=battlefield?document.createElement('div'):null;if(reactionHost)document.body.append(reactionHost);
 const window=new EventTarget(),media=new EventTarget(),storage=new Map(),timeouts=new Map(),intervals=new Map();let time=10000,sequence=0;
 media.matches=false;window.location=new URL('https://game.test/battle-preview.html?auctionCode=ROOM&auctionToken=seat&auctionMatchKey=ROOM:1:100');window.matchMedia=()=>media;
 window.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)};
 window.crypto={randomUUID:()=>`request_${++sequence}`};window.setTimeout=(callback,ms)=>{const id=++sequence;timeouts.set(id,{callback,at:time+ms});return id;};window.clearTimeout=id=>timeouts.delete(id);window.setInterval=callback=>{const id=++sequence;intervals.set(id,callback);return id;};window.clearInterval=id=>intervals.delete(id);
 const requests=[];window.fetch=(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,body:JSON.parse(options.body),resolve,reject}));
 let context={code:'ROOM',token:'seat',identity:'owner',matchKey:'ROOM:1:100'};
 const api=createArenaEmotes({window,document,nav,reactionHost,now:()=>time,...(external?{readContext:()=>context}:{})});
 const nodes=()=>walk(document.body),cls=name=>nodes().filter(node=>node.className.split(' ').includes(name)),button=id=>nodes().find(node=>node.dataset.emoteId===id);
 const snapshot=(patch={})=>({matchKey:context?.matchKey||'ROOM:1:100',serverTime:time,enabled:true,cooldownMs:0,events:[],...patch});
 const event=(id='event',patch={})=>({id,emoteId:'laugh',side:1,at:time,expiresAt:time+5000,...patch});
 const tick=ms=>{time+=ms;for(const [id,item] of [...timeouts])if(item.at<=time){timeouts.delete(id);item.callback();}for(const callback of intervals.values())callback();};
 return {api,window,document,media,storage,nav,reactionHost,cls,button,snapshot,event,requests,tick,timeouts,intervals,setContext:next=>{context=next;api.syncContext();},getContext:()=>context};
}

test('arena reactions are mounted outside navigation and clean up both external slots',()=>{
 const h=fixture({battlefield:true}),root=h.cls('arena-emotes')[0],slots=h.cls('arena-emote-slot');
 assert.equal(root.children.length,1,'only the picker trigger participates in the nav layout');
 assert.equal(slots.length,2);assert.ok(slots.every(slot=>slot.parentNode===h.reactionHost&&slot.hidden));
 h.api.apply(h.snapshot());h.tick(1);h.api.apply(h.snapshot({events:[h.event('own',{side:0}),h.event('other')]}));
 assert.ok(slots.every(slot=>!slot.hidden&&slot.children.length===1));
 const images=h.cls('arena-emote-image');assert.ok(images.every(img=>img.width===132&&img.height===132));
 const newNav=h.document.createElement('nav');h.document.body.append(newNav);h.api.mount(newNav);
 assert.ok(slots.every(slot=>slot.parentNode===h.reactionHost),'navigation remount does not move artwork out of the battlefield');
 h.tick(4999);assert.equal(h.cls('arena-emote-image').length,2);h.tick(1);assert.equal(h.cls('arena-emote-image').length,0);
 h.api.apply(h.snapshot({enabled:false}));assert.ok(slots.every(slot=>slot.hidden));
 h.api.destroy();assert.equal(h.reactionHost.children.length,0);assert.equal(h.cls('arena-emote-slot').length,0);assert.equal(h.timeouts.size,0);assert.equal(h.intervals.size,0);
});
test('auction header repaint retains transient reactions without restarting their lifetime',()=>{
 const h=fixture();h.api.apply(h.snapshot());h.tick(1);h.api.apply(h.snapshot({events:[h.event('own',{side:0}),h.event('other')]}));
 const images=h.cls('arena-emote-image'),mine=h.document.createElement('div'),opponent=h.document.createElement('div');h.document.body.append(mine,opponent);
 h.tick(3000);h.nav.replaceChildren();h.api.mount(mine,opponent);
 assert.ok(mine.contains(images[0]));assert.ok(opponent.contains(images[1]));
 assert.equal(h.cls('arena-emote-slot-1')[0].parentNode,opponent);
 h.tick(1999);assert.equal(h.cls('arena-emote-image').length,2);h.tick(1);assert.equal(h.cls('arena-emote-image').length,0);h.api.destroy();
});

test('only six approved IDs; baseline and duplicate snapshots never replay',()=>{
 assert.deepEqual(ARENA_EMOTES.map(x=>x.id),['laugh','slow_clap','fake_cry','yawn','sunglasses','nanik']);
 const h=fixture();h.api.apply(h.snapshot({events:[h.event('old')]}));assert.equal(h.cls('arena-emote-image').length,0);
 h.tick(20);h.api.apply(h.snapshot({events:[h.event('new')]}));const image=h.cls('arena-emote-image')[0];assert.ok(image.src.includes('laugh.webp?event='));
 h.tick(100);h.api.apply(h.snapshot({events:[h.event('new')]}));assert.equal(h.cls('arena-emote-image')[0],image);
 h.tick(4900);assert.equal(h.cls('arena-emote-image').length,0);h.api.destroy();assert.equal(h.intervals.size,0);
});
test('pending request and five-second cooldown prevent duplicate sends; payload is exact',async()=>{
 const h=fixture();h.api.apply(h.snapshot());h.button('nanik').click();h.button('nanik').click();assert.equal(h.requests.length,1);
 assert.deepEqual(Object.keys(h.requests[0].body),['code','token','matchKey','emoteId','requestId']);
 h.requests[0].resolve({ok:true,json:async()=>({arenaEmotes:h.snapshot({cooldownMs:5000,events:[h.event('own',{side:0,emoteId:'nanik'})]})})});await flush();
 assert.equal(h.cls('arena-emote-image').length,1);h.button('laugh').click();assert.equal(h.requests.length,1);
 h.tick(5000);h.button('laugh').click();assert.equal(h.requests.length,2);h.api.destroy();
});
test('mute purges opponent immediately and unmute does not replay buffered events',()=>{
 const h=fixture();h.api.apply(h.snapshot());h.tick(1);h.api.apply(h.snapshot({events:[h.event('one')]}));h.cls('arena-emote-mute')[0].click();assert.equal(h.cls('arena-emote-image').length,0);assert.equal(h.storage.get('hero:arena-emotes-muted'),'1');
 h.tick(1);const buffered=h.event('two');h.api.apply(h.snapshot({events:[buffered]}));h.cls('arena-emote-mute')[0].click();h.api.apply(h.snapshot({events:[buffered]}));assert.equal(h.cls('arena-emote-image').length,0);
 h.tick(1);h.api.apply(h.snapshot({events:[h.event('three')]}));assert.equal(h.cls('arena-emote-image').length,1);h.api.destroy();
});
test('reduced motion is static immediately and on a live preference change',()=>{
 const h=fixture();h.api.apply(h.snapshot());h.media.matches=true;h.tick(1);h.api.apply(h.snapshot({events:[h.event('one')]}));assert.ok(h.cls('arena-emote-image')[0].src.endsWith('.png'));
 h.media.matches=false;h.tick(1);h.api.apply(h.snapshot({events:[h.event('two')]}));assert.ok(h.cls('arena-emote-image')[0].src.includes('.webp?event='));h.media.matches=true;h.media.dispatchEvent(new Event('change'));assert.ok(h.cls('arena-emote-image')[0].src.endsWith('.png'));h.api.destroy();
});
test('stale timestamps, foreign matches, unknown IDs and expired events cannot display',()=>{
 const h=fixture();h.api.apply(h.snapshot());h.tick(50);
 for(const patch of [{serverTime:1,events:[h.event()]},{matchKey:'ROOM:2:100',events:[h.event()]},{events:[h.event('x',{emoteId:'chicken'})]},{events:[h.event('y',{expiresAt:0})]}])h.api.apply(h.snapshot(patch));
 assert.equal(h.cls('arena-emote-image').length,0);h.api.apply(h.snapshot({events:[h.event('current')]}));assert.equal(h.cls('arena-emote-image').length,1);h.api.destroy();
});
test('route/account/rematch/leave invalidate held requests and cannot reactivate old UI',async()=>{
 for(const change of [h=>h.setContext({...h.getContext(),matchKey:'ROOM:2:100'}),h=>h.setContext({...h.getContext(),identity:'other'}),h=>h.setContext(null)]){
  const h=fixture({external:true});h.api.apply(h.snapshot());const old=h.snapshot({events:[h.event('late',{side:0})]});h.button('laugh').click();change(h);
  h.requests[0].resolve({ok:true,json:async()=>({arenaEmotes:old})});await flush();assert.equal(h.cls('arena-emote-image').length,0);assert.equal(h.cls('arena-emotes')[0].hidden,true);h.api.destroy();
 }
 const h=fixture();h.api.apply(h.snapshot());h.storage.set('hero-auction-login','different-owner');h.window.dispatchEvent(new Event('storage'));assert.equal(h.cls('arena-emotes')[0].hidden,true);h.api.apply(h.snapshot());assert.equal(h.cls('arena-emotes')[0].hidden,true);h.api.destroy();
});
test('block/platform/visibility/finish clear bubbles without any gameplay writes',()=>{
 for(const stop of [h=>h.api.apply(h.snapshot({enabled:false})),h=>{h.window.HeroPlatform={disableChat:true};h.window.dispatchEvent(new Event('hero:platform-settings'));},h=>h.window.dispatchEvent(new Event('heroarena:battle-finished'))]){
  const h=fixture();h.api.apply(h.snapshot());h.tick(1);h.api.apply(h.snapshot({events:[h.event()]}));stop(h);assert.equal(h.cls('arena-emote-image').length,0);assert.equal(h.cls('arena-emotes')[0].hidden,true);assert.equal(h.requests.length,0);h.api.destroy();
 }
 const h=fixture();h.api.apply(h.snapshot());h.document.hidden=true;h.document.dispatchEvent(new Event('visibilitychange'));h.tick(1);const item=h.event();h.api.apply(h.snapshot({events:[item]}));h.document.hidden=false;h.api.apply(h.snapshot({events:[item]}));assert.equal(h.cls('arena-emote-image').length,0);h.api.destroy();
});
test('body-mounted picker survives header repaint; close and Escape leave no overlay',()=>{
 const h=fixture();h.api.apply(h.snapshot());h.cls('arena-emote-toggle')[0].click();const picker=h.cls('arena-emote-picker')[0];assert.equal(picker.hidden,false);
 const next=h.document.createElement('header'),rival=h.document.createElement('header');h.document.body.append(next,rival);h.nav.replaceChildren();h.api.mount(next,rival);assert.equal(picker.parentNode,h.document.body);assert.equal(picker.hidden,false);
 const event=new Event('keydown',{cancelable:true});Object.defineProperty(event,'key',{value:'Escape'});h.document.dispatchEvent(event);assert.equal(picker.hidden,true);assert.equal(h.document.activeElement,h.cls('arena-emote-toggle')[0]);h.api.destroy();assert.equal(h.cls('arena-emote-picker').length,0);
});
test('old terminal snapshots cannot stop a new match and BFCache resume resets safely',()=>{
 const h=fixture();h.api.apply(h.snapshot());
 const emit=detail=>{const event=new Event('heroarena:commander-state');Object.defineProperty(event,'detail',{value:detail});h.window.dispatchEvent(event);};
 emit({finished:true,arenaEmotes:h.snapshot({matchKey:'ROOM:0:100'})});assert.equal(h.cls('arena-emotes')[0].hidden,false);
 h.window.dispatchEvent(new Event('pagehide'));assert.equal(h.cls('arena-emotes')[0].hidden,true);
 const pageShow=new Event('pageshow');Object.defineProperty(pageShow,'persisted',{value:true});h.window.dispatchEvent(pageShow);h.api.apply(h.snapshot());assert.equal(h.cls('arena-emotes')[0].hidden,false);h.api.destroy();
});
test('auction rejects cross-tab logout even with stale in-memory login and rematch',()=>{
 const h=fixture();h.api.destroy();const mine=h.document.createElement('div'),opponent=h.document.createElement('div');h.document.body.append(mine,opponent);h.document.querySelector=selector=>selector.includes('player0')?mine:opponent;
 h.storage.set('hero-auction-login',JSON.stringify({authToken:'owner'}));
 let room={code:'ROOM',phase:'auction',matchKey:'ROOM:1:100',arenaEmotes:h.snapshot()};
 const api=createAuctionEmotes({window:h.window,document:h.document,getContext:()=>({session:{code:'ROOM',token:'seat'},room,authToken:'owner',active:true})});api.update();assert.equal(h.cls('arena-emotes')[0].hidden,false);
 h.storage.delete('hero-auction-login');h.window.dispatchEvent(new Event('storage'));assert.equal(h.cls('arena-emotes')[0].hidden,true);
 room={...room,matchKey:'ROOM:2:100',arenaEmotes:h.snapshot({matchKey:'ROOM:2:100'})};api.update();assert.equal(h.cls('arena-emotes')[0].hidden,true);assert.equal(h.requests.length,0);api.destroy();
});
