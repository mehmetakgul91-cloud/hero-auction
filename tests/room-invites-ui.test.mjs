import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoomInvitesUI} from '../public/room-invites.js';
class Element{
 constructor(){this.children=[];this.hidden=false;this.value='';this.textContent='';this.attrs={}}
 append(...values){this.children.push(...values)}replaceChildren(...values){this.children=values}setAttribute(k,v){this.attrs[k]=v}contains(el){return this===el||this.children.some(c=>c.contains?.(el))}
}
const invitation={id:'invite-1',from:{name:'Host',playerId:'HA-HOST'},to:{name:'Guest',playerId:'HA-GUEST'},code:'123',status:'pending'};
function setup({fetcher,onJoined=()=>{},onHosted=()=>{},canStart=()=>true,storage=new Map(),createUI=createRoomInvitesUI}={}){
 const ids=['room-invites','room-invites-list','room-invites-summary','room-invites-message','room-invites-next','room-invites-history','room-invites-announcement','room-invite-compose-message','room-invite-open','room-invite-compose','room-invite-friend','room-invite-send'];const nodes=Object.fromEntries(ids.map(id=>[id,new Element()]));nodes['room-invite-compose'].hidden=true;
 const calls=[],events={},timers=[];const win={fetch:async(path,options)=>{calls.push([path,JSON.parse(options.body),options]);return {ok:true,json:async()=>fetcher?fetcher(path,JSON.parse(options.body)):path==='/api/friend/invitations'?{incoming:[invitation],outgoing:[]}:{}}},setInterval:fn=>{timers.push(fn);return 1},clearInterval(){},addEventListener:(n,fn)=>events[n]=fn,removeEventListener:n=>delete events[n],localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}};
 const doc={getElementById:id=>nodes[id],createElement:()=>new Element(),activeElement:null};const ui=createUI({document:doc,window:win,onJoined,onHosted,canStart});return {ui,nodes,calls,events,timers,storage,doc};
}
const tick=()=>new Promise(r=>setImmediate(r));
function buttons(f){return f.nodes['room-invites-list'].children.flatMap(row=>row.children.filter(c=>typeof c.onclick==='function'))}
test('receiving a pending invitation never accepts automatically; explicit response includes cost and current room proof',async()=>{
 const f=setup();f.ui.setLogin({authToken:'account'});f.ui.setRoom({code:'456'},'seat-proof');await tick();assert.equal(f.calls.length,1);assert.equal(f.nodes['room-invites'].hidden,false);assert.equal(f.nodes['room-invites-list'].children.length,1);
 const accept=buttons(f).find(b=>b.textContent==='Onayla');accept.onclick();await tick();const body=f.calls.find(([p])=>p==='/api/friend/invite/respond')[1];assert.deepEqual(body,{inviteId:'invite-1',response:'accept',consent:true,expectedCost:50,sourceCode:'456',sourceToken:'seat-proof',authToken:'account'});
});
test('queued invitation offers cancellation and does not navigate before authoritative joined payload',async()=>{
 let joins=0;const f=setup({fetcher:p=>p==='/api/friend/invitations'?{incoming:[{...invitation,status:'queued'}],outgoing:[]}:{},onJoined:()=>joins++});f.ui.setLogin({authToken:'account'});await tick();assert.equal(joins,0);const cancel=buttons(f).find(b=>b.textContent==='VAZGEÇ');cancel.onclick();await tick();assert.ok(f.calls.some(([p,b])=>p==='/api/friend/invite/cancel'&&b.inviteId==='invite-1'));assert.equal(joins,0);
});
test('joined receipt navigates once across polls and reloaded controllers then ACKs',async()=>{
 let joins=0;const storage=new Map(),fetcher=p=>p==='/api/friend/invitations'?{incoming:[{...invitation,status:'joined',token:'new-seat',room:{code:'123',phase:'auction'}}],outgoing:[]}:{};
 const f=setup({fetcher,storage,onJoined:()=>joins++});f.ui.setLogin({authToken:'account'});await tick();await f.ui.refresh();assert.equal(joins,1);assert.ok(f.calls.some(([p,,options])=>p==='/api/friend/invite/ack'&&options.keepalive));
 const second=setup({fetcher,storage,onJoined:()=>joins++});second.ui.setLogin({authToken:'account'});await tick();assert.equal(joins,1);
});
test('account switch discards stale invitation and room navigation response',async()=>{
 let release,joins=0;const f=setup({fetcher:p=>p==='/api/friend/invitations'?new Promise(r=>release=()=>r({incoming:[{...invitation,status:'joined',token:'old-seat',room:{code:'123'}}],outgoing:[]})):{},onJoined:()=>joins++});f.ui.setLogin({authToken:'old'});await tick();f.ui.setLogin(null);release();await tick();assert.equal(joins,0);assert.equal(f.nodes['room-invites'].hidden,true);
});
test('explicit send creates a hosted room first and then sends only chosen accepted-friend ID',async()=>{
 let hosted=0;const f=setup({onHosted:()=>hosted++,fetcher:p=>p==='/api/friend/invitations'?{incoming:[],outgoing:[]}:p==='/api/friends'?{friends:[{name:'Friend',playerId:'HA-GUEST',online:true}]}:p==='/api/create'?{token:'host-seat',room:{code:'123',me:0,phase:'waiting',mode:'friend',players:[{},null]}}:{}});
 f.ui.setLogin({authToken:'account'});await tick();f.nodes['room-invite-open'].onclick();await tick();assert.equal(f.calls.some(([p])=>p==='/api/create'),false);f.nodes['room-invite-friend'].value='HA-GUEST';f.nodes['room-invite-send'].onclick();await tick();assert.equal(hosted,1);assert.ok(f.calls.some(([p,b])=>p==='/api/friend/invite'&&b.code==='123'&&b.token==='host-seat'&&b.playerId==='HA-GUEST'));
});
test('pagehide suspends polling and pageshow refreshes without accepting',async()=>{
 const f=setup();f.ui.setLogin({authToken:'account'});await tick();f.events.pagehide();const count=f.calls.length;f.timers[0]();await tick();assert.equal(f.calls.length,count);f.events.pageshow();await tick();assert.equal(f.calls.length,count+1);assert.ok(f.calls.every(([p])=>p==='/api/friend/invitations'));
});
test('save completes before ACK and navigation; failed save is retried without marking handled',async()=>{
 const order=[];let saveFails=true;
 const f=setup({fetcher:p=>{if(p==='/api/friend/invite/ack')order.push('ack');return p==='/api/friend/invitations'?{incoming:[{...invitation,status:'joined',token:'new-seat',room:{code:'123'}}],outgoing:[]}:{}},onJoined:()=>{order.push('save');if(saveFails)throw Error('Storage full');return ()=>order.push('navigate')}});
 f.ui.setLogin({authToken:'account'});await tick();assert.deepEqual(order,['save']);assert.equal(f.storage.size,0);saveFails=false;await f.ui.refresh();assert.deepEqual(order,['save','save','ack','navigate']);
});
test('pending invitations stay visible ahead of terminal invitation history',async()=>{
 const f=setup({fetcher:p=>p==='/api/friend/invitations'?{incoming:[invitation,...Array.from({length:30},(_,i)=>({...invitation,id:'old-'+i,status:'declined'}))],outgoing:[]}:{} });
 f.ui.setLogin({authToken:'account'});await tick();
 assert.ok(buttons(f).some(b=>b.textContent==='Onayla'));
 assert.equal(f.nodes['room-invites-list'].children.length,1);assert.equal(f.nodes['room-invites-history'].children.length,10);
});

const waitingRoom={code:'123',phase:'waiting',mode:'friend',me:0,players:[{},null]};
const auctionRoom={...waitingRoom,phase:'auction',round:0,players:[{},{}]};
test('direct friend send reuses the current host room, sends one ID, and serializes repeated clicks',async()=>{
 let release;const f=setup({fetcher:p=>p==='/api/friend/invite'?new Promise(r=>release=()=>r({})): {incoming:[],outgoing:[]}});
 f.ui.setLogin({authToken:'account'});f.ui.setRoom(waitingRoom,'host-seat');await tick();
 const sending=f.ui.sendTo('HA-CHOSEN');assert.equal(await f.ui.sendTo('HA-OTHER'),false);
 assert.equal(f.calls.filter(([p])=>p==='/api/friend/invite').length,1);assert.equal(f.calls.some(([p])=>p==='/api/create'),false);
 assert.equal(f.calls.find(([p])=>p==='/api/friend/invite')[1].playerId,'HA-CHOSEN');release();assert.equal(await sending,true);
});
test('direct friend send never replaces an active, full, random or non-host room',async()=>{
 for(const room of [auctionRoom,{...waitingRoom,players:[{},{}]},{...waitingRoom,mode:'random'},{...waitingRoom,me:1}]){
  const f=setup();f.ui.setLogin({authToken:'account'});f.ui.setRoom(room,'seat');await tick();
  await assert.rejects(f.ui.sendTo('HA-FRIEND'),/boş bir özel oda/);
  assert.ok(f.calls.every(([p])=>p==='/api/friend/invitations'));
 }
});
test('late room creation cannot replace newer navigation or send an invitation there',async()=>{
 let release,hosted=0;const f=setup({onHosted:()=>hosted++,fetcher:p=>p==='/api/create'?new Promise(r=>release=()=>r({token:'old-seat',room:waitingRoom})):{incoming:[],outgoing:[]}});
 f.ui.setLogin({authToken:'account'});await tick();const sending=f.ui.sendTo('HA-FRIEND');await tick();
 f.ui.setRoom({...auctionRoom,code:'999'},'new-seat');release();assert.equal(await sending,false);
 assert.equal(hosted,0);assert.equal(f.calls.some(([p])=>p==='/api/friend/invite'),false);
});
test('changing account during create never saves or sends the previous account room',async()=>{
 let release,hosted=0;const f=setup({onHosted:()=>hosted++,fetcher:p=>p==='/api/create'?new Promise(r=>release=()=>r({token:'old-seat',room:waitingRoom})):{incoming:[],outgoing:[]}});
 f.ui.setLogin({authToken:'old'});await tick();const sending=f.ui.sendTo('HA-FRIEND');await tick();f.ui.setLogin({authToken:'new'});release();assert.equal(await sending,false);
 assert.equal(hosted,0);assert.equal(f.calls.some(([p])=>p==='/api/friend/invite'),false);
});
test('old terminal invitation history is not promoted to a new notification after reload or room changes',async()=>{
 const f=setup({fetcher:()=>({incoming:[{...invitation,status:'joined'},{...invitation,id:'cancelled',status:'cancelled'}],outgoing:[]})});
 f.ui.setLogin({authToken:'account'});await tick();assert.equal(f.nodes['room-invites'].hidden,true);
 for(const room of [auctionRoom,{...auctionRoom,phase:'finished',round:10},auctionRoom,null]){f.ui.setRoom(room,'seat');await f.ui.refresh();assert.equal(f.nodes['room-invites'].hidden,true)}
});
test('incoming responses stay directly visible during auction, preparation and battle without expanding a popover',async()=>{
 const f=setup({fetcher:()=>({incoming:[invitation,{...invitation,id:'old',status:'joined'}],outgoing:[]})});
 f.ui.setLogin({authToken:'account'});await tick();
 for(const room of [auctionRoom,{...auctionRoom,phase:'finished',matchSettled:false},auctionRoom]){
  f.ui.setRoom(room,'seat');await f.ui.refresh();assert.equal(f.nodes['room-invites'].hidden,false);assert.equal(f.nodes['room-invites-list'].children.length,1);
  assert.ok(buttons(f).some(b=>b.textContent==='Onayla'));assert.ok(buttons(f).some(b=>b.textContent==='Reddet'));
 }
});
test('fresh failure and host cancellation are visible until dismissed and do not reappear on polling',async()=>{
 for(const status of ['failed','expired','cancelled']){
  let current=invitation;const f=setup({fetcher:()=>({incoming:[current],outgoing:[]})});
  f.ui.setLogin({authToken:'account'});f.ui.setRoom(auctionRoom,'seat');await tick();current={...invitation,status,reason:'Davet odası artık açık değil.'};await f.ui.refresh();
  assert.equal(f.nodes['room-invites'].hidden,false);assert.equal(f.nodes['room-invites-list'].children.length,1);
  buttons(f).find(b=>b.textContent==='Kapat').onclick();assert.equal(f.nodes['room-invites'].hidden,true);await f.ui.refresh();assert.equal(f.nodes['room-invites'].hidden,true);
 }
});
test('a successful poll clears an earlier network error without clearing a genuine action error',async()=>{
 let failPoll=true,failAction=false;const f=setup({fetcher:p=>{if(p==='/api/friend/invitations'){if(failPoll)throw Error('Load failed');return {incoming:[invitation],outgoing:[]}}if(failAction)throw Error('Insufficient gold');return {}}});
 f.ui.setLogin({authToken:'account'});await tick();assert.equal(f.nodes['room-invites-message'].textContent,'Load failed');failPoll=false;await f.ui.refresh();assert.equal(f.nodes['room-invites-message'].textContent,'');
 failAction=true;buttons(f).find(b=>b.textContent==='Onayla').onclick();await tick();assert.equal(f.nodes['room-invites-message'].textContent,'Insufficient gold');await f.ui.refresh();assert.equal(f.nodes['room-invites-message'].textContent,'Insufficient gold');
});
test('poll rejection from before confirmed navigation cannot repaint a stale Load failed message',async()=>{
 let fail;const f=setup({fetcher:()=>new Promise((_,reject)=>fail=()=>reject(Error('Load failed')))});
 f.ui.setLogin({authToken:'account'});await tick();f.ui.setRoom(auctionRoom,'seat');fail();await tick();
 assert.equal(f.nodes['room-invites-message'].textContent,'');assert.equal(f.nodes['room-invites'].hidden,true);
});
test('pagehide discards a pending failed poll and pageshow can recover normally',async()=>{
 let fail,first=true;const f=setup({fetcher:()=>first?new Promise((_,reject)=>fail=()=>reject(Error('Load failed'))):{incoming:[],outgoing:[]}});
 f.ui.setLogin({authToken:'account'});await tick();f.events.pagehide();fail();await tick();assert.equal(f.nodes['room-invites-message'].textContent,'');first=false;f.events.pageshow();await tick();assert.equal(f.nodes['room-invites'].hidden,true);
});
test('new lobby friend action is wired into the same invitation sender, not a new API',async()=>{
 const {readFile}=await import('node:fs/promises');const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(app,/onInvite:playerId=>roomInvitesUI\.sendTo\(playerId\)/);
});
test('passive network failure and recovery never overwrite a genuine action error',async()=>{
 let failPoll=false;const f=setup({fetcher:p=>{if(p==='/api/friend/invitations'){if(failPoll)throw Error('Load failed');return {incoming:[invitation],outgoing:[]}}throw Error('Insufficient gold')}});
 f.ui.setLogin({authToken:'account'});await tick();buttons(f).find(b=>b.textContent==='Onayla').onclick();await tick();
 assert.equal(f.nodes['room-invites-message'].textContent,'Insufficient gold');failPoll=true;await f.ui.refresh();assert.equal(f.nodes['room-invites-message'].textContent,'Insufficient gold');failPoll=false;await f.ui.refresh();assert.equal(f.nodes['room-invites-message'].textContent,'Insufficient gold');
});
test('failed host persistence is shown, sends no invitation and cannot silently reuse the unsaved room',async()=>{
 let failSave=true;const f=setup({onHosted:()=>{if(failSave)throw Error('Storage full')},fetcher:p=>p==='/api/create'?{token:'host-seat',room:waitingRoom}:{incoming:[],outgoing:[]}});
 f.ui.setLogin({authToken:'account'});await tick();await assert.rejects(f.ui.sendTo('HA-FRIEND'),/Storage full/);
 assert.equal(f.nodes['room-invites-message'].textContent,'Storage full');assert.equal(f.calls.some(([p])=>p==='/api/friend/invite'),false);
 failSave=false;assert.equal(await f.ui.sendTo('HA-FRIEND'),true);assert.equal(f.calls.filter(([p])=>p==='/api/create').length,2);
 assert.equal(f.calls.filter(([p])=>p==='/api/friend/invite').length,1);
});
test('own explicit cancellation does not leave a new failure badge above the match',async()=>{
 let current={...invitation,status:'queued'};const f=setup({fetcher:p=>{if(p==='/api/friend/invite/cancel')current={...current,status:'cancelled'};return {incoming:[current],outgoing:[]}}});
 f.ui.setLogin({authToken:'account'});f.ui.setRoom(auctionRoom,'seat');await tick();buttons(f).find(b=>b.textContent==='VAZGEÇ').onclick();await tick();
 assert.equal(f.nodes['room-invites'].hidden,true);await f.ui.refresh();assert.equal(f.nodes['room-invites'].hidden,true);
});
test('normal room entry and friend invitation transactions cannot run concurrently',async()=>{
 let entering=true;const f=setup({canStart:()=>!entering});f.ui.setLogin({authToken:'account'});f.ui.setRoom(waitingRoom,'seat');await tick();
 await assert.rejects(f.ui.sendTo('HA-FRIEND'),/Oda işlemi sürüyor/);assert.equal(f.calls.some(([p])=>p==='/api/friend/invite'),false);
 buttons(f).find(b=>b.textContent==='Onayla').onclick();await tick();assert.equal(f.calls.some(([p])=>p==='/api/friend/invite/respond'),false);
 entering=false;const sending=f.ui.sendTo('HA-FRIEND');assert.equal(f.ui.busy,true);await sending;assert.equal(f.ui.busy,false);
 const {readFile}=await import('node:fs/promises');const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(app,/canStart:\(\)=>roomEntryPending===0/);assert.match(app,/if\(entry&&\(roomEntryPending\|\|roomInvitesUI\.busy\)\)throw Error/);
});

const contents=node=>[node.textContent,...node.children.flatMap(child=>contents(child))].join(' ');
test('one card bounds many invites; cycling exposes each sender without accepting or losing requests',async()=>{
 const pending=Array.from({length:12},(_,i)=>({...invitation,id:'i'+i,from:{name:'Friend '+i}}));
 const f=setup({fetcher:()=>({incoming:pending,outgoing:[]})});f.ui.setLogin({authToken:'account'});await tick();
 assert.equal(f.nodes['room-invites-list'].children.length,1);assert.equal(f.nodes['room-invites-next'].hidden,false);
 for(let i=0;i<12;i++){assert.match(contents(f.nodes['room-invites-list']),new RegExp('Friend '+i+'(?: |$)'));f.nodes['room-invites-next'].onclick()}
 assert.equal(f.calls.length,1);assert.match(contents(f.nodes['room-invites-list']),/Friend 0/);
});
test('unchanged polls preserve the actual response button node and do not move focus',async()=>{
 const f=setup();f.ui.setLogin({authToken:'account'});await tick();const accept=buttons(f).find(b=>b.textContent==='Onayla');f.doc.activeElement=accept;await f.ui.refresh();
 assert.equal(buttons(f).find(b=>b.textContent==='Onayla'),accept);assert.equal(f.doc.activeElement,accept);
});
test('queued approval explains settlement and fees, blocks a second approval but allows rejection',async()=>{
 const f=setup({fetcher:()=>({incoming:[{...invitation,status:'queued'},{...invitation,id:'another'}],outgoing:[]})});f.ui.setLogin({authToken:'account'});await tick();
 assert.match(contents(f.nodes['room-invites-list']),/Maç bitince katılacaksın/);assert.match(contents(f.nodes['room-invites-list']),/50 altın yalnız yeni odaya katılınca/);
 f.nodes['room-invites-next'].onclick();assert.equal(buttons(f).find(b=>b.textContent==='Onayla').disabled,true);assert.equal(buttons(f).find(b=>b.textContent==='Reddet').disabled,false);
});
test('escaped sender text, explicit fee description and no permission prompt',async()=>{
 const name='<img src=x onerror=alert(1)>';
 const f=setup({fetcher:()=>({incoming:[{...invitation,from:{name}}],outgoing:[]})});f.ui.setLogin({authToken:'account'});await tick();
 assert.match(contents(f.nodes['room-invites-list']),/<img src=x/);assert.match(contents(f.nodes['room-invites-list']),/Onayla: 50 altın giriş ücretini kabul et/);
 assert.equal(buttons(f).find(b=>b.textContent==='Onayla').attrs['aria-describedby'],'room-invite-consent');assert.ok(f.calls.every(([p])=>p==='/api/friend/invitations'));
});
test('a stale approve button cannot act on a cancelled invite',async()=>{
 let current=invitation;const f=setup({fetcher:()=>({incoming:[current],outgoing:[]})});f.ui.setLogin({authToken:'account'});await tick();const accept=buttons(f).find(b=>b.textContent==='Onayla');
 current={...invitation,status:'cancelled'};await f.ui.refresh();accept.onclick();await tick();assert.ok(f.calls.every(([p])=>p==='/api/friend/invitations'));
});
test('reconnect checks server state without silently accepting a pending invite',async()=>{
 const f=setup();f.ui.setLogin({authToken:'account'});await tick();f.events.online();await tick();assert.equal(f.calls.length,2);assert.ok(f.calls.every(([p])=>p==='/api/friend/invitations'));
});

test('arrival of another invitation preserves focused response controls and announces just once',async()=>{
 let incoming=[invitation];const f=setup({fetcher:()=>({incoming,outgoing:[]})});f.ui.setLogin({authToken:'account'});await tick();
 const accept=buttons(f).find(b=>b.textContent==='Onayla');f.doc.activeElement=accept;incoming=[invitation,{...invitation,id:'other',from:{name:'New friend'}}];await f.ui.refresh();
 assert.equal(buttons(f).find(b=>b.textContent==='Onayla'),accept);assert.equal(f.doc.activeElement,accept);assert.match(f.nodes['room-invites-announcement'].textContent,/New friend/);
 const announcement=f.nodes['room-invites-announcement'].textContent;await f.ui.refresh();assert.equal(f.nodes['room-invites-announcement'].textContent,announcement);
});
test('concurrent receipt polling cannot save or navigate twice while handoff awaits storage',async()=>{
 let release,saves=0,navigations=0;const f=setup({fetcher:()=>({incoming:[{...invitation,status:'joined',token:'new-seat',room:{code:'123'}}],outgoing:[]}),onJoined:async()=>{saves++;await new Promise(r=>release=r);return ()=>navigations++}});
 f.ui.setLogin({authToken:'account'});await tick();await f.ui.refresh(true);assert.equal(saves,1);release();await tick();assert.equal(navigations,1);
});

test('incoming arrival never steals the focused sender cancellation control',async()=>{
 let incoming=[];const outgoing=[{...invitation,id:'sent'}];const f=setup({fetcher:()=>({incoming,outgoing})});f.ui.setLogin({authToken:'account'});await tick();
 const cancel=buttons(f).find(b=>b.textContent==='DAVETİ İPTAL ET');f.doc.activeElement=cancel;incoming=[invitation];await f.ui.refresh();
 assert.equal(buttons(f).find(b=>b.textContent==='DAVETİ İPTAL ET'),cancel);assert.equal(f.nodes['room-invites-next'].hidden,false);assert.match(f.nodes['room-invites-announcement'].textContent,/Host/);
 f.ui.setRoom(auctionRoom,'seat');assert.equal(buttons(f).find(b=>b.textContent==='DAVETİ İPTAL ET'),cancel);
});
test('another-tab receipt offers explicit validated recovery and never navigates from storage alone',async()=>{
 let current=invitation,joins=0;const storage=new Map([['hero-auction-session',JSON.stringify({code:'123',token:'new-seat'})]]);
 const f=setup({storage,onJoined:()=>joins++,fetcher:p=>p==='/api/state'?{room:{code:'123',me:1,players:[{playerId:'HA-HOST'},{}]}}:{incoming:[current],outgoing:[]}});
 f.ui.setLogin({authToken:'account'});f.ui.setRoom({...auctionRoom,code:'456'},'old-seat');await tick();current={...invitation,status:'joined'};f.events.storage({key:'hero-auction-session'});await tick();
 assert.equal(joins,0);assert.match(contents(f.nodes['room-invites-list']),/Başka sekmede katıldın/);buttons(f).find(b=>b.textContent==='Güncel odayı aç').onclick();await tick();
 assert.equal(joins,1);assert.equal(f.calls.filter(([p])=>p==='/api/state').length,1);assert.ok(!f.calls.some(([p])=>p==='/api/friend/invite/respond'));
});
test('another-tab recovery refuses a newer unrelated stored room without abandoning the current game',async()=>{
 let current=invitation,joins=0;const storage=new Map([['hero-auction-session',JSON.stringify({code:'999',token:'newer-seat'})]]);
 const f=setup({storage,onJoined:()=>joins++,fetcher:()=>({incoming:[current],outgoing:[]})});f.ui.setLogin({authToken:'account'});await tick();current={...invitation,status:'joined'};await f.ui.refresh();
 buttons(f).find(b=>b.textContent==='Güncel odayı aç').onclick();await tick();assert.equal(joins,0);assert.match(f.nodes['room-invites-message'].textContent,/Güncel oda bulunamadı/);assert.ok(!f.calls.some(([p])=>p==='/api/state'));
});
test('status announcements name the inviter for incoming and recipient for outgoing',async()=>{
 let current=invitation;const f=setup({fetcher:()=>({incoming:[current],outgoing:[]})});f.ui.setLogin({authToken:'account'});await tick();current={...invitation,status:'queued'};await f.ui.refresh();
 assert.match(f.nodes['room-invites-announcement'].textContent,/^Host/);assert.doesNotMatch(f.nodes['room-invites-announcement'].textContent,/Guest/);
});

test('delayed cross-tab recovery cannot replace a newer stored or local room',async()=>{
 for(const changed of ['storage','room']){
  let current=invitation,release,joins=0;const storage=new Map([['hero-auction-session',JSON.stringify({code:'123',token:'new-seat'})]]);
  const f=setup({storage,onJoined:()=>joins++,fetcher:p=>p==='/api/state'?new Promise(r=>release=()=>r({room:{code:'123',me:1,players:[{playerId:'HA-HOST'},{}]}})):{incoming:[current],outgoing:[]}});
  f.ui.setLogin({authToken:'account'});await tick();current={...invitation,status:'joined'};await f.ui.refresh();buttons(f).find(b=>b.textContent==='Güncel odayı aç').onclick();await tick();
  if(changed==='storage')storage.set('hero-auction-session',JSON.stringify({code:'999',token:'newer-seat'}));else f.ui.setRoom({...auctionRoom,code:'999'},'newer-seat');
  release();await tick();assert.equal(joins,0);assert.match(f.nodes['room-invites-message'].textContent,/Aktif odan değişti/);
 }
});

test('reconnect supersedes a hung older poll and ignores its late data',async()=>{
 let reads=0,release;const f=setup({fetcher:()=>++reads===1?new Promise(r=>release=()=>r({incoming:[{...invitation,id:'stale'}],outgoing:[]})):{incoming:[invitation],outgoing:[]}});
 f.ui.setLogin({authToken:'account'});await tick();f.events.online();await tick();assert.equal(reads,2);release();await tick();
 buttons(f).find(b=>b.textContent==='Onayla').onclick();await tick();assert.equal(f.calls.find(([p])=>p==='/api/friend/invite/respond')[1].inviteId,'invite-1');
});

const admittedRoom={code:'123',mode:'friend',phase:'auction',round:0,me:0,players:[invitation.from,invitation.to]};
for(const order of ['room-first','receipt-first'])test('sender joined overlay clears automatically after admission in '+order+' order',async()=>{
 let status='pending';const f=setup({fetcher:()=>({incoming:[],outgoing:[{...invitation,status}]})});
 f.ui.setLogin({authToken:'host-account'});f.ui.setRoom({...admittedRoom,phase:'waiting',players:[invitation.from,null]},'host-seat');await tick();assert.equal(f.nodes['room-invites'].hidden,false);
 if(order==='room-first')f.ui.setRoom(admittedRoom,'host-seat');
 status='joined';await f.ui.refresh();
 if(order==='receipt-first'){assert.equal(f.nodes['room-invites'].hidden,false);f.ui.setRoom(admittedRoom,'host-seat')}
 assert.equal(f.nodes['room-invites'].hidden,true);assert.equal(f.nodes['room-invites-list'].children.length,0);
 f.events.online();await tick();await f.ui.refresh();assert.equal(f.nodes['room-invites'].hidden,true);
 f.ui.setRoom(null,null);await f.ui.refresh();assert.equal(f.nodes['room-invites'].hidden,true,'dismissed completion cannot reappear when leaving');
 assert.ok(f.calls.every(([path])=>path==='/api/friend/invitations'),'presentation cleanup must not cancel, ACK or alter sender records');
});
test('receiver successful handoff clears completion even when the navigation adapter does not call setRoom',async()=>{
 let current=invitation,saves=0,navigations=0;const f=setup({fetcher:path=>path==='/api/friend/invitations'?{incoming:[current],outgoing:[]}:{},onJoined:()=>{saves++;return ()=>navigations++}});
 f.ui.setLogin({authToken:'guest-account'});await tick();current={...invitation,status:'joined',room:{...admittedRoom,me:1},token:'guest-seat'};await f.ui.refresh();
 assert.equal(saves,1);assert.equal(navigations,1);assert.equal(f.nodes['room-invites'].hidden,true);await f.ui.refresh();assert.equal(saves,1);assert.equal(f.nodes['room-invites'].hidden,true);
 assert.equal(f.calls.filter(([path])=>path==='/api/friend/invite/respond').length,0,'receipt presentation does not accept or debit again');
});
test('receiver receipt after current-room restore clears only the matching admitted overlay',async()=>{
 let status='pending';const f=setup({fetcher:()=>({incoming:[{...invitation,status}],outgoing:[]})});f.ui.setLogin({authToken:'guest-account'});await tick();
 f.ui.setRoom({...admittedRoom,me:1},'guest-seat');status='joined';await f.ui.refresh();assert.equal(f.nodes['room-invites'].hidden,true);
 const reloaded=setup({fetcher:()=>({incoming:[{...invitation,status}],outgoing:[]})});reloaded.ui.setRoom({...admittedRoom,me:1},'guest-seat');reloaded.ui.setLogin({authToken:'guest-account'});await tick();assert.equal(reloaded.nodes['room-invites'].hidden,true);
});
test('same room code alone cannot hide completion for unrelated players or an unverified seat',async()=>{
 for(const [room,token] of [[{...admittedRoom,players:[invitation.from,{playerId:'HA-OTHER'}]},'host-seat'],[admittedRoom,null],[{...admittedRoom,me:1},'different-seat']]){
  let status='pending';const f=setup({fetcher:()=>({incoming:[],outgoing:[{...invitation,status}]})});f.ui.setLogin({authToken:'host-account'});f.ui.setRoom(room,token);await tick();status='joined';await f.ui.refresh();assert.equal(f.nodes['room-invites'].hidden,false);
 }
});
test('current-room success never hides a different pending invite or a still-queued acceptance',async()=>{
 let status='pending';const pending={...invitation,id:'other',code:'789',from:{name:'Other host',playerId:'HA-OTHER'}};
 const f=setup({fetcher:()=>({incoming:[pending],outgoing:[{...invitation,status}]})});f.ui.setLogin({authToken:'account'});f.ui.setRoom(admittedRoom,'host-seat');await tick();status='joined';await f.ui.refresh();
 assert.equal(f.nodes['room-invites'].hidden,false);assert.equal(f.nodes['room-invites-next'].hidden,true);assert.ok(buttons(f).some(button=>button.textContent==='Onayla'));
 const queued=setup({fetcher:()=>({incoming:[{...invitation,status:'queued'}],outgoing:[]})});queued.ui.setLogin({authToken:'account'});queued.ui.setRoom({...admittedRoom,me:1},'guest-seat');await tick();assert.equal(queued.nodes['room-invites'].hidden,false);assert.ok(buttons(queued).some(button=>button.textContent==='VAZGEÇ'));
});
test('failed receipt save remains visible and retry clears success without hiding a later ACK error',async()=>{
 let current=invitation,saveFails=true,ackFails=false;const f=setup({fetcher:path=>{if(path==='/api/friend/invite/ack'&&ackFails)throw Error('ACK network error');return path==='/api/friend/invitations'?{incoming:[current],outgoing:[]}:{}},onJoined:()=>{if(saveFails)throw Error('Storage blocked')}});
 f.ui.setLogin({authToken:'guest-account'});await tick();current={...invitation,status:'joined',room:{...admittedRoom,me:1},token:'guest-seat'};await f.ui.refresh();assert.equal(f.nodes['room-invites'].hidden,false);assert.equal(f.nodes['room-invites-message'].textContent,'Storage blocked');assert.equal(f.calls.some(([path])=>path==='/api/friend/invite/ack'),false);
 saveFails=false;ackFails=true;await f.ui.refresh();assert.equal(f.nodes['room-invites'].hidden,false);assert.equal(f.nodes['room-invites-message'].textContent,'ACK network error');assert.equal(f.nodes['room-invites-list'].children.length,0,'only actionable ACK error remains, not a stale joined card');
 ackFails=false;await f.ui.refresh();assert.equal(f.nodes['room-invites'].hidden,true);
});
test('CrazyGames adaptation preserves the same admission cleanup without changing invitation API or consent',async()=>{
 const fs=await import('node:fs'),{crazyGamesSource}=await import('../crazygames-build.js');
 const source=crazyGamesSource(fs.readFileSync(new URL('../public/room-invites.js',import.meta.url),'utf8'),'.js');
 const {createRoomInvitesUI:adapted}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 let status='pending';const f=setup({createUI:adapted,fetcher:()=>({incoming:[],outgoing:[{...invitation,status}]})});
 f.ui.setLogin({authToken:'portal-account'});f.ui.setRoom({...admittedRoom,phase:'waiting',players:[invitation.from,null]},'portal-seat');await tick();assert.equal(f.nodes['room-invites'].hidden,false);
 f.ui.setRoom(admittedRoom,'portal-seat');status='joined';await f.ui.refresh();assert.equal(f.nodes['room-invites'].hidden,true);
 assert.match(source,/expectedCost:50/);assert.match(source,/hero-auction-cg-session/);f.ui.destroy();
});
test('another-tab handled receipt arriving before ACK retains explicit recovery after credentials disappear',async()=>{
 let current=invitation,joins=0;const storage=new Map();
 const f=setup({storage,fetcher:path=>path==='/api/state'?{room:{...admittedRoom,me:1}}:path==='/api/friend/invitations'?{incoming:[current],outgoing:[]}:{},onJoined:()=>joins++});
 f.ui.setLogin({authToken:'account'});f.ui.setRoom({...admittedRoom,code:'456',me:1},'old-seat');await tick();
 storage.set('hero-room-invites-handled',JSON.stringify([invitation.id]));storage.set('hero-auction-session',JSON.stringify({code:'123',token:'shared-seat'}));
 current={...invitation,status:'joined',room:{...admittedRoom,me:1},token:'shared-seat'};await f.ui.refresh();assert.equal(joins,0);assert.equal(f.nodes['room-invites'].hidden,false);
 current={...invitation,status:'joined'};await f.ui.refresh();assert.equal(joins,0);const open=buttons(f).find(button=>button.textContent==='Güncel odayı aç');assert.ok(open,'another tab did not navigate this tab; explicit recovery remains reachable');
 open.onclick();await tick();assert.equal(joins,1);assert.equal(f.nodes['room-invites'].hidden,true);
});
