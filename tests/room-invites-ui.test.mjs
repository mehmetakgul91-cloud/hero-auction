import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoomInvitesUI} from '../public/room-invites.js';
class Element{
 constructor(){this.children=[];this.hidden=false;this.value='';this.textContent='';this.attrs={}}
 append(...values){this.children.push(...values)}replaceChildren(...values){this.children=values}setAttribute(k,v){this.attrs[k]=v}contains(el){return this===el||this.children.some(c=>c.contains?.(el))}
}
const invitation={id:'invite-1',from:{name:'Host',playerId:'HA-HOST'},to:{name:'Guest',playerId:'HA-GUEST'},code:'123',status:'pending'};
function setup({fetcher,onJoined=()=>{},onHosted=()=>{},canStart=()=>true,storage=new Map()}={}){
 const ids=['room-invites','room-invites-list','room-invites-summary','room-invites-message','room-invite-compose-message','room-invite-open','room-invite-compose','room-invite-friend','room-invite-send'];const nodes=Object.fromEntries(ids.map(id=>[id,new Element()]));nodes['room-invite-compose'].hidden=true;
 const calls=[],events={},timers=[];const win={fetch:async(path,options)=>{calls.push([path,JSON.parse(options.body),options]);return {ok:true,json:async()=>fetcher?fetcher(path,JSON.parse(options.body)):path==='/api/friend/invitations'?{incoming:[invitation],outgoing:[]}:{}}},setInterval:fn=>{timers.push(fn);return 1},clearInterval(){},addEventListener:(n,fn)=>events[n]=fn,removeEventListener:n=>delete events[n],localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}};
 const doc={getElementById:id=>nodes[id],createElement:()=>new Element(),activeElement:null};const ui=createRoomInvitesUI({document:doc,window:win,onJoined,onHosted,canStart});return {ui,nodes,calls,events,timers,storage};
}
const tick=()=>new Promise(r=>setImmediate(r));
function buttons(f){return f.nodes['room-invites-list'].children.flatMap(row=>row.children.filter(c=>typeof c.onclick==='function'))}
test('receiving a pending invitation never accepts automatically; explicit response includes cost and current room proof',async()=>{
 const f=setup();f.ui.setLogin({authToken:'account'});f.ui.setRoom({code:'456'},'seat-proof');await tick();assert.equal(f.calls.length,1);assert.equal(f.nodes['room-invites'].hidden,false);assert.equal(f.nodes['room-invites'].open,false);
 const accept=buttons(f).find(b=>b.textContent==='GELECEĞİM');accept.onclick();await tick();const body=f.calls.find(([p])=>p==='/api/friend/invite/respond')[1];assert.deepEqual(body,{inviteId:'invite-1',response:'accept',consent:true,expectedCost:50,sourceCode:'456',sourceToken:'seat-proof',authToken:'account'});
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
 assert.ok(buttons(f).some(b=>b.textContent==='GELECEĞİM'));
 assert.equal(f.nodes['room-invites-list'].children.length,11);
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
test('confirmed join hides terminal history and does not reappear during auction polls or rematches',async()=>{
 const f=setup({fetcher:()=>({incoming:[{...invitation,status:'joined'},{...invitation,id:'cancelled',status:'cancelled'}],outgoing:[]})});
 f.ui.setLogin({authToken:'account'});await tick();f.nodes['room-invites'].open=true;
 f.ui.setRoom(auctionRoom,'seat');assert.equal(f.nodes['room-invites'].hidden,true);assert.equal(f.nodes['room-invites'].open,false);
 await f.ui.refresh();assert.equal(f.nodes['room-invites'].hidden,true);
 f.ui.setRoom({...auctionRoom,phase:'finished',round:10},'seat');await f.ui.refresh();assert.equal(f.nodes['room-invites'].hidden,true);
 f.ui.setRoom(auctionRoom,'seat');await f.ui.refresh();assert.equal(f.nodes['room-invites'].hidden,true);
 f.ui.setRoom(null);assert.equal(f.nodes['room-invites-list'].children.length,2);assert.equal(f.nodes['room-invites'].hidden,false);
});
test('active invitations remain available as a collapsed summary, with no historical rows during play',async()=>{
 const f=setup({fetcher:()=>({incoming:[invitation,{...invitation,id:'old',status:'joined'}],outgoing:[]})});
 f.ui.setLogin({authToken:'account'});await tick();f.nodes['room-invites'].open=true;f.ui.setRoom(auctionRoom,'seat');
 assert.equal(f.nodes['room-invites'].hidden,false);assert.equal(f.nodes['room-invites'].open,false);assert.equal(f.nodes['room-invites-list'].children.length,1);
 assert.ok(buttons(f).some(b=>b.textContent==='GELECEĞİM'));await f.ui.refresh();assert.equal(f.nodes['room-invites'].open,false);
 f.nodes['room-invites'].open=true;f.ui.setRoom({...auctionRoom,round:1},'seat');assert.equal(f.nodes['room-invites'].open,true);
 f.ui.setRoom({...auctionRoom,phase:'finished',round:10},'seat');f.ui.setRoom(auctionRoom,'seat');assert.equal(f.nodes['room-invites'].open,false);
});
test('fresh failure and host cancellation remain inspectable without forcing the inbox open',async()=>{
 for(const status of ['failed','expired','cancelled']){
  let current=invitation;const f=setup({fetcher:()=>({incoming:[current],outgoing:[]})});
  f.ui.setLogin({authToken:'account'});f.ui.setRoom(auctionRoom,'seat');await tick();current={...invitation,status,reason:'Davet odası artık açık değil.'};await f.ui.refresh();
  assert.equal(f.nodes['room-invites'].hidden,false);assert.equal(f.nodes['room-invites'].open,false);assert.equal(f.nodes['room-invites-list'].children.length,1);
  assert.match(f.nodes['room-invites-summary'].textContent,/!/);await f.ui.refresh();assert.equal(f.nodes['room-invites-list'].children.length,1);
 }
});
test('a successful poll clears an earlier network error without clearing a genuine action error',async()=>{
 let failPoll=true,failAction=false;const f=setup({fetcher:p=>{if(p==='/api/friend/invitations'){if(failPoll)throw Error('Load failed');return {incoming:[invitation],outgoing:[]}}if(failAction)throw Error('Insufficient gold');return {}}});
 f.ui.setLogin({authToken:'account'});await tick();assert.equal(f.nodes['room-invites-message'].textContent,'Load failed');failPoll=false;await f.ui.refresh();assert.equal(f.nodes['room-invites-message'].textContent,'');
 failAction=true;buttons(f).find(b=>b.textContent==='GELECEĞİM').onclick();await tick();assert.equal(f.nodes['room-invites-message'].textContent,'Insufficient gold');await f.ui.refresh();assert.equal(f.nodes['room-invites-message'].textContent,'Insufficient gold');
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
 f.ui.setLogin({authToken:'account'});await tick();buttons(f).find(b=>b.textContent==='GELECEĞİM').onclick();await tick();
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
 buttons(f).find(b=>b.textContent==='GELECEĞİM').onclick();await tick();assert.equal(f.calls.some(([p])=>p==='/api/friend/invite/respond'),false);
 entering=false;const sending=f.ui.sendTo('HA-FRIEND');assert.equal(f.ui.busy,true);await sending;assert.equal(f.ui.busy,false);
 const {readFile}=await import('node:fs/promises');const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(app,/canStart:\(\)=>roomEntryPending===0/);assert.match(app,/if\(entry&&\(roomEntryPending\|\|roomInvitesUI\.busy\)\)throw Error/);
});
