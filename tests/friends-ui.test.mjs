import test from 'node:test';
import assert from 'node:assert/strict';
import {createFriendsUI} from '../public/friends.js';
import {translate} from '../public/crazygames-en.js';
class Element{
 constructor(tag='div'){this.tag=tag;this.children=[];this.hidden=false;this.value='';this.textContent='';this.classList={add(){},remove(){}};this.attrs={};}
 append(...v){this.children.push(...v)} replaceChildren(...v){this.children=v} setAttribute(k,v){this.attrs[k]=v} contains(el){return this===el||this.children.some(c=>c.contains?.(el))} focus(){this.focused=true} select(){this.selected=true} scrollIntoView(){}
}
const snapshot={playerId:'HA-ABC',guest:true,persistent:false,friends:[],incoming:[],outgoing:[]};
function fixture({fetcher,full=true}={}){
 const ids=full?['friends-panel','home-friends-tab','friend-opponent','friends-message','friends-lists','friend-own-id','friend-id','friend-add','friend-add-form','friend-copy','friends-close','friends-online-count','friends-guest-note','friends-preview-note']:['friend-opponent'];
 const nodes=Object.fromEntries(ids.map(id=>[id,new Element()]));if(nodes['friends-panel'])nodes['friends-panel'].hidden=true;
 const calls=[],events={},timers=[];
 const win={crypto:{randomUUID:()=> 'tab-id'},fetch:async(path,options)=>{calls.push([path,JSON.parse(options.body),options]);return fetcher?fetcher(path,options):{ok:true,json:async()=>path==='/api/friends'?snapshot:{ok:true}}},setInterval:fn=>{timers.push(fn);return timers.length},clearInterval(){},addEventListener:(n,fn)=>events[n]=fn,removeEventListener:n=>delete events[n],navigator:{clipboard:{writeText:async()=>{throw Error('denied')}}}};
 const doc={getElementById:id=>nodes[id],createElement:tag=>new Element(tag),activeElement:null};
 const ui=createFriendsUI({document:doc,window:win});return {ui,nodes,calls,events,timers,doc};
}
const tick=()=>new Promise(r=>setImmediate(r));
test('login loads own ID, privacy states and authenticated heartbeat; pagehide logout stop presence',async()=>{
 const f=fixture();f.ui.setLogin({authToken:'secret',type:'guest'});await tick();f.ui.open();await tick();
 assert.equal(f.nodes['friend-own-id'].value,'HA-ABC');assert.equal(f.nodes['friends-guest-note'].hidden,false);assert.equal(f.nodes['friends-preview-note'].hidden,false);
 assert.equal(f.calls[0][1].sessionId,'tab-id');assert.equal(f.calls[0][1].online,true);f.events.pagehide();assert.equal(f.calls.at(-1)[1].online,false);assert.equal(f.calls.at(-1)[2].keepalive,true);
 const count=f.calls.length;f.timers[0]();assert.equal(f.calls.length,count);f.events.pageshow();await tick();f.ui.setLogin(null);assert.equal(f.nodes['friends-panel'].hidden,true);assert.equal(f.nodes['friend-own-id'].value,'');assert.equal(f.nodes['friend-copy'].disabled,true);
});
test('opponent button works without a panel and hides bots or missing public identities',async()=>{
 const f=fixture({full:false});f.ui.setLogin({authToken:'secret'});await tick();f.ui.setRoom({mode:'bot',me:0,players:[{}, {playerId:'HA-BOT'}]});assert.equal(f.nodes['friend-opponent'].hidden,true);
 f.ui.setRoom({mode:'friend',me:0,players:[{}, {playerId:'HA-RIVAL'}]});assert.equal(f.nodes['friend-opponent'].hidden,false);await f.nodes['friend-opponent'].onclick();assert.ok(f.calls.some(([path,body])=>path==='/api/friend/add'&&body.playerId==='HA-RIVAL'));
 f.ui.setRoom(null);assert.equal(f.nodes['friend-opponent'].hidden,true);
});
test('polling preserves input and copy denial selects public ID for manual copy',async()=>{
 const f=fixture();f.ui.setLogin({authToken:'secret'});await tick();f.ui.open();f.nodes['friend-id'].value='HA-TYPING';f.timers[0]();await tick();assert.equal(f.nodes['friend-id'].value,'HA-TYPING');await f.nodes['friend-copy'].onclick();assert.equal(f.nodes['friend-own-id'].selected,true);assert.equal(f.nodes['friends-message'].textContent,'Kimliğini seçip kopyalayabilirsin.');
});
test('old account response cannot repaint after logout',async()=>{
 let release;const f=fixture({fetcher:path=>path==='/api/friends'?new Promise(r=>release=()=>r({ok:true,json:async()=>snapshot})):{ok:true,json:async()=>({})}});f.ui.setLogin({authToken:'old'});f.ui.setLogin(null);release();await tick();assert.equal(f.nodes['friend-own-id'].value,'');assert.equal(f.nodes['friends-panel'].hidden,true);
});
test('mutation forces a new read while an older poll is pending',async()=>{
 let reads=0,release;const f=fixture({fetcher:path=>{if(path!=='/api/friends')return {ok:true,json:async()=>({})};reads++;if(reads===2)return new Promise(r=>release=()=>r({ok:true,json:async()=>snapshot}));return {ok:true,json:async()=>({...snapshot,outgoing:reads>=3?[{playerId:'HA-RIVAL',name:'Rival'}]:[]})}}});
 f.ui.setLogin({authToken:'secret'});await tick();f.ui.open();f.nodes['friend-id'].value='HA-RIVAL';f.nodes['friend-add-form'].onsubmit({preventDefault(){}});await tick();assert.equal(reads,3);release();await tick();assert.equal(f.nodes['friend-id'].value,'');assert.equal(f.nodes['friends-lists'].children[1].children[0].textContent,'Gönderilen istekler · 1');
});
test('new friend labels have exact English translations',()=>{for(const text of ['Arkadaşlar','Oyuncu kimliğin','Gelen istekler','Gönderilen istekler','＋ Rakibi arkadaş ekle','Arkadaşlık isteği gönderildi.','Çevrimiçi durumunu yalnızca kabul ettiğin arkadaşların görebilir.'])assert.notEqual(translate(text),text)});
test('repeated submit is locked and switching accounts releases form without stale feedback',async()=>{
 let release;const f=fixture({fetcher:path=>path==='/api/friend/add'?new Promise(r=>release=()=>r({ok:true,json:async()=>({})})):{ok:true,json:async()=>snapshot}});
 f.ui.setLogin({authToken:'old'});await tick();f.ui.open();await tick();f.nodes['friend-id'].value='HA-RIVAL';f.nodes['friend-add-form'].onsubmit({preventDefault(){}});f.nodes['friend-add-form'].onsubmit({preventDefault(){}});
 assert.equal(f.calls.filter(([p])=>p==='/api/friend/add').length,1);assert.equal(f.nodes['friend-add'].disabled,true);
 f.ui.setLogin({authToken:'new'});await tick();assert.equal(f.nodes['friend-add'].disabled,false);assert.equal(f.nodes['friends-message'].textContent,'');release();await tick();assert.equal(f.nodes['friends-message'].textContent,'');
});
test('request failure is shown and form can retry',async()=>{
 const f=fixture({fetcher:path=>path==='/api/friend/add'?{ok:false,json:async()=>({error:'Oyuncu bulunamadı.'})}:{ok:true,json:async()=>snapshot}});
 f.ui.setLogin({authToken:'secret'});await tick();f.ui.open();await tick();f.nodes['friend-id'].value='bad';f.nodes['friend-add-form'].onsubmit({preventDefault(){}});await tick();assert.equal(f.nodes['friends-message'].textContent,'Oyuncu bulunamadı.');assert.equal(f.nodes['friend-add'].disabled,false);assert.equal(f.nodes['friend-id'].value,'bad');
});
