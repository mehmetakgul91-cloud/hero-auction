import test from 'node:test';
import assert from 'node:assert/strict';
import {createFriendsUI} from '../public/friends.js';
import {translate} from '../public/crazygames-en.js';
class Element{
 constructor(tag='div'){this.tag=tag;this.children=[];this.hidden=false;this.open=false;this.value='';this.textContent='';this.classList={add(){},remove(){}};this.attrs={};}
 append(...v){this.children.push(...v)} replaceChildren(...v){this.children=v} setAttribute(k,v){this.attrs[k]=v} contains(el){return this===el||this.children.some(c=>c.contains?.(el))} focus(){this.focused=true} select(){this.selected=true} scrollIntoView(){}
}
const snapshot={playerId:'HA-ABC',guest:true,persistent:false,friends:[],incoming:[],outgoing:[]};
function fixture({fetcher,full=true,onInvite=null}={}){
 const ids=full?['friends-panel','friends-tools','home-friends-tab','friend-opponent','friends-message','friends-lists','friend-own-id','friend-id','friend-add','friend-add-form','friend-copy','friends-close','friends-online-count','friends-guest-note','friends-preview-note']:['friend-opponent'];
 const nodes=Object.fromEntries(ids.map(id=>[id,new Element()]));if(nodes['friends-panel'])nodes['friends-panel'].hidden=true;
 const calls=[],events={},timers=[];
 const win={crypto:{randomUUID:()=> 'tab-id'},fetch:async(path,options)=>{calls.push([path,JSON.parse(options.body),options]);return fetcher?fetcher(path,options):{ok:true,json:async()=>path==='/api/friends'?snapshot:{ok:true}}},setInterval:fn=>{timers.push(fn);return timers.length},clearInterval(){},addEventListener:(n,fn)=>events[n]=fn,removeEventListener:n=>delete events[n],navigator:{clipboard:{writeText:async()=>{throw Error('denied')}}}};
 const doc={getElementById:id=>nodes[id],createElement:tag=>new Element(tag),activeElement:null};
 const ui=createFriendsUI({document:doc,window:win,onInvite});return {ui,nodes,calls,events,timers,doc};
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
 f.ui.setLogin({authToken:'secret'});await tick();f.ui.open();f.nodes['friend-id'].value='HA-RIVAL';f.nodes['friend-add-form'].onsubmit({preventDefault(){}});await tick();assert.equal(reads,3);release();await tick();assert.equal(f.nodes['friend-id'].value,'');assert.ok(elements(f.nodes['friends-lists']).some(el=>el.textContent==='Gönderilen istekler · 1'));assert.equal(f.nodes['friends-lists'].children[0].tag,'details');
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
test('friend ID row overrides global full-width primary button without squeezing input',async()=>{
 const {readFile}=await import('node:fs/promises');
 const css=await readFile(new URL('../public/friends.css',import.meta.url),'utf8');
 assert.match(css,/\.friends-input-row button\{[^}]*flex:0 0 auto;[^}]*width:auto/);
 assert.match(css,/\.friends-input-row input\{[^}]*min-width:0;[^}]*flex:1;[^}]*margin-bottom:0/);
});

const online={playerId:'HA-ONLINE',name:'Online friend',online:true};
const elements=root=>[root,...root.children.flatMap(elements)];
const inviteButtons=f=>elements(f.nodes['friends-lists']).filter(el=>el.tag==='button');
const findButton=(f,label)=>inviteButtons(f).find(el=>el.textContent===label);
async function inviteFixture({state={...snapshot,friends:[online]},onInvite=async()=>true}={}){
 const source={value:state};const f=fixture({onInvite,fetcher:path=>({ok:true,json:async()=>path==='/api/friends'?source.value:{ok:true}})});
 f.ui.setLogin({authToken:'account'});await tick();f.ui.open();await tick();return {...f,source};
}
test('only online accepted friends have invite actions and the chosen friend requires explicit cost consent',async()=>{
 const sent=[];const f=await inviteFixture({state:{...snapshot,friends:[online,{playerId:'HA-OFFLINE',name:'Offline friend',online:false}],incoming:[{...online,playerId:'HA-INCOMING'}],outgoing:[{...online,playerId:'HA-OUTGOING'}]},onInvite:async id=>{sent.push(id);return true}});
 assert.equal(inviteButtons(f).filter(button=>button.textContent==='DAVET ET').length,1);
 findButton(f,'DAVET ET').onclick();assert.deepEqual(sent,[]);
 const content=elements(f.nodes['friends-lists']).map(el=>el.textContent).join(' ');
 assert.match(content,/Online friend/);assert.match(content,/Oda oluşturmak ücretsiz; maça giriş kişi başı 50 altın/);
 findButton(f,'ODA OLUŞTUR VE DAVET ET').onclick();await tick();assert.deepEqual(sent,['HA-ONLINE']);assert.equal(f.nodes['friends-message'].textContent,'Maç daveti gönderildi.');
 assert.equal(f.calls.some(([path])=>path==='/api/create'||path==='/api/friend/invite'),false,'Friends UI delegates exactly one selected ID, never creates its own invitation protocol');
});
test('confirmation cancel and closing the friends panel never send and discard stale controls',async()=>{
 const sent=[];const f=await inviteFixture({onInvite:async id=>sent.push(id)});
 findButton(f,'DAVET ET').onclick();const cancelled=findButton(f,'ODA OLUŞTUR VE DAVET ET');findButton(f,'VAZGEÇ').onclick();cancelled.onclick();await tick();assert.deepEqual(sent,[]);assert.equal(findButton(f,'ODA OLUŞTUR VE DAVET ET'),undefined);
 findButton(f,'DAVET ET').onclick();const closed=findButton(f,'ODA OLUŞTUR VE DAVET ET');f.ui.close();closed.onclick();f.ui.open();await tick();assert.deepEqual(sent,[]);assert.equal(findButton(f,'ODA OLUŞTUR VE DAVET ET'),undefined);
});
test('confirm double clicks are locked, relationship actions wait and failures can be retried',async()=>{
 const sent=[];let reject;const f=await inviteFixture({onInvite:id=>{sent.push(id);return new Promise((_,r)=>reject=r)}});
 findButton(f,'DAVET ET').onclick();const confirm=findButton(f,'ODA OLUŞTUR VE DAVET ET');confirm.onclick();confirm.onclick();assert.deepEqual(sent,['HA-ONLINE']);assert.equal(findButton(f,'ÇIKAR').disabled,true);
 findButton(f,'ÇIKAR').onclick();assert.equal(f.calls.some(([path])=>path==='/api/friend/remove'),false);
 reject(Error('Send failed'));await tick();assert.equal(f.nodes['friends-message'].textContent,'Send failed');assert.equal(findButton(f,'ODA OLUŞTUR VE DAVET ET').disabled,false);
 findButton(f,'ODA OLUŞTUR VE DAVET ET').onclick();assert.equal(sent.length,2);reject(Error('Send failed again'));await tick();
});
test('offline or removed friends invalidate consent even while a focused control prevents poll repaint',async()=>{
 for(const friends of [[{...online,online:false}],[]]){
  const sent=[];const f=await inviteFixture({onInvite:async id=>sent.push(id)});findButton(f,'DAVET ET').onclick();const confirm=findButton(f,'ODA OLUŞTUR VE DAVET ET');f.doc.activeElement=confirm;
  f.source.value={...snapshot,friends};await f.ui.refresh();confirm.onclick();await tick();assert.deepEqual(sent,[]);
  f.source.value={...snapshot,friends:[online]};f.doc.activeElement=null;await f.ui.refresh();assert.equal(findButton(f,'ODA OLUŞTUR VE DAVET ET'),undefined);
 }
});
test('changing rooms cancels consent, never leaves a game, and a private empty host room can be reused',async()=>{
 const sent=[];const f=await inviteFixture({onInvite:async id=>sent.push(id)});findButton(f,'DAVET ET').onclick();const confirm=findButton(f,'ODA OLUŞTUR VE DAVET ET');
 for(const room of [{code:'123',mode:'friend',phase:'auction',me:0,players:[{},{}]},{code:'123',mode:'friend',phase:'waiting',me:1,players:[{},null]},{code:'123',mode:'bot',phase:'waiting',me:0,players:[{},null]}]){
  f.ui.setRoom(room);assert.equal(findButton(f,'DAVET ET').disabled,true);findButton(f,'DAVET ET').onclick();confirm.onclick();await tick();assert.deepEqual(sent,[]);
 }
 assert.equal(f.calls.some(([path])=>path==='/api/room/detach'),false);
 f.ui.setRoom({code:'321',mode:'friend',phase:'waiting',me:0,players:[{},null]});findButton(f,'DAVET ET').onclick();assert.ok(findButton(f,'BU ODAYA DAVET ET'));findButton(f,'BU ODAYA DAVET ET').onclick();await tick();assert.deepEqual(sent,['HA-ONLINE']);
});
test('account change drops old invite confirmation and in-flight callback feedback',async()=>{
 let resolve;const sent=[];const f=await inviteFixture({onInvite:id=>{sent.push(id);return new Promise(r=>resolve=r)}});
 const oldInvite=findButton(f,'DAVET ET');oldInvite.onclick();findButton(f,'ODA OLUŞTUR VE DAVET ET').onclick();f.ui.setLogin({authToken:'new-account'});await tick();f.ui.open();await tick();oldInvite.onclick();assert.equal(findButton(f,'ODA OLUŞTUR VE DAVET ET'),undefined);
 resolve(true);await tick();assert.deepEqual(sent,['HA-ONLINE']);assert.equal(f.nodes['friends-message'].textContent,'');assert.equal(findButton(f,'DAVET ET').disabled,false);
});

test('friend invitation row uses server status, prevents duplicate sends, and preserves focused controls',async()=>{
 const sent=[];const f=await inviteFixture({onInvite:async id=>sent.push(id)});const original=findButton(f,'DAVET ET');f.doc.activeElement=original;
 f.ui.setInvitations({incoming:[],outgoing:[{id:'sent',to:online,status:'pending'}]});assert.equal(findButton(f,'DAVET ET'),original);original.onclick();assert.deepEqual(sent,[]);
 f.doc.activeElement=null;f.ui.close();f.ui.open();assert.ok(findButton(f,'Gönderildi').disabled);assert.match(elements(f.nodes['friends-lists']).map(e=>e.textContent).join(' '),/Yanıt bekleniyor/);
 f.ui.setInvitations({incoming:[],outgoing:[{id:'sent',to:online,status:'queued'}]});assert.match(elements(f.nodes['friends-lists']).map(e=>e.textContent).join(' '),/Kabul edildi/);
 f.ui.setInvitations({incoming:[],outgoing:[{id:'sent',to:online,status:'declined'}]});assert.equal(findButton(f,'DAVET ET').disabled,false);assert.doesNotMatch(elements(f.nodes['friends-lists']).map(e=>e.textContent).join(' '),/Davet reddedildi/);
});
test('global invitation language has exact English equivalents without fabricating match presence',()=>{
 for(const text of ['Onayla','Reddet','Maç bitince katılacaksın','Kabul edildi · maçın bitmesi bekleniyor','Davet reddedildi','Diğer davet','Yeni maç daveti','Son davetler','Başka sekmede katıldın','Güncel odayı aç'])assert.notEqual(translate(text),text);
});

const requestBox=f=>f.nodes['friends-lists'].children.find(el=>el.tag==='details');
const panelText=f=>elements(f.nodes['friends-lists']).map(el=>el.textContent).join(' ');
test('empty friendship request categories never create headings, blank states or a disclosure',async()=>{
 const f=await inviteFixture();assert.equal(requestBox(f),undefined);assert.equal(f.nodes['friends-lists'].children.length,1);
 assert.equal(f.nodes['friends-lists'].children[0].children[0].textContent,'Arkadaşlarım · 1');
 assert.doesNotMatch(panelText(f),/Gelen istekler|Gönderilen istekler|Bekleyen istek yok|Gönderilen istek yok/);
});
test('identity, privacy and friend-add form are together in a default-collapsed native disclosure',async()=>{
 const {readFile}=await import('node:fs/promises');const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
 const panel=html.slice(html.indexOf('<section id="friends-panel"'),html.indexOf('<section class="home-guide"'));
 const match=panel.match(/<details id="friends-tools"([^>]*)>([\s\S]*?)<\/details>/);assert.ok(match);assert.doesNotMatch(match[1],/\bopen\b/);
 assert.match(match[2],/<summary>Arkadaş ekle \/ Oyuncu kimliğim<\/summary>/);
 for(const id of ['friend-own-id','friend-copy','friend-add-form','friend-id','friend-add','friends-guest-note','friends-preview-note'])assert.ok(match[2].includes('id="'+id+'"'),id);
 assert.ok(match[2].includes('Çevrimiçi durumunu yalnızca kabul ettiğin arkadaşların görebilir.'));
 assert.ok(panel.indexOf('id="friends-lists"')>panel.indexOf('</details>'));
 const f=await inviteFixture();assert.equal(f.nodes['friends-tools'].open,false);
});
test('real friend requests use a compact collapsed count disclosure, retain its state during polling and reset on close/logout',async()=>{
 const requests={...snapshot,friends:[online],incoming:[{playerId:'HA-IN',name:'Incoming'}],outgoing:[{playerId:'HA-OUT',name:'Outgoing'}]};
 const f=await inviteFixture({state:requests});let details=requestBox(f);assert.ok(details);assert.equal(details.open,false);
 assert.equal(details.children[0].children[0].textContent,'Arkadaşlık istekleri');assert.equal(details.children[0].children[1].textContent,'2');
 assert.ok(findButton(f,'KABUL ET'));assert.ok(findButton(f,'REDDET'));assert.ok(findButton(f,'İPTAL ET'));
 details.open=true;await f.ui.refresh();details=requestBox(f);assert.equal(details.open,true);
 f.doc.activeElement=details.children[0];await f.ui.refresh();assert.equal(requestBox(f),details,'polling must preserve a focused request summary');
 f.doc.activeElement=null;f.nodes['friends-tools'].open=true;f.ui.close();assert.equal(details.open,false);assert.equal(f.nodes['friends-tools'].open,false);
 f.ui.open();await tick();assert.equal(requestBox(f).open,false);f.nodes['friends-tools'].open=true;requestBox(f).open=true;f.ui.setLogin(null);
 assert.equal(f.nodes['friends-tools'].open,false);assert.equal(f.nodes['friends-lists'].children.length,0);
});
test('request disclosure opening, closing and empty-state removal never sends mutations',async()=>{
 const f=await inviteFixture({state:{...snapshot,friends:[online],incoming:[{playerId:'HA-IN',name:'Incoming'}]}});
 requestBox(f).open=true;await f.ui.refresh();requestBox(f).open=false;await f.ui.refresh();
 assert.ok(f.calls.every(([path])=>['/api/friends','/api/friends/presence'].includes(path)));
 f.source.value={...snapshot,friends:[online]};await f.ui.refresh();assert.equal(requestBox(f),undefined);
 f.source.value={...snapshot,friends:[online],incoming:[{playerId:'HA-IN-NEW',name:'New incoming'}]};await f.ui.refresh();assert.equal(requestBox(f).open,false);
});
test('nonempty friendship accept, decline and outgoing cancel remain available and modify only chosen requests',async()=>{
 let state={...snapshot,friends:[online],incoming:[{playerId:'HA-ACCEPT',name:'Accept me'},{playerId:'HA-DECLINE',name:'Decline me'}],outgoing:[{playerId:'HA-CANCEL',name:'Cancel me'}]};
 const f=fixture({fetcher:async(path,options)=>{const b=JSON.parse(options.body);if(path==='/api/friend/accept'){const person=state.incoming.find(p=>p.playerId===b.playerId);state={...state,friends:[...state.friends,{...person,online:false}],incoming:state.incoming.filter(p=>p.playerId!==b.playerId)}}else if(path==='/api/friend/decline')state={...state,incoming:state.incoming.filter(p=>p.playerId!==b.playerId)};else if(path==='/api/friend/remove')state={...state,outgoing:state.outgoing.filter(p=>p.playerId!==b.playerId)};return {ok:true,json:async()=>path==='/api/friends'?state:{ok:true}}}});
 f.ui.setLogin({authToken:'account'});await tick();f.ui.open();await tick();requestBox(f).open=true;
 const action=(name,label)=>{const row=elements(f.nodes['friends-lists']).find(el=>el.className==='friend-row'&&elements(el).some(child=>child.textContent===name));return elements(row).find(el=>el.tag==='button'&&el.textContent===label)};
 action('Accept me','KABUL ET').onclick();await tick();assert.ok(state.friends.some(p=>p.playerId==='HA-ACCEPT'));assert.equal(requestBox(f).open,true);
 action('Decline me','REDDET').onclick();await tick();action('Cancel me','İPTAL ET').onclick();await tick();assert.equal(requestBox(f),undefined);
 const writes=f.calls.filter(([path])=>['/api/friend/accept','/api/friend/decline','/api/friend/remove'].includes(path));
 assert.deepEqual(writes.map(([path,body])=>[path,body.playerId]),[['/api/friend/accept','HA-ACCEPT'],['/api/friend/decline','HA-DECLINE'],['/api/friend/remove','HA-CANCEL']]);
});
test('cached request controls cannot act after panel closure or account changes',async()=>{
 const f=await inviteFixture({state:{...snapshot,friends:[online],incoming:[{playerId:'HA-IN',name:'Incoming'}]}});const oldAccept=findButton(f,'KABUL ET');
 f.ui.close();oldAccept.onclick();await tick();assert.equal(f.calls.some(([path])=>path==='/api/friend/accept'),false);
 f.ui.setLogin({authToken:'new-account'});await tick();f.ui.open();await tick();oldAccept.onclick();await tick();assert.equal(f.calls.some(([path])=>path==='/api/friend/accept'),false);
});
test('friend rows show only active pending/queued match invitation status, never old terminal history or inferred presence',async()=>{
 const offline={...online,online:false};const f=await inviteFixture({state:{...snapshot,friends:[offline]}});
 for(const status of ['joined','declined','failed','cancelled','expired']){
  f.ui.setInvitations({incoming:[],outgoing:[{id:'history',to:offline,status}]});assert.doesNotMatch(panelText(f),/Odaya katıldı|Davet reddedildi|Katılım başarısız|Davet iptal edildi|Davetin süresi doldu/);assert.match(panelText(f),/Çevrimdışı/);assert.doesNotMatch(panelText(f),/Maçta/);
 }
 for(const [status,label] of [['pending','Yanıt bekleniyor'],['queued','Kabul edildi']]){f.ui.setInvitations({incoming:[],outgoing:[{id:'active',to:offline,status}]});assert.match(panelText(f),new RegExp(label));assert.match(panelText(f),/Çevrimdışı/)}
});
